import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { processRazorpayWebhook } from './subscriptionManager.js';

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

    if (!signature && process.env.RAZORPAY_WEBHOOK_SECRET) {
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

