import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { daysUntil, runComplianceReminders, createReminderRouter } from "./reminders.js";

describe("OrbitHR Compliance Reminders & Escalation Suite (P2.11)", () => {
  const companyId = "company-test-01";
  const now = new Date("2026-10-15T10:00:00Z");

  const buildBaseMock = (overrides: Record<string, any> = {}) => {
    const notifications: any[] = [];
    const mockPrisma: any = {
      $transaction: async (fn: any) => fn(mockPrisma),
      $queryRawUnsafe: async () => [{ acquired: true }],
      employeeDocument: { findMany: vi.fn().mockResolvedValue([]) },
      employee: { findMany: vi.fn().mockResolvedValue([]) },
      complianceCalendarObligation: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where?.id) return { id: where.id, companyId: where.companyId || companyId };
          return null;
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            notifications.find(
              (n) =>
                n.companyId === where.companyId &&
                n.userId === where.userId &&
                n.eventKey === where.eventKey &&
                n.entityId === where.entityId,
            ) || null
          );
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          notifications.push(data);
          return { id: `notif-${notifications.length}`, ...data };
        }),
      },
      notificationDelivery: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
      ...overrides,
    };
    return { mockPrisma, notifications };
  };

  describe("1. daysUntil calculation", () => {
    it("calculates positive whole day differences", () => {
      const future = new Date("2026-10-20T10:00:00Z");
      expect(daysUntil(future, now)).toBe(5);
    });

    it("calculates negative differences for overdue dates", () => {
      const past = new Date("2026-10-10T10:00:00Z");
      expect(daysUntil(past, now)).toBe(-5);
    });

    it("returns 0 for the exact same timestamp", () => {
      expect(daysUntil(now, now)).toBe(0);
    });
  });

  describe("2. Document & Probation Reminders", () => {
    it("emits document expiration notifications and deduplicates within 20-hour window", async () => {
      const expiry = new Date(now.getTime() + 5 * 86_400_000);
      const { mockPrisma, notifications } = buildBaseMock({
        employeeDocument: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "doc-1",
              companyId,
              title: "Passport",
              expiryDate: expiry,
              employee: { userId: "user-emp-1", firstName: "Rahul", lastName: "Sharma" },
            },
          ]),
        },
      });

      const res1 = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res1.documents).toBe(1);
      expect(res1.emitted).toBe(1);
      expect(notifications.length).toBe(1);
      expect(notifications[0].eventKey).toBe("DOCUMENT_EXPIRING");
      expect(notifications[0].userId).toBe("user-emp-1");

      // Second run within 20-hour window should be deduplicated (0 emitted)
      const res2 = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res2.emitted).toBe(0);
      expect(notifications.length).toBe(1);
    });

    it("emits probation ending reminders approaching within 30 days", async () => {
      const probationEnd = new Date(now.getTime() + 10 * 86_400_000);
      const { mockPrisma, notifications } = buildBaseMock({
        employee: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "emp-prob-1",
              userId: "user-prob-1",
              firstName: "Amit",
              lastName: "Patel",
              probationEndDate: probationEnd,
            },
          ]),
        },
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.probations).toBe(1);
      expect(res.emitted).toBe(1);
      expect(notifications[0].eventKey).toBe("PROBATION_ENDING");
      expect(notifications[0].userId).toBe("user-prob-1");
    });
  });

  describe("3. Statutory Compliance Calendar Reminders (Assigned Obligations)", () => {
    it("delivers reminder directly to assigned user when assignee is present", async () => {
      const updatedObligations: any[] = [];
      const { mockPrisma, notifications } = buildBaseMock({
        complianceCalendarObligation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "obl-assigned-1",
              companyId,
              domain: "EPF_ECR",
              obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
              status: "DUE_SOON",
              statutoryDueDate: new Date(now.getTime() + 3 * 86_400_000),
              extendedDueDate: null,
              assignedUserId: "user-assigned-tax",
            },
          ]),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            updatedObligations.push({ where, data });
            return { id: where.id, ...data };
          }),
        },
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.obligations).toBe(1);
      expect(res.emitted).toBe(1);
      expect(notifications.length).toBe(1);
      expect(notifications[0].userId).toBe("user-assigned-tax");
      expect(notifications[0].eventKey).toBe("STATUTORY_DEADLINE_APPROACHING");
      expect(notifications[0].title).toContain("Statutory deadline approaching: EPF_ECR");
      expect(updatedObligations.length).toBe(1);
      expect(updatedObligations[0].where.id).toBe("obl-assigned-1");
    });
  });

  describe("4. Unassigned Obligation Escalation Alerts (OBS-P2.10-04, AC-3, AC-5)", () => {
    it("fans out escalation alerts to all active COMPANY_ADMIN and PAYROLL_ADMIN users in the tenant", async () => {
      const updatedObligations: any[] = [];
      const mockAdmins = [
        { id: "admin-user-1", role: "COMPANY_ADMIN" },
        { id: "admin-user-2", role: "PAYROLL_ADMIN" },
        { id: "admin-user-3", role: "COMPANY_ADMIN" },
      ];

      const { mockPrisma, notifications } = buildBaseMock({
        complianceCalendarObligation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "obl-unassigned-soon",
              companyId,
              domain: "ESIC_MONTHLY",
              obligationType: "MONTHLY_CONTRIBUTION_AND_RETURN",
              status: "DUE_SOON",
              statutoryDueDate: new Date(now.getTime() + 4 * 86_400_000),
              extendedDueDate: null,
              assignedUserId: null, // Unassigned!
            },
          ]),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            updatedObligations.push({ where, data });
            return { id: where.id, ...data };
          }),
        },
        user: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (mockAdmins.some((a) => a.id === where?.id)) {
              return { id: where.id, companyId: where.companyId || companyId };
            }
            return null;
          }),
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            expect(where.companyId).toBe(companyId);
            expect(where.role.in).toEqual(["COMPANY_ADMIN", "PAYROLL_ADMIN"]);
            return mockAdmins;
          }),
        },
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.obligations).toBe(1);
      expect(res.emitted).toBe(3); // All 3 admins received an escalation alert!
      expect(notifications.length).toBe(3);

      const userIds = notifications.map((n) => n.userId);
      expect(userIds).toContain("admin-user-1");
      expect(userIds).toContain("admin-user-2");
      expect(userIds).toContain("admin-user-3");

      notifications.forEach((n) => {
        expect(n.companyId).toBe(companyId);
        expect(n.eventKey).toBe("STATUTORY_DEADLINE_UNASSIGNED_APPROACHING");
        expect(n.title).toBe("[Action Required] Unassigned: ESIC_MONTHLY");
        expect(n.body).toContain("Unassigned statutory obligation ESIC_MONTHLY");
        expect(n.actionUrl).toBe("/compliance/calendar");
      });

      expect(updatedObligations.length).toBe(1);
      expect(updatedObligations[0].where.id).toBe("obl-unassigned-soon");
    });

    it("emits URGENT overdue escalation when an unassigned obligation is past due date", async () => {
      const mockAdmins = [{ id: "admin-solo", role: "COMPANY_ADMIN" }];
      const { mockPrisma, notifications } = buildBaseMock({
        complianceCalendarObligation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "obl-unassigned-overdue",
              companyId,
              domain: "TDS_24Q",
              obligationType: "QUARTERLY_STATEMENT_24Q",
              status: "OVERDUE",
              statutoryDueDate: new Date(now.getTime() - 2 * 86_400_000), // 2 days ago
              extendedDueDate: null,
              assignedUserId: null,
            },
          ]),
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue({ id: "admin-solo", companyId }),
          findMany: vi.fn().mockResolvedValue(mockAdmins),
        },
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.emitted).toBe(1);
      expect(notifications[0].eventKey).toBe("STATUTORY_DEADLINE_UNASSIGNED_OVERDUE");
      expect(notifications[0].title).toBe("[URGENT] Unassigned Overdue: TDS_24Q");
      expect(notifications[0].body).toContain("was due 2 day(s) ago");
    });

    it("skips unassigned obligations when no active admin exists in that tenant", async () => {
      const { mockPrisma } = buildBaseMock({
        complianceCalendarObligation: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "obl-no-admin",
              companyId,
              domain: "PROFESSIONAL_TAX",
              obligationType: "MONTHLY_RETURN_AND_PAYMENT",
              status: "DUE_SOON",
              statutoryDueDate: new Date(now.getTime() + 1 * 86_400_000),
              extendedDueDate: null,
              assignedUserId: null,
            },
          ]),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]), // No admin found!
        },
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.emitted).toBe(0);
    });
  });

  describe("5. Advisory Locking & Concurrency Protection", () => {
    it("yields cleanly with skippedLocked when advisory lock cannot be acquired", async () => {
      const { mockPrisma } = buildBaseMock({
        $queryRawUnsafe: async () => [{ acquired: false }], // Lock already held by another container
      });

      const res = await runComplianceReminders(mockPrisma, companyId, now);
      expect(res.skippedLocked).toBe(true);
      expect(res.emitted).toBe(0);
    });
  });

  describe("6. Express Router API (/notifications/jobs/compliance-reminders)", () => {
    it("rejects unauthorized access when notification.manage permission is missing", async () => {
      const app = express();
      app.use(express.json());
      const mockAuthMiddleware: any = (req: any, _res: any, next: any) => {
        req.auth = { id: "user-1", companyId, permissions: ["other.view"] };
        next();
      };
      app.use(createReminderRouter({} as any, mockAuthMiddleware));

      const res = await request(app).post("/notifications/jobs/compliance-reminders");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("executes reminder runner and returns result when permission is granted", async () => {
      const app = express();
      app.use(express.json());
      const mockAuthMiddleware: any = (req: any, _res: any, next: any) => {
        req.auth = { id: "user-admin", companyId, permissions: ["notification.manage"] };
        req.requestId = "req-12345";
        next();
      };
      const { mockPrisma } = buildBaseMock();
      app.use(createReminderRouter(mockPrisma, mockAuthMiddleware));

      const res = await request(app).post("/notifications/jobs/compliance-reminders");
      expect(res.status).toBe(200);
      expect(res.body.data.emitted).toBe(0);
      expect(res.body.meta.requestId).toBe("req-12345");
    });
  });
});
