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
  router.use('/me/assets', authenticate);

  router.get('/me/assets', async (req: Req, res, next) => {
    try {
      if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;

      const [assets, serviceRequests] = await Promise.all([
        prisma.asset.findMany({
          where: { companyId, assignedToEmployeeId: employeeId },
          orderBy: { assignedDate: 'desc' },
        }),
        prisma.employeeServiceRequest.findMany({
          where: {
            companyId,
            employeeId,
            type: { in: ['ASSET_ACKNOWLEDGEMENT', 'ASSET_RETURN', 'ASSET_ISSUE'] },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const items = assets.map(asset => {
        const relatedRequests = serviceRequests.filter(
          r => (r.payload as Record<string, unknown> | null)?.assetId === asset.id
        );
        const ackRequest = relatedRequests.find(r => r.type === 'ASSET_ACKNOWLEDGEMENT');
        const pendingReturn = relatedRequests.find(r => r.type === 'ASSET_RETURN' && r.status === 'PENDING');
        const pendingIssue = relatedRequests.find(r => r.type === 'ASSET_ISSUE' && r.status === 'PENDING');

        return {
          id: asset.id,
          name: asset.name,
          category: asset.category,
          serialNumber: asset.serialNumber,
          assignedDate: asset.assignedDate,
          purchaseDate: asset.purchaseDate,
          status: asset.status,
          condition: asset.condition,
          isAcknowledged: Boolean(ackRequest),
          acknowledgedAt: (ackRequest?.payload as Record<string, unknown> | null)?.acknowledgedAt || null,
          hasPendingReturn: Boolean(pendingReturn),
          hasPendingIssue: Boolean(pendingIssue),
          returnRequestStatus: pendingReturn ? pendingReturn.status : null,
          recentRequests: relatedRequests.slice(0, 3).map(r => ({
            id: r.id,
            type: r.type,
            title: r.title,
            status: r.status,
            createdAt: r.createdAt,
          })),
        };
      });

      return ok(res, items);
    } catch (error) { next(error); }
  });

  router.post('/me/assets/:id/acknowledge', async (req: Req, res, next) => {
    try {
      if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
      const body = z.object({
        notes: z.string().trim().max(500).optional(),
        deviceInfo: z.string().trim().max(200).optional(),
      }).parse(req.body);

      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;
      const asset = await prisma.asset.findFirst({
        where: { id: String(req.params.id), companyId, assignedToEmployeeId: employeeId },
      });
      if (!asset) return fail(res, 404, 'ASSET_NOT_FOUND', 'Asset was not found or is not assigned to you.');

      const existingAck = await prisma.employeeServiceRequest.findFirst({
        where: {
          companyId,
          employeeId,
          type: 'ASSET_ACKNOWLEDGEMENT',
          payload: { path: ['assetId'], equals: asset.id },
        },
      });
      if (existingAck) {
        return ok(res, { success: true, message: 'Asset already acknowledged.', alreadyAcknowledged: true });
      }

      const timestamp = new Date().toISOString();
      const request = await prisma.employeeServiceRequest.create({
        data: {
          companyId,
          employeeId,
          type: 'ASSET_ACKNOWLEDGEMENT',
          title: `Asset Receipt Acknowledged: ${asset.name}`,
          reason: body.notes || 'Asset received in good condition.',
          status: 'APPROVED',
          payload: {
            assetId: asset.id,
            assetName: asset.name,
            serialNumber: asset.serialNumber,
            acknowledgedAt: timestamp,
            deviceInfo: body.deviceInfo || 'OrbitHR Android App',
            notes: body.notes || null,
          } as Prisma.InputJsonValue,
        },
      });

      await prisma.auditLog.create({
        data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'ACKNOWLEDGE_ASSET',
          category: 'OPERATIONS',
          details: `Employee ${employeeId} acknowledged receipt of asset ${asset.name} (${asset.serialNumber}). Notes: ${body.notes || 'None'}. Device: ${body.deviceInfo || 'Android'}`,
          ipAddress: req.ip || 'unknown',
        },
      });

      return ok(res, {
        success: true,
        assetId: asset.id,
        acknowledgedAt: timestamp,
        requestId: request.id,
      });
    } catch (error) { next(error); }
  });

  router.post('/me/assets/:id/return-request', async (req: Req, res, next) => {
    try {
      if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
      const body = z.object({
        reason: z.string().trim().min(3).max(1000),
        condition: z.string().trim().max(100).optional(),
      }).parse(req.body);

      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;
      const asset = await prisma.asset.findFirst({
        where: { id: String(req.params.id), companyId, assignedToEmployeeId: employeeId },
      });
      if (!asset) return fail(res, 404, 'ASSET_NOT_FOUND', 'Asset was not found or is not assigned to you.');

      const pending = await prisma.employeeServiceRequest.findFirst({
        where: {
          companyId,
          employeeId,
          type: 'ASSET_RETURN',
          status: 'PENDING',
          payload: { path: ['assetId'], equals: asset.id },
        },
      });
      if (pending) {
        return fail(res, 409, 'RETURN_ALREADY_REQUESTED', 'A pending return request already exists for this asset.');
      }

      const request = await prisma.$transaction(async tx => {
        const reqRecord = await tx.employeeServiceRequest.create({
          data: {
            companyId,
            employeeId,
            type: 'ASSET_RETURN',
            title: `Asset Return Request: ${asset.name} (${asset.serialNumber})`,
            reason: body.reason,
            status: 'PENDING',
            payload: {
              assetId: asset.id,
              assetName: asset.name,
              serialNumber: asset.serialNumber,
              currentCondition: body.condition || asset.condition,
              requestedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        let workflow: { id: string } | null = null;
        try {
          workflow = await startConfiguredWorkflow(tx, {
            companyId,
            requesterUserId: req.auth!.id,
            module: 'DOCUMENT',
            subjectType: 'EmployeeServiceRequest',
            subjectId: reqRecord.id,
            title: reqRecord.title,
            summary: body.reason,
            payload: { type: 'ASSET_RETURN', assetId: asset.id },
          });
        } catch (err: any) {
          if (err?.code !== 'WORKFLOW_NOT_CONFIGURED') throw err;
        }

        if (workflow) {
          await tx.employeeServiceRequest.update({
            where: { id: reqRecord.id },
            data: { workflowInstanceId: workflow.id },
          });
        }

        await tx.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'REQUEST_ASSET_RETURN',
            category: 'OPERATIONS',
            details: `Employee ${employeeId} requested return for asset ${asset.name} (${asset.serialNumber}). Reason: ${body.reason}`,
            ipAddress: req.ip || 'unknown',
          },
        });

        return reqRecord;
      });

      return ok(res, {
        success: true,
        message: 'Asset return request submitted to HR/Admin.',
        requestId: request.id,
      }, 201);
    } catch (error) { next(error); }
  });

  router.post('/me/assets/:id/report-issue', async (req: Req, res, next) => {
    try {
      if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
      const body = z.object({
        issueDescription: z.string().trim().min(5).max(1000),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      }).parse(req.body);

      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;
      const asset = await prisma.asset.findFirst({
        where: { id: String(req.params.id), companyId, assignedToEmployeeId: employeeId },
      });
      if (!asset) return fail(res, 404, 'ASSET_NOT_FOUND', 'Asset was not found or is not assigned to you.');

      const request = await prisma.employeeServiceRequest.create({
        data: {
          companyId,
          employeeId,
          type: 'ASSET_ISSUE',
          title: `Asset Issue Reported: ${asset.name} [${body.severity}]`,
          reason: body.issueDescription,
          status: 'PENDING',
          payload: {
            assetId: asset.id,
            assetName: asset.name,
            serialNumber: asset.serialNumber,
            severity: body.severity,
            reportedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      await prisma.auditLog.create({
        data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'REPORT_ASSET_ISSUE',
          category: 'OPERATIONS',
          details: `Issue reported for asset ${asset.name} (${asset.serialNumber}): ${body.issueDescription} [Severity: ${body.severity}]`,
          ipAddress: req.ip || 'unknown',
        },
      });

      return ok(res, {
        success: true,
        message: 'Asset issue reported successfully.',
        requestId: request.id,
      }, 201);
    } catch (error) { next(error); }
  });

  return router;
}
