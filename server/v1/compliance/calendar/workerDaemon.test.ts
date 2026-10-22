import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  calculateExponentialBackoff,
  claimPendingJobs,
  claimPendingObligations,
  processJob,
  runWorkerCycle,
  ComplianceWorkerDaemon,
  startComplianceWorkerDaemon,
  DEFAULT_CONFIG,
} from "./workerDaemon.js";
import type { ComplianceReminderJob } from "@prisma/client";

describe("OrbitHR P2.11 Distributed Compliance Reminder Worker Daemon Suite", () => {
  const companyA = "company-alpha";
  const companyB = "company-beta";
  const now = new Date("2026-10-15T10:00:00Z");

  // Synthetic In-Memory Prisma Store simulating PostgreSQL table and transactional row-level semantics
  const createMockPrisma = (initialJobs: Partial<ComplianceReminderJob>[] = [], overrides: any = {}) => {
    let jobs: any[] = initialJobs.map((j, idx) => ({
      id: j.id || `job-${idx + 1}`,
      companyId: j.companyId !== undefined ? j.companyId : companyA,
      obligationId: j.obligationId || `obl-${idx + 1}`,
      jobType: j.jobType || "COMPLIANCE_REMINDER",
      status: j.status || "PENDING",
      attemptCount: j.attemptCount || 0,
      maxAttempts: j.maxAttempts || 5,
      nextAttemptAt: j.nextAttemptAt !== undefined ? j.nextAttemptAt : new Date(now.getTime() - 1000),
      lockedAt: j.lockedAt || null,
      lockedBy: j.lockedBy || null,
      leaseExpiresAt: j.leaseExpiresAt || null,
      lastError: j.lastError || null,
      payload: j.payload || null,
      completedAt: j.completedAt || null,
      createdAt: j.createdAt || now,
      updatedAt: j.updatedAt || now,
    }));

    const inFlightLocks = new Set<string>();
    let obligations: any[] = [];
    let notifications: any[] = [];
    let users: any[] = [
      { id: "admin-a", companyId: companyA, role: "COMPANY_ADMIN" },
      { id: "admin-b", companyId: companyB, role: "COMPANY_ADMIN" },
    ];

    const mockPrisma: any = {
      $transaction: async (arg: any) => {
        if (typeof arg === "function") {
          return arg(mockPrisma);
        }
        return Promise.all(arg);
      },
      $queryRawUnsafe: async (query: string, ...params: any[]) => {
        if (query.includes("FOR UPDATE SKIP LOCKED")) {
          // Simulate PostgreSQL FOR UPDATE SKIP LOCKED
          const currentTime = params[0] instanceof Date ? params[0] : now;
          const limit = typeof params[1] === "number" ? params[1] : 10;

          const candidates = jobs.filter((j) => {
            if (inFlightLocks.has(j.id)) return false; // Skipped locked by concurrent worker
            const isEligibleStatus =
              ["PENDING", "FAILED"].includes(j.status) ||
              (j.status === "CLAIMED" && j.leaseExpiresAt && j.leaseExpiresAt.getTime() < currentTime.getTime());
            const isDue = !j.nextAttemptAt || j.nextAttemptAt.getTime() <= currentTime.getTime();
            const isUnleased = !j.lockedBy || (j.leaseExpiresAt && j.leaseExpiresAt.getTime() < currentTime.getTime());
            return isEligibleStatus && isDue && isUnleased;
          }).slice(0, limit);

          for (const c of candidates) {
            inFlightLocks.add(c.id);
          }
          return candidates.map((c) => ({ id: c.id }));
        }
        return [];
      },
      complianceReminderJob: {
        findMany: vi.fn().mockImplementation(async ({ where, take }: any = {}) => {
          return jobs.filter((j) => {
            if (where?.status?.in && !where.status.in.includes(j.status)) return false;
            if (where?.companyId && j.companyId !== where.companyId) return false;
            if (where?.obligationId && j.obligationId !== where.obligationId) return false;
            return true;
          }).slice(0, take || jobs.length);
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return jobs.find((j) => j.id === where.id) || null;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return jobs.find((j) => {
            if (where?.id && j.id !== where.id) return false;
            if (where?.companyId && j.companyId !== where.companyId) return false;
            if (where?.obligationId && j.obligationId !== where.obligationId) return false;
            if (where?.status?.in && !where.status.in.includes(j.status)) return false;
            return true;
          }) || null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const idx = jobs.findIndex((j) => j.id === where.id);
          if (idx < 0) throw new Error("Job not found");
          const updated = {
            ...jobs[idx],
            ...data,
            attemptCount:
              data.attemptCount?.increment !== undefined
                ? jobs[idx].attemptCount + data.attemptCount.increment
                : data.attemptCount !== undefined
                ? data.attemptCount
                : jobs[idx].attemptCount,
            updatedAt: new Date(),
          };
          jobs[idx] = updated;
          return updated;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (let i = 0; i < jobs.length; i++) {
            const j = jobs[i];
            if (where.id && j.id !== where.id) continue;
            if (where.companyId && j.companyId !== where.companyId) continue;
            if (where.status && j.status !== where.status) continue;
            if (where.lockedBy && j.lockedBy !== where.lockedBy) continue;
            if (where.attemptCount !== undefined && j.attemptCount !== where.attemptCount) continue;

            // Lease checking condition: lockedBy is null or leaseExpiresAt < now
            if (where.OR) {
              const matchesOR = where.OR.some((cond: any) => {
                if (cond.status?.in && !cond.status.in.includes(j.status)) return false;
                if (cond.status && typeof cond.status === "string" && j.status !== cond.status) return false;
                if (cond.lockedBy === null && j.lockedBy === null) return true;
                if (cond.leaseExpiresAt?.lt && j.leaseExpiresAt && j.leaseExpiresAt.getTime() < cond.leaseExpiresAt.lt.getTime()) return true;
                if (cond.OR) {
                  return cond.OR.some((sub: any) => {
                    if (sub.lockedBy === null && j.lockedBy === null) return true;
                    if (sub.leaseExpiresAt?.lt && j.leaseExpiresAt && j.leaseExpiresAt.getTime() < sub.leaseExpiresAt.lt.getTime()) return true;
                    return false;
                  });
                }
                return false;
              });
              if (!matchesOR) continue;
            }

            jobs[i] = {
              ...j,
              ...data,
              attemptCount:
                data.attemptCount?.increment !== undefined
                  ? j.attemptCount + data.attemptCount.increment
                  : data.attemptCount !== undefined
                  ? data.attemptCount
                  : j.attemptCount,
              updatedAt: new Date(),
            };
            count++;
          }
          return { count };
        }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const item = {
            id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          jobs.push(item);
          return item;
        }),
      },
      complianceCalendarObligation: {
        findMany: vi.fn().mockImplementation(async () => obligations),
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          return obligations.find((o) => o.id === where.id) || null;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return (
            obligations.find((o) => {
              if (where?.id && o.id !== where.id) return false;
              if (where?.companyId && o.companyId !== where.companyId) return false;
              return true;
            }) || null
          );
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const idx = obligations.findIndex((o) => o.id === where.id);
          if (idx >= 0) {
            obligations[idx] = { ...obligations[idx], ...data, remindedAt: data.remindedAt || new Date() };
            return obligations[idx];
          }
          return null;
        }),
      },
      user: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          return users.filter((u) => {
            if (where?.companyId && u.companyId !== where.companyId) return false;
            return true;
          });
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return users.find((u) => {
            if (where?.id && u.id !== where.id) return false;
            if (where?.companyId && u.companyId !== where.companyId) return false;
            return true;
          }) || null;
        }),
      },
      notification: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          return notifications.find((n) => n.companyId === where.companyId && n.userId === where.userId && n.eventKey === where.eventKey) || null;
        }),
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          notifications.push(data);
          return { id: `notif-${notifications.length}`, ...data };
        }),
      },
      notificationDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      employeeDocument: { findMany: vi.fn().mockResolvedValue([]) },
      employee: { findMany: vi.fn().mockResolvedValue([]) },
      ...overrides,
    };

    return {
      mockPrisma,
      getJobs: () => jobs,
      setJobs: (newJobs: any[]) => { jobs = newJobs; },
      getNotifications: () => notifications,
      getObligations: () => obligations,
      setObligations: (newObls: any[]) => { obligations = newObls; },
    };
  };

  // ---------------------------------------------------------------------------
  // 1. Two Concurrent Workers Attempting to Claim the Same Job
  // ---------------------------------------------------------------------------
  describe("1. Two Concurrent Workers Attempting to Claim the Same Job", () => {
    it("guarantees mutual exclusion: exactly one worker claims the job, the second gets zero", async () => {
      const { mockPrisma, getJobs } = createMockPrisma([
        { id: "job-exclusive-1", companyId: companyA, status: "PENDING", attemptCount: 0 },
      ]);

      const workerAConfig = { workerId: "worker-inst-A", batchSize: 5 };
      const workerBConfig = { workerId: "worker-inst-B", batchSize: 5 };

      // Fire both workers concurrently
      const [claimedA, claimedB] = await Promise.all([
        claimPendingJobs(mockPrisma, workerAConfig, now),
        claimPendingJobs(mockPrisma, workerBConfig, now),
      ]);

      const allClaimed = [...claimedA, ...claimedB];
      expect(allClaimed.length).toBe(1);

      // Verify winning worker
      const winner = claimedA.length === 1 ? "worker-inst-A" : "worker-inst-B";
      const winningClaims = claimedA.length === 1 ? claimedA : claimedB;
      const loserClaims = claimedA.length === 1 ? claimedB : claimedA;

      expect(winningClaims.length).toBe(1);
      expect(loserClaims.length).toBe(0);
      expect(winningClaims[0].id).toBe("job-exclusive-1");

      const finalJob = getJobs()[0];
      expect(finalJob.status).toBe("CLAIMED");
      expect(finalJob.lockedBy).toBe(winner);
      expect(finalJob.attemptCount).toBe(1);
      expect(finalJob.leaseExpiresAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Atomic Claiming and Prevention of Duplicate Processing
  // ---------------------------------------------------------------------------
  describe("2. Atomic Claiming and Prevention of Duplicate Processing", () => {
    it("prevents any subsequent claim while an active lease is held", async () => {
      const { mockPrisma, getJobs } = createMockPrisma([
        {
          id: "job-leased-1",
          companyId: companyA,
          status: "CLAIMED",
          lockedBy: "worker-holder",
          leaseExpiresAt: new Date(now.getTime() + 60_000), // Active lease for 60s
          attemptCount: 1,
        },
      ]);

      const claimed = await claimPendingJobs(mockPrisma, { workerId: "worker-thief" }, now);
      expect(claimed.length).toBe(0);

      const job = getJobs()[0];
      expect(job.lockedBy).toBe("worker-holder");
      expect(job.status).toBe("CLAIMED");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Tenant Isolation Across Companies
  // ---------------------------------------------------------------------------
  describe("3. Tenant Isolation Across Companies", () => {
    it("delivers notifications strictly within company boundary", async () => {
      const { mockPrisma, setObligations, getNotifications } = createMockPrisma([
        { id: "job-tenant-a", companyId: companyA, obligationId: "obl-a", status: "CLAIMED", attemptCount: 1 },
      ]);

      setObligations([
        {
          id: "obl-a",
          companyId: companyA,
          domain: "EPF_ECR",
          obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
          status: "DUE_SOON",
          statutoryDueDate: new Date(now.getTime() + 2 * 86_400_000),
          assignedUserId: null,
        },
      ]);

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-tenant-a" } }))!;
      const result = await processJob(mockPrisma, job, {}, now);

      expect(result.success).toBe(true);
      const notifs = getNotifications();
      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs.every((n: any) => n.companyId === companyA)).toBe(true);
      expect(notifs.some((n: any) => n.companyId === companyB)).toBe(false);
    });

    it("fails closed when obligation company does not match job company", async () => {
      const { mockPrisma, setObligations, getJobs, getNotifications } = createMockPrisma([
        { id: "job-spoofed", companyId: companyA, obligationId: "obl-b", status: "CLAIMED", attemptCount: 1 },
      ]);

      // Obligation actually belongs to Company B, but job was forged with Company A!
      setObligations([
        {
          id: "obl-b",
          companyId: companyB,
          domain: "TDS_24Q",
          obligationType: "QUARTERLY_STATEMENT_24Q",
          status: "DUE_SOON",
          statutoryDueDate: new Date(now.getTime() + 2 * 86_400_000),
        },
      ]);

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-spoofed" } }))!;
      const result = await processJob(mockPrisma, job, {}, now);

      expect(result.success).toBe(false);
      expect(result.deadLetter).toBe(true);
      expect(getNotifications().length).toBe(0); // Zero cross-tenant notification leaks!

      const deadJob = getJobs()[0];
      expect(deadJob.status).toBe("DEAD_LETTER");
      expect(deadJob.lastError).toContain("Tenant isolation violation");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Retry Scheduling and Exponential Backoff
  // ---------------------------------------------------------------------------
  describe("4. Retry Scheduling and Exponential Backoff", () => {
    it("computes deterministic exponential backoff bounded by maxBackoff", () => {
      const baseMs = 10_000;
      const maxMs = 60_000;

      expect(calculateExponentialBackoff(1, baseMs, maxMs)).toBe(10_000); // 10s * 2^0
      expect(calculateExponentialBackoff(2, baseMs, maxMs)).toBe(20_000); // 10s * 2^1
      expect(calculateExponentialBackoff(3, baseMs, maxMs)).toBe(40_000); // 10s * 2^2
      expect(calculateExponentialBackoff(4, baseMs, maxMs)).toBe(60_000); // Capped at maxMs (60s)
      expect(calculateExponentialBackoff(5, baseMs, maxMs)).toBe(60_000); // Capped at maxMs (60s)
    });

    it("schedules next attempt with exponential delay on transient failure", async () => {
      const { mockPrisma, getJobs } = createMockPrisma(
        [{ id: "job-retry-1", companyId: companyA, status: "CLAIMED", attemptCount: 2, maxAttempts: 5 }],
        {
          employeeDocument: {
            findMany: vi.fn().mockRejectedValue(new Error("Transient connection error")),
          },
        },
      );

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-retry-1" } }))!;
      const result = await processJob(mockPrisma, job, { baseBackoffMs: 15_000 }, now);

      expect(result.success).toBe(false);
      expect(result.deadLetter).toBe(false);

      const updatedJob = getJobs()[0];
      expect(updatedJob.status).toBe("FAILED");
      expect(updatedJob.lockedBy).toBeNull();
      // attemptCount is 2 -> delay = 15000 * 2^(2 - 1) = 30000ms
      const expectedTime = new Date(now.getTime() + 30_000);
      expect(updatedJob.nextAttemptAt.getTime()).toBe(expectedTime.getTime());
      expect(updatedJob.lastError).toBe("Transient connection error");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Maximum Retry Count and Terminal Failure
  // ---------------------------------------------------------------------------
  describe("5. Maximum Retry Count and Terminal Failure", () => {
    it("transitions job to DEAD_LETTER when maximum attempt count is reached", async () => {
      const { mockPrisma, getJobs } = createMockPrisma(
        [{ id: "job-exhausted", companyId: companyA, status: "CLAIMED", attemptCount: 5, maxAttempts: 5 }],
        {
          employeeDocument: {
            findMany: vi.fn().mockRejectedValue(new Error("Permanent database failure")),
          },
        },
      );

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-exhausted" } }))!;
      const result = await processJob(mockPrisma, job, { maxAttempts: 5 }, now);

      expect(result.success).toBe(false);
      expect(result.deadLetter).toBe(true);

      const updatedJob = getJobs()[0];
      expect(updatedJob.status).toBe("DEAD_LETTER");
      expect(updatedJob.nextAttemptAt).toBeNull();
      expect(updatedJob.lastError).toContain("Exhausted all 5 attempts");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Worker Restart and Expired-Lease Recovery
  // ---------------------------------------------------------------------------
  describe("6. Worker Restart and Expired-Lease Recovery", () => {
    it("automatically reclaims and processes jobs whose leases expired due to worker crash", async () => {
      const crashedTime = new Date(now.getTime() - 200_000);
      const expiredLeaseTime = new Date(now.getTime() - 50_000); // Expired 50s ago

      const { mockPrisma, getJobs } = createMockPrisma([
        {
          id: "job-orphaned-by-crash",
          companyId: companyA,
          status: "CLAIMED",
          lockedBy: "dead-worker-pid-9999",
          lockedAt: crashedTime,
          leaseExpiresAt: expiredLeaseTime,
          attemptCount: 1,
        },
      ]);

      const survivorConfig = { workerId: "survivor-worker", leaseDurationMs: 120_000 };
      const claimed = await claimPendingJobs(mockPrisma, survivorConfig, now);

      expect(claimed.length).toBe(1);
      expect(claimed[0].id).toBe("job-orphaned-by-crash");

      const refreshedJob = getJobs()[0];
      expect(refreshedJob.lockedBy).toBe("survivor-worker");
      expect(refreshedJob.attemptCount).toBe(2);
      expect(refreshedJob.leaseExpiresAt.getTime()).toBe(now.getTime() + 120_000);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Idempotency When Notification Delivery Succeeds But Job Completion Fails
  // ---------------------------------------------------------------------------
  describe("7. Idempotency When Notification Delivery Succeeds But Job Completion Fails", () => {
    it("does not re-emit duplicate notifications when retrying after a database update glitch", async () => {
      let updateCallCount = 0;
      const { mockPrisma, setObligations, getNotifications } = createMockPrisma([
        { id: "job-idempotent", companyId: companyA, obligationId: "obl-idem", status: "CLAIMED", attemptCount: 1 },
      ]);

      setObligations([
        {
          id: "obl-idem",
          companyId: companyA,
          domain: "ESIC_MONTHLY",
          obligationType: "MONTHLY_CONTRIBUTION_AND_RETURN",
          status: "DUE_SOON",
          statutoryDueDate: new Date(now.getTime() + 2 * 86_400_000),
          assignedUserId: null,
          remindedAt: null,
        },
      ]);

      // Override update to fail once when completing the job
      const originalUpdate = mockPrisma.complianceReminderJob.update;
      mockPrisma.complianceReminderJob.update = vi.fn().mockImplementation(async (args: any) => {
        if (args.data.status === "COMPLETED" && updateCallCount === 0) {
          updateCallCount++;
          throw new Error("Simulated transient DB error during COMPLETED update");
        }
        return originalUpdate(args);
      });

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-idempotent" } }))!;

      // 1. First execution: notifications are dispatched, but completion update fails
      const res1 = await processJob(mockPrisma, job, {}, now);
      expect(res1.success).toBe(false);
      const notificationsAfterFirstRun = getNotifications().length;
      expect(notificationsAfterFirstRun).toBe(1);

      // 2. Retry execution in next cycle
      const retryingJob = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-idempotent" } }))!;
      const res2 = await processJob(mockPrisma, retryingJob, {}, now);
      expect(res2.success).toBe(true);

      // 3. Assert zero duplicate notifications were created!
      expect(getNotifications().length).toBe(notificationsAfterFirstRun);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Graceful Shutdown and Prevention of Overlapping Execution
  // ---------------------------------------------------------------------------
  describe("8. Graceful Shutdown and Prevention of Overlapping Execution", () => {
    it("skips execution tick if previous tick is currently in flight", async () => {
      const { mockPrisma } = createMockPrisma();
      const daemon = new ComplianceWorkerDaemon(mockPrisma, { intervalMs: 10_000 });

      // Start a tick that takes some time
      let resolveSlowQuery: any;
      const slowPromise = new Promise((resolve) => { resolveSlowQuery = resolve; });
      mockPrisma.complianceReminderJob.findMany = vi.fn().mockImplementation(async () => {
        await slowPromise;
        return [];
      });

      const tick1Promise = daemon.tick(now);
      // Attempt overlapping tick while tick1 is in flight
      const tick2Result = await daemon.tick(now);
      expect(tick2Result).toBeNull(); // Cleanly yielded!

      resolveSlowQuery();
      await tick1Promise;
    });

    it("stops cleanly on graceful shutdown and stops accepting new work", async () => {
      const { mockPrisma } = createMockPrisma();
      const daemon = startComplianceWorkerDaemon(mockPrisma, { intervalMs: 50_000 });

      expect(daemon.isHealthy()).toBe(true);
      await daemon.stop();
      expect(daemon.isHealthy()).toBe(false);

      const tickAfterStop = await daemon.tick(now);
      expect(tickAfterStop).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Empty Queues, Malformed Jobs, and Transient Database Failures
  // ---------------------------------------------------------------------------
  describe("9. Empty Queues, Malformed Jobs, and Transient Database Failures", () => {
    it("returns clean zero metrics on empty queue", async () => {
      const { mockPrisma } = createMockPrisma([]);
      const result = await runWorkerCycle(mockPrisma, {}, now);

      expect(result.claimed).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.deadLettered).toBe(0);
      expect(result.errors).toBeUndefined();
    });

    it("quarantines malformed job missing companyId to DEAD_LETTER without crashing", async () => {
      const { mockPrisma, getJobs } = createMockPrisma([
        { id: "job-corrupt-no-company", companyId: "", status: "CLAIMED", attemptCount: 1 },
      ]);

      const job = (await mockPrisma.complianceReminderJob.findUnique({ where: { id: "job-corrupt-no-company" } }))!;
      const result = await processJob(mockPrisma, job, {}, now);

      expect(result.success).toBe(false);
      expect(result.deadLetter).toBe(true);

      const updated = getJobs()[0];
      expect(updated.status).toBe("DEAD_LETTER");
      expect(updated.lastError).toContain("missing or invalid companyId");
    });

    it("handles transient database connection failure gracefully during cycle", async () => {
      const { mockPrisma } = createMockPrisma([], {
        complianceCalendarObligation: {
          findMany: vi.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection reset by peer")),
        },
      });

      const result = await runWorkerCycle(mockPrisma, {}, now);
      expect(result.claimed).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain("ETIMEDOUT");
    });
  });
});
