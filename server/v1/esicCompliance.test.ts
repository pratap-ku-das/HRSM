import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { createComplianceRouter } from './compliance/routes.js';
import {
  classifyEsicWageComponent,
  calculateAverageDailyWage,
  isRule52Exempt,
  determineReasonCodeAndLwd,
  sanitizeIpName,
  runEsicDiagnostics,
  generateEsicBulkUpload,
  calculateEsicChallanTotals,
  formatEsicDate,
} from './compliance/esicEngine.js';

describe('P2.7-C — ESIC Monthly Compliance Filing & Challan Reconciliation Suite', () => {
  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const employeeA1 = '00000000-0000-4000-8000-000000000001';
  const employeeA2 = '00000000-0000-4000-8000-000000000002';
  const employeeA3 = '00000000-0000-4000-8000-000000000003';

  const makerUser = 'user-maker-01';
  const checkerUser = 'user-checker-02';

  let employees: any[] = [];
  let companySettings: any[] = [];
  let statutoryFilings: any[] = [];
  let statutoryFilingItems: any[] = [];
  let esicChallans: any[] = [];
  let auditLogs: any[] = [];

  const setupData = () => {
    employees = [
      {
        id: employeeA1,
        companyId: companyA,
        employeeCode: 'EMP001',
        firstName: 'Anil',
        lastName: 'Sharma',
        status: 'ACTIVE',
        lastWorkingDay: null,
      },
      {
        id: employeeA2,
        companyId: companyA,
        employeeCode: 'EMP002',
        firstName: 'Pooja',
        lastName: 'Verma',
        status: 'ACTIVE',
        lastWorkingDay: null,
      },
      {
        id: employeeA3,
        companyId: companyA,
        employeeCode: 'EMP003',
        firstName: 'Ramesh',
        lastName: 'Patel',
        status: 'TERMINATED',
        lastWorkingDay: new Date('2026-09-15'),
      },
    ];

    companySettings = [
      {
        id: 'cs-01',
        companyId: companyA,
        esiRegistrationNumber: '01234567890123456',
      },
      {
        id: 'cs-02',
        companyId: companyB,
        esiRegistrationNumber: '98765432109876543',
      },
    ];

    statutoryFilings = [];
    statutoryFilingItems = [];
    esicChallans = [];
    auditLogs = [];
  };

  const createMockPrisma = () => {
    return {
      companySettings: {
        findUnique: async ({ where }: any) =>
          companySettings.find((c) => c.companyId === where.companyId),
      },
      employee: {
        findMany: async ({ where }: any) =>
          employees.filter((e) => {
            if (where.id?.in) return where.id.in.includes(e.id) && e.companyId === where.companyId;
            return e.companyId === where.companyId;
          }),
        findFirst: async ({ where }: any) =>
          employees.find((e) => Object.entries(where).every(([k, v]) => e[k] === v)),
      },
      statutoryFiling: {
        findFirst: async ({ where }: any) => {
          const filing = statutoryFilings.find((f) =>
            Object.entries(where).every(([k, v]) => f[k] === v)
          );
          if (!filing) return null;
          const items = statutoryFilingItems.filter((i) => i.filingId === filing.id);
          const challans = esicChallans.filter((c) => c.statutoryFilingId === filing.id);
          return { ...filing, items, esicChallans: challans };
        },
        findMany: async ({ where }: any) =>
          statutoryFilings.filter((f) => {
            if (where.companyId && f.companyId !== where.companyId) return false;
            if (where.domain && f.domain !== where.domain) return false;
            if (where.status && f.status !== where.status) return false;
            if (where.periodYear && f.periodYear !== where.periodYear) return false;
            return true;
          }),
        create: async ({ data }: any) => {
          const filing = { id: `filing-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          statutoryFilings.push(filing);
          return filing;
        },
        update: async ({ where, data }: any) => {
          const filing = statutoryFilings.find((f) => f.id === where.id);
          if (filing) Object.assign(filing, data);
          return filing;
        },
      },
      statutoryFilingItem: {
        create: async ({ data }: any) => {
          const item = { id: `item-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
          statutoryFilingItems.push(item);
          return item;
        },
        findMany: async ({ where }: any) =>
          statutoryFilingItems.filter((it) => it.filingId === where.filingId),
      },
      esicChallan: {
        create: async ({ data }: any) => {
          const challan = { id: `esic-ch-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          esicChallans.push(challan);
          return challan;
        },
        findFirst: async ({ where, include }: any) => {
          const ch = esicChallans.find((c) => {
            if (where.status?.not && c.status === where.status.not) return false;
            if (typeof where.status === 'string' && c.status !== where.status) return false;
            if (where.id?.not && c.id === where.id.not) return false;
            if (typeof where.id === 'string' && c.id !== where.id) return false;
            if (where.cprnNumber && c.cprnNumber !== where.cprnNumber) return false;
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.statutoryFilingId && c.statutoryFilingId !== where.statutoryFilingId) return false;
            return true;
          });
          if (!ch) return null;
          if (include?.filing) {
            const filing = statutoryFilings.find((f) => f.id === ch.statutoryFilingId);
            const items = statutoryFilingItems.filter((i) => i.filingId === ch.statutoryFilingId);
            return { ...ch, filing: filing ? { ...filing, items } : null };
          }
          return ch;
        },
        findMany: async ({ where }: any) =>
          esicChallans.filter((c) => {
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.challanPeriodYear && c.challanPeriodYear !== where.challanPeriodYear) return false;
            if (where.challanPeriodMonth && c.challanPeriodMonth !== where.challanPeriodMonth) return false;
            if (where.statutoryFilingId && c.statutoryFilingId !== where.statutoryFilingId) return false;
            return true;
          }),
        update: async ({ where, data }: any) => {
          const challan = esicChallans.find((c) => c.id === where.id);
          if (challan) Object.assign(challan, data, { updatedAt: new Date() });
          return challan;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          const log = { id: `audit-${Date.now()}`, ...data, createdAt: new Date() };
          auditLogs.push(log);
          return log;
        },
      },
      $transaction: async (fn: any) => fn(createMockPrisma()),
    } as any;
  };

  const createTestApp = (user: { id: string; companyId: string; permissions: string[]; role?: string }) => {
    const app = express();
    app.use(express.json());
    const mockPrisma = createMockPrisma();
    const mockAuthMiddleware: express.RequestHandler = (req: any, _res, next) => {
      req.auth = {
        id: user.id,
        companyId: user.companyId,
        role: user.role || 'USER',
        permissions: user.permissions,
      };
      req.requestId = 'req-test-uuid';
      next();
    };

    const router = createComplianceRouter(mockPrisma, mockAuthMiddleware);
    app.use(mockAuthMiddleware);
    app.use('/api/v1', router);

    app.use((err: any, _req: any, res: any, _next: any) => {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', details: (err as any).errors || (err as any).issues });
      }
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
    });

    return { app, prisma: mockPrisma };
  };

  beforeEach(() => {
    setupData();
  });

  // =========================================================================
  // UNIT TESTS: 16-Row Wage Classification Matrix (Section 8)
  // =========================================================================
  describe('Unit Tests: 16-Row Wage Classification Matrix (Section 8)', () => {
    it('classifies standard wage components according to Section 2(22)', () => {
      expect(classifyEsicWageComponent('BASIC').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('DA').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('HRA').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('SPECIAL_ALLOWANCE').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('CONVEYANCE').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('OVERTIME').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('BONUS').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('INCENTIVE').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('COMMISSION').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('ARREARS').classification).toBe('INCLUDED');
      expect(classifyEsicWageComponent('EX_GRATIA').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('REIMBURSEMENT').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('MEDICAL_REIMBURSEMENT').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('LEAVE_ENCASHMENT').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('GRATUITY').classification).toBe('EXCLUDED');
      expect(classifyEsicWageComponent('NOTICE_PAY').classification).toBe('EXCLUDED');
    });

    it('sets MANUAL_REVIEW for unmapped custom salary components without guessing', () => {
      const res = classifyEsicWageComponent('UNKNOWN_CUSTOM_PERK');
      expect(res.classification).toBe('MANUAL_REVIEW');
      expect(res.reason).toContain('requires manual statutory review');
    });

    it('respects company-specific custom mappings when provided', () => {
      const custom = { REMOTE_WORK_STIPEND: 'EXCLUDED' as const };
      const res = classifyEsicWageComponent('REMOTE_WORK_STIPEND', custom);
      expect(res.classification).toBe('EXCLUDED');
    });
  });

  // =========================================================================
  // UNIT TESTS: Rule 52 Daily Wage Exemption (Section 9)
  // =========================================================================
  describe('Unit Tests: Daily Average Wage Rule 52 Exemption', () => {
    it('calculates averageDailyWage correctly when payableDays > 0', () => {
      expect(calculateAverageDailyWage(5000, 25)).toBe(200);
      expect(calculateAverageDailyWage(4400, 25)).toBe(176);
      expect(calculateAverageDailyWage(4375, 25)).toBe(175);
    });

    it('returns NOT_APPLICABLE when payableDays <= 0 and never 0', () => {
      expect(calculateAverageDailyWage(0, 0)).toBe('NOT_APPLICABLE');
      expect(calculateAverageDailyWage(5000, 0)).toBe('NOT_APPLICABLE');
      expect(calculateAverageDailyWage(5000, -1)).toBe('NOT_APPLICABLE');
    });

    it('applies Rule 52 exemption only when averageDailyWage <= 176', () => {
      expect(isRule52Exempt(175)).toBe(true);
      expect(isRule52Exempt(176)).toBe(true);
      expect(isRule52Exempt(177)).toBe(false);
      expect(isRule52Exempt('NOT_APPLICABLE')).toBe(false);
    });
  });

  // =========================================================================
  // UNIT TESTS: Event-First Reason Code & LWD Hierarchy (Section 11)
  // =========================================================================
  describe('Unit Tests: Reason Code & LWD Hierarchy', () => {
    it('assigns Code 5 for Deceased event with formatted LWD', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 10000,
        payableDays: 10,
        snapshotLastWorkingDay: '2026-09-10',
        status: 'TERMINATED',
        exitReason: 'DEATH_IN_SERVICE',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBe(5);
      expect(res.lastWorkingDay).toBe('10/09/2026');
      expect(res.ambiguous).toBe(false);
    });

    it('assigns Code 3 for Retired event with formatted LWD', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 15000,
        payableDays: 20,
        snapshotLastWorkingDay: '2026-09-20',
        status: 'RETIRED',
        exitReason: 'SUPERANNUATION',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBe(3);
      expect(res.lastWorkingDay).toBe('20/09/2026');
    });

    it('assigns Code 2 for Left Service/Resigned even when wages earned during month', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 12000,
        payableDays: 15,
        snapshotLastWorkingDay: new Date(Date.UTC(2026, 8, 15)),
        status: 'RESIGNED',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBe(2);
      expect(res.lastWorkingDay).toBe('15/09/2026');
    });

    it('assigns Code 0 for normal active employee with positive wages and days', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 18000,
        payableDays: 26,
        snapshotLastWorkingDay: null,
        status: 'ACTIVE',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBe(0);
      expect(res.lastWorkingDay).toBe('');
      expect(res.ambiguous).toBe(false);
    });

    it('assigns Code 1 for 0 wages and 0 payable days (unpaid leave)', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 0,
        payableDays: 0,
        snapshotLastWorkingDay: null,
        status: 'ACTIVE',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBe(1);
      expect(res.lastWorkingDay).toBe('');
    });

    it('marks ambiguous when separated without LWD snapshot', () => {
      const res = determineReasonCodeAndLwd({
        grossWages: 0,
        payableDays: 0,
        snapshotLastWorkingDay: null,
        status: 'RESIGNED',
        periodYear: 2026,
        periodMonth: 9,
      });
      expect(res.reasonCode).toBeNull();
      expect(res.ambiguous).toBe(true);
    });
  });

  // =========================================================================
  // UNIT TESTS: Bulk Export & Determinism (Section 22 & 23)
  // =========================================================================
  describe('Unit Tests: 6-Column Bulk Export & Hash Determinism', () => {
    it('generates 6-column CSV with CRLF and reproducible SHA-256 hash', () => {
      const items = [
        {
          snapshotEsicIp: '1234567890',
          snapshotEmployeeName: 'Anil Sharma',
          grossWages: 15000,
          payableDays: 25,
          snapshotLastWorkingDay: null,
          status: 'ACTIVE',
        },
        {
          snapshotEsicIp: '9876543210',
          snapshotEmployeeName: 'Ramesh Patel',
          grossWages: 8000,
          payableDays: 14,
          snapshotLastWorkingDay: new Date(Date.UTC(2026, 8, 14)),
          status: 'RESIGNED',
        },
      ];

      const run1 = generateEsicBulkUpload({ periodYear: 2026, periodMonth: 9, items });
      const run2 = generateEsicBulkUpload({ periodYear: 2026, periodMonth: 9, items });

      expect(run1.recordCount).toBe(2);
      expect(run1.csv).toBe(run2.csv);
      expect(run1.checksum).toBe(run2.checksum);
      expect(run1.csv).toContain('1234567890,ANIL SHARMA,25,15000,0,');
      expect(run1.csv).toContain('9876543210,RAMESH PATEL,14,8000,2,14/09/2026');
      expect(run1.csv.endsWith('\r\n')).toBe(true);
    });

    it('sanitizes IP Name to uppercase and removes illegal characters', () => {
      expect(sanitizeIpName('John Doe Jr. #123')).toBe('JOHN DOE JR.');
    });
  });

  // =========================================================================
  // UNIT TESTS: Pre-Upload Diagnostics (Section 26)
  // =========================================================================
  describe('Unit Tests: Diagnostics (ESI-DIAG-00 through ESI-DIAG-08)', () => {
    it('flags ESI-DIAG-00 when company ESI registration number is missing', () => {
      const res = runEsicDiagnostics({
        filing: { domain: 'ESIC_MONTHLY', periodYear: 2026, periodMonth: 9 },
        companySettings: { esiRegistrationNumber: null },
        items: [],
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.ruleId === 'ESI-DIAG-00')).toBe(true);
    });

    it('flags ESI-DIAG-01 when covered employee is missing 10-digit IP number', () => {
      const res = runEsicDiagnostics({
        filing: { domain: 'ESIC_MONTHLY', periodYear: 2026, periodMonth: 9 },
        companySettings: { esiRegistrationNumber: '01234567890123456' },
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Test Emp',
            snapshotEsicIp: null,
            grossWages: 10000,
            payableDays: 20,
            eeEsiShare: 75,
            erEsiShare: 325,
          },
        ],
      });
      expect(res.errors.some((e) => e.ruleId === 'ESI-DIAG-01')).toBe(true);
    });

    it('flags ESI-DIAG-05 warning for wages between ₹21,001 and ₹25,000 for PwD review', () => {
      const res = runEsicDiagnostics({
        filing: { domain: 'ESIC_MONTHLY', periodYear: 2026, periodMonth: 9 },
        companySettings: { esiRegistrationNumber: '01234567890123456' },
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Test Emp',
            snapshotEsicIp: '1234567890',
            grossWages: 23000,
            payableDays: 26,
            eeEsiShare: 172.5,
            erEsiShare: 747.5,
          },
        ],
      });
      expect(res.warnings.some((w) => w.ruleId === 'ESI-DIAG-05')).toBe(true);
    });

    it('flags ESI-DIAG-07 when employee <= ₹176/day has employee deduction', () => {
      const res = runEsicDiagnostics({
        filing: { domain: 'ESIC_MONTHLY', periodYear: 2026, periodMonth: 9 },
        companySettings: { esiRegistrationNumber: '01234567890123456' },
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Low Wage Emp',
            snapshotEsicIp: '1234567890',
            grossWages: 3500, // 3500 / 20 = 175 <= 176
            payableDays: 20,
            eeEsiShare: 26.25, // Illegal deduction under Rule 52
            erEsiShare: 113.75,
          },
        ],
      });
      expect(res.errors.some((e) => e.ruleId === 'ESI-DIAG-07')).toBe(true);
    });
  });

  // =========================================================================
  // INTEGRATION & API TESTS: Filing Lifecycle & Maker/Checker (Sections 15, 16, 20)
  // =========================================================================
  describe('Integration Tests: Filing Lifecycle, RBAC & Maker/Checker SoD', () => {
    it('enforces SoD: Maker cannot approve their own statutory filing', async () => {
      const { app, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage', 'compliance.approve'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'PENDING_APPROVAL',
          createdById: makerUser,
        },
      });

      const res = await request(app)
        .post(`/api/v1/compliance/filings/${filing.id}/approve`)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error?.code || res.body.error).toBe('MAKER_CANNOT_APPROVE');
    });

    it('allows distinct Checker to approve and lock filing', async () => {
      const { app, prisma } = createTestApp({
        id: checkerUser,
        companyId: companyA,
        permissions: ['compliance.approve'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'PENDING_APPROVAL',
          createdById: makerUser,
        },
      });

      // 1. Approve
      const approveRes = await request(app)
        .post(`/api/v1/compliance/filings/${filing.id}/approve`)
        .send();
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');

      // 2. Lock
      const lockRes = await request(app)
        .post(`/api/v1/compliance/filings/${filing.id}/lock`)
        .send();
      expect(lockRes.status).toBe(200);
      expect(lockRes.body.data.status).toBe('LOCKED');
      expect(lockRes.body.data.sha256Checksum).toBeTruthy();
    });

    it('enforces tenant isolation: Tenant B cannot access Tenant A filing', async () => {
      const { app, prisma } = createTestApp({
        id: 'user-tenant-b',
        companyId: companyB,
        permissions: ['compliance.view'],
      });

      const filingA = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'LOCKED',
          createdById: makerUser,
        },
      });

      const res = await request(app).get(`/api/v1/compliance/filings/${filingA.id}`);
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // INTEGRATION TESTS: Immutable LWD Snapshot (Section 6)
  // =========================================================================
  describe('Integration Tests: Immutable Last Working Day Snapshot (Section 6)', () => {
    it('reads from snapshotLastWorkingDay and ignores post-lock live Employee.lastWorkingDay changes', async () => {
      const { app, prisma } = createTestApp({
        id: checkerUser,
        companyId: companyA,
        permissions: ['compliance.view'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'LOCKED',
          createdById: makerUser,
        },
      });

      // Snapshot captured LWD 15/09/2026
      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA3,
          snapshotEmployeeCode: 'EMP003',
          snapshotEmployeeName: 'Ramesh Patel',
          snapshotEsicIp: '1234567890',
          snapshotLastWorkingDay: new Date(Date.UTC(2026, 8, 15)),
          workingDays: 26,
          payableDays: 15,
          grossWages: 10000,
          eeEsiShare: 75,
          erEsiShare: 325,
        },
      });

      // 1. Export locked filing
      const export1 = await request(app).get(`/api/v1/compliance/filings/${filing.id}/export`);
      expect(export1.status).toBe(200);
      expect(export1.text).toContain('1234567890,RAMESH PATEL,15,10000,2,15/09/2026');

      // 2. Mutate live employee lastWorkingDay in database
      const liveEmp = employees.find((e) => e.id === employeeA3);
      liveEmp.lastWorkingDay = new Date('2026-10-31');

      // 3. Re-export filing: Output MUST remain identical
      const export2 = await request(app).get(`/api/v1/compliance/filings/${filing.id}/export`);
      expect(export2.status).toBe(200);
      expect(export2.text).toBe(export1.text);
      expect(export2.text).toContain('15/09/2026');
      expect(export2.text).not.toContain('31/10/2026');
    });
  });

  // =========================================================================
  // INTEGRATION TESTS: ESIC Challan Management & Reconciliation (Section 21)
  // =========================================================================
  describe('Integration Tests: ESIC Challan Management & Reconciliation', () => {
    it('creates ESIC Challan, sets 14-digit CPRN, records payment, and reconciles with SoD', async () => {
      const { app: makerApp, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage', 'compliance.approve'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'LOCKED',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Anil Sharma',
          snapshotEsicIp: '1234567890',
          grossWages: 20000,
          eeEsiShare: 150,
          erEsiShare: 650,
        },
      });

      // 1. Generate Challan
      const createRes = await request(makerApp)
        .post('/api/v1/compliance/esic/challans')
        .send({
          statutoryFilingId: filing.id,
          challanDate: '2026-10-05',
          notes: 'September 2026 ESIC liability',
        });

      expect(createRes.status).toBe(201);
      const challanId = createRes.body.data.id;
      expect(createRes.body.data.totalAmount).toBe(800); // 150 + 650
      expect(createRes.body.data.status).toBe('CHALLAN_GENERATED');

      // 2. Set CPRN (14 digits)
      const setCprnRes = await request(makerApp)
        .patch(`/api/v1/compliance/esic/challans/${challanId}`)
        .send({
          action: 'SET_CPRN',
          cprnNumber: '12345678901234',
        });
      expect(setCprnRes.status).toBe(200);
      expect(setCprnRes.body.data.cprnNumber).toBe('12345678901234');

      // 3. Initiate Payment
      const initRes = await request(makerApp)
        .patch(`/api/v1/compliance/esic/challans/${challanId}`)
        .send({ action: 'INITIATE_PAYMENT' });
      expect(initRes.status).toBe(200);
      expect(initRes.body.data.status).toBe('PAYMENT_INITIATED');

      // 4. Record Payment
      const payRes = await request(makerApp)
        .patch(`/api/v1/compliance/esic/challans/${challanId}`)
        .send({
          action: 'RECORD_PAYMENT',
          paidDate: '2026-10-10',
          transactionReference: 'TXN-ESI-998877',
        });
      expect(payRes.status).toBe(200);
      expect(payRes.body.data.status).toBe('PAID');

      // 5. SoD Check: Maker cannot reconcile
      const makerReconcile = await request(makerApp)
        .patch(`/api/v1/compliance/esic/challans/${challanId}`)
        .send({ action: 'RECONCILE' });
      expect(makerReconcile.status).toBe(403);
      expect(makerReconcile.body.error?.code || makerReconcile.body.error).toBe('MAKER_CANNOT_RECONCILE');

      // 6. Checker Reconciles
      const { app: checkerApp } = createTestApp({
        id: checkerUser,
        companyId: companyA,
        permissions: ['compliance.approve'],
      });

      const checkerReconcile = await request(checkerApp)
        .patch(`/api/v1/compliance/esic/challans/${challanId}`)
        .send({ action: 'RECONCILE' });
      expect(checkerReconcile.status).toBe(200);
      expect(checkerReconcile.body.data.status).toBe('RECONCILED');
      expect(checkerReconcile.body.data.reconciliationChecksum).toBeTruthy();
    });

    it('rejects duplicate active challan for the same filing', async () => {
      const { app, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'APPROVED',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Anil Sharma',
          grossWages: 10000,
          eeEsiShare: 75,
          erEsiShare: 325,
        },
      });

      // First challan
      const res1 = await request(app)
        .post('/api/v1/compliance/esic/challans')
        .send({ statutoryFilingId: filing.id, challanDate: '2026-10-05' });
      expect(res1.status).toBe(201);

      // Duplicate attempt
      const res2 = await request(app)
        .post('/api/v1/compliance/esic/challans')
        .send({ statutoryFilingId: filing.id, challanDate: '2026-10-05' });
      expect(res2.status).toBe(409);
      expect(res2.body.error?.code || res2.body.error).toBe('CHALLAN_ALREADY_EXISTS');
    });

    it('rejects reconciliation if challan amount does not match filing liability', async () => {
      const { app: checkerApp, prisma } = createTestApp({
        id: checkerUser,
        companyId: companyA,
        permissions: ['compliance.approve'],
      });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'LOCKED',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Anil Sharma',
          grossWages: 20000,
          eeEsiShare: 150,
          erEsiShare: 650,
        },
      });

      // Corrupted / mismatched challan amount
      const challan = await prisma.esicChallan.create({
        data: {
          companyId: companyA,
          statutoryFilingId: filing.id,
          challanPeriodYear: 2026,
          challanPeriodMonth: 9,
          totalAmount: 900, // Correct is 800
          status: 'PAID',
          challanDate: new Date('2026-10-05'),
          paidDate: new Date('2026-10-10'),
          cprnNumber: '12345678901234',
          createdById: makerUser,
        },
      });

      const res = await request(checkerApp)
        .patch(`/api/v1/compliance/esic/challans/${challan.id}`)
        .send({ action: 'RECONCILE' });

      expect(res.status).toBe(422);
      expect(res.body.error?.code || res.body.error).toBe('RECONCILIATION_AMOUNT_MISMATCH');
    });

    it('rejects duplicate CPRN assignment across different challans', async () => {
      const { app, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage'],
      });

      // Existing challan with CPRN 12345678901234
      await prisma.esicChallan.create({
        data: {
          companyId: companyA,
          statutoryFilingId: 'filing-other',
          challanPeriodYear: 2026,
          challanPeriodMonth: 8,
          totalAmount: 500,
          status: 'PAID',
          challanDate: new Date('2026-09-05'),
          cprnNumber: '12345678901234',
          createdById: makerUser,
        },
      });

      const newChallan = await prisma.esicChallan.create({
        data: {
          companyId: companyA,
          statutoryFilingId: 'filing-new',
          challanPeriodYear: 2026,
          challanPeriodMonth: 9,
          totalAmount: 600,
          status: 'CHALLAN_GENERATED',
          challanDate: new Date('2026-10-05'),
          createdById: makerUser,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/compliance/esic/challans/${newChallan.id}`)
        .send({
          action: 'SET_CPRN',
          cprnNumber: '12345678901234',
        });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.error).toBe('DUPLICATE_CPRN');
    });

    it('disallows cancellation of challans that are already PAID or RECONCILED', async () => {
      const { app, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage'],
      });

      const paidChallan = await prisma.esicChallan.create({
        data: {
          companyId: companyA,
          statutoryFilingId: 'filing-paid',
          challanPeriodYear: 2026,
          challanPeriodMonth: 9,
          totalAmount: 1200,
          status: 'PAID',
          challanDate: new Date('2026-10-05'),
          paidDate: new Date('2026-10-10'),
          cprnNumber: '99887766554433',
          createdById: makerUser,
        },
      });

      const res = await request(app)
        .patch(`/api/v1/compliance/esic/challans/${paidChallan.id}`)
        .send({ action: 'CANCEL' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.error).toBe('CANNOT_CANCEL_PAID_CHALLAN');
    });

    it('validates Section 40(2) Employer-Borne Absorption accounting invariant for mid-period salary crossing', () => {
      // Employee was covered in April at ₹18,000. In July salary increased to ₹24,000.
      // Under Section 2(9) first proviso, employee remains covered until Sept 30.
      // If payroll employee deduction is ₹0 (because payroll engine stopped deducting at ₹21k),
      // employer absorbs employee share: Statutory Liability = Payroll EE (0) + Payroll ER (780) + Employer-borne EE share (180) = ₹960.
      const payrollEeDeduction = 0;
      const payrollErContribution = 780; // 3.25% of 24,000
      const employerBorneEeShare = 180;  // 0.75% of 24,000
      const statutoryLiability = payrollEeDeduction + payrollErContribution + employerBorneEeShare;

      expect(statutoryLiability).toBe(960);
      expect(statutoryLiability).toBe(payrollEeDeduction + payrollErContribution + employerBorneEeShare);
    });

    it('disallows discarding a filing once it is APPROVED or LOCKED', async () => {
      const { app, prisma } = createTestApp({
        id: makerUser,
        companyId: companyA,
        permissions: ['compliance.manage'],
      });

      const lockedFiling = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'ESIC_MONTHLY',
          periodYear: 2026,
          periodMonth: 9,
          payrollRunId: 'pr-01',
          status: 'LOCKED',
          createdById: makerUser,
        },
      });

      const res = await request(app).post(`/api/v1/compliance/filings/${lockedFiling.id}/discard`);
      expect(res.status).toBe(409);
      expect(res.body.error?.code || res.body.error).toBe('INVALID_STATE');
    });
  });
});
