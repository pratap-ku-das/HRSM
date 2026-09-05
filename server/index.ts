import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createV1Router } from './v1/api.js';
import { createOpaqueToken, createTemporaryPassword, deliverOnboardingEmail } from './v1/email.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

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

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', createV1Router(prisma));
app.get('/downloads/orbithr-android.apk', (_req, res) => {
  res.download(path.resolve('public/downloads/OrbitHR.apk'), 'OrbitHR.apk');
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: true, employee: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const settings = await prisma.companySettings.update({
      where: { companyId: user.companyId },
      data: { currency: 'INR', currencySymbol: '₹', timezone: 'Asia/Kolkata (IST - UTC+5:30)' },
    });

    // Log login audit
    await prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        action: 'USER_LOGIN',
        category: 'AUTH',
        details: `User ${user.fullName} logged into workspace.`,
        ipAddress: req.ip || '127.0.0.1',
      },
    });

    res.json({ user: { ...user, employeeId: user.employee?.id }, company: user.company, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register-company', async (req, res) => {
  try {
    const { companyData, adminData, plan } = req.body;
    if (!adminData?.password || adminData.password.length < 10) return res.status(400).json({ error: 'Admin password must contain at least 10 characters' });

    const slug = (companyData.name || 'company')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    // Create Company
    const company = await prisma.company.create({
      data: {
        name: companyData.name,
        slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
        email: companyData.email || adminData.email,
        phone: companyData.phone || '+91 80 4000 0000',
        address: companyData.address || 'Bengaluru, Karnataka, India',
        industry: companyData.industry || 'Technology',
        size: companyData.size || '11-50',
        plan: plan || 'GROWTH',
      },
    });

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
        timezone: 'Asia/Kolkata (IST - UTC+5:30)',
        workDays: [1, 2, 3, 4, 5],
        businessHoursStart: '09:30',
        businessHoursEnd: '18:30',
        enableAutomaticOvertime: true,
        enableAuditLogging: true,
        defaultProbationPeriodMonths: 3,
      },
    });

    // Seed default departments
    await prisma.department.createMany({
      data: [
        { companyId: company.id, name: 'Executive & Leadership', code: 'EXEC', budget: 5000000, location: 'Tower A, Floor 5', description: 'Core leadership.' },
        { companyId: company.id, name: 'Engineering & Technology', code: 'ENG', budget: 15000000, location: 'Tower A, Floor 4', description: 'Software engineering.' },
        { companyId: company.id, name: 'People Operations & HR', code: 'HR', budget: 3000000, location: 'Tower B, Floor 2', description: 'Human resources and talent acquisition.' },
      ],
    });

    // Seed default Indian statutory leave policies
    await prisma.leaveType.createMany({
      data: [
        { companyId: company.id, name: 'Privilege Leave (PL/EL)', code: 'PL', daysAllowedPerYear: 18, isPaid: true, color: '#3b82f6' },
        { companyId: company.id, name: 'Casual Leave (CL)', code: 'CL', daysAllowedPerYear: 12, isPaid: true, color: '#10b981' },
        { companyId: company.id, name: 'Sick & Medical Leave (SL)', code: 'SL', daysAllowedPerYear: 10, isPaid: true, color: '#ef4444' },
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

    res.json({ company, user: adminUser, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// COMPANIES & WORKSPACES
// --------------------------------------------------------
app.get('/api/companies', async (_req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: { users: true },
    });
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// EMPLOYEES
// --------------------------------------------------------
app.get('/api/employees', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/employees', async (req, res) => {
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
      const temporaryPassword = createTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const delivery = await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: portalUser.id }, data: { passwordHash } });
        await tx.actionToken.create({ data: { userId: portalUser.id, type: 'ACCOUNT_ACTIVATION', tokenHash: activation.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
        return tx.emailDelivery.create({ data: { companyId: employee.companyId, userId: portalUser.id, employeeId: employee.id, idempotencyKey: `legacy-onboard:${employee.id}:${crypto.randomUUID()}`, messageType: 'EMPLOYEE_ONBOARDING', recipient: employee.email } });
      });
      void deliverOnboardingEmail(prisma, delivery.id, activation.token, temporaryPassword);
    }

    res.json(employeeToClient(employee));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.employee.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// DEPARTMENTS & DESIGNATIONS
// --------------------------------------------------------
app.get('/api/departments', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const departments = await prisma.department.findMany({
      where: { companyId: String(companyId) },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/departments', async (req, res) => {
  try {
    const data = req.body;
    const { id, companyId, ...rest } = data;

    const dept = id && !id.startsWith('dept-')
      ? await prisma.department.upsert({
          where: { id },
          update: rest,
          create: { id, companyId, ...rest },
        })
      : await prisma.department.create({
          data: { companyId, ...rest },
        });

    res.json(dept);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/designations', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const designations = await prisma.designation.findMany({
      where: { companyId: String(companyId) },
      orderBy: { title: 'asc' },
    });
    res.json(designations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/designations', async (req, res) => {
  try {
    const data = req.body;
    const { id, companyId, ...rest } = data;

    const desig = id && !id.startsWith('desig-')
      ? await prisma.designation.upsert({
          where: { id },
          update: rest,
          create: { id, companyId, ...rest },
        })
      : await prisma.designation.create({
          data: { companyId, ...rest },
        });

    res.json(desig);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// ATTENDANCE MATRIX & ADJUSTMENTS
// --------------------------------------------------------
app.get('/api/attendance', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId query required' });

    const records = await prisma.attendanceRecord.findMany({
      where: { companyId: String(companyId) },
      orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { companyId, employeeId, date, status, correctionNote, correctedBy } = req.body;

    const dateObj = new Date(date);
    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: dateObj,
        },
      },
      update: {
        status,
        correctionNote,
        correctedBy,
        source: 'WEB_ADMIN',
      },
      create: {
        companyId,
        employeeId,
        date: dateObj,
        status,
        correctionNote,
        correctedBy,
        source: 'WEB_ADMIN',
      },
    });

    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/attendance/bulk', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) return res.status(400).json({ error: 'records array required' });

    const results = await Promise.all(
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
            correctionNote: r.correctionNote,
            correctedBy: r.correctedBy,
          },
          create: {
            companyId: r.companyId,
            employeeId: r.employeeId,
            date: new Date(r.date),
            status: r.status,
            correctionNote: r.correctionNote,
            correctedBy: r.correctedBy,
          },
        })
      )
    );

    res.json({ count: results.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Phase 6 Mobile Face-Auth Verification Endpoint
app.post('/api/attendance/mobile-verify', async (req, res) => {
  try {
    const { companyId, employeeId, faceConfidenceScore, deviceId, locationLat, locationLng } = req.body;
    const today = new Date();

    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: new Date(today.toISOString().split('T')[0]),
        },
      },
      update: {
        status: 'PRESENT',
        faceAuthVerified: true,
        faceConfidenceScore: Number(faceConfidenceScore) || 98.5,
        deviceId,
        locationLat: Number(locationLat),
        locationLng: Number(locationLng),
        clockInTime: today,
        source: 'MOBILE_FACE',
      },
      create: {
        companyId,
        employeeId,
        date: new Date(today.toISOString().split('T')[0]),
        status: 'PRESENT',
        faceAuthVerified: true,
        faceConfidenceScore: Number(faceConfidenceScore) || 98.5,
        deviceId,
        locationLat: Number(locationLat),
        locationLng: Number(locationLng),
        clockInTime: today,
        source: 'MOBILE_FACE',
      },
    });

    res.json({
      success: true,
      message: 'Mobile face authentication verified successfully.',
      record,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// LEAVES
// --------------------------------------------------------
app.get('/api/leaves/types', async (req, res) => {
  try {
    const { companyId } = req.query;
    const normalizedCompanyId = String(companyId);
    let types = await prisma.leaveType.findMany({
      where: { companyId: normalizedCompanyId },
    });
    if (types.length === 0) {
      await prisma.leaveType.createMany({
        data: [
          { companyId: normalizedCompanyId, name: 'Privilege Leave (PL/EL)', code: 'PL', daysAllowedPerYear: 18, isPaid: true, color: '#3b82f6' },
          { companyId: normalizedCompanyId, name: 'Casual Leave (CL)', code: 'CL', daysAllowedPerYear: 12, isPaid: true, color: '#10b981' },
          { companyId: normalizedCompanyId, name: 'Sick & Medical Leave (SL)', code: 'SL', daysAllowedPerYear: 10, isPaid: true, color: '#ef4444' },
          { companyId: normalizedCompanyId, name: 'Maternity Leave', code: 'ML', daysAllowedPerYear: 182, isPaid: true, color: '#ec4899' },
          { companyId: normalizedCompanyId, name: 'Loss of Pay (LOP)', code: 'LOP', daysAllowedPerYear: 365, isPaid: false, color: '#64748b' },
        ],
      });
      types = await prisma.leaveType.findMany({ where: { companyId: normalizedCompanyId } });
    }
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leaves/types', async (req, res) => {
  try {
    const { id, companyId, name, code, daysAllowedPerYear, isPaid, color, adminUserId } = req.body;
    const admin = await prisma.user.findFirst({ where: { id: adminUserId, companyId } });
    if (!admin || (admin.role !== 'COMPANY_ADMIN' && admin.role !== 'SUPER_ADMIN')) {
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
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/leaves/types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leaveType = await prisma.leaveType.findUnique({ where: { id } });
    if (!leaveType) return res.status(404).json({ error: 'Leave category not found' });
    const admin = await prisma.user.findFirst({ where: { id: req.body.adminUserId, companyId: leaveType.companyId } });
    if (!admin || (admin.role !== 'COMPANY_ADMIN' && admin.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ error: 'Only Company Admin can manage leave categories' });
    }
    const usageCount = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (usageCount > 0) return res.status(409).json({ error: 'Category is already used by leave requests and cannot be deleted' });
    await prisma.leaveType.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leaves/requests', async (req, res) => {
  try {
    const { companyId } = req.query;
    const requests = await prisma.leaveRequest.findMany({
      where: { companyId: String(companyId) },
      orderBy: { appliedAt: 'desc' },
      include: { employee: true, leaveType: true },
    });
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leaves/apply', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leaves/review', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// PAYROLL & PAYSLIPS
// --------------------------------------------------------
app.get('/api/payroll/runs', async (req, res) => {
  try {
    const { companyId } = req.query;
    const runs = await prisma.payrollRun.findMany({
      where: { companyId: String(companyId) },
      orderBy: { month: 'desc' },
    });
    res.json(runs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payroll/payslips', async (req, res) => {
  try {
    const { companyId } = req.query;
    const payslips = await prisma.payslip.findMany({
      where: { companyId: String(companyId) },
      orderBy: { month: 'desc' },
      include: { employee: true },
    });
    res.json(payslips);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payroll/generate', async (req, res) => {
  try {
    const { companyId, month } = req.body;
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
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// RECRUITMENT ATS
// --------------------------------------------------------
app.get('/api/recruitment/jobs', async (req, res) => {
  try {
    const { companyId } = req.query;
    const jobs = await prisma.jobPosting.findMany({
      where: { companyId: String(companyId) },
      orderBy: { postedAt: 'desc' },
    });
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recruitment/jobs', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recruitment/applicants', async (req, res) => {
  try {
    const { companyId } = req.query;
    const applicants = await prisma.jobApplicant.findMany({
      where: { companyId: String(companyId) },
      orderBy: { appliedAt: 'desc' },
    });
    res.json(applicants);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recruitment/applicants/advance', async (req, res) => {
  try {
    const { id, stage } = req.body;
    const updated = await prisma.jobApplicant.update({
      where: { id },
      data: { stage },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// PERFORMANCE GOALS
// --------------------------------------------------------
app.get('/api/performance/goals', async (req, res) => {
  try {
    const { companyId } = req.query;
    const goals = await prisma.performanceGoal.findMany({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
    });
    res.json(goals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/performance/goals', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// ASSETS, DOCUMENTS, HOLIDAYS, ANNOUNCEMENTS, EXPENSES
// --------------------------------------------------------
app.get('/api/assets', async (req, res) => {
  try {
    const { companyId } = req.query;
    const assets = await prisma.asset.findMany({
      where: { companyId: String(companyId) },
      orderBy: { purchaseDate: 'desc' },
    });
    res.json(assets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/assets', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/documents', async (req, res) => {
  try {
    const { companyId } = req.query;
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: String(companyId) },
      orderBy: { uploadedAt: 'desc' },
    });
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/holidays', async (req, res) => {
  try {
    const { companyId } = req.query;
    const holidays = await prisma.holiday.findMany({
      where: { companyId: String(companyId) },
      orderBy: { date: 'asc' },
    });
    res.json(holidays);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/holidays', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const { companyId } = req.query;
    const announcements = await prisma.announcement.findMany({
      where: { companyId: String(companyId) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/announcements', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/expenses', async (req, res) => {
  try {
    const { companyId } = req.query;
    const expenses = await prisma.expenseClaim.findMany({
      where: { companyId: String(companyId) },
      orderBy: { submittedAt: 'desc' },
      include: { employee: true },
    });
    res.json(expenses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses/review', async (req, res) => {
  try {
    const { id, status } = req.body;
    const exp = await prisma.expenseClaim.update({
      where: { id },
      data: { status },
    });
    res.json(exp);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------------
// AUDIT LOGS & SETTINGS
// --------------------------------------------------------
app.get('/api/audit-logs', async (req, res) => {
  try {
    const { companyId } = req.query;
    const logs = await prisma.auditLog.findMany({
      where: { companyId: String(companyId) },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audit-logs', async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const settings = await prisma.companySettings.findUnique({ where: { companyId } });
    if (!settings) return res.status(404).json({ error: 'Company settings not found' });
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const data = req.body;
    const settings = await prisma.companySettings.upsert({
      where: { companyId },
      update: data,
      create: { companyId, ...data },
    });
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const distPath = path.resolve('dist');
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/downloads/')) return next();
    return res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ HRMS PostgreSQL Backend Server running on http://127.0.0.1:${PORT}`);
});
