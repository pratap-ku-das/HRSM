import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type AuthRequest = Request & { auth?: { id: string; companyId: string; role: string; permissions: string[] }; requestId?: string };

export const workspaceSettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  legalEntityName: z.string().trim().min(2).max(200),
  taxRegistrationNumber: z.string().trim().max(200),
  currency: z.string().length(3).default('INR'),
  currencySymbol: z.string().min(1).max(10).default('₹'),
  timezone: z.string().trim().min(2).max(100).default('Asia/Kolkata'),
  workDays: z.array(z.number().int().min(0).max(6)).min(1),
  businessHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  businessHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enableAutomaticOvertime: z.boolean(),
  enableAuditLogging: z.boolean(),
  defaultProbationPeriodMonths: z.number().int().min(0).max(36),
}).refine(value => value.businessHoursEnd > value.businessHoursStart, {
  path: ['businessHoursEnd'], message: 'Business end time must be after start time.',
});

export function createSettingsRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown) => res.json({ data, meta: { requestId: (res.req as AuthRequest).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use('/workspace-settings', authenticate);
  router.get('/workspace-settings', async (req: AuthRequest, res, next) => {
    try { return ok(res, await prisma.companySettings.findUnique({ where: { companyId: req.auth!.companyId } })); }
    catch (error) { next(error); }
  });
  router.put('/workspace-settings', async (req: AuthRequest, res, next) => {
    try {
      if (!req.auth!.permissions.includes('company.manage')) return fail(res, 403, 'FORBIDDEN', 'Company management permission is required.');
      const body = workspaceSettingsSchema.parse(req.body);
      const settings = await prisma.$transaction(async tx => {
        const value = await tx.companySettings.upsert({ where: { companyId: req.auth!.companyId }, create: { ...body, companyId: req.auth!.companyId }, update: body });
        await tx.company.update({ where: { id: req.auth!.companyId }, data: { name: body.companyName } });
        await tx.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action: 'UPDATE_WORKSPACE_SETTINGS', category: 'SETTINGS', details: 'Company identity, business hours, timezone, and policy defaults updated.', ipAddress: req.ip || 'unknown' } });
        return value;
      });
      return ok(res, settings);
    } catch (error) { next(error); }
  });
  return router;
}
