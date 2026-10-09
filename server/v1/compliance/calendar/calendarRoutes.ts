import { Router, type Response, type NextFunction, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import type { ComplianceRequest } from "../types.js";
import {
  UpdateTargetDateSchema,
  AssignObligationSchema,
  UpdateObligationNotesSchema,
  CompleteObligationSchema,
  SyncCalendarSchema,
} from "./types.js";
import { syncCompanyCalendar } from "./syncService.js";

export function createCalendarRouter(
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
        req.auth.permissions.includes(permission) ||
        req.auth.permissions.includes("compliance.manage") ||
        req.auth.permissions.includes("payroll.manage")
      ) {
        return next();
      }
      return fail(res, 403, "FORBIDDEN", `Missing required permission: ${permission}`);
    };
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
          category: "COMPLIANCE_CALENDAR",
          details,
          ipAddress: req.ip || "unknown",
        },
      });
    } catch {
      // Audit failure must not block the core transaction
    }
  };

  // ---------------------------------------------------------------------------
  // 1. OVERVIEW & METRICS
  // ---------------------------------------------------------------------------
  router.get(
    "/compliance/calendar/overview",
    authenticate,
    permit("compliance.calendar.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const year = req.query.year ? parseInt(String(req.query.year), 10) : new Date().getUTCFullYear();

        const obligations = await prisma.complianceCalendarObligation.findMany({
          where: { companyId, periodYear: year },
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            statutoryFiling: { select: { id: true, status: true, statutoryFormCode: true } },
          },
          orderBy: { statutoryDueDate: "asc" },
        });

        const metrics = {
          total: obligations.length,
          upcoming: obligations.filter((o) => o.status === "UPCOMING").length,
          dueSoon: obligations.filter((o) => o.status === "DUE_SOON").length,
          dueToday: obligations.filter((o) => o.status === "DUE_TODAY").length,
          overdue: obligations.filter((o) => o.status === "OVERDUE").length,
          filed: obligations.filter((o) => o.status === "FILED").length,
          paid: obligations.filter((o) => o.status === "PAID").length,
          completed: obligations.filter((o) => o.status === "COMPLETED").length,
          exempt: obligations.filter((o) => o.status === "EXEMPT").length,
        };

        const domainBreakdown = {
          epf: obligations.filter((o) => o.domain === "EPF_ECR").length,
          esic: obligations.filter((o) => o.domain === "ESIC_MONTHLY").length,
          tds: obligations.filter((o) => o.domain === "TDS_24Q").length,
          pt: obligations.filter((o) => o.domain === "PROFESSIONAL_TAX").length,
        };

        return ok(res, {
          year,
          metrics,
          domainBreakdown,
          recentUpcoming: obligations.filter((o) => ["DUE_SOON", "DUE_TODAY", "OVERDUE"].includes(o.status)).slice(0, 5),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 2. LIST OBLIGATIONS (WITH FILTERS)
  // ---------------------------------------------------------------------------
  router.get(
    "/compliance/calendar/obligations",
    authenticate,
    permit("compliance.calendar.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
        const month = req.query.month ? parseInt(String(req.query.month), 10) : undefined;
        const quarter = req.query.quarter ? String(req.query.quarter).toUpperCase() : undefined;
        const domain = req.query.domain ? (String(req.query.domain).toUpperCase() as any) : undefined;
        const jurisdiction = req.query.jurisdiction ? String(req.query.jurisdiction).toUpperCase() : undefined;
        const status = req.query.status ? (String(req.query.status).toUpperCase() as any) : undefined;
        const assignedUserId = req.query.assignedUserId ? String(req.query.assignedUserId) : undefined;

        const obligations = await prisma.complianceCalendarObligation.findMany({
          where: {
            companyId,
            ...(year ? { periodYear: year } : {}),
            ...(month ? { periodMonth: month } : {}),
            ...(quarter ? { quarter } : {}),
            ...(domain ? { domain } : {}),
            ...(jurisdiction ? { jurisdiction } : {}),
            ...(status ? { status } : {}),
            ...(assignedUserId ? { assignedUserId } : {}),
          },
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            statutoryFiling: {
              include: {
                ptChallan: true,
                epfChallans: true,
                esicChallans: true,
                challans: true,
              },
            },
          },
          orderBy: [{ statutoryDueDate: "asc" }, { domain: "asc" }],
        });

        return ok(res, obligations);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 3. GET SINGLE OBLIGATION
  // ---------------------------------------------------------------------------
  router.get(
    "/compliance/calendar/obligations/:id",
    authenticate,
    permit("compliance.calendar.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const obligation = await prisma.complianceCalendarObligation.findFirst({
          where: { id, companyId },
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            statutoryFiling: {
              include: {
                ptChallan: true,
                epfChallans: true,
                esicChallans: true,
                challans: true,
              },
            },
          },
        });

        if (!obligation) {
          return fail(res, 404, "NOT_FOUND", "Compliance obligation not found.");
        }

        return ok(res, obligation);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 4. TRIGGER SYNCHRONIZATION
  // ---------------------------------------------------------------------------
  router.post(
    "/compliance/calendar/sync",
    authenticate,
    permit("compliance.calendar.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const parsed = SyncCalendarSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid sync payload", parsed.error.issues);
        }

        const year = parsed.data.year || parsed.data.periodYear || new Date().getUTCFullYear();
        const month = parsed.data.month || parsed.data.periodMonth;

        const result = await syncCompanyCalendar(prisma, companyId, year, month);
        await audit(req, "SYNC_COMPLIANCE_CALENDAR", `Synchronized compliance calendar for year ${year}. Processed: ${result.totalProcessed}`);

        return ok(res, result);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 5. UPDATE INTERNAL TARGET DATE
  // ---------------------------------------------------------------------------
  router.patch(
    "/compliance/calendar/obligations/:id/target-date",
    authenticate,
    permit("compliance.calendar.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const obligation = await prisma.complianceCalendarObligation.findFirst({
          where: { id, companyId },
        });
        if (!obligation) return fail(res, 404, "NOT_FOUND", "Obligation not found.");

        const parsed = UpdateTargetDateSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid target date payload", parsed.error.issues);
        }

        const targetDate = parsed.data.internalTargetDate ? new Date(parsed.data.internalTargetDate) : null;

        const updated = await prisma.complianceCalendarObligation.update({
          where: { id },
          data: { internalTargetDate: targetDate },
        });

        await audit(
          req,
          "UPDATE_INTERNAL_TARGET_DATE",
          `Updated internal target date on obligation ${id} to ${parsed.data.internalTargetDate || "none"}`,
        );

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 6. ASSIGN RESPONSIBLE USER
  // ---------------------------------------------------------------------------
  router.patch(
    "/compliance/calendar/obligations/:id/assign",
    authenticate,
    permit("compliance.calendar.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const obligation = await prisma.complianceCalendarObligation.findFirst({
          where: { id, companyId },
        });
        if (!obligation) return fail(res, 404, "NOT_FOUND", "Obligation not found.");

        const parsed = AssignObligationSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid assignment payload", parsed.error.issues);
        }

        const userId = parsed.data.assignedToUserId ?? parsed.data.assignedUserId;
        if (userId) {
          const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
          });
          if (!user) {
            return fail(res, 400, "USER_NOT_FOUND", "Assigned user does not belong to this company.");
          }
        }

        const updated = await prisma.complianceCalendarObligation.update({
          where: { id },
          data: { assignedUserId: userId || null },
          include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
        });

        await audit(req, "ASSIGN_COMPLIANCE_OBLIGATION", `Assigned obligation ${id} to user ${userId || "none"}`);

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 7. UPDATE OPERATIONAL NOTES
  // ---------------------------------------------------------------------------
  router.patch(
    "/compliance/calendar/obligations/:id/notes",
    authenticate,
    permit("compliance.calendar.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);

        const obligation = await prisma.complianceCalendarObligation.findFirst({
          where: { id, companyId },
        });
        if (!obligation) return fail(res, 404, "NOT_FOUND", "Obligation not found.");

        const parsed = UpdateObligationNotesSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid notes payload", parsed.error.issues);
        }

        const updated = await prisma.complianceCalendarObligation.update({
          where: { id },
          data: { notes: parsed.data.notes || null },
        });

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 8. RECORD MANUAL COMPLETION (e.g. Offline Challan Deposit)
  // ---------------------------------------------------------------------------
  router.post(
    "/compliance/calendar/obligations/:id/complete",
    authenticate,
    permit("compliance.calendar.manage"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const id = String(req.params.id);
        const userId = req.auth!.id;

        const obligation = await prisma.complianceCalendarObligation.findFirst({
          where: { id, companyId },
        });
        if (!obligation) return fail(res, 404, "NOT_FOUND", "Obligation not found.");

        const parsed = CompleteObligationSchema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, "VALIDATION_FAILED", "Invalid completion payload", parsed.error.issues);
        }

        const updated = await prisma.complianceCalendarObligation.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            completedById: userId,
            notes: parsed.data.notes || obligation.notes,
          },
        });

        await audit(req, "MANUAL_COMPLETE_OBLIGATION", `Marked compliance obligation ${id} manually completed by user ${userId}`);

        return ok(res, updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 9. EXPORT CALENDAR SCHEDULE (CSV / JSON)
  // ---------------------------------------------------------------------------
  router.get(
    "/compliance/calendar/export",
    authenticate,
    permit("compliance.calendar.view"),
    async (req: ComplianceRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth!.companyId;
        const year = req.query.year ? parseInt(String(req.query.year), 10) : new Date().getUTCFullYear();
        const format = req.query.format ? String(req.query.format).toLowerCase() : "json";

        const obligations = await prisma.complianceCalendarObligation.findMany({
          where: { companyId, periodYear: year },
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            statutoryFiling: { select: { id: true, status: true, statutoryFormCode: true } },
          },
          orderBy: { statutoryDueDate: "asc" },
        });

        if (format === "csv") {
          let csv = "# OrbitHR Unified Statutory Compliance Calendar Schedule\n";
          csv += `# Company: ${companyId}, Year: ${year}\n`;
          csv += "ObligationID,Domain,ObligationType,Jurisdiction,PeriodYear,PeriodMonth,Quarter,StatutoryDueDate,InternalTargetDate,Status,AssignedUser,FilingStatus\n";

          for (const o of obligations) {
            const user = (o as any).assignedUser ? (o as any).assignedUser.fullName : "Unassigned";
            const filingStatus = (o as any).statutoryFiling?.status || "NOT_GENERATED";
            const dueStr = o.statutoryDueDate.toISOString().slice(0, 10);
            const targetStr = o.internalTargetDate ? o.internalTargetDate.toISOString().slice(0, 10) : "";

            csv += `"${o.id}","${o.domain}","${o.obligationType}","${o.jurisdiction}",${o.periodYear},${o.periodMonth || ""},"${o.quarter || ""}",${dueStr},${targetStr},"${o.status}","${user}","${filingStatus}"\n`;
          }

          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename=Compliance_Calendar_${year}.csv`);
          return res.send(csv);
        }

        return ok(res, { year, total: obligations.length, obligations });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
