import { Router, type Request, type RequestHandler, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { emitNotification } from "./notifications.js";

type Req = Request & { auth?: { id: string; companyId: string; permissions: string[] }; requestId?: string };
export const daysUntil = (date: Date, now = new Date()) => Math.ceil((date.getTime() - now.getTime()) / 86_400_000);

export async function runComplianceReminders(prisma: PrismaClient, companyId: string, now = new Date()) {
  const until = new Date(now.getTime() + 30 * 86_400_000);
  const since = new Date(now.getTime() - 20 * 60 * 60_000);

  const runInsideTx = async (tx: any) => {
    // 1. Transaction-Scoped PostgreSQL Advisory Lock:
    // Prevents concurrent worker containers from executing overlapping reminder runs for the same company.
    // If lock cannot be acquired immediately, the concurrent job cleanly yields.
    if (typeof tx.$queryRawUnsafe === "function") {
      try {
        const lockResult: any = await tx.$queryRawUnsafe(
          `SELECT pg_try_advisory_xact_lock(hashtext('compliance_reminders_' || $1)) as acquired`,
          companyId
        );
        if (Array.isArray(lockResult) && lockResult.length > 0 && lockResult[0].acquired === false) {
          return { documents: 0, probations: 0, obligations: 0, emitted: 0, skippedLocked: true };
        }
      } catch {
        // Fallback for mock clients or DB engines without pg_try_advisory_xact_lock
      }
    }

    // 2. Document & Probation Reminders
    const [documents, employees] = await Promise.all([
      tx.employeeDocument.findMany({
        where: { companyId, expiryDate: { gte: now, lte: until } },
        include: { employee: { select: { userId: true, firstName: true, lastName: true } } },
      }),
      tx.employee.findMany({
        where: { companyId, probationEndDate: { gte: now, lte: until }, userId: { not: null } },
        select: { id: true, userId: true, firstName: true, lastName: true, probationEndDate: true },
      }),
    ]);

    let emitted = 0;
    for (const doc of documents) {
      if (!doc.employee?.userId) continue;
      const existing = await tx.notification.findFirst({
        where: {
          companyId,
          userId: doc.employee.userId,
          eventKey: "DOCUMENT_EXPIRING",
          entityType: "EmployeeDocument",
          entityId: doc.id,
          createdAt: { gte: since },
        },
      });
      if (!existing) {
        await emitNotification(tx, {
          companyId,
          userId: doc.employee.userId,
          eventKey: "DOCUMENT_EXPIRING",
          title: "Document expiring soon",
          body: `${doc.title} expires in ${daysUntil(doc.expiryDate!, now)} day(s).`,
          entityType: "EmployeeDocument",
          entityId: doc.id,
          actionUrl: "/documents",
        });
        emitted++;
      }
    }

    for (const employee of employees) {
      if (!employee.userId) continue;
      const existing = await tx.notification.findFirst({
        where: {
          companyId,
          userId: employee.userId,
          eventKey: "PROBATION_ENDING",
          entityType: "Employee",
          entityId: employee.id,
          createdAt: { gte: since },
        },
      });
      if (!existing) {
        await emitNotification(tx, {
          companyId,
          userId: employee.userId,
          eventKey: "PROBATION_ENDING",
          title: "Probation review approaching",
          body: `Your probation period ends in ${daysUntil(employee.probationEndDate!, now)} day(s).`,
          entityType: "Employee",
          entityId: employee.id,
          actionUrl: "/profile",
        });
        emitted++;
      }
    }

    // 3. Statutory Compliance Calendar Reminders
    const obligations = tx.complianceCalendarObligation
      ? await tx.complianceCalendarObligation.findMany({
          where: {
            companyId,
            status: { in: ["DUE_SOON", "DUE_TODAY", "OVERDUE"] },
            OR: [{ remindedAt: null }, { remindedAt: { lt: since } }],
          },
        })
      : [];

    for (const obl of obligations) {
      const isUnassigned = !obl.assignedUserId;
      let targetUserIds: string[] = [];

      if (!isUnassigned) {
        targetUserIds = [obl.assignedUserId!];
      } else {
        // Fallback: Resolve all authorized, active administrators (COMPANY_ADMIN and PAYROLL_ADMIN) in this tenant
        const activeAdmins = await tx.user.findMany({
          where: {
            companyId,
            role: { in: ["COMPANY_ADMIN", "PAYROLL_ADMIN"] },
            OR: [
              { employee: null },
              { employee: { status: { in: ["ACTIVE", "ON_PROBATION"] } } },
            ],
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });

        targetUserIds = activeAdmins.map((a: { id: string }) => a.id);
      }

      if (targetUserIds.length === 0) continue; // No eligible administrator found

      const days = daysUntil(obl.extendedDueDate || obl.statutoryDueDate, now);
      const isOverdue = obl.status === "OVERDUE" || days < 0;

      const eventKey = isUnassigned
        ? isOverdue
          ? "STATUTORY_DEADLINE_UNASSIGNED_OVERDUE"
          : "STATUTORY_DEADLINE_UNASSIGNED_APPROACHING"
        : isOverdue
        ? "STATUTORY_DEADLINE_OVERDUE"
        : "STATUTORY_DEADLINE_APPROACHING";

      const title = isUnassigned
        ? isOverdue
          ? `[URGENT] Unassigned Overdue: ${obl.domain}`
          : `[Action Required] Unassigned: ${obl.domain}`
        : isOverdue
        ? `OVERDUE: ${obl.domain} ${obl.obligationType}`
        : `Statutory deadline approaching: ${obl.domain}`;

      const body = isUnassigned
        ? isOverdue
          ? `Unassigned statutory obligation ${obl.domain} (${obl.obligationType}) was due ${Math.abs(days)} day(s) ago. Please assign an owner or take action.`
          : `Unassigned statutory obligation ${obl.domain} (${obl.obligationType}) is due in ${days} day(s). Please assign an owner or take action.`
        : isOverdue
        ? `${obl.domain} obligation was due ${Math.abs(days)} day(s) ago.`
        : `${obl.domain} obligation is due in ${days} day(s).`;

      for (const recipientUserId of targetUserIds) {
        const existing = await tx.notification.findFirst({
          where: {
            companyId,
            userId: recipientUserId,
            eventKey,
            entityType: "ComplianceCalendarObligation",
            entityId: obl.id,
            createdAt: { gte: since },
          },
        });

        if (!existing) {
          await emitNotification(tx, {
            companyId,
            userId: recipientUserId,
            eventKey,
            title,
            body,
            entityType: "ComplianceCalendarObligation",
            entityId: obl.id,
            actionUrl: "/compliance/calendar",
          });
          emitted++;
        }
      }

      if (tx.complianceCalendarObligation?.update) {
        await tx.complianceCalendarObligation.update({
          where: { id: obl.id },
          data: { remindedAt: now },
        });
      }
    }

    return {
      documents: documents.length,
      probations: employees.length,
      obligations: obligations.length,
      emitted,
    };
  };

  if (typeof (prisma as any).$transaction === "function") {
    return (prisma as any).$transaction(runInsideTx, { timeout: 30_000, maxWait: 15_000 });
  }
  return runInsideTx(prisma);
}

export function createReminderRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  router.post("/notifications/jobs/compliance-reminders", authenticate, async (req: Req, res: Response, next) => {
    try {
      if (!req.auth!.permissions.includes("notification.manage"))
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Notification management permission is required." } });
      return res.json({ data: await runComplianceReminders(prisma, req.auth!.companyId), meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
