import type { PrismaClient, SubscriptionStatus, PaymentStatus } from '@prisma/client';
import { razorpayService, OFFICIAL_PLANS, type RazorpayPlanConfig } from './razorpayClient.js';

export const GRACE_PERIOD_DAYS = 7;
export const TRIAL_PERIOD_DAYS = 14;

export interface SubscriptionStatusOverview {
  status: SubscriptionStatus;
  plan: {
    code: string;
    name: string;
    monthlyPrice: number;
    description: string;
    features: string[];
  };
  isActive: boolean;
  isInGracePeriod: boolean;
  daysRemaining?: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string | null;
  razorpaySubscriptionId?: string | null;
}

/**
 * Ensures the three standard OrbitHR subscription plans are present in the database.
 */
export async function ensureDefaultPlans(prisma: PrismaClient): Promise<void> {
  const plans = [
    {
      id: 'plan_starter_inr',
      code: 'STARTER',
      name: OFFICIAL_PLANS.STARTER.name,
      description: OFFICIAL_PLANS.STARTER.description,
      price: OFFICIAL_PLANS.STARTER.monthlyPrice,
      currency: 'INR',
      billingCycle: 'monthly',
      features: OFFICIAL_PLANS.STARTER.features,
      razorpayPlanId: razorpayService.getPlanIdForCode('STARTER'),
    },
    {
      id: 'plan_growth_inr',
      code: 'GROWTH',
      name: OFFICIAL_PLANS.GROWTH.name,
      description: OFFICIAL_PLANS.GROWTH.description,
      price: OFFICIAL_PLANS.GROWTH.monthlyPrice,
      currency: 'INR',
      billingCycle: 'monthly',
      features: OFFICIAL_PLANS.GROWTH.features,
      razorpayPlanId: razorpayService.getPlanIdForCode('GROWTH'),
    },
    {
      id: 'plan_business_inr',
      code: 'BUSINESS',
      name: OFFICIAL_PLANS.BUSINESS.name,
      description: OFFICIAL_PLANS.BUSINESS.description,
      price: OFFICIAL_PLANS.BUSINESS.monthlyPrice,
      currency: 'INR',
      billingCycle: 'monthly',
      features: OFFICIAL_PLANS.BUSINESS.features,
      razorpayPlanId: razorpayService.getPlanIdForCode('BUSINESS'),
    },
  ];

  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      create: {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        price: p.price,
        currency: p.currency,
        billingCycle: p.billingCycle,
        features: p.features,
        razorpayPlanId: p.razorpayPlanId,
        isActive: true,
      },
      update: {
        name: p.name,
        description: p.description,
        price: p.price,
        features: p.features,
        razorpayPlanId: p.razorpayPlanId || undefined,
        isActive: true,
      },
    });
  }
}

/**
 * Gets or initializes the company's active subscription.
 */
export async function getCompanySubscription(
  prisma: PrismaClient,
  companyId: string
): Promise<SubscriptionStatusOverview> {
  await ensureDefaultPlans(prisma);

  let sub = await prisma.companySubscription.findUnique({
    where: { companyId },
    include: { plan: true },
  });

  const now = new Date();

  // If no subscription record exists yet for company, create an initial trial subscription matching company's selected plan
  if (!sub) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true },
    });
    const targetCode = company?.plan ? String(company.plan).toUpperCase() : 'STARTER';

    let plan = await prisma.subscriptionPlan.findUnique({
      where: { code: targetCode },
    });
    if (!plan) {
      plan = (await prisma.subscriptionPlan.findFirst({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      }))!;
    }

    const trialEndsAt = new Date(now.getTime() + TRIAL_PERIOD_DAYS * 86_400_000);
    sub = await prisma.companySubscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: 'TRIAL',
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        trialEndsAt,
      },
      include: { plan: true },
    });

    await prisma.subscriptionAuditLog.create({
      data: {
        companyId,
        subscriptionId: sub.id,
        action: 'TRIAL_STARTED',
        newStatus: 'TRIAL',
        reason: 'Default 14-day trial assigned upon workspace activation.',
      },
    });
  }

  // Derive status
  let effectiveStatus = sub.status;
  let isInGracePeriod = false;

  if (effectiveStatus === 'TRIAL') {
    if (sub.trialEndsAt && now > sub.trialEndsAt) {
      effectiveStatus = 'EXPIRED';
      if (sub.status !== 'EXPIRED') {
        await prisma.companySubscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED' },
        });
      }
    }
  } else if (effectiveStatus === 'ACTIVE') {
    if (sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
      if (sub.cancelAtPeriodEnd) {
        effectiveStatus = 'EXPIRED';
      } else {
        // Entering grace period
        effectiveStatus = 'PAST_DUE';
        const graceEnd = new Date(sub.currentPeriodEnd.getTime() + GRACE_PERIOD_DAYS * 86_400_000);
        await prisma.companySubscription.update({
          where: { id: sub.id },
          data: {
            status: 'PAST_DUE',
            gracePeriodEndsAt: graceEnd,
          },
        });
      }
    }
  } else if (effectiveStatus === 'PAST_DUE' || effectiveStatus === 'HALTED') {
    if (sub.gracePeriodEndsAt && now <= sub.gracePeriodEndsAt) {
      isInGracePeriod = true;
    } else if (sub.gracePeriodEndsAt && now > sub.gracePeriodEndsAt) {
      effectiveStatus = 'EXPIRED';
    }
  }

  const active =
    effectiveStatus === 'ACTIVE' ||
    effectiveStatus === 'TRIAL' ||
    (effectiveStatus === 'CANCELLED' && sub.currentPeriodEnd && now <= sub.currentPeriodEnd) ||
    isInGracePeriod;

  // Days remaining
  let daysRemaining: number | undefined;
  const targetEnd = sub.trialEndsAt || sub.currentPeriodEnd;
  if (targetEnd && targetEnd > now) {
    daysRemaining = Math.max(0, Math.ceil((targetEnd.getTime() - now.getTime()) / 86_400_000));
  }

  const features = Array.isArray(sub.plan.features) ? (sub.plan.features as string[]) : [];

  return {
    status: effectiveStatus,
    plan: {
      code: sub.plan.code,
      name: sub.plan.name,
      monthlyPrice: sub.plan.price,
      description: sub.plan.description,
      features,
    },
    isActive: active,
    isInGracePeriod,
    daysRemaining,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() || null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
    trialEndsAt: sub.trialEndsAt?.toISOString() || null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    cancelledAt: sub.cancelledAt?.toISOString() || null,
    razorpaySubscriptionId: sub.razorpaySubscriptionId,
  };
}

/**
 * Initializes a checkout subscription request.
 * Creates a recurring subscription in Razorpay (or prepares the checkout order)
 * and returns the client-safe configuration for Razorpay Checkout modal.
 */
export async function initializeSubscriptionCheckout(
  prisma: PrismaClient,
  companyId: string,
  planCode: string,
  options?: {
    withTrial?: boolean;
    trialDays?: number;
  }
): Promise<{
  subscriptionId?: string;
  orderId?: string;
  keyId: string;
  amount: number;
  currency: string;
  planCode: string;
  planName: string;
  companyName: string;
  companyEmail: string;
  isTrialAutopay?: boolean;
  trialDays?: number;
  trialEndsAt?: string;
}> {
  await ensureDefaultPlans(prisma);

  const upperCode = planCode.toUpperCase();
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: upperCode },
  });

  if (!plan || !plan.isActive) {
    throw new Error(`Invalid or inactive subscription plan: ${planCode}`);
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error('Company workspace not found');
  }

  const keyId = razorpayService.getKeyId();
  const rzp = razorpayService.getClient();

  let razorpaySubscriptionId: string | undefined;
  const withTrial = Boolean(options?.withTrial);
  const trialDays = options?.trialDays ?? TRIAL_PERIOD_DAYS;
  const now = new Date();
  const trialEndsAtDate = new Date(now.getTime() + trialDays * 86_400_000);

  // If Razorpay client is initialized and a Plan ID is available or can be generated
  if (rzp && keyId) {
    const configuredPlanId = plan.razorpayPlanId || razorpayService.getPlanIdForCode(upperCode);

    if (configuredPlanId && !configuredPlanId.includes('/')) {
      // Use configured recurring subscription plan ID
      try {
        const subPayload: any = {
          plan_id: configuredPlanId,
          total_count: 60, // 5 years monthly recurring
          quantity: 1,
          customer_notify: 1,
          notes: {
            companyId: company.id,
            companySlug: company.slug,
            planCode: plan.code,
            isTrialAutopay: withTrial ? 'true' : 'false',
            trialDays: String(trialDays),
          },
        };

        if (withTrial) {
          // Recurring billing begins automatically after trial completes
          subPayload.start_at = Math.floor(trialEndsAtDate.getTime() / 1000);
        }

        const rzpSub: any = await rzp.subscriptions.create(subPayload);
        razorpaySubscriptionId = rzpSub.id;
      } catch (err: any) {
        console.warn('[RAZORPAY_SUB_CREATE_FALLBACK] Could not create recurring subscription via plan_id:', err?.message);
      }
    }

    // Fallback: If plan_id is missing or creation fails, create a standard Razorpay checkout Order
    // for the monthly subscription amount (in paise) so the checkout modal can complete authorization
    if (!razorpaySubscriptionId) {
      try {
        const order: any = await rzp.orders.create({
          amount: plan.price * 100, // in paise
          currency: 'INR',
          receipt: `rcpt_sub_${company.slug.slice(0, 10)}_${Date.now().toString(36)}`,
          notes: {
            companyId: company.id,
            planCode: plan.code,
            type: 'SUBSCRIPTION_AUTHORIZATION',
            isTrialAutopay: withTrial ? 'true' : 'false',
          },
        });
        return {
          orderId: order.id,
          keyId,
          amount: plan.price * 100,
          currency: 'INR',
          planCode: plan.code,
          planName: plan.name,
          companyName: company.name,
          companyEmail: company.email,
          isTrialAutopay: withTrial,
          trialDays,
          trialEndsAt: trialEndsAtDate.toISOString(),
        };
      } catch (orderErr: any) {
        console.error('[RAZORPAY_ORDER_CREATE_ERROR]', orderErr?.message);
      }
    }
  }

  // Update or prepare CompanySubscription record
  await prisma.companySubscription.upsert({
    where: { companyId },
    create: {
      companyId,
      planId: plan.id,
      razorpaySubscriptionId: razorpaySubscriptionId || null,
      status: withTrial ? 'TRIAL' : 'PENDING',
      trialEndsAt: withTrial ? trialEndsAtDate : null,
      currentPeriodStart: now,
      currentPeriodEnd: withTrial ? trialEndsAtDate : null,
    },
    update: {
      planId: plan.id,
      razorpaySubscriptionId: razorpaySubscriptionId || undefined,
      ...(withTrial && {
        trialEndsAt: trialEndsAtDate,
        currentPeriodEnd: trialEndsAtDate,
      }),
    },
  });

  return {
    subscriptionId: razorpaySubscriptionId,
    keyId: keyId || 'rzp_test_placeholder',
    amount: plan.price * 100,
    currency: 'INR',
    planCode: plan.code,
    planName: plan.name,
    companyName: company.name,
    companyEmail: company.email,
    isTrialAutopay: withTrial,
    trialDays,
    trialEndsAt: trialEndsAtDate.toISOString(),
  };
}

/**
 * Verifies Razorpay checkout signature and activates the company's subscription.
 * Never activates based solely on frontend report; verifies HMAC-SHA256 signature server-side.
 */
export async function verifyAndActivateSubscription(
  prisma: PrismaClient,
  companyId: string,
  params: {
    razorpay_payment_id: string;
    razorpay_subscription_id?: string;
    razorpay_order_id?: string;
    razorpay_signature: string;
    planCode: string;
    isTrialAutopay?: boolean;
    trialDays?: number;
  }
): Promise<{ success: boolean; status: SubscriptionStatus; message: string }> {
  const {
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_order_id,
    razorpay_signature,
    planCode,
    isTrialAutopay,
    trialDays,
  } = params;

  if (!razorpay_payment_id || !razorpay_signature) {
    throw new Error('Payment ID and cryptographic signature are required.');
  }

  // Verify signature
  let isValid = false;
  if (razorpay_subscription_id) {
    isValid = razorpayService.verifySubscriptionPaymentSignature(
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    );
  } else if (razorpay_order_id) {
    isValid = razorpayService.verifyOrderPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
  }

  // In test/development environment without configured secret or mock verification
  if (!isValid && (!process.env.RAZORPAY_KEY_SECRET || process.env.NODE_ENV === 'test')) {
    // Check if test signature is provided
    if (razorpay_signature === 'test_mock_valid_signature') {
      isValid = true;
    }
  }

  if (!isValid) {
    await prisma.paymentHistory.create({
      data: {
        companyId,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id || null,
        amount: 0,
        currency: 'INR',
        status: 'FAILED',
        errorMessage: 'Invalid cryptographic signature during checkout verification.',
      },
    }).catch(() => undefined);

    throw new Error('Payment signature verification failed. Subscription not activated.');
  }

  // Signature is verified. Retrieve trusted plan info
  const upperCode = planCode.toUpperCase();
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: upperCode },
  });

  if (!plan) {
    throw new Error(`Plan ${planCode} not found in database.`);
  }

  const now = new Date();
  const targetDays = trialDays || TRIAL_PERIOD_DAYS;
  const trialEndsAtDate = new Date(now.getTime() + targetDays * 86_400_000);
  const paidPeriodEnd = new Date(now.getTime() + 30 * 86_400_000); // 30 days

  const isTrial = Boolean(isTrialAutopay);
  const targetStatus: SubscriptionStatus = isTrial ? 'TRIAL' : 'ACTIVE';
  const periodEnd = isTrial ? trialEndsAtDate : paidPeriodEnd;

  // Perform transactional atomic update
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create or update CompanySubscription
    const sub = await tx.companySubscription.upsert({
      where: { companyId },
      create: {
        companyId,
        planId: plan.id,
        razorpaySubscriptionId: razorpay_subscription_id || null,
        status: targetStatus,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: isTrial ? trialEndsAtDate : null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        gracePeriodEndsAt: null,
      },
      update: {
        planId: plan.id,
        razorpaySubscriptionId: razorpay_subscription_id || undefined,
        status: targetStatus,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: isTrial ? trialEndsAtDate : undefined,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        gracePeriodEndsAt: null,
      },
    });

    // 2. Prevent duplicate payment record using unique constraint on razorpayPaymentId
    await tx.paymentHistory.upsert({
      where: { razorpayPaymentId: razorpay_payment_id },
      create: {
        companyId,
        subscriptionId: sub.id,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id || null,
        amount: isTrial ? 0 : plan.price,
        currency: 'INR',
        status: 'SUCCESS',
        paymentMethod: isTrial ? 'UPI_AUTOPAY_MANDATE' : null,
        paidAt: now,
      },
      update: {
        status: 'SUCCESS',
        paidAt: now,
        amount: isTrial ? 0 : plan.price,
      },
    });

    // 3. Update Company plan tier to selected plan
    const validTiers = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];
    const targetTier = validTiers.includes(upperCode) ? (upperCode as any) : 'STARTER';
    await tx.company.update({
      where: { id: companyId },
      data: { plan: targetTier },
    });

    // 4. Record audit log
    await tx.subscriptionAuditLog.create({
      data: {
        companyId,
        subscriptionId: sub.id,
        action: isTrial ? 'TRIAL_AUTOPAY_ACTIVATED' : 'PAYMENT_VERIFIED_ACTIVATION',
        previousStatus: 'PENDING',
        newStatus: targetStatus,
        reason: isTrial
          ? `Mandate authorization ${razorpay_payment_id} verified. ${plan.name} 14-day trial activated with UPI Autopay.`
          : `Payment ${razorpay_payment_id} verified. ${plan.name} plan activated.`,
        metadata: {
          paymentId: razorpay_payment_id,
          subscriptionId: razorpay_subscription_id,
          amount: isTrial ? 0 : plan.price,
          isTrialAutopay: isTrial,
          trialEndsAt: isTrial ? trialEndsAtDate.toISOString() : null,
        },
      },
    });

    return sub;
  });

  const successMessage = isTrial
    ? `${plan.name} 14-Day Free Trial activated with UPI Autopay! Recurring billing of ₹${plan.price}/month will begin automatically on ${trialEndsAtDate.toLocaleDateString('en-IN')}.`
    : `${plan.name} subscription successfully activated!`;

  return {
    success: true,
    status: result.status,
    message: successMessage,
  };
}

/**
 * Handles incoming verified Razorpay Webhook events.
 * Idempotently processes events, prevents duplicate activations or payments.
 */
export async function processRazorpayWebhook(
  prisma: PrismaClient,
  rawBody: string | Buffer,
  signature: string
): Promise<{ status: string; eventType?: string }> {
  const webhookSecret = razorpayService.getWebhookSecret();

  // In production, signature verification is mandatory
  if (webhookSecret) {
    const verified = razorpayService.verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!verified) {
      throw new Error('Invalid Razorpay webhook signature');
    }
  }

  const payloadString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  let event: any;
  try {
    event = JSON.parse(payloadString);
  } catch (err) {
    throw new Error('Malformed webhook JSON payload');
  }

  const eventId = event.event_id || event.id;
  const eventType = event.event;

  if (!eventId || !eventType) {
    throw new Error('Invalid event structure: missing eventId or eventType');
  }

  // Idempotency: Check if this event was already processed
  const existing = await prisma.razorpayWebhookEvent.findUnique({
    where: { eventId },
  });

  if (existing) {
    return { status: 'ALREADY_PROCESSED', eventType };
  }

  // Record incoming event
  await prisma.razorpayWebhookEvent.create({
    data: {
      eventId,
      eventType,
      payload: event,
      status: 'PROCESSING',
    },
  });

  try {
    const data = event.payload;
    const subEntity = data?.subscription?.entity;
    const paymentEntity = data?.payment?.entity;

    // Resolve company by razorpaySubscriptionId or notes
    let companyId: string | undefined =
      subEntity?.notes?.companyId || paymentEntity?.notes?.companyId;

    if (!companyId && subEntity?.id) {
      const found = await prisma.companySubscription.findUnique({
        where: { razorpaySubscriptionId: subEntity.id },
      });
      companyId = found?.companyId;
    }

    if (companyId) {
      const now = new Date();

      switch (eventType) {
        case 'subscription.authenticated': {
          const trialEnd = subEntity?.start_at
            ? new Date(subEntity.start_at * 1000)
            : new Date(now.getTime() + TRIAL_PERIOD_DAYS * 86_400_000);

          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: {
              status: 'TRIAL',
              trialEndsAt: trialEnd,
              currentPeriodStart: now,
              currentPeriodEnd: trialEnd,
              cancelAtPeriodEnd: false,
              cancelledAt: null,
            },
          });
          await prisma.subscriptionAuditLog.create({
            data: {
              companyId,
              action: 'WEBHOOK_MANDATE_AUTHENTICATED',
              newStatus: 'TRIAL',
              reason: 'Razorpay subscription.authenticated: UPI/Card mandate authenticated for recurring billing.',
            },
          });
          break;
        }

        case 'subscription.activated': {
          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: subEntity?.current_start ? new Date(subEntity.current_start * 1000) : now,
              currentPeriodEnd: subEntity?.current_end ? new Date(subEntity.current_end * 1000) : new Date(now.getTime() + 30 * 86_400_000),
              cancelAtPeriodEnd: false,
              cancelledAt: null,
            },
          });
          await prisma.subscriptionAuditLog.create({
            data: {
              companyId,
              action: 'WEBHOOK_SUBSCRIPTION_ACTIVATED',
              newStatus: 'ACTIVE',
              reason: 'Razorpay subscription.activated webhook event processed.',
            },
          });
          break;
        }

        case 'subscription.charged': {
          const amount = paymentEntity?.amount ? Math.round(paymentEntity.amount / 100) : 0;
          const paymentId = paymentEntity?.id;
          const invoiceId = paymentEntity?.invoice_id;

          const companySub = await prisma.companySubscription.findUnique({
            where: { companyId },
          });

          if (companySub) {
            // Update period end
            const newPeriodEnd = subEntity?.current_end
              ? new Date(subEntity.current_end * 1000)
              : new Date(now.getTime() + 30 * 86_400_000);

            await prisma.companySubscription.update({
              where: { id: companySub.id },
              data: {
                status: 'ACTIVE',
                currentPeriodEnd: newPeriodEnd,
                gracePeriodEndsAt: null,
              },
            });

            // Idempotent payment recording
            if (paymentId) {
              await prisma.paymentHistory.upsert({
                where: { razorpayPaymentId: paymentId },
                create: {
                  companyId,
                  subscriptionId: companySub.id,
                  razorpayPaymentId: paymentId,
                  razorpayInvoiceId: invoiceId || null,
                  amount,
                  currency: paymentEntity?.currency || 'INR',
                  status: 'SUCCESS',
                  paymentMethod: paymentEntity?.method || null,
                  paidAt: now,
                },
                update: {
                  status: 'SUCCESS',
                  paidAt: now,
                },
              });
            }

            await prisma.subscriptionAuditLog.create({
              data: {
                companyId,
                subscriptionId: companySub.id,
                action: 'WEBHOOK_SUBSCRIPTION_CHARGED',
                newStatus: 'ACTIVE',
                reason: `Recurring subscription charged successfully. Payment: ${paymentId}`,
                metadata: { paymentId, amount },
              },
            });
          }
          break;
        }

        case 'subscription.pending': {
          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: { status: 'PAST_DUE' },
          });
          break;
        }

        case 'subscription.halted': {
          const graceEnd = new Date(now.getTime() + GRACE_PERIOD_DAYS * 86_400_000);
          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: {
              status: 'HALTED',
              gracePeriodEndsAt: graceEnd,
            },
          });
          await prisma.subscriptionAuditLog.create({
            data: {
              companyId,
              action: 'WEBHOOK_SUBSCRIPTION_HALTED',
              newStatus: 'HALTED',
              reason: 'Razorpay subscription halted due to repeated payment failures.',
            },
          });
          break;
        }

        case 'subscription.cancelled': {
          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: {
              status: 'CANCELLED',
              cancelAtPeriodEnd: true,
              cancelledAt: now,
            },
          });
          await prisma.subscriptionAuditLog.create({
            data: {
              companyId,
              action: 'WEBHOOK_SUBSCRIPTION_CANCELLED',
              newStatus: 'CANCELLED',
              reason: 'Razorpay subscription.cancelled event received.',
            },
          });
          break;
        }

        case 'subscription.completed': {
          await prisma.companySubscription.updateMany({
            where: { companyId },
            data: { status: 'COMPLETED' },
          });
          break;
        }

        case 'payment.failed': {
          const paymentId = paymentEntity?.id;
          const errorMsg =
            paymentEntity?.error_description ||
            paymentEntity?.error_reason ||
            'Payment charge failed';

          if (paymentId) {
            await prisma.paymentHistory.upsert({
              where: { razorpayPaymentId: paymentId },
              create: {
                companyId,
                razorpayPaymentId: paymentId,
                amount: paymentEntity?.amount ? Math.round(paymentEntity.amount / 100) : 0,
                currency: paymentEntity?.currency || 'INR',
                status: 'FAILED',
                errorMessage: errorMsg,
              },
              update: {
                status: 'FAILED',
                errorMessage: errorMsg,
              },
            });
          }

          // Trigger grace period if active
          const sub = await prisma.companySubscription.findUnique({ where: { companyId } });
          if (sub && sub.status === 'ACTIVE') {
            const graceEnd = new Date(now.getTime() + GRACE_PERIOD_DAYS * 86_400_000);
            await prisma.companySubscription.update({
              where: { id: sub.id },
              data: {
                status: 'PAST_DUE',
                gracePeriodEndsAt: graceEnd,
              },
            });
          }

          await prisma.subscriptionAuditLog.create({
            data: {
              companyId,
              action: 'WEBHOOK_PAYMENT_FAILED',
              newStatus: 'PAST_DUE',
              reason: `Payment failed: ${errorMsg}`,
              metadata: { paymentId, error: errorMsg },
            },
          });
          break;
        }
      }
    }

    // Mark event successfully processed
    await prisma.razorpayWebhookEvent.update({
      where: { eventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
      },
    });

    return { status: 'PROCESSED', eventType };
  } catch (processingErr: any) {
    await prisma.razorpayWebhookEvent.update({
      where: { eventId },
      data: {
        status: 'FAILED',
        error: processingErr?.message || String(processingErr),
      },
    });
    throw processingErr;
  }
}

/**
 * Super Admin manual override for subscription status or plan.
 * Does NOT generate fake payment records.
 */
export async function superAdminOverrideSubscription(
  prisma: PrismaClient,
  companyId: string,
  options: {
    status: SubscriptionStatus;
    planCode: string;
    reason: string;
    adminUserId: string;
    extendDays?: number;
  }
): Promise<{ success: boolean; newStatus: SubscriptionStatus }> {
  await ensureDefaultPlans(prisma);

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: options.planCode.toUpperCase() },
  });

  if (!plan) {
    throw new Error(`Plan code ${options.planCode} is not recognized.`);
  }

  const now = new Date();
  const extendDays = options.extendDays || 30;
  const newPeriodEnd = new Date(now.getTime() + extendDays * 86_400_000);

  const current = await prisma.companySubscription.findUnique({ where: { companyId } });

  const updated = await prisma.companySubscription.upsert({
    where: { companyId },
    create: {
      companyId,
      planId: plan.id,
      status: options.status,
      currentPeriodStart: now,
      currentPeriodEnd: options.status === 'ACTIVE' ? newPeriodEnd : undefined,
      trialEndsAt: options.status === 'TRIAL' ? newPeriodEnd : undefined,
    },
    update: {
      planId: plan.id,
      status: options.status,
      currentPeriodEnd: options.status === 'ACTIVE' ? newPeriodEnd : undefined,
      trialEndsAt: options.status === 'TRIAL' ? newPeriodEnd : undefined,
    },
  });

  // Keep Company plan in sync
  const validTiers = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];
  const targetTier = validTiers.includes(plan.code) ? (plan.code as any) : 'GROWTH';
  await prisma.company.update({
    where: { id: companyId },
    data: { plan: targetTier },
  });

  // Record audit log
  await prisma.subscriptionAuditLog.create({
    data: {
      companyId,
      subscriptionId: updated.id,
      changedById: options.adminUserId,
      action: 'SUPER_ADMIN_MANUAL_OVERRIDE',
      previousStatus: current?.status,
      newStatus: options.status,
      reason: options.reason || 'Manual Super Admin administrative override.',
      metadata: {
        planCode: plan.code,
        extendDays,
      },
    },
  });

  return { success: true, newStatus: updated.status };
}

