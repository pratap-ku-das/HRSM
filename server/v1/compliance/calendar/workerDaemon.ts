import type { PrismaClient, ComplianceReminderJob } from "@prisma/client";
import { runComplianceReminders } from "../../reminders.js";

export interface WorkerDaemonConfig {
  workerId?: string;
  intervalMs?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  batchSize?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  shutdownTimeoutMs?: number;
}

export interface WorkerCycleResult {
  claimed: number;
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  errors?: string[];
}

export const DEFAULT_CONFIG: Required<WorkerDaemonConfig> = {
  workerId: `worker-${process.pid}-${Math.random().toString(36).substring(2, 8)}`,
  intervalMs: 60_000,
  leaseDurationMs: 120_000, // 2 minutes
  maxAttempts: 5,
  batchSize: 10,
  baseBackoffMs: 30_000,    // 30 seconds
  maxBackoffMs: 3_600_000,  // 1 hour
  shutdownTimeoutMs: 5_000, // 5 seconds
};

/**
 * Calculates deterministic bounded exponential backoff delay.
 * delay = min(baseMs * 2^(attempt - 1), maxMs)
 */
export function calculateExponentialBackoff(
  attemptCount: number,
  baseMs = DEFAULT_CONFIG.baseBackoffMs,
  maxMs = DEFAULT_CONFIG.maxBackoffMs,
): number {
  if (attemptCount <= 0) return 0;
  const factor = Math.pow(2, Math.min(attemptCount - 1, 30));
  const calculated = baseMs * factor;
  return Math.min(calculated, maxMs);
}

/**
 * Atomically claims eligible pending or expired-lease jobs using database transactions.
 * Prevents concurrent workers from claiming the same job.
 */
export async function claimPendingJobs(
  prisma: any,
  config: WorkerDaemonConfig = {},
  now = new Date(),
): Promise<ComplianceReminderJob[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const workerId = mergedConfig.workerId;
  const limit = mergedConfig.batchSize;
  const leaseExpiresAt = new Date(now.getTime() + mergedConfig.leaseDurationMs);

  if (!prisma.complianceReminderJob) {
    return [];
  }

  // 1. In PostgreSQL with raw query support: Use transaction with FOR UPDATE SKIP LOCKED
  if (typeof prisma.$transaction === "function" && typeof prisma.$queryRawUnsafe === "function") {
    try {
      return await prisma.$transaction(async (tx: any) => {
        // Query candidates with lock skipping, including expired-lease CLAIMED jobs
        const candidates: Array<{ id: string }> = await tx.$queryRawUnsafe(
          `SELECT id FROM "ComplianceReminderJob"
           WHERE (
             status IN ('PENDING', 'FAILED')
             OR (status = 'CLAIMED' AND "leaseExpiresAt" < $1)
           )
             AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= $1)
             AND ("lockedBy" IS NULL OR "leaseExpiresAt" < $1)
           ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED`,
          now,
          limit,
        );

        if (!Array.isArray(candidates) || candidates.length === 0) {
          return [];
        }

        const candidateIds = candidates.map((c) => c.id);
        const claimedJobs: ComplianceReminderJob[] = [];

        for (const id of candidateIds) {
          const updated = await tx.complianceReminderJob.update({
            where: { id },
            data: {
              status: "CLAIMED",
              lockedBy: workerId,
              lockedAt: now,
              leaseExpiresAt,
              attemptCount: { increment: 1 },
            },
          });
          claimedJobs.push(updated);
        }

        return claimedJobs;
      });
    } catch {
      // Fallback to atomic conditional update if raw query is unavailable or unsupported (e.g. SQLite / Mocks)
    }
  }

  // 2. Database-agnostic atomic claim fallback:
  // Find candidates that are pending/failed or have expired leases
  const candidates = await prisma.complianceReminderJob.findMany({
    where: {
      OR: [
        {
          status: { in: ["PENDING", "FAILED"] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          AND: [{ OR: [{ lockedBy: null }, { leaseExpiresAt: { lt: now } }] }],
        },
        {
          status: "CLAIMED",
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const claimedJobs: ComplianceReminderJob[] = [];

  for (const candidate of candidates) {
    // Atomic updateMany: exactly one worker will successfully update the row where lockedBy is still unleased
    const res = await prisma.complianceReminderJob.updateMany({
      where: {
        id: candidate.id,
        attemptCount: candidate.attemptCount,
        OR: [{ lockedBy: null }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: "CLAIMED",
        lockedBy: workerId,
        lockedAt: now,
        leaseExpiresAt,
        attemptCount: { increment: 1 },
      },
    });

    if (res.count > 0) {
      const refreshed = await prisma.complianceReminderJob.findUnique({
        where: { id: candidate.id },
      });
      if (refreshed) {
        claimedJobs.push(refreshed);
      }
    }
  }

  return claimedJobs;
}

/**
 * Scans obligations requiring reminders across companies and ensures jobs are queued.
 * Implements the atomic claim and ingestion pattern for compliance obligations.
 */
export async function claimPendingObligations(
  prisma: any,
  config: WorkerDaemonConfig = {},
  now = new Date(),
): Promise<ComplianceReminderJob[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const since = new Date(now.getTime() - 20 * 60 * 60_000); // 20 hours deduplication window

  if (!prisma.complianceCalendarObligation || !prisma.complianceReminderJob) {
    return [];
  }

  // 1. Find obligations that are currently due or overdue and not reminded recently
  const obligations = await prisma.complianceCalendarObligation.findMany({
    where: {
      status: { in: ["DUE_SOON", "DUE_TODAY", "OVERDUE"] },
      OR: [{ remindedAt: null }, { remindedAt: { lt: since } }],
    },
    take: mergedConfig.batchSize * 2,
  });

  for (const obl of obligations) {
    // Check if an active or pending job already exists for this obligation within this cycle
    const existingJob = await prisma.complianceReminderJob.findFirst({
      where: {
        companyId: obl.companyId,
        obligationId: obl.id,
        status: { in: ["PENDING", "CLAIMED"] },
      },
    });

    if (!existingJob) {
      await prisma.complianceReminderJob.create({
        data: {
          companyId: obl.companyId,
          obligationId: obl.id,
          jobType: "COMPLIANCE_REMINDER",
          status: "PENDING",
          attemptCount: 0,
          maxAttempts: mergedConfig.maxAttempts,
          nextAttemptAt: now,
        },
      });
    }
  }

  // Claim eligible pending jobs
  return claimPendingJobs(prisma, mergedConfig, now);
}

/**
 * Processes a single claimed compliance reminder job.
 * Enforces strict tenant isolation, idempotency, bounded retries, and dead-letter handling.
 */
export async function processJob(
  prisma: any,
  job: ComplianceReminderJob,
  config: WorkerDaemonConfig = {},
  now = new Date(),
): Promise<{ success: boolean; error?: string; deadLetter?: boolean }> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // 1. Validation & Tenant Isolation Checks
  if (!job.companyId || typeof job.companyId !== "string" || job.companyId.trim() === "") {
    await prisma.complianceReminderJob.update({
      where: { id: job.id },
      data: {
        status: "DEAD_LETTER",
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: "Malformed job: missing or invalid companyId",
      },
    });
    return { success: false, error: "Malformed job: missing companyId", deadLetter: true };
  }

  if (job.obligationId && prisma.complianceCalendarObligation) {
    const obligation = await prisma.complianceCalendarObligation.findUnique({
      where: { id: job.obligationId },
    });

    if (obligation && obligation.companyId !== job.companyId) {
      // Cross-tenant boundary violation: Fail-closed immediately!
      await prisma.complianceReminderJob.update({
        where: { id: job.id },
        data: {
          status: "DEAD_LETTER",
          lockedBy: null,
          leaseExpiresAt: null,
          lastError: `Tenant isolation violation: obligation ${job.obligationId} does not belong to company ${job.companyId}`,
        },
      });
      return { success: false, error: "Tenant isolation violation", deadLetter: true };
    }
  }

  // 2. Execute Reminder Dispatch
  try {
    // Invoke existing compliance reminder runner strictly scoped to this job's companyId
    await runComplianceReminders(prisma, job.companyId, now);

    // 3. Mark Job as Successfully Completed
    await prisma.complianceReminderJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isExhausted = job.attemptCount >= mergedConfig.maxAttempts;

    if (isExhausted) {
      // Terminal Failure -> DEAD_LETTER
      await prisma.complianceReminderJob.update({
        where: { id: job.id },
        data: {
          status: "DEAD_LETTER",
          lockedBy: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          lastError: `Exhausted all ${job.attemptCount} attempts: ${errorMessage}`,
        },
      });
      return { success: false, error: errorMessage, deadLetter: true };
    } else {
      // Bounded retry with exponential backoff
      const backoffMs = calculateExponentialBackoff(
        job.attemptCount,
        mergedConfig.baseBackoffMs,
        mergedConfig.maxBackoffMs,
      );
      const nextAttemptAt = new Date(now.getTime() + backoffMs);

      await prisma.complianceReminderJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lockedBy: null,
          leaseExpiresAt: null,
          nextAttemptAt,
          lastError: errorMessage,
        },
      });
      return { success: false, error: errorMessage, deadLetter: false };
    }
  }
}

/**
 * Runs a single cycle of the distributed worker daemon.
 */
export async function runWorkerCycle(
  prisma: any,
  config: WorkerDaemonConfig = {},
  now = new Date(),
): Promise<WorkerCycleResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;

  try {
    // Ingest and claim pending jobs
    let claimedJobs: ComplianceReminderJob[] = [];
    if (prisma.complianceCalendarObligation && prisma.complianceReminderJob) {
      claimedJobs = await claimPendingObligations(prisma, mergedConfig, now);
    } else if (prisma.complianceReminderJob) {
      claimedJobs = await claimPendingJobs(prisma, mergedConfig, now);
    }

    for (const job of claimedJobs) {
      const result = await processJob(prisma, job, mergedConfig, now);
      if (result.success) {
        succeeded++;
      } else if (result.deadLetter) {
        deadLettered++;
        if (result.error) errors.push(result.error);
      } else {
        failed++;
        if (result.error) errors.push(result.error);
      }
    }

    return {
      claimed: claimedJobs.length,
      processed: claimedJobs.length,
      succeeded,
      failed,
      deadLettered,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      claimed: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      deadLettered: 0,
      errors: [msg],
    };
  }
}

/**
 * Production-ready distributed compliance reminder worker daemon.
 * Prevents overlapping executions, handles graceful shutdown, and monitors job processing.
 */
export class ComplianceWorkerDaemon {
  private isRunning = false;
  private isStopping = false;
  private activeJobsCount = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly config: Required<WorkerDaemonConfig>;

  constructor(
    private readonly prisma: PrismaClient | any,
    config: WorkerDaemonConfig = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public getWorkerId(): string {
    return this.config.workerId;
  }

  public isHealthy(): boolean {
    return !this.isStopping;
  }

  public getActiveJobsCount(): number {
    return this.activeJobsCount;
  }

  /**
   * Starts the background scheduler loop.
   */
  public start(): void {
    if (this.timer) return;
    this.isStopping = false;

    // Trigger initial tick after a brief start delay
    const initialTimer = setTimeout(() => {
      void this.tick();
    }, 1_000);
    initialTimer.unref();

    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.intervalMs);
    this.timer.unref();

    console.log(
      `[WORKER_DAEMON] Started worker daemon '${this.config.workerId}' (interval: ${this.config.intervalMs}ms, lease: ${this.config.leaseDurationMs}ms).`,
    );
  }

  /**
   * Single scheduler execution tick.
   * Prevents overlapping executions within this instance.
   */
  public async tick(now = new Date()): Promise<WorkerCycleResult | null> {
    if (this.isStopping || this.isRunning) {
      return null;
    }

    this.isRunning = true;
    this.activeJobsCount++;

    try {
      const result = await runWorkerCycle(this.prisma, this.config, now);
      if (result.claimed > 0) {
        console.log(
          `[WORKER_DAEMON] Cycle completed by '${this.config.workerId}': claimed=${result.claimed}, succeeded=${result.succeeded}, failed=${result.failed}, deadLettered=${result.deadLettered}`,
        );
      }
      return result;
    } catch (err: unknown) {
      console.error(
        `[WORKER_DAEMON] Error during cycle in worker '${this.config.workerId}':`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    } finally {
      this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
      this.isRunning = false;
    }
  }

  /**
   * Gracefully shuts down the worker daemon.
   * Stops claiming new jobs and waits for in-flight jobs to complete within timeout.
   */
  public async stop(): Promise<void> {
    this.isStopping = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const startWait = Date.now();
    while (this.activeJobsCount > 0 && Date.now() - startWait < this.config.shutdownTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`[WORKER_DAEMON] Worker daemon '${this.config.workerId}' stopped cleanly.`);
  }
}

/**
 * Factory to instantiate and start the worker daemon.
 */
export function startComplianceWorkerDaemon(
  prisma: PrismaClient | any,
  config: WorkerDaemonConfig = {},
): ComplianceWorkerDaemon {
  const daemon = new ComplianceWorkerDaemon(prisma, config);
  daemon.start();
  return daemon;
}
