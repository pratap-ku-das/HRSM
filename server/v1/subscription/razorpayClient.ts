import crypto from 'node:crypto';
import Razorpay from 'razorpay';

export interface RazorpayPlanConfig {
  code: 'STARTER' | 'GROWTH' | 'BUSINESS';
  name: string;
  monthlyPrice: number; // in INR
  razorpayPlanId?: string;
  description: string;
  features: string[];
}

export const OFFICIAL_PLANS: Record<string, RazorpayPlanConfig> = {
  STARTER: {
    code: 'STARTER',
    name: 'Starter',
    monthlyPrice: 299,
    razorpayPlanId: 'plan_TuuMdHpeaiEYC5',
    description: 'Ideal for early-stage companies streamlining core people operations.',
    features: [
      'Up to 25 employees',
      'Employee Directory & Profile Management',
      'Attendance & Leave Tracking',
      'Indian Statutory Payroll (EPF, ESI, TDS)',
      'Employee Self-Service Mobile & Web',
      'Standard Support'
    ]
  },
  GROWTH: {
    code: 'GROWTH',
    name: 'Growth',
    monthlyPrice: 799,
    razorpayPlanId: 'plan_TuuMdUMEYueayb',
    description: 'Complete workforce administration, automation, and compliance for expanding teams.',
    features: [
      'Up to 100 employees',
      'Everything in Starter',
      'Face-Auth Attendance & Geofencing',
      'Multi-Stage Approval Workflows',
      'Expense Reimbursements & Claims',
      'Recruitment & Applicant Tracking (ATS)',
      'Priority Email & Chat Support'
    ]
  },
  BUSINESS: {
    code: 'BUSINESS',
    name: 'Business',
    monthlyPrice: 1199,
    razorpayPlanId: 'plan_TuuMdgt8dsZOyu',
    description: 'Advanced governance, audit trails, and multi-branch management for enterprises.',
    features: [
      'Unlimited employees',
      'Everything in Growth',
      'SOC-2 Compliant System & Audit Trails',
      'Multi-Location Branches & Cost Centers',
      'Performance Review & OKR Cycles',
      'Statutory Compliance Reminders & Automation',
      'Dedicated Account Manager & 24/7 SLA'
    ]
  }
};

export class RazorpayService {
  private client: Razorpay | null = null;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    this.keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    this.webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

    if (this.keyId && this.keySecret) {
      try {
        this.client = new Razorpay({
          key_id: this.keyId,
          key_secret: this.keySecret,
        });
      } catch (err: any) {
        console.error('[RAZORPAY_INIT_ERROR] Failed to initialize Razorpay client:', err?.message || err);
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  public getKeyId(): string {
    return this.keyId;
  }

  public getClient(): Razorpay | null {
    return this.client;
  }

  public getWebhookSecret(): string {
    return this.webhookSecret;
  }

  /**
   * Resolves the configured Razorpay Plan ID for a plan code.
   */
  public getPlanIdForCode(code: string): string | undefined {
    const upper = code.toUpperCase();
    const envVal =
      upper === 'STARTER'
        ? process.env.RAZORPAY_PLAN_STARTER?.trim()
        : upper === 'GROWTH'
        ? process.env.RAZORPAY_PLAN_GROWTH?.trim()
        : upper === 'BUSINESS'
        ? process.env.RAZORPAY_PLAN_BUSINESS?.trim()
        : undefined;

    if (envVal && envVal.startsWith('plan_')) {
      return envVal;
    }
    return OFFICIAL_PLANS[upper]?.razorpayPlanId;
  }

  /**
   * Cryptographically verifies Razorpay Webhook signature using HMAC-SHA256 with the raw request body.
   */
  public verifyWebhookSignature(rawBody: string | Buffer, signature: string, secretOverride?: string): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!signature || !secret) {
      return false;
    }
    try {
      const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch (err) {
      return false;
    }
  }

  /**
   * Cryptographically verifies Razorpay Checkout Payment signature for Subscriptions.
   * Signature formula for subscriptions:
   * hmac_sha256(razorpay_payment_id + "|" + razorpay_subscription_id, secret)
   */
  public verifySubscriptionPaymentSignature(
    paymentId: string,
    subscriptionId: string,
    signature: string
  ): boolean {
    if (!paymentId || !subscriptionId || !signature || !this.keySecret) {
      return false;
    }
    try {
      const payload = `${paymentId}|${subscriptionId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Cryptographically verifies Razorpay Order Payment signature.
   * Formula: hmac_sha256(razorpay_order_id + "|" + razorpay_payment_id, secret)
   */
  public verifyOrderPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    if (!orderId || !paymentId || !signature || !this.keySecret) {
      return false;
    }
    try {
      const payload = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }
}

export const razorpayService = new RazorpayService();

