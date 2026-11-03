import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { processRazorpayWebhook } from './subscriptionManager.js';
import { razorpayService } from './razorpayClient.js';

export function createRazorpayWebhookRouter(prisma: PrismaClient) {
  const router = Router();

  /**
   * POST /webhooks/razorpay or /api/webhooks/razorpay
   * Handles incoming webhooks from Razorpay with raw body verification.
   */
  router.post('/webhooks/razorpay', async (req: Request, res: Response) => {
    const signature = (req.headers['x-razorpay-signature'] as string) || '';

    // Extract raw body
    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const webhookSecret = razorpayService.getWebhookSecret() || process.env.RAZORPAY_WEBHOOK_SECRET;

    // SEC-FIX: Fail CLOSED — require both a configured secret AND a signature.
    // In production, reject unconfigured webhooks with 503.
    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      console.error('[RAZORPAY_WEBHOOK_ERROR] RAZORPAY_WEBHOOK_SECRET is not configured — rejecting webhook.');
      return res.status(503).json({ error: 'Webhook endpoint is not configured on this server.' });
    }
    if (!signature) {
      return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
    }

    try {
      const result = await processRazorpayWebhook(prisma, rawBody, signature);
      return res.status(200).json({ status: 'ok', result });
    } catch (err: any) {
      console.error('[RAZORPAY_WEBHOOK_ERROR]', err?.message || err);
      return res.status(400).json({ error: err?.message || 'Webhook processing failed' });
    }
  });

  return router;
}

