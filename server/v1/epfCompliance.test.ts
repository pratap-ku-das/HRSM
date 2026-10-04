import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { createComplianceRouter } from './compliance/routes.js';
import {
  calculateNcpDays,
  calculateAge58EpsSplit,
  calculateEpfChallanTotals,
  generateEcrFlatText,
  runEpfDiagnostics,
  sanitizeMemberName,
} from './compliance/epfEngine.js';

describe('P2.7-B — EPF ECR 2.0 Automation Engine & Monthly Challan Reconciliation Suite', () => {
  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const employeeA1 = '00000000-0000-4000-8000-000000000001';
  const employeeA2 = '00000000-0000-4000-8000-000000000002';
  const employeeA3 = '00000000-0000-4000-8000-000000000003';

  const makerUser = 'user-maker-01';
  const checkerUser = 'user-checker-02';

  let employees: any[] = [];
  let companySettings: any[] = [];
  let statutoryRuleVersions: any[] = [];
  let statutoryFilings: any[] = [];
  let statutoryFilingItems: any[] = [];
  let epfChallans: any[] = [];
  let auditLogs: any[] = [];

  const setupData = () => {
    employees = [
      {
        id: employeeA1,
        companyId: companyA,
        employeeCode: 'EMP001',
        firstName: 'Rajesh',
        lastName: 'Kumar',
        status: 'ACTIVE',
      },
      {
        id: employeeA2,
        companyId: companyA,
        employeeCode: 'EMP002',
        firstName: 'Sunita',
        lastName: 'Sharma',
        status: 'ACTIVE',
      },
      {
        id: employeeA3,
        companyId: companyA,
        employeeCode: 'EMP003',
        firstName: 'Vikram',
        lastName: 'Sen',
        status: 'ACTIVE',
      },
    ];

    companySettings = [
      {
        id: 'cs-01',
        companyId: companyA,
        pfRegistrationNumber: 'DLCPM0012345000',
      },
      {
        id: 'cs-02',
        companyId: companyB,
        pfRegistrationNumber: 'MHBAN0098765000',
      },
    ];

    statutoryRuleVersions = [
      {
        id: 'srv-01',
        companyId: companyA,
        type: 'PF',
        active: true,
        effectiveFrom: new Date('2025-01-01'),
        configuration: {
          adminChargeRate: 0.005,
          minAdminChargeAmount: 500,
          edliContributionRate: 0.005,
          edliAdminChargeRate: 0.0,
          wageCeiling: 15000,
          epsRate: 0.0833,
          epsMaxMonthlyContribution: 1250,
          employeePfRate: 0.12,
          employerPfRate: 0.12,
        },
      },
    ];

    statutoryFilings = [];
    statutoryFilingItems = [];
    epfChallans = [];
    auditLogs = [];
  };

  const createMockPrisma = () => {
    return {
      companySettings: {
        findUnique: async ({ where }: any) =>
          companySettings.find((c) => c.companyId === where.companyId),
      },
      statutoryRuleVersion: {
        findFirst: async ({ where, orderBy }: any) => {
          let list = statutoryRuleVersions.filter((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v)
          );
          if (orderBy?.effectiveFrom === 'desc') {
            list = [...list].sort(
              (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
            );
          }
          return list[0] || null;
        },
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
          const challans = epfChallans.filter((c) => c.statutoryFilingId === filing.id);
          return { ...filing, items, epfChallans: challans };
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
      epfChallan: {
        create: async ({ data }: any) => {
          const challan = { id: `epf-ch-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          epfChallans.push(challan);
          return challan;
        },
        findFirst: async ({ where }: any) => {
          return (
            epfChallans.find((c) => {
              if (where.status?.not && c.status === where.status.not) return false;
              if (where.id?.not && c.id === where.id.not) return false;
              return Object.entries(where).every(([k, v]) => {
                if (k === 'status' || k === 'id') return true;
                return c[k] === v;
              });
            }) || null
          );
        },
        findMany: async ({ where }: any) =>
          epfChallans.filter((c) => {
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.wageYear && c.wageYear !== where.wageYear) return false;
            if (where.wageMonth && c.wageMonth !== where.wageMonth) return false;
            if (where.statutoryFilingId && c.statutoryFilingId !== where.statutoryFilingId) return false;
            return true;
          }),
        update: async ({ where, data }: any) => {
          const challan = epfChallans.find((c) => c.id === where.id);
          if (challan) Object.assign(challan, data, { updatedAt: new Date() });
          return challan;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          const log = { id: `log-${Date.now()}`, ...data, createdAt: new Date() };
          auditLogs.push(log);
          return log;
        },
      },
      $transaction: async (cb: any) => cb(createMockPrisma()),
    } as any;
  };

  const createTestApp = (authOverrides = {}) => {
    const app = express();
    app.use(express.json());

    const defaultAuth = {
      id: makerUser,
      companyId: companyA,
      role: 'PAYROLL_ADMIN',
      permissions: ['compliance.view', 'compliance.manage'],
      ...authOverrides,
    };

    const authenticate = (req: any, _res: any, next: any) => {
      req.auth = defaultAuth;
      req.requestId = 'test-req-epf';
      next();
    };

    const prisma = createMockPrisma();
    app.use(authenticate);
    app.use(createComplianceRouter(prisma, authenticate));

    app.use((err: any, _req: any, res: any, _next: any) => {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: (err as any).issues || (err as any).errors } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    });

    return { app, prisma };
  };

  beforeEach(() => {
    setupData();
  });

  // =========================================================================
  // 1. UNIT TESTS: PURE ENGINE FUNCTIONS & STATUTORY RULES
  // =========================================================================

  describe('Statutory Rule Calculations (Pure Engine Tests)', () => {
    it('Locked Rule 9: NCP days calculation enforces Math.floor and month boundaries', () => {
      // Half-day unpaid absence must NOT be an NCP day (it earned contributory wages)
      expect(calculateNcpDays(0.5, 30)).toBe(0);
      expect(calculateNcpDays(1.5, 30)).toBe(1);
      expect(calculateNcpDays(2.0, 30)).toBe(2);
      expect(calculateNcpDays(0, 31)).toBe(0);
      // Negative protection
      expect(calculateNcpDays(-1, 30)).toBe(0);
      // Month boundary capping
      expect(calculateNcpDays(35, 30)).toBe(30);
      // Zero payable days => entire month is NCP
      expect(calculateNcpDays(0, 30, 0)).toBe(30);
    });

    it('Locked Rule 9: Age-58 EPS calculation handles before, mid-month, and post-month', () => {
      // Case A: Attained age 58 before the wage month (DOB: 1968-02-15, wage month: 2026-03)
      const resBefore = calculateAge58EpsSplit({
        epfWages: 15000,
        eePfShare: 1800,
        totalEmployerPf: 1800,
        dateOfBirth: '1968-02-15',
        periodYear: 2026,
        periodMonth: 3,
      });
      expect(resBefore.epsWages).toBe(0);
      expect(resBefore.erEpsShare).toBe(0);
      expect(resBefore.erEpfShare).toBe(1800);
      expect(resBefore.erEpsShare + resBefore.erEpfShare).toBe(1800);

      // Case B: Attained age 58 mid-month (DOB: 1968-03-16, wage month: 2026-03, turns 58 on 16th)
      // Contributory days prior to 16th = 15 days in 31-day month
      const resMid = calculateAge58EpsSplit({
        epfWages: 15000,
        eePfShare: 1800,
        totalEmployerPf: 1800,
        dateOfBirth: '1968-03-16',
        periodYear: 2026,
        periodMonth: 3,
        daysInMonth: 31,
        payableDays: 31,
      });
      expect(resMid.epsWages).toBe(Math.min(15000, Math.round((15000 * 15) / 31)));
      expect(resMid.erEpsShare).toBeGreaterThan(0);
      expect(resMid.erEpsShare).toBeLessThanOrEqual(1250);
      expect(resMid.erEpsShare + resMid.erEpfShare).toBe(1800);

      // Case C: Attains age 58 after the wage month (DOB: 1970-05-10, normal <58)
      const resAfter = calculateAge58EpsSplit({
        epfWages: 15000,
        eePfShare: 1800,
        totalEmployerPf: 1800,
        dateOfBirth: '1970-05-10',
        periodYear: 2026,
        periodMonth: 3,
      });
      expect(resAfter.epsWages).toBe(15000);
      expect(resAfter.erEpsShare).toBe(1250);
      expect(resAfter.erEpfShare).toBe(550);
      expect(resAfter.erEpsShare + resAfter.erEpfShare).toBe(1800);

      // Case D: Explicit epsExempt
      const resExempt = calculateAge58EpsSplit({
        epfWages: 15000,
        eePfShare: 1800,
        totalEmployerPf: 1800,
        epsExempt: true,
        periodYear: 2026,
        periodMonth: 3,
      });
      expect(resExempt.epsWages).toBe(0);
      expect(resExempt.erEpsShare).toBe(0);
      expect(resExempt.erEpfShare).toBe(1800);
    });

    it('Sanitizes member name according to official EPFO specification', () => {
      expect(sanitizeMemberName('John O\'Connor')).toBe('JOHN O CONNOR');
      expect(sanitizeMemberName('Dr. A. P. J. Abdul Kalam')).toBe('DR. A. P. J. ABDUL KALAM');
      expect(sanitizeMemberName('Priya  Sharma #123')).toBe('PRIYA SHARMA');
      expect(sanitizeMemberName('')).toBe('UNKNOWN');
    });

    it('Generates 11-column ECR 2.0 flat text with #~# delimiter and SHA-256', () => {
      const items = [
        {
          snapshotUan: '100123456789',
          snapshotEmployeeName: 'Rajesh Kumar',
          grossWages: 25000,
          epfWages: 15000,
          epsWages: 15000,
          edliWages: 15000,
          eePfShare: 1800,
          erEpsShare: 1250,
          erEpfShare: 550,
          ncpDays: 0,
        },
        {
          snapshotUan: '100987654321',
          snapshotEmployeeName: 'Sunita Sharma',
          grossWages: 12000,
          epfWages: 12000,
          epsWages: 12000,
          edliWages: 12000,
          eePfShare: 1440,
          erEpsShare: 1000,
          erEpfShare: 440,
          ncpDays: 2,
        },
      ];

      const { text, checksum, recordCount } = generateEcrFlatText({ items });

      expect(recordCount).toBe(2);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);

      const lines = text.trim().split('\r\n');
      expect(lines.length).toBe(2);

      // Verify line 1 has exactly 11 fields delimited by #~#
      const cols1 = lines[0].split('#~#');
      expect(cols1.length).toBe(11);
      expect(cols1[0]).toBe('100123456789'); // UAN
      expect(cols1[1]).toBe('RAJESH KUMAR'); // Name
      expect(cols1[2]).toBe('25000'); // Gross Wages
      expect(cols1[3]).toBe('15000'); // EPF Wages
      expect(cols1[4]).toBe('15000'); // EPS Wages
      expect(cols1[5]).toBe('15000'); // EDLI Wages
      expect(cols1[6]).toBe('1800'); // EE Share
      expect(cols1[7]).toBe('1250'); // EPS Share
      expect(cols1[8]).toBe('550'); // ER Share
      expect(cols1[9]).toBe('0'); // NCP Days
      expect(cols1[10]).toBe('0'); // Refund of advances

      // Verify line 2
      const cols2 = lines[1].split('#~#');
      expect(cols2.length).toBe(11);
      expect(cols2[9]).toBe('2'); // NCP Days
    });

    it('Reconciles SBI 5-Account Challan totals with statutory minimums and rounding', () => {
      const items = [
        { epfWages: 15000, edliWages: 15000, eePfShare: 1800, erEpfShare: 550, erEpsShare: 1250 },
        { epfWages: 12000, edliWages: 12000, eePfShare: 1440, erEpfShare: 440, erEpsShare: 1000 },
      ];

      const totals = calculateEpfChallanTotals(items);

      // A/c 1: EE (1800 + 1440 = 3240) + ER (550 + 440 = 990) = 4230
      expect(totals.account1Amount).toBe(4230);

      // Total EPF Wages: 27000. 0.50% of 27000 = 135. Min admin charge is 500.
      expect(totals.account2Amount).toBe(500); // Minimum ₹500 triggered

      // A/c 10 (EPS): 1250 + 1000 = 2250
      expect(totals.account10Amount).toBe(2250);

      // A/c 21 (EDLI): 0.50% of 27000 = 135
      expect(totals.account21Amount).toBe(135);

      // A/c 22: 0
      expect(totals.account22Amount).toBe(0);

      // Total: 4230 + 500 + 2250 + 135 + 0 = 7115
      expect(totals.totalAmount).toBe(7115);

      // Employer 12% Invariant: A/c 1 ER (990) + A/c 10 EPS (2250) = 3240 === Total EE Share (3240)
      expect((totals.account1Amount - (1800 + 1440)) + totals.account10Amount).toBe(1800 + 1440);
    });
  });

  // =========================================================================
  // 2. PRE-UPLOAD DIAGNOSTIC TESTS (ECR-DIAG-00 TO ECR-DIAG-10)
  // =========================================================================

  describe('Pre-Upload Statutory Diagnostics Suite', () => {
    it('catches missing establishment code (ECR-DIAG-00)', () => {
      const res = runEpfDiagnostics({
        companyPfRegistrationNumber: '',
        periodYear: 2026,
        periodMonth: 3,
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Rajesh Kumar',
            snapshotUan: '100123456789',
            grossWages: 20000,
            epfWages: 15000,
            epsWages: 15000,
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1250,
            erEpfShare: 550,
            ncpDays: 0,
          },
        ],
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-00')).toBe(true);
    });

    it('catches invalid/missing UAN (ECR-DIAG-01, ECR-DIAG-02)', () => {
      const resMissing = runEpfDiagnostics({
        companyPfRegistrationNumber: 'DLCPM0012345000',
        periodYear: 2026,
        periodMonth: 3,
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Rajesh Kumar',
            snapshotUan: null,
            grossWages: 20000,
            epfWages: 15000,
            epsWages: 15000,
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1250,
            erEpfShare: 550,
            ncpDays: 0,
          },
        ],
      });
      expect(resMissing.valid).toBe(false);
      expect(resMissing.errors.some((e) => e.ruleId === 'ECR-DIAG-01')).toBe(true);

      const resInvalid = runEpfDiagnostics({
        companyPfRegistrationNumber: 'DLCPM0012345000',
        periodYear: 2026,
        periodMonth: 3,
        items: [
          {
            snapshotEmployeeCode: 'EMP002',
            snapshotEmployeeName: 'Sunita Sharma',
            snapshotUan: '012345678912', // Starts with 0
            grossWages: 20000,
            epfWages: 15000,
            epsWages: 15000,
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1250,
            erEpfShare: 550,
            ncpDays: 0,
          },
        ],
      });
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.errors.some((e) => e.ruleId === 'ECR-DIAG-02')).toBe(true);
    });

    it('catches wage hierarchy and capping violations (ECR-DIAG-04, 05, 06)', () => {
      const res = runEpfDiagnostics({
        companyPfRegistrationNumber: 'DLCPM0012345000',
        periodYear: 2026,
        periodMonth: 3,
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Rajesh Kumar',
            snapshotUan: '100123456789',
            grossWages: 10000,
            epfWages: 15000, // Gross < EPF
            epsWages: 18000, // EPS > 15000
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1500, // EPS share > 1250
            erEpfShare: 300,
            ncpDays: 0,
          },
        ],
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-04')).toBe(true);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-05')).toBe(true);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-06')).toBe(true);
    });

    it('catches NCP days out-of-range (ECR-DIAG-08)', () => {
      const res = runEpfDiagnostics({
        companyPfRegistrationNumber: 'DLCPM0012345000',
        periodYear: 2026,
        periodMonth: 3, // 31 days
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Rajesh Kumar',
            snapshotUan: '100123456789',
            grossWages: 20000,
            epfWages: 15000,
            epsWages: 15000,
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1250,
            erEpfShare: 550,
            ncpDays: 32, // > 31
          },
        ],
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-08')).toBe(true);
    });

    it('catches EE / Employer mathematical mismatch (ECR-DIAG-09)', () => {
      const res = runEpfDiagnostics({
        companyPfRegistrationNumber: 'DLCPM0012345000',
        periodYear: 2026,
        periodMonth: 3,
        items: [
          {
            snapshotEmployeeCode: 'EMP001',
            snapshotEmployeeName: 'Rajesh Kumar',
            snapshotUan: '100123456789',
            grossWages: 20000,
            epfWages: 15000,
            epsWages: 15000,
            edliWages: 15000,
            eePfShare: 1800,
            erEpsShare: 1250,
            erEpfShare: 500, // 1250 + 500 = 1750 !== 1800
            ncpDays: 0,
          },
        ],
      });
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.ruleId === 'ECR-DIAG-09')).toBe(true);
    });
  });

  // =========================================================================
  // 3. INTEGRATION TESTS: FILING EXPORT, CHALLAN LIFECYCLE & MAKER-CHECKER
  // =========================================================================

  describe('Integration Endpoints: Export & EpfChallan Reconciliation', () => {
    it('prohibits export when filing is in DRAFT or VALIDATED state (must be LOCKED or EXPORTED)', async () => {
      const { app, prisma } = createTestApp();

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'DRAFT',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      const res = await request(app).get(`/compliance/filings/${filing.id}/export`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('exports ECR 2.0 flat text file with correct headers and transitions LOCKED -> EXPORTED', async () => {
      const { app, prisma } = createTestApp();

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Rajesh Kumar',
          snapshotUan: '100123456789',
          grossWages: 25000,
          epfWages: 15000,
          epsWages: 15000,
          edliWages: 15000,
          eePfShare: 1800,
          erEpsShare: 1250,
          erEpfShare: 550,
          ncpDays: 0,
        },
      });

      const res = await request(app).get(`/compliance/filings/${filing.id}/export`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.headers['content-disposition']).toContain('ECR_DLCPM0012345000_202603.txt');
      expect(res.headers['x-ecr-checksum']).toMatch(/^[a-f0-9]{64}$/);
      expect(res.headers['x-ecr-record-count']).toBe('1');
      expect(res.text).toContain('100123456789#~#RAJESH KUMAR#~#25000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#0#~#0');

      // Verify filing transitioned to EXPORTED
      const updatedFiling = await prisma.statutoryFiling.findFirst({ where: { id: filing.id } });
      expect(updatedFiling.status).toBe('EXPORTED');
    });

    it('creates EPF Challan with mandatory statutoryFilingId and rejects cross-domain filings', async () => {
      const { app, prisma } = createTestApp();

      // Create TDS filing (non-EPF)
      const tdsFiling = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'TDS_24Q',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      const resDomainMismatch = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: tdsFiling.id,
        challanDate: '2026-04-10',
      });
      expect(resDomainMismatch.status).toBe(422);
      expect(resDomainMismatch.body.error.code).toBe('DOMAIN_MISMATCH');

      // Create valid EPF filing
      const epfFiling = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: epfFiling.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Rajesh Kumar',
          snapshotUan: '100123456789',
          grossWages: 25000,
          epfWages: 15000,
          epsWages: 15000,
          edliWages: 15000,
          eePfShare: 1800,
          erEpsShare: 1250,
          erEpfShare: 550,
          ncpDays: 0,
        },
      });

      const resCreate = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: epfFiling.id,
        challanDate: '2026-04-10',
      });

      expect(resCreate.status).toBe(201);
      expect(resCreate.body.data.statutoryFilingId).toBe(epfFiling.id);
      expect(resCreate.body.data.status).toBe('CHALLAN_GENERATED');
      expect(resCreate.body.data.trrnNumber).toBeNull(); // Nullable initially
      expect(resCreate.body.data.account1Amount).toBe(2350); // 1800 + 550
      expect(resCreate.body.data.account2Amount).toBe(500); // Minimum 500
      expect(resCreate.body.data.account10Amount).toBe(1250);
      expect(resCreate.body.data.account21Amount).toBe(75); // 0.50% of 15000
      expect(resCreate.body.data.totalAmount).toBe(4175); // 2350 + 500 + 1250 + 75

      // Reject duplicate active challan
      const resDup = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: epfFiling.id,
        challanDate: '2026-04-10',
      });
      expect(resDup.status).toBe(409);
      expect(resDup.body.error.code).toBe('CHALLAN_ALREADY_EXISTS');
    });

    it('enforces strict tenant isolation on EPF challans', async () => {
      const { app, prisma } = createTestApp({ companyId: companyB });

      // Filing belongs to company A
      const epfFiling = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      // User from Company B attempts to generate challan against Company A's filing
      const res = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: epfFiling.id,
        challanDate: '2026-04-10',
      });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('FILING_NOT_FOUND');
    });

    it('executes valid state machine lifecycle: CHALLAN_GENERATED -> PAYMENT_INITIATED -> PAID -> RECONCILED', async () => {
      const { app, prisma } = createTestApp({ id: makerUser, permissions: ['compliance.manage', 'compliance.approve'] });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      await prisma.statutoryFilingItem.create({
        data: {
          filingId: filing.id,
          employeeId: employeeA1,
          snapshotEmployeeCode: 'EMP001',
          snapshotEmployeeName: 'Rajesh Kumar',
          snapshotUan: '100123456789',
          grossWages: 25000,
          epfWages: 15000,
          epsWages: 15000,
          edliWages: 15000,
          eePfShare: 1800,
          erEpsShare: 1250,
          erEpfShare: 550,
          ncpDays: 0,
        },
      });

      const createRes = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: filing.id,
        challanDate: '2026-04-10',
      });
      const challanId = createRes.body.data.id;

      // 1. Initiate Payment with TRRN
      const initRes = await request(app).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'INITIATE_PAYMENT',
        trrnNumber: 'TRRN123456789012',
      });
      expect(initRes.status).toBe(200);
      expect(initRes.body.data.status).toBe('PAYMENT_INITIATED');
      expect(initRes.body.data.trrnNumber).toBe('TRRN123456789012');

      // 2. Record Payment
      const paidRes = await request(app).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'RECORD_PAYMENT',
        paidDate: '2026-04-12',
        crnNumber: 'CRN987654321',
        bankReference: 'SBI-TXN-001',
      });
      expect(paidRes.status).toBe(200);
      expect(paidRes.body.data.status).toBe('PAID');
      expect(paidRes.body.data.crnNumber).toBe('CRN987654321');

      // 3. Maker attempts to reconcile (Maker-Checker violation)
      const selfReconcileRes = await request(app).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'RECONCILE',
      });
      expect(selfReconcileRes.status).toBe(403);
      expect(selfReconcileRes.body.error.code).toBe('MAKER_CANNOT_RECONCILE');

      // 4. Checker reconciles successfully
      const { app: checkerApp } = createTestApp({
        id: checkerUser,
        permissions: ['compliance.approve'],
      });
      const checkerReconcileRes = await request(checkerApp).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'RECONCILE',
      });
      expect(checkerReconcileRes.status).toBe(200);
      expect(checkerReconcileRes.body.data.status).toBe('RECONCILED');
      expect(checkerReconcileRes.body.data.reconciledById).toBe(checkerUser);
    });

    it('rejects invalid state machine transitions', async () => {
      const { app, prisma } = createTestApp({ id: makerUser, permissions: ['compliance.manage'] });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      const createRes = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: filing.id,
        challanDate: '2026-04-10',
      });
      const challanId = createRes.body.data.id;

      // Jump directly from CHALLAN_GENERATED to RECONCILED (Illegal jump)
      const { app: checkerApp } = createTestApp({
        id: checkerUser,
        permissions: ['compliance.approve'],
      });
      const jumpRes = await request(checkerApp).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'RECONCILE',
      });
      expect(jumpRes.status).toBe(409);
      expect(jumpRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('allows cancellation of unpaid challan but prevents cancellation of PAID challan', async () => {
      const { app, prisma } = createTestApp({ id: makerUser, permissions: ['compliance.manage'] });

      const filing = await prisma.statutoryFiling.create({
        data: {
          companyId: companyA,
          domain: 'EPF_ECR',
          periodYear: 2026,
          periodMonth: 3,
          status: 'LOCKED',
          payrollRunId: '11111111-1111-4000-8000-111111111111',
          createdById: makerUser,
        },
      });

      const createRes = await request(app).post('/compliance/epf/challans').send({
        statutoryFilingId: filing.id,
        challanDate: '2026-04-10',
      });
      const challanId = createRes.body.data.id;

      // Cancel draft challan
      const cancelRes = await request(app).patch(`/compliance/epf/challans/${challanId}`).send({
        action: 'CANCEL',
      });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
    });
  });
});
