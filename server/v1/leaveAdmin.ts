import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { employeeWhere } from './governance.js';

type Req = Request & {
  auth?: { id: string; companyId: string; role: string; employeeId?: string; permissions: string[]; accessScopes?: Array<{ scope: string; scopeEntityId?: string | null; permissions: string[] }> };
  requestId?: string;
};

function categoryCode(name: string) {
  const normalized = name.normalize('NFKD').replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/)
    .map(part => part[0]).join('').toUpperCase().slice(0, 12);
  return normalized || 'LEAVE';
}

export function createLeaveAdminRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use('/leave-administration', authenticate);

  router.get('/leave-administration', async (req: Req, res, next) => {
    try {
      if (!req.auth!.permissions.includes('leave.review')) return fail(res, 403, 'FORBIDDEN', 'Leave review permission is required.');
      const employeeIds = (await prisma.employee.findMany({ where: employeeWhere(req.auth!), select: { id: true } })).map(item => item.id);
      const [types, requests] = await prisma.$transaction([
        prisma.leaveType.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { name: 'asc' } }),
        prisma.leaveRequest.findMany({
          where: { companyId: req.auth!.companyId, employeeId: { in: employeeIds } },
          include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } }, leaveType: true },
          orderBy: { appliedAt: 'desc' }, take: 1000,
        }),
      ]);
      const instances = requests.length ? await prisma.workflowInstance.findMany({
        where: {
          companyId: req.auth!.companyId,
          subjectType: 'LeaveRequest',
          subjectId: { in: requests.map(item => item.id) },
        },
        include: {
          stepInstances: {
            where: { status: 'PENDING' },
            select: { approverUserIds: true },
          },
        },
      }) : [];
      const workflowByRequest = new Map(instances.map(item => [item.subjectId, item]));
      const reviewableRequests = requests.map(item => {
        const workflow = workflowByRequest.get(item.id);
        return {
          ...item,
          workflowInstanceId: workflow?.id,
          workflowStatus: workflow?.status,
          canReview: req.auth!.permissions.includes('workflow.review') &&
            workflow?.status === 'PENDING' &&
            workflow.stepInstances.some(step => step.approverUserIds.includes(req.auth!.id)),
        };
      });
      return ok(res, { types, requests: reviewableRequests });
    } catch (error) { next(error); }
  });

  router.post('/leave-administration/types', async (req: Req, res, next) => {
    try {
      if (!req.auth!.permissions.includes('leave.policy.manage')) return fail(res, 403, 'FORBIDDEN', 'Leave category management permission is required.');
      const { name } = z.object({ name: z.string().trim().min(2).max(120) }).parse(req.body);
      const companyId = req.auth!.companyId;
      const duplicate = await prisma.leaveType.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } } });
      if (duplicate) return fail(res, 409, 'LEAVE_CATEGORY_EXISTS', 'A leave category with this name already exists.');
      const baseCode = categoryCode(name);
      let code = baseCode;
      let suffix = 2;
      while (await prisma.leaveType.findUnique({ where: { companyId_code: { companyId, code } }, select: { id: true } })) {
        const suffixText = String(suffix++);
        code = `${baseCode.slice(0, 20 - suffixText.length)}${suffixText}`;
      }
      const item = await prisma.leaveType.create({ data: { companyId, name, code, daysAllowedPerYear: 365, allowNegative: true } });
      await prisma.auditLog.create({ data: {
        companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role,
        action: 'CREATE_LEAVE_CATEGORY', category: 'LEAVE', details: `Leave category ${item.name} created.`, ipAddress: req.ip || 'unknown',
      } });
      return ok(res, item, 201);
    } catch (error) { next(error); }
  });

  router.delete('/leave-administration/types/:id', async (req: Req, res, next) => {
    try {
      if (!req.auth!.permissions.includes('leave.policy.manage')) return fail(res, 403, 'FORBIDDEN', 'Leave category management permission is required.');
      const id = z.string().uuid().parse(req.params.id);
      const companyId = req.auth!.companyId;
      const item = await prisma.leaveType.findFirst({ where: { id, companyId } });
      if (!item) return fail(res, 404, 'LEAVE_CATEGORY_NOT_FOUND', 'Leave category was not found.');
      if (await prisma.leaveRequest.count({ where: { leaveTypeId: id } })) return fail(res, 409, 'LEAVE_CATEGORY_IN_USE', 'This category is used by leave requests and cannot be deleted.');
      await prisma.leaveType.delete({ where: { id } });
      await prisma.auditLog.create({ data: {
        companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role,
        action: 'DELETE_LEAVE_CATEGORY', category: 'LEAVE', details: `Leave category ${item.name} deleted.`, ipAddress: req.ip || 'unknown',
      } });
      return ok(res, { deleted: true });
    } catch (error) { next(error); }
  });
  return router;
}
