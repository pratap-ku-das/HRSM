import crypto from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { encryptMfaSecret, newMfaSecret, verifyMfaCode } from './mfa.js';

type Req = Request & { auth?: { id: string; companyId: string; role: string; employeeId?: string; permissions: string[]; accessScopes?: Array<{ scope: string; scopeEntityId?: string | null; permissions: string[] }> }; requestId?: string };

export function employeeWhere(auth: NonNullable<Req['auth']>) {
  const OR: Record<string, unknown>[] = [];
  if (auth.permissions.includes('employee.read.all')) OR.push({ companyId: auth.companyId });
  if (auth.employeeId && auth.permissions.includes('employee.read.self')) OR.push({ id: auth.employeeId });
  if (auth.employeeId && auth.permissions.includes('employee.read.team')) OR.push({ reportingManagerId: auth.employeeId }, { id: auth.employeeId });
  for (const grant of auth.accessScopes || []) {
    if (!grant.permissions.some(p => p.startsWith('employee.read'))) continue;
    if (grant.scope === 'ALL_COMPANY') OR.push({ companyId: auth.companyId });
    if (grant.scope === 'BRANCH' && grant.scopeEntityId) OR.push({ branchId: grant.scopeEntityId });
    if (grant.scope === 'DEPARTMENT' && grant.scopeEntityId) OR.push({ departmentId: grant.scopeEntityId });
    if (grant.scope === 'TEAM' && grant.scopeEntityId) OR.push({ teamId: grant.scopeEntityId });
  }
  return { companyId: auth.companyId, OR: OR.length ? OR : [{ id: '__none__' }] };
}

export function createGovernanceRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use(authenticate);

  router.get('/search', async (req: Req, res, next) => { try {
    const auth = req.auth!; const q = z.string().trim().min(2).max(80).parse(req.query.q);
    const employees = await prisma.employee.findMany({ where: { ...employeeWhere(auth), OR: [
      { AND: [employeeWhere(auth), { firstName: { contains: q, mode: 'insensitive' } }] },
      { AND: [employeeWhere(auth), { lastName: { contains: q, mode: 'insensitive' } }] },
      { AND: [employeeWhere(auth), { employeeCode: { contains: q, mode: 'insensitive' } }] },
      { AND: [employeeWhere(auth), { email: { contains: q, mode: 'insensitive' } }] },
    ] }, select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true, department: { select: { name: true } }, designation: { select: { title: true } } }, take: 20 });
    const results: unknown[] = employees.flatMap(e => [{ type: 'EMPLOYEE', id: e.id, title: `${e.firstName} ${e.lastName}`, subtitle: `${e.employeeCode} · ${e.designation.title} · ${e.department.name}`, route: 'employees' },...(auth.permissions.includes('attendance.read.team')||e.id===auth.employeeId?[{type:'ATTENDANCE',id:e.id,title:`${e.firstName}'s attendance`,subtitle:'Attendance history and policy results',route:'attendance'}]:[]),...(auth.permissions.includes('leave.review')||e.id===auth.employeeId?[{type:'LEAVE',id:e.id,title:`${e.firstName}'s leave`,subtitle:'Leave requests and balances',route:'leaves'}]:[]),...(auth.permissions.includes('payroll.manage')||e.id===auth.employeeId?[{type:'PAYROLL',id:e.id,title:`${e.firstName}'s payroll`,subtitle:'Permission-filtered payroll history',route:'payroll'}]:[]),{type:'DOCUMENT',id:e.id,title:`${e.firstName}'s documents`,subtitle:'Verified employee documents',route:'documents'},{type:'ASSET',id:e.id,title:`${e.firstName}'s assets`,subtitle:'Assigned equipment',route:'assets'}]);
    const employeeIds=employees.map(e=>e.id);if(employeeIds.length){const[documents,assets]=await prisma.$transaction([prisma.employeeDocument.findMany({where:{companyId:auth.companyId,employeeId:{in:employeeIds},title:{contains:q,mode:'insensitive'}},select:{id:true,title:true,employeeId:true,documentType:true},take:10}),prisma.asset.findMany({where:{companyId:auth.companyId,assignedToEmployeeId:{in:employeeIds},OR:[{name:{contains:q,mode:'insensitive'}},{serialNumber:{contains:q,mode:'insensitive'}}]},select:{id:true,name:true,serialNumber:true},take:10})]);results.push(...documents.map(x=>({type:'DOCUMENT',id:x.id,title:x.title,subtitle:x.documentType,route:'documents'})),...assets.map(x=>({type:'ASSET',id:x.id,title:x.name,subtitle:x.serialNumber,route:'assets'})))}
    if (auth.permissions.includes('audit.read')) {
      const audits = await prisma.auditLog.findMany({ where: { companyId: auth.companyId, OR: [{ action: { contains: q, mode: 'insensitive' } }, { details: { contains: q, mode: 'insensitive' } }] }, orderBy: { timestamp: 'desc' }, take: 10 });
      results.push(...audits.map(a => ({ type: 'AUDIT', id: a.id, title: a.action, subtitle: a.details, route: 'audit' })));
    }
    return ok(res, results);
  } catch (e) { next(e); } });

  router.get('/security/sessions', async (req: Req, res, next) => { try { const sessions = await prisma.refreshToken.findMany({ where: { userId: req.auth!.id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, deviceName: true, ipAddress:true,userAgent:true,createdAt: true, lastUsedAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); return ok(res, sessions); } catch (e) { next(e); } });
  router.delete('/security/sessions/:id', async (req: Req, res, next) => { try { const changed = await prisma.refreshToken.updateMany({ where: { id: String(req.params.id), userId: req.auth!.id, revokedAt: null }, data: { revokedAt: new Date() } }); if (!changed.count) return fail(res, 404, 'SESSION_NOT_FOUND', 'Active session was not found.'); return ok(res, { revoked: true }); } catch (e) { next(e); } });
  router.get('/security/login-history', async (req: Req, res, next) => { try { const where = req.auth!.permissions.includes('audit.read') ? { companyId: req.auth!.companyId } : { userId: req.auth!.id }; return ok(res, await prisma.loginAttempt.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })); } catch (e) { next(e); } });
  router.get('/security/mfa', async (req: Req, res, next) => { try { const method = await prisma.mfaMethod.findUnique({ where: { userId: req.auth!.id }, select: { enabled: true, verifiedAt: true } }); return ok(res, { enabled: method?.enabled || false, verifiedAt: method?.verifiedAt || null }); } catch (e) { next(e); } });
  router.post('/security/mfa/setup', async (req: Req, res, next) => { try { const auth=req.auth!,secret=newMfaSecret(),encryptedSecret=encryptMfaSecret(secret);const user=await prisma.user.findUniqueOrThrow({where:{id:auth.id},select:{email:true}});await prisma.mfaMethod.upsert({where:{userId:auth.id},create:{userId:auth.id,encryptedSecret},update:{encryptedSecret,enabled:false,verifiedAt:null}});return ok(res,{secret,otpauthUri:`otpauth://totp/OrbitHR:${encodeURIComponent(user.email)}?secret=${secret}&issuer=OrbitHR&digits=6&period=30`},201)}catch(e){next(e)}});
  router.post('/security/mfa/confirm', async (req: Req, res, next) => { try { const{code}=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body),method=await prisma.mfaMethod.findUnique({where:{userId:req.auth!.id}});if(!method||!verifyMfaCode(method.encryptedSecret,code))return fail(res,400,'MFA_CODE_INVALID','Authenticator code is invalid.');await prisma.mfaMethod.update({where:{id:method.id},data:{enabled:true,verifiedAt:new Date()}});return ok(res,{enabled:true})}catch(e){next(e)}});
  router.post('/security/mfa/disable', async (req: Req, res, next) => { try { const{code}=z.object({code:z.string().regex(/^\d{6}$/)}).parse(req.body),method=await prisma.mfaMethod.findUnique({where:{userId:req.auth!.id}});if(!method?.enabled||!verifyMfaCode(method.encryptedSecret,code))return fail(res,400,'MFA_CODE_INVALID','Authenticator code is invalid.');await prisma.mfaMethod.delete({where:{id:method.id}});await prisma.refreshToken.updateMany({where:{userId:req.auth!.id,revokedAt:null},data:{revokedAt:new Date()}});return ok(res,{enabled:false,reauthenticationRequired:true})}catch(e){next(e)}});

  router.get('/me/mobile-workspace', async (req: Req, res, next) => { try {
    const auth = req.auth!; if (!auth.employeeId) return fail(res, 404, 'EMPLOYEE_NOT_LINKED', 'Your account is not linked to an employee profile.');
    const [documents, assets, goals, reviews, serviceRequests] = await prisma.$transaction([
      prisma.employeeDocument.findMany({ where: { companyId: auth.companyId, employeeId: auth.employeeId }, select: { id: true, documentType: true, title: true, fileName: true, expiryDate: true, verificationStatus: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.asset.findMany({ where: { companyId: auth.companyId, assignedToEmployeeId: auth.employeeId }, select: { id: true, name: true, category: true, serialNumber: true, status: true, condition: true, assignedDate: true }, orderBy: { assignedDate: 'desc' } }),
      prisma.performanceGoal.findMany({ where: { companyId: auth.companyId, employeeId: auth.employeeId }, select: { id: true, title: true, category: true, targetDate: true, progress: true, status: true }, orderBy: { targetDate: 'desc' } }),
      prisma.performanceReview.findMany({where:{companyId:auth.companyId,employeeId:auth.employeeId},select:{id:true,status:true,overallRating:true,goalRating:true,competencyRating:true,summary:true,cycle:{select:{name:true,endsAt:true}}},orderBy:{createdAt:'desc'}}),
      prisma.employeeServiceRequest.findMany({where:{companyId:auth.companyId,employeeId:auth.employeeId},select:{id:true,type:true,title:true,reason:true,amount:true,status:true,createdAt:true},orderBy:{createdAt:'desc'}}),
    ]); return ok(res, { documents, assets, goals, reviews, serviceRequests });
  } catch (e) { next(e); } });

  router.get('/employee-documents', async (req: Req, res, next) => { try { const auth = req.auth!; const employeeIds = (await prisma.employee.findMany({ where: employeeWhere(auth), select: { id: true } })).map(e => e.id); return ok(res, await prisma.employeeDocument.findMany({ where: { companyId: auth.companyId, employeeId: { in: employeeIds } }, select: { id: true, employeeId: true, documentType: true, title: true, fileName: true, mimeType: true, sizeBytes: true, issueDate: true, expiryDate: true, verificationStatus: true, verifiedAt: true, rejectionReason: true, retentionUntil: true, createdAt: true }, orderBy: { createdAt: 'desc' } })); } catch (e) { next(e); } });
  router.post('/employee-documents', async (req: Req, res, next) => { try { const auth = req.auth!; const body = z.object({ employeeId: z.string().uuid(), documentType: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(160), fileName: z.string().trim().min(1).max(200), mimeType: z.string().max(100), sizeBytes: z.number().int().positive().max(20_000_000), issueDate: z.coerce.date().optional(), expiryDate: z.coerce.date().optional() }).parse(req.body); const allowed = await prisma.employee.findFirst({ where: { ...employeeWhere(auth), id: body.employeeId } }); if (!allowed) return fail(res, 403, 'DOCUMENT_FORBIDDEN', 'Employee is outside your access scope.'); const objectKey = `${auth.companyId}/employees/${body.employeeId}/${crypto.randomUUID()}`; return ok(res, await prisma.employeeDocument.create({ data: { companyId: auth.companyId, objectKey, ...body } }), 201); } catch (e) { next(e); } });
  router.post('/employee-documents/:id/review', async (req: Req, res, next) => { try { const auth = req.auth!; if (!auth.permissions.includes('employee.manage')) return fail(res, 403, 'FORBIDDEN', 'Employee management permission is required.'); const body = z.object({ status: z.enum(['VERIFIED', 'REJECTED']), reason: z.string().max(500).optional() }).parse(req.body); const doc = await prisma.employeeDocument.findFirst({ where: { id: String(req.params.id), companyId: auth.companyId } }); if (!doc) return fail(res, 404, 'DOCUMENT_NOT_FOUND', 'Document was not found.'); return ok(res, await prisma.employeeDocument.update({ where: { id: doc.id }, data: { verificationStatus: body.status, rejectionReason: body.status === 'REJECTED' ? body.reason : null, verifiedById: auth.id, verifiedAt: new Date() } })); } catch (e) { next(e); } });

  return router;
}
