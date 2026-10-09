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

    // 6. Verify transactional outbox: notification delivery created idempotently
    const deliveries = await prisma1.notificationDelivery.findMany({
      where: { companyId: testCompanyId },
    });
    // Notification deliveries generated for enabled channels
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
  });
});
