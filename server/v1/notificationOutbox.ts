import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface OutboxWorkerConfig {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface OutboxCycleResult {
  claimed: number;
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  skipped: number;
  errors?: string[];
}

export interface EnqueueOutboxInput {
  companyId: string;
  userId: string;
  eventKey: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  expiresAt?: Date;
  channels?: Array<"IN_APP" | "PUSH" | "EMAIL">;
  idempotencyKeyPrefix?: string;
}

export const DEFAULT_OUTBOX_CONFIG: Required<OutboxWorkerConfig> = {
  workerId: `outbox-worker-${process.pid}-${Math.random().toString(36).substring(2, 8)}`,
  batchSize: 50,
  leaseDurationMs: 60_000, // 1 minute lease
  maxAttempts: 5,
  baseBackoffMs: 30_000,    // 30 seconds
  maxBackoffMs: 3_600_000,  // 1 hour
};

/**
 * Calculates deterministic bounded exponential backoff delay.
 * delay = min(baseMs * 2^(attempt - 1), maxMs)
 */
export function calculateExponentialBackoff(
  attemptCount: number,
  baseMs = DEFAULT_OUTBOX_CONFIG.baseBackoffMs,
  maxMs = DEFAULT_OUTBOX_CONFIG.maxBackoffMs,
): number {
  if (attemptCount <= 0) return 0;
  const factor = Math.pow(2, Math.min(attemptCount - 1, 30));
  const calculated = baseMs * factor;
  return Math.min(calculated, maxMs);
}

/**
 * Enqueues a notification and its delivery outbox entries inside the active database transaction.
 * Guarantees that business mutations and outbox records commit atomically.
 */
export async function enqueueTransactionalNotification(
  tx: Db,
  input: EnqueueOutboxInput,
) {
  // 1. Verify recipient and tenant boundary inside the transaction
  const user = await tx.user.findFirst({
    where: { id: input.userId, companyId: input.companyId },
    select: { id: true },
  });
  if (!user) {
    throw Object.assign(
      new Error(`User ${input.userId} does not exist or does not belong to company ${input.companyId}.`),
      { status: 404, code: "USER_NOT_FOUND" },
    );
  }

  // 2. Resolve recipient preferences
  const targetChannels = input.channels || ["IN_APP", "PUSH", "EMAIL"];
  const preferences = tx.notificationPreference?.findMany
    ? await tx.notificationPreference.findMany({
        where: { userId: input.userId, eventKey: input.eventKey },
      })
    : [];

  const isEnabled = (ch: "IN_APP" | "PUSH" | "EMAIL") => {
    const pref = preferences.find((p: any) => p.channel === ch);
    return pref?.enabled ?? true;
  };

  const activeChannels = targetChannels.filter((ch) => isEnabled(ch));
  if (activeChannels.length === 0) {
    return { notification: null, deliveries: [] };
  }

  // 3. Create Notification record (user inbox) inside transaction
  const notification = await tx.notification.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      eventKey: input.eventKey,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      actionUrl: input.actionUrl,
      expiresAt: input.expiresAt,
    },
    select: { id: true, title: true, body: true, eventKey: true, entityType: true, entityId: true },
  });

  // 4. Create NotificationDelivery outbox entries for external dispatch
  const externalChannels = activeChannels.filter((ch) => ch !== "IN_APP");
  const deliveries: any[] = [];

  for (const channel of externalChannels) {
    const key = input.idempotencyKeyPrefix
      ? `${input.idempotencyKeyPrefix}:${channel}`
      : `${notification.id}:${channel}`;

    const delivery = await tx.notificationDelivery.create({
      data: {
        companyId: input.companyId,
        notificationId: notification.id,
        channel,
        status: "PENDING",
        idempotencyKey: key,
        attemptCount: 0,
        nextAttemptAt: new Date(),
      },
    });
    deliveries.push(delivery);
  }

  return { notification, deliveries };
}

/**
 * Claims pending or expired-lease delivery jobs from the outbox table.
 * Uses PostgreSQL FOR UPDATE SKIP LOCKED when supported, with safe atomic fallback.
 */
export async function claimOutboxDeliveries(
  prisma: any,
  config: OutboxWorkerConfig = {},
  now = new Date(),
): Promise<any[]> {
  const mergedConfig = { ...DEFAULT_OUTBOX_CONFIG, ...config };
  const limit = mergedConfig.batchSize;
  const leaseUntil = new Date(now.getTime() + mergedConfig.leaseDurationMs);

  if (!prisma.notificationDelivery) {
    return [];
  }

  // 1. PostgreSQL raw transaction with FOR UPDATE SKIP LOCKED
  if (typeof prisma.$transaction === "function" && typeof prisma.$queryRawUnsafe === "function") {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const candidates: Array<{ id: string }> = await tx.$queryRawUnsafe(
          `SELECT id FROM "NotificationDelivery"
           WHERE status IN ('PENDING', 'FAILED')
             AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= $1)
             AND "attemptCount" < $2
           ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
           LIMIT $3
           FOR UPDATE SKIP LOCKED`,
          now,
          mergedConfig.maxAttempts,
          limit,
        );

        if (!Array.isArray(candidates) || candidates.length === 0) {
          return [];
        }

        const candidateIds = candidates.map((c) => c.id);
        const claimed: any[] = [];

        for (const id of candidateIds) {
          const updated = await tx.notificationDelivery.update({
            where: { id },
            data: {
              attemptCount: { increment: 1 },
              nextAttemptAt: leaseUntil,
            },
            include: { notification: true },
          });
          claimed.push(updated);
        }

        return claimed;
      });
    } catch {
      // Fallback to database-agnostic atomic conditional updates
    }
  }

  // 2. Database-agnostic atomic conditional claim fallback
  const due = await prisma.notificationDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: mergedConfig.maxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    include: { notification: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const claimed: any[] = [];
  for (const item of due) {
    const res = await prisma.notificationDelivery.updateMany({
      where: {
        id: item.id,
        status: item.status,
        attemptCount: item.attemptCount,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        attemptCount: { increment: 1 },
        nextAttemptAt: leaseUntil,
      },
    });

    if (res.count > 0) {
      const refreshed = await prisma.notificationDelivery.findUnique({
        where: { id: item.id },
        include: { notification: true },
      });
      if (refreshed) {
        claimed.push(refreshed);
      }
    }
  }

  return claimed;
}

/**
 * Dispatches a single claimed push delivery to the messaging provider.
 * Implements bounded retries, exponential backoff, and terminal dead-lettering.
 */
export async function dispatchClaimedPushDelivery(
  prisma: any,
  delivery: any,
  messaging: any,
  config: OutboxWorkerConfig = {},
  now = new Date(),
): Promise<{ success: boolean; error?: string; deadLetter?: boolean; skipped?: boolean }> {
  const mergedConfig = { ...DEFAULT_OUTBOX_CONFIG, ...config };

  // 1. Validate tenant boundary: delivery must have valid companyId and recipient
  if (!delivery.companyId || !delivery.notification?.userId) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SKIPPED",
        lastError: "Invalid outbox payload: missing companyId or userId.",
        nextAttemptAt: null,
      },
    });
    return { success: false, error: "Missing companyId or userId", deadLetter: true };
  }

  // 2. Query active registered devices scoped strictly to this tenant and user
  const devices = await prisma.pushDevice.findMany({
    where: {
      companyId: delivery.companyId,
      userId: delivery.notification.userId,
      active: true,
    },
    select: { token: true, tokenHash: true },
    take: 50,
  });

  if (!devices.length) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SKIPPED",
        lastError: "No active device tokens found for recipient.",
        nextAttemptAt: null,
      },
    });
    return { success: false, error: "No active devices", skipped: true };
  }

  // 3. Dispatch to Provider with idempotency tag
  try {
    const notification = delivery.notification;
    const response = await messaging.sendEachForMulticast({
      tokens: devices.map((d: any) => d.token),
      notification: { title: notification.title, body: notification.body },
      data: {
        notificationId: notification.id,
        eventKey: notification.eventKey || "",
        entityType: notification.entityType || "",
        entityId: notification.entityId || "",
        actionUrl: notification.actionUrl || "/notifications",
      },
      android: {
        priority: "high",
        notification: {
          tag: delivery.idempotencyKey || notification.id,
        },
      },
    });

    if (response.successCount > 0) {
      const providerId = response.responses.find((r: any) => r.success)?.messageId || "sent";
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: now,
          providerId,
          lastError: null,
          nextAttemptAt: null,
        },
      });
      return { success: true };
    } else {
      const errMessage = response.responses.map((r: any) => r.error?.message).filter(Boolean).join("; ") || "Provider delivery failed";
      throw new Error(errMessage);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isExhausted = delivery.attemptCount >= mergedConfig.maxAttempts;

    if (isExhausted) {
      // Terminal dead-letter
      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SKIPPED",
          lastError: `Exhausted all ${delivery.attemptCount} attempts: ${errorMessage}`.slice(0, 1000),
          nextAttemptAt: null,
        },
      });
      return { success: false, error: errorMessage, deadLetter: true };
    } else {
      // Bounded retry with exponential backoff
      const delayMs = calculateExponentialBackoff(
        delivery.attemptCount,
        mergedConfig.baseBackoffMs,
        mergedConfig.maxBackoffMs,
      );
      const nextAttemptAt = new Date(now.getTime() + delayMs);

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          lastError: errorMessage.slice(0, 1000),
          nextAttemptAt,
        },
      });
      return { success: false, error: errorMessage, deadLetter: false };
    }
  }
}

/**
 * Executes a full outbox worker cycle.
 */
export async function runOutboxWorkerCycle(
  prisma: any,
  messaging: any,
  config: OutboxWorkerConfig = {},
  now = new Date(),
): Promise<OutboxCycleResult> {
  const mergedConfig = { ...DEFAULT_OUTBOX_CONFIG, ...config };
  const claimed = await claimOutboxDeliveries(prisma, mergedConfig, now);

  let succeeded = 0;
  let failed = 0;
  let deadLettered = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const delivery of claimed) {
    if (delivery.channel === "PUSH" && messaging) {
      const res = await dispatchClaimedPushDelivery(prisma, delivery, messaging, mergedConfig, now);
      if (res.success) {
        succeeded++;
      } else if (res.deadLetter) {
        deadLettered++;
        if (res.error) errors.push(res.error);
      } else if (res.skipped) {
        skipped++;
      } else {
        failed++;
        if (res.error) errors.push(res.error);
      }
    }
  }

  return {
    claimed: claimed.length,
    processed: succeeded + failed + deadLettered + skipped,
    succeeded,
    failed,
    deadLettered,
    skipped,
    errors: errors.length ? errors : undefined,
  };
}
