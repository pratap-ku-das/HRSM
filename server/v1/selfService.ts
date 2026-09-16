import { Router, type Request, type RequestHandler, type Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { startConfiguredWorkflow } from './workflows.js';

type Req = Request & { auth?: { id: string; companyId: string; role: string; employeeId?: string; permissions: string[] }; requestId?: string };
const types = ['DOCUMENT_REQUEST', 'SALARY_CERTIFICATE', 'ADVANCE'] as const;
export function createSelfServiceRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use('/me/service-requests', authenticate);
  router.get('/me/service-requests', async (req: Req, res, next) => { try { if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.'); return ok(res, await prisma.employeeServiceRequest.findMany({ where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId }, orderBy: { createdAt: 'desc' } })); } catch (error) { next(error); } });
  router.post('/me/service-requests', async (req: Req, res, next) => { try {
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    const body = z.object({ type: z.enum(types), title: z.string().trim().min(3).max(160), reason: z.string().trim().min(3).max(2000), amount: z.number().positive().max(10_000_000).optional(), payload: z.record(z.string(), z.unknown()).optional() }).superRefine((value, context) => { if (value.type === 'ADVANCE' && !value.amount) context.addIssue({ code: 'custom', path: ['amount'], message: 'Amount is required for an advance request.' }); }).parse(req.body);
    const auth = req.auth!;
    const result = await prisma.$transaction(async tx => {
      const request = await tx.employeeServiceRequest.create({ data: { type: body.type, title: body.title, reason: body.reason, amount: body.amount, payload: body.payload as Prisma.InputJsonValue | undefined, companyId: auth.companyId, employeeId: auth.employeeId! } });
      const module = body.type === 'ADVANCE' ? 'ADVANCE' : 'DOCUMENT';
      const workflow = await startConfiguredWorkflow(tx, { companyId: auth.companyId, requesterUserId: auth.id, module, subjectType: 'EmployeeServiceRequest', subjectId: request.id, title: body.title, summary: body.reason, payload: { type: body.type, amount: body.amount, ...body.payload } });
      if (workflow) await tx.employeeServiceRequest.update({ where: { id: request.id }, data: { workflowInstanceId: workflow.id } });
      return { ...request, workflowInstanceId: workflow?.id };
    });
    return ok(res, result, 201);
  } catch (error) { next(error); } });
  return router;
}
