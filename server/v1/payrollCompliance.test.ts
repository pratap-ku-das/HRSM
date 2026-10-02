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
    },
    auditLog: {
      create: vi.fn(async () => ({ id: 'audit-1' })),
    },
  };

  const app = express();
  app.use(express.json());
  const authenticate = (req: any, _res: any, next: any) => {
    req.auth = {
      id: 'usr-employee-1',
      companyId,
      employeeId,
      role: 'EMPLOYEE',
      permissions: ['payroll.read'],
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
});
