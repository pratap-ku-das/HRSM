import crypto from "crypto";
import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type ComplianceRequest,
  money,
  PAN_REGEX,
  EmployeeStatutoryProfileSchema,
  TdsChallanSchema,
  CreateSnapshotFilingSchema,
  CreateEpfChallanSchema,
  UpdateEpfChallanSchema,
  TRRN_REGEX,
  CreateEsicChallanSchema,
  UpdateEsicChallanSchema,
  CPRN_REGEX,
} from "./types.js";
import {
  extractStatutorySnapshot,
  generateCanonicalChecksum,
  validateSnapshotItems,
  type SnapshotEmployeeInfo,
  type SnapshotPayrollLineInfo,
} from "./snapshotEngine.js";
import {
  runEpfDiagnostics,
  generateEcrFlatText,
  calculateEpfChallanTotals,
  calculateAge58EpsSplit,
  type EpfSnapshotItemInput,
  type EpfRuleConfiguration,
} from "./epfEngine.js";
import {
  runEsicDiagnostics,
  generateEsicBulkUpload,
  calculateEsicChallanTotals,
} from "./esicEngine.js";
import { createTdsComplianceRouter } from "./tdsRoutes.js";
import { createPtComplianceRouter } from "./ptRoutes.js";

export function createComplianceRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();

  const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ data, meta: { requestId: (res.req as ComplianceRequest).requestId } });

  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });

  const permit = (permission: string): RequestHandler => (req: ComplianceRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return fail(res, 401, "UNAUTHORIZED", "Authentication required.");
    }
    if (req.auth.permissions?.includes(permission) || req.auth.role === "SUPER_ADMIN" || req.auth.role === "COMPANY_ADMIN") {
      return next();
    }
    return fail(res, 403, "FORBIDDEN", `Missing required permission: ${permission}`);
  };

  const audit = async (req: ComplianceRequest, action: string, details: string) => {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: req.auth!.companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action,
          category: "COMPLIANCE",
          details,
          ipAddress: req.ip || "unknown",
        },
      });
    } catch {
      // audit failure must not block the core transaction
    }
  };

  router.use(authenticate);

  // -------------------------------------------------------------------------
  // 1. EMPLOYEE STATUTORY PROFILE
  // -------------------------------------------------------------------------

  router.post(
    "/compliance/profiles/:employeeId",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const employeeId = String(req.params.employeeId);
        const parsed = EmployeeStatutoryProfileSchema.parse(req.body);

        const employee = await prisma.employee.findFirst({
          where: { id: employeeId, companyId },
        });

        if (!employee) {
          return fail(res, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found in this company.");
        }

        const effectiveFromDate = parsed.effectiveFrom ? new Date(parsed.effectiveFrom) : new Date();

        const result = await prisma.$transaction(async (tx) => {
          // Deactivate previous active profiles and close effective range
          const existingActive = await tx.employeeStatutoryProfile.findMany({
            where: { employeeId, companyId, active: true },
          });

          for (const prev of existingActive) {
            const closeDate = new Date(effectiveFromDate.getTime() - 86_400_000);
            await tx.employeeStatutoryProfile.update({
              where: { id: prev.id },
              data: {
                active: false,
                effectiveTo: closeDate >= prev.effectiveFrom ? closeDate : prev.effectiveFrom,
              },
            });
          }

          // Create new active profile
          const created = await tx.employeeStatutoryProfile.create({
            data: {
              companyId,
              employeeId,
              uan: parsed.uan || null,
              pfMemberId: parsed.pfMemberId || null,
              esicIpNumber: parsed.esicIpNumber || null,
              panNumber: parsed.panNumber || null,
              epsExempt: parsed.epsExempt ?? false,
              pfOptOut: parsed.pfOptOut ?? false,
              ptState: parsed.ptState || null,
              effectiveFrom: effectiveFromDate,
              active: true,
            },
          });

          // Bidirectional PAN synchronization to Employee.taxIdentifier
          if (parsed.panNumber !== undefined) {
            await tx.employee.update({
              where: { id: employeeId },
              data: { taxIdentifier: parsed.panNumber || null },
            });
          }

          return created;
        });

        await audit(req, "CREATE_STATUTORY_PROFILE", `Updated statutory profile for employee ${employee.employeeCode}`);
        return ok(res, result, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/profiles/:employeeId",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const employeeId = String(req.params.employeeId);

        const profile = await prisma.employeeStatutoryProfile.findFirst({
          where: { employeeId, companyId, active: true },
        });

        return ok(res, profile || null);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/profiles/:employeeId/history",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const employeeId = String(req.params.employeeId);

        const history = await prisma.employeeStatutoryProfile.findMany({
          where: { employeeId, companyId },
          orderBy: { effectiveFrom: "desc" },
        });

        return ok(res, history);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. TDS CHALLAN MANAGEMENT
  // -------------------------------------------------------------------------

  router.post(
    "/compliance/challans",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = TdsChallanSchema.parse(req.body);

        const totalAmount = money(body.tdsAmount + (body.surcharge || 0) + (body.cess || 0) + (body.interest || 0) + (body.fee || 0));

        const challan = await prisma.tdsChallan.create({
          data: {
            companyId,
            financialYear: body.financialYear,
            quarter: body.quarter,
            bsrCode: body.bsrCode,
            challanDate: new Date(body.challanDate),
            challanSerialNo: body.challanSerialNo,
            minorHead: body.minorHead,
            tdsAmount: money(body.tdsAmount),
            surcharge: money(body.surcharge || 0),
            cess: money(body.cess || 0),
            interest: money(body.interest || 0),
            fee: money(body.fee || 0),
            totalAmount,
            chequeOrDdNo: body.chequeOrDdNo || null,
            statutoryFilingId: body.statutoryFilingId || null,
          },
        });

        await audit(req, "CREATE_TDS_CHALLAN", `Created TDS challan BSR ${body.bsrCode} serial ${body.challanSerialNo} for ${body.financialYear} ${body.quarter}`);
        return ok(res, challan, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/challans",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const { financialYear, quarter } = req.query;

        const where: Record<string, unknown> = { companyId };
        if (typeof financialYear === "string") where.financialYear = financialYear;
        if (typeof quarter === "string") where.quarter = quarter;

        const challans = await prisma.tdsChallan.findMany({
          where,
          orderBy: { challanDate: "desc" },
        });

        return ok(res, challans);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 3. STATUTORY FILING SNAPSHOT & LIFECYCLE
  // -------------------------------------------------------------------------

  router.post(
    "/compliance/filings/snapshot",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = CreateSnapshotFilingSchema.parse(req.body);

        const run = await prisma.payrollRun.findFirst({
          where: { id: body.payrollRunId, companyId },
        });

        if (!run) {
          return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Target payroll run not found.");
        }

        const allowedRunStatuses = ["LOCKED", "PAYSLIP_GENERATED", "PAYSLIPS_PUBLISHED", "BANK_EXPORTED", "PROCESSED", "PAID"];
        if (!allowedRunStatuses.includes(run.status)) {
          return fail(
            res,
            409,
            "PAYROLL_NOT_LOCKED",
            `Statutory snapshot can only be extracted from a LOCKED or PAID payroll run. Current run status: ${run.status}`,
          );
        }

        // Fetch payroll lines
        const lines = await prisma.payrollLine.findMany({
          where: { payrollRunId: run.id },
        });

        if (lines.length === 0) {
          return fail(res, 409, "PAYROLL_LINES_EMPTY", "Payroll run has no calculated lines.");
        }

        // Fetch employee master + active statutory profiles
        const employeeIds = lines.map((l) => l.employeeId);
        const employees = await prisma.employee.findMany({
          where: { id: { in: employeeIds }, companyId },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            taxIdentifier: true,
            lastWorkingDay: true,
          },
        });

        const activeProfiles = await prisma.employeeStatutoryProfile.findMany({
          where: { employeeId: { in: employeeIds }, companyId, active: true },
        });

        const profileMap = new Map(activeProfiles.map((p) => [p.employeeId, p]));
        const employeeMap = new Map<string, SnapshotEmployeeInfo>(
          employees.map((e) => [
            e.id,
            {
              id: e.id,
              employeeCode: e.employeeCode,
              firstName: e.firstName,
              lastName: e.lastName,
              taxIdentifier: e.taxIdentifier,
              activeProfile: profileMap.get(e.id) || null,
              lastWorkingDay: e.lastWorkingDay,
            },
          ]),
        );

        const lineInfos: SnapshotPayrollLineInfo[] = lines.map((l) => ({
          employeeId: l.employeeId,
          workingDays: l.workingDays,
          payableDays: l.payableDays,
          unpaidDays: l.unpaidDays,
          grossEarnings: l.grossEarnings,
          employeeDeductions: l.employeeDeductions,
          employerContributions: l.employerContributions,
          reimbursements: l.reimbursements,
          netPay: l.netPay,
          breakdown: (l.breakdown as Record<string, unknown>) || {},
        }));

        const { items, totals } = extractStatutorySnapshot(run.status, lineInfos, employeeMap);

        const createdFiling = await prisma.$transaction(async (tx) => {
          const filing = await tx.statutoryFiling.create({
            data: {
              companyId,
              domain: body.domain,
              filingType: body.filingType,
              periodYear: body.periodYear,
              periodMonth: body.periodMonth || null,
              quarter: body.quarter || null,
              stateCode: body.stateCode || null,
              payrollRunId: run.id,
              status: "DRAFT",
              totalEmployees: totals.totalEmployees,
              totalGrossWages: totals.totalGrossWages,
              totalEpfWages: totals.totalEpfWages,
              totalEeShare: totals.totalEeShare,
              totalErShare: totals.totalErShare,
              totalTaxDeducted: totals.totalTaxDeducted,
              createdById: req.auth!.id,
            },
          });

          for (const item of items) {
            await tx.statutoryFilingItem.create({
              data: {
                filingId: filing.id,
                employeeId: item.employeeId,
                snapshotEmployeeCode: item.snapshotEmployeeCode,
                snapshotEmployeeName: item.snapshotEmployeeName,
                snapshotUan: item.snapshotUan,
                snapshotPan: item.snapshotPan,
                snapshotEsicIp: item.snapshotEsicIp,
                snapshotLastWorkingDay: item.snapshotLastWorkingDay || null,
                workingDays: item.workingDays,
                payableDays: item.payableDays,
                ncpDays: item.ncpDays,
                grossWages: item.grossWages,
                epfWages: item.epfWages,
                epsWages: item.epsWages,
                edliWages: item.edliWages,
                eePfShare: item.eePfShare,
                erEpsShare: item.erEpsShare,
                erEpfShare: item.erEpfShare,
                eeEsiShare: item.eeEsiShare,
                erEsiShare: item.erEsiShare,
                ptAmount: item.ptAmount,
                tdsAmount: item.tdsAmount,
                calculationDetails: item.calculationDetails as Prisma.InputJsonValue,
              },
            });
          }

          return filing;
        });

        await audit(req, "CREATE_STATUTORY_SNAPSHOT", `Created DRAFT snapshot for ${body.domain} ${body.periodYear} from run ${run.id}`);
        return ok(res, createdFiling, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/filings",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const { domain, status, periodYear } = req.query;

        const where: Record<string, unknown> = { companyId };
        if (typeof domain === "string") where.domain = domain;
        if (typeof status === "string") where.status = status;
        if (typeof periodYear === "string") where.periodYear = Number(periodYear);

        const filings = await prisma.statutoryFiling.findMany({
          where,
          include: {
            payrollRun: { select: { id: true, month: true, status: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        return ok(res, filings);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/filings/:id",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: {
            items: { orderBy: { snapshotEmployeeCode: "asc" } },
            challans: true,
            payrollRun: { select: { id: true, month: true, status: true } },
          },
        });

        if (!filing) {
          return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing was not found.");
        }

        return ok(res, filing);
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition 1: DRAFT -> VALIDATED
  router.post(
    "/compliance/filings/:id/validate",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: true },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (filing.status !== "DRAFT") {
          return fail(res, 409, "INVALID_STATE", `Only DRAFT filings can be validated. Current status: ${filing.status}`);
        }

        const validation = validateSnapshotItems(
          filing.domain,
          filing.items.map((it) => ({
            employeeId: it.employeeId,
            snapshotEmployeeCode: it.snapshotEmployeeCode,
            snapshotEmployeeName: it.snapshotEmployeeName,
            snapshotUan: it.snapshotUan,
            snapshotPan: it.snapshotPan,
            snapshotEsicIp: it.snapshotEsicIp,
            workingDays: it.workingDays,
            payableDays: it.payableDays,
            ncpDays: it.ncpDays,
            grossWages: it.grossWages,
            epfWages: it.epfWages,
            epsWages: it.epsWages,
            edliWages: it.edliWages,
            eePfShare: it.eePfShare,
            erEpsShare: it.erEpsShare,
            erEpfShare: it.erEpfShare,
            eeEsiShare: it.eeEsiShare,
            erEsiShare: it.erEsiShare,
            ptAmount: it.ptAmount,
            tdsAmount: it.tdsAmount,
            calculationDetails: (it.calculationDetails as Record<string, unknown>) || {},
          })),
        );

        if (!validation.valid) {
          return fail(res, 422, "VALIDATION_FAILED", `Snapshot validation failed: ${validation.errors.join("; ")}`);
        }

        // EPF ECR Pre-Upload Statutory Diagnostics
        if (filing.domain === "EPF_ECR" && prisma.companySettings) {
          const settings = await prisma.companySettings.findUnique({
            where: { companyId },
          });

          if (settings && (settings.pfRegistrationNumber || filing.items.length > 0)) {
            const epfItems: EpfSnapshotItemInput[] = filing.items.map((it) => ({
              snapshotEmployeeCode: it.snapshotEmployeeCode,
              snapshotEmployeeName: it.snapshotEmployeeName,
              snapshotUan: it.snapshotUan,
              grossWages: it.grossWages,
              epfWages: it.epfWages,
              epsWages: it.epsWages,
              edliWages: it.edliWages,
              eePfShare: it.eePfShare,
              erEpsShare: it.erEpsShare,
              erEpfShare: it.erEpfShare,
              ncpDays: it.ncpDays,
            }));

            const diagResult = runEpfDiagnostics({
              companyPfRegistrationNumber: settings.pfRegistrationNumber || null,
              periodYear: filing.periodYear,
              periodMonth: filing.periodMonth || null,
              items: epfItems,
            });

            if (!diagResult.valid) {
              return fail(
                res,
                422,
                "VALIDATION_FAILED",
                `EPF ECR pre-upload diagnostics failed: ${diagResult.errors.map((e) => `[${e.ruleId}] ${e.message}`).join("; ")}`,
              );
            }
          }
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "VALIDATED",
            validatedAt: new Date(),
          },
        });

        await audit(req, "VALIDATE_STATUTORY_FILING", `Validated filing ${filing.id}`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition 2: VALIDATED -> PENDING_APPROVAL
  router.post(
    "/compliance/filings/:id/submit-for-approval",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (filing.status !== "VALIDATED") {
          return fail(res, 409, "INVALID_STATE", `Only VALIDATED filings can be submitted for approval. Current status: ${filing.status}`);
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: { status: "PENDING_APPROVAL" },
        });

        await audit(req, "SUBMIT_STATUTORY_FILING", `Submitted filing ${filing.id} for Checker approval`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition 3a: PENDING_APPROVAL -> DRAFT (Rejection)
  router.post(
    "/compliance/filings/:id/reject",
    permit("compliance.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "Rejected by compliance reviewer";

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (filing.status !== "PENDING_APPROVAL") {
          return fail(res, 409, "INVALID_STATE", `Only PENDING_APPROVAL filings can be rejected. Current status: ${filing.status}`);
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "DRAFT",
            rejectionReason: reason,
          },
        });

        await audit(req, "REJECT_STATUTORY_FILING", `Rejected filing ${filing.id}: ${reason}`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition 3b: PENDING_APPROVAL -> APPROVED (Checker approval with Segregation of Duties)
  router.post(
    "/compliance/filings/:id/approve",
    permit("compliance.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (filing.status !== "PENDING_APPROVAL") {
          return fail(res, 409, "INVALID_STATE", `Only PENDING_APPROVAL filings can be approved. Current status: ${filing.status}`);
        }

        // Segregation of Duties: Maker cannot approve their own filing
        if (filing.createdById === req.auth!.id) {
          return fail(res, 403, "MAKER_CANNOT_APPROVE", "Segregation of Duties violation: The Maker who created this filing cannot approve it.");
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "APPROVED",
            approvedById: req.auth!.id,
            approvedAt: new Date(),
          },
        });

        await audit(req, "APPROVE_STATUTORY_FILING", `Approved filing ${filing.id} by Checker ${req.auth!.id}`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // Transition 4: APPROVED -> LOCKED (with Canonical SHA-256 Checksum)
  router.post(
    "/compliance/filings/:id/lock",
    permit("compliance.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: true },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (filing.status !== "APPROVED") {
          return fail(res, 409, "INVALID_STATE", `Only APPROVED filings can be locked. Current status: ${filing.status}`);
        }

        const itemInfos = filing.items.map((it) => ({
          employeeId: it.employeeId,
          snapshotEmployeeCode: it.snapshotEmployeeCode,
          snapshotEmployeeName: it.snapshotEmployeeName,
          snapshotUan: it.snapshotUan,
          snapshotPan: it.snapshotPan,
          snapshotEsicIp: it.snapshotEsicIp,
          workingDays: it.workingDays,
          payableDays: it.payableDays,
          ncpDays: it.ncpDays,
          grossWages: it.grossWages,
          epfWages: it.epfWages,
          epsWages: it.epsWages,
          edliWages: it.edliWages,
          eePfShare: it.eePfShare,
          erEpsShare: it.erEpsShare,
          erEpfShare: it.erEpfShare,
          eeEsiShare: it.eeEsiShare,
          erEsiShare: it.erEsiShare,
          ptAmount: it.ptAmount,
          tdsAmount: it.tdsAmount,
          calculationDetails: (it.calculationDetails as Record<string, unknown>) || {},
        }));

        const checksum = generateCanonicalChecksum(
          {
            id: filing.id,
            domain: filing.domain,
            periodYear: filing.periodYear,
            periodMonth: filing.periodMonth,
            quarter: filing.quarter,
            stateCode: filing.stateCode,
            payrollRunId: filing.payrollRunId,
            totalEmployees: filing.totalEmployees,
            totalGrossWages: filing.totalGrossWages,
            totalTaxDeducted: filing.totalTaxDeducted,
          },
          itemInfos,
        );

        const updated = await prisma.statutoryFiling.update({
          where: { id: filing.id },
          data: {
            status: "LOCKED",
            sha256Checksum: checksum,
            lockedAt: new Date(),
          },
        });

        await audit(req, "LOCK_STATUTORY_FILING", `Locked filing ${filing.id} with checksum ${checksum}`);
        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // Discard draft filing
  router.post(
    "/compliance/filings/:id/discard",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (!["DRAFT", "VALIDATED"].includes(filing.status)) {
          return fail(res, 409, "INVALID_STATE", `Only DRAFT or VALIDATED filings can be discarded. Current status: ${filing.status}`);
        }

        await prisma.statutoryFiling.delete({
          where: { id: filing.id },
        });

        await audit(req, "DISCARD_STATUTORY_FILING", `Discarded filing ${filing.id}`);
        return ok(res, { discarded: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 5. EPF ECR DIAGNOSTICS & FLAT-TEXT EXPORT (P2.7-B)
  // -------------------------------------------------------------------------

  router.get(
    "/compliance/filings/:id/diagnostics",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: true },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (!["EPF_ECR", "ESIC_MONTHLY"].includes(filing.domain)) {
          return fail(res, 400, "INVALID_DOMAIN", "Diagnostics currently supported for EPF_ECR and ESIC_MONTHLY domains.");
        }

        const settings = prisma.companySettings
          ? await prisma.companySettings.findUnique({ where: { companyId } })
          : null;

        if (filing.domain === "ESIC_MONTHLY") {
          const diagResult = runEsicDiagnostics({
            filing: {
              domain: filing.domain,
              periodYear: filing.periodYear,
              periodMonth: filing.periodMonth || null,
            },
            companySettings: settings,
            items: filing.items.map((it) => ({
              employeeId: it.employeeId,
              snapshotEmployeeCode: it.snapshotEmployeeCode,
              snapshotEmployeeName: it.snapshotEmployeeName,
              snapshotEsicIp: it.snapshotEsicIp,
              grossWages: it.grossWages,
              payableDays: it.payableDays,
              workingDays: it.workingDays,
              eeEsiShare: it.eeEsiShare,
              erEsiShare: it.erEsiShare,
              snapshotLastWorkingDay: it.snapshotLastWorkingDay,
              calculationDetails: it.calculationDetails as Record<string, unknown> | null,
            })),
          });
          return ok(res, diagResult);
        }

        const epfItems: EpfSnapshotItemInput[] = filing.items.map((it) => ({
          snapshotEmployeeCode: it.snapshotEmployeeCode,
          snapshotEmployeeName: it.snapshotEmployeeName,
          snapshotUan: it.snapshotUan,
          grossWages: it.grossWages,
          epfWages: it.epfWages,
          epsWages: it.epsWages,
          edliWages: it.edliWages,
          eePfShare: it.eePfShare,
          erEpsShare: it.erEpsShare,
          erEpfShare: it.erEpfShare,
          ncpDays: it.ncpDays,
        }));

        const diagResult = runEpfDiagnostics({
          companyPfRegistrationNumber: settings?.pfRegistrationNumber || null,
          periodYear: filing.periodYear,
          periodMonth: filing.periodMonth || null,
          items: epfItems,
        });

        return ok(res, diagResult);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/filings/:id/export",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { items: { orderBy: { snapshotEmployeeCode: "asc" } } },
        });

        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "Filing was not found.");
        if (!["EPF_ECR", "ESIC_MONTHLY"].includes(filing.domain)) {
          return fail(res, 400, "INVALID_DOMAIN", "Export currently supports EPF_ECR and ESIC_MONTHLY domains.");
        }
        if (!["LOCKED", "EXPORTED"].includes(filing.status)) {
          return fail(res, 409, "INVALID_STATE", `Only LOCKED or EXPORTED filings can be exported. Current status: ${filing.status}`);
        }

        const settings = prisma.companySettings
          ? await prisma.companySettings.findUnique({ where: { companyId } })
          : null;

        if (filing.domain === "ESIC_MONTHLY") {
          const esiReg = (settings?.esiRegistrationNumber || "").trim();
          if (!esiReg && prisma.companySettings) {
            return fail(res, 422, "MISSING_ESI_REGISTRATION", "Cannot export ESIC: Company ESI Registration Number is missing in Company Settings.");
          }

          const effectiveEsi = esiReg || "ESIC";
          const year = filing.periodYear;
          const month = String(filing.periodMonth || 1).padStart(2, "0");
          const filename = `ESIC_${effectiveEsi}_${year}${month}.csv`;

          const { csv, checksum, recordCount } = generateEsicBulkUpload({
            periodYear: filing.periodYear,
            periodMonth: filing.periodMonth || 1,
            items: filing.items.map((it) => ({
              snapshotEsicIp: it.snapshotEsicIp,
              snapshotEmployeeName: it.snapshotEmployeeName,
              grossWages: it.grossWages,
              payableDays: it.payableDays,
              snapshotLastWorkingDay: it.snapshotLastWorkingDay,
            })),
          });

          if (filing.status === "LOCKED") {
            await prisma.statutoryFiling.update({
              where: { id: filing.id },
              data: { status: "EXPORTED" },
            });
          }

          await audit(req, "EXPORT_ESIC_MONTHLY", `Exported ESIC Monthly bulk file for filing ${filing.id} (${recordCount} records, sha256: ${checksum})`);

          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("X-ESIC-Checksum", checksum);
          res.setHeader("X-ESIC-Record-Count", String(recordCount));
          return res.status(200).send(csv);
        }

        const estCode = (settings?.pfRegistrationNumber || "").trim();
        if (!estCode && prisma.companySettings) {
          return fail(res, 422, "MISSING_ESTABLISHMENT_CODE", "Cannot export ECR: Company PF Establishment Code is missing in Company Settings.");
        }

        const effectiveEstCode = estCode || "ESTABLISHMENT";
        const year = filing.periodYear;
        const month = String(filing.periodMonth || 1).padStart(2, "0");
        const filename = `ECR_${effectiveEstCode}_${year}${month}.txt`;

        const { text, checksum, recordCount } = generateEcrFlatText({
          items: filing.items.map((it) => ({
            snapshotUan: it.snapshotUan,
            snapshotEmployeeName: it.snapshotEmployeeName,
            grossWages: it.grossWages,
            epfWages: it.epfWages,
            epsWages: it.epsWages,
            edliWages: it.edliWages,
            eePfShare: it.eePfShare,
            erEpsShare: it.erEpsShare,
            erEpfShare: it.erEpfShare,
            ncpDays: it.ncpDays,
          })),
        });

        if (filing.status === "LOCKED") {
          await prisma.statutoryFiling.update({
            where: { id: filing.id },
            data: { status: "EXPORTED" },
          });
        }

        await audit(req, "EXPORT_EPF_ECR", `Exported ECR 2.0 file for filing ${filing.id} (${recordCount} records, sha256: ${checksum})`);

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("X-ECR-Checksum", checksum);
        res.setHeader("X-ECR-Record-Count", String(recordCount));
        return res.status(200).send(text);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 6. EPF CHALLAN CALCULATION & RECONCILIATION (P2.7-B)
  // -------------------------------------------------------------------------

  router.post(
    "/compliance/epf/challans",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = CreateEpfChallanSchema.parse(req.body);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: body.statutoryFilingId, companyId },
          include: { items: true },
        });

        if (!filing) {
          return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing was not found in this company.");
        }
        if (filing.domain !== "EPF_ECR") {
          return fail(res, 422, "DOMAIN_MISMATCH", `Challan domain mismatch: Target filing domain is ${filing.domain}, but EPF challan requires EPF_ECR.`);
        }
        if (!["APPROVED", "LOCKED", "EXPORTED"].includes(filing.status)) {
          return fail(res, 409, "INVALID_STATE", `Challans can only be generated for filings that are APPROVED, LOCKED, or EXPORTED. Current status: ${filing.status}`);
        }

        // Prevent duplicate active challans for the same filing
        if (prisma.epfChallan) {
          const existingChallan = await prisma.epfChallan.findFirst({
            where: {
              companyId,
              statutoryFilingId: filing.id,
              status: { not: "CANCELLED" },
            },
          });
          if (existingChallan) {
            return fail(res, 409, "CHALLAN_ALREADY_EXISTS", `An active EPF Challan (${existingChallan.id}) already exists for this filing.`);
          }
        }

        // Validate TRRN uniqueness if supplied
        if (body.trrnNumber && prisma.epfChallan) {
          const duplicateTrrn = await prisma.epfChallan.findFirst({
            where: { trrnNumber: body.trrnNumber },
          });
          if (duplicateTrrn) {
            return fail(res, 409, "DUPLICATE_TRRN", `TRRN "${body.trrnNumber}" is already assigned to challan ${duplicateTrrn.id}.`);
          }
        }

        const settings = prisma.companySettings
          ? await prisma.companySettings.findUnique({ where: { companyId } })
          : null;

        const estCode = (settings?.pfRegistrationNumber || "UNCONFIGURED").trim();

        // Sourced active statutory rule for PF
        const statutoryRule = prisma.statutoryRuleVersion
          ? await prisma.statutoryRuleVersion.findFirst({
              where: {
                companyId,
                type: "PF",
                active: true,
              },
              orderBy: { effectiveFrom: "desc" },
            })
          : null;

        const ruleConfig = (statutoryRule?.configuration as Record<string, any>) || {};

        const totals = calculateEpfChallanTotals(
          filing.items.map((it) => ({
            epfWages: it.epfWages,
            edliWages: it.edliWages,
            eePfShare: it.eePfShare,
            erEpfShare: it.erEpfShare,
            erEpsShare: it.erEpsShare,
          })),
          {
            adminChargeRate: ruleConfig.adminChargeRate ?? 0.0050,
            minAdminChargeAmount: ruleConfig.minAdminChargeAmount ?? 500.0,
            edliContributionRate: ruleConfig.edliContributionRate ?? 0.0050,
            edliAdminChargeRate: ruleConfig.edliAdminChargeRate ?? 0.0,
          },
        );

        const challan = await prisma.epfChallan.create({
          data: {
            companyId,
            statutoryFilingId: filing.id,
            establishmentCode: estCode,
            wageMonth: filing.periodMonth || 1,
            wageYear: filing.periodYear,
            trrnNumber: body.trrnNumber || null,
            account1Amount: totals.account1Amount,
            account2Amount: totals.account2Amount,
            account10Amount: totals.account10Amount,
            account21Amount: totals.account21Amount,
            account22Amount: totals.account22Amount,
            totalAmount: totals.totalAmount,
            challanDate: new Date(body.challanDate),
            status: "CHALLAN_GENERATED",
            notes: body.notes || null,
            createdById: req.auth!.id,
          },
        });

        await audit(req, "CREATE_EPF_CHALLAN", `Generated EPF Challan ${challan.id} for filing ${filing.id} with total ₹${totals.totalAmount}`);
        return ok(res, challan, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/epf/challans",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const { status, wageYear, wageMonth, statutoryFilingId } = req.query;

        const where: Record<string, unknown> = { companyId };
        if (typeof status === "string") where.status = status;
        if (typeof wageYear === "string") where.wageYear = Number(wageYear);
        if (typeof wageMonth === "string") where.wageMonth = Number(wageMonth);
        if (typeof statutoryFilingId === "string") where.statutoryFilingId = statutoryFilingId;

        const challans = await prisma.epfChallan.findMany({
          where,
          include: {
            filing: {
              select: {
                id: true,
                domain: true,
                status: true,
                periodYear: true,
                periodMonth: true,
                totalEmployees: true,
                sha256Checksum: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return ok(res, challans);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/epf/challans/:id",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const challan = await prisma.epfChallan.findFirst({
          where: { id: String(req.params.id), companyId },
          include: {
            filing: {
              include: {
                items: { orderBy: { snapshotEmployeeCode: "asc" } },
              },
            },
          },
        });

        if (!challan) {
          return fail(res, 404, "CHALLAN_NOT_FOUND", "EPF Challan was not found.");
        }

        return ok(res, challan);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    "/compliance/epf/challans/:id",
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = UpdateEpfChallanSchema.parse(req.body);

        const challan = await prisma.epfChallan.findFirst({
          where: { id: String(req.params.id), companyId },
        });

        if (!challan) {
          return fail(res, 404, "CHALLAN_NOT_FOUND", "EPF Challan was not found.");
        }

        // Segregation of Duties & RBAC per action
        if (body.action === "RECONCILE") {
          if (!req.auth!.permissions?.includes("compliance.approve") && req.auth!.role !== "SUPER_ADMIN" && req.auth!.role !== "COMPANY_ADMIN") {
            return fail(res, 403, "FORBIDDEN", "Missing required permission: compliance.approve");
          }
          if (challan.createdById === req.auth!.id) {
            return fail(res, 403, "MAKER_CANNOT_RECONCILE", "Segregation of Duties violation: The Maker who created this challan cannot reconcile it.");
          }
        } else {
          if (!req.auth!.permissions?.includes("compliance.manage") && req.auth!.role !== "SUPER_ADMIN" && req.auth!.role !== "COMPANY_ADMIN") {
            return fail(res, 403, "FORBIDDEN", "Missing required permission: compliance.manage");
          }
        }

        // Action 1: SET_TRRN
        if (body.action === "SET_TRRN") {
          if (!body.trrnNumber) {
            return fail(res, 422, "MISSING_TRRN", "TRRN number is required for SET_TRRN action.");
          }
          const dup = await prisma.epfChallan.findFirst({
            where: { trrnNumber: body.trrnNumber, id: { not: challan.id } },
          });
          if (dup) {
            return fail(res, 409, "DUPLICATE_TRRN", `TRRN "${body.trrnNumber}" is already assigned to challan ${dup.id}.`);
          }
          const updated = await prisma.epfChallan.update({
            where: { id: challan.id },
            data: {
              trrnNumber: body.trrnNumber,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "SET_CHALLAN_TRRN", `Set TRRN ${body.trrnNumber} on challan ${challan.id}`);
          return ok(res, updated);
        }

        // Action 2: INITIATE_PAYMENT
        if (body.action === "INITIATE_PAYMENT") {
          if (challan.status !== "CHALLAN_GENERATED") {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot initiate payment from status ${challan.status}. Current status must be CHALLAN_GENERATED.`);
          }
          const trrn = body.trrnNumber || challan.trrnNumber;
          if (!trrn) {
            return fail(res, 422, "MISSING_TRRN", "A valid TRRN number is required to initiate payment.");
          }
          if (body.trrnNumber && body.trrnNumber !== challan.trrnNumber) {
            const dup = await prisma.epfChallan.findFirst({
              where: { trrnNumber: body.trrnNumber, id: { not: challan.id } },
            });
            if (dup) return fail(res, 409, "DUPLICATE_TRRN", `TRRN "${body.trrnNumber}" is already in use.`);
          }
          const updated = await prisma.epfChallan.update({
            where: { id: challan.id },
            data: {
              status: "PAYMENT_INITIATED",
              trrnNumber: trrn,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "INITIATE_EPF_PAYMENT", `Initiated payment for challan ${challan.id} with TRRN ${trrn}`);
          return ok(res, updated);
        }

        // Action 3: RECORD_PAYMENT
        if (body.action === "RECORD_PAYMENT") {
          if (!["CHALLAN_GENERATED", "PAYMENT_INITIATED"].includes(challan.status)) {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot record payment for challan with status ${challan.status}.`);
          }
          if (!body.paidDate) {
            return fail(res, 422, "MISSING_PAID_DATE", "paidDate is required when recording payment.");
          }
          const trrn = body.trrnNumber || challan.trrnNumber;
          if (!trrn) {
            return fail(res, 422, "MISSING_TRRN", "TRRN is required when confirming payment.");
          }
          const updated = await prisma.epfChallan.update({
            where: { id: challan.id },
            data: {
              status: "PAID",
              paidDate: new Date(body.paidDate),
              trrnNumber: trrn,
              challanSerialNo: body.challanSerialNo || challan.challanSerialNo,
              crnNumber: body.crnNumber || challan.crnNumber,
              bankReference: body.bankReference || challan.bankReference,
              paidRecordedById: req.auth!.id,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "RECORD_EPF_PAYMENT", `Recorded payment for challan ${challan.id} on ${body.paidDate} (TRRN: ${trrn})`);
          return ok(res, updated);
        }

        // Action 4: RECONCILE
        if (body.action === "RECONCILE") {
          if (challan.status !== "PAID") {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot reconcile challan with status ${challan.status}. Challan must be in PAID status before reconciliation.`);
          }
          const updated = await prisma.epfChallan.update({
            where: { id: challan.id },
            data: {
              status: "RECONCILED",
              reconciledById: req.auth!.id,
              reconciledAt: new Date(),
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "RECONCILE_EPF_CHALLAN", `Reconciled EPF Challan ${challan.id} by Checker ${req.auth!.id}`);
          return ok(res, updated);
        }

        // Action 5: CANCEL
        if (body.action === "CANCEL") {
          if (["PAID", "RECONCILED"].includes(challan.status)) {
            return fail(res, 409, "CANNOT_CANCEL_PAID_CHALLAN", `Cannot cancel a challan that has already been PAID or RECONCILED. Current status: ${challan.status}`);
          }
          const updated = await prisma.epfChallan.update({
            where: { id: challan.id },
            data: {
              status: "CANCELLED",
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "CANCEL_EPF_CHALLAN", `Cancelled EPF Challan ${challan.id}`);
          return ok(res, updated);
        }

        return fail(res, 400, "UNKNOWN_ACTION", `Unknown action: ${body.action}`);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 7. ESIC CHALLAN CALCULATION & RECONCILIATION (P2.7-C)
  // -------------------------------------------------------------------------

  router.post(
    "/compliance/esic/challans",
    permit("compliance.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = CreateEsicChallanSchema.parse(req.body);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: body.statutoryFilingId, companyId },
          include: { items: true },
        });

        if (!filing) {
          return fail(res, 404, "FILING_NOT_FOUND", "Statutory filing was not found in this company.");
        }
        if (filing.domain !== "ESIC_MONTHLY") {
          return fail(res, 422, "DOMAIN_MISMATCH", `Challan domain mismatch: Target filing domain is ${filing.domain}, but ESIC challan requires ESIC_MONTHLY.`);
        }
        if (!["APPROVED", "LOCKED", "EXPORTED"].includes(filing.status)) {
          return fail(res, 409, "INVALID_STATE", `Challans can only be generated for filings that are APPROVED, LOCKED, or EXPORTED. Current status: ${filing.status}`);
        }

        // Prevent duplicate active challans for the same filing
        if (prisma.esicChallan) {
          const existingChallan = await prisma.esicChallan.findFirst({
            where: {
              companyId,
              statutoryFilingId: filing.id,
              status: { not: "CANCELLED" },
            },
          });
          if (existingChallan) {
            return fail(res, 409, "CHALLAN_ALREADY_EXISTS", `An active ESIC Challan (${existingChallan.id}) already exists for this filing.`);
          }
        }

        // Validate CPRN uniqueness if supplied
        if (body.cprnNumber && prisma.esicChallan) {
          const duplicateCprn = await prisma.esicChallan.findFirst({
            where: { cprnNumber: body.cprnNumber },
          });
          if (duplicateCprn) {
            return fail(res, 409, "DUPLICATE_CPRN", `CPRN "${body.cprnNumber}" is already assigned to challan ${duplicateCprn.id}.`);
          }
        }

        const totals = calculateEsicChallanTotals(
          filing.items.map((it) => ({
            grossWages: it.grossWages,
            eeEsiShare: it.eeEsiShare,
            erEsiShare: it.erEsiShare,
          })),
        );

        const challan = await prisma.esicChallan.create({
          data: {
            companyId,
            statutoryFilingId: filing.id,
            challanPeriodYear: filing.periodYear,
            challanPeriodMonth: filing.periodMonth || 1,
            cprnNumber: body.cprnNumber || null,
            totalEmployees: totals.totalEmployees,
            totalWages: totals.totalWages,
            employeeShare: totals.employeeShare,
            employerShare: totals.employerShare,
            totalAmount: totals.totalAmount,
            challanDate: new Date(body.challanDate),
            status: "CHALLAN_GENERATED",
            notes: body.notes || null,
            createdById: req.auth!.id,
          },
        });

        await audit(req, "CREATE_ESIC_CHALLAN", `Generated ESIC Challan ${challan.id} for filing ${filing.id} with total ₹${totals.totalAmount}`);
        return ok(res, challan, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/esic/challans",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const { filingId, status, wageYear, wageMonth } = req.query;

        const where: Prisma.EsicChallanWhereInput = { companyId };
        if (filingId) where.statutoryFilingId = String(filingId);
        if (status) where.status = status as Prisma.EnumEsicChallanStatusFilter;
        if (wageYear) where.challanPeriodYear = Number(wageYear);
        if (wageMonth) where.challanPeriodMonth = Number(wageMonth);

        const challans = await prisma.esicChallan.findMany({
          where,
          include: {
            filing: {
              select: {
                id: true,
                domain: true,
                periodYear: true,
                periodMonth: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        return ok(res, challans);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/esic/challans/:id",
    permit("compliance.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const challan = await prisma.esicChallan.findFirst({
          where: { id: String(req.params.id), companyId },
          include: {
            filing: true,
          },
        });

        if (!challan) {
          return fail(res, 404, "CHALLAN_NOT_FOUND", "ESIC Challan was not found.");
        }

        return ok(res, challan);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    "/compliance/esic/challans/:id",
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const body = UpdateEsicChallanSchema.parse(req.body);

        const challan = await prisma.esicChallan.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { filing: { include: { items: true } } },
        });

        if (!challan) {
          return fail(res, 404, "CHALLAN_NOT_FOUND", "ESIC Challan was not found.");
        }

        // Segregation of Duties & RBAC per action
        if (body.action === "RECONCILE") {
          if (!req.auth!.permissions?.includes("compliance.approve") && req.auth!.role !== "SUPER_ADMIN" && req.auth!.role !== "COMPANY_ADMIN") {
            return fail(res, 403, "FORBIDDEN", "Missing required permission: compliance.approve");
          }
          if (challan.createdById === req.auth!.id) {
            return fail(res, 403, "MAKER_CANNOT_RECONCILE", "Segregation of Duties violation: The Maker who created this challan cannot reconcile it.");
          }
        } else {
          if (!req.auth!.permissions?.includes("compliance.manage") && req.auth!.role !== "SUPER_ADMIN" && req.auth!.role !== "COMPANY_ADMIN") {
            return fail(res, 403, "FORBIDDEN", "Missing required permission: compliance.manage");
          }
        }

        // Action 1: SET_CPRN
        if (body.action === "SET_CPRN") {
          if (!body.cprnNumber) {
            return fail(res, 422, "MISSING_CPRN", "CPRN number is required for SET_CPRN action.");
          }
          const dup = await prisma.esicChallan.findFirst({
            where: { cprnNumber: body.cprnNumber, id: { not: challan.id } },
          });
          if (dup) {
            return fail(res, 409, "DUPLICATE_CPRN", `CPRN "${body.cprnNumber}" is already assigned to challan ${dup.id}.`);
          }
          const updated = await prisma.esicChallan.update({
            where: { id: challan.id },
            data: {
              cprnNumber: body.cprnNumber,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "SET_CHALLAN_CPRN", `Set CPRN ${body.cprnNumber} on challan ${challan.id}`);
          return ok(res, updated);
        }

        // Action 2: INITIATE_PAYMENT
        if (body.action === "INITIATE_PAYMENT") {
          if (challan.status !== "CHALLAN_GENERATED") {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot initiate payment from status ${challan.status}. Current status must be CHALLAN_GENERATED.`);
          }
          const cprn = body.cprnNumber || challan.cprnNumber;
          if (!cprn) {
            return fail(res, 422, "MISSING_CPRN", "A valid 14-digit CPRN number is required to initiate payment.");
          }
          if (body.cprnNumber && body.cprnNumber !== challan.cprnNumber) {
            const dup = await prisma.esicChallan.findFirst({
              where: { cprnNumber: body.cprnNumber, id: { not: challan.id } },
            });
            if (dup) return fail(res, 409, "DUPLICATE_CPRN", `CPRN "${body.cprnNumber}" is already in use.`);
          }
          const updated = await prisma.esicChallan.update({
            where: { id: challan.id },
            data: {
              status: "PAYMENT_INITIATED",
              cprnNumber: cprn,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "INITIATE_ESIC_PAYMENT", `Initiated payment for challan ${challan.id} with CPRN ${cprn}`);
          return ok(res, updated);
        }

        // Action 3: RECORD_PAYMENT
        if (body.action === "RECORD_PAYMENT") {
          if (!["CHALLAN_GENERATED", "PAYMENT_INITIATED"].includes(challan.status)) {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot record payment for challan with status ${challan.status}.`);
          }
          if (!body.paidDate) {
            return fail(res, 422, "MISSING_PAID_DATE", "paidDate is required when recording payment.");
          }
          const cprn = body.cprnNumber || challan.cprnNumber;
          if (!cprn) {
            return fail(res, 422, "MISSING_CPRN", "CPRN is required when confirming payment.");
          }
          const updated = await prisma.esicChallan.update({
            where: { id: challan.id },
            data: {
              status: "PAID",
              paidDate: new Date(body.paidDate),
              cprnNumber: cprn,
              transactionReference: body.transactionReference || challan.transactionReference,
              bankReference: body.bankReference || challan.bankReference,
              paidRecordedById: req.auth!.id,
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "RECORD_ESIC_PAYMENT", `Recorded payment for challan ${challan.id} on ${body.paidDate} (CPRN: ${cprn})`);
          return ok(res, updated);
        }

        // Action 4: RECONCILE
        if (body.action === "RECONCILE") {
          if (challan.status !== "PAID") {
            return fail(res, 409, "INVALID_STATE_TRANSITION", `Cannot reconcile challan with status ${challan.status}. Challan must be in PAID status before reconciliation.`);
          }

          if (!challan.filing || !Array.isArray(challan.filing.items)) {
            return fail(res, 404, "FILING_NOT_FOUND", "Authoritative filing associated with this challan was not found.");
          }

          // Strict financial reconciliation check against filing
          const filingTotals = calculateEsicChallanTotals(
            challan.filing.items.map((it) => ({
              grossWages: it.grossWages,
              eeEsiShare: it.eeEsiShare,
              erEsiShare: it.erEsiShare,
            })),
          );

          if (Math.abs(challan.totalAmount - filingTotals.totalAmount) > 0.01) {
            return fail(
              res,
              422,
              "RECONCILIATION_AMOUNT_MISMATCH",
              `Challan amount (₹${challan.totalAmount}) does not match authoritative filing liability (₹${filingTotals.totalAmount}).`,
            );
          }

          const checksum = crypto
            .createHash("sha256")
            .update(`${challan.id}:${challan.totalAmount}:${challan.paidDate?.toISOString()}:${challan.cprnNumber}`)
            .digest("hex");

          const updated = await prisma.esicChallan.update({
            where: { id: challan.id },
            data: {
              status: "RECONCILED",
              reconciliationChecksum: checksum,
              reconciledById: req.auth!.id,
              reconciledAt: new Date(),
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "RECONCILE_ESIC_CHALLAN", `Reconciled ESIC Challan ${challan.id} by Checker ${req.auth!.id} (checksum: ${checksum})`);
          return ok(res, updated);
        }

        // Action 5: CANCEL
        if (body.action === "CANCEL") {
          if (["PAID", "RECONCILED"].includes(challan.status)) {
            return fail(res, 409, "CANNOT_CANCEL_PAID_CHALLAN", `Cannot cancel a challan that has already been PAID or RECONCILED. Current status: ${challan.status}`);
          }
          const updated = await prisma.esicChallan.update({
            where: { id: challan.id },
            data: {
              status: "CANCELLED",
              updatedById: req.auth!.id,
              notes: body.notes || challan.notes,
            },
          });
          await audit(req, "CANCEL_ESIC_CHALLAN", `Cancelled ESIC Challan ${challan.id}`);
          return ok(res, updated);
        }

        return fail(res, 400, "UNKNOWN_ACTION", `Unknown action: ${body.action}`);
      } catch (err) {
        next(err);
      }
    },
  );

  // Mount TDS Form 24Q / Form 138 Compliance Sub-Router (P2.8)
  router.use(createTdsComplianceRouter(prisma, authenticate));

  // Mount Multi-State Professional Tax Compliance Sub-Router (P2.9)
  router.use(createPtComplianceRouter(prisma, authenticate));

  return router;
}
