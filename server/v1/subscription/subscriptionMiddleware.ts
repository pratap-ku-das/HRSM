import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';
import { getCompanySubscription } from './subscriptionManager.js';

type AuthedRequest = Request & {
  auth?: {
    id: string;
    companyId: string;
    role: string;
    permissions: string[];
  };
};

/**
 * Paths that must NEVER be blocked even if subscription is expired or unpaid.
 */
const EXEMPT_PATH_PREFIXES = [
  '/auth',
  '/subscription',
  '/webhooks',
  '/health',
  '/downloads',
];

/**
 * Middleware that validates active subscription access for tenant requests.
 */
export function createSubscriptionEnforcementMiddleware(prisma: PrismaClient) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    // 1. If not authenticated or missing companyId, skip (auth middleware will handle or public)
    if (!req.auth || !req.auth.companyId) {
      return next();
    }

    // 2. Super Admins bypass subscription enforcement for tenant management
    if (req.auth.role === 'SUPER_ADMIN') {
      return next();
    }

    // 3. Check exempt paths
    const path = req.path || req.baseUrl;
    const isExempt = EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix));
    if (isExempt) {
      return next();
    }

    try {
      const overview = await getCompanySubscription(prisma, req.auth.companyId);

      // If active (or in trial or valid grace period), allow access
      if (overview.isActive) {
        return next();
      }

      // Subscription is inactive / expired / halted
      return res.status(402).json({
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          status: overview.status,
          message:
            overview.status === 'EXPIRED'
              ? 'Your company subscription or trial has expired. Please renew your subscription on the billing page to resume access.'
              : overview.status === 'HALTED'
              ? 'Your subscription is halted due to recurring payment failure. Please update your payment method.'
              : overview.status === 'PAST_DUE'
              ? 'Your payment is past due and grace period has elapsed. Please settle your outstanding payment.'
              : 'An active subscription is required to use OrbitHR HRMS modules.',
          daysRemaining: overview.daysRemaining,
          plan: overview.plan,
        },
      });
    } catch (err: any) {
      console.error('[SUBSCRIPTION_MIDDLEWARE_ERROR]', err?.message || err);
      // Fail open for transient DB issues or unexpected internal errors so production doesn't hard-crash
      return next();
    }
  };
}

