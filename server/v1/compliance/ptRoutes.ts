/**
 * OrbitHR Multi-State Professional Tax Compliance Routes (P2.9)
 * Implements endpoints for:
 * - State Registration management (PT-RC / PT-EC) for KA, MH, TS, WB
 * - Multi-State Liability Overview & Reporting
 * - Monthly PT Filing Generation from frozen Payroll Runs
 * - Maker/Checker Segregation of Duties (SoD) for Approval and Locking
 * - Strict 1:1 Challan Generation, Payment Recording, and Zero-Variance Reconciliation
 * - Audited Filing Export with 'UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY' banner
 */

import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";
import { money, type ComplianceRequest } from "./types.js";
import {
  isSupportedPtState,
  SUPPORTED_PT_STATES,
} from "./professionalTax/index.js";

export const CreatePtRegistrationSchema = z.object({
  stateCode: z.enum(["KA", "MH", "TS", "WB"]),
  registrationType: z.enum(["PT_RC", "PT_EC"]).default("PT_RC"),
  certificateNumber: z.string().trim().min(3).max(50),
  issuingAuthority: z.string().trim().max(100).optional().nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom must be YYYY-MM-DD"),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveTo must be YYYY-MM-DD").optional().nullable(),
  workLocationId: z.string().min(1).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const UpdatePtRegistrationSchema = z.object({
  certificateNumber: z.string().trim().min(3).max(50).optional(),
  issuingAuthority: z.string().trim().max(100).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED"]).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveTo must be YYYY-MM-DD").optional().nullable(),
  workLocationId: z.string().min(1).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const GeneratePtFilingSchema = z.object({
  payrollRunId: z.string().min(1),
  stateCode: z.enum(["KA", "MH", "TS", "WB"]),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

export const CreatePtChallanSchema = z.object({
  statutoryFilingId: z.string().min(1),
  challanNumber: z.string().trim().min(3).max(50),
  challanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "challanDate must be YYYY-MM-DD"),
  notes: z.string().max(500).optional().nullable(),
});

export const RecordPtPaymentSchema = z.object({
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paidDate must be YYYY-MM-DD"),
  cinNumber: z.string().trim().min(5).max(50).optional().nullable(),
  bankReference: z.string().trim().min(3).max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export function createPtComplianceRouter(
  prisma: PrismaClient,
  authenticate: RequestHandler,
): Router {
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

  // -------------------------------------------------------------------------
  // 1. OVERVIEW & METRICS
  // -------------------------------------------------------------------------
  router.get(
    "/compliance/pt/overview",
    authenticate,
    permit("compliance.pt.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;

        const registrations = await prisma.professionalTaxRegistration.findMany({
          where: { companyId },
          include: { workLocation: { select: { id: true, name: true, state: true } } },
          orderBy: { stateCode: "asc" },
        });

        const filings = await prisma.statutoryFiling.findMany({
          where: { companyId, domain: "PROFESSIONAL_TAX" },
          include: { ptChallan: true },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
          take: 20,
        });

        const stateMetrics = SUPPORTED_PT_STATES.map((state) => {
          const stateRegs = registrations.filter((r) => r.stateCode === state && r.status === "ACTIVE");
          const stateFilings = filings.filter((f) => f.stateCode === state);
          const totalFiledLiability = money(
            stateFilings.reduce((sum, f) => sum + f.totalTaxDeducted, 0),
          );
          const totalPaidLiability = money(
            stateFilings
              .filter((f) => f.ptChallan && ["PAID", "RECONCILED"].includes(f.ptChallan.status))
              .reduce((sum, f) => sum + (f.ptChallan?.totalAmount || 0), 0),
          );

          return {
            stateCode: state,
            activeRegistrationsCount: stateRegs.length,
            filingsCount: stateFilings.length,
            totalFiledLiability,
            totalPaidLiability,
            variance: money(totalFiledLiability - totalPaidLiability),
          };
        });

        return ok(res, {
          supportedStates: SUPPORTED_PT_STATES,
          registrations,
          recentFilings: filings,
          stateMetrics,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. STATE REGISTRATIONS CRUD
  // -------------------------------------------------------------------------
  router.get(
    "/compliance/pt/registrations",
    authenticate,
    permit("compliance.pt.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const registrations = await prisma.professionalTaxRegistration.findMany({
          where: { companyId },
          include: { workLocation: true },
          orderBy: [{ stateCode: "asc" }, { registrationType: "asc" }],
        });
        return ok(res, registrations);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/registrations",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const parsed = CreatePtRegistrationSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid registration payload", parsed.error.issues);
        }

        const data = parsed.data;

        const existing = await prisma.professionalTaxRegistration.findFirst({
          where: {
            companyId,
            stateCode: data.stateCode,
            registrationType: data.registrationType,
            certificateNumber: data.certificateNumber,
          },
        });
        if (existing) {
          return fail(res, 409, "DUPLICATE_REGISTRATION", "A registration with this certificate number already exists for this state.");
        }

        const created = await prisma.professionalTaxRegistration.create({
          data: {
            companyId,
            stateCode: data.stateCode,
            registrationType: data.registrationType,
            certificateNumber: data.certificateNumber,
            issuingAuthority: data.issuingAuthority || null,
            effectiveFrom: new Date(data.effectiveFrom),
            effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
            workLocationId: data.workLocationId || null,
            notes: data.notes || null,
          },
        });

        return ok(res, created, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    "/compliance/pt/registrations/:id",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const reg = await prisma.professionalTaxRegistration.findFirst({
          where: { id, companyId },
        });
        if (!reg) {
          return fail(res, 404, "NOT_FOUND", "Registration not found.");
        }

        const parsed = UpdatePtRegistrationSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid update payload", parsed.error.issues);
        }

        const d = parsed.data;
        const updated = await prisma.professionalTaxRegistration.update({
          where: { id },
          data: {
            certificateNumber: d.certificateNumber,
            issuingAuthority: d.issuingAuthority,
            status: d.status,
            effectiveTo: d.effectiveTo ? new Date(d.effectiveTo) : undefined,
            workLocationId: d.workLocationId,
            notes: d.notes,
          },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    "/compliance/pt/registrations/:id",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const reg = await prisma.professionalTaxRegistration.findFirst({
          where: { id, companyId },
        });
        if (!reg) {
          return fail(res, 404, "NOT_FOUND", "Registration not found.");
        }

        await prisma.professionalTaxRegistration.delete({
          where: { id },
        });

        return ok(res, { deleted: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 3. PT FILINGS (RETURNS)
  // -------------------------------------------------------------------------
  router.get(
    "/compliance/pt/filings",
    authenticate,
    permit("compliance.pt.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const stateCode = req.query.stateCode ? String(req.query.stateCode).toUpperCase() : undefined;
        const periodYear = req.query.periodYear ? parseInt(String(req.query.periodYear), 10) : undefined;
        const periodMonth = req.query.periodMonth ? parseInt(String(req.query.periodMonth), 10) : undefined;

        const filings = await prisma.statutoryFiling.findMany({
          where: {
            companyId,
            domain: "PROFESSIONAL_TAX",
            ...(stateCode ? { stateCode } : {}),
            ...(periodYear ? { periodYear } : {}),
            ...(periodMonth ? { periodMonth } : {}),
          },
          include: {
            payrollRun: { select: { id: true, month: true, status: true } },
            ptChallan: true,
            _count: { select: { items: true } },
          },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        });

        return ok(res, filings);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/pt/filings/:id",
    authenticate,
    permit("compliance.pt.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
          include: {
            payrollRun: true,
            ptChallan: true,
            items: {
              include: {
                employee: {
                  select: { id: true, employeeCode: true, firstName: true, lastName: true, gender: true },
                },
              },
            },
          },
        });
        if (!filing) {
          return fail(res, 404, "NOT_FOUND", "PT Filing not found.");
        }

        return ok(res, filing);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/filings/generate",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const parsed = GeneratePtFilingSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid generate filing request", parsed.error.issues);
        }

        const { payrollRunId, stateCode, periodYear, periodMonth } = parsed.data;

        const run = await prisma.payrollRun.findFirst({
          where: { id: payrollRunId, companyId },
          include: { lines: true },
        });
        if (!run) {
          return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run not found for company.");
        }

        const allowedRunStatuses = [
          "LOCKED",
          "PAYSLIP_GENERATED",
          "PAYSLIPS_PUBLISHED",
          "BANK_EXPORTED",
          "PROCESSED",
          "PAID",
        ];
        if (!allowedRunStatuses.includes(run.status)) {
          return fail(
            res,
            400,
            "PAYROLL_RUN_NOT_FINALIZED",
            `Payroll run status '${run.status}' is not finalized. Must be locked/published before generating statutory filings.`,
          );
        }

        const existingFiling = await prisma.statutoryFiling.findFirst({
          where: {
            companyId,
            domain: "PROFESSIONAL_TAX",
            periodYear,
            periodMonth,
            stateCode,
            filingType: "ORIGINAL",
          },
        });
        if (existingFiling && existingFiling.status === "LOCKED") {
          return fail(
            res,
            409,
            "FILING_LOCKED",
            "A locked Professional Tax filing already exists for this period and state.",
          );
        }

        const employeeIds = run.lines.map((l) => l.employeeId);
        const employees = await prisma.employee.findMany({
          where: { id: { in: employeeIds }, companyId },
          include: {
            location: { select: { state: true } },
          },
        });
        const employeeMap = new Map(employees.map((e) => [e.id, e]));

        const companySettings = await prisma.companySettings.findUnique({
          where: { companyId },
          select: { state: true },
        });

        const profiles = await prisma.employeeStatutoryProfile.findMany({
          where: { companyId, employeeId: { in: employeeIds }, active: true },
        });
        const profileMap = new Map(profiles.map((p) => [p.employeeId, p.ptState]));

        const stateLines = run.lines.filter((line) => {
          const emp = employeeMap.get(line.employeeId);
          if (!emp) return false;
          const profState = profileMap.get(emp.id);
          const rawState = profState || emp.location?.state || companySettings?.state || "";
          return rawState.trim().toUpperCase() === stateCode;
        });

        if (stateLines.length === 0) {
          return fail(
            res,
            400,
            "NO_EMPLOYEES_FOR_STATE",
            `No employees in payroll run '${run.month}' resolved to state '${stateCode}'.`,
          );
        }

        const itemsData = stateLines.map((line) => {
          const emp = employeeMap.get(line.employeeId)!;
          const b = (line.breakdown || {}) as Record<string, unknown>;
          const pt = typeof b.PROFESSIONAL_TAX === "number" ? money(b.PROFESSIONAL_TAX) : 0;
          return {
            employeeId: emp.id,
            snapshotEmployeeCode: emp.employeeCode,
            snapshotEmployeeName: `${emp.firstName} ${emp.lastName}`.trim(),
            snapshotPan: emp.taxIdentifier || null,
            workingDays: line.workingDays,
            payableDays: line.payableDays,
            ncpDays: line.unpaidDays,
            grossWages: money(line.grossEarnings),
            ptAmount: pt,
            calculationDetails: {
              breakdown: b,
              stateCode,
            },
          };
        });

        const totalGross = money(itemsData.reduce((sum, item) => sum + item.grossWages, 0));
        const totalPt = money(itemsData.reduce((sum, item) => sum + item.ptAmount, 0));

        let filingId: string;
        if (existingFiling) {
          await prisma.statutoryFilingItem.deleteMany({
            where: { filingId: existingFiling.id },
          });

          await prisma.statutoryFiling.update({
            where: { id: existingFiling.id },
            data: {
              totalEmployees: itemsData.length,
              totalGrossWages: totalGross,
              totalTaxDeducted: totalPt,
              status: "DRAFT",
              payrollRunId,
            },
          });
          filingId = existingFiling.id;
        } else {
          const created = await prisma.statutoryFiling.create({
            data: {
              companyId,
              domain: "PROFESSIONAL_TAX",
              filingType: "ORIGINAL",
              periodYear,
              periodMonth,
              stateCode,
              payrollRunId,
              status: "DRAFT",
              statutoryFormCode: stateCode === "MH" ? "FORM_III_B" : stateCode === "KA" ? "FORM_5" : "FORM_V",
              formatVersion: "1.0",
              totalEmployees: itemsData.length,
              totalGrossWages: totalGross,
              totalTaxDeducted: totalPt,
              createdById: req.auth!.id,
            },
          });
          filingId = created.id;
        }

        for (const item of itemsData) {
          await prisma.statutoryFilingItem.create({
            data: {
              filingId,
              employeeId: item.employeeId,
              snapshotEmployeeCode: item.snapshotEmployeeCode,
              snapshotEmployeeName: item.snapshotEmployeeName,
              snapshotPan: item.snapshotPan,
              workingDays: item.workingDays,
              payableDays: item.payableDays,
              ncpDays: item.ncpDays,
              grossWages: item.grossWages,
              ptAmount: item.ptAmount,
              calculationDetails: item.calculationDetails as any,
            },
          });
        }

        const result = await prisma.statutoryFiling.findUnique({
          where: { id: filingId },
          include: { items: true },
        });

        return ok(res, result, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/filings/:id/validate",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
          include: { items: true },
        });
        if (!filing) {
          return fail(res, 404, "NOT_FOUND", "PT Filing not found.");
        }

        if (filing.status === "LOCKED") {
          return fail(res, 400, "FILING_LOCKED", "Cannot validate a locked filing.");
        }

        const reg = await prisma.professionalTaxRegistration.findFirst({
          where: {
            companyId,
            stateCode: filing.stateCode || "",
            status: "ACTIVE",
          },
        });

        if (!reg) {
          return fail(
            res,
            422,
            "MISSING_PT_REGISTRATION",
            `No active PT Registration (PT-RC) found for state ${filing.stateCode}. Please register before validating.`,
          );
        }

        const sumPt = money(filing.items.reduce((s, it) => s + it.ptAmount, 0));
        if (sumPt !== money(filing.totalTaxDeducted)) {
          return fail(
            res,
            422,
            "ARITHMETIC_MISMATCH",
            `Sum of item PT (${sumPt}) does not match filing totalTaxDeducted (${filing.totalTaxDeducted}).`,
          );
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id },
          data: {
            status: "VALIDATED",
            validatedAt: new Date(),
          },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/filings/:id/submit",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
        });
        if (!filing) return fail(res, 404, "NOT_FOUND", "PT Filing not found.");

        if (filing.status !== "VALIDATED") {
          return fail(res, 400, "INVALID_STATE", "Filing must be VALIDATED before submitting for approval.");
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id },
          data: { status: "PENDING_APPROVAL" },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/filings/:id/approve",
    authenticate,
    permit("compliance.pt.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);
        const userId = req.auth!.id;

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
        });
        if (!filing) return fail(res, 404, "NOT_FOUND", "PT Filing not found.");

        if (filing.status !== "PENDING_APPROVAL") {
          return fail(res, 400, "INVALID_STATE", "Filing must be PENDING_APPROVAL to approve.");
        }

        if (filing.createdById === userId) {
          return fail(
            res,
            403,
            "MAKER_CHECKER_VIOLATION",
            "Segregation of Duties: The user who created/generated this filing cannot approve it.",
          );
        }

        const updated = await prisma.statutoryFiling.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedById: userId,
            approvedAt: new Date(),
          },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/filings/:id/lock",
    authenticate,
    permit("compliance.pt.approve"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
          include: { items: true },
        });
        if (!filing) return fail(res, 404, "NOT_FOUND", "PT Filing not found.");

        if (filing.status !== "APPROVED") {
          return fail(res, 400, "INVALID_STATE", "Filing must be APPROVED before locking.");
        }

        const payloadToHash = JSON.stringify({
          filingId: filing.id,
          companyId: filing.companyId,
          domain: filing.domain,
          stateCode: filing.stateCode,
          periodYear: filing.periodYear,
          periodMonth: filing.periodMonth,
          totalEmployees: filing.totalEmployees,
          totalTaxDeducted: filing.totalTaxDeducted,
          items: filing.items.map((i) => ({
            emp: i.employeeId,
            gross: i.grossWages,
            pt: i.ptAmount,
          })),
        });
        const checksum = crypto.createHash("sha256").update(payloadToHash).digest("hex");

        const updated = await prisma.statutoryFiling.update({
          where: { id },
          data: {
            status: "LOCKED",
            lockedAt: new Date(),
            sha256Checksum: checksum,
          },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/compliance/pt/filings/:id/export",
    authenticate,
    permit("compliance.pt.export"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);
        const format = req.query.format ? String(req.query.format).toLowerCase() : "json";

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id, companyId, domain: "PROFESSIONAL_TAX" },
          include: {
            items: true,
            ptChallan: true,
          },
        });
        if (!filing) return fail(res, 404, "NOT_FOUND", "PT Filing not found.");

        const reg = await prisma.professionalTaxRegistration.findFirst({
          where: { companyId, stateCode: filing.stateCode || "", status: "ACTIVE" },
        });

        const exportPayload = {
          banner: "UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY",
          notice: "OrbitHR internal certified statutory calculation. Direct state portal electronic batch upload is subject to official portal schema certification.",
          filingId: filing.id,
          jurisdiction: filing.stateCode,
          period: `${filing.periodYear}-${String(filing.periodMonth || 0).padStart(2, "0")}`,
          registrationCertificateNumber: reg?.certificateNumber || "UNREGISTERED",
          status: filing.status,
          checksum: filing.sha256Checksum,
          totals: {
            totalEmployees: filing.totalEmployees,
            totalGrossWages: filing.totalGrossWages,
            totalPtLiability: filing.totalTaxDeducted,
          },
          challan: filing.ptChallan
            ? {
                challanNumber: filing.ptChallan.challanNumber,
                amount: filing.ptChallan.totalAmount,
                status: filing.ptChallan.status,
                cinNumber: filing.ptChallan.cinNumber,
                paidDate: filing.ptChallan.paidDate,
              }
            : null,
          schedules: filing.items.map((item, idx) => ({
            serialNo: idx + 1,
            employeeCode: item.snapshotEmployeeCode,
            employeeName: item.snapshotEmployeeName,
            pan: item.snapshotPan || "N/A",
            grossWages: item.grossWages,
            ptAmount: item.ptAmount,
          })),
        };

        if (format === "csv") {
          let csv = "# BANNER: UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY\n";
          csv += `# State: ${filing.stateCode}, Period: ${exportPayload.period}, Total PT: ₹${filing.totalTaxDeducted}\n`;
          csv += "SerialNo,EmployeeCode,EmployeeName,PAN,GrossWages,PtAmount\n";
          for (const s of exportPayload.schedules) {
            csv += `${s.serialNo},"${s.employeeCode}","${s.employeeName}","${s.pan}",${s.grossWages},${s.ptAmount}\n`;
          }
          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename=PT_Filing_${filing.stateCode}_${exportPayload.period}.csv`);
          return res.send(csv);
        }

        return ok(res, exportPayload);
      } catch (err) {
        next(err);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 4. PT CHALLANS & RECONCILIATION
  // -------------------------------------------------------------------------
  router.get(
    "/compliance/pt/challans",
    authenticate,
    permit("compliance.pt.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const stateCode = req.query.stateCode ? String(req.query.stateCode).toUpperCase() : undefined;

        const challans = await prisma.ptChallan.findMany({
          where: {
            companyId,
            ...(stateCode ? { stateCode } : {}),
          },
          include: { filing: true },
          orderBy: [{ challanPeriodYear: "desc" }, { challanPeriodMonth: "desc" }],
        });

        return ok(res, challans);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/challans",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const parsed = CreatePtChallanSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid challan creation payload", parsed.error.issues);
        }

        const data = parsed.data;

        const filing = await prisma.statutoryFiling.findFirst({
          where: { id: data.statutoryFilingId, companyId, domain: "PROFESSIONAL_TAX" },
        });
        if (!filing) return fail(res, 404, "FILING_NOT_FOUND", "PT Filing not found for company.");

        const existingChallan = await prisma.ptChallan.findFirst({
          where: { statutoryFilingId: filing.id },
        });
        if (existingChallan) {
          return fail(
            res,
            409,
            "DUPLICATE_CHALLAN",
            "A challan is already linked to this filing. Multi-challan allocation is not permitted under strict 1:1 state return model.",
          );
        }

        const created = await prisma.ptChallan.create({
          data: {
            companyId,
            statutoryFilingId: filing.id,
            stateCode: filing.stateCode || "",
            challanNumber: data.challanNumber,
            challanPeriodYear: filing.periodYear,
            challanPeriodMonth: filing.periodMonth || 1,
            totalEmployees: filing.totalEmployees,
            totalAmount: filing.totalTaxDeducted,
            challanDate: new Date(data.challanDate),
            status: "CHALLAN_GENERATED",
            notes: data.notes || null,
            createdById: req.auth!.id,
          },
        });

        return ok(res, created, 201);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/challans/:id/record-payment",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const challan = await prisma.ptChallan.findFirst({
          where: { id, companyId },
        });
        if (!challan) return fail(res, 404, "NOT_FOUND", "PT Challan not found.");

        const parsed = RecordPtPaymentSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid payment record payload", parsed.error.issues);
        }

        const d = parsed.data;
        const updated = await prisma.ptChallan.update({
          where: { id },
          data: {
            paidDate: new Date(d.paidDate),
            cinNumber: d.cinNumber || null,
            bankReference: d.bankReference || null,
            notes: d.notes || challan.notes,
            status: "PAID",
          },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/compliance/pt/challans/:id/reconcile",
    authenticate,
    permit("compliance.pt.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);
        const userId = req.auth!.id;

        const challan = await prisma.ptChallan.findFirst({
          where: { id, companyId },
          include: { filing: true },
        });
        if (!challan) return fail(res, 404, "NOT_FOUND", "PT Challan not found.");

        if (challan.status !== "PAID") {
          return fail(res, 400, "CHALLAN_NOT_PAID", "Challan must be in PAID status before reconciliation.");
        }

        const filingTotal = money(challan.filing.totalTaxDeducted);
        const challanTotal = money(challan.totalAmount);
        const variance = money(filingTotal - challanTotal);

        if (variance !== 0) {
          return fail(
            res,
            422,
            "RECONCILIATION_VARIANCE_NON_ZERO",
            `Cannot reconcile: Filing liability (₹${filingTotal}) does not match Challan amount (₹${challanTotal}). Variance: ₹${variance}`,
            { filingTotal, challanTotal, variance },
          );
        }

        const updated = await prisma.ptChallan.update({
          where: { id },
          data: {
            status: "RECONCILED",
            reconciledById: userId,
            reconciledAt: new Date(),
          },
        });

        return ok(res, {
          reconciled: true,
          challan: updated,
          variance: 0,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
