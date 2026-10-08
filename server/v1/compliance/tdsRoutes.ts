/**
 * OrbitHR TDS Compliance Routes (P2.8)
 * Implements endpoints for:
 * - Quarterly Multi-Run Snapshot generation (Form 24Q for FY <= 2025-26; Form 138 for FY >= 2026-27)
 * - Component-level Challan allocation & ledger reconciliation
 * - Statutory Precondition Validation (PAN, TAN, Challan CIN, Sec 206AA)
 * - Maker/Checker Segregation of Duties (Maker cannot self-approve)
 * - Cryptographic SHA-256 seal & Lock
 * - Official Protean ASCII e-TDS Return Export (.txt)
 * - Internal Reconciliation Audit Report
 * - Post-filing ITD Token Number / PRN ingestion
 */

import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";
import { money, type ComplianceRequest } from "./types.js";
import {
  aggregateQuarterlyDeductees,
  calculateChallanLedger,
  generateAnnexureTwo,
  generateEtdsFile,
  validateChallanAllocationCaps,
  type ChallanDepositInput,
  type MonthlyPayrollLineInput,
  type DeducteeProfileInput,
} from "./tdsEngine.js";
import {
  StatutoryFilingFormatRegistry,
  type TdsQuarter,
  type DeductorHeaderInput,
  type ChallanRecordInput,
  type StatementType,
} from "./tdsFormatRegistry.js";

const uuidSchema = z.string().uuid();
const fyRegex = /^\d{4}-\d{2}$/;

export function createTdsComplianceRouter(prisma: PrismaClient, authenticate: RequestHandler): Router {
  const router = Router();

  const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ data, meta: { requestId: (res.req as ComplianceRequest).requestId } });

  const fail = (res: Response, status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, details } });

  const permit = (permission: string) => {
    return (req: ComplianceRequest, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return fail(res, 401, "UNAUTHORIZED", "Authentication required.");
      }
      if (
        req.auth.role === "COMPANY_ADMIN" ||
        req.auth.role === "SUPER_ADMIN" ||
        req.auth.permissions.includes(permission)
      ) {
        return next();
      }
      return fail(res, 403, "FORBIDDEN", `Missing required permission: ${permission}`);
    };
  };

  const audit = async (req: ComplianceRequest, action: string, details: string) => {
    if (!prisma.auditLog) return;
    try {
      await prisma.auditLog.create({
        data: {
          companyId: req.auth!.companyId,
          userId: req.auth!.id,
          userName: req.auth!.role,
          userRole: req.auth!.role,
          action,
          category: "COMPLIANCE_TDS",
          details,
          ipAddress: req.ip || "127.0.0.1",
        },
      });
    } catch {
      // Non-blocking audit log
    }
  };

  router.use("/compliance/tds", authenticate);

  // -------------------------------------------------------------------------
  // 1. EXTRACT QUARTERLY TDS SNAPSHOT (Multi-Run consolidation)
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/snapshot",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = z
          .object({
            financialYear: z.string().regex(fyRegex, "financialYear must be YYYY-YY (e.g. 2025-26)"),
            quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
            quarterlyPayrollRunIds: z.array(uuidSchema).min(1).max(3),
            filingType: z.enum(["ORIGINAL", "REVISED"]).default("ORIGINAL"),
            supersededFilingId: uuidSchema.optional(),
            tokenNumberPrn: z.string().trim().max(30).optional(),
            autoAllocateChallanFifo: z.boolean().default(true),
          })
          .parse(req.body);

        const startYear = parseInt(body.financialYear.split("-")[0], 10);
        const formCode = startYear >= 2026 ? "138" : "24Q";

        // Check for duplicate original filing
        if (body.filingType === "ORIGINAL") {
          const existing = await prisma.statutoryFiling.findFirst({
            where: {
              companyId,
              domain: "TDS_24Q",
              periodYear: startYear,
              quarter: body.quarter,
              filingType: "ORIGINAL",
              status: { notIn: ["CANCELLED", "SUPERSEDED"] },
            },
          });
          if (existing) {
            return fail(
              res,
              409,
              "FILING_ALREADY_EXISTS",
              `An active ${formCode} filing already exists for ${body.financialYear} ${body.quarter} with status: ${existing.status}`
            );
          }
        }

        // Verify that all constituent payroll runs exist and are locked
        const runs = await prisma.payrollRun.findMany({
          where: { id: { in: body.quarterlyPayrollRunIds }, companyId },
        });

        if (runs.length !== body.quarterlyPayrollRunIds.length) {
          return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "One or more target payroll runs were not found.");
        }

        const allowedRunStatuses = [
          "LOCKED",
          "PAYSLIP_GENERATED",
          "PAYSLIPS_PUBLISHED",
          "BANK_EXPORTED",
          "PROCESSED",
          "PAID",
        ];

        for (const run of runs) {
          if (!allowedRunStatuses.includes(run.status)) {
            return fail(
              res,
              409,
              "PAYROLL_NOT_LOCKED",
              `Payroll run for ${run.month} is in status ${run.status}. Statutory snapshots require LOCKED or PAID payroll runs.`
            );
          }
        }

        // Sort runs chronologically; the latest run represents the quarter-closing run
        runs.sort((a, b) => (a.periodEnd ? new Date(a.periodEnd).getTime() : 0) - (b.periodEnd ? new Date(b.periodEnd).getTime() : 0));
        const quarterClosingRun = runs[runs.length - 1];

        // Fetch payroll lines across all constituent runs
        const lines = await prisma.payrollLine.findMany({
          where: { payrollRunId: { in: runs.map((r) => r.id) } },
        });

        if (lines.length === 0) {
          return fail(res, 409, "PAYROLL_LINES_EMPTY", "Selected payroll runs contain no calculated lines.");
        }

        // Fetch employee master + active statutory profiles
        const employeeIds = Array.from(new Set(lines.map((l) => l.employeeId)));
        const [employees, activeProfiles, companySettings, challans] = await Promise.all([
          prisma.employee.findMany({
            where: { id: { in: employeeIds }, companyId },
          }),
          prisma.employeeStatutoryProfile.findMany({
            where: { employeeId: { in: employeeIds }, companyId, active: true },
          }),
          prisma.companySettings.findUnique({ where: { companyId } }),
          prisma.tdsChallan.findMany({
            where: { companyId, financialYear: body.financialYear, quarter: body.quarter },
            orderBy: { challanDate: "asc" },
          }),
        ]);

        const profileMap = new Map(activeProfiles.map((p) => [p.employeeId, p]));
        const employeeMap = new Map<string, DeducteeProfileInput>(
          employees.map((e) => {
            const prof = profileMap.get(e.id);
            return [
              e.id,
              {
                employeeId: e.id,
                employeeCode: e.employeeCode,
                firstName: e.firstName,
                lastName: e.lastName,
                panNumber: prof?.panNumber || e.taxIdentifier || null,
                panAppliedProof: false,
                dateOfBirth: e.dateOfBirth,
                gender: e.gender,
                dateOfJoining: e.dateOfJoining,
                lastWorkingDay: e.lastWorkingDay,
              },
            ];
          })
        );

        const monthlyLinesInput: MonthlyPayrollLineInput[] = lines.map((l) => {
          const runObj = runs.find((r) => r.id === l.payrollRunId)!;
          const b = (l.breakdown as Record<string, unknown>) || {};
          const tdsVal = typeof b.TDS === "number" && Number.isFinite(b.TDS) ? money(b.TDS) : 0;
          return {
            employeeId: l.employeeId,
            payrollRunMonth: runObj.month,
            payrollPeriodEnd: runObj.periodEnd ? runObj.periodEnd.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            grossEarnings: money(l.grossEarnings),
            tdsDeducted: tdsVal,
            breakdown: b,
          };
        });

        const challanInputs: ChallanDepositInput[] = challans.map((c) => ({
          id: c.id,
          bsrCode: c.bsrCode,
          challanDate: c.challanDate.toISOString().split("T")[0],
          challanSerialNo: c.challanSerialNo,
          minorHead: c.minorHead,
          tdsAmount: money(c.tdsAmount),
          surcharge: money(c.surcharge || 0),
          cess: money(c.cess || 0),
          interest: money(c.interest || 0),
          fee: money(c.fee || 0),
          totalAmount: money(c.totalAmount),
          chequeOrDdNo: c.chequeOrDdNo,
        }));

        // Execute quarterly aggregation
        const { deductees, ledger, validationWarnings } = aggregateQuarterlyDeductees({
          financialYear: body.financialYear,
          quarter: body.quarter,
          monthlyLines: monthlyLinesInput,
          employeeProfiles: employeeMap,
          challans: challanInputs,
          autoAllocateChallanFifo: body.autoAllocateChallanFifo,
        });

        // Resolve format version from registry (Anti-guessing: throws if unregistered)
        const statementType: StatementType = body.filingType === "REVISED" ? "CORRECTION" : "REGULAR";
        const formatSpec = StatutoryFilingFormatRegistry.resolve(
          body.financialYear,
          body.quarter,
          statementType
        );

        // Map challanSerialNo back to Challan IDs
        const challanSerialToId = new Map(challans.map((c) => [c.challanSerialNo, c.id]));

        // Transactional creation of StatutoryFiling and Items
        const createdFiling = await prisma.$transaction(async (tx) => {
          const filing = await tx.statutoryFiling.create({
            data: {
              companyId,
              domain: "TDS_24Q",
              filingType: body.filingType,
              periodYear: startYear,
              quarter: body.quarter,
              payrollRunId: quarterClosingRun.id,
              statutoryFormCode: formCode,
              formatVersion: formatSpec.formatVersion,
              tokenNumberPrn: body.tokenNumberPrn || null,
              supersededFilingId: body.supersededFilingId || null,
              status: "DRAFT",
              totalEmployees: employeeIds.length,
              totalGrossWages: money(deductees.reduce((acc, d) => acc + d.grossPayment, 0)),
              totalTaxDeducted: ledger.totalDeducteeTdsReported,
              createdById: req.auth!.id,
            },
          });

          for (const d of deductees) {
            const chId = challanSerialToId.get(d.challanSerialNo) || null;
            const createdItem = await tx.statutoryFilingItem.create({
              data: {
                filingId: filing.id,
                employeeId: lines.find((l) => l.employeeId === employeeMap.get(l.employeeId)?.employeeId)?.employeeId || employeeIds[0],
                snapshotEmployeeCode: d.employeeCode,
                snapshotEmployeeName: d.employeeName,
                snapshotPan: d.pan,
                panStatus: d.panStatus,
                deducteeReasonCode: d.reasonCode || null,
                tdsChallanId: chId,
                grossWages: d.grossPayment,
                tdsAmount: d.totalTdsDeducted,
                calculationDetails: {
                  challanSerialNo: d.challanSerialNo,
                  paymentDate: d.paymentDate,
                  rateOfTds: d.rateOfTds,
                  panStatus: d.panStatus,
                },
              },
            });

            if (chId) {
              await tx.tdsChallanAllocation.create({
                data: {
                  companyId,
                  statutoryFilingId: filing.id,
                  tdsChallanId: chId,
                  statutoryFilingItemId: createdItem.id,
                  allocatedTds: d.totalTdsDeducted,
                  allocatedSurcharge: 0,
                  allocatedCess: 0,
                  allocatedTotal: d.totalTdsDeducted,
                  createdById: req.auth!.id,
                },
              });
            }
          }

          return filing;
        });

        await audit(
          req,
          "CREATE_TDS_SNAPSHOT",
          `Extracted ${formCode} snapshot for ${body.financialYear} ${body.quarter} from ${runs.length} runs. Ledger status: ${ledger.reconciliationStatus}`
        );

        return ok(
          res,
          {
            filing: createdFiling,
            formCode,
            formatVersion: formatSpec.formatVersion,
            ledger,
            validationWarnings,
          },
          201
        );
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 2. VALIDATE TDS FILING (Statutory business rules & ledger checks)
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/validate",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: true, challans: true },
        });

        if (!filing) {
          return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing not found.");
        }

        if (["LOCKED", "EXPORTED"].includes(filing.status)) {
          return fail(res, 409, "FILING_IS_LOCKED", "Locked filings cannot be re-validated.");
        }

        const settings = await prisma.companySettings.findUnique({ where: { companyId } });
        const diagnostics: string[] = [];

        // 1. TAN & Deductor validations
        if (!settings?.tanNumber || !/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(settings.tanNumber)) {
          diagnostics.push(`Invalid Deductor TAN in CompanySettings: "${settings?.tanNumber || ""}"`);
        }
        if (!settings?.panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(settings.panNumber)) {
          diagnostics.push(`Invalid Deductor PAN in CompanySettings: "${settings?.panNumber || ""}"`);
        }

        // 2. Challan & Ledger validations
        const challanInputs: ChallanDepositInput[] = filing.challans.map((c) => ({
          id: c.id,
          bsrCode: c.bsrCode,
          challanDate: c.challanDate.toISOString().split("T")[0],
          challanSerialNo: c.challanSerialNo,
          minorHead: c.minorHead,
          tdsAmount: money(c.tdsAmount),
          surcharge: money(c.surcharge || 0),
          cess: money(c.cess || 0),
          interest: money(c.interest || 0),
          fee: money(c.fee || 0),
          totalAmount: money(c.totalAmount),
        }));

        const deducteeAllocations = filing.items.map((item) => {
          const ch = filing.challans.find((c) => c.id === item.tdsChallanId);
          return {
            challanSerialNo: ch?.challanSerialNo || "UNASSIGNED",
            tdsAmount: money(item.tdsAmount),
          };
        });

        const ledger = calculateChallanLedger(challanInputs, deducteeAllocations);
        if (ledger.blockingErrors.length > 0) {
          diagnostics.push(...ledger.blockingErrors);
        }

        // 3. Precondition check via statutory format registry
        const fy = `${filing.periodYear}-${String(filing.periodYear + 1).slice(-2)}`;
        const filingStatementType: StatementType = filing.filingType === "REVISED" ? "CORRECTION" : "REGULAR";
        const spec = StatutoryFilingFormatRegistry.resolve(
          fy,
          filing.quarter as TdsQuarter,
          filingStatementType
        );

        if (diagnostics.length > 0) {
          return fail(res, 422, "TDS_VALIDATION_FAILED", "TDS statutory validation failed.", {
            diagnostics,
            ledger,
          });
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: { status: "VALIDATED", validatedAt: new Date() },
        });

        await audit(req, "VALIDATE_TDS_FILING", `Validated ${filing.statutoryFormCode} filing ${filing.id}`);
        return ok(res, { filing: updated, ledger, formatSpec: spec.formatVersion });
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 3. SUBMIT FOR APPROVAL (Maker Action)
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/submit-for-approval",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing not found.");
        if (filing.status !== "VALIDATED") {
          return fail(
            res,
            409,
            "INVALID_STATUS",
            `Filing must be VALIDATED before submitting for approval. Current status: ${filing.status}`
          );
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: { status: "PENDING_APPROVAL" },
        });

        await audit(req, "SUBMIT_TDS_FOR_APPROVAL", `Submitted filing ${filing.id} for Checker review`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 4. APPROVE FILING (Checker Action - Enforcing Maker-Checker SoD)
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/approve",
    permit("compliance.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing not found.");
        if (filing.status !== "PENDING_APPROVAL") {
          return fail(
            res,
            409,
            "INVALID_STATUS",
            `Filing must be PENDING_APPROVAL. Current status: ${filing.status}`
          );
        }

        // Segregation of Duties Invariant: Maker cannot approve
        if (filing.createdById === req.auth!.id) {
          return fail(
            res,
            403,
            "MAKER_CANNOT_APPROVE",
            "Segregation of Duties Violation: Maker who created this filing cannot approve it."
          );
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "APPROVED",
            approvedById: req.auth!.id,
            approvedAt: new Date(),
          },
        });

        await audit(req, "APPROVE_TDS_FILING", `Approved filing ${filing.id} by Checker ${req.auth!.id}`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 5. LOCK FILING & GENERATE CRYPTOGRAPHIC SHA-256 SEAL
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/lock",
    permit("compliance.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: true, challans: true },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing not found.");
        if (filing.status !== "APPROVED") {
          return fail(
            res,
            409,
            "INVALID_STATUS",
            `Filing must be APPROVED before locking. Current status: ${filing.status}`
          );
        }

        // Canonical cryptographic hash of frozen filing contents
        const canonicalData = {
          id: filing.id,
          companyId: filing.companyId,
          domain: filing.domain,
          formCode: filing.statutoryFormCode,
          periodYear: filing.periodYear,
          quarter: filing.quarter,
          totalEmployees: filing.totalEmployees,
          totalGrossWages: filing.totalGrossWages,
          totalTaxDeducted: filing.totalTaxDeducted,
          items: filing.items.map((it) => ({
            pan: it.snapshotPan,
            wages: it.grossWages,
            tds: it.tdsAmount,
            challanId: it.tdsChallanId,
          })),
          challans: filing.challans.map((c) => ({
            bsr: c.bsrCode,
            serial: c.challanSerialNo,
            total: c.totalAmount,
          })),
        };

        const hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(canonicalData))
          .digest("hex");

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "LOCKED",
            lockedAt: new Date(),
            sha256Checksum: hash,
          },
        });

        await audit(req, "LOCK_TDS_FILING", `Locked filing ${filing.id} (SHA-256: ${hash})`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // -------------------------------------------------------------------------
  // 6. EXPORT OFFICIAL PROTEAN ASCII e-TDS RETURN FILE (.txt)
  // -------------------------------------------------------------------------
  const exportTdsHandler = async (req: ComplianceRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.auth!.companyId;
      const filing = await prisma.statutoryFiling.findFirst({
        where: { id: String(req.params.id), companyId },
        include: { items: true, challans: true },
      });

      if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing not found.");

      for (const it of filing.items) {
        if (it.panStatus === "NOT_APPLICABLE" || it.panStatus === "UNKNOWN" || !it.panStatus) {
          return fail(
            res,
            422,
            "DEDUCTEE_PAN_UNVERIFIED",
            `Deductee ${it.snapshotEmployeeCode} (${it.snapshotEmployeeName}) has unverified PAN status "${it.panStatus || "UNKNOWN"}". PAN must be verified before exporting statutory TDS returns.`
          );
        }
      }

      if (!["LOCKED", "EXPORTED"].includes(filing.status)) {
        return fail(
          res,
          409,
          "FILING_NOT_LOCKED",
          `e-TDS Return files can only be exported from a LOCKED filing. Current status: ${filing.status}`
        );
      }

      const settings = await prisma.companySettings.findUnique({ where: { companyId } });
      const company = await prisma.company.findUnique({ where: { id: companyId } });

      const fy = `${filing.periodYear}-${String(filing.periodYear + 1).slice(-2)}`;
      const ay = `${filing.periodYear + 1}-${String(filing.periodYear + 2).slice(-2)}`;

      const deductorHeader: DeductorHeaderInput = {
        tan: settings?.tanNumber || "TANNOTSET1",
        pan: settings?.panNumber || "PANNOTSET1",
        financialYear: fy,
        assessmentYear: ay,
        quarter: filing.quarter as TdsQuarter,
        legalEntityName: settings?.legalEntityName || company?.name || "Company",
        registeredAddress: settings?.registeredAddress || "Address",
        city: settings?.city || "City",
        state: settings?.state || "State",
        postalCode: settings?.postalCode || "000000",
        officialEmail: settings?.officialEmail || "compliance@company.com",
        officialPhone: settings?.officialPhone || "0000000000",
        responsiblePersonName: settings?.responsiblePersonName || "Compliance Officer",
        responsiblePersonDesignation: settings?.responsiblePersonDesignation || "Director",
        responsiblePersonPan: settings?.responsiblePersonPan || settings?.panNumber || "PANNOTSET1",
        responsiblePersonMobile: settings?.responsiblePersonMobile || "9999999999",
        responsiblePersonEmail: settings?.responsiblePersonEmail || settings?.officialEmail || "officer@company.com",
        tokenNumberPrn: filing.tokenNumberPrn,
      };

      const challanInputs: ChallanRecordInput[] = filing.challans.map((c, idx) => ({
        challanIndex: idx + 1,
        bsrCode: c.bsrCode,
        challanDate: c.challanDate.toISOString().split("T")[0],
        challanSerialNo: c.challanSerialNo,
        minorHead: c.minorHead,
        tdsAmount: money(c.tdsAmount),
        surcharge: money(c.surcharge || 0),
        cess: money(c.cess || 0),
        interest: money(c.interest || 0),
        fee: money(c.fee || 0),
        totalAmount: money(c.totalAmount),
        chequeOrDdNo: c.chequeOrDdNo,
        allocatedDeducteeCount: filing.items.filter((it) => it.tdsChallanId === c.id).length,
      }));

        const deducteeInputs = filing.items.map((it, idx) => {
          const matchedChallan = filing.challans.find((c) => c.id === it.tdsChallanId);
          const details = (it.calculationDetails as Record<string, unknown>) || {};
          return {
            deducteeIndex: idx + 1,
            challanSerialNo: matchedChallan?.challanSerialNo || "00001",
            employeeCode: it.snapshotEmployeeCode,
            employeeName: it.snapshotEmployeeName,
            pan: it.snapshotPan || "PANNOTAVBL",
            panStatus: it.panStatus as any,
            paymentDate: (details.paymentDate as string) || new Date().toISOString().split("T")[0],
            grossPayment: money(it.grossWages),
            tdsDeducted: money(it.tdsAmount),
            surcharge: 0,
            cess: 0,
            totalTdsDeducted: money(it.tdsAmount),
            totalTdsDeposited: money(it.tdsAmount),
            deductionDate: (details.paymentDate as string) || new Date().toISOString().split("T")[0],
            rateOfTds: typeof details.rateOfTds === "number" ? details.rateOfTds : 10,
            reasonCode: it.deducteeReasonCode,
          };
        });

        const etdsResult = generateEtdsFile({
          deductor: deductorHeader,
          challans: challanInputs,
          deductees: deducteeInputs,
        });

        if (etdsResult.preconditionErrors.length > 0) {
          return fail(res, 422, "EXPORT_PRECONDITION_FAILED", "Filing failed specification preconditions", {
            errors: etdsResult.preconditionErrors,
          });
        }

        await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: { status: "EXPORTED" },
        });

        const fileName = `TDS_${etdsResult.formCode}_${filing.quarter}_${fy}.txt`;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        await audit(req, "EXPORT_TDS_FILE", `Exported e-TDS file ${fileName} for filing ${filing.id}`);
        return res.send(etdsResult.asciiText);
      } catch (err) {
        next(err);
      }
    };

  router.get("/compliance/tds/filings/:id/export/raw-txt", permit("compliance.manage"), exportTdsHandler);
  router.get("/compliance/tds/filings/:id/export", permit("compliance.manage"), exportTdsHandler);
  router.post("/compliance/tds/filings/:id/export", permit("compliance.manage"), exportTdsHandler);

  // -------------------------------------------------------------------------
  // 7. RECORD GOVERNMENT PROVISIONAL RECEIPT NUMBER (PRN / Token Number)
  // -------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/record-token",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = z
          .object({
            tokenNumberPrn: z.string().trim().min(5).max(30),
            receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .parse(req.body);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing not found.");

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            tokenNumberPrn: body.tokenNumberPrn,
            filingReceiptDate: new Date(body.receiptDate),
          },
        });

        await audit(
          req,
          "RECORD_TDS_PRN",
          `Recorded ITD Receipt Token ${body.tokenNumberPrn} for filing ${filing.id}`
        );
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 9. GET /compliance/tds/filings/:id/allocations - List allocations for a filing
  // ---------------------------------------------------------------------------
  router.get(
    "/compliance/tds/filings/:id/allocations",
    authenticate,
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: filingId, companyId },
        });
        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing not found");

        const allocations = await prisma.tdsChallanAllocation.findMany({
          where: { statutoryFilingId: filingId, companyId },
          include: {
            challan: true,
            filingItem: true,
          },
        });
        return ok(res, allocations);
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 10. POST /compliance/tds/filings/:id/allocations - Create or update an allocation
  // ---------------------------------------------------------------------------
  router.post(
    "/compliance/tds/filings/:id/allocations",
    authenticate,
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: filingId, companyId },
        });
        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing not found");

        if (filing.status === "LOCKED" || filing.status === "EXPORTED") {
          return fail(res, 409, "FILING_LOCKED", "Cannot mutate allocations for a locked or exported filing");
        }

        const allocationSchema = z.object({
          statutoryFilingItemId: z.string(),
          tdsChallanId: z.string(),
          allocatedTds: z.number().min(0),
          allocatedSurcharge: z.number().min(0).default(0),
          allocatedCess: z.number().min(0).default(0),
          allocatedTotal: z.number().min(0).optional(),
        });

        const parsed = allocationSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid allocation parameters", parsed.error.format());
        }

        const { statutoryFilingItemId, tdsChallanId, allocatedTds, allocatedSurcharge, allocatedCess } = parsed.data;

        // Decimal precision verification (Option B: exactly 2 decimals)
        const isExactCents = (v: number) => Number(v.toFixed(2)) === v;
        if (!isExactCents(allocatedTds) || !isExactCents(allocatedSurcharge) || !isExactCents(allocatedCess)) {
          return fail(res, 422, "INVALID_PRECISION", "Allocations must have at most 2 decimal places");
        }

        const calculatedTotal = money(allocatedTds + allocatedSurcharge + allocatedCess);
        const providedTotal = parsed.data.allocatedTotal !== undefined ? parsed.data.allocatedTotal : calculatedTotal;
        if (providedTotal !== calculatedTotal) {
          return fail(res, 422, "SUM_MISMATCH", `allocatedTotal (₹${providedTotal}) does not equal sum of components (₹${calculatedTotal})`);
        }

        // Verify filingItem belongs to this filing (and this company)
        const item = await prisma.statutoryFilingItem.findUnique({
          where: { id: statutoryFilingItemId },
        });
        if (!item || item.filingId !== filingId) {
          return fail(res, 422, "FILING_MISMATCH", "Allocation statutoryFilingId must match item filingId");
        }

        // Verify challan belongs to this company
        const challan = await prisma.tdsChallan.findFirst({
          where: { id: tdsChallanId, companyId },
        });
        if (!challan) {
          return fail(res, 403, "TENANT_MISMATCH", "Target challan does not belong to the filing company");
        }

        // Validate challan capacity cap transactionally
        const result = await prisma.$transaction(async (tx) => {
          const otherAllocations = await tx.tdsChallanAllocation.findMany({
            where: {
              tdsChallanId,
              NOT: { statutoryFilingItemId },
            },
          });

          const allProposed = [
            ...otherAllocations,
            {
              tdsChallanId,
              allocatedTds,
              allocatedSurcharge,
              allocatedCess,
              allocatedTotal: calculatedTotal,
            },
          ];

          const capValidation = validateChallanAllocationCaps(allProposed, challan);
          if (!capValidation.valid) {
            throw new Error(`CHALLAN_OVERALLOCATED: ${capValidation.errors.join("; ")}`);
          }

          return await tx.tdsChallanAllocation.upsert({
            where: {
              statutoryFilingItemId_tdsChallanId: {
                statutoryFilingItemId,
                tdsChallanId,
              },
            },
            update: {
              allocatedTds,
              allocatedSurcharge,
              allocatedCess,
              allocatedTotal: calculatedTotal,
            },
            create: {
              companyId,
              statutoryFilingId: filingId,
              tdsChallanId,
              statutoryFilingItemId,
              allocatedTds,
              allocatedSurcharge,
              allocatedCess,
              allocatedTotal: calculatedTotal,
              createdById: req.auth!.id,
            },
          });
        });

        await audit(
          req,
          "UPDATE_TDS_ALLOCATION",
          `Allocated ₹${calculatedTotal} from Challan ${challan.challanSerialNo} to Deductee Item ${item.snapshotEmployeeCode}`
        );

        return ok(res, result, 201);
      } catch (err: any) {
        if (err.message?.startsWith("CHALLAN_OVERALLOCATED")) {
          return fail(res, 422, "CHALLAN_OVERALLOCATED", err.message);
        }
        next(err);
      }
    }
  );

  return router;
}
