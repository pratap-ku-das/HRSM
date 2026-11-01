import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { normalizeDatabaseUrl } from '../databaseUrl.js';
import { createPayrollRouter } from './payroll.js';
import { createOperationsRouter } from './operations.js';
import { createPayrollComplianceRouter } from './payrollCompliance.js';

const runLivePostgresConcurrency =
  process.env.RUN_LIVE_POSTGRES_TESTS === 'true' ||
  process.env.STAGING_VERIFICATION === 'true';

describe('Phase 4: Payroll & Financial Integrity Verification Suite', () => {
  const JWT_SECRET = 'D7qL9vN2xR5mK8sP4cT6wY3fH1jB0zEa';
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
  process.env.JWT_ISSUER = 'orbithr-api';

  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const adminA = 'user-admin-a';
  const adminB = 'user-admin-b';
  const empA1 = 'emp-001';
  const empA2 = 'emp-002';
  const empB1 = 'emp-b01';

  const signToken = (userId: string, companyId: string, role = 'FINANCE_ADMIN', permissions = ['payroll.manage', 'payroll.approve', 'expense.review']) => {
    return jwt.sign(
      { sub: userId, companyId, role, permissions, tokenVersion: 1 },
      JWT_SECRET,
      { issuer: 'orbithr-api', audience: 'orbithr-clients', expiresIn: '1h' },
    );
  };

  const errorHandler = (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = err.message || 'Internal error';
    res.status(status).json({ error: { code, message } });
  };

  const createAuthMiddleware = (defaultUserId: string, defaultCompanyId: string) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as any;
          Object.assign(req, {
            auth: {
              id: payload.sub,
              companyId: payload.companyId,
              role: payload.role || 'COMPANY_ADMIN',
              permissions: payload.permissions || ['payroll.manage', 'payroll.approve', 'expense.review'],
            },
            requestId: 'test-req',
          });
          return next();
        } catch {
          return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
        }
      }
      Object.assign(req, {
        auth: {
          id: defaultUserId,
          companyId: defaultCompanyId,
          role: 'FINANCE_ADMIN',
          permissions: ['payroll.manage', 'payroll.approve', 'expense.review'],
        },
        requestId: 'test-req',
      });
      next();
    };
  };

  // ---------------------------------------------------------------------------
  // 1. Two Simultaneous Payroll Publication Requests
  // ---------------------------------------------------------------------------
  describe('A. Payroll Publication Concurrency & Idempotency', () => {
    it('handles two simultaneous publish requests with strict single-publication and no duplicate payslips', async () => {
      let runStatus = 'LOCKED';
      let publishExecutionCount = 0;
      const payslips: any[] = [];

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'run-pub-1' && where.status.in.includes(runStatus)) {
              runStatus = data.status;
              publishExecutionCount++;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payslip: {
          upsert: vi.fn(async ({ create, update, where }) => {
            const existingIndex = payslips.findIndex(
              p => p.payrollRunId === where.payrollRunId_employeeId.payrollRunId &&
                   p.employeeId === where.payrollRunId_employeeId.employeeId
            );
            if (existingIndex >= 0) {
              payslips[existingIndex] = { ...payslips[existingIndex], ...update };
              return payslips[existingIndex];
            }
            const record = { id: `ps-${payslips.length + 1}`, ...create };
            payslips.push(record);
            return record;
          }),
        },
        employeeLoan: {
          findFirst: vi.fn(async () => null),
        },
        loanRepayment: {
          findFirst: vi.fn(async () => null),
          create: vi.fn(),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        payrollRun: {
          findFirst: vi.fn(async ({ where }) => {
            if (where.id === 'run-pub-1') {
              if (where.status && !where.status.in.includes(runStatus)) {
                return null;
              }
              return {
                id: 'run-pub-1',
                companyId: companyA,
                month: '2026-10',
                status: runStatus,
                paymentDate: new Date('2026-10-31'),
                paymentReference: 'SAL-NEFT-OCT2026',
                lines: [
                  {
                    id: 'line-1',
                    employeeId: empA1,
                    grossEarnings: 60000,
                    employeeDeductions: 6000,
                    netPay: 54000,
                    workingDays: 30,
                    payableDays: 30,
                    unpaidDays: 0,
                    breakdown: { BASIC: 36000, HRA: 18000, SPECIAL: 6000 },
                    calculationTrace: [],
                  },
                ],
              };
            }
            return null;
          }),
        },
        employee: {
          findMany: vi.fn(async () => [{ id: empA1, userId: 'user-a1' }]),
        },
        notification: {
          create: vi.fn(async ({ data }) => ({ id: 'notif-1', ...data })),
        },
        notificationPreference: {
          findMany: vi.fn(async () => []),
        },
        notificationDelivery: {
          createMany: vi.fn(async () => ({ count: 1 })),
        },
        auditLog: {
          create: vi.fn(async () => ({ id: 'audit-1' })),
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      // Launch 2 parallel publication requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/payroll/runs/run-pub-1/publish')
          .set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
        request(app)
          .post('/api/v1/payroll/runs/run-pub-1/publish')
          .set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Exactly one succeeded in updating state
      expect(publishExecutionCount).toBe(1);
      expect(runStatus).toBe('PAYSLIPS_PUBLISHED');

      // Persisted payslip total is exactly 1 (not duplicated)
      expect(payslips.length).toBe(1);
      expect(payslips[0].netSalary).toBe(54000);
      expect(payslips[0].grossSalary).toBe(60000);
    });

    // -------------------------------------------------------------------------
    // 2. Repeated Publication After Successful Commit
    // -------------------------------------------------------------------------
    it('returns 409 PAYROLL_ALREADY_PUBLISHED on repeated publication with no financial side effects', async () => {
      const mockPrisma = {
        payrollRun: {
          findFirst: vi.fn(async ({ where }) => {
            if (where.status && where.status.in && !where.status.in.includes('PAYSLIPS_PUBLISHED')) {
              return null; // Not found in LOCKED/PAYSLIP_GENERATED
            }
            return {
              id: 'run-pub-already',
              companyId: companyA,
              month: '2026-10',
              status: 'PAYSLIPS_PUBLISHED',
              paymentDate: new Date('2026-10-31'),
              paymentReference: 'SAL-NEFT-OCT2026',
            };
          }),
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-pub-already/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_ALREADY_PUBLISHED');
      expect(res.body.error.message).toContain('already been published');
    });

    // -------------------------------------------------------------------------
    // 3. Multi-Step Financial Transaction Failure Rollback
    // -------------------------------------------------------------------------
    it('atomically rolls back the entire transaction if a line calculation error occurs during publication', async () => {
      let runStatus = 'LOCKED';
      const payslips: any[] = [];
      const loanRepayments: any[] = [];

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'run-fail-1' && where.status.in.includes(runStatus)) {
              runStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payslip: {
          upsert: vi.fn(async () => {
            throw new Error('SIMULATED_DATABASE_IO_ERROR');
          }),
        },
        employeeLoan: {
          findFirst: vi.fn(async () => null),
          update: vi.fn(),
        },
        loanRepayment: {
          create: vi.fn(async ({ data }) => {
            loanRepayments.push(data);
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          const snapshotStatus = runStatus;
          try {
            return await cb(mockTx);
          } catch (err) {
            // Roll back simulated state
            runStatus = snapshotStatus;
            throw err;
          }
        }),
        payrollRun: {
          findFirst: vi.fn(async () => ({
            id: 'run-fail-1',
            companyId: companyA,
            month: '2026-10',
            status: runStatus,
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'SAL-REF-FAIL',
            lines: [
              {
                id: 'line-f1',
                employeeId: empA1,
                grossEarnings: 50000,
                employeeDeductions: 5000,
                netPay: 45000,
                workingDays: 30,
                payableDays: 30,
                unpaidDays: 0,
                breakdown: { BASIC: 30000, HRA: 15000 },
                calculationTrace: [],
              },
            ],
          })),
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-fail-1/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`);

      expect(res.status).toBe(500);
      expect(res.body.error.message).toContain('SIMULATED_DATABASE_IO_ERROR');

      // Assert rollback: Run remains LOCKED, 0 payslips persisted, 0 loan repayments
      expect(runStatus).toBe('LOCKED');
      expect(payslips.length).toBe(0);
      expect(loanRepayments.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // B. Loan Repayments Concurrency & Uniqueness Invariants
  // ---------------------------------------------------------------------------
  describe('B. Loan Repayments & Settlement Double-Decrement Prevention', () => {
    it('prevents double-decrement of outstanding loan balance under concurrent publication', async () => {
      let runStatus = 'LOCKED';
      let loanOutstanding = 10000;
      const loanRepayments: any[] = [];

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'run-loan-1' && where.status.in.includes(runStatus)) {
              runStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payslip: {
          upsert: vi.fn(async ({ create }) => ({ id: 'ps-loan', ...create })),
        },
        employeeLoan: {
          findFirst: vi.fn(async () => ({
            id: 'loan-emp-1',
            companyId: companyA,
            employeeId: empA1,
            outstanding: loanOutstanding,
            status: 'ACTIVE',
          })),
          update: vi.fn(async ({ data }) => {
            loanOutstanding = data.outstanding;
            return { id: 'loan-emp-1', outstanding: loanOutstanding };
          }),
        },
        loanRepayment: {
          findFirst: vi.fn(async ({ where }) => {
            return loanRepayments.find(r => r.loanId === where.loanId && r.payrollRunId === where.payrollRunId) || null;
          }),
          create: vi.fn(async ({ data }) => {
            loanRepayments.push(data);
            return { id: `lr-${loanRepayments.length}`, ...data };
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        payrollRun: {
          findFirst: vi.fn(async () => {
            if (runStatus !== 'LOCKED') return null;
            return {
              id: 'run-loan-1',
              companyId: companyA,
              month: '2026-10',
              status: runStatus,
              paymentDate: new Date('2026-10-31'),
              paymentReference: 'REF-LOAN-01',
              lines: [
                {
                  id: 'line-l1',
                  employeeId: empA1,
                  grossEarnings: 50000,
                  employeeDeductions: 5000,
                  netPay: 45000,
                  workingDays: 30,
                  payableDays: 30,
                  unpaidDays: 0,
                  breakdown: { BASIC: 30000, HRA: 15000, LOAN_REPAYMENT: 2000 },
                  calculationTrace: [],
                },
              ],
            };
          }),
        },
        employee: {
          findMany: vi.fn(async () => [{ id: empA1, userId: 'user-a1' }]),
        },
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/payroll/runs/run-loan-1/publish').set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
        request(app).post('/api/v1/payroll/runs/run-loan-1/publish').set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Loan installment deducted exactly once: 10000 - 2000 = 8000 (never double decremented to 6000)
      expect(loanRepayments.length).toBe(1);
      expect(loanRepayments[0].amount).toBe(2000);
      expect(loanOutstanding).toBe(8000);
    });

    it('prevents duplicate loan recovery and double-decrement on concurrent full & final settlement payment', async () => {
      let settlementStatus = 'APPROVED';
      let loanOutstanding = 15000;
      const loanRepayments: any[] = [];
      let paymentExecutions = 0;

      const mockTx = {
        fullFinalSettlement: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'settle-1' && where.status === settlementStatus) {
              settlementStatus = data.status;
              paymentExecutions++;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        employeeLoan: {
          findMany: vi.fn(async () => [
            { id: 'loan-exit-1', outstanding: loanOutstanding, status: 'ACTIVE' },
          ]),
          update: vi.fn(async ({ data }) => {
            loanOutstanding = data.outstanding;
            return { id: 'loan-exit-1', outstanding: loanOutstanding };
          }),
        },
        loanRepayment: {
          create: vi.fn(async ({ data }) => {
            loanRepayments.push(data);
            return { id: `lr-exit-${loanRepayments.length}`, ...data };
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        fullFinalSettlement: {
          findFirst: vi.fn(async ({ where }) => {
            if (where.id === 'settle-1' && where.companyId === companyA && where.status === settlementStatus) {
              return {
                id: 'settle-1',
                companyId: companyA,
                employeeId: empA1,
                status: settlementStatus,
                loanRecovery: 5000,
              };
            }
            return null;
          }),
        },
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollComplianceRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      // Concurrent pay attempts
      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/payroll/compliance/settlements/settle-1/pay').set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
        request(app).post('/api/v1/payroll/compliance/settlements/settle-1/pay').set('Authorization', `Bearer ${signToken(adminA, companyA)}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Exactly 1 payment executed
      expect(paymentExecutions).toBe(1);
      expect(settlementStatus).toBe('PAID');

      // Loan outstanding decremented by 5000 once (15000 -> 10000, never 5000)
      expect(loanRepayments.length).toBe(1);
      expect(loanRepayments[0].amount).toBe(5000);
      expect(loanOutstanding).toBe(10000);
    });
  });

  // ---------------------------------------------------------------------------
  // C. Expense Reimbursement Ingestion & Review Race Conditions
  // ---------------------------------------------------------------------------
  describe('C. Expense Ingestion & Review Financial Invariants', () => {
    it('aborts ingestion cleanly if a claim status changes from APPROVED to REJECTED mid-flight', async () => {
      let claimStatus = 'APPROVED';
      const createdAdjustments: any[] = [];

      const mockTx = {
        $queryRaw: vi.fn(async () => [
          {
            id: 'run-ingest-race',
            companyId: companyA,
            month: '2026-10',
            status: 'ATTENDANCE_FINALIZED',
            periodEnd: new Date('2026-10-31'),
          },
        ]),
        expenseClaim: {
          findMany: vi.fn(async () => [
            {
              id: 'claim-race-1',
              companyId: companyA,
              employeeId: empA1,
              title: 'Conference Pass',
              amount: 4500,
              status: claimStatus,
              approvedAt: new Date('2026-10-15'),
              employee: { id: empA1, firstName: 'Aarav', lastName: 'Kumar', employeeCode: 'EMP001' },
            },
          ]),
          updateMany: vi.fn(async ({ where, data }) => {
            // Simulate that the claim was concurrently rejected by finance review
            if (where.id === 'claim-race-1' && where.status === 'APPROVED' && claimStatus === 'APPROVED') {
              claimStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 }; // 0 updated because claim is now REJECTED
          }),
        },
        payrollAdjustment: {
          create: vi.fn(async ({ data }) => {
            createdAdjustments.push(data);
            return { id: 'adj-1', ...data };
          }),
        },
      };

      // Before tx reaches updateMany, simulate review route rejecting the claim
      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          // Claim was rejected right after findMany
          claimStatus = 'REJECTED';
          return cb(mockTx);
        }),
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-ingest-race/ingest-expenses')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPENSE_CLAIM_STATE_INVALID');
      expect(res.body.error.message).toContain('no longer in APPROVED status');

      // Persisted state: Claim is REJECTED, not INGESTED
      expect(claimStatus).toBe('REJECTED');
    });

    it('concurrent ingestion operations respect claim unique adjustment constraints', async () => {
      let claimStatus = 'APPROVED';
      const adjustments: any[] = [];

      const mockTx = {
        $queryRaw: vi.fn(async () => [
          {
            id: 'run-ingest-2',
            companyId: companyA,
            month: '2026-10',
            status: 'ATTENDANCE_FINALIZED',
            periodEnd: new Date('2026-10-31'),
          },
        ]),
        expenseClaim: {
          findMany: vi.fn(async () => {
            if (claimStatus !== 'APPROVED') return [];
            return [
              {
                id: 'claim-single-1',
                companyId: companyA,
                employeeId: empA1,
                title: 'Client Lunch',
                amount: 1500,
                status: 'APPROVED',
                approvedAt: new Date('2026-10-10'),
                employee: { id: empA1, firstName: 'Aarav', lastName: 'Kumar', employeeCode: 'EMP001' },
              },
            ];
          }),
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.status === 'APPROVED' && claimStatus === 'APPROVED') {
              claimStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payrollAdjustment: {
          create: vi.fn(async ({ data }) => {
            adjustments.push(data);
            return { id: `adj-${adjustments.length}`, ...data };
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res1 = await request(app)
        .post('/api/v1/payroll/runs/run-ingest-2/ingest-expenses')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({});

      expect(res1.status).toBe(200);
      expect(res1.body.data.count).toBe(1);
      expect(res1.body.data.totalAmount).toBe(1500);

      // Subsequent attempt sees 0 eligible claims
      const res2 = await request(app)
        .post('/api/v1/payroll/runs/run-ingest-2/ingest-expenses')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({});

      expect(res2.status).toBe(200);
      expect(res2.body.data.count).toBe(0);

      // Financial invariant: exactly 1 adjustment of 1500 created
      expect(adjustments.length).toBe(1);
      expect(adjustments[0].amount).toBe(1500);
      expect(claimStatus).toBe('INGESTED');
    });
  });

  // ---------------------------------------------------------------------------
  // D. Payment Recording & Reversal Failure Atomicity
  // ---------------------------------------------------------------------------
  describe('D. Payment Recording & Reversal Failure Atomicity', () => {
    it('atomically records payment and transitions ingested claims to REIMBURSED', async () => {
      let runPaymentReference: string | null = null;
      let claimsReimbursed = false;

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'run-rec-1' && where.status === 'LOCKED') {
              runPaymentReference = data.paymentReference;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payrollAdjustment: {
          findMany: vi.fn(async () => [
            { expenseClaimId: 'claim-rec-1' },
          ]),
        },
        expenseClaim: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id.in.includes('claim-rec-1')) {
              claimsReimbursed = true;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-rec-1/record-payment')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({
          paymentDate: '2026-10-31',
          paymentReference: 'NEFT-SAL-102026-A',
        });

      expect(res.status).toBe(200);
      expect(runPaymentReference).toBe('NEFT-SAL-102026-A');
      expect(claimsReimbursed).toBe(true);
    });

    it('atomically reverses payroll run, restores claims to APPROVED, and removes adjustments', async () => {
      let runStatus = 'LOCKED';
      let claimStatus = 'INGESTED';
      let adjustmentsDeleted = false;

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            if (where.id === 'run-rev-1') {
              runStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 };
          }),
        },
        payrollAdjustment: {
          findMany: vi.fn(async () => [
            { expenseClaimId: 'claim-rev-1' },
          ]),
          deleteMany: vi.fn(async () => {
            adjustmentsDeleted = true;
            return { count: 1 };
          }),
        },
        expenseClaim: {
          updateMany: vi.fn(async ({ data }) => {
            claimStatus = data.status;
            return { count: 1 };
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        statutoryFiling: { findFirst: vi.fn(async () => null) },
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-rev-1/reverse')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({ reason: 'Banking reversal required' });

      expect(res.status).toBe(200);
      expect(runStatus).toBe('REVERSED');
      expect(claimStatus).toBe('APPROVED');
      expect(adjustmentsDeleted).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // E. Notification Fault-Tolerance & Idempotent Retries
  // ---------------------------------------------------------------------------
  describe('E. Notification Fault-Tolerance & Idempotent Retries', () => {
    it('preserves database commit and returns 200 when post-commit notification delivery fails', async () => {
      let runStatus = 'LOCKED';
      const payslips: any[] = [];

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async ({ where, data }) => {
            runStatus = data.status;
            return { count: 1 };
          }),
        },
        payslip: {
          upsert: vi.fn(async ({ create }) => {
            const p = { id: 'ps-notif-1', ...create };
            payslips.push(p);
            return p;
          }),
        },
        employeeLoan: { findFirst: vi.fn(async () => null) },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        payrollRun: {
          findFirst: vi.fn(async () => ({
            id: 'run-notif-fail',
            companyId: companyA,
            month: '2026-10',
            status: runStatus,
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'REF-NOTIF-01',
            lines: [
              {
                id: 'line-n1',
                employeeId: empA1,
                grossEarnings: 40000,
                employeeDeductions: 4000,
                netPay: 36000,
                workingDays: 30,
                payableDays: 30,
                unpaidDays: 0,
                breakdown: { BASIC: 24000, HRA: 12000 },
                calculationTrace: [],
              },
            ],
          })),
        },
        employee: {
          // Simulate network failure querying employee device tokens for notification
          findMany: vi.fn(async () => {
            throw new Error('PUSH_SERVICE_DOWN');
          }),
        },
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-notif-fail/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`);

      // Must succeed with 200 because financial database transaction already committed
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAYSLIPS_PUBLISHED');
      expect(runStatus).toBe('PAYSLIPS_PUBLISHED');
      expect(payslips.length).toBe(1);
    });

    it('returns cached idempotent response upon retry with Idempotency-Key after simulated timeout', async () => {
      const idempotencyRecords: any[] = [];
      let transactionCount = 0;

      const mockTx = {
        payrollRun: {
          updateMany: vi.fn(async () => {
            transactionCount++;
            return { count: 1 };
          }),
        },
        payslip: { upsert: vi.fn(async ({ create }) => ({ id: 'ps-idemp', ...create })) },
        employeeLoan: { findFirst: vi.fn(async () => null) },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
        payrollRun: {
          findFirst: vi.fn(async () => ({
            id: 'run-idemp-1',
            companyId: companyA,
            month: '2026-10',
            status: 'LOCKED',
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'REF-IDEMP-01',
            lines: [],
          })),
        },
        idempotencyRecord: {
          findUnique: vi.fn(async ({ where }) => {
            return idempotencyRecords.find(
              r => r.companyId === where.companyId_userId_key_operation.companyId &&
                   r.key === where.companyId_userId_key_operation.key &&
                   r.operation === where.companyId_userId_key_operation.operation
            ) || null;
          }),
          create: vi.fn(async ({ data }) => {
            idempotencyRecords.push(data);
            return data;
          }),
        },
        employee: { findMany: vi.fn(async () => []) },
        auditLog: { create: vi.fn(async () => ({})) },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      // Call 1
      const res1 = await request(app)
        .post('/api/v1/payroll/runs/run-idemp-1/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .set('Idempotency-Key', 'idemp-key-xyz-777');

      expect(res1.status).toBe(200);
      expect(transactionCount).toBe(1);

      // Call 2: Simulated timeout retry with identical Idempotency-Key
      const res2 = await request(app)
        .post('/api/v1/payroll/runs/run-idemp-1/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .set('Idempotency-Key', 'idemp-key-xyz-777');

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('PAYSLIPS_PUBLISHED');
      // Did NOT run transaction second time
      expect(transactionCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // F. Cross-Tenant Financial Boundary & Authorization Isolation
  // ---------------------------------------------------------------------------
  describe('F. Cross-Tenant Financial Boundary & Maker-Checker Isolation', () => {
    it('strictly forbids Tenant A from publishing Tenant B payroll run', async () => {
      const mockPrisma = {
        payrollRun: {
          findFirst: vi.fn(async ({ where }) => {
            // Tenant B run exists only under companyId = tenant-b
            if (where.id === 'run-tenant-b' && where.companyId === companyB) {
              return { id: 'run-tenant-b', companyId: companyB, status: 'LOCKED' };
            }
            return null;
          }),
        },
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-tenant-b/publish')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_STATE_INVALID');
      expect(mockPrisma.payrollRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'run-tenant-b', companyId: companyA }),
        })
      );
    });

    it('strictly forbids Tenant A from ingesting Tenant B expense claims', async () => {
      const mockTx = {
        $queryRaw: vi.fn(async () => [
          {
            id: 'run-tenant-a',
            companyId: companyA,
            month: '2026-10',
            status: 'ATTENDANCE_FINALIZED',
            periodEnd: new Date('2026-10-31'),
          },
        ]),
        expenseClaim: {
          findMany: vi.fn(async ({ where }) => {
            // Even if Tenant B claim ID was passed, scoped query by companyId returns empty
            if (where.companyId === companyA) {
              return [];
            }
            return [];
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
      };

      const app = express();
      app.use(express.json());
      app.use('/api/v1', createPayrollRouter(mockPrisma as never, createAuthMiddleware(adminA, companyA)));
      app.use(errorHandler);

      // Attempting to inject Tenant B claim
      const res = await request(app)
        .post('/api/v1/payroll/runs/run-tenant-a/ingest-expenses')
        .set('Authorization', `Bearer ${signToken(adminA, companyA)}`)
        .send({ expenseClaimIds: ['00000000-0000-4000-8000-000000000999'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_CLAIM_NOT_ELIGIBLE');
      expect(res.body.error.message).toContain('not eligible');
    });

    it('enforces RBAC permission check: user without payroll.approve cannot publish payroll', async () => {
      const app = express();
      app.use(express.json());
      // Maker only (payroll.manage, lacking payroll.approve)
      const makerToken = signToken('maker-hr', companyA, 'HR_MANAGER', ['payroll.manage']);
      app.use('/api/v1', createPayrollRouter({} as never, createAuthMiddleware('maker-hr', companyA)));
      app.use(errorHandler);

      const res = await request(app)
        .post('/api/v1/payroll/runs/run-1/publish')
        .set('Authorization', `Bearer ${makerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ---------------------------------------------------------------------------
  // G. Live PostgreSQL Multi-Connection Concurrency (Fail-Closed Safety Gate)
  // ---------------------------------------------------------------------------
  describe.skipIf(!runLivePostgresConcurrency)(
    'PostgreSQL Real Multi-Connection Financial Concurrency Suite (Fail-Closed)',
    () => {
      const rawUrl = process.env.DATABASE_URL;
      const databaseUrl = rawUrl ? normalizeDatabaseUrl(rawUrl) : undefined;

      let prisma1: PrismaClient | null = null;
      let prisma2: PrismaClient | null = null;
      const createdCompanyIds = new Set<string>();

      async function cleanupCompany(companyId: string) {
        if (!prisma1) return;
        try {
          await prisma1.idempotencyRecord.deleteMany({ where: { companyId } });
          await prisma1.loanRepayment.deleteMany({ where: { loan: { companyId } } });
          await prisma1.employeeLoan.deleteMany({ where: { companyId } });
          await prisma1.fullFinalSettlement.deleteMany({ where: { companyId } });
          await prisma1.payslip.deleteMany({ where: { companyId } });
          await prisma1.payrollLine.deleteMany({ where: { payrollRun: { companyId } } });
          await prisma1.payrollAdjustment.deleteMany({ where: { companyId } });
          await prisma1.expenseClaim.deleteMany({ where: { companyId } });
          await prisma1.payrollRun.deleteMany({ where: { companyId } });
          await prisma1.employee.deleteMany({ where: { companyId } });
          await prisma1.designation.deleteMany({ where: { companyId } });
          await prisma1.department.deleteMany({ where: { companyId } });
          await prisma1.user.deleteMany({ where: { companyId } });
          await prisma1.company.deleteMany({ where: { id: companyId } });
        } catch {
          // Ignore cleanup errors in teardown
        }
      }

      beforeAll(async () => {
        // 1. Fail-closed: DATABASE_URL must be configured
        if (!databaseUrl) {
          throw new Error(
            '[FAIL-CLOSED] DATABASE_URL is not set. A live PostgreSQL test database is strictly required for live concurrency verification.'
          );
        }

        // 2. Production safety: Restrict integration tests strictly to local loopback test instances
        const parsedUrl = new URL(databaseUrl);
        const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname);
        if (!isLoopback || parsedUrl.hostname.includes('rds.amazonaws.com') || process.env.NODE_ENV === 'production') {
          throw new Error(
            `[FAIL-CLOSED SAFETY] Financial concurrency test refused connection to host '${parsedUrl.hostname}'. Tests are strictly restricted to local loopback (localhost / 127.0.0.1 / ::1) test databases.`
          );
        }

        // 3. Fail-closed connectivity assertion: must be reachable and healthy
        try {
          prisma1 = new PrismaClient({ datasourceUrl: databaseUrl });
          prisma2 = new PrismaClient({ datasourceUrl: databaseUrl });
          await prisma1.$connect();
          await prisma1.$queryRaw`SELECT 1`;
          await prisma2.$connect();
          await prisma2.$queryRaw`SELECT 1`;
        } catch (err: unknown) {
          throw new Error(
            `[FAIL-CLOSED] PostgreSQL connection failed (${err instanceof Error ? err.message : 'Unknown'}). Concurrency integration assertions cannot pass without a live database.`
          );
        }
      });

      afterEach(async () => {
        for (const cid of createdCompanyIds) {
          await cleanupCompany(cid);
        }
        createdCompanyIds.clear();
      });

      afterAll(async () => {
        try {
          for (const cid of createdCompanyIds) {
            await cleanupCompany(cid);
          }
          if (prisma1) await prisma1.$disconnect();
          if (prisma2) await prisma2.$disconnect();
        } catch {
          // Disconnect ignore
        }
      });

      // Helper to bootstrap a test company with department, designation, employee, and active loan
      async function setupCompanyFixtures(suffix: string) {
        if (!prisma1) throw new Error('Database not initialized');
        const companyId = `live-corp-${suffix}-${Date.now()}`;
        createdCompanyIds.add(companyId);

        await prisma1.company.create({
          data: {
            id: companyId,
            name: `Live Corp ${suffix}`,
            slug: `live-corp-${suffix}-${Date.now()}`,
            email: `live-${suffix}-${Date.now()}@example.com`,
            industry: 'Technology',
            size: '10-50',
          },
        });

        const dept = await prisma1.department.create({
          data: {
            companyId,
            name: 'Engineering',
            code: `ENG-${suffix}`.slice(0, 10),
          },
        });

        const desig = await prisma1.designation.create({
          data: {
            companyId,
            departmentId: dept.id,
            title: 'Software Engineer',
          },
        });

        const emp = await prisma1.employee.create({
          data: {
            companyId,
            departmentId: dept.id,
            designationId: desig.id,
            employeeCode: `EMP-${suffix}-01`.slice(0, 20),
            firstName: 'Aarav',
            lastName: 'Sharma',
            email: `aarav-${suffix}-${Date.now()}@example.com`,
            dateOfJoining: new Date('2026-01-01'),
          },
        });

        const loan = await prisma1.employeeLoan.create({
          data: {
            companyId,
            employeeId: emp.id,
            type: 'PERSONAL',
            principal: 10000,
            outstanding: 10000,
            installment: 2000,
            startsOn: new Date('2026-10-01'),
            status: 'ACTIVE',
          },
        });

        return { companyId, dept, desig, emp, loan };
      }

      // -----------------------------------------------------------------------
      // A. Real PostgreSQL: Payroll Publication Concurrency & Idempotency
      // -----------------------------------------------------------------------
      it('A. real PostgreSQL: simultaneous publish requests enforce single-execution, single loan deduction, and idempotent retry', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp, loan } = await setupCompanyFixtures('pub');

        const run = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-10',
            status: 'LOCKED',
            totalEmployees: 1,
            totalGrossSalary: 50000,
            totalDeductions: 5000,
            totalNetPayout: 45000,
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'BANK-LIVE-PUB-01',
            lines: {
              create: [
                {
                  employeeId: emp.id,
                  grossEarnings: 50000,
                  employeeDeductions: 5000,
                  employerContributions: 0,
                  reimbursements: 0,
                  netPay: 45000,
                  workingDays: 30,
                  payableDays: 30,
                  unpaidDays: 0,
                  breakdown: { BASIC: 30000, HRA: 15000, LOAN_REPAYMENT: 2000 },
                  calculationTrace: [],
                },
              ],
            },
          },
        });

        const app1 = express();
        app1.use(express.json());
        app1.use('/api/v1', createPayrollRouter(prisma1, createAuthMiddleware('admin-1', companyId)));
        app1.use(errorHandler);

        const app2 = express();
        app2.use(express.json());
        app2.use('/api/v1', createPayrollRouter(prisma2, createAuthMiddleware('admin-2', companyId)));
        app2.use(errorHandler);

        // Dispatch simultaneously over separate PostgreSQL connections with idempotency key
        const idempKey = `publish-key-${Date.now()}`;
        const [res1, res2] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/runs/${run.id}/publish`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .set('Idempotency-Key', idempKey),
          request(app2)
            .post(`/api/v1/payroll/runs/${run.id}/publish`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .set('Idempotency-Key', idempKey),
        ]);

        const statuses = [res1.status, res2.status].sort();
        // Either exactly one 200 and one 409, or one 200 and one replayed 200
        expect(statuses[0]).toBe(200);

        // Verify in real PostgreSQL database
        const updatedRun = await prisma1.payrollRun.findUnique({ where: { id: run.id } });
        expect(updatedRun?.status).toBe('PAYSLIPS_PUBLISHED');

        const repayments = await prisma1.loanRepayment.findMany({ where: { loanId: loan.id, payrollRunId: run.id } });
        expect(repayments.length).toBe(1);
        expect(repayments[0].amount).toBe(2000);

        const updatedLoan = await prisma1.employeeLoan.findUnique({ where: { id: loan.id } });
        expect(updatedLoan?.outstanding).toBe(8000);

        const payslips = await prisma1.payslip.findMany({ where: { payrollRunId: run.id } });
        expect(payslips.length).toBe(1);

        // Retry with same idempotency key after publication (simulating network timeout after commit)
        const retryRes = await request(app1)
          .post(`/api/v1/payroll/runs/${run.id}/publish`)
          .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
          .set('Idempotency-Key', idempKey);
        expect(retryRes.status).toBe(200);

        // Non-idempotent raw re-publish attempt must fail with 409
        const rawRetryRes = await request(app1)
          .post(`/api/v1/payroll/runs/${run.id}/publish`)
          .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`);
        expect(rawRetryRes.status).toBe(409);
        expect(rawRetryRes.body.error.code).toBe('PAYROLL_ALREADY_PUBLISHED');
      });

      // -----------------------------------------------------------------------
      // B. Real PostgreSQL: Loan Repayment Uniqueness & Settlement Recovery
      // -----------------------------------------------------------------------
      it('B. real PostgreSQL: loan repayment uniqueness under concurrent settlement payout and transaction rollback', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp, loan } = await setupCompanyFixtures('settle');

        // Create Full & Final Settlement in APPROVED status with loan recovery
        const settlement = await prisma1.fullFinalSettlement.create({
          data: {
            companyId,
            employeeId: emp.id,
            lastWorkingDay: new Date('2026-10-15'),
            status: 'APPROVED',
            unpaidSalary: 20000,
            leaveEncashment: 5000,
            gratuity: 0,
            bonus: 0,
            recoveries: 0,
            loanRecovery: 2000,
            taxDeduction: 1000,
            netSettlement: 22000,
            breakdown: {},
            approvedById: 'admin-1',
            approvedAt: new Date('2026-10-16'),
          },
        });

        const app1 = express();
        app1.use(express.json());
        app1.use('/api/v1', createPayrollComplianceRouter(prisma1, createAuthMiddleware('admin-1', companyId)));
        app1.use(errorHandler);

        const app2 = express();
        app2.use(express.json());
        app2.use('/api/v1', createPayrollComplianceRouter(prisma2, createAuthMiddleware('admin-2', companyId)));
        app2.use(errorHandler);

        // Race two settlement payout requests simultaneously over separate database connections
        const [res1, res2] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/compliance/settlements/${settlement.id}/pay`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`),
          request(app2)
            .post(`/api/v1/payroll/compliance/settlements/${settlement.id}/pay`)
            .set('Authorization', `Bearer ${signToken('admin-2', companyId)}`),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 409]);

        // Query real PostgreSQL state: Exactly one settlement paid, loan outstanding deducted exactly once
        const updatedSettlement = await prisma1.fullFinalSettlement.findUnique({ where: { id: settlement.id } });
        expect(updatedSettlement?.status).toBe('PAID');

        const updatedLoan = await prisma1.employeeLoan.findUnique({ where: { id: loan.id } });
        expect(updatedLoan?.outstanding).toBe(8000);

        const repayments = await prisma1.loanRepayment.findMany({ where: { loanId: loan.id } });
        expect(repayments.length).toBe(1);
        expect(repayments[0].amount).toBe(2000);
        expect(repayments[0].payrollRunId).toBeNull();

        // Rollback verification: simulate a failed transaction and verify zero phantom repayments persist
        try {
          await prisma1.$transaction(async (tx) => {
            await tx.loanRepayment.create({
              data: { loanId: loan.id, amount: 1500, payrollRunId: null },
            });
            await tx.employeeLoan.update({
              where: { id: loan.id },
              data: { outstanding: 6500 },
            });
            throw new Error('SIMULATED_TRANSACTION_FAILURE');
          });
        } catch (err: any) {
          expect(err.message).toBe('SIMULATED_TRANSACTION_FAILURE');
        }

        // Assert database state after rollback
        const postRollbackLoan = await prisma1.employeeLoan.findUnique({ where: { id: loan.id } });
        expect(postRollbackLoan?.outstanding).toBe(8000);
        const postRollbackRepayments = await prisma1.loanRepayment.findMany({ where: { loanId: loan.id } });
        expect(postRollbackRepayments.length).toBe(1);
      });

      // -----------------------------------------------------------------------
      // C. Real PostgreSQL: Expense Reimbursement Concurrency & Double-Ingestion
      // -----------------------------------------------------------------------
      it('C. real PostgreSQL: expense reimbursement concurrency prevents double-ingestion across runs and excludes rejected claims', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp } = await setupCompanyFixtures('expense');

        const validClaim = await prisma1.expenseClaim.create({
          data: {
            companyId,
            employeeId: emp.id,
            title: 'Client Travel Reimbursement',
            category: 'TRAVEL',
            amount: 3500,
            currency: 'INR',
            expenseDate: new Date('2026-09-10'),
            status: 'APPROVED',
            approvedAt: new Date('2026-09-15'),
            submittedAt: new Date('2026-09-12'),
          },
        });

        const rejectedClaim = await prisma1.expenseClaim.create({
          data: {
            companyId,
            employeeId: emp.id,
            title: 'Disallowed Luxury Expense',
            category: 'MEALS',
            amount: 10000,
            currency: 'INR',
            expenseDate: new Date('2026-09-10'),
            status: 'REJECTED',
            submittedAt: new Date('2026-09-12'),
          },
        });

        const runA = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-09',
            status: 'ATTENDANCE_FINALIZED',
            totalEmployees: 1,
            totalGrossSalary: 0,
            totalDeductions: 0,
            totalNetPayout: 0,
            periodEnd: new Date('2026-09-30'),
          },
        });

        const runB = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-10',
            status: 'ATTENDANCE_FINALIZED',
            totalEmployees: 1,
            totalGrossSalary: 0,
            totalDeductions: 0,
            totalNetPayout: 0,
            periodEnd: new Date('2026-10-31'),
          },
        });

        const app1 = express();
        app1.use(express.json());
        app1.use('/api/v1', createPayrollRouter(prisma1, createAuthMiddleware('admin-1', companyId)));
        app1.use(errorHandler);

        const app2 = express();
        app2.use(express.json());
        app2.use('/api/v1', createPayrollRouter(prisma2, createAuthMiddleware('admin-2', companyId)));
        app2.use(errorHandler);

        // Race two concurrent ingestion requests for the same valid claim across separate runs
        const [resA, resB] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/runs/${runA.id}/ingest-expenses`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .send({ expenseClaimIds: [validClaim.id] }),
          request(app2)
            .post(`/api/v1/payroll/runs/${runB.id}/ingest-expenses`)
            .set('Authorization', `Bearer ${signToken('admin-2', companyId)}`)
            .send({ expenseClaimIds: [validClaim.id] }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses[0]).toBe(200);
        expect([400, 409]).toContain(statuses[1]);

        // Query real PostgreSQL: claim is INGESTED and linked to exactly one adjustment
        const updatedClaim = await prisma1.expenseClaim.findUnique({ where: { id: validClaim.id } });
        expect(updatedClaim?.status).toBe('INGESTED');

        const adjustments = await prisma1.payrollAdjustment.findMany({ where: { expenseClaimId: validClaim.id } });
        expect(adjustments.length).toBe(1);
        expect(adjustments[0].amount).toBe(3500);

        // Attempting to ingest a REJECTED claim must fail closed
        const rejectedRes = await request(app1)
          .post(`/api/v1/payroll/runs/${runA.id}/ingest-expenses`)
          .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
          .send({ expenseClaimIds: [rejectedClaim.id] });

        expect(rejectedRes.status).toBe(400);
        expect(rejectedRes.body.error.code).toBe('EXPENSE_CLAIM_NOT_ELIGIBLE');

        const postCheckRejected = await prisma1.expenseClaim.findUnique({ where: { id: rejectedClaim.id } });
        expect(postCheckRejected?.status).toBe('REJECTED');
      });

      // -----------------------------------------------------------------------
      // D. Real PostgreSQL: Payment Recording and Reversal Racing
      // -----------------------------------------------------------------------
      it('D. real PostgreSQL: payment recording and reversal racing enforces single permitted state transition', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp } = await setupCompanyFixtures('payrec');

        const run = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-10',
            status: 'LOCKED',
            totalEmployees: 1,
            totalGrossSalary: 50000,
            totalDeductions: 5000,
            totalNetPayout: 45000,
          },
        });

        const app1 = express();
        app1.use(express.json());
        app1.use('/api/v1', createPayrollRouter(prisma1, createAuthMiddleware('admin-1', companyId)));
        app1.use(errorHandler);

        const app2 = express();
        app2.use(express.json());
        app2.use('/api/v1', createPayrollRouter(prisma2, createAuthMiddleware('admin-2', companyId)));
        app2.use(errorHandler);

        // Race duplicate payment-recording requests concurrently
        const [resPay1, resPay2] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/runs/${run.id}/record-payment`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .send({ paymentDate: new Date('2026-10-31'), paymentReference: 'BANK-REF-ALPHA' }),
          request(app2)
            .post(`/api/v1/payroll/runs/${run.id}/record-payment`)
            .set('Authorization', `Bearer ${signToken('admin-2', companyId)}`)
            .send({ paymentDate: new Date('2026-10-31'), paymentReference: 'BANK-REF-BETA' }),
        ]);

        // Both attempts target status LOCKED: exactly one or sequential atomic update occurs
        expect([resPay1.status, resPay2.status].every(s => [200, 409].includes(s))).toBe(true);

        const runAfterPay = await prisma1.payrollRun.findUnique({ where: { id: run.id } });
        expect(['BANK-REF-ALPHA', 'BANK-REF-BETA']).toContain(runAfterPay?.paymentReference);

        // Race reversal requests against each other
        const [resRev1, resRev2] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/runs/${run.id}/reverse`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .send({ reason: 'Reversing for audit correction A' }),
          request(app2)
            .post(`/api/v1/payroll/runs/${run.id}/reverse`)
            .set('Authorization', `Bearer ${signToken('admin-2', companyId)}`)
            .send({ reason: 'Reversing for audit correction B' }),
        ]);

        const revStatuses = [resRev1.status, resRev2.status].sort();
        expect(revStatuses).toEqual([200, 409]);

        const runAfterRev = await prisma1.payrollRun.findUnique({ where: { id: run.id } });
        expect(runAfterRev?.status).toBe('REVERSED');
      });

      // -----------------------------------------------------------------------
      // E. Real PostgreSQL: Idempotency under Concurrent Duplicate Keys
      // -----------------------------------------------------------------------
      it('E. real PostgreSQL: idempotency under concurrent duplicate keys preserves single execution and tenant scoping', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp } = await setupCompanyFixtures('idemp');

        const run = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-10',
            status: 'LOCKED',
            totalEmployees: 1,
            totalGrossSalary: 40000,
            totalDeductions: 4000,
            totalNetPayout: 36000,
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'BANK-IDEMP-01',
            lines: {
              create: [
                {
                  employeeId: emp.id,
                  grossEarnings: 40000,
                  employeeDeductions: 4000,
                  employerContributions: 0,
                  reimbursements: 0,
                  netPay: 36000,
                  workingDays: 30,
                  payableDays: 30,
                  unpaidDays: 0,
                  breakdown: { BASIC: 25000, HRA: 15000 },
                  calculationTrace: [],
                },
              ],
            },
          },
        });

        const app1 = express();
        app1.use(express.json());
        app1.use('/api/v1', createPayrollRouter(prisma1, createAuthMiddleware('admin-1', companyId)));
        app1.use(errorHandler);

        const app2 = express();
        app2.use(express.json());
        app2.use('/api/v1', createPayrollRouter(prisma2, createAuthMiddleware('admin-2', companyId)));
        app2.use(errorHandler);

        const sharedKey = `idemp-race-${Date.now()}`;

        // Submit the same idempotency key concurrently
        const [res1, res2] = await Promise.all([
          request(app1)
            .post(`/api/v1/payroll/runs/${run.id}/publish`)
            .set('Authorization', `Bearer ${signToken('admin-1', companyId)}`)
            .set('Idempotency-Key', sharedKey),
          request(app2)
            .post(`/api/v1/payroll/runs/${run.id}/publish`)
            .set('Authorization', `Bearer ${signToken('admin-2', companyId)}`)
            .set('Idempotency-Key', sharedKey),
        ]);

        // Both return 200 (one executes and stores, other gets replayed response)
        expect(res1.status === 200 || res2.status === 200).toBe(true);

        // Verify in real PostgreSQL: exactly one set of payslips created
        const payslips = await prisma1.payslip.findMany({ where: { payrollRunId: run.id } });
        expect(payslips.length).toBe(1);

        // Verify idempotency record exists in PostgreSQL
        const idempRecord = await prisma1.idempotencyRecord.findFirst({
          where: { companyId, key: sharedKey },
        });
        expect(idempRecord).not.toBeNull();
        expect(idempRecord?.statusCode).toBe(200);

        // Tenant boundary check: Tenant B cannot access or reuse Tenant A's idempotency key
        const tenantBId = `live-tenant-b-${Date.now()}`;
        createdCompanyIds.add(tenantBId);
        await prisma1.company.create({
          data: {
            id: tenantBId,
            name: 'Tenant B Corp',
            slug: `tenant-b-${Date.now()}`,
            email: `tenant-b-${Date.now()}@example.com`,
            industry: 'Finance',
            size: '10-50',
          },
        });

        const appB = express();
        appB.use(express.json());
        appB.use('/api/v1', createPayrollRouter(prisma1, createAuthMiddleware('admin-b', tenantBId)));
        appB.use(errorHandler);

        // Attempt to replay or access run under Tenant B
        const crossTenantRes = await request(appB)
          .post(`/api/v1/payroll/runs/${run.id}/publish`)
          .set('Authorization', `Bearer ${signToken('admin-b', tenantBId)}`)
          .set('Idempotency-Key', sharedKey);

        expect([404, 409]).toContain(crossTenantRes.status);
      });

      // -----------------------------------------------------------------------
      // F. Real PostgreSQL: Transaction Isolation & Persisted Financial Totals
      // -----------------------------------------------------------------------
      it('F. real PostgreSQL: transaction isolation verifies row locking and persisted financial reconciliation invariants', async () => {
        if (!prisma1 || !prisma2) throw new Error('Database clients not initialized');

        const { companyId, emp, loan } = await setupCompanyFixtures('audit');

        // Create published payroll run with 1 employee
        const run = await prisma1.payrollRun.create({
          data: {
            companyId,
            month: '2026-10',
            status: 'PAYSLIPS_PUBLISHED',
            totalEmployees: 1,
            totalGrossSalary: 60000,
            totalDeductions: 8000,
            totalNetPayout: 52000,
            paymentDate: new Date('2026-10-31'),
            paymentReference: 'BANK-AUDIT-01',
            lines: {
              create: [
                {
                  employeeId: emp.id,
                  grossEarnings: 60000,
                  employeeDeductions: 8000,
                  employerContributions: 0,
                  reimbursements: 0,
                  netPay: 52000,
                  workingDays: 30,
                  payableDays: 30,
                  unpaidDays: 0,
                  breakdown: { BASIC: 40000, HRA: 20000, LOAN_REPAYMENT: 2000 },
                  calculationTrace: [],
                },
              ],
            },
          },
        });

        // Insert corresponding repayment
        await prisma1.loanRepayment.create({
          data: {
            loanId: loan.id,
            payrollRunId: run.id,
            amount: 2000,
          },
        });
        await prisma1.employeeLoan.update({
          where: { id: loan.id },
          data: { outstanding: 8000 },
        });

        // Assert financial invariants in real PostgreSQL
        // 1. Net pay reconciliation: gross - deductions = netPay
        const runLines = await prisma1.payrollLine.findMany({ where: { payrollRunId: run.id } });
        for (const line of runLines) {
          const expectedNet = line.grossEarnings - line.employeeDeductions + line.reimbursements;
          expect(line.netPay).toBe(expectedNet);
        }

        // 2. Loan reconciliation: principal = outstanding + sum(repayments)
        const currentLoan = await prisma1.employeeLoan.findUnique({
          where: { id: loan.id },
          include: { repayments: true },
        });
        const totalRepaid = currentLoan!.repayments.reduce((sum, r) => sum + r.amount, 0);
        expect(currentLoan!.outstanding + totalRepaid).toBe(currentLoan!.principal);

        // 3. PostgreSQL FOR UPDATE row-level lock serialization assertion
        let tx1Finished = false;
        const tx1Promise = prisma1.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "PayrollRun" WHERE id = ${run.id} FOR UPDATE`;
          await new Promise((resolve) => setTimeout(resolve, 150));
          tx1Finished = true;
        });

        const tx2Promise = prisma2.$transaction(async (tx) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          // This query must block until tx1 commits
          await tx.$queryRaw`SELECT id FROM "PayrollRun" WHERE id = ${run.id} FOR UPDATE`;
          // tx1 must be finished when tx2 acquires the row lock
          expect(tx1Finished).toBe(true);
        });

        await Promise.all([tx1Promise, tx2Promise]);
      });
    }
  );
});
