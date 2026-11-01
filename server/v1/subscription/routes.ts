import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import type { PrismaClient, SubscriptionStatus } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  ensureDefaultPlans,
  getCompanySubscription,
  initializeSubscriptionCheckout,
  verifyAndActivateSubscription,
  superAdminOverrideSubscription,
} from './subscriptionManager.js';
import { razorpayService } from './razorpayClient.js';

type AuthedRequest = Request & {
  auth?: {
    id: string;
    companyId: string;
    role: string;
    permissions: string[];
  };
  requestId?: string;
};

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many payment requests. Please try again later.' } },
});

export function createSubscriptionRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();

  const ok = (res: Response, data: unknown) =>
    res.json({ data, meta: { requestId: (res.req as AuthedRequest).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });

  /**
   * GET /subscription/plans
   * List available subscription plans and pricing.
   */
  router.get('/subscription/plans', async (_req, res, next) => {
    try {
      await ensureDefaultPlans(prisma);
      const plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });
      return ok(
        res,
        plans.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          billingCycle: p.billingCycle,
          features: Array.isArray(p.features) ? p.features : [],
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /subscription/status
   * Current company subscription status.
   */
  router.get('/subscription/status', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.auth?.companyId;
      if (!companyId) return fail(res, 400, 'BAD_REQUEST', 'Missing company context.');

      const status = await getCompanySubscription(prisma, companyId);
      return ok(res, status);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /subscription/checkout
   * Initialize subscription checkout with Razorpay.
   */
  router.post(
    '/subscription/checkout',
    authenticate,
    checkoutLimiter,
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth?.companyId;
        const role = req.auth?.role;
        if (!companyId || !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role || '')) {
          return fail(res, 403, 'FORBIDDEN', 'Only Company Administrators can initiate subscription billing.');
        }

        const schema = z.object({
          planCode: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
          withTrial: z.boolean().optional(),
          trialDays: z.number().int().positive().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, 'INVALID_INPUT', 'A valid plan code (STARTER, GROWTH, or BUSINESS) is required.');
        }

        const checkoutData = await initializeSubscriptionCheckout(prisma, companyId, parsed.data.planCode, {
          withTrial: parsed.data.withTrial,
          trialDays: parsed.data.trialDays,
        });
        return ok(res, checkoutData);
      } catch (err: any) {
        return fail(res, 400, 'CHECKOUT_FAILED', err?.message || 'Failed to initialize subscription checkout.');
      }
    }
  );

  /**
   * POST /subscription/verify
   * Verify checkout signature and activate subscription.
   */
  router.post(
    '/subscription/verify',
    authenticate,
    checkoutLimiter,
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        const companyId = req.auth?.companyId;
        const role = req.auth?.role;
        if (!companyId || !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role || '')) {
          return fail(res, 403, 'FORBIDDEN', 'Only Company Administrators can verify subscription payments.');
        }

        const schema = z.object({
          razorpay_payment_id: z.string().min(1),
          razorpay_subscription_id: z.string().optional(),
          razorpay_order_id: z.string().optional(),
          razorpay_signature: z.string().min(1),
          planCode: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
          isTrialAutopay: z.boolean().optional(),
          trialDays: z.number().int().positive().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, 'INVALID_PAYMENT_DATA', 'Missing required Razorpay payment signature verification data.');
        }

        const result = await verifyAndActivateSubscription(prisma, companyId, parsed.data);
        return ok(res, result);
      } catch (err: any) {
        return fail(res, 400, 'VERIFICATION_FAILED', err?.message || 'Payment verification failed.');
      }
    }
  );

  /**
   * POST /subscription/cancel
   * Cancel subscription at period end.
   */
  router.post('/subscription/cancel', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.auth?.companyId;
      const role = req.auth?.role;
      if (!companyId || !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role || '')) {
        return fail(res, 403, 'FORBIDDEN', 'Only Company Administrators can cancel subscriptions.');
      }

      const sub = await prisma.companySubscription.findUnique({ where: { companyId } });
      if (!sub) return fail(res, 404, 'NOT_FOUND', 'No active subscription found.');

      const reason = req.body.reason || 'User cancelled via billing dashboard.';
      await prisma.companySubscription.update({
        where: { id: sub.id },
        data: {
          cancelAtPeriodEnd: true,
          cancelledAt: new Date(),
        },
      });

      await prisma.subscriptionAuditLog.create({
        data: {
          companyId,
          subscriptionId: sub.id,
          changedById: req.auth?.id,
          action: 'CANCEL_AT_PERIOD_END',
          previousStatus: sub.status,
          newStatus: sub.status,
          reason,
        },
      });

      return ok(res, {
        cancelled: true,
        cancelAtPeriodEnd: true,
        message: 'Your subscription has been scheduled to cancel at the end of the current billing cycle.',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /subscription/resume
   * Resume subscription before cancellation period ends.
   */
  router.post('/subscription/resume', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.auth?.companyId;
      const role = req.auth?.role;
      if (!companyId || !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role || '')) {
        return fail(res, 403, 'FORBIDDEN', 'Only Company Administrators can resume subscriptions.');
      }

      const sub = await prisma.companySubscription.findUnique({ where: { companyId } });
      if (!sub) return fail(res, 404, 'NOT_FOUND', 'No active subscription found.');

      await prisma.companySubscription.update({
        where: { id: sub.id },
        data: {
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
      });

      await prisma.subscriptionAuditLog.create({
        data: {
          companyId,
          subscriptionId: sub.id,
          changedById: req.auth?.id,
          action: 'RESUME_SUBSCRIPTION',
          previousStatus: sub.status,
          newStatus: sub.status,
          reason: 'Subscription cancellation resumed by administrator.',
        },
      });

      return ok(res, {
        resumed: true,
        message: 'Your subscription has been resumed successfully.',
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /subscription/invoices
   * List payment history and invoices for tenant.
   */
  router.get('/subscription/invoices', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const companyId = req.auth?.companyId;
      if (!companyId) return fail(res, 400, 'BAD_REQUEST', 'Missing company context.');

      const payments = await prisma.paymentHistory.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return ok(
        res,
        payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          paymentMethod: p.paymentMethod || 'Online (Razorpay)',
          paidAt: p.paidAt?.toISOString() || null,
          createdAt: p.createdAt.toISOString(),
          razorpayPaymentId: p.razorpayPaymentId,
          invoiceNumber: `INV-${p.id.slice(0, 8).toUpperCase()}`,
        }))
      );
    } catch (err) {
      next(err);
    }
  });

  /**
   * SUPER ADMIN ROUTES
   * GET /super-admin/subscriptions
   */
  router.get('/super-admin/subscriptions', authenticate, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.auth?.role !== 'SUPER_ADMIN') {
        return fail(res, 403, 'FORBIDDEN', 'Only Super Administrators may access all company subscriptions.');
      }

      await ensureDefaultPlans(prisma);

      const search = String(req.query.search || '').trim();
      const statusFilter = String(req.query.status || '').trim();
      const planFilter = String(req.query.plan || '').trim();

      const where: any = {};
      if (search) {
        where.name = { contains: search, mode: 'insensitive' };
      }

      const companies = await prisma.company.findMany({
        where,
        include: {
          subscription: {
            include: { plan: true },
          },
          paymentHistories: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          _count: {
            select: { employees: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Stats aggregation
      const allSubscriptions = await prisma.companySubscription.findMany({
        include: { plan: true },
      });
      const allPayments = await prisma.paymentHistory.findMany({
        where: { status: 'SUCCESS' },
      });

      const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);
      const activeCount = allSubscriptions.filter((s) => s.status === 'ACTIVE').length;
      const trialCount = allSubscriptions.filter((s) => s.status === 'TRIAL').length;
      const pastDueCount = allSubscriptions.filter((s) => s.status === 'PAST_DUE' || s.status === 'HALTED').length;
      const cancelledCount = allSubscriptions.filter((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED').length;

      const filtered = companies.filter((c) => {
        if (statusFilter && c.subscription?.status !== statusFilter) return false;
        if (planFilter && c.subscription?.plan?.code !== planFilter) return false;
        return true;
      });

      return ok(res, {
        stats: {
          totalCompanies: companies.length,
          totalRevenue,
          activeSubscriptions: activeCount,
          trialSubscriptions: trialCount,
          pastDueSubscriptions: pastDueCount,
          cancelledSubscriptions: cancelledCount,
        },
        companies: filtered.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          email: c.email,
          employeeCount: c._count.employees,
          plan: c.subscription?.plan?.code || c.plan,
          planName: c.subscription?.plan?.name || c.plan,
          price: c.subscription?.plan?.price || 0,
          status: c.subscription?.status || 'TRIAL',
          trialEndsAt: c.subscription?.trialEndsAt?.toISOString() || null,
          currentPeriodStart: c.subscription?.currentPeriodStart?.toISOString() || null,
          currentPeriodEnd: c.subscription?.currentPeriodEnd?.toISOString() || null,
          razorpaySubscriptionId: c.subscription?.razorpaySubscriptionId,
          createdAt: c.createdAt.toISOString(),
          recentPayments: c.paymentHistories.map((p) => ({
            id: p.id,
            amount: p.amount,
            status: p.status,
            paidAt: p.paidAt?.toISOString() || null,
            razorpayPaymentId: p.razorpayPaymentId,
          })),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /super-admin/subscriptions/:companyId/override
   * Manual override of subscription status by Super Admin.
   */
  router.post(
    '/super-admin/subscriptions/:companyId/override',
    authenticate,
    async (req: AuthedRequest, res: Response, next: NextFunction) => {
      try {
        if (req.auth?.role !== 'SUPER_ADMIN') {
          return fail(res, 403, 'FORBIDDEN', 'Only Super Administrators can perform manual overrides.');
        }

        const companyId = String(req.params.companyId);
        const schema = z.object({
          status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'HALTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'PENDING']),
          planCode: z.enum(['STARTER', 'GROWTH', 'BUSINESS']),
          reason: z.string().min(3),
          extendDays: z.number().int().min(1).max(365).optional(),
        });

        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return fail(res, 400, 'INVALID_INPUT', 'Please provide a valid status, planCode, and override reason.');
        }

        const result = await superAdminOverrideSubscription(prisma, companyId, {
          status: parsed.data.status as SubscriptionStatus,
          planCode: parsed.data.planCode,
          reason: parsed.data.reason,
          adminUserId: req.auth!.id,
          extendDays: parsed.data.extendDays,
        });

        return ok(res, result);
      } catch (err: any) {
        return fail(res, 400, 'OVERRIDE_FAILED', err?.message || 'Failed to update subscription override.');
      }
    }
  );

  return router;
}
