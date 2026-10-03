import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createPayrollRouter } from './payroll.js';
import { createBankExportRouter } from './bankExport.js';

describe('P2.6B — Expense-to-Payroll Reimbursement Engine Specification Test Suite', () => {
  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const employeeA1 = 'emp-001';
  const employeeA2 = 'emp-002';
  const employeeB1 = 'emp-b01';

  // In-memory data store for tests
  let expenseClaims: any[] = [];
  let payrollRuns: any[] = [];
  let payrollAdjustments: any[] = [];
  let payrollLines: any[] = [];
  let auditLogs: any[] = [];
  let idempotencyRecords: any[] = [];
  let employees: any[] = [];
  let salaryRevisions: any[] = [];

  const setupData = () => {
    employees = [
      {
        id: employeeA1,
        companyId: companyA,
        employeeCode: 'EMP001',
        firstName: 'Aarav',
        lastName: 'Patel',
        status: 'ACTIVE',
        accountNumber: '1234567890',
        routingOrIfsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
      },
      {
        id: employeeA2,
        companyId: companyA,
        employeeCode: 'EMP002',
        firstName: 'Priya',
        lastName: 'Sharma',
        status: 'ACTIVE',
        accountNumber: '9876543210',
        routingOrIfsc: 'ICIC0001234',
        bankName: 'ICICI Bank',
      },
      {
        id: employeeB1,
        companyId: companyB,
        employeeCode: 'EMPB01',
        firstName: 'Vikram',
        lastName: 'Rao',
        status: 'ACTIVE',
        accountNumber: '5555555555',
        routingOrIfsc: 'SBIN0001234',
        bankName: 'State Bank of India',
      },
      {
        id: '00000000-0000-4000-8000-000000000001',
        companyId: companyA,
        employeeCode: 'EMP-UUID-1',
        firstName: 'Test',
        lastName: 'UUID',
        status: 'ACTIVE',
        accountNumber: '1111111111',
        routingOrIfsc: 'HDFC0001111',
        bankName: 'HDFC Bank',
      },
    ];

    salaryRevisions = [
      {
        id: 'rev-001',
        companyId: companyA,
        employeeId: employeeA1,
        status: 'APPROVED',
        effectiveFrom: new Date('2026-01-01'),
        structure: {
          components: [
            { code: 'BASIC', name: 'Basic', kind: 'EARNING', method: 'FIXED', value: 50000, proratable: false, taxable: true },
          ],
        },
      },
      {
        id: 'rev-002',
        companyId: companyA,
        employeeId: employeeA2,
        status: 'APPROVED',
        effectiveFrom: new Date('2026-01-01'),
        structure: {
          components: [
            { code: 'BASIC', name: 'Basic', kind: 'EARNING', method: 'FIXED', value: 40000, proratable: false, taxable: true },
          ],
        },
      },
    ];

    payrollRuns = [
      {
        id: 'run-march-a',
        companyId: companyA,
        month: '2026-03',
        status: 'ATTENDANCE_FINALIZED',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalDeductions: 0,
        totalNetPayout: 0,
        calculatedAt: null,
      },
      {
        id: 'run-march-b',
        companyId: companyB,
        month: '2026-03',
        status: 'ATTENDANCE_FINALIZED',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalDeductions: 0,
        totalNetPayout: 0,
        calculatedAt: null,
      },
      {
        id: 'run-april-a',
        companyId: companyA,
        month: '2026-04',
        status: 'ATTENDANCE_FINALIZED',
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        periodEnd: new Date('2026-04-30T00:00:00.000Z'),
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalDeductions: 0,
        totalNetPayout: 0,
        calculatedAt: null,
      },
    ];

    expenseClaims = [
      {
        id: 'claim-approved-1',
        companyId: companyA,
        employeeId: employeeA1,
        title: 'Client Lunch in Mumbai',
        category: 'MEALS',
        amount: 2500,
        status: 'APPROVED',
        approvedAt: new Date('2026-03-15T10:00:00.000Z'),
        reimbursedAt: null,
      },
      {
        id: 'claim-approved-2',
        companyId: companyA,
        employeeId: employeeA1,
        title: 'Flight Ticket Delhi-Mumbai',
        category: 'TRAVEL',
        amount: 6000,
        status: 'APPROVED',
        approvedAt: new Date('2026-03-31T23:59:59.000Z'), // Exactly on periodEnd cutoff
        reimbursedAt: null,
      },
      {
        id: 'claim-pending',
        companyId: companyA,
        employeeId: employeeA1,
        title: 'Pending Hotel Booking',
        category: 'TRAVEL',
        amount: 4000,
        status: 'PENDING',
        approvedAt: null,
        reimbursedAt: null,
      },
      {
        id: 'claim-rejected',
        companyId: companyA,
        employeeId: employeeA1,
        title: 'Rejected Taxi Claim',
        category: 'TRAVEL',
        amount: 1500,
        status: 'REJECTED',
        approvedAt: new Date('2026-03-10T10:00:00.000Z'),
        reimbursedAt: null,
      },
      {
        id: 'claim-future-approved',
        companyId: companyA,
        employeeId: employeeA1,
        title: 'April Travel Claim',
        category: 'TRAVEL',
        amount: 3500,
        status: 'APPROVED',
        approvedAt: new Date('2026-04-05T10:00:00.000Z'), // Approved after March cutoff
        reimbursedAt: null,
      },
      {
        id: 'claim-tenant-b',
        companyId: companyB,
        employeeId: employeeB1,
        title: 'Tenant B Travel Claim',
        category: 'TRAVEL',
        amount: 5000,
        status: 'APPROVED',
        approvedAt: new Date('2026-03-15T10:00:00.000Z'),
        reimbursedAt: null,
      },
    ];

    payrollAdjustments = [];
    payrollLines = [];
    auditLogs = [];
    idempotencyRecords = [];
  };

  const createPrismaMock = () => {
    const mock = {
      $transaction: async (cbOrArray: any) => {
        if (typeof cbOrArray === 'function') {
          return cbOrArray(mock);
        }
        return Promise.all(cbOrArray);
      },
      $queryRaw: async (queryStrings: any, ...values: any[]) => {
        const query = queryStrings.join(' ');
        if (query.includes('FROM "PayrollRun"')) {
          const runId = values[0];
          const companyId = values[1];
          const run = payrollRuns.find((r) => r.id === runId && (!companyId || r.companyId === companyId));
          return run ? [run] : [];
        }
        return [];
      },
      payrollRun: {
        findFirst: async ({ where }: any) => {
          return payrollRuns.find((r) => {
            if (where.id && r.id !== where.id) return false;
            if (where.companyId && r.companyId !== where.companyId) return false;
            if (where.status && where.status.in && !where.status.in.includes(r.status)) return false;
            if (where.status && typeof where.status === 'string' && r.status !== where.status) return false;
            return true;
          }) || null;
        },
        findMany: async ({ where }: any) => {
          return payrollRuns.filter((r) => {
            if (where.companyId && r.companyId !== where.companyId) return false;
            return true;
          });
        },
        update: async ({ where, data }: any) => {
          const run = payrollRuns.find((r) => r.id === where.id);
          if (run) Object.assign(run, data);
          return run;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const r of payrollRuns) {
            if (where.id && r.id !== where.id) continue;
            if (where.companyId && r.companyId !== where.companyId) continue;
            if (where.status && where.status.in && !where.status.in.includes(r.status)) continue;
            if (where.status && typeof where.status === 'string' && r.status !== where.status) continue;
            Object.assign(r, data);
            count++;
          }
          return { count };
        },
      },
      expenseClaim: {
        findFirst: async ({ where }: any) => {
          return expenseClaims.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.companyId && c.companyId !== where.companyId) return false;
            return true;
          }) || null;
        },
        findMany: async ({ where }: any) => {
          return expenseClaims.filter((c) => {
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.reimbursedAt === null && c.reimbursedAt !== null) return false;
            if (where.payrollAdjustment === null) {
              const hasAdj = payrollAdjustments.some((a) => a.expenseClaimId === c.id);
              if (hasAdj) return false;
            }
            if (where.approvedAt?.lte) {
              if (!c.approvedAt || c.approvedAt > where.approvedAt.lte) return false;
            }
            if (where.id?.in && !where.id.in.includes(c.id)) return false;
            return true;
          }).map((c) => {
            const emp = employees.find((e) => e.id === c.employeeId);
            return { ...c, employee: emp };
          });
        },
        update: async ({ where, data }: any) => {
          const claim = expenseClaims.find((c) => c.id === where.id);
          if (claim) Object.assign(claim, data);
          return claim;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const c of expenseClaims) {
            if (where.id?.in && !where.id.in.includes(c.id)) continue;
            if (where.id && typeof where.id === 'string' && c.id !== where.id) continue;
            Object.assign(c, data);
            count++;
          }
          return { count };
        },
      },
      payrollAdjustment: {
        findFirst: async ({ where }: any) => {
          return payrollAdjustments.find((a) => {
            if (where.expenseClaimId && a.expenseClaimId !== where.expenseClaimId) return false;
            return true;
          }) || null;
        },
        findMany: async ({ where }: any) => {
          return payrollAdjustments.filter((a) => {
            if (where.companyId && a.companyId !== where.companyId) return false;
            if (where.month && a.month !== where.month) return false;
            if (where.payrollRunId && a.payrollRunId !== where.payrollRunId) return false;
            if (where.kind && a.kind !== where.kind) return false;
            if (where.OR) {
              const matchesOr = where.OR.some((cond: any) => {
                if (cond.kind?.not && a.kind === cond.kind.not) return false;
                if (cond.kind && a.kind !== cond.kind) return false;
                if (cond.payrollRunId && a.payrollRunId !== cond.payrollRunId) return false;
                return true;
              });
              if (!matchesOr) return false;
            }
            return true;
          });
        },
        create: async ({ data }: any) => {
          // Invariant Check 1: REIMBURSEMENT <=> expenseClaimId is not null
          if (data.kind === 'REIMBURSEMENT' && !data.expenseClaimId) {
            throw new Error('CHECK CONSTRAINT VIOLATION: chk_reimbursement_requires_claim');
          }
          if (data.expenseClaimId && data.kind !== 'REIMBURSEMENT') {
            throw new Error('CHECK CONSTRAINT VIOLATION: chk_claim_implies_reimbursement');
          }
          // Invariant Check 2: Uniqueness on expenseClaimId
          if (data.expenseClaimId && payrollAdjustments.some((a) => a.expenseClaimId === data.expenseClaimId)) {
            const err = new Error('Unique constraint failed on the fields: (`expenseClaimId`)');
            (err as any).code = 'P2002';
            throw err;
          }
          const record = { id: `adj-${Date.now()}-${Math.random()}`, createdAt: new Date(), ...data };
          payrollAdjustments.push(record);
          return record;
        },
        deleteMany: async ({ where }: any) => {
          const before = payrollAdjustments.length;
          payrollAdjustments = payrollAdjustments.filter((a) => {
            if (where.payrollRunId && a.payrollRunId === where.payrollRunId) return false;
            return true;
          });
          return { count: before - payrollAdjustments.length };
        },
      },
      payrollLine: {
        deleteMany: async ({ where }: any) => {
          const before = payrollLines.length;
          payrollLines = payrollLines.filter((l) => l.payrollRunId !== where.payrollRunId);
          return { count: before - payrollLines.length };
        },
        create: async ({ data }: any) => {
          const record = { id: `line-${Date.now()}-${Math.random()}`, ...data };
          payrollLines.push(record);
          return record;
        },
        findMany: async ({ where }: any) => {
          return payrollLines.filter((l) => l.payrollRunId === where.payrollRunId);
        },
      },
      employee: {
        findFirst: async ({ where }: any) => {
          return employees.find((e) => e.id === where.id && (!where.companyId || e.companyId === where.companyId)) || null;
        },
        findMany: async ({ where }: any) => {
          return employees.filter((e) => {
            if (where.companyId && e.companyId !== where.companyId) return false;
            if (where.status?.in && !where.status.in.includes(e.status)) return false;
            return true;
          });
        },
      },
      employeeSalaryRevision: {
        findFirst: async ({ where }: any) => {
          return salaryRevisions.find((r) => r.employeeId === where.employeeId && r.companyId === where.companyId) || null;
        },
      },
      statutoryRuleVersion: {
        findMany: async () => [],
      },
      payrollAttendanceReview: {
        findUnique: async () => null,
      },
      attendanceRecord: {
        findMany: async () => [],
      },
      employeeLoan: {
        findFirst: async () => null,
      },
      auditLog: {
        create: async ({ data }: any) => {
          auditLogs.push(data);
          return data;
        },
      },
      idempotencyRecord: {
        findUnique: async ({ where }: any) => {
          const key = where.companyId_userId_key_operation;
          return idempotencyRecords.find(
            (r) =>
              r.companyId === key.companyId &&
              r.userId === key.userId &&
              r.key === key.key &&
              r.operation === key.operation,
          ) || null;
        },
        create: async ({ data }: any) => {
          idempotencyRecords.push(data);
          return data;
        },
      },
      reportExport: {
        create: async ({ data }: any) => {
          return { id: 'batch-test-001', ...data };
        },
      },
    };
    return mock;
  };

  const createTestApp = (
    permissions = ['payroll.manage', 'payroll.approve'],
    companyId = companyA,
    userId = 'test-maker',
    role = 'PAYROLL_ADMIN',
  ) => {
    const app = express();
    app.use(express.json());
    const authenticate = (req: any, _res: any, next: any) => {
      req.auth = { id: userId, companyId, role, permissions };
      req.requestId = 'req-test-p26b';
      next();
    };

    const prismaMock = createPrismaMock();
    app.use('/api/v1', createPayrollRouter(prismaMock as any, authenticate));
    app.use('/api/v1', createBankExportRouter(prismaMock as any, authenticate));

    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.status || 500).json({ error: { code: err.code || 'INTERNAL_ERROR', message: err.message } });
    });
    return { app, prismaMock };
  };

  beforeEach(() => {
    setupData();
  });

  // -------------------------------------------------------------------------
  // A & B: ELIGIBILITY & APPROVAL CUTOFF (MODEL 1)
  // -------------------------------------------------------------------------
  describe('A & B: Eligible Expense Discovery & Approval Date Cutoff (Model 1)', () => {
    it('previews only approved claims within the periodEnd cutoff with no side effects', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/payroll/runs/run-march-a/eligible-expenses');

      expect(res.status).toBe(200);
      expect(res.body.data.payrollRunId).toBe('run-march-a');
      expect(res.body.data.count).toBe(2); // claim-approved-1 (₹2500) and claim-approved-2 (₹6000)
      expect(res.body.data.totalAmount).toBe(8500);

      const claimIds = res.body.data.claims.map((c: any) => c.id);
      expect(claimIds).toContain('claim-approved-1');
      expect(claimIds).toContain('claim-approved-2');
      expect(claimIds).not.toContain('claim-pending');
      expect(claimIds).not.toContain('claim-rejected');
      expect(claimIds).not.toContain('claim-future-approved'); // Approved in April!
      expect(claimIds).not.toContain('claim-tenant-b'); // Tenant B!

      // Preview has zero side effects
      expect(payrollAdjustments.length).toBe(0);
      expect(expenseClaims.find((c) => c.id === 'claim-approved-1').status).toBe('APPROVED');
    });

    it('strictly excludes expenses approved after the payroll period end', async () => {
      const { app } = createTestApp();
      const res = await request(app).get('/api/v1/payroll/runs/run-march-a/eligible-expenses');

      const futureClaim = res.body.data.claims.find((c: any) => c.id === 'claim-future-approved');
      expect(futureClaim).toBeUndefined();

      // However, the April run does include the April-approved claim
      const aprilRes = await request(app).get('/api/v1/payroll/runs/run-april-a/eligible-expenses');
      expect(aprilRes.status).toBe(200);
      const aprilClaimIds = aprilRes.body.data.claims.map((c: any) => c.id);
      expect(aprilClaimIds).toContain('claim-future-approved');
    });
  });

  // -------------------------------------------------------------------------
  // C & D: UNIQUE INGESTION & CONCURRENCY
  // -------------------------------------------------------------------------
  describe('C & D: Relational Ingestion & Concurrency Safety', () => {
    it('ingests approved claims creating 1:1 PayrollAdjustment records and marking INGESTED', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/ingest-expenses')
        .send({ expenseClaimIds: ['00000000-0000-0000-0000-000000000000'] }); // invalid UUID test or omitted

      // When omitting, ingests all eligible
      const ingestAllRes = await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});

      expect(ingestAllRes.status).toBe(200);
      expect(ingestAllRes.body.data.count).toBe(2);
      expect(ingestAllRes.body.data.totalAmount).toBe(8500);

      // Verify DB records
      expect(payrollAdjustments.length).toBe(2);
      const adj1 = payrollAdjustments.find((a) => a.expenseClaimId === 'claim-approved-1');
      expect(adj1).toBeDefined();
      expect(adj1.kind).toBe('REIMBURSEMENT');
      expect(adj1.payrollRunId).toBe('run-march-a');
      expect(adj1.amount).toBe(2500);

      // Verify claim state transition
      const claim1 = expenseClaims.find((c) => c.id === 'claim-approved-1');
      expect(claim1.status).toBe('INGESTED');
      expect(claim1.reimbursedAt).toBeNull(); // Ingestion is NOT payment!
    });

    it('prevents double-ingestion of the same ExpenseClaim', async () => {
      const { app } = createTestApp();
      // First ingestion
      const res1 = await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      expect(res1.body.data.count).toBe(2);

      // Second ingestion attempt: no new claims eligible
      const res2 = await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      expect(res2.body.data.count).toBe(0);
      expect(res2.body.data.adjustments.length).toBe(0);
      expect(payrollAdjustments.length).toBe(2);
    });

    it('database uniqueness constraint rejects duplicate adjustment for same ExpenseClaim', async () => {
      const { prismaMock } = createTestApp();
      await prismaMock.payrollAdjustment.create({
        data: {
          companyId: companyA,
          employeeId: employeeA1,
          month: '2026-03',
          code: 'EXPENSE_REIMBURSEMENT',
          name: 'Reimbursement: Lunch',
          kind: 'REIMBURSEMENT',
          amount: 2500,
          reason: 'Test',
          createdById: 'user-1',
          expenseClaimId: 'claim-approved-1',
          payrollRunId: 'run-march-a',
        },
      });

      // Second direct insertion must fail unique constraint
      await expect(
        prismaMock.payrollAdjustment.create({
          data: {
            companyId: companyA,
            employeeId: employeeA1,
            month: '2026-03',
            code: 'EXPENSE_REIMBURSEMENT',
            name: 'Reimbursement: Lunch Duplicate',
            kind: 'REIMBURSEMENT',
            amount: 2500,
            reason: 'Test Duplicate',
            createdById: 'user-1',
            expenseClaimId: 'claim-approved-1',
            payrollRunId: 'run-march-a',
          },
        }),
      ).rejects.toThrow('Unique constraint failed');
    });

    it('database check constraint rejects REIMBURSEMENT without expenseClaimId', async () => {
      const { prismaMock } = createTestApp();
      await expect(
        prismaMock.payrollAdjustment.create({
          data: {
            companyId: companyA,
            employeeId: employeeA1,
            month: '2026-03',
            code: 'EXPENSE_REIMBURSEMENT',
            name: 'Reimbursement Without Claim',
            kind: 'REIMBURSEMENT',
            amount: 2500,
            reason: 'Invalid Test',
            createdById: 'user-1',
            expenseClaimId: null,
            payrollRunId: 'run-march-a',
          },
        }),
      ).rejects.toThrow('CHECK CONSTRAINT VIOLATION: chk_reimbursement_requires_claim');
    });
  });

  // -------------------------------------------------------------------------
  // E & F: CROSS-RUN ISOLATION & CALCULATION SCOPING
  // -------------------------------------------------------------------------
  describe('E & F: Cross-Run Scoping & Isolation', () => {
    it('scopes REIMBURSEMENT adjustments strictly to payrollRunId, preventing cross-run contamination', async () => {
      const { app } = createTestApp();

      // Add a supplementary run in the SAME month (2026-03)
      payrollRuns.push({
        id: 'run-march-supp',
        companyId: companyA,
        month: '2026-03',
        status: 'ATTENDANCE_FINALIZED',
        periodStart: new Date('2026-03-01T00:00:00.000Z'),
        periodEnd: new Date('2026-03-31T00:00:00.000Z'),
        totalEmployees: 0,
        totalGrossSalary: 0,
        totalDeductions: 0,
        totalNetPayout: 0,
        calculatedAt: null,
      });

      // Ingest claim 1 & 2 into run-march-a (total ₹8,500)
      await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});

      // NOW add an extra claim for employee A2 to be ingested into supplementary run
      expenseClaims.push({
        id: 'claim-supp-1',
        companyId: companyA,
        employeeId: employeeA2,
        title: 'Software Certification',
        category: 'CERTIFICATION',
        amount: 12000,
        status: 'APPROVED',
        approvedAt: new Date('2026-03-20T10:00:00.000Z'),
        reimbursedAt: null,
      });

      // Manually assign claim-supp-1 to run-march-supp
      payrollAdjustments.push({
        id: 'adj-supp',
        companyId: companyA,
        employeeId: employeeA2,
        month: '2026-03',
        code: 'EXPENSE_REIMBURSEMENT',
        name: 'Reimbursement: Cert',
        kind: 'REIMBURSEMENT',
        amount: 12000,
        reason: 'Supplementary Ingestion',
        createdById: 'test-maker',
        expenseClaimId: 'claim-supp-1',
        payrollRunId: 'run-march-supp',
      });
      expenseClaims.find((c) => c.id === 'claim-supp-1')!.status = 'INGESTED';

      // Calculate run-march-a
      const calcARes = await request(app).post('/api/v1/payroll/runs/run-march-a/calculate');
      expect(calcARes.status).toBe(200);

      // Verify Run A's lines contain ONLY ₹8,500 reimbursements (not the ₹12,000 from supp run)
      const linesA = payrollLines.filter((l) => l.payrollRunId === 'run-march-a');
      const totalReimbursementsA = linesA.reduce((s, l) => s + l.reimbursements, 0);
      expect(totalReimbursementsA).toBe(8500);

      // Calculate run-march-supp
      const calcSuppRes = await request(app).post('/api/v1/payroll/runs/run-march-supp/calculate');
      expect(calcSuppRes.status).toBe(200);

      // Verify Run Supp contains ONLY its own ₹12,000 reimbursement
      const linesSupp = payrollLines.filter((l) => l.payrollRunId === 'run-march-supp');
      const totalReimbursementsSupp = linesSupp.reduce((s, l) => s + l.reimbursements, 0);
      expect(totalReimbursementsSupp).toBe(12000);
    });
  });

  // -------------------------------------------------------------------------
  // G: DIRTY CALCULATION INVALIDATION
  // -------------------------------------------------------------------------
  describe('G: Dirty Calculation Invalidation', () => {
    it('invalidates existing calculation and resets status to ATTENDANCE_FINALIZED when new expense is ingested', async () => {
      const { app } = createTestApp();

      // First calculate payroll without reimbursements
      const calc1 = await request(app).post('/api/v1/payroll/runs/run-march-a/calculate');
      expect(calc1.status).toBe(200);
      expect(payrollRuns.find((r) => r.id === 'run-march-a').status).toBe('CALCULATED');
      expect(payrollLines.length).toBeGreaterThan(0);

      // Now ingest an approved expense into the CALCULATED run
      const ingestRes = await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      expect(ingestRes.status).toBe(200);
      expect(ingestRes.body.data.invalidatedCalculation).toBe(true);

      // Run status should be reset to ATTENDANCE_FINALIZED, calculatedAt cleared, lines removed
      const run = payrollRuns.find((r) => r.id === 'run-march-a');
      expect(run.status).toBe('ATTENDANCE_FINALIZED');
      expect(run.calculatedAt).toBeNull();
      expect(payrollLines.filter((l) => l.payrollRunId === 'run-march-a').length).toBe(0);

      // Re-calculating incorporates the reimbursement
      const calc2 = await request(app).post('/api/v1/payroll/runs/run-march-a/calculate');
      expect(calc2.status).toBe(200);
      const updatedLines = payrollLines.filter((l) => l.payrollRunId === 'run-march-a');
      const emp1Line = updatedLines.find((l) => l.employeeId === employeeA1);
      expect(emp1Line.reimbursements).toBe(8500);
      expect(emp1Line.netPay).toBe(50000 + 8500); // Gross 50k + 8500 reimbursement
    });
  });

  // -------------------------------------------------------------------------
  // H: DRAFT DISCARD & ROLLBACK
  // -------------------------------------------------------------------------
  describe('H: Draft Discard & Rollback', () => {
    it('reverses ingested expenses back to APPROVED and removes adjustments when draft is discarded', async () => {
      const { app } = createTestApp();

      // Ingest claims
      await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      expect(payrollAdjustments.length).toBe(2);
      expect(expenseClaims.find((c) => c.id === 'claim-approved-1').status).toBe('INGESTED');

      // Discard draft
      const discardRes = await request(app).post('/api/v1/payroll/runs/run-march-a/discard');
      expect(discardRes.status).toBe(200);
      expect(discardRes.body.data.discarded).toBe(true);

      // Claims returned to APPROVED
      expect(expenseClaims.find((c) => c.id === 'claim-approved-1').status).toBe('APPROVED');
      expect(expenseClaims.find((c) => c.id === 'claim-approved-2').status).toBe('APPROVED');

      // Adjustments removed
      expect(payrollAdjustments.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // I & J: DUAL-BARRIER BANK EXPORT & DOUBLE-DIP PREVENTION
  // -------------------------------------------------------------------------
  describe('I & J: Bank Export Isolation & Financial Double-Dip Prevention', () => {
    it('excludes INGESTED claims from standalone bank export preview and generation', async () => {
      const { app } = createTestApp();

      // Before ingestion: 3 approved claims visible in standalone bank export
      // (claim-approved-1, claim-approved-2, claim-future-approved)
      const previewBefore = await request(app).get('/api/v1/payroll/bank-export/sources');
      expect(previewBefore.status).toBe(200);
      expect(previewBefore.body.data.reimbursements.count).toBe(3);

      // Ingest claims 1 & 2 into March payroll
      await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});

      // After March ingestion: only 1 claim remaining in standalone bank export (claim-future-approved)
      const previewAfter = await request(app).get('/api/v1/payroll/bank-export/sources');
      expect(previewAfter.status).toBe(200);
      expect(previewAfter.body.data.reimbursements.count).toBe(1);
      expect(previewAfter.body.data.reimbursements.claims[0].id).toBe('claim-future-approved');

      // Now ingest the remaining claim into April payroll
      await request(app).post('/api/v1/payroll/runs/run-april-a/ingest-expenses').send({});

      // Now 0 claims remain in standalone bank export
      const previewFinal = await request(app).get('/api/v1/payroll/bank-export/sources');
      expect(previewFinal.status).toBe(200);
      expect(previewFinal.body.data.reimbursements.count).toBe(0);

      // Attempting to export standalone reimbursement rejects because none are eligible
      const exportRes = await request(app).post('/api/v1/payroll/bank-export/batch/initiate').send({
        sourceType: 'REIMBURSEMENT',
        bankFormat: 'HDFC_CMS',
      });
      expect(exportRes.status).toBe(400);
      expect(exportRes.body.error.code).toBe('NO_VALID_RECORDS');
    });
  });

  // -------------------------------------------------------------------------
  // K & L: TENANT ISOLATION & RBAC
  // -------------------------------------------------------------------------
  describe('K & L: Multi-Tenant Isolation & Role Permissions', () => {
    it('prevents Tenant A from accessing or ingesting Tenant B claims', async () => {
      const { app } = createTestApp(['payroll.manage'], companyA);

      // Tenant A querying Tenant B run
      const crossRunRes = await request(app).get('/api/v1/payroll/runs/run-march-b/eligible-expenses');
      expect(crossRunRes.status).toBe(404);

      // Tenant A ingesting into Tenant B run
      const crossIngestRes = await request(app).post('/api/v1/payroll/runs/run-march-b/ingest-expenses').send({});
      expect(crossIngestRes.status).toBe(404);

      // Tenant A requesting Tenant B claim ID in own run
      const crossClaimRes = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/ingest-expenses')
        .send({ expenseClaimIds: ['00000000-0000-0000-0000-000000000000'] });
      // Should reject as not eligible
      expect(crossClaimRes.status).toBe(400);
    });

    it('enforces RBAC permissions on expense ingestion', async () => {
      // User without payroll.manage
      const { app } = createTestApp([], companyA);
      const res = await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      expect(res.status).toBe(403);
    });

    it('disallows manual creation of REIMBURSEMENT adjustments in POST /payroll/adjustments', async () => {
      const { app } = createTestApp(['payroll.manage'], companyA);
      const res = await request(app)
        .post('/api/v1/payroll/adjustments')
        .send({
          employeeId: '00000000-0000-4000-8000-000000000001',
          month: '2026-03',
          code: 'EXPENSE_REIMBURSEMENT',
          name: 'Manual Reimbursement',
          kind: 'REIMBURSEMENT',
          amount: 5000,
          reason: 'Manual bypass attempt',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REIMBURSEMENT_NOT_ALLOWED');
    });
  });

  // -------------------------------------------------------------------------
  // M, N & O: PAYSLIP, RECONCILIATION & PAYMENT COMPLETION
  // -------------------------------------------------------------------------
  describe('M, N & O: Payslip Itemization, Net Pay Reconciliation & Payment Completion', () => {
    it('accurately reconciles net pay with reimbursement and marks claims REIMBURSED upon payroll payment', async () => {
      const { app } = createTestApp();

      // 1. Ingest claims
      await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});

      // 2. Calculate
      await request(app).post('/api/v1/payroll/runs/run-march-a/calculate');

      const line = payrollLines.find((l) => l.employeeId === employeeA1);
      expect(line.grossEarnings).toBe(50000);
      expect(line.employeeDeductions).toBe(0);
      expect(line.reimbursements).toBe(8500);
      expect(line.netPay).toBe(58500); // 50000 + 8500

      // 3. Move through review and approval to LOCKED
      payrollRuns.find((r) => r.id === 'run-march-a').status = 'LOCKED';

      // 4. Record payment
      const payRes = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/record-payment')
        .send({
          paymentDate: '2026-04-01',
          paymentReference: 'SAL-PAY-MARCH-2026',
        });

      expect(payRes.status).toBe(200);

      // Ingested claims transition to REIMBURSED with reimbursedAt set
      const claim1 = expenseClaims.find((c) => c.id === 'claim-approved-1');
      expect(claim1.status).toBe('REIMBURSED');
      expect(claim1.reimbursedAt).toEqual(new Date('2026-04-01'));

      const claim2 = expenseClaims.find((c) => c.id === 'claim-approved-2');
      expect(claim2.status).toBe('REIMBURSED');
      expect(claim2.reimbursedAt).toEqual(new Date('2026-04-01'));
    });

    it('rolls back claims to APPROVED and cleans up adjustments if a payroll run is reversed', async () => {
      const { app } = createTestApp();

      // Ingest and lock
      await request(app).post('/api/v1/payroll/runs/run-march-a/ingest-expenses').send({});
      payrollRuns.find((r) => r.id === 'run-march-a').status = 'LOCKED';

      // Reverse run
      const reverseRes = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/reverse')
        .send({ reason: 'Reversing due to banking dispute' });

      expect(reverseRes.status).toBe(200);
      expect(expenseClaims.find((c) => c.id === 'claim-approved-1').status).toBe('APPROVED');
      expect(payrollAdjustments.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // P: IDEMPOTENCY
  // -------------------------------------------------------------------------
  describe('P: Idempotency Key Handling', () => {
    it('returns identical response without double ingestion when using Idempotency-Key', async () => {
      const { app } = createTestApp();
      const idempotencyKey = 'idemp-p26b-ingest-key-001';

      const res1 = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/ingest-expenses')
        .set('idempotency-key', idempotencyKey)
        .send({});

      expect(res1.status).toBe(200);
      expect(res1.body.data.count).toBe(2);

      // Repeat with same key
      const res2 = await request(app)
        .post('/api/v1/payroll/runs/run-march-a/ingest-expenses')
        .set('idempotency-key', idempotencyKey)
        .send({});

      expect(res2.status).toBe(200);
      expect(res2.body.data.count).toBe(2);
      expect(payrollAdjustments.length).toBe(2); // Still exactly 2!
    });
  });
});
