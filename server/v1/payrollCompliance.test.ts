import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createPayrollComplianceRouter } from './payrollCompliance.js';

describe('Payroll Compliance PDF Streaming API', () => {
  const companyId = 'company-tenant-100';
  const employeeId = 'emp-self-100';

  const mockCompany = {
    id: companyId,
    name: 'Balaji Global Tech Pvt Ltd',
    address: 'DLF Cybercity, Gurugram, India',
    phone: '+91 124 4567890',
    email: 'hr@balajione.dev',
    logoUrl: null,
    industry: 'Technology',
  };

  const mockSettings = {
    companyId,
    legalEntityName: 'Balaji Global Tech Private Limited',
    taxRegistrationNumber: '07AAAAA0000A1Z5',
    panNumber: 'AAACB1234F',
    tanNumber: 'DELB12345A',
    currency: 'INR',
    currencySymbol: '₹',
  };

  const mockEmployee = {
    id: employeeId,
    companyId,
    employeeCode: 'EMP001',
    firstName: 'Arjun',
    lastName: 'Sharma',
    email: 'arjun.sharma@balajione.dev',
    phone: '+91 9876543210',
    employmentType: 'FULL_TIME',
    dateOfJoining: new Date('2024-04-01'),
    workLocation: 'Gurugram',
    department: { name: 'Engineering' },
    designation: { title: 'Principal Engineer' },
    bankDetails: {
      accountNumber: '918237461928',
      bankName: 'HDFC Bank',
      routingOrIfsc: 'HDFC0001234',
      taxIdentifier: 'ABCDE1234F',
    },
  };

  const mockPayslip = {
    id: 'payslip-001',
    companyId,
    employeeId,
    month: '2026-03',
    status: 'PUBLISHED',
    basicSalary: 120000,
    hra: 60000,
    allowances: 20000,
    grossSalary: 200000,
    providentFund: 21600,
    taxDeductions: 15000,
    otherDeductions: 0,
    totalDeductions: 36600,
    netSalary: 163400,
    workingDays: 31,
    presentDays: 31,
    paidLeaveDays: 0,
    unpaidDays: 0,
    paymentDate: new Date('2026-03-31'),
  };

  const mockForm16 = {
    id: 'form16-001',
    companyId,
    employeeId,
    financialYear: '2025-26',
    documentKey: 'form16/2025-26/EMP001.pdf',
    publishedAt: new Date('2026-06-15'),
    generatedAt: new Date('2026-06-10'),
  };

  const prismaMock = {
    payslip: {
      findFirst: vi.fn(async ({ where }) => {
        if (where.id === mockPayslip.id && where.companyId === companyId && where.employeeId === employeeId) {
          return mockPayslip;
        }
        return null;
      }),
    },
    form16Document: {
      findFirst: vi.fn(async ({ where }) => {
        if (where.id === mockForm16.id && where.companyId === companyId && where.employeeId === employeeId) {
          return mockForm16;
        }
        return null;
      }),
      findMany: vi.fn(async () => [mockForm16]),
    },
    taxDeclaration: {
      findFirst: vi.fn(async () => ({ totalVerified: 150000 })),
      findMany: vi.fn(async () => []),
    },
    company: {
      findUnique: vi.fn(async () => mockCompany),
    },
    companySettings: {
      findUnique: vi.fn(async () => mockSettings),
    },
    employee: {
      findUnique: vi.fn(async () => mockEmployee),
      findFirst: vi.fn(async ({ where }) => {
        if (where.id === employeeId || where.companyId === companyId) {
          return mockEmployee;
        }
        return null;
      }),
    },
    employeeSalaryRevision: {
      findFirst: vi.fn(async () => ({
        annualCtc: 1200000,
        structure: {
          components: [
            { code: 'BASIC', kind: 'EARNING', value: 50000, method: 'FIXED' },
            { code: 'HRA', kind: 'EARNING', value: 25000, method: 'FIXED' },
          ],
        },
        componentValues: { BASIC: 50000, HRA: 25000 },
      })),
    },
    employeeLoan: {
      findMany: vi.fn(async () => [
        { id: 'loan-1', employeeId, companyId, principal: 50000, outstanding: 20000, status: 'ACTIVE', startsOn: new Date('2025-01-01') },
      ]),
      aggregate: vi.fn(async () => ({ _sum: { outstanding: 20000 } })),
      update: vi.fn(async ({ data }) => ({ id: 'loan-1', ...data })),
    },
    loanRepayment: {
      create: vi.fn(async ({ data }) => ({ id: 'repay-1', ...data })),
    },
    asset: {
      findMany: vi.fn(async () => [
        { id: 'asset-1', name: 'MacBook Pro 16', serialNumber: 'MBP-2024-001', status: 'ASSIGNED' },
      ]),
    },
    attendanceRecord: {
      findMany: vi.fn(async () => [
        { id: 'att-1', status: 'PRESENT', date: new Date('2026-03-01') },
        { id: 'att-2', status: 'PRESENT', date: new Date('2026-03-02') },
      ]),
    },
    fullFinalSettlement: {
      findMany: vi.fn(async () => [
        {
          id: 'settlement-001',
          companyId,
          employeeId,
          lastWorkingDay: new Date('2026-03-31'),
          status: 'CALCULATED',
          unpaidSalary: 50000,
          leaveEncashment: 25000,
          gratuity: 150000,
          bonus: 10000,
          recoveries: 0,
          loanRecovery: 20000,
          taxDeduction: 15000,
          netSettlement: 200000,
          employee: mockEmployee,
        },
      ]),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        companyId,
        employeeId,
        lastWorkingDay: new Date('2026-03-31'),
        status: where.status || 'APPROVED',
        unpaidSalary: 50000,
        leaveEncashment: 25000,
        gratuity: 150000,
        bonus: 10000,
        recoveries: 0,
        loanRecovery: 20000,
        taxDeduction: 15000,
        netSettlement: 200000,
        employee: mockEmployee,
      })),
      upsert: vi.fn(async ({ create }) => ({ id: 'settlement-001', ...create })),
      update: vi.fn(async ({ data }) => ({ id: 'settlement-001', ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: 'audit-1' })),
    },
    $transaction: vi.fn(async (cb) => cb(prismaMock)),
  };

  const app = express();
  app.use(express.json());
  const authenticate = (req: any, _res: any, next: any) => {
    req.auth = {
      id: 'usr-employee-1',
      companyId,
      employeeId,
      role: 'ADMIN',
      permissions: ['payroll.read', 'payroll.manage', 'payroll.approve'],
    };
    next();
  };
  app.use('/api/v1', createPayrollComplianceRouter(prismaMock as any, authenticate));

  it('generates and streams authentic payslip PDF bytes with correct headers', async () => {
    const res = await request(app)
      .get('/api/v1/me/payroll/payslips/payslip-001/pdf');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('payslip-2026-03.pdf');
    // PDF Magic number %PDF
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('generates and streams authentic Form 16 Part B Certificate PDF bytes', async () => {
    const res = await request(app)
      .get('/api/v1/me/payroll/form16/form16-001/file');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('Form16-2025-26.pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('enforces isolation: returns 404 for unowned or non-published Form 16', async () => {
    const res = await request(app)
      .get('/api/v1/me/payroll/form16/form16-other/file');

    expect(res.status).toBe(404);
  });

  describe('P2.5 Automated Full & Final (F&F) Settlement API', () => {
    it('returns preview with automated gratuity, leave encashment, active loans, and assets', async () => {
      const res = await request(app)
        .get(`/api/v1/payroll/compliance/settlements/preview/${employeeId}?lastWorkingDay=2026-03-31`);

      expect(res.status).toBe(200);
      expect(res.body.data.employee.employeeCode).toBe('EMP001');
      expect(res.body.data.monthlyBasic).toBe(50000);
      expect(res.body.data.activeLoans.length).toBe(1);
      expect(res.body.data.assignedAssets.length).toBe(1);
      expect(res.body.data.preview.gratuity).toBeDefined();
      expect(res.body.data.preview.leaveEncashment).toBeDefined();
      expect(res.body.data.preview.netSettlement).toBeGreaterThanOrEqual(0);
    });

    it('calculates and upserts statutory F&F exit settlement with full breakdown', async () => {
      const res = await request(app)
        .post('/api/v1/payroll/compliance/settlements/calculate')
        .send({
          employeeId,
          lastWorkingDay: '2026-03-31',
          contractualNoticeDays: 30,
          noticeServedDays: 30,
          encashableLeaveDays: 15,
          bonus: 10000,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CALCULATED');
      expect(res.body.data.loanRecovery).toBe(20000);
      expect(res.body.data.breakdown).toBeDefined();
      expect(res.body.data.breakdown.calculationTrace.length).toBeGreaterThan(5);
    });

    it('approves a calculated settlement when authorized', async () => {
      const res = await request(app)
        .post('/api/v1/payroll/compliance/settlements/settlement-001/approve');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
    });

    it('pays an approved settlement and automatically amortizes/closes active employee loans', async () => {
      const res = await request(app)
        .post('/api/v1/payroll/compliance/settlements/settlement-001/pay');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');
      expect(prismaMock.loanRepayment.create).toHaveBeenCalled();
      expect(prismaMock.employeeLoan.update).toHaveBeenCalled();
    });

    it('generates and streams authentic Exit Settlement No-Dues PDF Voucher', async () => {
      const res = await request(app)
        .get('/api/v1/payroll/compliance/settlements/settlement-001/pdf');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('exit-settlement-EMP001.pdf');
      expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    });
  });
});
