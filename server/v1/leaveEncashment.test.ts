import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateLeaveEncashment,
  createLeaveEncashmentRouter,
  getEmployeeBasicSalary,
} from './leaveEncashment.js';
import { escalateOverdueWorkflowSteps } from './workflows.js';
import { calculatePayroll } from './payrollEngine.js';

const appFor = (permissions: string[], prisma: unknown, role = 'EMPLOYEE') => {
  const app = express();
  app.use(express.json());
  const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, {
      auth: {
        id: 'user-emp-1',
        companyId: 'company-test-1',
        role,
        employeeId: 'emp-uuid-1',
        permissions,
      },
      requestId: 'test-req-1',
    });
    next();
  };
  app.use('/api/v1', createLeaveEncashmentRouter(prisma as never, authenticate));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.status || 500).json({ error: { message: error?.message, stack: error?.stack } });
  });
  return app;
};

describe('Leave Encashment & SLA Escalation (P2.1 Production Audit)', () => {
  describe('Leave Encashment Calculation & Salary Extraction', () => {
    it('calculates encashment amount using standard 30-day divisor', () => {
      const calc = calculateLeaveEncashment({
        monthlyBasic: 45000,
        encashableDays: 5,
        daysInMonthDivisor: 30,
      });

      expect(calc.monthlyBasic).toBe(45000);
      expect(calc.dailyRate).toBe(1500);
      expect(calc.encashableDays).toBe(5);
      expect(calc.amount).toBe(7500);
    });

    it('handles decimal rounding and custom divisor accurately', () => {
      const calc = calculateLeaveEncashment({
        monthlyBasic: 53250,
        encashableDays: 3.5,
        daysInMonthDivisor: 26,
      });

      expect(calc.dailyRate).toBe(2048.08);
      expect(calc.amount).toBe(7168.28);
    });

    it('extracts employee basic salary from approved salary revision', async () => {
      const prisma = {
        employeeSalaryRevision: {
          findFirst: vi.fn().mockResolvedValue({
            annualCtc: 1200000,
            componentValues: { BASIC: 50000 },
            structure: { components: [] },
          }),
        },
      };

      const basic = await getEmployeeBasicSalary(
        prisma as never,
        'company-test-1',
        'emp-uuid-1',
      );
      expect(basic).toBe(50000);
    });

    it('falls back to 50% CTC when explicit BASIC component is omitted', async () => {
      const prisma = {
        employeeSalaryRevision: {
          findFirst: vi.fn().mockResolvedValue({
            annualCtc: 960000,
            componentValues: {},
            structure: { components: [] },
          }),
        },
      };

      const basic = await getEmployeeBasicSalary(
        prisma as never,
        'company-test-1',
        'emp-uuid-1',
      );
      expect(basic).toBe(40000);
    });
  });

  describe('Leave Encashment Eligibility & Rules', () => {
    it('computes eligible encashment days maintaining minimum retention buffer of 10 days', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-uuid-1',
            status: 'ACTIVE',
            dateOfJoining: new Date('2024-01-01'),
            firstName: 'Rahul',
            lastName: 'Sharma',
          }),
        },
        employeeSalaryRevision: {
          findFirst: vi.fn().mockResolvedValue({
            annualCtc: 720000,
            componentValues: { BASIC: 30000 },
            structure: { components: [] },
          }),
        },
        leaveType: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'leave-type-earned',
              name: 'Earned Leave',
              code: 'EL',
              isPaid: true,
              daysAllowedPerYear: 24,
              carryForwardDays: 6,
              maximumBalance: 30,
              accrualFrequency: 'ANNUAL',
            },
          ]),
        },
        leaveRequest: {
          findMany: vi.fn().mockResolvedValue([{ leaveTypeId: 'leave-type-earned', totalDays: 5 }]),
        },
        employeeServiceRequest: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
      };

      const app = appFor(['leave.apply'], prisma);
      const res = await request(app).get('/api/v1/leave-encashment/eligibility');

      expect(res.status).toBe(200);
      expect(res.body.data.monthlyBasic).toBe(30000);
      expect(res.body.data.dailyRate).toBe(1000);
      expect(res.body.data.minBufferDays).toBe(10);

      const el = res.body.data.leaveTypes[0];
      expect(el.availableBalance).toBe(25);
      expect(el.maxEncashable).toBe(15);
      expect(el.eligible).toBe(true);
      expect(el.estimatedPayoutForMaxDays).toBe(15000);
    });

    it('rejects encashment request when days exceed available minus retention buffer', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-uuid-1',
            status: 'ACTIVE',
            employeeCode: 'EMP001',
            firstName: 'Rahul',
            lastName: 'Sharma',
            dateOfJoining: new Date('2024-01-01'),
          }),
        },
        leaveType: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Earned Leave',
            code: 'EL',
            isPaid: true,
            daysAllowedPerYear: 15,
            carryForwardDays: 0,
            maximumBalance: 30,
            accrualFrequency: 'ANNUAL',
          }),
        },
        leaveRequest: {
          findMany: vi.fn().mockResolvedValue([{ totalDays: 2 }]),
        },
        employeeServiceRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
      };

      const app = appFor(['leave.apply'], prisma);
      const res = await request(app)
        .post('/api/v1/leave-encashment/request')
        .send({
          leaveTypeId: '00000000-0000-4000-8000-000000000001',
          days: 5, // Exceeds max 3 days
          reason: 'Festival encashment',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_ENCASHABLE_BALANCE');
    });

    it('rejects encashment of unpaid leave types', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-uuid-1',
            status: 'ACTIVE',
            employeeCode: 'EMP001',
            firstName: 'Rahul',
            lastName: 'Sharma',
            dateOfJoining: new Date('2024-01-01'),
          }),
        },
        leaveType: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Leave Without Pay',
            code: 'LWP',
            isPaid: false,
          }),
        },
      };

      const app = appFor(['leave.apply'], prisma);
      const res = await request(app)
        .post('/api/v1/leave-encashment/request')
        .send({
          leaveTypeId: '00000000-0000-4000-8000-000000000002',
          days: 3,
          reason: 'Encash LWP',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNPAID_LEAVE_NOT_ENCASHABLE');
    });

    it('prevents duplicate pending encashment requests for the same leave category', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-uuid-1',
            status: 'ACTIVE',
            employeeCode: 'EMP001',
            firstName: 'Rahul',
            lastName: 'Sharma',
            dateOfJoining: new Date('2024-01-01'),
          }),
        },
        leaveType: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Earned Leave',
            code: 'EL',
            isPaid: true,
          }),
        },
        employeeServiceRequest: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'existing-pending-1',
            status: 'PENDING',
            payload: { leaveTypeId: '00000000-0000-4000-8000-000000000001' },
          }),
        },
      };

      const app = appFor(['leave.apply'], prisma);
      const res = await request(app)
        .post('/api/v1/leave-encashment/request')
        .send({
          leaveTypeId: '00000000-0000-4000-8000-000000000001',
          days: 2,
          reason: 'Another encashment request',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ENCASHMENT_ALREADY_PENDING');
    });
  });

  describe('Full End-to-End Payroll Integration Flow', () => {
    it('verifies the full flow: Employee Encashment Request -> HR Approval -> PayrollAdjustment -> calculatePayroll -> Payslip Line', async () => {
      // Step 1: Encashment request and approval
      const serviceRequest = {
        id: '00000000-0000-4000-8000-000000000099',
        companyId: 'company-test-1',
        employeeId: 'emp-uuid-1',
        type: 'LEAVE_ENCASHMENT',
        status: 'PENDING',
        amount: 7500, // 5 days @ 1500/day
        workflowInstanceId: 'wf-instance-1',
        payload: {
          days: 5,
          leaveTypeName: 'Earned Leave',
          payrollMonth: '2026-10',
        },
        employee: {
          id: 'emp-uuid-1',
          employeeCode: 'EMP001',
          userId: 'user-emp-1',
        },
      };

      let createdAdjustment: Record<string, unknown> | null = null;

      const txMock = {
        employeeServiceRequest: { update: vi.fn().mockResolvedValue({ status: 'APPROVED' }) },
        workflowInstance: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        workflowStepInstance: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        workflowAction: { create: vi.fn().mockResolvedValue({}) },
        payrollAdjustment: {
          create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            createdAdjustment = data;
            return Promise.resolve(data);
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const prisma = {
        employeeServiceRequest: {
          findFirst: vi.fn().mockResolvedValue(serviceRequest),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
        notification: { create: vi.fn().mockResolvedValue({}) },
      };

      const app = appFor(['leave.review'], prisma, 'HR_MANAGER');
      const res = await request(app)
        .post('/api/v1/leave-encashment/requests/00000000-0000-4000-8000-000000000099/approve')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.amount).toBe(7500);

      // Verify the generated adjustment
      expect(createdAdjustment).not.toBeNull();
      expect(createdAdjustment).toEqual(
        expect.objectContaining({
          companyId: 'company-test-1',
          employeeId: 'emp-uuid-1',
          month: '2026-10',
          code: 'LEAVE_ENCASHMENT',
          name: 'Leave Encashment',
          kind: 'EARNING',
          amount: 7500,
        }),
      );

      // Step 2: Feed the created PayrollAdjustment into the actual PayrollEngine
      const payrollResult = calculatePayroll({
        components: [
          {
            code: 'BASIC',
            name: 'Basic Salary',
            kind: 'EARNING',
            method: 'FIXED',
            value: 45000,
            proratable: true,
            taxable: true,
          },
          {
            code: 'HRA',
            name: 'House Rent Allowance',
            kind: 'EARNING',
            method: 'PERCENT_BASIC',
            value: 40,
            proratable: true,
            taxable: true,
          },
        ],
        adjustments: [
          {
            code: String((createdAdjustment as any).code),
            name: String((createdAdjustment as any).name),
            kind: 'EARNING',
            amount: Number((createdAdjustment as any).amount),
          },
        ],
        rules: [],
        workingDays: 30,
        payableDays: 30,
      });

      // Basic: 45000, HRA: 18000, Encashment: 7500 => Total Gross Earnings = 70500
      expect(payrollResult.grossEarnings).toBe(70500);
      expect(payrollResult.breakdown.LEAVE_ENCASHMENT).toBe(7500);
      expect(payrollResult.netPay).toBe(70500);
    });
  });

  describe('Multi-Instance Concurrency Safety & SLA Escalation', () => {
    it('uses atomic CAS updateMany to prevent double-escalation across multiple server instances', async () => {
      const now = new Date('2026-10-02T12:00:00Z');
      const overdueStep = {
        id: 'step-inst-overdue-1',
        instanceId: 'wf-inst-1',
        sequence: 1,
        status: 'PENDING',
        dueAt: new Date('2026-10-02T10:00:00Z'),
        approverUserIds: ['mgr-user-1'],
        step: { slaHours: 24 },
        instance: {
          id: 'wf-inst-1',
          companyId: 'company-test-1',
          title: 'Leave Encashment - Rahul Sharma (5 days)',
          requesterUserId: 'user-emp-1',
          status: 'PENDING',
        },
      };

      // Instance 1: Wins the atomic CAS claim (count: 1)
      const prismaWinningInstance = {
        workflowStepInstance: {
          findMany: vi.fn().mockResolvedValue([overdueStep]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }), // CAS won
        },
        user: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'admin-user-1' },
            { id: 'hr-user-1' },
          ]),
        },
        workflowAction: { create: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        notification: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
      };

      const result1 = await escalateOverdueWorkflowSteps(
        prismaWinningInstance as never,
        'company-test-1',
        now,
      );

      expect(result1.checked).toBe(1);
      expect(result1.escalated.length).toBe(1);
      expect(prismaWinningInstance.workflowAction.create).toHaveBeenCalledTimes(1);
      expect(prismaWinningInstance.auditLog.create).toHaveBeenCalledTimes(1);

      // Instance 2: Concurrent runner loses the atomic CAS claim (count: 0) because Instance 1 already updated dueAt
      const prismaLosingInstance = {
        workflowStepInstance: {
          findMany: vi.fn().mockResolvedValue([overdueStep]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // CAS lost!
        },
        user: {
          findMany: vi.fn().mockResolvedValue([{ id: 'admin-user-1' }]),
        },
        workflowAction: { create: vi.fn() },
        auditLog: { create: vi.fn() },
        notification: { create: vi.fn() },
        $transaction: vi.fn(),
      };

      const result2 = await escalateOverdueWorkflowSteps(
        prismaLosingInstance as never,
        'company-test-1',
        now,
      );

      expect(result2.checked).toBe(1);
      expect(result2.escalated.length).toBe(0); // Safely skipped
      expect(prismaLosingInstance.workflowAction.create).not.toHaveBeenCalled();
      expect(prismaLosingInstance.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
