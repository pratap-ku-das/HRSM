import crypto from 'node:crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { createOpaqueToken, createTemporaryPassword, deliverOnboardingEmail } from './email.js';

type AuthUser = { id: string; companyId: string; role: UserRole; employeeId?: string; permissions: string[]; tokenVersion: number };
type AuthedRequest = Request & { auth?: AuthUser; requestId?: string };

const rolePermissions: Record<UserRole, string[]> = {
  SUPER_ADMIN: [],
  COMPANY_ADMIN: ['company.manage', 'employee.read.all', 'employee.manage', 'attendance.read.team', 'attendance.manage', 'leave.review', 'leave.policy.manage', 'expense.review', 'payroll.manage', 'recruitment.manage', 'audit.read'],
  HR_MANAGER: ['employee.read.all', 'employee.manage', 'attendance.read.team', 'attendance.manage', 'leave.review', 'expense.review', 'recruitment.manage'],
  DEPT_HEAD: ['employee.read.team', 'attendance.read.team', 'leave.review', 'expense.review', 'goal.manage.team'],
  EMPLOYEE: ['employee.read.self', 'attendance.read.self', 'attendance.punch', 'leave.apply', 'expense.submit', 'payslip.read.self'],
};
const employeePermissions = ['employee.read.self', 'attendance.read.self', 'attendance.punch', 'leave.apply', 'expense.submit', 'payslip.read.self'];
for (const role of ['COMPANY_ADMIN', 'HR_MANAGER', 'DEPT_HEAD'] as UserRole[]) rolePermissions[role] = [...new Set([...rolePermissions[role], ...employeePermissions])];

const accessMinutes = Number(process.env.ACCESS_TOKEN_MINUTES || 15);
const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const issuer = process.env.JWT_ISSUER || 'orbithr-api';
const secret = () => {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  return value;
};
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const ok = (res: Response, data: unknown, status = 200, meta: Record<string, unknown> = {}) => res.status(status).json({ data, meta: { requestId: (res.req as AuthedRequest).requestId, ...meta } });
const fail = (res: Response, status: number, code: string, message: string, fieldErrors?: unknown) => res.status(status).json({ error: { code, message, fieldErrors }, meta: { requestId: (res.req as AuthedRequest).requestId } });

function signAccess(user: AuthUser) {
  return jwt.sign({ companyId: user.companyId, role: user.role, employeeId: user.employeeId, permissions: user.permissions, tokenVersion: user.tokenVersion }, secret(), {
    subject: user.id, issuer, audience: 'orbithr-clients', expiresIn: `${accessMinutes}m`, jwtid: crypto.randomUUID(),
  });
}

async function issueSession(prisma: PrismaClient, user: { id: string; companyId: string; role: UserRole; tokenVersion: number; employee?: { id: string } | null }, deviceName?: string, familyId = crypto.randomUUID()) {
  const opaque = createOpaqueToken();
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: opaque.hash, familyId, deviceName, expiresAt: new Date(Date.now() + refreshDays * 86_400_000) } });
  const auth: AuthUser = { id: user.id, companyId: user.companyId, role: user.role, employeeId: user.employee?.id, permissions: rolePermissions[user.role], tokenVersion: user.tokenVersion };
  return { accessToken: signAccess(auth), refreshToken: opaque.token, expiresInSeconds: accessMinutes * 60 };
}

export function createV1Router(prisma: PrismaClient) {
  const router = Router();
  router.use((req: AuthedRequest, res, next) => { req.requestId = String(req.header('x-request-id') || crypto.randomUUID()); res.setHeader('x-request-id', req.requestId); next(); });

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
  const authenticate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const raw = req.header('authorization');
      if (!raw?.startsWith('Bearer ')) return fail(res, 401, 'AUTH_REQUIRED', 'A valid access token is required.');
      const payload = jwt.verify(raw.slice(7), secret(), { issuer, audience: 'orbithr-clients' }) as jwt.JwtPayload;
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { employee: true } });
      if (!user || user.tokenVersion !== payload.tokenVersion) return fail(res, 401, 'TOKEN_REVOKED', 'The session is no longer valid.');
      req.auth = { id: user.id, companyId: user.companyId, role: user.role, employeeId: user.employee?.id, permissions: rolePermissions[user.role], tokenVersion: user.tokenVersion };
      next();
    } catch { return fail(res, 401, 'TOKEN_INVALID', 'The access token is invalid or expired.'); }
  };
  const requirePermission = (permission: string) => (req: AuthedRequest, res: Response, next: NextFunction) => req.auth?.permissions.includes(permission) ? next() : fail(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');

  router.post('/auth/login', authLimiter, async (req, res, next) => { try {
    const body = z.object({ email: z.string().email(), password: z.string().min(8), deviceName: z.string().max(120).optional() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: { employee: true } });
    if (!user?.passwordHash || !await bcrypt.compare(body.password, user.passwordHash)) return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    const session = await issueSession(prisma, user, body.deviceName);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, userName: user.fullName, userRole: user.role, action: 'USER_LOGIN_V1', category: 'AUTH', details: 'Authenticated session created.', ipAddress: req.ip || 'unknown' } });
    return ok(res, session);
  } catch (e) { next(e); } });

  router.post('/auth/refresh', authLimiter, async (req, res, next) => { try {
    const body = z.object({ refreshToken: z.string().min(32), deviceName: z.string().max(120).optional() }).parse(req.body);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(body.refreshToken) }, include: { user: { include: { employee: true } } } });
    if (!stored || stored.expiresAt <= new Date()) return fail(res, 401, 'REFRESH_INVALID', 'Refresh token is invalid or expired.');
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({ where: { familyId: stored.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await prisma.user.update({ where: { id: stored.userId }, data: { tokenVersion: { increment: 1 } } });
      return fail(res, 401, 'REFRESH_REUSE_DETECTED', 'This token family has been revoked.');
    }
    const session = await issueSession(prisma, stored.user, body.deviceName || stored.deviceName || undefined, stored.familyId);
    const replacementHash = hashToken(session.refreshToken);
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date(), replacedBy: replacementHash, lastUsedAt: new Date() } });
    return ok(res, session);
  } catch (e) { next(e); } });

  router.post('/auth/logout', authenticate, async (req: AuthedRequest, res, next) => { try {
    const body = z.object({ refreshToken: z.string().min(32) }).parse(req.body);
    await prisma.refreshToken.updateMany({ where: { userId: req.auth!.id, tokenHash: hashToken(body.refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return ok(res, { loggedOut: true });
  } catch (e) { next(e); } });

  router.post('/auth/logout-all', authenticate, async (req: AuthedRequest, res, next) => { try {
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: req.auth!.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.user.update({ where: { id: req.auth!.id }, data: { tokenVersion: { increment: 1 } } }),
    ]);
    return ok(res, { loggedOutAllDevices: true });
  } catch (e) { next(e); } });

  router.post('/auth/activate', authLimiter, async (req, res, next) => { try {
    const body = z.object({ token: z.string().min(32), password: z.string().min(10).max(128) }).parse(req.body);
    const action = await prisma.actionToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!action || action.type !== 'ACCOUNT_ACTIVATION' || action.usedAt || action.expiresAt <= new Date()) return fail(res, 400, 'ACTIVATION_INVALID', 'Activation link is invalid or expired.');
    await prisma.$transaction([
      prisma.user.update({ where: { id: action.userId }, data: { passwordHash: await bcrypt.hash(body.password, 12), emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } } }),
      prisma.actionToken.update({ where: { id: action.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return ok(res, { activated: true });
  } catch (e) { next(e); } });

  router.post('/auth/forgot-password', authLimiter, async (req, res, next) => { try {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (user) { const token = createOpaqueToken(); await prisma.actionToken.create({ data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash: token.hash, expiresAt: new Date(Date.now() + 60 * 60_000) } }); }
    return ok(res, { accepted: true });
  } catch (e) { next(e); } });

  router.post('/auth/reset-password', authLimiter, async (req, res, next) => { try {
    const body = z.object({ token: z.string().min(32), password: z.string().min(10).max(128) }).parse(req.body);
    const action = await prisma.actionToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!action || action.type !== 'PASSWORD_RESET' || action.usedAt || action.expiresAt <= new Date()) return fail(res, 400, 'RESET_INVALID', 'Reset link is invalid or expired.');
    await prisma.$transaction([
      prisma.user.update({ where: { id: action.userId }, data: { passwordHash: await bcrypt.hash(body.password, 12), tokenVersion: { increment: 1 } } }),
      prisma.actionToken.update({ where: { id: action.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return ok(res, { reset: true });
  } catch (e) { next(e); } });

  router.get('/me', authenticate, async (req: AuthedRequest, res, next) => { try {
    const user = await prisma.user.findFirst({ where: { id: req.auth!.id, companyId: req.auth!.companyId }, include: { company: true, employee: { include: { department: true, designation: true } } } });
    return ok(res, { user: { id: user!.id, email: user!.email, fullName: user!.fullName, role: user!.role, avatarUrl: user!.avatarUrl, permissions: req.auth!.permissions }, company: user!.company, employee: user!.employee });
  } catch (e) { next(e); } });

  router.get('/dashboard', authenticate, async (req: AuthedRequest, res, next) => { try {
    const cid = req.auth!.companyId; const today = new Date(new Date().toISOString().slice(0, 10));
    const [employees, attendance, pendingLeaves, announcements, holidays] = await prisma.$transaction([
      prisma.employee.count({ where: { companyId: cid, status: { in: ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE'] } } }),
      prisma.attendanceRecord.count({ where: { companyId: cid, date: today, status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] } } }),
      prisma.leaveRequest.count({ where: { companyId: cid, status: 'PENDING' } }),
      prisma.announcement.findMany({ where: { companyId: cid }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.holiday.findMany({ where: { companyId: cid, date: { gte: today } }, orderBy: { date: 'asc' }, take: 5 }),
    ]);
    return ok(res, { activeEmployees: employees, presentToday: attendance, pendingLeaves, announcements, holidays });
  } catch (e) { next(e); } });

  router.get('/me/attendance', authenticate, requirePermission('attendance.read.self'), async (req: AuthedRequest, res, next) => { try {
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked to this account.');
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 31 * 86_400_000);
    const records = await prisma.attendanceRecord.findMany({ where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId, date: { gte: from } }, orderBy: { date: 'desc' } });
    return ok(res, records);
  } catch (e) { next(e); } });

  router.post('/me/attendance/punch', authenticate, requirePermission('attendance.punch'), async (req: AuthedRequest, res, next) => { try {
    const body = z.object({ action: z.enum(['CLOCK_IN', 'CLOCK_OUT']), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), deviceId: z.string().max(200).optional() }).parse(req.body);
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked to this account.');
    const now = new Date(); const date = new Date(now.toISOString().slice(0, 10));
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: req.auth!.employeeId, date } } });
    if (body.action === 'CLOCK_IN' && existing?.clockInTime) return fail(res, 409, 'ALREADY_CLOCKED_IN', 'You have already clocked in today.');
    if (body.action === 'CLOCK_OUT' && !existing?.clockInTime) return fail(res, 409, 'CLOCK_IN_REQUIRED', 'Clock in before clocking out.');
    if (body.action === 'CLOCK_OUT' && existing?.clockOutTime) return fail(res, 409, 'ALREADY_CLOCKED_OUT', 'You have already clocked out today.');
    const data = body.action === 'CLOCK_IN' ? { clockInTime: now, status: 'PRESENT' as const, locationLat: body.latitude, locationLng: body.longitude, deviceId: body.deviceId, source: 'SYSTEM_AUTO' as const } : { clockOutTime: now };
    const record = await prisma.attendanceRecord.upsert({ where: { employeeId_date: { employeeId: req.auth!.employeeId, date } }, update: data, create: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId, date, status: 'PRESENT', clockInTime: now, locationLat: body.latitude, locationLng: body.longitude, deviceId: body.deviceId, source: 'SYSTEM_AUTO' } });
    await prisma.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action: body.action, category: 'ATTENDANCE', details: `${body.action} recorded by authenticated mobile API.`, ipAddress: req.ip || 'unknown' } });
    return ok(res, record, existing ? 200 : 201);
  } catch (e) { next(e); } });

  router.get('/me/leaves', authenticate, requirePermission('leave.apply'), async (req: AuthedRequest, res, next) => { try {
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    const [requests, types] = await prisma.$transaction([
      prisma.leaveRequest.findMany({ where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId }, include: { leaveType: true }, orderBy: { appliedAt: 'desc' } }),
      prisma.leaveType.findMany({ where: { companyId: req.auth!.companyId } }),
    ]);
    return ok(res, { requests, types });
  } catch (e) { next(e); } });

  router.post('/me/leaves', authenticate, requirePermission('leave.apply'), async (req: AuthedRequest, res, next) => { try {
    const body = z.object({ leaveTypeId: z.string().uuid(), startDate: z.coerce.date(), endDate: z.coerce.date(), reason: z.string().trim().min(3).max(1000) }).parse(req.body);
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    if (body.endDate < body.startDate) return fail(res, 400, 'DATE_RANGE_INVALID', 'End date must not be before start date.');
    const type = await prisma.leaveType.findFirst({ where: { id: body.leaveTypeId, companyId: req.auth!.companyId } });
    if (!type) return fail(res, 404, 'LEAVE_TYPE_NOT_FOUND', 'Leave type was not found.');
    const overlap = await prisma.leaveRequest.findFirst({ where: { employeeId: req.auth!.employeeId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: body.endDate }, endDate: { gte: body.startDate } } });
    if (overlap) return fail(res, 409, 'LEAVE_OVERLAP', 'A leave request already exists for these dates.');
    const totalDays = Math.floor((body.endDate.getTime() - body.startDate.getTime()) / 86_400_000) + 1;
    const request = await prisma.leaveRequest.create({ data: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId, leaveTypeId: type.id, startDate: body.startDate, endDate: body.endDate, totalDays, reason: body.reason } });
    return ok(res, request, 201);
  } catch (e) { next(e); } });

  router.get('/me/payslips', authenticate, requirePermission('payslip.read.self'), async (req: AuthedRequest, res, next) => { try {
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    return ok(res, await prisma.payslip.findMany({ where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId }, orderBy: { month: 'desc' } }));
  } catch (e) { next(e); } });

  router.get('/me/expenses', authenticate, requirePermission('expense.submit'), async (req: AuthedRequest, res, next) => { try {
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    return ok(res, await prisma.expenseClaim.findMany({ where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId }, orderBy: { submittedAt: 'desc' } }));
  } catch (e) { next(e); } });

  router.post('/me/expenses', authenticate, requirePermission('expense.submit'), async (req: AuthedRequest, res, next) => { try {
    const body = z.object({ title: z.string().trim().min(3).max(150), category: z.enum(['TRAVEL', 'MEALS', 'HARDWARE', 'CERTIFICATION', 'MISC']), amount: z.number().positive().max(10_000_000), expenseDate: z.coerce.date(), notes: z.string().max(1000).optional() }).parse(req.body);
    if (!req.auth!.employeeId) return fail(res, 409, 'EMPLOYEE_NOT_LINKED', 'No employee profile is linked.');
    const expense = await prisma.expenseClaim.create({ data: { ...body, companyId: req.auth!.companyId, employeeId: req.auth!.employeeId, currency: 'INR' } });
    return ok(res, expense, 201);
  } catch (e) { next(e); } });

  router.get('/employees', authenticate, requirePermission('employee.read.all'), async (req: AuthedRequest, res, next) => { try {
    const page = Math.max(1, Number(req.query.page || 1)); const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 25)));
    const search = String(req.query.search || '').trim(); const where = { companyId: req.auth!.companyId, ...(search ? { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }, { employeeCode: { contains: search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await prisma.$transaction([prisma.employee.findMany({ where, include: { department: true, designation: true }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }), prisma.employee.count({ where })]);
    return ok(res, items, 200, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (e) { next(e); } });

  router.post('/employees/onboard', authenticate, requirePermission('employee.manage'), async (req: AuthedRequest, res, next) => { try {
    const body = z.object({ employeeCode: z.string().trim().min(2).max(30), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email(), departmentId: z.string().uuid(), designationId: z.string().uuid(), reportingManagerId: z.string().uuid().optional(), dateOfJoining: z.coerce.date(), employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'), workLocation: z.string().max(120).optional(), phone: z.string().max(30).optional() }).parse(req.body);
    const idempotencyKey = req.header('idempotency-key'); if (!idempotencyKey) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required.');
    const old = await prisma.idempotencyRecord.findUnique({ where: { companyId_userId_key_operation: { companyId: req.auth!.companyId, userId: req.auth!.id, key: idempotencyKey, operation: 'EMPLOYEE_ONBOARD' } } });
    if (old) return ok(res, old.responseJson, old.statusCode);
    const [department, designation] = await Promise.all([prisma.department.findFirst({ where: { id: body.departmentId, companyId: req.auth!.companyId } }), prisma.designation.findFirst({ where: { id: body.designationId, companyId: req.auth!.companyId, departmentId: body.departmentId } })]);
    if (!department || !designation) return fail(res, 400, 'ORGANIZATION_INVALID', 'Department or designation is invalid for this company.');
    const email = body.email.toLowerCase(); const activation = createOpaqueToken(); const temporaryPassword = createTemporaryPassword(); const response = await prisma.$transaction(async tx => {
      const duplicate = await tx.user.findUnique({ where: { email } }); if (duplicate) throw Object.assign(new Error('A user with this email already exists.'), { status: 409, code: 'EMAIL_EXISTS' });
      const user = await tx.user.create({ data: { companyId: req.auth!.companyId, email, fullName: `${body.firstName} ${body.lastName}`, role: 'EMPLOYEE', passwordHash: await bcrypt.hash(temporaryPassword, 12) } });
      const employee = await tx.employee.create({ data: { companyId: req.auth!.companyId, userId: user.id, employeeCode: body.employeeCode, firstName: body.firstName, lastName: body.lastName, email, departmentId: body.departmentId, designationId: body.designationId, reportingManagerId: body.reportingManagerId, dateOfJoining: body.dateOfJoining, employmentType: body.employmentType, status: 'ON_PROBATION', workLocation: body.workLocation, phone: body.phone, skills: [] } });
      await tx.actionToken.create({ data: { userId: user.id, type: 'ACCOUNT_ACTIVATION', tokenHash: activation.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
      const delivery = await tx.emailDelivery.create({ data: { companyId: req.auth!.companyId, userId: user.id, employeeId: employee.id, idempotencyKey: `onboard:${idempotencyKey}`, messageType: 'EMPLOYEE_ONBOARDING', recipient: email } });
      const result = { employee, emailDelivery: { id: delivery.id, status: delivery.status } };
      await tx.idempotencyRecord.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, key: idempotencyKey, operation: 'EMPLOYEE_ONBOARD', responseJson: result, statusCode: 201, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
      await tx.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action: 'ONBOARD_EMPLOYEE', category: 'EMPLOYEE', details: `Employee ${employee.employeeCode} onboarded.`, ipAddress: req.ip || 'unknown' } });
      return result;
    });
    void deliverOnboardingEmail(prisma, response.emailDelivery.id, activation.token, temporaryPassword);
    return ok(res, response, 201);
  } catch (e) { next(e); } });

  router.post('/employees/:id/resend-onboarding', authenticate, requirePermission('employee.manage'), async (req: AuthedRequest, res, next) => { try {
    const employee = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { user: true } });
    if (!employee?.user) return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Employee portal account was not found.');
    const token = createOpaqueToken(); const temporaryPassword = createTemporaryPassword(); const key = `resend:${employee.id}:${req.header('idempotency-key') || crypto.randomUUID()}`;
    const existing = await prisma.emailDelivery.findUnique({ where: { idempotencyKey: key } }); if (existing) return ok(res, { id: existing.id, status: existing.status });
    const [delivery] = await prisma.$transaction([
      prisma.emailDelivery.create({ data: { companyId: req.auth!.companyId, userId: employee.user.id, employeeId: employee.id, idempotencyKey: key, messageType: 'EMPLOYEE_ONBOARDING', recipient: employee.email } }),
      prisma.actionToken.create({ data: { userId: employee.user.id, type: 'ACCOUNT_ACTIVATION', tokenHash: token.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } }),
      prisma.user.update({ where: { id: employee.user.id }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 12), tokenVersion: { increment: 1 } } }),
    ]);
    void deliverOnboardingEmail(prisma, delivery.id, token.token, temporaryPassword);
    return ok(res, { id: delivery.id, status: delivery.status }, 202);
  } catch (e) { next(e); } });

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) return fail(res, 400, 'VALIDATION_ERROR', 'Request validation failed.', error.flatten().fieldErrors);
    const typed = error as { status?: number; code?: string; message?: string };
    console.error(`[${(res.req as AuthedRequest).requestId}]`, typed.message || error);
    return fail(res, typed.status || 500, typed.code || 'INTERNAL_ERROR', typed.status ? typed.message || 'Request failed.' : 'An unexpected error occurred.');
  });
  return router;
}
