import { describe, expect, it, beforeEach } from "vitest";
import { deriveObligationStatus } from "./syncService.js";
import { ComplianceWorkerDaemon } from "./workerDaemon.js";
import type { StatutoryFilingStatus } from "@prisma/client";

describe("OrbitHR P2.11 Statutory Compliance Lifecycle End-to-End Suite", () => {
  const companyAlpha = "comp-e2e-alpha-001";
  const companyBeta = "comp-e2e-beta-002";
  const makerUserId = "user-maker-101";
  const checkerUserId = "user-checker-202";

  const baseDueDate = new Date("2026-11-15T00:00:00Z");

  function buildSyntheticFiling(status: StatutoryFilingStatus, overrides: any = {}) {
    return {
      id: "filing-synth-1",
      companyId: companyAlpha,
      periodYear: 2026,
      periodMonth: 10,
      filingType: "ORIGINAL",
      status,
      filingReceiptDate: null,
      acknowledgementNumber: null,
      tokenNumberPrn: null,
      totalGrossAmount: 150000,
      totalEmployeeContribution: 18000,
      totalEmployerContribution: 18000,
      challanUrl: null,
      rawPayloadUrl: null,
      filingArtifacts: null,
      rejectionReason: null,
      createdById: makerUserId,
      approvedById: null,
      approvedAt: null,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      updatedAt: new Date("2026-11-01T00:00:00Z"),
      ptChallan: null,
      epfChallans: [],
      esicChallans: [],
      challans: [],
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Obligation Status Lifecycle Progression & Maker-Checker Fidelity
  // ---------------------------------------------------------------------------
  describe("1. Statutory Obligation Status Lifecycle & Maker-Checker Progression", () => {
    it("Step 1: Obligation starts UPCOMING when lead time > 7 days and unfiled", () => {
      const filing = buildSyntheticFiling("DRAFT");
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-01T00:00:00Z"),
        filing,
      });
      expect(status).toBe("UPCOMING");
    });

    it("Step 2: Enters DUE_SOON within 7 days, maintaining internal non-FILED status", () => {
      const filing = buildSyntheticFiling("VALIDATED");
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-10T00:00:00Z"), // 5 days before due
        filing,
      });
      expect(status).toBe("DUE_SOON");
    });

    it("Step 3: Maker submits for approval (PENDING_APPROVAL); status remains DUE_SOON (never premature FILED)", () => {
      const filing = buildSyntheticFiling("PENDING_APPROVAL");
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-12T00:00:00Z"),
        filing,
      });
      expect(status).toBe("DUE_SOON");
    });

    it("Step 4: Checker rejects filing; status transitions immediately to NEEDS_REVIEW", () => {
      const filing = buildSyntheticFiling("DRAFT", {
        rejectionReason: "Challan amount does not match calculated employee deductions.",
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-12T12:00:00Z"),
        filing,
      });
      expect(status).toBe("NEEDS_REVIEW");
    });

    it("Step 5: Maker corrects, Checker approves, and Challan is paid; status transitions to PAID", () => {
      const filing = buildSyntheticFiling("APPROVED", {
        approvedById: checkerUserId,
        approvedAt: new Date("2026-11-13T09:00:00Z"),
        epfChallans: [
          {
            id: "epf-ch-1",
            status: "RECONCILED",
            trrnNumber: null, // Reconciled before TRRN submission
            totalAmount: 36000,
          },
        ],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-13T10:00:00Z"),
        filing,
      });
      expect(status).toBe("PAID");
    });

    it("Step 6: Return submitted to government portal; status transitions to COMPLETED", () => {
      const filing = buildSyntheticFiling("EXPORTED", {
        acknowledgementNumber: "ACK-EPF-2026-11-00123",
        filingReceiptDate: new Date("2026-11-14T15:00:00Z"),
        epfChallans: [
          {
            id: "epf-ch-1",
            status: "RECONCILED",
            trrnNumber: "TRRN-99887766",
          },
        ],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-11-14T16:00:00Z"),
        filing,
      });
      expect(status).toBe("COMPLETED");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Distributed Worker Daemon & Queue Processing
  // ---------------------------------------------------------------------------
  describe("2. Distributed Worker Claiming, Execution & Retry Scheduling", () => {
    let mockJobs: any[] = [];
    let mockObligations: any[] = [];

    const mockPrisma: any = {
      $transaction: async (cb: any) => cb(mockPrisma),
      $queryRaw: async () => {
        // Force fallback branch for deterministic unit assertions
        throw new Error("RAW_SQL_MOCK_FALLBACK");
      },
      complianceReminderJob: {
        findMany: async () => mockJobs,
        findUnique: async ({ where }: any) => mockJobs.find((j) => j.id === where.id) || null,
        findFirst: async ({ where }: any) => {
          return (
            mockJobs.find((j) => {
              if (where?.id && j.id !== where.id) return false;
              if (where?.companyId && j.companyId !== where.companyId) return false;
              if (where?.obligationId && j.obligationId !== where.obligationId) return false;
              if (where?.status?.in && !where.status.in.includes(j.status)) return false;
              if (where?.status && typeof where.status === "string" && j.status !== where.status) return false;
              if (where?.nextAttemptAt?.lte && j.nextAttemptAt > where.nextAttemptAt.lte) return false;
              return true;
            }) || null
          );
        },
        updateMany: async ({ where, data }: any) => {
          const job = mockJobs.find((j) => j.id === where.id);
          if (!job) return { count: 0 };
          if (where.attemptCount !== undefined && job.attemptCount !== where.attemptCount) return { count: 0 };
          if (where.status !== undefined && job.status !== where.status) return { count: 0 };

          Object.assign(job, {
            ...data,
            attemptCount:
              data.attemptCount?.increment !== undefined
                ? job.attemptCount + data.attemptCount.increment
                : (data.attemptCount ?? job.attemptCount),
          });
          return { count: 1 };
        },
        update: async ({ where, data }: any) => {
          const job = mockJobs.find((j) => j.id === where.id);
          if (!job) throw new Error("Job not found");
          Object.assign(job, {
            ...data,
            attemptCount:
              data.attemptCount?.increment !== undefined
                ? job.attemptCount + data.attemptCount.increment
                : (data.attemptCount ?? job.attemptCount),
          });
          return job;
        },
        create: async ({ data }: any) => {
          const job = { id: `job-${mockJobs.length + 1}`, ...data };
          mockJobs.push(job);
          return job;
        },
      },
      complianceCalendarObligation: {
        findMany: async ({ where }: any = {}) => {
          return mockObligations.filter((o) => {
            if (where?.status?.in && !where.status.in.includes(o.status)) return false;
            if (where?.companyId && o.companyId !== where.companyId) return false;
            if (where?.remindedAt === null && o.remindedAt !== null) return false;
            if (where?.OR) {
              const matched = where.OR.some((cond: any) => {
                if (cond.remindedAt === null && !o.remindedAt) return true;
                if (cond.remindedAt?.lt && o.remindedAt && o.remindedAt < cond.remindedAt.lt) return true;
                return false;
              });
              if (!matched) return false;
            }
            return true;
          });
        },
        findUnique: async ({ where }: any) => mockObligations.find((o) => o.id === where.id) || null,
        findFirst: async ({ where }: any) => {
          return (
            mockObligations.find((o) => {
              if (where?.id && o.id !== where.id) return false;
              if (where?.companyId && o.companyId !== where.companyId) return false;
              return true;
            }) || null
          );
        },
        update: async ({ where, data }: any) => {
          const o = mockObligations.find((x) => x.id === where.id);
          if (o) Object.assign(o, data);
          return o;
        },
      },
      user: {
        findMany: async ({ where }: any) => [
          { id: "admin-1", companyId: where?.companyId || companyAlpha, role: "COMPANY_ADMIN" },
        ],
        findFirst: async ({ where }: any) => ({
          id: where?.id || "admin-1",
          companyId: where?.companyId || companyAlpha,
          role: "COMPANY_ADMIN",
        }),
      },
      notification: {
        create: async ({ data }: any) => ({ id: "notif-1", ...data }),
        findFirst: async () => null,
      },
      notificationPreference: { findMany: async () => [] },
      notificationDelivery: { createMany: async () => ({ count: 1 }) },
      employeeDocument: { findMany: async () => [] },
      employee: { findMany: async () => [] },
    };

    beforeEach(() => {
      mockJobs = [];
      mockObligations = [];
    });

    it("atomically claims pending job, increments attemptCount, and marks COMPLETED on success", async () => {
      const obligationId = "ob-synth-1";
      mockObligations.push({
        id: obligationId,
        companyId: companyAlpha,
        status: "DUE_SOON",
        statutoryDueDate: baseDueDate,
        remindedAt: new Date(),
      });

      mockJobs.push({
        id: "job-1",
        companyId: companyAlpha,
        obligationId,
        jobType: "COMPLIANCE_REMINDER",
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(Date.now() - 1000),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: null,
      });

      const daemon = new ComplianceWorkerDaemon(mockPrisma, {
        intervalMs: 50000,
        leaseDurationMs: 60000,
        maxAttempts: 5,
      });

      const cycle = await daemon.tick();
      expect(cycle).not.toBeNull();
      expect(cycle!.claimed).toBe(1);
      expect(cycle!.succeeded).toBe(1);
      expect(cycle!.failed).toBe(0);

      const completedJob = mockJobs.find((j) => j.id === "job-1");
      expect(completedJob?.status).toBe("COMPLETED");
      expect(completedJob?.attemptCount).toBe(1);
      expect(completedJob?.lockedBy).toBeNull();
    });

    it("enforces tenant boundary check: cross-tenant forged jobs immediately DEAD_LETTER", async () => {
      // Obligation belongs to companyAlpha, but job claims companyBeta
      mockObligations.push({
        id: "ob-isolated-1",
        companyId: companyAlpha,
        status: "DUE_SOON",
        remindedAt: new Date(),
      });

      mockJobs.push({
        id: "job-forged-1",
        companyId: companyBeta,
        obligationId: "ob-isolated-1",
        jobType: "COMPLIANCE_REMINDER",
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(Date.now() - 1000),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
      });

      const daemon = new ComplianceWorkerDaemon(mockPrisma, {
        intervalMs: 50000,
        leaseDurationMs: 60000,
        maxAttempts: 5,
      });

      const cycle = await daemon.tick();
      expect(cycle).not.toBeNull();
      expect(cycle!.claimed).toBe(1);
      expect(cycle!.deadLettered).toBe(1);

      const deadLetterJob = mockJobs.find((j) => j.id === "job-forged-1");
      expect(deadLetterJob?.status).toBe("DEAD_LETTER");
      expect(deadLetterJob?.nextAttemptAt).toBeNull();
      expect(deadLetterJob?.lastError).toContain("Tenant isolation violation");
    });
  });
});
