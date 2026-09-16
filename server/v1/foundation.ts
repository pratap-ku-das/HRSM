import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type FoundationRequest = Request & { auth?: { id: string; companyId: string; role: string; permissions: string[] }; requestId?: string };
const code = z.string().trim().min(2).max(40).transform(value => value.toUpperCase());
const id = z.string().uuid();
const optionalId = id.nullable().optional();
const optionalText = z.string().trim().max(300).nullable().optional();

export function createFoundationRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as FoundationRequest).requestId } });
  const fail = (res: Response, status: number, errorCode: string, message: string) => res.status(status).json({ error: { code: errorCode, message }, meta: { requestId: (res.req as FoundationRequest).requestId } });
  const requirePermission = (permission: string): RequestHandler => (req: FoundationRequest, res, next) => req.auth?.permissions.includes(permission) ? next() : fail(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  const audit = (req: FoundationRequest, action: string, details: string) => prisma.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action, category: 'FOUNDATION', details, ipAddress: req.ip || 'unknown' } });

  router.use('/organization', authenticate);
  router.get('/organization', requirePermission('organization.read'), async (req: FoundationRequest, res, next) => { try {
    const companyId = req.auth!.companyId;
    const [branches, locations, departments, teams, designations, costCenters, grades] = await prisma.$transaction([
      prisma.branch.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.workLocation.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.department.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.team.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.designation.findMany({ where: { companyId }, orderBy: { title: 'asc' } }),
      prisma.costCenter.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
      prisma.employeeGrade.findMany({ where: { companyId }, orderBy: [{ rank: 'asc' }, { name: 'asc' }] }),
    ]);
    return ok(res, { branches, locations, departments, teams, designations, costCenters, grades });
  } catch (error) { next(error); } });

  router.post('/organization/branches', requirePermission('organization.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(2).max(120), code, legalName: optionalText, timezone: z.string().trim().min(3).max(80).default('Asia/Kolkata'), active: z.boolean().default(true) }).parse(req.body);
    const value = await prisma.branch.create({ data: { ...body, companyId: req.auth!.companyId } });
    await audit(req, 'CREATE_BRANCH', `Branch ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/organization/locations', requirePermission('organization.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(2).max(120), code, branchId: optionalId, address: optionalText, city: optionalText, state: optionalText, country: z.string().trim().length(2).default('IN'), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), geofenceRadiusMeters: z.number().int().min(25).max(10_000).nullable().optional(), remote: z.boolean().default(false), active: z.boolean().default(true) }).parse(req.body);
    if (body.branchId && !await prisma.branch.findFirst({ where: { id: body.branchId, companyId: req.auth!.companyId } })) return fail(res, 400, 'BRANCH_INVALID', 'Branch is not part of this company.');
    const value = await prisma.workLocation.create({ data: { ...body, companyId: req.auth!.companyId } });
    await audit(req, 'CREATE_WORK_LOCATION', `Work location ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/organization/teams', requirePermission('organization.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(2).max(120), code, departmentId: optionalId, managerEmployeeId: optionalId, active: z.boolean().default(true) }).parse(req.body);
    const companyId = req.auth!.companyId;
    if (body.departmentId && !await prisma.department.findFirst({ where: { id: body.departmentId, companyId } })) return fail(res, 400, 'DEPARTMENT_INVALID', 'Department is not part of this company.');
    if (body.managerEmployeeId && !await prisma.employee.findFirst({ where: { id: body.managerEmployeeId, companyId } })) return fail(res, 400, 'MANAGER_INVALID', 'Manager is not part of this company.');
    const value = await prisma.team.create({ data: { ...body, companyId } });
    await audit(req, 'CREATE_TEAM', `Team ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/organization/cost-centers', requirePermission('organization.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(2).max(120), code, description: optionalText, active: z.boolean().default(true) }).parse(req.body);
    const value = await prisma.costCenter.create({ data: { ...body, companyId: req.auth!.companyId } });
    await audit(req, 'CREATE_COST_CENTER', `Cost center ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/organization/grades', requirePermission('organization.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(1).max(120), code, rank: z.number().int().min(0).max(10_000).default(0), description: optionalText, active: z.boolean().default(true) }).parse(req.body);
    const value = await prisma.employeeGrade.create({ data: { ...body, companyId: req.auth!.companyId } });
    await audit(req, 'CREATE_EMPLOYEE_GRADE', `Employee grade ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.use('/rbac', authenticate);
  router.get('/rbac', requirePermission('rbac.manage'), async (req: FoundationRequest, res, next) => { try {
    const companyId = req.auth!.companyId;
    const [permissions, roles, grants, users] = await prisma.$transaction([
      prisma.permission.findMany({ where: { companyId }, orderBy: { key: 'asc' } }),
      prisma.accessRole.findMany({ where: { companyId }, include: { rolePermissions: { include: { permission: true } } }, orderBy: { name: 'asc' } }),
      prisma.userAccessGrant.findMany({ where: { companyId }, include: { role: true, user: { select: { id: true, fullName: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.user.findMany({ where: { companyId }, select: { id: true, fullName: true, email: true, role: true, employee: { select: { id: true, branchId: true, departmentId: true, teamId: true } } }, orderBy: { fullName: 'asc' } }),
    ]);
    return ok(res, { permissions, roles, grants, users });
  } catch (error) { next(error); } });

  router.post('/rbac/permissions', requirePermission('rbac.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ key: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/).max(100), description: optionalText }).parse(req.body);
    const companyId = req.auth!.companyId;
    const value = await prisma.permission.upsert({ where: { companyId_key: { companyId, key: body.key } }, create: { ...body, companyId }, update: { description: body.description } });
    await audit(req, 'UPSERT_PERMISSION', `Permission ${value.key} configured.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/rbac/roles', requirePermission('rbac.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ name: z.string().trim().min(2).max(100), code, description: optionalText, permissionIds: z.array(id).max(200).default([]) }).parse(req.body);
    const companyId = req.auth!.companyId;
    const permissionIds = [...new Set(body.permissionIds)];
    if (await prisma.permission.count({ where: { companyId, id: { in: permissionIds } } }) !== permissionIds.length) return fail(res, 400, 'PERMISSION_INVALID', 'One or more permissions are not part of this company.');
    const value = await prisma.accessRole.create({ data: { companyId, name: body.name, code: body.code, description: body.description, rolePermissions: { create: permissionIds.map(permissionId => ({ permissionId })) } }, include: { rolePermissions: { include: { permission: true } } } });
    await audit(req, 'CREATE_ACCESS_ROLE', `Access role ${value.code} created.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.post('/rbac/grants', requirePermission('rbac.manage'), async (req: FoundationRequest, res, next) => { try {
    const body = z.object({ userId: id, roleId: id, scope: z.enum(['ALL_COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF']), scopeEntityId: optionalId, expiresAt: z.coerce.date().nullable().optional() }).parse(req.body);
    const companyId = req.auth!.companyId;
    const [user, role] = await Promise.all([
      prisma.user.findFirst({ where: { id: body.userId, companyId }, include: { employee: { select: { id: true } } } }),
      prisma.accessRole.findFirst({ where: { id: body.roleId, companyId, active: true } }),
    ]);
    if (!user || !role) return fail(res, 400, 'GRANT_PRINCIPAL_INVALID', 'User or role is not part of this company.');
    let targetValid = body.scope === 'ALL_COMPANY' ? !body.scopeEntityId : false;
    if (body.scope === 'SELF') targetValid = !body.scopeEntityId || body.scopeEntityId === user.employee?.id;
    if (body.scope === 'BRANCH' && body.scopeEntityId) targetValid = !!await prisma.branch.findFirst({ where: { id: body.scopeEntityId, companyId } });
    if (body.scope === 'DEPARTMENT' && body.scopeEntityId) targetValid = !!await prisma.department.findFirst({ where: { id: body.scopeEntityId, companyId } });
    if (body.scope === 'TEAM' && body.scopeEntityId) targetValid = !!await prisma.team.findFirst({ where: { id: body.scopeEntityId, companyId } });
    if (!targetValid) return fail(res, 400, 'SCOPE_INVALID', 'Scope target is missing or is not part of this company.');
    const value = await prisma.userAccessGrant.create({ data: { companyId, userId: body.userId, roleId: body.roleId, scope: body.scope, scopeEntityId: body.scopeEntityId, expiresAt: body.expiresAt } });
    await audit(req, 'CREATE_ACCESS_GRANT', `Role ${role.code} granted with ${body.scope} scope.`); return ok(res, value, 201);
  } catch (error) { next(error); } });

  router.delete('/rbac/grants/:id', requirePermission('rbac.manage'), async (req: FoundationRequest, res, next) => { try {
    const grant = await prisma.userAccessGrant.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId }, include: { role: true } });
    if (!grant) return fail(res, 404, 'GRANT_NOT_FOUND', 'Access grant was not found.');
    await prisma.$transaction([prisma.userAccessGrant.delete({ where: { id: grant.id } }), audit(req, 'REVOKE_ACCESS_GRANT', `Role ${grant.role.code} grant revoked.`)]);
    return ok(res, { revoked: true });
  } catch (error) { next(error); } });

  return router;
}
