import express from "express";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vitest";
import { createComplianceRouter } from "./routes.js";

describe("P2.9 Multi-State Professional Tax Compliance Integration Suite", () => {
  const companyA = "company-tenant-alpha";
  const companyB = "company-tenant-beta";
  const makerUserId = "user-maker-01";
  const checkerUserId = "user-checker-02";

  let currentAuth = {
    id: makerUserId,
    companyId: companyA,
    role: "HR_MANAGER",
    permissions: [
      "compliance.pt.view",
      "compliance.pt.manage",
      "compliance.pt.approve",
      "compliance.pt.export",
    ],
  };

  const authMiddleware = (req: any, _res: any, next: any) => {
    req.auth = currentAuth;
    next();
  };

  let registrations: any[] = [];
  let filings: any[] = [];
  let filingItems: any[] = [];
  let challans: any[] = [];
  let payrollRuns: any[] = [];
  let employees: any[] = [];
  let statutoryProfiles: any[] = [];
  let companySettings: any[] = [];

  const setupData = () => {
    registrations = [];
    filings = [];
    filingItems = [];
    challans = [];
    companySettings = [
      { id: "cs-1", companyId: companyA, state: "KA" },
      { id: "cs-2", companyId: companyB, state: "MH" },
    ];
    employees = [
      {
        id: "emp-ka-1",
        companyId: companyA,
        employeeCode: "E001",
        firstName: "Rajesh",
        lastName: "Kumar",
        gender: "MALE",
        taxIdentifier: "ABCDE1234F",
      },
      {
        id: "emp-mh-1",
        companyId: companyA,
        employeeCode: "E002",
        firstName: "Priya",
        lastName: "Patil",
        gender: "FEMALE",
        taxIdentifier: "PQRS5678T",
      },
    ];
    statutoryProfiles = [
      { id: "sp-1", companyId: companyA, employeeId: "emp-ka-1", ptState: "KA", active: true },
      { id: "sp-2", companyId: companyA, employeeId: "emp-mh-1", ptState: "MH", active: true },
    ];
    payrollRuns = [
      {
        id: "run-locked-01",
        companyId: companyA,
        month: "2026-05",
        status: "LOCKED",
        lines: [
          {
            id: "line-1",
            employeeId: "emp-ka-1",
            workingDays: 30,
            payableDays: 30,
            unpaidDays: 0,
            grossEarnings: 60000,
            breakdown: { PROFESSIONAL_TAX: 200 },
          },
          {
            id: "line-2",
            employeeId: "emp-mh-1",
            workingDays: 30,
            payableDays: 30,
            unpaidDays: 0,
            grossEarnings: 40000,
            breakdown: { PROFESSIONAL_TAX: 200 },
          },
        ],
      },
      {
        id: "run-draft-02",
        companyId: companyA,
        month: "2026-06",
        status: "DRAFT",
        lines: [],
      },
    ];
  };

  const createMockPrisma = () => {
    return {
      professionalTaxRegistration: {
        findMany: async ({ where }: any) => {
          return registrations.filter((r) => {
            if (where.companyId && r.companyId !== where.companyId) return false;
            if (where.stateCode && r.stateCode !== where.stateCode) return false;
            if (where.status && r.status !== where.status) return false;
            return true;
          });
        },
        findFirst: async ({ where }: any) => {
          return registrations.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          );
        },
        create: async ({ data }: any) => {
          const reg = { id: `reg-${Date.now()}-${Math.random()}`, ...data };
          registrations.push(reg);
          return reg;
        },
        update: async ({ where, data }: any) => {
          const idx = registrations.findIndex((r) => r.id === where.id);
          if (idx !== -1) {
            registrations[idx] = { ...registrations[idx], ...data };
            return registrations[idx];
          }
          return null;
        },
        delete: async ({ where }: any) => {
          const idx = registrations.findIndex((r) => r.id === where.id);
          if (idx !== -1) registrations.splice(idx, 1);
          return { id: where.id };
        },
      },
      statutoryFiling: {
        findMany: async ({ where }: any) => {
          return filings
            .filter((f) => {
              if (where.companyId && f.companyId !== where.companyId) return false;
              if (where.domain && f.domain !== where.domain) return false;
              if (where.stateCode && f.stateCode !== where.stateCode) return false;
              if (where.periodYear && f.periodYear !== where.periodYear) return false;
              if (where.periodMonth && f.periodMonth !== where.periodMonth) return false;
              return true;
            })
            .map((f) => {
              const ch = challans.find((c) => c.statutoryFilingId === f.id);
              return { ...f, ptChallan: ch || null };
            });
        },
        findFirst: async ({ where, include }: any) => {
          const f = filings.find((item) =>
            Object.entries(where).every(([k, v]) => item[k] === v),
          );
          if (!f) return null;
          const items = filingItems.filter((i) => i.filingId === f.id);
          const ch = challans.find((c) => c.statutoryFilingId === f.id);
          return { ...f, items, ptChallan: ch || null };
        },
        findUnique: async ({ where }: any) => {
          const f = filings.find((item) => item.id === where.id);
          if (!f) return null;
          const items = filingItems.filter((i) => i.filingId === f.id);
          const ch = challans.find((c) => c.statutoryFilingId === f.id);
          return { ...f, items, ptChallan: ch || null };
        },
        create: async ({ data }: any) => {
          const f = {
            id: `filing-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          filings.push(f);
          return f;
        },
        update: async ({ where, data }: any) => {
          const idx = filings.findIndex((f) => f.id === where.id);
          if (idx !== -1) {
            filings[idx] = { ...filings[idx], ...data, updatedAt: new Date() };
            return filings[idx];
          }
          return null;
        },
      },
      statutoryFilingItem: {
        create: async ({ data }: any) => {
          const item = { id: `item-${Date.now()}-${Math.random()}`, ...data };
          filingItems.push(item);
          return item;
        },
        deleteMany: async ({ where }: any) => {
          filingItems = filingItems.filter((i) => i.filingId !== where.filingId);
          return { count: 1 };
        },
      },
      ptChallan: {
        findMany: async ({ where }: any) => {
          return challans.filter((c) => {
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.stateCode && c.stateCode !== where.stateCode) return false;
            return true;
          });
        },
        findFirst: async ({ where }: any) => {
          const ch = challans.find((c) =>
            Object.entries(where).every(([k, v]) => c[k] === v),
          );
          if (!ch) return null;
          const f = filings.find((item) => item.id === ch.statutoryFilingId);
          return { ...ch, filing: f || null };
        },
        create: async ({ data }: any) => {
          const ch = { id: `challan-${Date.now()}-${Math.random()}`, ...data };
          challans.push(ch);
          return ch;
        },
        update: async ({ where, data }: any) => {
          const idx = challans.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            challans[idx] = { ...challans[idx], ...data, updatedAt: new Date() };
            return challans[idx];
          }
          return null;
        },
      },
      payrollRun: {
        findFirst: async ({ where }: any) => {
          return payrollRuns.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          );
        },
      },
      employee: {
        findMany: async ({ where }: any) => {
          return employees.filter((e) => {
            if (where.id?.in && !where.id.in.includes(e.id)) return false;
            if (where.companyId && e.companyId !== where.companyId) return false;
            return true;
          });
        },
      },
      employeeStatutoryProfile: {
        findMany: async ({ where }: any) => {
          return statutoryProfiles.filter((p) => {
            if (where.companyId && p.companyId !== where.companyId) return false;
            return true;
          });
        },
      },
      companySettings: {
        findUnique: async ({ where }: any) => {
          return companySettings.find((s) => s.companyId === where.companyId);
        },
      },
    };
  };

  const createTestApp = () => {
    const app = express();
    app.use(express.json());
    const mockPrisma = createMockPrisma();
    app.use("/api/v1", createComplianceRouter(mockPrisma as any, authMiddleware));
    return app;
  };

  beforeEach(() => {
    setupData();
    currentAuth = {
      id: makerUserId,
      companyId: companyA,
      role: "HR_MANAGER",
      permissions: [
        "compliance.pt.view",
        "compliance.pt.manage",
        "compliance.pt.approve",
        "compliance.pt.export",
      ],
    };
  });

  describe("1. PT Registrations", () => {
    it("creates an active PT-RC registration for Karnataka", async () => {
      const app = createTestApp();
      const res = await request(app)
        .post("/api/v1/compliance/pt/registrations")
        .send({
          stateCode: "KA",
          registrationType: "PT_RC",
          certificateNumber: "KA-PT-2026-9999",
          issuingAuthority: "Commercial Taxes Dept, Karnataka",
          effectiveFrom: "2026-04-01",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.certificateNumber).toBe("KA-PT-2026-9999");
      expect(res.body.data.stateCode).toBe("KA");
      expect(registrations.length).toBe(1);
    });

    it("rejects duplicate registration certificate for the same state", async () => {
      const app = createTestApp();
      registrations.push({
        id: "reg-1",
        companyId: companyA,
        stateCode: "KA",
        registrationType: "PT_RC",
        certificateNumber: "KA-PT-2026-9999",
      });

      const res = await request(app)
        .post("/api/v1/compliance/pt/registrations")
        .send({
          stateCode: "KA",
          registrationType: "PT_RC",
          certificateNumber: "KA-PT-2026-9999",
          effectiveFrom: "2026-04-01",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("DUPLICATE_REGISTRATION");
    });
  });

  describe("2. Filing Lifecycle & Maker/Checker Segregation of Duties", () => {
    it("rejects filing generation from an unfinalized/DRAFT payroll run", async () => {
      const app = createTestApp();
      const res = await request(app)
        .post("/api/v1/compliance/pt/filings/generate")
        .send({
          payrollRunId: "run-draft-02",
          stateCode: "KA",
          periodYear: 2026,
          periodMonth: 6,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PAYROLL_RUN_NOT_FINALIZED");
    });

    it("generates a DRAFT PT filing from a finalized payroll run for Karnataka", async () => {
      const app = createTestApp();
      const res = await request(app)
        .post("/api/v1/compliance/pt/filings/generate")
        .send({
          payrollRunId: "run-locked-01",
          stateCode: "KA",
          periodYear: 2026,
          periodMonth: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.stateCode).toBe("KA");
      expect(res.body.data.totalEmployees).toBe(1);
      expect(res.body.data.totalTaxDeducted).toBe(200);
      expect(res.body.data.status).toBe("DRAFT");
    });

    it("fails validation if no active PT registration exists for that state", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-ts",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "TS",
        totalTaxDeducted: 200,
        status: "DRAFT",
      });

      const res = await request(app).post("/api/v1/compliance/pt/filings/filing-ts/validate");
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("MISSING_PT_REGISTRATION");
    });

    it("enforces Maker/Checker SoD: Maker cannot approve their own filing", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-ka-01",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        totalTaxDeducted: 200,
        status: "PENDING_APPROVAL",
        createdById: makerUserId,
      });

      // Maker attempts to approve
      currentAuth.id = makerUserId;
      const failRes = await request(app).post("/api/v1/compliance/pt/filings/filing-ka-01/approve");
      expect(failRes.status).toBe(403);
      expect(failRes.body.error.code).toBe("MAKER_CHECKER_VIOLATION");

      // Checker approves -> succeeds
      currentAuth.id = checkerUserId;
      const successRes = await request(app).post("/api/v1/compliance/pt/filings/filing-ka-01/approve");
      expect(successRes.status).toBe(200);
      expect(successRes.body.data.status).toBe("APPROVED");
    });

    it("locks filing and applies cryptographic SHA-256 seal", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-app-01",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        periodYear: 2026,
        periodMonth: 5,
        totalEmployees: 1,
        totalTaxDeducted: 200,
        status: "APPROVED",
        createdById: makerUserId,
      });

      const res = await request(app).post("/api/v1/compliance/pt/filings/filing-app-01/lock");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("LOCKED");
      expect(res.body.data.sha256Checksum).toBeDefined();
      expect(res.body.data.sha256Checksum.length).toBe(64);
    });

    it("exports filing with the UNVERIFIED_PORTAL_SCHEMA banner", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-lock-01",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        periodYear: 2026,
        periodMonth: 5,
        totalEmployees: 1,
        totalGrossWages: 60000,
        totalTaxDeducted: 200,
        status: "LOCKED",
        sha256Checksum: "abcdef1234567890",
        createdById: makerUserId,
      });

      const res = await request(app).get("/api/v1/compliance/pt/filings/filing-lock-01/export?format=json");
      expect(res.status).toBe(200);
      expect(res.body.data.banner).toBe("UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY");
      expect(res.body.data.jurisdiction).toBe("KA");
      expect(res.body.data.totals.totalPtLiability).toBe(200);
    });
  });

  describe("3. Challans & Zero-Variance Reconciliation", () => {
    it("creates a 1:1 linked challan and rejects duplicate challan creation on the same filing", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-for-ch",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        periodYear: 2026,
        periodMonth: 5,
        totalEmployees: 1,
        totalTaxDeducted: 200,
        status: "LOCKED",
      });

      const res1 = await request(app)
        .post("/api/v1/compliance/pt/challans")
        .send({
          statutoryFilingId: "filing-for-ch",
          challanNumber: "CH-KA-2026-001",
          challanDate: "2026-06-15",
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.challanNumber).toBe("CH-KA-2026-001");
      expect(res1.body.data.totalAmount).toBe(200);

      // Attempt to create second challan on same filing -> 409
      const res2 = await request(app)
        .post("/api/v1/compliance/pt/challans")
        .send({
          statutoryFilingId: "filing-for-ch",
          challanNumber: "CH-KA-2026-002",
          challanDate: "2026-06-16",
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe("DUPLICATE_CHALLAN");
    });

    it("records bank payment and reconciles with zero variance", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-reconcile",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        totalTaxDeducted: 200,
      });
      challans.push({
        id: "ch-to-pay",
        companyId: companyA,
        statutoryFilingId: "filing-reconcile",
        challanNumber: "CH-001",
        totalAmount: 200,
        status: "CHALLAN_GENERATED",
      });

      // Record payment
      const payRes = await request(app)
        .post("/api/v1/compliance/pt/challans/ch-to-pay/record-payment")
        .send({
          paidDate: "2026-06-20",
          cinNumber: "02900012026062000001",
          bankReference: "HDFC987654",
        });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.status).toBe("PAID");

      // Reconcile
      const recRes = await request(app).post("/api/v1/compliance/pt/challans/ch-to-pay/reconcile");
      expect(recRes.status).toBe(200);
      expect(recRes.body.data.reconciled).toBe(true);
      expect(recRes.body.data.variance).toBe(0);
      expect(recRes.body.data.challan.status).toBe("RECONCILED");
    });

    it("rejects reconciliation when variance is non-zero", async () => {
      const app = createTestApp();
      filings.push({
        id: "filing-mismatch",
        companyId: companyA,
        domain: "PROFESSIONAL_TAX",
        stateCode: "KA",
        totalTaxDeducted: 300, // Mismatch with 200
      });
      challans.push({
        id: "ch-mismatch",
        companyId: companyA,
        statutoryFilingId: "filing-mismatch",
        challanNumber: "CH-002",
        totalAmount: 200,
        status: "PAID",
      });

      const recRes = await request(app).post("/api/v1/compliance/pt/challans/ch-mismatch/reconcile");
      expect(recRes.status).toBe(422);
      expect(recRes.body.error.code).toBe("RECONCILIATION_VARIANCE_NON_ZERO");
    });
  });
});
