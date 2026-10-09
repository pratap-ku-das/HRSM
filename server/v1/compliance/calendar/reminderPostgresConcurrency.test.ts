import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "../../../databaseUrl.js";
import { runComplianceReminders } from "../../reminders.js";

describe("PostgreSQL Real Multi-Connection Concurrency Integration Suite", () => {
  const rawUrl = process.env.DATABASE_URL;
  const databaseUrl = rawUrl ? normalizeDatabaseUrl(rawUrl) : undefined;

  let prisma1: PrismaClient | null = null;
  let prisma2: PrismaClient | null = null;
  let isDbAvailable = false;

  const testCompanyId = `test-co-concurrency-${Date.now()}`;
  const testUserId = `test-user-admin-${Date.now()}`;

  afterAll(async () => {
    if (prisma1 && isDbAvailable) {
      try {
        // Clean up test records
        await prisma1.notificationDelivery.deleteMany({ where: { companyId: testCompanyId } });
        await prisma1.notification.deleteMany({ where: { companyId: testCompanyId } });
        await prisma1.complianceCalendarObligation.deleteMany({ where: { companyId: testCompanyId } });
        await prisma1.user.deleteMany({ where: { id: testUserId } });
        await prisma1.company.deleteMany({ where: { id: testCompanyId } });
      } catch {
        // Ignore cleanup errors
      }
      await prisma1.$disconnect();
    }
    if (prisma2) {
      await prisma2.$disconnect();
    }
  });

  it("verifies live PostgreSQL connectivity or documents offline environment", async () => {
    if (!databaseUrl) {
      console.warn("[SKIPPED TEST] PostgreSQL DATABASE_URL is not set. Real DB concurrency test skipped.");
      return;
    }

    try {
      prisma1 = new PrismaClient({ datasourceUrl: databaseUrl });
      await prisma1.$queryRaw`SELECT 1`;
      isDbAvailable = true;
    } catch (err: unknown) {
      console.warn(
        `[SKIPPED TEST] PostgreSQL connection failed (${err instanceof Error ? err.message : "Unknown"}). Real DB concurrency test skipped.`
      );
      isDbAvailable = false;
      return;
    }

    expect(isDbAvailable).toBe(true);
  });

  it("executes two concurrent worker transactions on real PostgreSQL with advisory lock exclusion", async () => {
    if (!isDbAvailable || !prisma1 || !databaseUrl) {
      console.warn("[SKIPPED TEST] PostgreSQL database is not reachable. Skipping concurrent transaction execution.");
      return;
    }

    // 1. Setup seed data in live DB
    await prisma1.company.create({
      data: {
        id: testCompanyId,
        name: "Concurrency Test Corp",
        slug: `concurrency-test-${Date.now()}`,
        email: `concurrency-${Date.now()}@example.com`,
        industry: "Technology",
        size: "10-50",
      },
    });

    await prisma1.user.create({
      data: {
        id: testUserId,
        companyId: testCompanyId,
        email: `${testUserId}@example.com`,
        fullName: "Test Admin",
        role: "COMPANY_ADMIN",
      },
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    await prisma1.complianceCalendarObligation.create({
      data: {
        companyId: testCompanyId,
        domain: "EPF_ECR",
        obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
        statutoryDueDate: tomorrow,
        status: "DUE_SOON",
        periodYear: 2026,
        periodMonth: 9,
        jurisdiction: "IN",
        assignedUserId: testUserId,
      },
    });

    // 2. Spawn second independent Prisma connection to simulate independent container worker
    prisma2 = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma2.$connect();

    // 3. Fire both workers concurrently at the exact same millisecond
    const [result1, result2] = await Promise.all([
      runComplianceReminders(prisma1, testCompanyId),
      runComplianceReminders(prisma2, testCompanyId),
    ]);

    // 4. Assert mutual exclusion: Exactly one worker acquires lock, the other yields cleanly
    const results = [result1, result2];
    const lockHolder = results.find((r) => r.emitted >= 1);
    const lockedOutWorker = results.find((r) => (r as any).skippedLocked === true);

    expect(lockHolder).toBeDefined();
    expect(lockedOutWorker).toBeDefined();

    // 5. Verify database integrity: exactly one notification created in Notification table
    const notifications = await prisma1.notification.findMany({
      where: { companyId: testCompanyId },
    });
    expect(notifications.length).toBe(1);

    // 6. Verify transactional outbox: exact channel deliveries and duplicate idempotency key prevention
    const deliveries = await prisma1.notificationDelivery.findMany({
      where: { companyId: testCompanyId },
    });
    // Default external channels are 'EMAIL' and 'PUSH' (IN_APP has no external delivery row)
    expect(deliveries.length).toBe(2);
    expect(deliveries.map((d) => d.channel).sort()).toEqual(["EMAIL", "PUSH"]);
    expect(deliveries.map((d) => d.idempotencyKey).sort()).toEqual([
      `${notifications[0].id}:EMAIL`,
      `${notifications[0].id}:PUSH`,
    ]);

    // Verify duplicate outbox prevention: unique idempotencyKey prevents duplicates
    const duplicateInsert = await prisma1.notificationDelivery.createMany({
      data: deliveries.map((d) => ({
        companyId: testCompanyId,
        notificationId: d.notificationId,
        channel: d.channel,
        idempotencyKey: d.idempotencyKey,
      })),
      skipDuplicates: true,
    });
    expect(duplicateInsert.count).toBe(0);
    const countAfterDuplicate = await prisma1.notificationDelivery.count({
      where: { companyId: testCompanyId },
    });
    expect(countAfterDuplicate).toBe(2);

    // 7. Verify advisory lock release: after worker 1 commits, lock is immediately available
    const canAcquireNow = await prisma2.$transaction(async (tx) => {
      const check: any = await tx.$queryRawUnsafe(
        `SELECT pg_try_advisory_xact_lock(hashtext('compliance_reminders_' || $1)) as acquired`,
        testCompanyId
      );
      return Array.isArray(check) && check.length > 0 ? check[0].acquired : false;
    });
    expect(canAcquireNow).toBe(true);
  });

  it("verifies transactional rollback releases advisory lock and allows clean retry on real PostgreSQL", async () => {
    if (!isDbAvailable || !prisma1 || !prisma2) {
      console.warn("[SKIPPED TEST] PostgreSQL database is not reachable. Skipping rollback/retry test.");
      return;
    }

    const retryCompanyId = `test-co-rollback-${Date.now()}`;
    const retryUserId = `test-user-rollback-${Date.now()}`;

    await prisma1.company.create({
      data: {
        id: retryCompanyId,
        name: "Rollback Test Corp",
        slug: `rollback-test-${Date.now()}`,
        email: `rollback-${Date.now()}@example.com`,
        industry: "Technology",
        size: "10-50",
      },
    });

    await prisma1.user.create({
      data: {
        id: retryUserId,
        companyId: retryCompanyId,
        email: `${retryUserId}@example.com`,
        fullName: "Rollback Admin",
        role: "COMPANY_ADMIN",
      },
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const obl = await prisma1.complianceCalendarObligation.create({
      data: {
        companyId: retryCompanyId,
        domain: "ESIC_MONTHLY",
        obligationType: "MONTHLY_CONTRIBUTION_AND_RETURN",
        statutoryDueDate: tomorrow,
        status: "DUE_SOON",
        periodYear: 2026,
        periodMonth: 9,
        jurisdiction: "IN",
        assignedUserId: retryUserId,
      },
    });

    // 1. Simulate worker crash during transaction while holding advisory lock
    let errorCaught = false;
    try {
      await prisma1.$transaction(async (tx) => {
        const lock: any = await tx.$queryRawUnsafe(
          `SELECT pg_try_advisory_xact_lock(hashtext('compliance_reminders_' || $1)) as acquired`,
          retryCompanyId
        );
        expect(lock[0].acquired).toBe(true);

        // Mutate obligation inside uncommitted transaction
        await tx.complianceCalendarObligation.update({
          where: { id: obl.id },
          data: { remindedAt: new Date() },
        });

        // Crash before transaction commits
        throw new Error("SIMULATED_WORKER_CRASH_BEFORE_COMMIT");
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "SIMULATED_WORKER_CRASH_BEFORE_COMMIT") {
        errorCaught = true;
      }
    }
    expect(errorCaught).toBe(true);

    // 2. Verify PostgreSQL rolled back the uncommitted mutation: remindedAt must remain null
    const afterCrashObl = await prisma1.complianceCalendarObligation.findUnique({
      where: { id: obl.id },
    });
    expect(afterCrashObl?.remindedAt).toBeNull();

    // 3. Verify advisory lock was released by PostgreSQL upon rollback and retry worker succeeds
    const retryResult = await runComplianceReminders(prisma2, retryCompanyId);
    expect(retryResult.emitted).toBe(1);
    expect((retryResult as any).skippedLocked).toBeUndefined();

    // 4. Verify post-retry state in database: obligation was reminded with zero duplicates
    const finalObl = await prisma1.complianceCalendarObligation.findUnique({
      where: { id: obl.id },
    });
    expect(finalObl?.remindedAt).not.toBeNull();

    const finalNotifs = await prisma1.notification.findMany({
      where: { companyId: retryCompanyId },
    });
    expect(finalNotifs.length).toBe(1);

    const finalDeliveries = await prisma1.notificationDelivery.findMany({
      where: { companyId: retryCompanyId },
    });
    expect(finalDeliveries.length).toBe(2);

    // Clean up retry records
    await prisma1.notificationDelivery.deleteMany({ where: { companyId: retryCompanyId } });
    await prisma1.notification.deleteMany({ where: { companyId: retryCompanyId } });
    await prisma1.complianceCalendarObligation.deleteMany({ where: { companyId: retryCompanyId } });
    await prisma1.user.deleteMany({ where: { id: retryUserId } });
    await prisma1.company.deleteMany({ where: { id: retryCompanyId } });
  });
});
