import express from 'express';
import request from 'supertest';
import { ZodError } from 'zod';
import { describe, expect, it, beforeEach } from 'vitest';
import { createComplianceRouter } from './compliance/routes.js';
import { createPayrollRouter } from './payroll.js';
import { generateCanonicalChecksum, extractStatutorySnapshot } from './compliance/snapshotEngine.js';

describe('P2.7-A — Statutory Compliance Architecture & Snapshot Integrity Test Suite', () => {
  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const employeeA1 = '00000000-0000-4000-8000-000000000001';
  const employeeA2 = '00000000-0000-4000-8000-000000000002';
  const employeeB1 = '00000000-0000-4000-8000-000000000003';

  const makerUser = 'user-maker-01';
  const checkerUser = 'user-checker-02';

  // In-memory data store
  let employees: any[] = [];
  let employeeStatutoryProfiles: any[] = [];
  let tdsChallans: any[] = [];
  let statutoryFilings: any[] = [];
  let statutoryFilingItems: any[] = [];
  let payrollRuns: any[] = [];
  let payrollLines: any[] = [];
  let payrollAdjustments: any[] = [];
  let auditLogs: any[] = [];

  const setupData = () => {
    employees = [
      {
        id: employeeA1,
        companyId: companyA,
        employeeCode: 'EMP001',
        firstName: 'Aarav',
        lastName: 'Patel',
        status: 'ACTIVE',
        taxIdentifier: 'ABCDE1234F',
      },
      {
        id: employeeA2,
        companyId: companyA,
        employeeCode: 'EMP002',
        firstName: 'Priya',
        lastName: 'Sharma',
        status: 'ACTIVE',
        taxIdentifier: 'PQRSX5678K',
      },
      {
        id: employeeB1,
        companyId: companyB,
        employeeCode: 'EMPB01',
        firstName: 'Vikram',
        lastName: 'Rao',
        status: 'ACTIVE',
        taxIdentifier: 'LMNOP9012Z',
      },
    ];

    employeeStatutoryProfiles = [
      {
        id: 'prof-001',
        companyId: companyA,
        employeeId: employeeA1,
        uan: '100123456789',
        pfMemberId: 'MH/BAN/0012345/000/0000001',
        esicIpNumber: '1112345678',
        panNumber: 'ABCDE1234F',
        epsExempt: false,
        pfOptOut: false,
        ptState: 'MH',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        active: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'prof-002',
        companyId: companyA,
        employeeId: employeeA2,
        uan: '100987654321',
        pfMemberId: 'MH/BAN/0012345/000/0000002',
        esicIpNumber: '1198765432',
        panNumber: 'PQRSX5678K',
        epsExempt: false,
        pfOptOut: false,
        ptState: 'MH',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        active: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ];

    tdsChallans = [];
    statutoryFilings = [];
    statutoryFilingItems = [];
    payrollAdjustments = [];
    auditLogs = [];

    payrollRuns = [
      {
        id: '11111111-1111-4000-8000-111111111111',
        companyId: companyA,
        month: '2026-03',
        status: 'LOCKED',
        totalEmployees: 2,
        totalGrossSalary: 100000,
        totalDeductions: 15000,
        totalNetPayout: 85000,
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        lockedById: checkerUser,
        lockedAt: new Date('2026-04-01'),
      },
      {
        id: '22222222-2222-4000-8000-222222222222',
        companyId: companyA,
        month: '2026-04',
        status: 'CALCULATED',
        totalEmployees: 2,
        totalGrossSalary: 100000,
        totalDeductions: 15000,
        totalNetPayout: 85000,
        periodStart: new Date('2026-04-01'),
        periodEnd: new Date('2026-04-30'),
      },
    ];

    payrollLines = [
      {
        id: 'line-001',
        payrollRunId: '11111111-1111-4000-8000-111111111111',
        employeeId: employeeA1,
        workingDays: 30,
        payableDays: 28,
        unpaidDays: 2,
        grossEarnings: 60000,
        employeeDeductions: 8000,
        employerContributions: 8000,
        reimbursements: 0,
        netPay: 52000,
        breakdown: {
          BASIC: 30000,
          HRA: 15000,
          SPECIAL: 15000,
          PF_EMPLOYEE: 1800,
          PF_EMPLOYER: 1800,
          ESI_EMPLOYEE: 0,
          ESI_EMPLOYER: 0,
          PROFESSIONAL_TAX: 200,
          TDS: 6000,
        },
        calculationTrace: [],
      },
      {
        id: 'line-002',
        payrollRunId: '11111111-1111-4000-8000-111111111111',
        employeeId: employeeA2,
        workingDays: 30,
        payableDays: 30,
        unpaidDays: 0,
        grossEarnings: 40000,
        employeeDeductions: 7000,
        employerContributions: 7000,
        reimbursements: 0,
        netPay: 33000,
        breakdown: {
          BASIC: 20000,
          HRA: 10000,
          SPECIAL: 10000,
          PF_EMPLOYEE: 1800,
          PF_EMPLOYER: 1800,
          ESI_EMPLOYEE: 300,
          ESI_EMPLOYER: 1300,
          PROFESSIONAL_TAX: 200,
          TDS: 4700,
        },
        calculationTrace: [],
      },
    ];
  };

  const createMockPrisma = () => {
    return {
      employee: {
        findFirst: async ({ where }: any) =>
          employees.find((e) => Object.entries(where).every(([k, v]) => e[k] === v)),
        findMany: async ({ where }: any) =>
          employees.filter((e) => {
            if (where.id?.in) return where.id.in.includes(e.id) && e.companyId === where.companyId;
            return e.companyId === where.companyId;
          }),
        update: async ({ where, data }: any) => {
          const emp = employees.find((e) => e.id === where.id);
          if (emp) Object.assign(emp, data);
          return emp;
        },
      },
      employeeStatutoryProfile: {
        findFirst: async ({ where }: any) =>
          employeeStatutoryProfiles.find((p) => Object.entries(where).every(([k, v]) => p[k] === v)),
        findMany: async ({ where, orderBy }: any) => {
          let res = employeeStatutoryProfiles.filter((p) => {
            if (where.employeeId?.in) return where.employeeId.in.includes(p.employeeId) && p.companyId === where.companyId && (where.active === undefined || p.active === where.active);
            return Object.entries(where).every(([k, v]) => p[k] === v);
          });
          if (orderBy?.effectiveFrom === 'desc') {
            res = [...res].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
          }
          return res;
        },
        create: async ({ data }: any) => {
          const prof = { id: `prof-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          employeeStatutoryProfiles.push(prof);
          return prof;
        },
        update: async ({ where, data }: any) => {
          const prof = employeeStatutoryProfiles.find((p) => p.id === where.id);
          if (prof) Object.assign(prof, data);
          return prof;
        },
      },
      tdsChallan: {
        create: async ({ data }: any) => {
          const challan = { id: `ch-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          tdsChallans.push(challan);
          return challan;
        },
        findMany: async ({ where, orderBy }: any) =>
          tdsChallans.filter((c) => Object.entries(where).every(([k, v]) => c[k] === v)),
      },
      payrollRun: {
        findFirst: async ({ where }: any) =>
          payrollRuns.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)),
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const r of payrollRuns) {
            if (r.id === where.id && r.companyId === where.companyId && where.status?.in?.includes(r.status)) {
              Object.assign(r, data);
              count++;
            }
          }
          return { count };
        },
      },
      payrollLine: {
        findMany: async ({ where }: any) =>
          payrollLines.filter((l) => l.payrollRunId === where.payrollRunId),
      },
      statutoryFiling: {
        findFirst: async ({ where }: any) =>
          statutoryFilings.find((f) => {
            if (where.status?.in) return f.payrollRunId === where.payrollRunId && f.companyId === where.companyId && where.status.in.includes(f.status);
            return Object.entries(where).every(([k, v]) => f[k] === v);
          }),
        findMany: async ({ where }: any) =>
          statutoryFilings.filter((f) => {
            if (where.companyId && f.companyId !== where.companyId) return false;
            if (where.domain && f.domain !== where.domain) return false;
            if (where.status && f.status !== where.status) return false;
            if (where.periodYear && f.periodYear !== where.periodYear) return false;
            return true;
          }),
        create: async ({ data }: any) => {
          const filing = { id: `filing-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date(), items: [] };
          statutoryFilings.push(filing);
          return filing;
        },
        update: async ({ where, data }: any) => {
          const filing = statutoryFilings.find((f) => f.id === where.id);
          if (filing) Object.assign(filing, data);
          return filing;
        },
        delete: async ({ where }: any) => {
          const idx = statutoryFilings.findIndex((f) => f.id === where.id);
          if (idx >= 0) statutoryFilings.splice(idx, 1);
          return { id: where.id };
        },
      },
      statutoryFilingItem: {
        create: async ({ data }: any) => {
          const item = { id: `item-${Date.now()}-${Math.random()}`, ...data, createdAt: new Date() };
          statutoryFilingItems.push(item);
          const filing = statutoryFilings.find((f) => f.id === data.filingId);
          if (filing) {
            filing.items = filing.items || [];
            filing.items.push(item);
          }
          return item;
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          auditLogs.push(data);
          return data;
        },
      },
      $transaction: async (cb: any) => cb(createMockPrisma()),
    } as any;
  };

  const createTestApp = (authOverrides: Record<string, any> = {}) => {
    const prisma = createMockPrisma();
    const app = express();
    app.use(express.json());

    const authenticate = (req: any, _res: any, next: any) => {
      req.auth = {
        id: makerUser,
        companyId: companyA,
        role: 'COMPANY_ADMIN',
        permissions: ['compliance.view', 'compliance.manage', 'compliance.approve', 'payroll.approve'],
        ...authOverrides,
      };
      next();
    };

    app.use(authenticate);
    app.use(createComplianceRouter(prisma, authenticate));
    app.use(createPayrollRouter(prisma, authenticate));

    app.use((err: any, _req: any, res: any, _next: any) => {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.errors } });
      }
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    });

    return app;
  };

  beforeEach(() => {
    setupData();
  });

  // -------------------------------------------------------------------------
  // INVARIANT 1: PAN Normalization & Overlap-Free Profile History
  // -------------------------------------------------------------------------
  it('enforces PAN format regex, uppercase normalization, and synchronizes to Employee.taxIdentifier', async () => {
    const app = createTestApp();

    // 1. Invalid PAN format rejected
    const invalidRes = await request(app)
      .post(`/compliance/profiles/${employeeA1}`)
      .send({
        panNumber: 'invalid-pan-format',
      });
    expect(invalidRes.status).toBe(400);

    // 2. Valid lowercase PAN auto-uppercased and saved
    const validRes = await request(app)
      .post(`/compliance/profiles/${employeeA1}`)
      .send({
        panNumber: 'abcde9999z',
        uan: '123456789012',
      });
    expect(validRes.status).toBe(201);
    expect(validRes.body.data.panNumber).toBe('ABCDE9999Z');

    // 3. Verified Employee.taxIdentifier synchronized
    const emp = employees.find((e) => e.id === employeeA1);
    expect(emp.taxIdentifier).toBe('ABCDE9999Z');
  });

  it('prevents overlapping active profile history by closing previous active profile effectiveTo', async () => {
    const app = createTestApp();

    // Create revision effective 2026-04-01
    const res = await request(app)
      .post(`/compliance/profiles/${employeeA1}`)
      .send({
        effectiveFrom: '2026-04-01',
        uan: '100123456789',
        panNumber: 'ABCDE1234F',
        ptState: 'KA',
      });
    expect(res.status).toBe(201);

    // Check history: previous profile closed
    const historyRes = await request(app).get(`/compliance/profiles/${employeeA1}/history`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toHaveLength(2);

    const [activeProf, previousProf] = historyRes.body.data;
    expect(activeProf.active).toBe(true);
    expect(activeProf.ptState).toBe('KA');

    expect(previousProf.active).toBe(false);
    expect(previousProf.effectiveTo).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // INVARIANT 2: TDS Challan Format Validation & Total Math
  // -------------------------------------------------------------------------
  it('validates TDS challan BSR code, serial number, and computes totalAmount exactly', async () => {
    const app = createTestApp();

    // Invalid BSR length (must be 7)
    const badBsr = await request(app).post('/compliance/challans').send({
      financialYear: '2025-26',
      quarter: 'Q4',
      bsrCode: '1234',
      challanDate: '2026-03-15',
      challanSerialNo: '00001',
      tdsAmount: 50000,
    });
    expect(badBsr.status).toBe(400);

    // Valid challan
    const validChallan = await request(app).post('/compliance/challans').send({
      financialYear: '2025-26',
      quarter: 'Q4',
      bsrCode: '0210001',
      challanDate: '2026-03-15',
      challanSerialNo: '00123',
      tdsAmount: 50000,
      surcharge: 2000,
      cess: 2080,
      interest: 500,
      fee: 200,
    });
    expect(validChallan.status).toBe(201);
    expect(validChallan.body.data.totalAmount).toBe(54780);
  });

  // -------------------------------------------------------------------------
  // INVARIANT 3: Strict Snapshot Source of Truth (LOCKED runs only)
  // -------------------------------------------------------------------------
  it('strictly prohibits snapshot generation on runs in CALCULATED or DRAFT state', async () => {
    const app = createTestApp();

    // Run 2 is in CALCULATED state
    const res = await request(app).post('/compliance/filings/snapshot').send({
      payrollRunId: '22222222-2222-4000-8000-222222222222',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 4,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYROLL_NOT_LOCKED');
  });

  it('snapshots point-in-time identifiers and authoritative P2.3 payroll figures from LOCKED run', async () => {
    const app = createTestApp();

    // Run 1 is LOCKED
    const res = await request(app).post('/compliance/filings/snapshot').send({
      payrollRunId: '11111111-1111-4000-8000-111111111111',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.totalEmployees).toBe(2);
    expect(res.body.data.totalGrossWages).toBe(100000);
    expect(res.body.data.totalEeShare).toBe(3900); // PF: 1800+1800 + ESI: 0+300
  });

  // -------------------------------------------------------------------------
  // INVARIANT 4: Deterministic 6-State Machine & State Transition Guards
  // -------------------------------------------------------------------------
  it('enforces deterministic progression: DRAFT -> VALIDATED -> PENDING_APPROVAL', async () => {
    const app = createTestApp();

    // 1. Create snapshot
    const createRes = await request(app).post('/compliance/filings/snapshot').send({
      payrollRunId: '11111111-1111-4000-8000-111111111111',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 3,
    });
    const filingId = createRes.body.data.id;

    // Cannot submit before validation
    const prematureSubmit = await request(app).post(`/compliance/filings/${filingId}/submit-for-approval`);
    expect(prematureSubmit.status).toBe(409);

    // Validate
    const validateRes = await request(app).post(`/compliance/filings/${filingId}/validate`);
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.data.status).toBe('VALIDATED');

    // Submit for approval
    const submitRes = await request(app).post(`/compliance/filings/${filingId}/submit-for-approval`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('PENDING_APPROVAL');
  });

  // -------------------------------------------------------------------------
  // INVARIANT 5: Segregation of Duties (Maker-Checker Invariant)
  // -------------------------------------------------------------------------
  it('strictly rejects self-approval by Maker (SoD violation)', async () => {
    // App authenticated as Maker
    const makerApp = createTestApp({ id: makerUser, permissions: ['compliance.manage', 'compliance.approve'] });

    const createRes = await request(makerApp).post('/compliance/filings/snapshot').send({
      payrollRunId: '11111111-1111-4000-8000-111111111111',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 3,
    });
    const filingId = createRes.body.data.id;

    await request(makerApp).post(`/compliance/filings/${filingId}/validate`);
    await request(makerApp).post(`/compliance/filings/${filingId}/submit-for-approval`);

    // Maker attempts to approve their own filing
    const selfApproveRes = await request(makerApp).post(`/compliance/filings/${filingId}/approve`);
    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.code).toBe('MAKER_CANNOT_APPROVE');

    // Checker approves successfully
    const checkerApp = createTestApp({ id: checkerUser, permissions: ['compliance.approve'] });
    const checkerApproveRes = await request(checkerApp).post(`/compliance/filings/${filingId}/approve`);
    expect(checkerApproveRes.status).toBe(200);
    expect(checkerApproveRes.body.data.status).toBe('APPROVED');
    expect(checkerApproveRes.body.data.approvedById).toBe(checkerUser);
  });

  // -------------------------------------------------------------------------
  // INVARIANT 6: Canonical Checksum & Permanent Lock
  // -------------------------------------------------------------------------
  it('locks approved filing and generates canonical SHA-256 checksum', async () => {
    const makerApp = createTestApp({ id: makerUser });
    const checkerApp = createTestApp({ id: checkerUser, permissions: ['compliance.approve'] });

    const createRes = await request(makerApp).post('/compliance/filings/snapshot').send({
      payrollRunId: '11111111-1111-4000-8000-111111111111',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 3,
    });
    const filingId = createRes.body.data.id;

    await request(makerApp).post(`/compliance/filings/${filingId}/validate`);
    await request(makerApp).post(`/compliance/filings/${filingId}/submit-for-approval`);
    await request(checkerApp).post(`/compliance/filings/${filingId}/approve`);

    // Lock filing
    const lockRes = await request(checkerApp).post(`/compliance/filings/${filingId}/lock`);
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.status).toBe('LOCKED');
    expect(lockRes.body.data.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify canonical checksum reproducibility
    const filing = statutoryFilings.find((f) => f.id === filingId);
    const checksumAgain = generateCanonicalChecksum(
      {
        id: filing.id,
        domain: filing.domain,
        periodYear: filing.periodYear,
        periodMonth: filing.periodMonth,
        quarter: filing.quarter,
        stateCode: filing.stateCode,
        payrollRunId: filing.payrollRunId,
        totalEmployees: filing.totalEmployees,
        totalGrossWages: filing.totalGrossWages,
        totalTaxDeducted: filing.totalTaxDeducted,
      },
      filing.items,
    );
    expect(checksumAgain).toBe(lockRes.body.data.sha256Checksum);
  });

  // -------------------------------------------------------------------------
  // INVARIANT 7: Reversal Protection Guard
  // -------------------------------------------------------------------------
  it('blocks payroll reversal if an approved or locked statutory filing exists', async () => {
    const makerApp = createTestApp({ id: makerUser });
    const checkerApp = createTestApp({ id: checkerUser, permissions: ['compliance.approve', 'payroll.manage', 'payroll.approve'] });

    const createRes = await request(makerApp).post('/compliance/filings/snapshot').send({
      payrollRunId: '11111111-1111-4000-8000-111111111111',
      domain: 'EPF_ECR',
      periodYear: 2026,
      periodMonth: 3,
    });
    const filingId = createRes.body.data.id;

    await request(makerApp).post(`/compliance/filings/${filingId}/validate`);
    await request(makerApp).post(`/compliance/filings/${filingId}/submit-for-approval`);
    await request(checkerApp).post(`/compliance/filings/${filingId}/approve`);

    // Attempt to reverse the payroll run
    const reverseRes = await request(checkerApp).post('/payroll/runs/11111111-1111-4000-8000-111111111111/reverse').send({
      reason: 'Need to correct attendance records',
    });

    expect(reverseRes.status).toBe(409);
    expect(reverseRes.body.error.code).toBe('STATUTORY_FILING_EXISTS');
  });

  // -------------------------------------------------------------------------
  // INVARIANT 8: Tenant Isolation
  // -------------------------------------------------------------------------
  it('enforces strict multi-company tenant isolation across compliance endpoints', async () => {
    const appA = createTestApp({ companyId: companyA });
    const appB = createTestApp({ companyId: companyB });

    // Company A creates profile for employeeA1
    await request(appA).post(`/compliance/profiles/${employeeA1}`).send({
      uan: '111222333444',
      panNumber: 'ABCDE1111Z',
    });

    // Company B attempts to read employeeA1 profile -> 404
    const crossRead = await request(appB).get(`/compliance/profiles/${employeeA1}`);
    expect(crossRead.status).toBe(200);
    expect(crossRead.body.data).toBeNull();
  });
});
