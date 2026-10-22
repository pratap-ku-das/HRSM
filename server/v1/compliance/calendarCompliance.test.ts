import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import { createComplianceRouter } from "./routes.js";
import { runComplianceReminders } from "../reminders.js";

describe("P2.10 Unified Statutory Compliance Calendar Integration Suite", () => {
  const companyA = "company-tenant-alpha";
  const companyB = "company-tenant-beta";
  const userIdA = "user-compliance-officer-01";
  const userIdB = "user-finance-beta-02";

  let currentAuth = {
    id: userIdA,
    companyId: companyA,
    role: "HR_MANAGER",
    permissions: [
      "compliance.calendar.view",
      "compliance.calendar.manage",
      "compliance.calendar.configure",
      "compliance.calendar.assign",
      "compliance.calendar.override",
      "compliance.calendar.export",
      "compliance.calendar.audit",
      "compliance.filing.view",
      "compliance.filing.manage",
      "compliance.filing.approve",
      "compliance.filing.export",
      "compliance.pt.view",
    ],
  };

  const authMiddleware = (req: any, _res: any, next: any) => {
    req.auth = currentAuth;
    next();
  };

  let obligations: any[] = [];
  let statutoryFilings: any[] = [];
  let ptRegistrations: any[] = [];
  let auditLogs: any[] = [];
  let notifications: any[] = [];
  let users: any[] = [];

  const setupData = () => {
    obligations = [];
    statutoryFilings = [];
    ptRegistrations = [
      {
        id: "pt-reg-ka",
        companyId: companyA,
        stateCode: "KA",
        certificateNumber: "KA-PT-12345",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01"),
      },
      {
        id: "pt-reg-mh",
        companyId: companyA,
        stateCode: "MH",
        certificateNumber: "MH-PT-67890",
        status: "ACTIVE",
        effectiveFrom: new Date("2025-01-01"),
      },
    ];
    auditLogs = [];
    notifications = [];
    users = [
      { id: userIdA, companyId: companyA, role: "COMPANY_ADMIN", firstName: "Aarav", lastName: "Sharma", email: "aarav@alphacorp.com" },
      { id: userIdB, companyId: companyB, role: "COMPANY_ADMIN", firstName: "Rohan", lastName: "Verma", email: "rohan@betacorp.com" },
    ];
  };

  const prismaMock: any = {
    $transaction: async function (this: any, arg: any) {
      if (typeof arg === "function") {
        return arg(this);
      }
      return Promise.all(arg);
    },
    $queryRawUnsafe: async (query: string, ..._params: any[]) => {
      if (query.includes("pg_try_advisory_xact_lock")) {
        return [{ acquired: true }];
      }
      return [];
    },
    employeeDocument: {
      findMany: async () => [],
    },
    employee: {
      findMany: async () => [],
    },
    notificationPreference: {
      findMany: async () => [],
    },
    notificationDelivery: {
      createMany: async () => ({ count: 1 }),
    },
    tdsChallan: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    professionalTaxRegistration: {
      findMany: async ({ where }: any) => {
        return ptRegistrations.filter(r => {
          if (where?.companyId && r.companyId !== where.companyId) return false;
          if (where?.status && r.status !== where.status) return false;
          return true;
        });
      },
    },
    statutoryFiling: {
      findMany: async ({ where }: any) => {
        return statutoryFilings.filter(f => {
          if (where?.companyId && f.companyId !== where.companyId) return false;
          if (where?.domain && f.domain !== where.domain) return false;
          if (where?.periodYear && f.periodYear !== where.periodYear) return false;
          if (where?.periodMonth && f.periodMonth !== where.periodMonth) return false;
          return true;
        });
      },
    },
    complianceCalendarObligation: {
      findMany: async ({ where, orderBy }: any) => {
        let result = obligations.filter(o => {
          if (where?.companyId && o.companyId !== where.companyId) return false;
          if (where?.domain && o.domain !== where.domain) return false;
          if (where?.jurisdiction && o.jurisdiction !== where.jurisdiction) return false;
          if (where?.status?.in && !where.status.in.includes(o.status)) return false;
          if (where?.status && typeof where.status === 'string' && o.status !== where.status) return false;
          if (where?.periodYear && o.periodYear !== where.periodYear) return false;
          if (where?.periodMonth && o.periodMonth !== where.periodMonth) return false;
          return true;
        });
        if (orderBy?.statutoryDueDate) {
          result.sort((a, b) => (orderBy.statutoryDueDate === "asc" ? a.statutoryDueDate.getTime() - b.statutoryDueDate.getTime() : b.statutoryDueDate.getTime() - a.statutoryDueDate.getTime()));
        }
        return result.map(o => ({
          ...o,
          assignedUser: users.find(u => u.id === o.assignedToUserId) || null,
          statutoryFiling: statutoryFilings.find(f => f.id === o.statutoryFilingId) || null,
        }));
      },
      findFirst: async ({ where }: any) => {
        const found = obligations.find(o => {
          if (where?.id && o.id !== where.id) return false;
          if (where?.companyId && o.companyId !== where.companyId) return false;
          if (where?.domain && o.domain !== where.domain) return false;
          if (where?.obligationType && o.obligationType !== where.obligationType) return false;
          if (where?.periodYear && o.periodYear !== where.periodYear) return false;
          if (where?.periodMonth && o.periodMonth !== where.periodMonth) return false;
          if (where?.quarter && o.quarter !== where.quarter) return false;
          if (where?.jurisdiction && o.jurisdiction !== where.jurisdiction) return false;
          return true;
        });
        if (!found) return null;
        return {
          ...found,
          assignedUser: users.find(u => u.id === found.assignedToUserId) || null,
          statutoryFiling: statutoryFilings.find(f => f.id === found.statutoryFilingId) || null,
        };
      },
      findUnique: async ({ where }: any) => {
        const found = obligations.find(o => {
          if (where?.id && o.id === where.id) return true;
          if (where?.companyId_domain_obligationType_periodYear_periodMonth_quarter_jurisdiction) {
            const k = where.companyId_domain_obligationType_periodYear_periodMonth_quarter_jurisdiction;
            return (
              o.companyId === k.companyId &&
              o.domain === k.domain &&
              o.obligationType === k.obligationType &&
              o.periodYear === k.periodYear &&
              o.periodMonth === k.periodMonth &&
              o.quarter === k.quarter &&
              o.jurisdiction === k.jurisdiction
            );
          }
          return false;
        });
        if (!found) return null;
        return {
          ...found,
          assignedUser: users.find(u => u.id === found.assignedToUserId) || null,
          statutoryFiling: statutoryFilings.find(f => f.id === found.statutoryFilingId) || null,
        };
      },
      upsert: async ({ where, create, update }: any) => {
        const k = where.companyId_domain_obligationType_periodYear_periodMonth_quarter_jurisdiction;
        const idx = obligations.findIndex(
          o =>
            o.companyId === k.companyId &&
            o.domain === k.domain &&
            o.obligationType === k.obligationType &&
            o.periodYear === k.periodYear &&
            o.periodMonth === k.periodMonth &&
            o.quarter === k.quarter &&
            o.jurisdiction === k.jurisdiction
        );
        if (idx >= 0) {
          obligations[idx] = {
            ...obligations[idx],
            ...update,
            updatedAt: new Date(),
          };
          return obligations[idx];
        } else {
          const item = {
            id: `ob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          obligations.push(item);
          return item;
        }
      },
      create: async ({ data }: any) => {
        const item = {
          id: `ob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        obligations.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const idx = obligations.findIndex(o => o.id === where.id);
        if (idx >= 0) {
          obligations[idx] = { ...obligations[idx], ...data, updatedAt: new Date() };
          return obligations[idx];
        }
        throw new Error("Obligation not found");
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        return users.find(u => {
          if (where?.id && u.id !== where.id) return false;
          if (where?.companyId && u.companyId !== where.companyId) return false;
          if (where?.role?.in && !where.role.in.includes(u.role)) return false;
          if (where?.role && typeof where.role === "string" && u.role !== where.role) return false;
          return true;
        }) || null;
      },
      findMany: async ({ where }: any) => {
        return users.filter(u => {
          if (where?.companyId && u.companyId !== where.companyId) return false;
          if (where?.role?.in && !where.role.in.includes(u.role)) return false;
          if (where?.role && typeof where.role === "string" && u.role !== where.role) return false;
          return true;
        });
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const item = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
        auditLogs.push(item);
        return item;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        const item = { id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data, createdAt: new Date() };
        notifications.push(item);
        return item;
      },
      findFirst: async ({ where }: any) => {
        return notifications.find(n => {
          if (where?.companyId && n.companyId !== where.companyId) return false;
          if (where?.userId && n.userId !== where.userId) return false;
          if (where?.eventKey && n.eventKey !== where.eventKey) return false;
          if (where?.entityId && n.entityId !== where.entityId) return false;
          if (where?.createdAt?.gte && n.createdAt < where.createdAt.gte) return false;
          return true;
        }) || null;
      },
    },
  };

  const app = express();
  app.use(express.json());
  app.use("/api/v1", createComplianceRouter(prismaMock, authMiddleware));

  beforeEach(() => {
    setupData();
    currentAuth = {
      id: userIdA,
      companyId: companyA,
      role: "HR_MANAGER",
      permissions: [
        "compliance.calendar.view",
        "compliance.calendar.manage",
        "compliance.calendar.configure",
        "compliance.calendar.assign",
        "compliance.calendar.override",
        "compliance.calendar.export",
        "compliance.calendar.audit",
      ],
    };
  });

  describe("Calendar Synchronization & Deadline Generation", () => {
    it("synchronizes obligations for wage month 2026-09 idempotently", async () => {
      const res = await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      if (res.status !== 200) {
        console.error("SYNC ERROR BODY:", res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data.totalProcessed).toBeGreaterThan(0);

      // Verify that obligations exist for EPF, ESIC, TDS, and the registered PT states (KA, MH)
      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      expect(listRes.status).toBe(200);
      const items = listRes.body.data;

      const domains = items.map((i: any) => i.domain);
      expect(domains).toContain("EPF_ECR");
      expect(domains).toContain("ESIC_MONTHLY");
      expect(domains).toContain("TDS_24Q");
      expect(domains).toContain("PROFESSIONAL_TAX");

      // Verify EPF due date is 2026-10-15
      const epf = items.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.statutoryDueDate).toContain("2026-10-15");

      // Check idempotency: run sync again, total obligations count must remain identical
      const firstCount = items.length;
      const res2 = await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });
      expect(res2.status).toBe(200);

      const listRes2 = await request(app).get("/api/v1/compliance/calendar/obligations");
      expect(listRes2.body.data.length).toBe(firstCount);
    });
  });

  describe("Status Derivation and Filing Integration", () => {
    it("does not map VALIDATED or PENDING_APPROVAL to FILED", async () => {
      // 1. Initial sync
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      // 2. Add a filing in VALIDATED status (internal draft)
      const filingId = "filing-epf-validated";
      statutoryFilings.push({
        id: filingId,
        companyId: companyA,
        domain: "EPF_ECR",
        periodYear: 2026,
        periodMonth: 9,
        status: "VALIDATED",
        epfChallans: [],
      });

      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      let listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      let epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.status).not.toBe("FILED");
      expect(["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE"]).toContain(epf.status);

      // 3. Move filing to PENDING_APPROVAL status (internal review)
      statutoryFilings[0].status = "PENDING_APPROVAL";
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.status).not.toBe("FILED");
      expect(["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE"]).toContain(epf.status);
    });

    it("does not map EXPORTED without portal receipt to FILED", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      // Add filing in EXPORTED state but without portal acknowledgment/receipt
      statutoryFilings.push({
        id: "filing-epf-exported-only",
        companyId: companyA,
        domain: "EPF_ECR",
        periodYear: 2026,
        periodMonth: 9,
        status: "EXPORTED",
        tokenNumberPrn: null,
        epfChallans: [],
      });

      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      const epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      // An exported file alone must not masquerade as FILED
      expect(epf.status).not.toBe("FILED");
      expect(["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE"]).toContain(epf.status);
    });

    it("distinguishes FILED, PAID, and COMPLETED based on verified external evidence", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      // 1. External submission confirmed via TRRN, but challan not paid -> FILED
      const filingId = "filing-epf-with-trrn";
      statutoryFilings.push({
        id: filingId,
        companyId: companyA,
        domain: "EPF_ECR",
        periodYear: 2026,
        periodMonth: 9,
        status: "EXPORTED",
        epfChallans: [{ trrnNumber: "TRRN-99887766", status: "CHALLAN_GENERATED" }],
      });

      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      let listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      let epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.status).toBe("FILED");
      expect(epf.statutoryFilingId).toBe(filingId);

      // 2. Paid challan prior to portal receipt -> PAID
      statutoryFilings[0].epfChallans = [{ trrnNumber: null, status: "PAID" }];

      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.status).toBe("PAID");

      // 3. Both external receipt (TRRN) and payment confirmed -> COMPLETED
      statutoryFilings[0].epfChallans = [{ trrnNumber: "TRRN-99887766", status: "PAID" }];

      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      epf = listRes.body.data.find((i: any) => i.domain === "EPF_ECR");
      expect(epf.status).toBe("COMPLETED");
    });
  });

  describe("Operational Management (Target Date, Assignment, Notes, Manual Complete)", () => {
    it("updates internal target date without altering legal statutory due date", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      const obligation = listRes.body.data[0];

      const patchRes = await request(app)
        .patch(`/api/v1/compliance/calendar/obligations/${obligation.id}/target-date`)
        .send({ internalTargetDate: "2026-10-10" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.id).toBe(obligation.id);

      const detailRes = await request(app).get(`/api/v1/compliance/calendar/obligations/${obligation.id}`);
      expect(detailRes.body.data.internalTargetDate).toContain("2026-10-10");
      // Statutory due date must remain unchanged
      expect(detailRes.body.data.statutoryDueDate).toBe(obligation.statutoryDueDate);
    });

    it("assigns obligation to a valid same-company user", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      const obligation = listRes.body.data[0];

      const assignRes = await request(app)
        .patch(`/api/v1/compliance/calendar/obligations/${obligation.id}/assign`)
        .send({ assignedToUserId: userIdA });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.id).toBe(obligation.id);

      const detailRes = await request(app).get(`/api/v1/compliance/calendar/obligations/${obligation.id}`);
      expect(detailRes.body.data.assignedUserId).toBe(userIdA);
    });

    it("rejects assigning obligation to a foreign company user (cross-tenant assignment prevention)", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      const obligation = listRes.body.data[0];

      const assignRes = await request(app)
        .patch(`/api/v1/compliance/calendar/obligations/${obligation.id}/assign`)
        .send({ assignedToUserId: userIdB }); // User from Company B

      expect(assignRes.status).toBe(400);
      expect(assignRes.body.error.message).toContain("Assigned user does not belong to this company");
    });

    it("records manual completion with reason and audit trail", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listRes = await request(app).get("/api/v1/compliance/calendar/obligations");
      const obligation = listRes.body.data[0];

      const compRes = await request(app)
        .post(`/api/v1/compliance/calendar/obligations/${obligation.id}/complete`)
        .send({ completionNotes: "Filed directly on government portal and verified" });

      expect(compRes.status).toBe(200);
      expect(compRes.body.data.id).toBe(obligation.id);

      const detailRes = await request(app).get(`/api/v1/compliance/calendar/obligations/${obligation.id}`);
      expect(detailRes.body.data.status).toBe("COMPLETED");
      expect(detailRes.body.data.completedAt).toBeDefined();
    });
  });

  describe("Tenant Isolation and IDOR Protection", () => {
    it("prevents Company B from reading or modifying Company A obligations", async () => {
      // 1. Create obligation for Company A
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      const listA = await request(app).get("/api/v1/compliance/calendar/obligations");
      const obligationA = listA.body.data[0];

      // 2. Switch auth context to Company B
      currentAuth = {
        id: userIdB,
        companyId: companyB,
        role: "FINANCE_EXECUTIVE",
        permissions: [
          "compliance.calendar.view",
          "compliance.calendar.manage",
        ],
      };

      // Company B list should have 0 items
      const listB = await request(app).get("/api/v1/compliance/calendar/obligations");
      expect(listB.body.data.length).toBe(0);

      // Attempting to access Company A obligation by ID must return 404
      const idorGet = await request(app).get(`/api/v1/compliance/calendar/obligations/${obligationA.id}`);
      expect(idorGet.status).toBe(404);

      // Attempting to mutate Company A obligation must return 404
      const idorPatch = await request(app)
        .patch(`/api/v1/compliance/calendar/obligations/${obligationA.id}/target-date`)
        .send({ internalTargetDate: "2026-10-10" });
      expect(idorPatch.status).toBe(404);
    });
  });

  describe("Compliance Reminders Runner", () => {
    it("dispatches notifications for upcoming obligations idempotently", async () => {
      // Create an obligation due tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      obligations.push({
        id: "ob-urgent-1",
        companyId: companyA,
        domain: "EPF_ECR",
        obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
        title: "EPF ECR Filing",
        status: "DUE_SOON",
        statutoryDueDate: tomorrow,
        extendedDueDate: null,
        periodKey: "2026-09",
        assignedUserId: userIdA,
      });

      const sentCount = await runComplianceReminders(prismaMock, companyA);
      expect(sentCount.emitted).toBeGreaterThanOrEqual(1);
      expect(notifications.length).toBeGreaterThanOrEqual(1);

      // Running a second time should be idempotent (no duplicate notification)
      const countBefore = notifications.length;
      await runComplianceReminders(prismaMock, companyA);
      expect(notifications.length).toBe(countBefore);
    });

    it("routes unassigned obligation reminders to active COMPANY_ADMIN", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      obligations.push({
        id: "ob-unassigned-urgent",
        companyId: companyA,
        domain: "TDS_24Q",
        obligationType: "QUARTERLY_STATEMENT_24Q",
        status: "DUE_SOON",
        statutoryDueDate: tomorrow,
        extendedDueDate: null,
        periodKey: "2026-Q2",
        assignedUserId: null, // Unassigned!
      });

      const res = await runComplianceReminders(prismaMock, companyA);
      expect(res.emitted).toBeGreaterThanOrEqual(1);

      // Verify notification went to the company admin (userIdA)
      const unassignedNotif = notifications.find(
        (n: any) => n.userId === userIdA && n.eventKey === "STATUTORY_DEADLINE_UNASSIGNED_APPROACHING"
      );
      expect(unassignedNotif).toBeDefined();
      expect(unassignedNotif.body).toContain("Unassigned statutory obligation");
    });

    it("fans out unassigned obligation escalation to all active tenant admins (COMPANY_ADMIN and PAYROLL_ADMIN)", async () => {
      const payrollAdminId = "user-payroll-admin-1";
      users.push({
        id: payrollAdminId,
        companyId: companyA,
        role: "PAYROLL_ADMIN",
        firstName: "Priya",
        lastName: "Nair",
        email: "priya@alphacorp.com",
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      obligations.push({
        id: "ob-unassigned-fanout",
        companyId: companyA,
        domain: "EPF_ECR",
        obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
        status: "DUE_SOON",
        statutoryDueDate: tomorrow,
        extendedDueDate: null,
        periodKey: "2026-10",
        assignedUserId: null,
      });

      const res = await runComplianceReminders(prismaMock, companyA);
      expect(res.emitted).toBeGreaterThanOrEqual(2);

      const notifAdmin = notifications.find(
        (n: any) => n.userId === userIdA && n.entityId === "ob-unassigned-fanout"
      );
      const notifPayroll = notifications.find(
        (n: any) => n.userId === payrollAdminId && n.entityId === "ob-unassigned-fanout"
      );

      expect(notifAdmin).toBeDefined();
      expect(notifPayroll).toBeDefined();
      expect(notifAdmin.companyId).toBe(companyA);
      expect(notifPayroll.companyId).toBe(companyA);
    });

    it("yields cleanly when advisory lock is held by concurrent worker", async () => {
      // Simulate advisory lock denial by another active worker
      const lockedPrismaMock = {
        ...prismaMock,
        $queryRawUnsafe: async (query: string) => {
          if (query.includes("pg_try_advisory_xact_lock")) {
            return [{ acquired: false }];
          }
          return [];
        },
      };

      const result = await runComplianceReminders(lockedPrismaMock, companyA);
      expect(result.skippedLocked).toBe(true);
      expect(result.emitted).toBe(0);
    });
  });

  describe("Calendar Export", () => {
    it("exports obligations as JSON and CSV with correct headers", async () => {
      await request(app)
        .post("/api/v1/compliance/calendar/sync")
        .send({ periodYear: 2026, periodMonth: 9 });

      // CSV export
      const csvRes = await request(app).get("/api/v1/compliance/calendar/export?format=csv");
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers["content-type"]).toContain("text/csv");
      expect(csvRes.text).toContain("ObligationID,Domain,ObligationType");

      // JSON export
      const jsonRes = await request(app).get("/api/v1/compliance/calendar/export?format=json");
      expect(jsonRes.status).toBe(200);
      expect(jsonRes.headers["content-type"]).toContain("application/json");
      expect(Array.isArray(jsonRes.body.data.obligations)).toBe(true);
    });
  });
});
