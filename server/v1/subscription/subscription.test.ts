import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { razorpayService, OFFICIAL_PLANS } from './razorpayClient.js';
import {
  ensureDefaultPlans,
  getCompanySubscription,
  initializeSubscriptionCheckout,
  verifyAndActivateSubscription,
  processRazorpayWebhook,
  superAdminOverrideSubscription,
} from './subscriptionManager.js';
import { createSubscriptionRouter } from './routes.js';
import { createRazorpayWebhookRouter } from './webhookRoute.js';
import { createSubscriptionEnforcementMiddleware } from './subscriptionMiddleware.js';

describe('OrbitHR Razorpay Subscription Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Subscription Plans & Pricing Integrity', () => {
    it('defines the three exact plans with exact monthly prices', () => {
      expect(OFFICIAL_PLANS.STARTER.monthlyPrice).toBe(299);
      expect(OFFICIAL_PLANS.STARTER.name).toBe('Starter');

      expect(OFFICIAL_PLANS.GROWTH.monthlyPrice).toBe(799);
      expect(OFFICIAL_PLANS.GROWTH.name).toBe('Growth');

      expect(OFFICIAL_PLANS.BUSINESS.monthlyPrice).toBe(1199);
      expect(OFFICIAL_PLANS.BUSINESS.name).toBe('Business');
    });

    it('upserts all 3 plans in database during initialization', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      const mockPrisma = {
        subscriptionPlan: {
          upsert: upsertMock,
        },
      };

      await ensureDefaultPlans(mockPrisma as any);
      expect(upsertMock).toHaveBeenCalledTimes(3);
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'STARTER' },
          create: expect.objectContaining({ price: 299, currency: 'INR' }),
        })
      );
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'GROWTH' },
          create: expect.objectContaining({ price: 799, currency: 'INR' }),
        })
      );
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'BUSINESS' },
          create: expect.objectContaining({ price: 1199, currency: 'INR' }),
        })
      );
    });

    it('rejects invalid plan selection during checkout', async () => {
      const mockPrisma = {
        subscriptionPlan: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: 'comp-1', name: 'Test Corp' }),
        },
      };

      await expect(
        initializeSubscriptionCheckout(mockPrisma as any, 'comp-1', 'INVALID_TIER')
      ).rejects.toThrow('Invalid or inactive subscription plan');
    });
  });

  describe('2. Cryptographic Signature Verification', () => {
    it('verifies valid HMAC-SHA256 subscription payment signature', () => {
      const secret = 'test_secret_key_12345';
      const paymentId = 'pay_001';
      const subscriptionId = 'sub_001';
      const payload = `${paymentId}|${subscriptionId}`;
      const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Inject secret for test
      vi.spyOn(razorpayService as any, 'keySecret', 'get').mockReturnValue(secret);

      const isValid = razorpayService.verifySubscriptionPaymentSignature(
        paymentId,
        subscriptionId,
        validSig
      );
      expect(isValid).toBe(true);

      const isInvalid = razorpayService.verifySubscriptionPaymentSignature(
        paymentId,
        subscriptionId,
        'forged_tampered_signature'
      );
      expect(isInvalid).toBe(false);
    });

    it('verifies valid webhook HMAC signature with raw request body', () => {
      const secret = 'webhook_secret_xyz';
      const rawBody = JSON.stringify({ event: 'subscription.activated', id: 'evt_001' });
      const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const isValid = razorpayService.verifyWebhookSignature(rawBody, validSig, secret);
      expect(isValid).toBe(true);

      const isInvalid = razorpayService.verifyWebhookSignature(rawBody, 'bad_sig', secret);
      expect(isInvalid).toBe(false);
    });

    it('rejects verification if payment ID or signature is missing', async () => {
      const mockPrisma = {} as any;
      await expect(
        verifyAndActivateSubscription(mockPrisma, 'comp-1', {
          razorpay_payment_id: '',
          razorpay_signature: '',
          planCode: 'GROWTH',
        })
      ).rejects.toThrow('Payment ID and cryptographic signature are required');
    });
  });

  describe('3. Webhooks & Idempotent Event Processing', () => {
    it('idempotently handles duplicate webhook events without re-processing', async () => {
      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue({ id: 'evt_record_1', status: 'PROCESSED' }),
        },
      };

      const raw = JSON.stringify({ id: 'evt_dup_1', event: 'subscription.charged' });
      const res = await processRazorpayWebhook(mockPrisma as any, raw, '');
      expect(res.status).toBe('ALREADY_PROCESSED');
    });

    it('processes subscription.activated and updates subscription to ACTIVE', async () => {
      const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
      const createAuditMock = vi.fn().mockResolvedValue({});
      const createEventMock = vi.fn().mockResolvedValue({});
      const updateEventMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: createEventMock,
          update: updateEventMock,
        },
        companySubscription: {
          updateMany: updateManyMock,
          findUnique: vi.fn().mockResolvedValue(null),
        },
        subscriptionAuditLog: {
          create: createAuditMock,
        },
      };

      const eventPayload = {
        id: 'evt_act_1',
        event: 'subscription.activated',
        payload: {
          subscription: {
            entity: {
              id: 'sub_123',
              current_start: 1700000000,
              current_end: 1702592000,
              notes: { companyId: 'comp-123' },
            },
          },
        },
      };

      const res = await processRazorpayWebhook(
        mockPrisma as any,
        JSON.stringify(eventPayload),
        ''
      );
      expect(res.status).toBe('PROCESSED');
      expect(updateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'comp-123' },
          data: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
      expect(createAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'comp-123',
            action: 'WEBHOOK_SUBSCRIPTION_ACTIVATED',
            newStatus: 'ACTIVE',
          }),
        })
      );
    });

    it('processes subscription.charged and prevents duplicate payment history entries', async () => {
      const updateSubMock = vi.fn().mockResolvedValue({});
      const upsertPaymentMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        companySubscription: {
          findUnique: vi.fn().mockResolvedValue({ id: 'sub_rec_1', companyId: 'comp-123' }),
          update: updateSubMock,
        },
        paymentHistory: {
          upsert: upsertPaymentMock,
        },
        subscriptionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const eventPayload = {
        id: 'evt_charged_1',
        event: 'subscription.charged',
        payload: {
          subscription: {
            entity: {
              id: 'sub_123',
              notes: { companyId: 'comp-123' },
            },
          },
          payment: {
            entity: {
              id: 'pay_123',
              amount: 79900,
              currency: 'INR',
              method: 'card',
            },
          },
        },
      };

      const res = await processRazorpayWebhook(
        mockPrisma as any,
        JSON.stringify(eventPayload),
        ''
      );
      expect(res.status).toBe('PROCESSED');
      expect(upsertPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { razorpayPaymentId: 'pay_123' },
          create: expect.objectContaining({
            amount: 799,
            status: 'SUCCESS',
          }),
        })
      );
    });

    it('processes payment.failed and marks company subscription PAST_DUE with grace period', async () => {
      const upsertPaymentMock = vi.fn().mockResolvedValue({});
      const updateSubMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        companySubscription: {
          findUnique: vi.fn().mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', companyId: 'comp-123' }),
          update: updateSubMock,
        },
        paymentHistory: {
          upsert: upsertPaymentMock,
        },
        subscriptionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const eventPayload = {
        id: 'evt_fail_1',
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: 'pay_failed_1',
              amount: 79900,
              error_description: 'Card declined by issuing bank',
              notes: { companyId: 'comp-123' },
            },
          },
        },
      };

      const res = await processRazorpayWebhook(mockPrisma as any, JSON.stringify(eventPayload), '');
      expect(res.status).toBe('PROCESSED');
      expect(upsertPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { razorpayPaymentId: 'pay_failed_1' },
          create: expect.objectContaining({ status: 'FAILED' }),
        })
      );
      expect(updateSubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ status: 'PAST_DUE' }),
        })
      );
    });
  });

  describe('4. Subscription Access Control Middleware', () => {
    const buildApp = (statusMock: any) => {
      const app = express();
      app.use(express.json());

      const authMiddleware = (req: any, _res: any, next: any) => {
        req.auth = {
          id: 'user-1',
          companyId: 'comp-tenant-a',
          role: req.headers['x-test-role'] || 'EMPLOYEE',
          permissions: [],
        };
        next();
      };

      const mockPrisma = {
        subscriptionPlan: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ code: 'GROWTH', name: 'Growth', price: 799, features: [] }),
        },
        companySubscription: {
          findUnique: vi.fn().mockResolvedValue(statusMock),
          create: vi.fn().mockResolvedValue(statusMock),
          update: vi.fn().mockResolvedValue(statusMock),
        },
        subscriptionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      app.use(authMiddleware);
      app.use(createSubscriptionEnforcementMiddleware(mockPrisma as any));

      // Protected employee route
      app.get('/api/v1/attendance', (_req, res) => res.json({ ok: true }));

      // Exempt billing route
      app.get('/api/v1/subscription/status', (_req, res) => res.json({ ok: true, billing: true }));

      return app;
    };

    it('allows access when company subscription is ACTIVE', async () => {
      const now = new Date();
      const app = buildApp({
        id: 'sub-1',
        companyId: 'comp-tenant-a',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 15 * 86_400_000),
        plan: { code: 'GROWTH', name: 'Growth', price: 799, features: [] },
      });

      const res = await request(app).get('/api/v1/attendance');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('allows access during valid 14-day TRIAL', async () => {
      const now = new Date();
      const app = buildApp({
        id: 'sub-1',
        companyId: 'comp-tenant-a',
        status: 'TRIAL',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 10 * 86_400_000),
        trialEndsAt: new Date(now.getTime() + 10 * 86_400_000),
        plan: { code: 'GROWTH', name: 'Growth', price: 799, features: [] },
      });

      const res = await request(app).get('/api/v1/attendance');
      expect(res.status).toBe(200);
    });

    it('blocks access with HTTP 402 SUBSCRIPTION_REQUIRED when subscription is EXPIRED', async () => {
      const now = new Date();
      const app = buildApp({
        id: 'sub-1',
        companyId: 'comp-tenant-a',
        status: 'EXPIRED',
        trialEndsAt: new Date(now.getTime() - 2 * 86_400_000),
        plan: { code: 'GROWTH', name: 'Growth', price: 799, features: [] },
      });

      const res = await request(app).get('/api/v1/attendance');
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
      expect(res.body.error.status).toBe('EXPIRED');
    });

    it('allows access to billing endpoints even when subscription is EXPIRED', async () => {
      const now = new Date();
      const app = buildApp({
        id: 'sub-1',
        companyId: 'comp-tenant-a',
        status: 'EXPIRED',
        trialEndsAt: new Date(now.getTime() - 2 * 86_400_000),
        plan: { code: 'GROWTH', name: 'Growth', price: 799, features: [] },
      });

      // Billing endpoint is exempt
      const res = await request(app).get('/api/v1/subscription/status');
      expect(res.status).toBe(200);
      expect(res.body.billing).toBe(true);
    });

    it('allows Super Admin to bypass subscription block', async () => {
      const now = new Date();
      const app = buildApp({
        id: 'sub-1',
        companyId: 'comp-tenant-a',
        status: 'EXPIRED',
        plan: { code: 'GROWTH', name: 'Growth', price: 799, features: [] },
      });

      const res = await request(app)
        .get('/api/v1/attendance')
        .set('x-test-role', 'SUPER_ADMIN');
      expect(res.status).toBe(200);
    });
  });

  describe('5. Super Admin Overrides & Audit Trail', () => {
    it('allows Super Admin to manually override subscription without forging payments', async () => {
      const upsertSubMock = vi.fn().mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
      const updateCompMock = vi.fn().mockResolvedValue({});
      const auditMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        subscriptionPlan: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ id: 'plan-biz', code: 'BUSINESS', name: 'Business' }),
        },
        companySubscription: {
          findUnique: vi.fn().mockResolvedValue({ id: 'sub-1', status: 'EXPIRED' }),
          upsert: upsertSubMock,
        },
        company: {
          update: updateCompMock,
        },
        subscriptionAuditLog: {
          create: auditMock,
        },
      };

      const result = await superAdminOverrideSubscription(mockPrisma as any, 'comp-tenant-b', {
        status: 'ACTIVE',
        planCode: 'BUSINESS',
        reason: 'Granted pilot access for 60 days.',
        adminUserId: 'admin-super-1',
        extendDays: 60,
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('ACTIVE');
      expect(upsertSubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'comp-tenant-b' },
          create: expect.objectContaining({ status: 'ACTIVE' }),
        })
      );
      expect(updateCompMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-tenant-b' },
          data: { plan: 'BUSINESS' },
        })
      );
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'comp-tenant-b',
            action: 'SUPER_ADMIN_MANUAL_OVERRIDE',
            newStatus: 'ACTIVE',
            changedById: 'admin-super-1',
          }),
        })
      );
    });
  });

  describe('6. Webhook HTTP Endpoint & Verification', () => {
    it('responds 400 when x-razorpay-signature is invalid', async () => {
      const app = express();
      app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

      // Mock webhook secret
      vi.spyOn(razorpayService as any, 'webhookSecret', 'get').mockReturnValue('real_secret_123');

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      app.use('/api', createRazorpayWebhookRouter(mockPrisma as any));

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', 'forged_signature_xyz')
        .send({ event: 'payment.failed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid Razorpay webhook signature');
    });

    it('responds 200 when webhook signature is valid', async () => {
      const secret = 'valid_secret_777';
      vi.spyOn(razorpayService as any, 'webhookSecret', 'get').mockReturnValue(secret);

      const payload = {
        id: 'evt_valid_999',
        event: 'subscription.completed',
        payload: {
          subscription: {
            entity: { id: 'sub_999', notes: { companyId: 'comp-999' } },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        companySubscription: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const app = express();
      app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
      app.use('/api', createRazorpayWebhookRouter(mockPrisma as any));

      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('7. Subscription Routes & Public Plans Endpoint', () => {
    it('serves subscription plans without requiring an Authorization header', async () => {
      const mockPrisma = {
        subscriptionPlan: {
          upsert: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: 'p1', code: 'STARTER', name: 'Starter', price: 299, currency: 'INR', billingCycle: 'MONTHLY', features: ['Core HRMS'], isActive: true },
            { id: 'p2', code: 'GROWTH', name: 'Growth', price: 799, currency: 'INR', billingCycle: 'MONTHLY', features: ['Core HRMS'], isActive: true },
            { id: 'p3', code: 'BUSINESS', name: 'Business', price: 1199, currency: 'INR', billingCycle: 'MONTHLY', features: ['Core HRMS'], isActive: true },
          ]),
        },
      };

      const dummyAuth = vi.fn((req, _res, next) => next());
      const app = express();
      app.use('/api/v1', createSubscriptionRouter(mockPrisma as any, dummyAuth));

      const res = await request(app).get('/api/v1/subscription/plans');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].price).toBe(299);
      expect(res.body.data[1].price).toBe(799);
      expect(res.body.data[2].price).toBe(1199);
    });
  });

  describe('8. Registration & 14-Day Trial Autopay Lifecycle', () => {
    it('initializes trial subscription matching company registered plan (e.g. STARTER), not default GROWTH', async () => {
      const createSubMock = vi.fn().mockImplementation((args) => Promise.resolve({
        id: 'sub_trial_starter',
        companyId: args.data.companyId,
        planId: args.data.planId,
        status: args.data.status,
        trialEndsAt: args.data.trialEndsAt,
        plan: { code: 'STARTER', name: 'Starter', price: 299, description: 'Starter plan', features: [] },
      }));

      const mockPrisma = {
        subscriptionPlan: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockImplementation((args) => {
            if (args.where.code === 'STARTER') {
              return Promise.resolve({ id: 'plan_starter_id', code: 'STARTER', name: 'Starter', price: 299, features: [] });
            }
            return Promise.resolve(null);
          }),
        },
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: 'comp_starter_1', plan: 'STARTER' }),
        },
        companySubscription: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: createSubMock,
        },
        subscriptionAuditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const status = await getCompanySubscription(mockPrisma as any, 'comp_starter_1');
      expect(status.status).toBe('TRIAL');
      expect(status.plan.code).toBe('STARTER');
      expect(status.plan.monthlyPrice).toBe(299);
      expect(createSubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            planId: 'plan_starter_id',
            status: 'TRIAL',
          }),
        })
      );
    });

    it('creates Razorpay checkout with future start_at for 14-day trial UPI Autopay', async () => {
      const createSubMock = vi.fn().mockResolvedValue({
        id: 'sub_rzp_autopay_1',
        status: 'created',
      });

      const mockRzp = {
        subscriptions: {
          create: createSubMock,
        },
      };

      vi.spyOn(razorpayService, 'getClient').mockReturnValue(mockRzp as any);
      vi.spyOn(razorpayService, 'getKeyId').mockReturnValue('rzp_live_test_key');

      const mockPrisma = {
        subscriptionPlan: {
          upsert: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: 'plan_starter_id',
            code: 'STARTER',
            name: 'Starter',
            price: 299,
            razorpayPlanId: 'plan_TuuMdHpeaiEYC5',
            isActive: true,
          }),
        },
        company: {
          findUnique: vi.fn().mockResolvedValue({ id: 'comp_1', slug: 'comp-1', name: 'Acme', email: 'acme@test.com' }),
        },
        companySubscription: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      const checkout = await initializeSubscriptionCheckout(mockPrisma as any, 'comp_1', 'STARTER', {
        withTrial: true,
        trialDays: 14,
      });

      expect(checkout.isTrialAutopay).toBe(true);
      expect(checkout.subscriptionId).toBe('sub_rzp_autopay_1');
      expect(createSubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: 'plan_TuuMdHpeaiEYC5',
          start_at: expect.any(Number),
          notes: expect.objectContaining({
            isTrialAutopay: 'true',
            trialDays: '14',
          }),
        })
      );
    });

    it('verifies signature and activates 14-day trial with UPI Autopay mandate', async () => {
      vi.spyOn(razorpayService, 'verifySubscriptionPaymentSignature').mockReturnValue(true);

      const updateSubMock = vi.fn().mockResolvedValue({ id: 'sub_db_1', status: 'TRIAL' });
      const upsertPaymentMock = vi.fn().mockResolvedValue({});
      const updateCompanyMock = vi.fn().mockResolvedValue({});
      const createAuditMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        subscriptionPlan: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'plan_starter_id',
            code: 'STARTER',
            name: 'Starter',
            price: 299,
          }),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback({
            companySubscription: { upsert: updateSubMock },
            paymentHistory: { upsert: upsertPaymentMock },
            company: { update: updateCompanyMock },
            subscriptionAuditLog: { create: createAuditMock },
          });
        }),
      };

      const res = await verifyAndActivateSubscription(mockPrisma as any, 'comp_1', {
        razorpay_payment_id: 'pay_auth_mandate_1',
        razorpay_subscription_id: 'sub_rzp_autopay_1',
        razorpay_signature: 'sig_valid_1',
        planCode: 'STARTER',
        isTrialAutopay: true,
        trialDays: 14,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('TRIAL');
      expect(updateCompanyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp_1' },
          data: { plan: 'STARTER' },
        })
      );
      expect(createAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TRIAL_AUTOPAY_ACTIVATED',
            newStatus: 'TRIAL',
          }),
        })
      );
    });

    it('processes subscription.authenticated webhook when customer completes UPI Autopay mandate', async () => {
      vi.spyOn(razorpayService, 'getWebhookSecret').mockReturnValue('');
      const updateSubMock = vi.fn().mockResolvedValue({});
      const createAuditMock = vi.fn().mockResolvedValue({});

      const mockPrisma = {
        razorpayWebhookEvent: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        companySubscription: {
          updateMany: updateSubMock,
        },
        subscriptionAuditLog: {
          create: createAuditMock,
        },
      };

      const payload = {
        id: 'evt_auth_1',
        event: 'subscription.authenticated',
        payload: {
          subscription: {
            entity: {
              id: 'sub_rzp_autopay_1',
              start_at: 1794745059,
              notes: { companyId: 'comp_auth_1' },
            },
          },
        },
      };

      const res = await processRazorpayWebhook(
        mockPrisma as any,
        JSON.stringify(payload),
        ''
      );

      expect(res.status).toBe('PROCESSED');
      expect(updateSubMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'comp_auth_1' },
          data: expect.objectContaining({
            status: 'TRIAL',
          }),
        })
      );
      expect(createAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'WEBHOOK_MANDATE_AUTHENTICATED',
            newStatus: 'TRIAL',
          }),
        })
      );
    });
  });
});

