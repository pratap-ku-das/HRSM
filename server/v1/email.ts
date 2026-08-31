import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char] || char));

export function createOpaqueToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

export function onboardingEmail(input: {
  employeeName: string; companyName: string; email: string; activationUrl: string;
  androidUrl: string; supportEmail: string; expiresHours: number;
}) {
  const name = escapeHtml(input.employeeName);
  const company = escapeHtml(input.companyName);
  const email = escapeHtml(input.email);
  const support = escapeHtml(input.supportEmail);
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #dce3ee;border-radius:8px;overflow:hidden">
  <tr><td style="background:#111827;padding:24px 32px;color:#fff"><strong style="font-size:24px">OrbitHR</strong><div style="color:#a7f3d0;margin-top:4px">People operations, connected.</div></td></tr>
  <tr><td style="padding:32px"><h1 style="font-size:24px;margin:0 0 16px">Welcome to ${company}, ${name}</h1>
  <p>Your OrbitHR employee account has been created for <strong>${email}</strong>.</p>
  <p style="margin:28px 0"><a href="${input.activationUrl}" style="background:#059669;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Activate Your Account</a></p>
  <p>This secure activation link expires in ${input.expiresHours} hours. Set your password, then sign in using your registered work email.</p>
  <hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0">
  <h2 style="font-size:18px">Use OrbitHR on Android</h2>
  <p style="margin:24px 0"><a href="${input.androidUrl}" style="border:1px solid #111827;color:#111827;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold">Download OrbitHR Android App</a></p>
  <p style="font-size:13px;color:#64748b">Need help? Contact <a href="mailto:${support}">${support}</a>. If you did not expect this email, contact your HR team.</p>
  </td></tr></table></td></tr></table></body></html>`;
  const text = `Welcome to ${input.companyName}, ${input.employeeName}\n\nYour OrbitHR account is registered to ${input.email}.\nActivate your account: ${input.activationUrl}\nThe link expires in ${input.expiresHours} hours.\nDownload the Android app: ${input.androidUrl}\nSign in with your work email after setting your password.\nSupport: ${input.supportEmail}`;
  return { html, text };
}

export async function deliverOnboardingEmail(prisma: PrismaClient, deliveryId: string, activationToken: string) {
  const delivery = await prisma.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery || delivery.status === 'SENT') return delivery;
  const user = delivery.userId ? await prisma.user.findUnique({ where: { id: delivery.userId }, include: { company: true } }) : null;
  if (!user) throw new Error('Onboarding user not found');
  const webUrl = process.env.WEB_APP_URL || 'http://localhost:5173';
  const content = onboardingEmail({
    employeeName: user.fullName,
    companyName: user.company.name,
    email: user.email,
    activationUrl: `${webUrl.replace(/\/$/, '')}/activate?token=${encodeURIComponent(activationToken)}`,
    androidUrl: process.env.ANDROID_APP_DOWNLOAD_URL || `${webUrl}/android`,
    supportEmail: process.env.HR_SUPPORT_EMAIL || user.company.email,
    expiresHours: 24,
  });
  try {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const response = await resend.emails.send({
      from: `${process.env.RESEND_FROM_NAME || 'OrbitHR'} <${process.env.RESEND_FROM_EMAIL || 'noreply@example.com'}>`,
      to: [delivery.recipient], subject: `Welcome to ${user.company.name} on OrbitHR`, ...content,
    });
    if (response.error) throw new Error(response.error.message);
    return prisma.emailDelivery.update({ where: { id: delivery.id }, data: {
      status: 'SENT', providerId: response.data?.id, sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null, nextAttemptAt: null,
    }});
  } catch (error) {
    const attempts = delivery.attemptCount + 1;
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: {
      status: 'FAILED', attemptCount: attempts, lastError: error instanceof Error ? error.message.slice(0, 500) : 'Email failed',
      nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
    }});
    return null;
  }
}
