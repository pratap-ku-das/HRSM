import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { emitNotification } from './notifications.js';
import { startConfiguredWorkflow } from './workflows.js';

type Req = Request & {
  auth?: {
    id: string;
    companyId: string;
    role: string;
    employeeId?: string;
    permissions: string[];
    accessScopes?: Array<{ scope: string; scopeEntityId?: string | null; permissions: string[] }>;
  };
  requestId?: string;
};

const uuid = z.string().uuid();

export interface LeaveEncashmentCalculationResult {
  monthlyBasic: number;
  divisor: number;
  dailyRate: number;
  encashableDays: number;
  amount: number;
}

export function calculateLeaveEncashment(params: {
  monthlyBasic: number;
  encashableDays: number;
  daysInMonthDivisor?: number;
}): LeaveEncashmentCalculationResult {
  const divisor = params.daysInMonthDivisor && params.daysInMonthDivisor > 0 ? params.daysInMonthDivisor : 30;
  const dailyRate = Math.round(((params.monthlyBasic / divisor) + Number.EPSILON) * 100) / 100;
  const amount = Math.round(((dailyRate * params.encashableDays) + Number.EPSILON) * 100) / 100;
  return {
    monthlyBasic: params.monthlyBasic,
    divisor,
    dailyRate,
    encashableDays: params.encashableDays,
    amount,
  };
}

export async function getEmployeeBasicSalary(
  prisma: PrismaClient,
  companyId: string,
  employeeId: string,
  asOfDate = new Date(),
): Promise<number> {
  const revision = await prisma.employeeSalaryRevision.findFirst({
    where: {
      companyId,
      employeeId,
      status: 'APPROVED',
      effectiveFrom: { lte: asOfDate },
    },
    include: {
      structure: {
        include: {
          components: { orderBy: { sequence: 'asc' } },
        },
      },
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!revision) {
    // If no approved revision is recorded, fallback to default monthly baseline
    return 30000;
  }

  const componentValues = (revision.componentValues || {}) as Record<string, unknown>;

  // 1. Check if BASIC is directly given in componentValues
  if (typeof componentValues.BASIC === 'number' && componentValues.BASIC > 0) {
    return componentValues.BASIC;
  }

  // 2. Check structure components for code === 'BASIC' or name containing 'basic'
  const basicComponent = revision.structure.components.find(
    (c) => c.code.toUpperCase() === 'BASIC' || /basic/i.test(c.name),
  );

  if (basicComponent) {
    if (basicComponent.method === 'FIXED') {
      return basicComponent.value;
    }
    if (basicComponent.method === 'PERCENT_GROSS') {
      const monthlyGross = revision.annualCtc / 12;
      return Math.round((monthlyGross * basicComponent.value / 100) * 100) / 100;
    }
  }

  // 3. Fallback: 50% of monthly CTC is standard statutory Indian basic salary
  const monthlyCtc = revision.annualCtc / 12;
  return Math.round(monthlyCtc * 0.5 * 100) / 100;
}

export function createLeaveEncashmentRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });

  router.use('/leave-encashment', authenticate);

  /**
   * GET /leave-encashment/eligibility
   * Returns current employee's eligible leave encashment balances, formula, and daily rate.
   */
  router.get('/leave-encashment/eligibility', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;
      if (!employeeId) {
        return fail(res, 400, 'EMPLOYEE_NOT_LINKED', 'No employee profile linked to user.');
      }

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true, status: true, dateOfJoining: true, firstName: true, lastName: true },
      });
      if (!employee) {
        return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Employee profile not found.');
      }

      const isEmployeeActive = ['ACTIVE', 'ON_PROBATION'].includes(employee.status);
      const monthlyBasic = await getEmployeeBasicSalary(prisma, companyId, employeeId);
      const dailyRate = Math.round(((monthlyBasic / 30) + Number.EPSILON) * 100) / 100;

      const year = new Date().getUTCFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31));

      // Fetch paid leave types and all requests / encashments
      const [leaveTypes, leaveRequests, encashmentRequests] = await prisma.$transaction([
        prisma.leaveType.findMany({
          where: { companyId, isPaid: true },
          orderBy: { name: 'asc' },
        }),
        prisma.leaveRequest.findMany({
          where: {
            companyId,
            employeeId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: yearEnd },
            endDate: { gte: yearStart },
          },
          select: { leaveTypeId: true, totalDays: true },
        }),
        prisma.employeeServiceRequest.findMany({
          where: {
            companyId,
            employeeId,
            type: 'LEAVE_ENCASHMENT',
            status: { in: ['PENDING', 'APPROVED'] },
          },
        }),
      ]);

      const minBufferDays = 10; // Employee must retain at least 10 days for leave buffer

      const eligibilityList = leaveTypes.map((type) => {
        const joinedThisYear = employee.dateOfJoining > yearStart;
        const serviceStart = joinedThisYear ? employee.dateOfJoining : yearStart;
        const months = Math.max(0, 12 - serviceStart.getUTCMonth());
        const entitlement =
          type.accrualFrequency === 'MONTHLY'
            ? (type.daysAllowedPerYear * months) / 12
            : type.daysAllowedPerYear;

        const usedLeaveDays = leaveRequests
          .filter((r) => r.leaveTypeId === type.id)
          .reduce((sum, r) => sum + r.totalDays, 0);

        const encashedDays = encashmentRequests
          .filter((r) => {
            const p = r.payload as Record<string, unknown> | null;
            return p?.leaveTypeId === type.id;
          })
          .reduce((sum, r) => {
            const p = r.payload as Record<string, unknown> | null;
            return sum + (Number(p?.days) || 0);
          }, 0);

        const totalDeducted = usedLeaveDays + encashedDays;
        const availableBalance = Math.max(
          0,
          Math.min(type.maximumBalance ?? Infinity, entitlement + type.carryForwardDays) - totalDeducted,
        );

        const maxEncashable = isEmployeeActive ? Math.max(0, availableBalance - minBufferDays) : 0;
        const hasPending = encashmentRequests.some((r) => {
          const p = r.payload as Record<string, unknown> | null;
          return p?.leaveTypeId === type.id && r.status === 'PENDING';
        });

        const eligible = isEmployeeActive && maxEncashable >= 1 && !hasPending;
        let ineligibleReason: string | undefined;
        if (!isEmployeeActive) ineligibleReason = 'Only active employees can request leave encashment.';
        else if (hasPending) ineligibleReason = 'A leave encashment request is already pending for this leave type.';
        else if (maxEncashable < 1) ineligibleReason = `Requires balance above minimum retention buffer of ${minBufferDays} days.`;

        return {
          leaveTypeId: type.id,
          name: type.name,
          code: type.code,
          isPaid: type.isPaid,
          entitlement,
          carryForwardDays: type.carryForwardDays,
          usedLeaveDays,
          encashedDays,
          availableBalance,
          minBufferDays,
          maxEncashable,
          eligible,
          hasPending,
          ineligibleReason,
          estimatedPayoutForMaxDays: Math.round(((dailyRate * maxEncashable) + Number.EPSILON) * 100) / 100,
        };
      });

      return ok(res, {
        employee: { id: employee.id, status: employee.status, firstName: employee.firstName, lastName: employee.lastName },
        formula: 'Encashment Amount = (Monthly Basic / 30) * Encashed Days',
        monthlyBasic,
        dailyRate,
        minBufferDays,
        leaveTypes: eligibilityList,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /leave-encashment/request
   * Submits a leave encashment request and triggers the approval workflow.
   */
  router.post('/leave-encashment/request', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const employeeId = req.auth!.employeeId;
      if (!employeeId) {
        return fail(res, 400, 'EMPLOYEE_NOT_LINKED', 'No employee profile linked to user.');
      }

      const body = z
        .object({
          leaveTypeId: uuid,
          days: z.number().min(1).max(60),
          reason: z.string().trim().min(3).max(500),
          payrollMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        })
        .parse(req.body);

      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true, status: true, employeeCode: true, firstName: true, lastName: true, dateOfJoining: true },
      });
      if (!employee) {
        return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Employee profile not found.');
      }
      if (!['ACTIVE', 'ON_PROBATION'].includes(employee.status)) {
        return fail(res, 403, 'EMPLOYEE_INACTIVE', 'Only active employees can request leave encashment.');
      }

      const leaveType = await prisma.leaveType.findFirst({
        where: { id: body.leaveTypeId, companyId },
      });
      if (!leaveType) {
        return fail(res, 404, 'LEAVE_TYPE_NOT_FOUND', 'Leave category not found.');
      }
      if (!leaveType.isPaid) {
        return fail(res, 400, 'UNPAID_LEAVE_NOT_ENCASHABLE', 'Unpaid leave categories are not eligible for encashment.');
      }

      // Check pending encashment
      const existingPending = await prisma.employeeServiceRequest.findFirst({
        where: {
          companyId,
          employeeId,
          type: 'LEAVE_ENCASHMENT',
          status: 'PENDING',
        },
      });
      if (existingPending) {
        const p = existingPending.payload as Record<string, unknown> | null;
        if (p?.leaveTypeId === body.leaveTypeId) {
          return fail(res, 409, 'ENCASHMENT_ALREADY_PENDING', 'A leave encashment request is already pending for this category.');
        }
      }

      // Verify balance and buffer
      const year = new Date().getUTCFullYear();
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year, 11, 31));

      const [leaveRequests, priorEncashments] = await prisma.$transaction([
        prisma.leaveRequest.findMany({
          where: {
            companyId,
            employeeId,
            leaveTypeId: body.leaveTypeId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: yearEnd },
            endDate: { gte: yearStart },
          },
          select: { totalDays: true },
        }),
        prisma.employeeServiceRequest.findMany({
          where: {
            companyId,
            employeeId,
            type: 'LEAVE_ENCASHMENT',
            status: { in: ['PENDING', 'APPROVED'] },
          },
        }),
      ]);

      const joinedThisYear = employee.dateOfJoining > yearStart;
      const serviceStart = joinedThisYear ? employee.dateOfJoining : yearStart;
      const months = Math.max(0, 12 - serviceStart.getUTCMonth());
      const entitlement =
        leaveType.accrualFrequency === 'MONTHLY'
          ? (leaveType.daysAllowedPerYear * months) / 12
          : leaveType.daysAllowedPerYear;

      const usedLeaveDays = leaveRequests.reduce((sum, r) => sum + r.totalDays, 0);
      const priorEncashed = priorEncashments
        .filter((r) => (r.payload as Record<string, unknown> | null)?.leaveTypeId === body.leaveTypeId)
        .reduce((sum, r) => sum + (Number((r.payload as Record<string, unknown> | null)?.days) || 0), 0);

      const availableBalance = Math.max(
        0,
        Math.min(leaveType.maximumBalance ?? Infinity, entitlement + leaveType.carryForwardDays) -
          (usedLeaveDays + priorEncashed),
      );

      const minBufferDays = 10;
      const maxEncashable = Math.max(0, availableBalance - minBufferDays);

      if (body.days > maxEncashable) {
        return fail(
          res,
          409,
          'INSUFFICIENT_ENCASHABLE_BALANCE',
          `Cannot encash ${body.days} days. Available balance is ${availableBalance} days, and a minimum buffer of ${minBufferDays} days must remain (maximum encashable: ${maxEncashable} days).`,
        );
      }

      // Calculate financial payout
      const monthlyBasic = await getEmployeeBasicSalary(prisma, companyId, employeeId);
      const calculation = calculateLeaveEncashment({
        monthlyBasic,
        encashableDays: body.days,
        daysInMonthDivisor: 30,
      });

      const currentMonth = new Date().toISOString().slice(0, 7);
      const payrollMonth = body.payrollMonth || currentMonth;

      const result = await prisma.$transaction(async (tx) => {
        const serviceRequest = await tx.employeeServiceRequest.create({
          data: {
            companyId,
            employeeId,
            type: 'LEAVE_ENCASHMENT',
            title: `Leave Encashment: ${body.days} days of ${leaveType.name}`,
            reason: body.reason,
            amount: calculation.amount,
            status: 'PENDING',
            payload: {
              leaveTypeId: leaveType.id,
              leaveTypeCode: leaveType.code,
              leaveTypeName: leaveType.name,
              days: body.days,
              monthlyBasic: calculation.monthlyBasic,
              dailyRate: calculation.dailyRate,
              amount: calculation.amount,
              minBufferDays,
              remainingBalanceAfterEncashment: availableBalance - body.days,
              payrollMonth,
              formula: calculation.dailyRate ? `(${calculation.monthlyBasic} / 30) * ${body.days}` : 'Basic / 30 * Days',
            },
          },
        });

        // Trigger workflow engine
        const workflow = await startConfiguredWorkflow(tx as unknown as PrismaClient, {
          companyId,
          requesterUserId: req.auth!.id,
          module: 'LEAVE',
          subjectType: 'EmployeeServiceRequest',
          subjectId: serviceRequest.id,
          title: `Leave Encashment - ${employee.firstName} ${employee.lastName} (${body.days} days)`,
          summary: `Encashment request for ${body.days} days of ${leaveType.name} (₹${calculation.amount.toLocaleString('en-IN')})`,
          payload: {
            serviceRequestId: serviceRequest.id,
            leaveTypeId: leaveType.id,
            days: body.days,
            amount: calculation.amount,
            payrollMonth,
          },
        });

        if (workflow?.id) {
          await tx.employeeServiceRequest.update({
            where: { id: serviceRequest.id },
            data: { workflowInstanceId: workflow.id },
          });
        }

        await tx.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: `${employee.firstName} ${employee.lastName}`,
            userRole: req.auth!.role,
            action: 'APPLY_LEAVE_ENCASHMENT',
            category: 'LEAVE',
            details: `Applied for encashment of ${body.days} days (${leaveType.name}) for ₹${calculation.amount}.`,
            ipAddress: req.ip || '127.0.0.1',
          },
        });

        return { serviceRequest, workflowId: workflow?.id };
      });

      return ok(res, result, 201);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /leave-encashment/requests
   * Lists encashment requests with role-based filtering (HR sees company requests, Employee sees own).
   */
  router.get('/leave-encashment/requests', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const canReviewAll = req.auth!.permissions.includes('leave.review') || req.auth!.permissions.includes('payroll.approve');

      const whereClause = canReviewAll
        ? { companyId, type: 'LEAVE_ENCASHMENT' }
        : { companyId, employeeId: req.auth!.employeeId || 'none', type: 'LEAVE_ENCASHMENT' };

      const requests = await prisma.employeeServiceRequest.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { name: true } },
              designation: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      // Enrich with workflow step info and SLA indicator
      const workflowIds = requests.map((r) => r.workflowInstanceId).filter((id): id is string => Boolean(id));
      const workflows = workflowIds.length
        ? await prisma.workflowInstance.findMany({
            where: { id: { in: workflowIds }, companyId },
            include: {
              stepInstances: {
                where: { status: 'PENDING' },
                include: { step: true },
              },
            },
          })
        : [];

      const workflowMap = new Map(workflows.map((w) => [w.id, w]));

      const enriched = requests.map((r) => {
        const wf = r.workflowInstanceId ? workflowMap.get(r.workflowInstanceId) : null;
        const pendingStep = wf?.stepInstances[0];
        const dueAt = pendingStep?.dueAt;
        const isOverdue = Boolean(dueAt && new Date(dueAt) < new Date());
        const canReview = Boolean(
          canReviewAll ||
            (pendingStep && pendingStep.approverUserIds.includes(req.auth!.id)),
        );

        return {
          ...r,
          workflowStatus: wf?.status,
          currentStepSequence: pendingStep?.sequence,
          approverUserIds: pendingStep?.approverUserIds || [],
          dueAt,
          isOverdue,
          canReview,
        };
      });

      return ok(res, enriched);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /leave-encashment/requests/:id/approve
   * Direct review endpoint for HR / Managers with leave.review or payroll.approve permission.
   */
  router.post('/leave-encashment/requests/:id/approve', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const canApprove =
        req.auth!.permissions.includes('leave.review') ||
        req.auth!.permissions.includes('payroll.approve') ||
        req.auth!.role === 'COMPANY_ADMIN' ||
        req.auth!.role === 'HR_MANAGER';

      if (!canApprove) {
        return fail(res, 403, 'FORBIDDEN', 'Leave review or payroll approval permission is required.');
      }

      const id = z.string().uuid().parse(req.params.id);
      const serviceRequest = await prisma.employeeServiceRequest.findFirst({
        where: { id, companyId, type: 'LEAVE_ENCASHMENT', status: 'PENDING' },
        include: { employee: true },
      });

      if (!serviceRequest) {
        return fail(res, 404, 'REQUEST_NOT_FOUND', 'Pending leave encashment request was not found.');
      }

      const payload = (serviceRequest.payload || {}) as Record<string, unknown>;
      const targetMonth = String(payload.payrollMonth || new Date().toISOString().slice(0, 7));
      const amount = Number(serviceRequest.amount || 0);

      await prisma.$transaction(async (tx) => {
        // 1. Update service request
        await tx.employeeServiceRequest.update({
          where: { id: serviceRequest.id },
          data: { status: 'APPROVED' },
        });

        // 2. Complete workflow instance if linked
        if (serviceRequest.workflowInstanceId) {
          await tx.workflowInstance.updateMany({
            where: { id: serviceRequest.workflowInstanceId, companyId },
            data: { status: 'APPROVED', completedAt: new Date() },
          });
          await tx.workflowStepInstance.updateMany({
            where: { instanceId: serviceRequest.workflowInstanceId, status: 'PENDING' },
            data: { status: 'APPROVED', completedAt: new Date() },
          });
          await tx.workflowAction.create({
            data: {
              instanceId: serviceRequest.workflowInstanceId,
              actorUserId: req.auth!.id,
              action: 'APPROVE',
              comment: 'Leave encashment approved by administrator.',
            },
          });
        }

        // 3. Create Payroll Adjustment (EARNING)
        await tx.payrollAdjustment.create({
          data: {
            companyId,
            employeeId: serviceRequest.employeeId,
            month: targetMonth,
            code: 'LEAVE_ENCASHMENT',
            name: 'Leave Encashment',
            kind: 'EARNING',
            amount,
            reason: `Leave encashment payout (${payload.days || 0} days of ${payload.leaveTypeName || 'Leave'}) [${serviceRequest.id}]`,
            createdById: req.auth!.id,
          },
        });

        // 4. Audit Log
        await tx.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'APPROVE_LEAVE_ENCASHMENT',
            category: 'LEAVE',
            details: `Approved leave encashment of ${payload.days} days (₹${amount}) for employee ${serviceRequest.employee.employeeCode}. Added to ${targetMonth} payroll.`,
            ipAddress: req.ip || '127.0.0.1',
          },
        });
      });

      // 5. Emit notification to employee
      if (serviceRequest.employee.userId) {
        await emitNotification(prisma, {
          companyId,
          userId: serviceRequest.employee.userId,
          eventKey: 'LEAVE_ENCASHMENT_APPROVED',
          title: 'Leave Encashment Approved',
          body: `Your leave encashment request for ₹${amount.toLocaleString('en-IN')} has been approved and added to ${targetMonth} payroll.`,
          entityType: 'EmployeeServiceRequest',
          entityId: serviceRequest.id,
          actionUrl: '/self-service',
        }).catch(() => {});
      }

      return ok(res, { status: 'APPROVED', payrollMonth: targetMonth, amount });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /leave-encashment/requests/:id/reject
   * Rejection endpoint.
   */
  router.post('/leave-encashment/requests/:id/reject', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const canApprove =
        req.auth!.permissions.includes('leave.review') ||
        req.auth!.permissions.includes('payroll.approve') ||
        req.auth!.role === 'COMPANY_ADMIN' ||
        req.auth!.role === 'HR_MANAGER';

      if (!canApprove) {
        return fail(res, 403, 'FORBIDDEN', 'Leave review permission is required.');
      }

      const id = z.string().uuid().parse(req.params.id);
      const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);

      const serviceRequest = await prisma.employeeServiceRequest.findFirst({
        where: { id, companyId, type: 'LEAVE_ENCASHMENT', status: 'PENDING' },
        include: { employee: true },
      });

      if (!serviceRequest) {
        return fail(res, 404, 'REQUEST_NOT_FOUND', 'Pending leave encashment request was not found.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.employeeServiceRequest.update({
          where: { id: serviceRequest.id },
          data: { status: 'REJECTED' },
        });

        if (serviceRequest.workflowInstanceId) {
          await tx.workflowInstance.updateMany({
            where: { id: serviceRequest.workflowInstanceId, companyId },
            data: { status: 'REJECTED', completedAt: new Date() },
          });
          await tx.workflowStepInstance.updateMany({
            where: { instanceId: serviceRequest.workflowInstanceId, status: 'PENDING' },
            data: { status: 'REJECTED', completedAt: new Date() },
          });
          await tx.workflowAction.create({
            data: {
              instanceId: serviceRequest.workflowInstanceId,
              actorUserId: req.auth!.id,
              action: 'REJECT',
              comment: reason,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'REJECT_LEAVE_ENCASHMENT',
            category: 'LEAVE',
            details: `Rejected leave encashment for employee ${serviceRequest.employee.employeeCode}: ${reason}`,
            ipAddress: req.ip || '127.0.0.1',
          },
        });
      });

      if (serviceRequest.employee.userId) {
        await emitNotification(prisma, {
          companyId,
          userId: serviceRequest.employee.userId,
          eventKey: 'LEAVE_ENCASHMENT_REJECTED',
          title: 'Leave Encashment Rejected',
          body: `Your leave encashment request was rejected: ${reason}`,
          entityType: 'EmployeeServiceRequest',
          entityId: serviceRequest.id,
          actionUrl: '/self-service',
        }).catch(() => {});
      }

      return ok(res, { status: 'REJECTED' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
