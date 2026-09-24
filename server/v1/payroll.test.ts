import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPayrollRouter } from './payroll.js';

const appFor = (permissions: string[], prisma: unknown) => {
  const app = express();
  app.use(express.json());
  const auth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { auth: { id: 'user-a', companyId: 'tenant-a', role: 'PAYROLL_ADMIN', permissions } });
    next();
  };
  app.use('/api/v1', createPayrollRouter(prisma as never, auth));
  app.use((error: { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: { code: error.code || 'VALIDATION_ERROR' } }));
  return app;
};

describe('payroll API', () => {
  it('denies payroll data without payroll.manage', async () => {
    const response = await request(appFor([], {})).get('/api/v1/payroll/config');
    expect(response.status).toBe(403);
  });

  it('rejects a loan for an employee outside the tenant', async () => {
    const response = await request(appFor(['payroll.manage'], { employee: { findFirst: vi.fn().mockResolvedValue(null) } }))
      .post('/api/v1/payroll/loans')
      .send({ employeeId: '00000000-0000-4000-8000-000000000001', type: 'SALARY_ADVANCE', principal: 10000, installment: 1000, startsOn: '2026-09-01' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('EMPLOYEE_INVALID');
  });

  it('requires separate payroll.approve for finance approval and payment', async () => {
    const app = appFor(['payroll.manage'], {});
    expect((await request(app).post('/api/v1/payroll/runs/run-a/finance-approve')).status).toBe(403);
    expect((await request(app).post('/api/v1/payroll/runs/run-a/record-payment').send({ paymentDate: '2026-09-30', paymentReference: 'BANK-123' })).status).toBe(403);
  });

  it('records payment metadata for a locked payroll', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const response = await request(appFor(['payroll.manage', 'payroll.approve'], { payrollRun: { updateMany }, auditLog: { create: vi.fn().mockResolvedValue({}) } }))
      .post('/api/v1/payroll/runs/run-a/record-payment')
      .send({ paymentDate: '2026-09-30', paymentReference: 'BANK-123' });
    expect(response.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'LOCKED' }), data: expect.objectContaining({ paymentReference: 'BANK-123' }) }));
  });

  it('does not publish payslips before payment is recorded', async () => {
    const prisma = { payrollRun: { findFirst: vi.fn().mockResolvedValue({ id: 'run-a', companyId: 'tenant-a', month: '2026-09', status: 'LOCKED', paymentDate: null, paymentReference: null, lines: [] }) } };
    const response = await request(appFor(['payroll.manage', 'payroll.approve'], prisma)).post('/api/v1/payroll/runs/run-a/publish');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_NOT_RECORDED');
  });
});
