import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  type ComplianceRequest,
  money,
  PAN_REGEX,
  EmployeeStatutoryProfileSchema,
  TdsChallanSchema,
  CreateSnapshotFilingSchema,
} from "./types.js";
import {
  extractStatutorySnapshot,
  generateCanonicalChecksum,
  validateSnapshotItems,
  type SnapshotEmployeeInfo,
  type SnapshotPayrollLineInfo,
} from "./snapshotEngine.js";

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

  return router;
}
