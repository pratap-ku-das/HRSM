import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createV1Router } from './v1/api.js';
import { createRazorpayWebhookRouter } from './v1/subscription/webhookRoute.js';
import { razorpayService } from './v1/subscription/razorpayClient.js';
import { ensureDefaultPlans, initializeSubscriptionCheckout } from './v1/subscription/subscriptionManager.js';
import { ensureDefaultLeaveWorkflow } from './v1/workflows.js';
import { createOpaqueToken, createTemporaryPassword, deliverOnboardingEmail } from './v1/email.js';
import { normalizeDatabaseUrl } from './databaseUrl.js';
import { startNotificationWorkers } from './v1/pushNotifications.js';

dotenv.config();

const app = express();
const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const prisma = new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);
const PORT = Number(process.env.PORT || 3001);

type AttendanceAdminRequest = Request & { attendanceAdmin?: { id: string; companyId: string; role: string } };
const requireAttendanceAdmin = async (req: AttendanceAdminRequest, res: Response, next: NextFunction) => {
  try {
    const raw = req.header('authorization');
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!raw?.startsWith('Bearer ') || !secret || secret.length < 32) return res.status(401).json({ error: 'A valid administrator session is required.' });
    const payload = jwt.verify(raw.slice(7), secret, { issuer: process.env.JWT_ISSUER || 'orbithr-api', audience: 'orbithr-clients' }) as jwt.JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.tokenVersion || !['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(user.role)) return res.status(403).json({ error: 'Only HR or an administrator may adjust attendance.' });
    req.attendanceAdmin = { id: user.id, companyId: user.companyId, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'The administrator session is invalid or expired.' });
  }
};

// Railway terminates HTTPS in front of this service. Trust exactly that proxy hop so
// rate limiting uses the real client IP instead of rejecting X-Forwarded-For.
app.set('trust proxy', 1);

const employeeToClient = (employee: any) => ({
  id: employee.id,
  companyId: employee.companyId,
  employeeCode: employee.employeeCode,
  firstName: employee.firstName,
  lastName: employee.lastName,
  email: employee.email,
  phone: employee.phone || '',
  avatarUrl: employee.avatarUrl,
  dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10),
  gender: employee.gender || 'PREFER_NOT_TO_SAY',
  departmentId: employee.departmentId,
  designationId: employee.designationId,
  reportingManagerId: employee.reportingManagerId,
  dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
  employmentType: employee.employmentType,
  status: employee.status,
  workLocation: employee.workLocation || '',
  salary: {
    basic: employee.basicSalary,
    hra: employee.hra,
    allowances: employee.allowances,
    providentFund: employee.providentFund,
    taxDeduction: employee.taxDeduction,
    currency: employee.currency,
  },
  bankDetails: {
    bankName: employee.bankName || '',
    accountNumber: employee.accountNumber || '',
    routingOrIfsc: employee.routingOrIfsc || '',
    taxIdentifier: employee.taxIdentifier || '',
  },
  emergencyContact: {
    name: employee.emergencyName || '',
    relationship: employee.emergencyRelation || '',
    phone: employee.emergencyPhone || '',
  },
  skills: employee.skills,
  createdAt: employee.createdAt.toISOString(),
});

// --------------------------------------------------------
// SECURITY MIDDLEWARE
// --------------------------------------------------------

// SEC-FIX: Restrict CORS to known origins. Set WEB_APP_URL (comma-separated) in Railway.
// Android native clients do not send an Origin header and are unaffected by CORS.
const allowedOriginsRaw = process.env.WEB_APP_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
const allowedOrigins = allowedOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin header (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin not allowed — ${origin}`));
    },
    credentials: true,
  })
);

// SEC-FIX: Add security headers via helmet.
// contentSecurityPolicy is disabled because the SPA uses inline styles from Vite/Tailwind;
// configure it with a nonce in a future hardening phase.
// crossOriginEmbedderPolicy is disabled because Razorpay checkout loads in an iframe.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// --------------------------------------------------------
// LEGACY AUTHENTICATION MIDDLEWARE
// --------------------------------------------------------

// SEC-FIX: All legacy /api/* routes (not /api/v1/*) must now require a valid JWT.
// This middleware validates the Bearer token and enforces companyId isolation so
// a user from Company A cannot read data from Company B by passing companyId=B.
type LegacyAuthRequest = Request & { legacyAuth?: { id: string; companyId: string; role: string } };

const legacyJwtAuth = async (req: LegacyAuthRequest, res: Response, next: NextFunction) => {
  try {
    const raw = req.header('authorization');
    if (!raw?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Please sign in via the application.' });
    }
    const jwtSecret = process.env.JWT_ACCESS_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      return res.status(500).json({ error: 'Server configuration error.' });
    }
    const payload = jwt.verify(raw.slice(7), jwtSecret, {
      issuer: process.env.JWT_ISSUER || 'orbithr-api',
      audience: 'orbithr-clients',
    }) as jwt.JwtPayload;

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
    }

    // Enforce companyId isolation — callers may pass companyId via query, body, or params.
    const reqCompanyId = String(
      req.query.companyId ?? (req.body as Record<string, unknown>)?.companyId ?? req.params?.companyId ?? ''
    );
    if (reqCompanyId && reqCompanyId !== user.companyId && user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cross-company access is not permitted.' });
    }

    req.legacyAuth = { id: user.id, companyId: user.companyId, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Access token is invalid or expired.' });
  }
};

// Restrict an endpoint to SUPER_ADMIN only (used for GET /api/companies).
const requireSuperAdmin = (req: LegacyAuthRequest, res: Response, next: NextFunction) => {
  const auth = req.legacyAuth;
  if (!auth || auth.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super administrator access required.' });
  }
  next();
};
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
// Secure Razorpay Webhook listener (receives POST /api/webhooks/razorpay)
app.use('/api', createRazorpayWebhookRouter(prisma));
app.use('/api/v1', createV1Router(prisma));
app.get(['/downloads/OrbitHR.apk', '/downloads/orbithr-android.apk'], (_req, res) => {
  const apkPath = path.resolve('public/downloads/OrbitHR.apk');
  if (!existsSync(apkPath)) {
    return res.status(404).json({ error: 'Android APK package not found on server.' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Cache-Control', 'no-cache');
  res.download(apkPath, 'OrbitHR.apk');
});

// Healthcheck
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'CONNECTED', timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ status: 'ERROR', database: 'DISCONNECTED', message: error.message });
  }
});

// --------------------------------------------------------
// AUTHENTICATION & COMPANY REGISTRATION
// --------------------------------------------------------

// SEC-FIX: The legacy passwordless login endpoint is retired.
// It returned a full user+company object for any valid email without verifying a password.
// All clients must use POST /api/v1/auth/login which requires email + password.
app.post('/api/auth/login', (_req, res) => {
  res.status(410).json({
    error: 'This endpoint has been retired. Use POST /api/v1/auth/login with your email and password.',
  });
});

app.post('/api/auth/register-company', async (req, res) => {
  try {
    const { companyData, adminData, plan } = req.body;
    if (!adminData?.password || adminData.password.length < 10) return res.status(400).json({ error: 'Admin password must contain at least 10 characters' });

    const slug = (companyData.name || 'company')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    const rawPlan = String(plan || 'STARTER').toUpperCase();
    const planCode = ['STARTER', 'GROWTH', 'BUSINESS'].includes(rawPlan) ? rawPlan : 'STARTER';

    // Create Company with selected plan
    const company = await prisma.company.create({
      data: {
        name: companyData.name,
        slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
        email: companyData.email || adminData.email,
        phone: companyData.phone || '+91 80 4000 0000',
        address: companyData.address || 'Bengaluru, Karnataka, India',
        industry: companyData.industry || 'Technology',
        size: companyData.size || '11-50',
        plan: planCode as any,
      },
    });

    // Create CompanySubscription record immediately for selected plan
    await ensureDefaultPlans(prisma);
    const selectedDbPlan = await prisma.subscriptionPlan.findUnique({
      where: { code: planCode },
    });

    const now = new Date();
    const trialDays = 14;
    const trialEndsAt = new Date(now.getTime() + trialDays * 86_400_000);

    let companySubscription: any = null;
    if (selectedDbPlan) {
      companySubscription = await prisma.companySubscription.create({
        data: {
          companyId: company.id,
          planId: selectedDbPlan.id,
          status: 'TRIAL',
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          trialEndsAt: trialEndsAt,
        },
      });

      await prisma.subscriptionAuditLog.create({
        data: {
          companyId: company.id,
          subscriptionId: companySubscription.id,
          action: 'TRIAL_STARTED',
          newStatus: 'TRIAL',
          reason: `Registration 14-day trial initiated for ${selectedDbPlan.name} plan.`,
        },
      });
    }

    // Initialize Razorpay subscription checkout (with 14-day trial autopay or immediate payment)
    let checkout: any = null;
    try {
      const isPayNow = req.body.paymentMode === 'PAY_NOW';
      checkout = await initializeSubscriptionCheckout(prisma, company.id, planCode, {
        withTrial: !isPayNow,
        trialDays,
      });
    } catch (checkoutErr: any) {
      console.warn('[REGISTRATION_CHECKOUT_INIT_WARNING]', checkoutErr?.message);
    }

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        companyId: company.id,
        email: adminData.email.toLowerCase(),
        fullName: adminData.fullName,
        role: 'COMPANY_ADMIN',
        passwordHash: await bcrypt.hash(adminData.password, 12),
        emailVerifiedAt: new Date(),
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      },
    });

    // Seed default settings
    const settings = await prisma.companySettings.create({
      data: {
        companyId: company.id,
        companyName: company.name,
        legalEntityName: `${company.name} Private Limited`,
        taxRegistrationNumber: `GSTIN: 29AABCA${Math.floor(1000 + Math.random() * 9000)}F1Z8`,
        currency: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata',
        workDays: [1, 2, 3, 4, 5],
        businessHoursStart: '09:30',
        businessHoursEnd: '18:30',
        enableAutomaticOvertime: true,
        enableAuditLogging: true,
        defaultProbationPeriodMonths: 3,
      },
    });

    // Every new workspace starts with a usable leave approval path. Companies
    // can replace it later with their own active LEAVE workflow.
    await ensureDefaultLeaveWorkflow(prisma, company.id, adminUser.id);

    // Seed default departments
    await prisma.department.createMany({
      data: [
        { companyId: company.id, name: 'Executive & Leadership', code: 'EXEC', budget: 5000000, location: 'Tower A, Floor 5', description: 'Core leadership.' },
        { companyId: company.id, name: 'Engineering & Technology', code: 'ENG', budget: 15000000, location: 'Tower A, Floor 4', description: 'Software engineering.' },
        { companyId: company.id, name: 'People Operations & HR', code: 'HR', budget: 3000000, location: 'Tower B, Floor 2', description: 'Human resources and talent acquisition.' },
      ],
    });

    // Initial audit log
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: adminUser.id,
        userName: adminUser.fullName,
        userRole: adminUser.role,
        action: 'REGISTER_COMPANY',
        category: 'SYSTEM',
        details: `Company workspace ${company.name} successfully registered in Supabase PostgreSQL.`,
        ipAddress: req.ip || '127.0.0.1',
      },
    });

    res.json({ company, user: adminUser, settings, checkout, subscription: companySubscription });
  } catch (error: any) {
    console.error('[REGISTER_COMPANY_ERROR]', error?.message || error);
    res.status(500).json({ error: 'Company registration failed. Please try again or contact support.' });
  }
});

// --------------------------------------------------------
// COMPANIES & WORKSPACES
// --------------------------------------------------------
// SEC-FIX: GET /api/companies returned ALL tenants with ALL users to any unauthenticated caller.
// Now requires a valid JWT AND SUPER_ADMIN role.
app.get('/api/companies', legacyJwtAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: { users: true },
    });
    res.json(companies);
  } catch (error: any) {
    console.error('[GET_COMPANIES_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// EMPLOYEES
// --------------------------------------------------------
// SEC-FIX: Both GET and POST were fully unauthenticated.
app.get('/api/employees', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const employees = await prisma.employee.findMany({
      where: { companyId: String(companyId) },
      include: { department: true, designation: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(employees.map(employeeToClient));
  } catch (error: any) {
    console.error('[GET_EMPLOYEES_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// SEC-FIX: POST /api/employees was unauthenticated — anyone could create employees in any company.
app.post('/api/employees', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const { id, companyId, salary = {}, bankDetails = {}, emergencyContact = {}, departmentCode, designationTitle } = data;
    let department = await prisma.department.findFirst({
      where: departmentCode
        ? { companyId, code: departmentCode }
        : { companyId, id: data.departmentId },
    });
    if (!department && departmentCode && data.departmentName) {
      department = await prisma.department.create({
        data: {
          companyId,
          code: departmentCode,
          name: data.departmentName,
          location: data.departmentLocation || 'Bengaluru Headquarters',
          description: `${data.departmentName} department`,
        },
      });
    }
    if (!department) return res.status(400).json({ error: 'Selected department is not synchronized with the database' });

    let designation = await prisma.designation.findFirst({
      where: designationTitle
        ? { companyId, title: designationTitle }
        : { companyId, id: data.designationId },
    });
    if (!designation && designationTitle) {
      designation = await prisma.designation.create({
        data: {
          companyId,
          departmentId: department.id,
          title: designationTitle,
          gradeLevel: data.designationGradeLevel || 'L3',
          minSalary: Number(data.designationMinSalary) || 0,
          maxSalary: Number(data.designationMaxSalary) || 0,
          description: `${designationTitle} role`,
        },
      });
    }
    if (!designation) return res.status(400).json({ error: 'Selected designation is not synchronized with the database' });

    const employeeData = {
      employeeCode: data.employeeCode,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      avatarUrl: data.avatarUrl || null,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender || null,
      departmentId: department.id,
      designationId: designation.id,
      reportingManagerId: data.reportingManagerId || null,
      dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : new Date(),
      employmentType: data.employmentType,
      status: data.status,
      workLocation: data.workLocation || null,
      basicSalary: Number(salary.basic) || 0,
      hra: Number(salary.hra) || 0,
      allowances: Number(salary.allowances) || 0,
      providentFund: Number(salary.providentFund) || 0,
      taxDeduction: Number(salary.taxDeduction) || 0,
      currency: salary.currency || 'INR',
      bankName: bankDetails.bankName || null,
      accountNumber: bankDetails.accountNumber || null,
      routingOrIfsc: bankDetails.routingOrIfsc || null,
      taxIdentifier: bankDetails.taxIdentifier || null,
      emergencyName: emergencyContact.name || null,
      emergencyRelation: emergencyContact.relationship || null,
      emergencyPhone: emergencyContact.phone || null,
      skills: Array.isArray(data.skills) ? data.skills : [],
    };

    let employee;
    const isNewEmployee = !id || id.startsWith('temp-');
    if (id && !id.startsWith('temp-')) {
      employee = await prisma.employee.upsert({
        where: { id },
        update: {
          ...employeeData,
        },
        create: {
          id,
          companyId,
          ...employeeData,
        },
      });
    } else {
      employee = await prisma.employee.create({
        data: {
          companyId,
          ...employeeData,
        },
      });
    }

    // Every employee needs a linked portal identity to submit or approve their own requests.
    let portalUser = await prisma.user.findUnique({ where: { email: employee.email.toLowerCase() } });
    if (!portalUser) {
      portalUser = await prisma.user.create({
        data: {
          companyId: employee.companyId,
          email: employee.email.toLowerCase(),
          fullName: `${employee.firstName} ${employee.lastName}`,
          role: 'EMPLOYEE',
          avatarUrl: employee.avatarUrl,
        },
      });
    }
    if (portalUser.companyId !== employee.companyId) {
      return res.status(409).json({ error: 'This email is already used by another company' });
    }
    if (employee.userId !== portalUser.id) {
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: portalUser.id },
      });
    }

    if (isNewEmployee) {
      const activation = createOpaqueToken();
      const delivery = await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: portalUser.id }, data: { passwordHash: null } });
        await tx.actionToken.create({ data: { userId: portalUser.id, type: 'ACCOUNT_ACTIVATION', tokenHash: activation.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
        return tx.emailDelivery.create({ data: { companyId: employee.companyId, userId: portalUser.id, employeeId: employee.id, idempotencyKey: `legacy-onboard:${employee.id}:${crypto.randomUUID()}`, messageType: 'EMPLOYEE_ONBOARDING', recipient: employee.email } });
      });
      void deliverOnboardingEmail(prisma, delivery.id, activation.token);
    }

    res.json(employeeToClient(employee));
  } catch (error: any) {
    console.error('[SAVE_EMPLOYEE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.delete('/api/employees/:id', requireAttendanceAdmin, async (req: AttendanceAdminRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const companyId = req.attendanceAdmin?.companyId;
    if (!companyId) return res.status(401).json({ error: 'Valid company administrator session is required.' });
    const employee = await prisma.employee.findFirst({ where: { id, companyId } });
    if (!employee) return res.status(404).json({ error: 'Employee was not found in your company.' });
    if (employee.userId === req.attendanceAdmin?.id) {
      return res.status(409).json({ error: 'You cannot delete your own employee profile.' });
    }
    const hasHistory = (await prisma.attendanceRecord.count({ where: { employeeId: id } })) > 0 ||
                       (await prisma.leaveRequest.count({ where: { employeeId: id } })) > 0 ||
                       (await prisma.payslip.count({ where: { employeeId: id } })) > 0;
    if (hasHistory) {
      return res.status(409).json({ error: 'This employee has operational history. Mark them resigned or terminated instead.' });
    }
    await prisma.employee.delete({ where: { id } });
    if (employee.userId) {
      await prisma.user.delete({ where: { id: employee.userId } }).catch(() => {});
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE_EMPLOYEE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// DEPARTMENTS & DESIGNATIONS
// --------------------------------------------------------
// SEC-FIX: All department/designation reads and writes were unauthenticated.
app.get('/api/departments', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const departments = await prisma.department.findMany({
      where: { companyId: String(companyId) },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (error: any) {
    console.error('[GET_DEPARTMENTS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/departments', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body || {};
    const { id, companyId, ...rest } = data;

    const dept = id && !id.startsWith('dept-')
      ? await prisma.department.upsert({
          where: { id },
          update: rest as any,
          create: { id, companyId, ...rest } as any,
        })
      : await prisma.department.create({
          data: { companyId, ...rest } as any,
        });

    res.json(dept);
  } catch (error: any) {
    console.error('[SAVE_DEPARTMENT_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/designations', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const designations = await prisma.designation.findMany({
      where: { companyId: String(companyId) },
      orderBy: { title: 'asc' },
    });
    res.json(designations);
  } catch (error: any) {
    console.error('[GET_DESIGNATIONS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/designations', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body || {};
    const { id, companyId, ...rest } = data;

    const desig = id && !id.startsWith('desig-')
      ? await prisma.designation.upsert({
          where: { id },
          update: rest as any,
          create: { id, companyId, ...rest } as any,
        })
      : await prisma.designation.create({
          data: { companyId, ...rest } as any,
        });

    res.json(desig);
  } catch (error: any) {
    console.error('[SAVE_DESIGNATION_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// ATTENDANCE MATRIX & ADJUSTMENTS
// --------------------------------------------------------
// SEC-FIX: GET /api/attendance was unauthenticated; anyone with a companyId could read all attendance.
app.get('/api/attendance', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const records = await prisma.attendanceRecord.findMany({
      where: { companyId: String(companyId) },
      orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (error: any) {
    console.error('[GET_ATTENDANCE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/attendance', requireAttendanceAdmin, async (req: AttendanceAdminRequest, res) => {
  try {
    const { companyId, employeeId, date, status, clockInTime, clockOutTime, correctionNote, correctedBy } = req.body;
    if (companyId !== req.attendanceAdmin!.companyId) return res.status(403).json({ error: 'Cross-company attendance changes are forbidden.' });
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: req.attendanceAdmin!.companyId }, select: { id: true } });
    if (!employee) return res.status(404).json({ error: 'Employee was not found in this company.' });

    const dateObj = new Date(date);
    const locked = await prisma.attendancePeriodLock.findFirst({
      where: {
        companyId: req.attendanceAdmin!.companyId,
        periodStart: { lte: dateObj },
        periodEnd: { gte: dateObj },
      },
    });
    if (locked) return res.status(409).json({ error: 'Attendance is locked for payroll during this period.' });
    const clockIn = clockInTime ? new Date(clockInTime) : null;
    const clockOut = clockOutTime ? new Date(clockOutTime) : null;
    if (clockIn && clockOut && clockOut <= clockIn) return res.status(400).json({ error: 'Clock-out time must be after clock-in time' });
    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: dateObj,
        },
      },
      update: {
        status,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        correctionNote,
        correctedBy,
        source: 'WEB_ADMIN',
      },
      create: {
        companyId,
        employeeId,
        date: dateObj,
        status,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        correctionNote,
        correctedBy,
        source: 'WEB_ADMIN',
      },
    });

    res.json(record);
  } catch (error: any) {
    console.error('[SAVE_ATTENDANCE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/attendance/bulk', requireAttendanceAdmin, async (req: AttendanceAdminRequest, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length < 1 || records.length > 366) return res.status(400).json({ error: 'Between 1 and 366 records are required.' });
    if (records.some((record: any) => record.companyId !== req.attendanceAdmin!.companyId)) return res.status(403).json({ error: 'Cross-company attendance changes are forbidden.' });
    const employeeIds = [...new Set(records.map((record: any) => String(record.employeeId)))];
    const employeeCount = await prisma.employee.count({ where: { companyId: req.attendanceAdmin!.companyId, id: { in: employeeIds } } });
    if (employeeCount !== employeeIds.length) return res.status(404).json({ error: 'One or more employees were not found in this company.' });
    const hasInvalidTimes = records.some((record: any) => {
      const clockIn = record.clockInTime ? new Date(record.clockInTime) : null;
      const clockOut = record.clockOutTime ? new Date(record.clockOutTime) : null;
      return clockIn && clockOut && clockOut <= clockIn;
    });
    if (hasInvalidTimes) return res.status(400).json({ error: 'Clock-out time must be after clock-in time' });

    for (const r of records) {
      const d = new Date(r.date);
      const locked = await prisma.attendancePeriodLock.findFirst({
        where: {
          companyId: req.attendanceAdmin!.companyId,
          periodStart: { lte: d },
          periodEnd: { gte: d },
        },
      });
      if (locked) return res.status(409).json({ error: `Attendance is locked for payroll on ${r.date}.` });
    }

    const results = await prisma.$transaction(
      records.map((r: any) =>
        prisma.attendanceRecord.upsert({
          where: {
            employeeId_date: {
              employeeId: r.employeeId,
              date: new Date(r.date),
            },
          },
          update: {
            status: r.status,
            clockInTime: r.clockInTime ? new Date(r.clockInTime) : null,
            clockOutTime: r.clockOutTime ? new Date(r.clockOutTime) : null,
            correctionNote: r.correctionNote,
            correctedBy: r.correctedBy,
            source: 'WEB_ADMIN',
          },
          create: {
            companyId: r.companyId,
            employeeId: r.employeeId,
            date: new Date(r.date),
            status: r.status,
            clockInTime: r.clockInTime ? new Date(r.clockInTime) : null,
            clockOutTime: r.clockOutTime ? new Date(r.clockOutTime) : null,
            correctionNote: r.correctionNote,
            correctedBy: r.correctedBy,
            source: 'WEB_ADMIN',
          },
        })
      )
    );

    res.json({ count: results.length });
  } catch (error: any) {
    console.error('[BULK_ATTENDANCE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// Retired insecure prototype. Attendance must use the authenticated v1 challenge,
// employee face match and single-use proof-token flow.
app.post('/api/attendance/mobile-verify', (_req, res) => {
  res.status(410).json({ error: 'This endpoint has been retired. Use /api/v1/me/face/challenge, /api/v1/me/face/verify and /api/v1/me/attendance/punch.' });
});

// --------------------------------------------------------
// LEAVES
// --------------------------------------------------------
// SEC-FIX: GET leave types, requests, and all write operations were unauthenticated.
// POST /api/leaves/types and DELETE /api/leaves/types/:id used body-param authorization (SEC-16)
// — a caller could send any userId in the body. Now enforced via JWT + legacyJwtAuth.
app.get('/api/leaves/types', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const normalizedCompanyId = String(companyId);
    const types = await prisma.leaveType.findMany({
      where: { companyId: normalizedCompanyId },
    });

    res.json(types);
  } catch (error: any) {
    console.error('[GET_LEAVE_TYPES_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/leaves/types', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { id, companyId, name, code, daysAllowedPerYear, isPaid, color } = req.body;
    // SEC-FIX: Authorization is now enforced by legacyJwtAuth JWT + role check,
    // not by a user-supplied adminUserId body parameter.
    const callerRole = req.legacyAuth!.role;
    if (callerRole !== 'COMPANY_ADMIN' && callerRole !== 'SUPER_ADMIN' && callerRole !== 'HR_MANAGER') {
      return res.status(403).json({ error: 'Only Company Admin can manage leave categories' });
    }
    if (!name?.trim() || !code?.trim()) return res.status(400).json({ error: 'Name and code are required' });

    const data = {
      companyId,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      daysAllowedPerYear: Math.max(0, Number(daysAllowedPerYear) || 0),
      isPaid: Boolean(isPaid),
      color: color || '#3b82f6',
    };
    const leaveType = id
      ? await prisma.leaveType.update({ where: { id }, data })
      : await prisma.leaveType.create({ data });
    res.json(leaveType);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'This leave code already exists' });
    console.error('[SAVE_LEAVE_TYPE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.delete('/api/leaves/types/:id', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const id = String(req.params.id);
    const leaveType = await prisma.leaveType.findUnique({ where: { id } });
    if (!leaveType) return res.status(404).json({ error: 'Leave category not found' });
    // SEC-FIX: Authorization enforced via JWT role, not body-param adminUserId.
    const callerRole = req.legacyAuth!.role;
    if (callerRole !== 'COMPANY_ADMIN' && callerRole !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Company Admin can manage leave categories' });
    }
    const usageCount = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (usageCount > 0) return res.status(409).json({ error: 'Category is already used by leave requests and cannot be deleted' });
    await prisma.leaveType.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE_LEAVE_TYPE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/leaves/requests', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const requests = await prisma.leaveRequest.findMany({
      where: { companyId: String(companyId) },
      orderBy: { appliedAt: 'desc' },
      include: { employee: true, leaveType: true },
    });
    res.json(requests);
  } catch (error: any) {
    console.error('[GET_LEAVE_REQUESTS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/leaves/apply', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const employee = await prisma.employee.findFirst({ where: { id: data.employeeId, companyId: data.companyId } });
    if (!employee) return res.status(403).json({ error: 'Requester is not an employee of this company' });
    const request = await prisma.leaveRequest.create({
      data: {
        companyId: data.companyId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        totalDays: Number(data.totalDays),
        reason: data.reason,
        status: 'PENDING',
      },
    });
    res.json(request);
  } catch (error: any) {
    console.error('[APPLY_LEAVE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/leaves/review', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { id, status, approvedBy, reviewerComment, reviewerUserId } = req.body;
    const pendingRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: { include: { designation: true } } },
    });
    if (!pendingRequest) return res.status(404).json({ error: 'Leave request not found' });
    if (pendingRequest.status !== 'PENDING') return res.status(409).json({ error: 'Leave request has already been reviewed' });

    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerUserId },
      include: { employee: { include: { designation: true } } },
    });
    if (!reviewer || reviewer.companyId !== pendingRequest.companyId) {
      return res.status(403).json({ error: 'Reviewer does not belong to this company' });
    }
    const reviewerEmployee = reviewer.employee || await prisma.employee.findFirst({
      where: { companyId: reviewer.companyId, email: { equals: reviewer.email, mode: 'insensitive' } },
      include: { designation: true },
    });
    if (reviewerEmployee?.id === pendingRequest.employeeId) return res.status(403).json({ error: 'Self-approval is not permitted' });

    const requesterIsGeneralManager = /general manager/i.test(pendingRequest.employee.designation.title);
    const reviewerIsAdmin = reviewer.role === 'COMPANY_ADMIN' || reviewer.role === 'SUPER_ADMIN';
    const reviewerIsGeneralManager = /general manager/i.test(reviewerEmployee?.designation.title || '');
    const authorized = requesterIsGeneralManager ? reviewerIsAdmin : reviewerIsGeneralManager;
    if (!authorized) {
      return res.status(403).json({ error: requesterIsGeneralManager ? 'Company Admin approval is required' : 'General Manager approval is required' });
    }
    const request = await prisma.leaveRequest.update({
      where: { id },
      data: { status, approvedBy, reviewerComment },
    });
    res.json(request);
  } catch (error: any) {
    console.error('[REVIEW_LEAVE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// PAYROLL & PAYSLIPS
// --------------------------------------------------------
// SEC-FIX: GET payroll runs and payslips were unauthenticated — exposes salary data.
app.get('/api/payroll/runs', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const runs = await prisma.payrollRun.findMany({
      where: { companyId: String(companyId) },
      orderBy: { month: 'desc' },
    });
    res.json(runs);
  } catch (error: any) {
    console.error('[GET_PAYROLL_RUNS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/payroll/payslips', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const payslips = await prisma.payslip.findMany({
      where: { companyId: String(companyId) },
      orderBy: { month: 'desc' },
      include: { employee: true },
    });
    res.json(payslips);
  } catch (error: any) {
    console.error('[GET_PAYSLIPS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/payroll/generate', requireAttendanceAdmin, async (req: AttendanceAdminRequest, res) => {
  try {
    const { companyId, month } = req.body;
    if (companyId !== req.attendanceAdmin!.companyId) return res.status(403).json({ error: 'Cross-company changes are forbidden.' });
    const existing = await prisma.payrollRun.findFirst({ where: { companyId, month } });
    if (existing && ['LOCKED', 'PAYSLIPS_PUBLISHED', 'PAID', 'FINANCE_APPROVED', 'REVERSED'].includes(existing.status)) {
      return res.status(409).json({ error: `Payroll run for ${month} is finalized/published and cannot be modified.` });
    }
    const employees = await prisma.employee.findMany({
      where: { companyId },
    });

    const runId = `pr-${month}`;
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    const payslipsData = employees.map(emp => {
      const gross = emp.basicSalary + emp.hra + emp.allowances;
      const deductions = emp.providentFund + emp.taxDeduction;
      const net = gross - deductions;

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;

      return {
        companyId,
        payrollRunId: runId,
        employeeId: emp.id,
        month,
        basicSalary: emp.basicSalary,
        hra: emp.hra,
        allowances: emp.allowances,
        grossSalary: gross,
        providentFund: emp.providentFund,
        taxDeductions: emp.taxDeduction,
        otherDeductions: 0,
        totalDeductions: deductions,
        netSalary: net,
        workingDays: 22,
        presentDays: 21,
        paidLeaveDays: 1,
        unpaidDays: 0,
        status: 'PAID',
        paymentDate: new Date(),
      };
    });

    const run = await prisma.payrollRun.upsert({
      where: {
        companyId_month: { companyId, month },
      },
      update: {
        status: 'PAID',
        totalEmployees: employees.length,
        totalGrossSalary: totalGross,
        totalDeductions: totalDeductions,
        totalNetPayout: totalNet,
        processedDate: new Date(),
      },
      create: {
        id: runId,
        companyId,
        month,
        status: 'PAID',
        totalEmployees: employees.length,
        totalGrossSalary: totalGross,
        totalDeductions: totalDeductions,
        totalNetPayout: totalNet,
        processedDate: new Date(),
      },
    });

    // Upsert payslips
    await Promise.all(
      payslipsData.map(ps =>
        prisma.payslip.upsert({
          where: {
            payrollRunId_employeeId: {
              payrollRunId: ps.payrollRunId,
              employeeId: ps.employeeId,
            },
          },
          update: ps,
          create: ps,
        })
      )
    );

    res.json({ run, count: payslipsData.length });
  } catch (error: any) {
    console.error('[GENERATE_PAYROLL_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// RECRUITMENT ATS
// --------------------------------------------------------
// SEC-FIX: All recruitment endpoints were unauthenticated.
app.get('/api/recruitment/jobs', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const jobs = await prisma.jobPosting.findMany({
      where: { companyId: String(companyId) },
      orderBy: { postedAt: 'desc' },
    });
    res.json(jobs);
  } catch (error: any) {
    console.error('[GET_JOBS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/recruitment/jobs', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const job = await prisma.jobPosting.create({
      data: {
        companyId: data.companyId,
        departmentId: data.departmentId,
        title: data.title,
        location: data.location || 'Remote',
        experienceLevel: data.experienceLevel || '3+ Years',
        minSalary: Number(data.minSalary) || 80000,
        maxSalary: Number(data.maxSalary) || 120000,
        description: data.description || '',
        requirements: data.requirements || ['Architecture', 'Communication'],
      },
    });
    res.json(job);
  } catch (error: any) {
    console.error('[SAVE_JOB_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/recruitment/applicants', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const applicants = await prisma.jobApplicant.findMany({
      where: { companyId: String(companyId) },
      orderBy: { appliedAt: 'desc' },
    });
    res.json(applicants);
  } catch (error: any) {
    console.error('[GET_APPLICANTS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/recruitment/applicants/advance', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { id, stage } = req.body;
    const updated = await prisma.jobApplicant.update({
      where: { id },
      data: { stage },
    });
    res.json(updated);
  } catch (error: any) {
    console.error('[ADVANCE_APPLICANT_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// PERFORMANCE GOALS
// --------------------------------------------------------
// SEC-FIX: All performance endpoints were unauthenticated.
app.get('/api/performance/goals', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const goals = await prisma.performanceGoal.findMany({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
    });
    res.json(goals);
  } catch (error: any) {
    console.error('[GET_GOALS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/performance/goals', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const goal = data.id && !data.id.startsWith('goal-')
      ? await prisma.performanceGoal.upsert({
          where: { id: data.id },
          update: {
            progress: Number(data.progress),
            status: data.status,
          },
          create: {
            ...data,
            targetDate: new Date(data.targetDate),
          },
        })
      : await prisma.performanceGoal.create({
          data: {
            companyId: data.companyId,
            employeeId: data.employeeId,
            title: data.title,
            description: data.description,
            category: data.category || 'OKR',
            targetDate: new Date(data.targetDate || '2026-12-31'),
            progress: Number(data.progress) || 0,
            status: data.status || 'IN_PROGRESS',
          },
        });
    res.json(goal);
  } catch (error: any) {
    console.error('[SAVE_GOAL_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// ASSETS, DOCUMENTS, HOLIDAYS, ANNOUNCEMENTS, EXPENSES
// --------------------------------------------------------
// SEC-FIX: All these endpoints were unauthenticated.
app.get('/api/assets', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const assets = await prisma.asset.findMany({
      where: { companyId: String(companyId) },
      orderBy: { purchaseDate: 'desc' },
    });
    res.json(assets);
  } catch (error: any) {
    console.error('[GET_ASSETS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/assets', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const asset = await prisma.asset.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        category: data.category || 'LAPTOP',
        serialNumber: data.serialNumber,
        assignedToEmployeeId: data.assignedToEmployeeId || undefined,
        assignedDate: data.assignedToEmployeeId ? new Date() : undefined,
        purchaseDate: new Date(),
        purchaseCost: Number(data.purchaseCost) || 0,
        status: data.assignedToEmployeeId ? 'ASSIGNED' : 'AVAILABLE',
        condition: data.condition || 'NEW',
      },
    });
    res.json(asset);
  } catch (error: any) {
    console.error('[SAVE_ASSET_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/documents', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: String(companyId) },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json(docs);
  } catch (error: any) {
    console.error('[GET_DOCUMENTS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/documents', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const doc = await prisma.companyDocument.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        category: data.category || 'POLICY',
        fileSize: data.fileSize || '2.1 MB',
        fileType: 'PDF',
        downloadUrl: '#',
      },
    });
    res.json(doc);
  } catch (error: any) {
    console.error('[SAVE_DOCUMENT_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/holidays', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const holidays = await prisma.holiday.findMany({
      where: { companyId: String(companyId) },
      orderBy: { date: 'asc' },
    });
    res.json(holidays);
  } catch (error: any) {
    console.error('[GET_HOLIDAYS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/holidays', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const hol = await prisma.holiday.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        date: new Date(data.date),
        type: data.type || 'NATIONAL',
      },
    });
    res.json(hol);
  } catch (error: any) {
    console.error('[SAVE_HOLIDAY_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/announcements', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const announcements = await prisma.announcement.findMany({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements);
  } catch (error: any) {
    console.error('[GET_ANNOUNCEMENTS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/announcements', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const anc = await prisma.announcement.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        content: data.content,
        priority: data.priority || 'NORMAL',
        authorName: data.authorName || 'Admin',
        authorRole: data.authorRole || 'HR Executive',
      },
    });
    res.json(anc);
  } catch (error: any) {
    console.error('[SAVE_ANNOUNCEMENT_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/expenses', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const expenses = await prisma.expenseClaim.findMany({
      where: { companyId: String(companyId) },
      orderBy: { submittedAt: 'desc' },
      include: { employee: true },
    });
    res.json(expenses);
  } catch (error: any) {
    console.error('[GET_EXPENSES_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/expenses', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const exp = await prisma.expenseClaim.create({
      data: {
        companyId: data.companyId,
        employeeId: data.employeeId,
        title: data.title,
        category: data.category || 'TRAVEL',
        amount: Number(data.amount) || 0,
        currency: 'INR',
        expenseDate: new Date(),
        status: 'PENDING',
        notes: data.notes,
      },
    });
    res.json(exp);
  } catch (error: any) {
    console.error('[SAVE_EXPENSE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/expenses/review', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { id, status } = req.body;
    const exp = await prisma.expenseClaim.update({
      where: { id },
      data: { status },
    });
    res.json(exp);
  } catch (error: any) {
    console.error('[REVIEW_EXPENSE_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

// --------------------------------------------------------
// AUDIT LOGS & SETTINGS
// --------------------------------------------------------
// SEC-FIX: GET and POST audit-logs were unauthenticated (anyone could read/write audit trail).
// GET and PUT settings were unauthenticated (anyone could overwrite company configuration).
app.get('/api/audit-logs', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const { companyId } = req.query;
    const logs = await prisma.auditLog.findMany({
      where: { companyId: String(companyId) },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    res.json(logs);
  } catch (error: any) {
    console.error('[GET_AUDIT_LOGS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.post('/api/audit-logs', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const data = req.body;
    const log = await prisma.auditLog.create({
      data: {
        companyId: data.companyId,
        userId: data.userId || 'system',
        userName: data.userName || 'System',
        userRole: data.userRole || 'ADMIN',
        action: data.action,
        category: data.category || 'SYSTEM',
        details: data.details,
        ipAddress: req.ip || '127.0.0.1',
      },
    });
    res.json(log);
  } catch (error: any) {
    console.error('[POST_AUDIT_LOG_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.get('/api/settings/:companyId', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const companyId = String(req.params.companyId);
    const settings = await prisma.companySettings.findUnique({ where: { companyId } });
    if (!settings) return res.status(404).json({ error: 'Company settings not found' });
    res.json(settings);
  } catch (error: any) {
    console.error('[GET_SETTINGS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

app.put('/api/settings/:companyId', legacyJwtAuth, async (req: LegacyAuthRequest, res) => {
  try {
    const companyId = String(req.params.companyId);
    const data = req.body;
    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    res.json(settings);
  } catch (error: any) {
    console.error('[PUT_SETTINGS_ERROR]', error?.message || error);
    res.status(500).json({ error: 'An internal server error occurred. Please try again.' });
  }
});

const distPath = path.resolve('dist');

// Explicit SEO Endpoints for Search Engine Bots (Googlebot, Bingbot)
app.get('/robots.txt', (_req, res) => {
  const robotsDist = path.join(distPath, 'robots.txt');
  const robotsPublic = path.resolve('public', 'robots.txt');
  const target = existsSync(robotsDist) ? robotsDist : existsSync(robotsPublic) ? robotsPublic : null;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'all');
  if (target) {
    res.sendFile(target);
  } else {
    res.send("User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nSitemap: https://hr.balajione.dev/sitemap.xml\n");
  }
});

app.get('/sitemap.xml', (_req, res) => {
  const sitemapDist = path.join(distPath, 'sitemap.xml');
  const sitemapPublic = path.resolve('public', 'sitemap.xml');
  const target = existsSync(sitemapDist) ? sitemapDist : existsSync(sitemapPublic) ? sitemapPublic : null;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'all');
  if (target) {
    res.sendFile(target);
  } else {
    res.status(404).send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap not found</error>');
  }
});

if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/downloads/')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

const startServer = async () => {
  try {
    await prisma.$connect();
    await ensureDefaultPlans(prisma).catch((err) =>
      console.warn('[SUBSCRIPTION_PLAN_INIT_WARN]', err?.message)
    );
    if (razorpayService.isConfigured()) {
      console.log(`[RAZORPAY_INIT] Razorpay client active with Key ID: ${razorpayService.getKeyId()}`);
    } else {
      console.log('[RAZORPAY_INIT] Razorpay credentials not detected; subscriptions will operate in test mode.');
    }
    const stopNotificationWorkers = startNotificationWorkers(prisma);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`HRMS PostgreSQL backend running on port ${PORT}`);
    });

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      stopNotificationWorkers();
      console.log(`${signal} received; shutting down.`);
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Backend startup failed: PostgreSQL is unavailable.', error instanceof Error ? error.message : 'Unknown error');
    await prisma.$disconnect();
    process.exit(1);
  }
};

export { app, prisma };

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
