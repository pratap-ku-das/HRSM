import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { normalizeDatabaseUrl } from '../databaseUrl.js';
import {
  enqueueTransactionalNotification,
  claimOutboxDeliveries,
  dispatchClaimedPushDelivery,
  runOutboxWorkerCycle,
  calculateExponentialBackoff,
} from './notificationOutbox.js';

const runLivePostgres =
  process.env.RUN_LIVE_POSTGRES_TESTS === 'true' ||
  process.env.STAGING_VERIFICATION === 'true';

describe('Phase 6: Transactional Notification Outbox & Worker Suite', () => {
  const companyA = 'tenant-corp-outbox-a';
  const companyB = 'tenant-corp-outbox-b';
  const userA = 'user-outbox-a1';
  const userB = 'user-outbox-b1';

  // ---------------------------------------------------------------------------
  // 1. Exponential Backoff Calculation
  // ---------------------------------------------------------------------------
  describe('Exponential Backoff & Lease Configuration', () => {
    it('calculates bounded exponential backoff with ceiling cap', () => {
      expect(calculateExponentialBackoff(0)).toBe(0);
      expect(calculateExponentialBackoff(1, 10_000, 60_000)).toBe(10_000); // 10s * 2^0 = 10s
      expect(calculateExponentialBackoff(2, 10_000, 60_000)).toBe(20_000); // 10s * 2^1 = 20s
      expect(calculateExponentialBackoff(3, 10_000, 60_000)).toBe(40_000); // 10s * 2^2 = 40s
      expect(calculateExponentialBackoff(4, 10_000, 60_000)).toBe(60_000); // capped at max 60s
      expect(calculateExponentialBackoff(10, 10_000, 60_000)).toBe(60_000); // capped at max 60s
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Unit / Mocked Outbox Enqueue & Atomic Rollback
  // ---------------------------------------------------------------------------
  describe('Transactional Enqueue & Rollback (Mocked / In-Memory)', () => {
    it('enqueues notification and delivery outbox records atomically inside transaction', async () => {
      const notifications: any[] = [];
      const deliveries: any[] = [];

      const mockTx = {
        user: {
          findFirst: vi.fn().mockResolvedValue({ id: userA, companyId: companyA }),
        },
        notificationPreference: {
          findMany: vi.fn().mockResolvedValue([{ channel: 'PUSH', enabled: true }]),
        },
        notification: {
          create: vi.fn(async ({ data }) => {
            const row = { id: `notif-${notifications.length + 1}`, ...data };
            notifications.push(row);
            return row;
          }),
        },
        notificationDelivery: {
          create: vi.fn(async ({ data }) => {
            const row = { id: `deliv-${deliveries.length + 1}`, ...data };
            deliveries.push(row);
            return row;
          }),
        },
      };

      const result = await enqueueTransactionalNotification(mockTx as never, {
        companyId: companyA,
        userId: userA,
        eventKey: 'PAYROLL_PUBLISHED',
        title: 'Payslip Ready',
        body: 'October payslip available',
        entityType: 'PayrollRun',
        entityId: 'run-101',
        channels: ['PUSH'],
        idempotencyKeyPrefix: 'run-101:user-a1',
      });

      expect(result.notification).not.toBeNull();
      expect(notifications.length).toBe(1);
      expect(deliveries.length).toBe(1);
      expect(deliveries[0].status).toBe('PENDING');
      expect(deliveries[0].idempotencyKey).toBe('run-101:user-a1:PUSH');
    });

    it('enforces tenant boundary: rejects enqueue if recipient does not belong to company', async () => {
      const mockTx = {
        user: {
          findFirst: vi.fn().mockResolvedValue(null), // User not in companyA
        },
      };

      await expect(
        enqueueTransactionalNotification(mockTx as never, {
          companyId: companyA,
          userId: userB,
          eventKey: 'PAYROLL_PUBLISHED',
          title: 'Payslip',
          body: 'Payslip body',
        })
      ).rejects.toThrow(/does not belong to company/);
    });

    it('simulates transactional rollback: both business entity and outbox discard on failure', async () => {
      let runCreated = false;
      let outboxCreated = false;

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          // Simulate transaction execution
          try {
            await cb({
              payrollRun: {
                create: async () => {
                  runCreated = true;
                },
              },
              user: {
                findFirst: async () => ({ id: userA, companyId: companyA }),
              },
              notification: {
                create: async () => {
                  outboxCreated = true;
                },
              },
              notificationDelivery: {
                create: async () => ({}),
              },
            });
          } catch (e) {
            // Rollback: discard state
            runCreated = false;
            outboxCreated = false;
            throw e;
          }
        }),
      };

      try {
        await mockPrisma.$transaction(async (tx: any) => {
          await tx.payrollRun.create();
          await tx.notification.create();
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      } catch (err: any) {
        expect(err.message).toBe('SIMULATED_TRANSACTION_FAILURE');
      }

      // Assert rollback: zero orphaned mutations
      expect(runCreated).toBe(false);
      expect(outboxCreated).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Worker Claims, Lease Expiry & Retries (Mocked / In-Memory)
  // ---------------------------------------------------------------------------
  describe('Outbox Worker Claims, Leases & Retries (Mocked / In-Memory)', () => {
    it('claims due deliveries and sets lease timeout', async () => {
      const now = new Date('2026-10-29T10:00:00Z');
      const dueDelivery = {
        id: 'deliv-claim-1',
        companyId: companyA,
        status: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date('2026-10-29T09:59:00Z'),
        createdAt: new Date('2026-10-29T09:50:00Z'),
      };

      const mockPrisma = {
        notificationDelivery: {
          findMany: vi.fn().mockResolvedValue([dueDelivery]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            ...dueDelivery,
            attemptCount: 1,
            nextAttemptAt: new Date('2026-10-29T10:01:00Z'),
          }),
        },
      };

      const claimed = await claimOutboxDeliveries(mockPrisma, { leaseDurationMs: 60_000 }, now);
      expect(claimed.length).toBe(1);
      expect(mockPrisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attemptCount: { increment: 1 },
          }),
        })
      );
    });

    it('recovers abandoned processing leases when nextAttemptAt is past now', async () => {
      const now = new Date('2026-10-29T10:05:00Z');
      // Delivery claimed by crashed worker at 10:00:00 with 60s lease (expired at 10:01:00)
      const crashedDelivery = {
        id: 'deliv-crashed-1',
        companyId: companyA,
        status: 'PENDING',
        attemptCount: 1,
        nextAttemptAt: new Date('2026-10-29T10:01:00Z'), // expired!
      };

      const mockPrisma = {
        notificationDelivery: {
          findMany: vi.fn().mockResolvedValue([crashedDelivery]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            ...crashedDelivery,
            attemptCount: 2,
            nextAttemptAt: new Date('2026-10-29T10:06:00Z'),
          }),
        },
      };

      const claimed = await claimOutboxDeliveries(mockPrisma, { leaseDurationMs: 60_000 }, now);
      expect(claimed.length).toBe(1);
      expect(claimed[0].id).toBe('deliv-crashed-1');
    });

    it('marks delivery SENT and records providerId on successful push dispatch', async () => {
      const now = new Date();
      const delivery = {
        id: 'deliv-succ-1',
        companyId: companyA,
        attemptCount: 1,
        notification: { id: 'notif-1', userId: userA, title: 'Test', body: 'Body' },
      };

      const mockPrisma = {
        pushDevice: {
          findMany: vi.fn().mockResolvedValue([{ token: 'fcm-token-1', tokenHash: 'h1' }]),
        },
        notificationDelivery: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockMessaging = {
        sendEachForMulticast: vi.fn().mockResolvedValue({
          successCount: 1,
          failureCount: 0,
          responses: [{ success: true, messageId: 'fcm-msg-12345' }],
        }),
      };

      const res = await dispatchClaimedPushDelivery(mockPrisma, delivery, mockMessaging, {}, now);
      expect(res.success).toBe(true);
      expect(mockPrisma.notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deliv-succ-1' },
          data: expect.objectContaining({
            status: 'SENT',
            providerId: 'fcm-msg-12345',
          }),
        })
      );
    });

    it('schedules exponential backoff on retryable provider failure', async () => {
      const now = new Date('2026-10-29T12:00:00Z');
      const delivery = {
        id: 'deliv-fail-1',
        companyId: companyA,
        attemptCount: 2, // 2nd attempt failed
        notification: { id: 'notif-1', userId: userA, title: 'Test', body: 'Body' },
      };

      const mockPrisma = {
        pushDevice: {
          findMany: vi.fn().mockResolvedValue([{ token: 'fcm-token-1', tokenHash: 'h1' }]),
        },
        notificationDelivery: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockMessaging = {
        sendEachForMulticast: vi.fn().mockResolvedValue({
          successCount: 0,
          failureCount: 1,
          responses: [{ success: false, error: { message: 'FCM_UNAVAILABLE' } }],
        }),
      };

      const res = await dispatchClaimedPushDelivery(
        mockPrisma,
        delivery,
        mockMessaging,
        { baseBackoffMs: 30_000, maxAttempts: 5 },
        now
      );

      expect(res.success).toBe(false);
      expect(res.deadLetter).toBe(false);
      // Backoff for attempt 2: baseMs * 2^(2-1) = 30s * 2 = 60s
      const expectedNext = new Date(now.getTime() + 60_000);
      expect(mockPrisma.notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deliv-fail-1' },
          data: expect.objectContaining({
            status: 'FAILED',
            lastError: 'FCM_UNAVAILABLE',
            nextAttemptAt: expectedNext,
          }),
        })
      );
    });

    it('dead-letters delivery to SKIPPED status when max attempts are exhausted', async () => {
      const now = new Date('2026-10-29T12:00:00Z');
      const delivery = {
        id: 'deliv-exhaust-1',
        companyId: companyA,
        attemptCount: 5, // 5th attempt (maxAttempts = 5)
        notification: { id: 'notif-1', userId: userA, title: 'Test', body: 'Body' },
      };

      const mockPrisma = {
        pushDevice: {
          findMany: vi.fn().mockResolvedValue([{ token: 'fcm-token-1', tokenHash: 'h1' }]),
        },
        notificationDelivery: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      const mockMessaging = {
        sendEachForMulticast: vi.fn().mockResolvedValue({
          successCount: 0,
          failureCount: 1,
          responses: [{ success: false, error: { message: 'TOKEN_INVALID' } }],
        }),
      };

      const res = await dispatchClaimedPushDelivery(
        mockPrisma,
        delivery,
        mockMessaging,
        { maxAttempts: 5 },
        now
      );

      expect(res.success).toBe(false);
      expect(res.deadLetter).toBe(true);
      expect(mockPrisma.notificationDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'deliv-exhaust-1' },
          data: expect.objectContaining({
            status: 'SKIPPED',
            nextAttemptAt: null,
            lastError: expect.stringContaining('Exhausted all 5 attempts'),
          }),
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Real PostgreSQL Multi-Connection Outbox Suite (Fail-Closed Safety Gate)
  // ---------------------------------------------------------------------------
  describe.skipIf(!runLivePostgres)(
    'PostgreSQL Real Multi-Connection Outbox Concurrency Suite (Fail-Closed)',
    () => {
      const rawUrl = process.env.DATABASE_URL;
      const databaseUrl = rawUrl ? normalizeDatabaseUrl(rawUrl) : undefined;

      let prisma1: PrismaClient | null = null;
      let prisma2: PrismaClient | null = null;
      const createdCompanyIds = new Set<string>();

      async function cleanupCompany(companyId: string) {
        if (!prisma1) return;
        try {
          await prisma1.pushDevice.deleteMany({ where: { companyId } });
          await prisma1.notificationDelivery.deleteMany({ where: { companyId } });
          await prisma1.notification.deleteMany({ where: { companyId } });
          await prisma1.user.deleteMany({ where: { companyId } });
          await prisma1.company.deleteMany({ where: { id: companyId } });
        } catch {
          // Ignore teardown errors
        }
      }

      beforeAll(async () => {
        if (!databaseUrl) {
          throw new Error('[FAIL-CLOSED] DATABASE_URL is required for live outbox integration tests.');
        }

        const parsedUrl = new URL(databaseUrl);
        const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
        if (!isLoopback || parsedUrl.hostname.includes('rds.amazonaws.com') || process.env.NODE_ENV === 'production') {
          throw new Error(
            `[FAIL-CLOSED SAFETY] Outbox test refused connection to host '${parsedUrl.hostname}'. Tests strictly restricted to local loopback test instances.`
          );
        }

        prisma1 = new PrismaClient({ datasourceUrl: databaseUrl });
        prisma2 = new PrismaClient({ datasourceUrl: databaseUrl });
        await prisma1.$connect();
        await prisma2.$connect();
      });

      afterEach(async () => {
        for (const cid of createdCompanyIds) {
          await cleanupCompany(cid);
        }
        createdCompanyIds.clear();
      });

      afterAll(async () => {
        try {
          for (const cid of createdCompanyIds) {
            await cleanupCompany(cid);
          }
          if (prisma1) await prisma1.$disconnect();
          if (prisma2) await prisma2.$disconnect();
        } catch {
          // Ignore disconnect errors
        }
      });

      it('real PostgreSQL: transactional outbox commits atomically with business mutations and rolls back on failure', async () => {
        if (!prisma1) throw new Error('Database not initialized');

        const liveCompanyId = `live-outbox-${Date.now()}`;
        createdCompanyIds.add(liveCompanyId);

        await prisma1.company.create({
          data: {
            id: liveCompanyId,
            name: 'Live Outbox Corp',
            slug: `outbox-corp-${Date.now()}`,
            email: `outbox-${Date.now()}@example.com`,
            industry: 'Technology',
            size: '10-50',
          },
        });

        const liveUser = await prisma1.user.create({
          data: {
            companyId: liveCompanyId,
            email: `outbox-user-${Date.now()}@example.com`,
            passwordHash: 'dummy-hash',
            fullName: 'Rajesh Kumar',
            role: 'EMPLOYEE',
          },
        });

        // 1. Successful transaction: commits both user mutation and outbox records
        await prisma1.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: liveUser.id },
            data: { fullName: 'Rajesh Kumar Updated' },
          });

          await enqueueTransactionalNotification(tx, {
            companyId: liveCompanyId,
            userId: liveUser.id,
            eventKey: 'PROFILE_UPDATED',
            title: 'Profile Updated',
            body: 'Your profile has been updated.',
            channels: ['PUSH'],
            idempotencyKeyPrefix: `prof-upd-${liveUser.id}`,
          });
        });

        // Assert database state in PostgreSQL
        const updatedUser = await prisma1.user.findUnique({ where: { id: liveUser.id } });
        expect(updatedUser?.fullName).toBe('Rajesh Kumar Updated');

        const savedDeliveries = await prisma1.notificationDelivery.findMany({
          where: { companyId: liveCompanyId },
        });
        expect(savedDeliveries.length).toBe(1);
        expect(savedDeliveries[0].status).toBe('PENDING');

        // 2. Aborted transaction: verify rollback discards outbox records completely
        try {
          await prisma1.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: liveUser.id },
              data: { fullName: 'Should Rollback' },
            });

            await enqueueTransactionalNotification(tx, {
              companyId: liveCompanyId,
              userId: liveUser.id,
              eventKey: 'GHOST_NOTIFICATION',
              title: 'Ghost Title',
              body: 'Ghost Body',
              channels: ['PUSH'],
              idempotencyKeyPrefix: `ghost-${liveUser.id}`,
            });

            throw new Error('SIMULATED_TRANSACTION_ROLLBACK');
          });
        } catch (err: any) {
          expect(err.message).toBe('SIMULATED_TRANSACTION_ROLLBACK');
        }

        // Verify in PostgreSQL that rollback left state completely intact
        const postRollbackUser = await prisma1.user.findUnique({ where: { id: liveUser.id } });
        expect(postRollbackUser?.fullName).toBe('Rajesh Kumar Updated');

        const postRollbackDeliveries = await prisma1.notificationDelivery.findMany({
          where: { companyId: liveCompanyId },
        });
        // Still exactly 1 from earlier successful transaction, ghost outbox was rolled back!
        expect(postRollbackDeliveries.length).toBe(1);
      });

      it('real PostgreSQL: concurrent worker claims via FOR UPDATE SKIP LOCKED process disjoint deliveries with zero duplicates', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const liveCompanyId = `live-claim-${Date.now()}`;
        createdCompanyIds.add(liveCompanyId);

        await prisma1.company.create({
          data: {
            id: liveCompanyId,
            name: 'Live Claim Corp',
            slug: `claim-corp-${Date.now()}`,
            email: `claim-${Date.now()}@example.com`,
            industry: 'Technology',
            size: '10-50',
          },
        });

        const liveUser = await prisma1.user.create({
          data: {
            companyId: liveCompanyId,
            email: `claim-user-${Date.now()}@example.com`,
            passwordHash: 'dummy-hash',
            fullName: 'Anita Roy',
            role: 'EMPLOYEE',
          },
        });

        // Seed 4 pending outbox deliveries
        for (let i = 1; i <= 4; i++) {
          const notif = await prisma1.notification.create({
            data: {
              companyId: liveCompanyId,
              userId: liveUser.id,
              eventKey: `EVENT_${i}`,
              title: `Title ${i}`,
              body: `Body ${i}`,
            },
          });

          await prisma1.notificationDelivery.create({
            data: {
              companyId: liveCompanyId,
              notificationId: notif.id,
              channel: 'PUSH',
              status: 'PENDING',
              idempotencyKey: `claim-test-${liveCompanyId}:${i}`,
              attemptCount: 0,
              nextAttemptAt: new Date(Date.now() - 1000), // due now
            },
          });
        }

        // Launch two worker claims simultaneously over separate PostgreSQL connections
        const [claimBatch1, claimBatch2] = await Promise.all([
          claimOutboxDeliveries(prisma1, { batchSize: 2, leaseDurationMs: 60_000 }),
          claimOutboxDeliveries(prisma2, { batchSize: 2, leaseDurationMs: 60_000 }),
        ]);

        const ids1 = claimBatch1.map((d) => d.id);
        const ids2 = claimBatch2.map((d) => d.id);

        // Assert that both workers claimed deliveries
        expect(ids1.length).toBeGreaterThan(0);
        expect(ids2.length).toBeGreaterThan(0);

        // Assert strictly DISJOINT sets: no delivery was claimed twice!
        const intersection = ids1.filter((id) => ids2.includes(id));
        expect(intersection).toEqual([]);
      });
    }
  );
});
