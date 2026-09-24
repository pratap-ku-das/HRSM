import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

type Req = Request & { auth?: { id: string; companyId: string; role: string; permissions: string[] }; requestId?: string };
const editableFields = ['workingDays','presentDays','absentDays','paidLeaveDays','unpaidLeaveDays','halfDays','lateDays','earlyExitDays','holidays','weeklyOffDays','overtimeHours','missingAttendanceDays'] as const;

const monthRange = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  return { start: new Date(Date.UTC(year, value - 1, 1)), end: new Date(Date.UTC(year, value, 0)) };
};
const weekdays = (start: Date, end: Date) => {
  let count = 0;
  for (let date = new Date(start); date <= end; date = new Date(date.getTime() + 86_400_000)) if (![0, 6].includes(date.getUTCDay())) count++;
  return count;
};
const numberWords = (amount: number) => {
  const ones = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const belowThousand = (value: number) => {
    const parts: string[] = [];
    if (value >= 100) { parts.push(`${ones[Math.floor(value / 100)]} Hundred`); value %= 100; }
    if (value >= 20) { parts.push(tens[Math.floor(value / 10)]); value %= 10; }
    if (value > 0) parts.push(ones[value]);
    return parts.join(' ');
  };
  let value = Math.max(0, Math.round(amount));
  if (!value) return 'Zero Rupees Only';
  const parts: string[] = [];
  for (const [size, label] of [[10_000_000,'Crore'],[100_000,'Lakh'],[1_000,'Thousand']] as const) {
    if (value >= size) { parts.push(`${belowThousand(Math.floor(value / size))} ${label}`); value %= size; }
  }
  if (value) parts.push(belowThousand(value));
  return `${parts.join(' ')} Rupees Only`;
};

export function createPayrollWorkflowRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  const permit = (permission: string): RequestHandler => (req: Req, res, next) => req.auth?.permissions.includes(permission) ? next() : fail(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  const audit = (req: Req, action: string, details: string) => prisma.auditLog.create({ data: {
    companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role,
    action, category: 'PAYROLL', details, ipAddress: req.ip || 'unknown',
  } });
  router.use('/payroll', authenticate, permit('payroll.manage'));

  router.get('/payroll/runs/:id/attendance', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const run = await prisma.payrollRun.findFirst({ where: { id: String(req.params.id), companyId } });
      if (!run?.periodStart || !run.periodEnd) return fail(res, 404, 'PAYROLL_RUN_NOT_FOUND', 'Payroll run was not found.');
      if (run.status === 'DRAFT') await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'ATTENDANCE_REVIEW' } });
      const existing = await prisma.payrollAttendanceReview.count({ where: { payrollRunId: run.id } });
      if (!existing && ['DRAFT','ATTENDANCE_REVIEW'].includes(run.status)) {
        const employees = await prisma.employee.findMany({
          where: { companyId, dateOfJoining: { lte: run.periodEnd }, OR: [{ lastWorkingDay: null }, { lastWorkingDay: { gte: run.periodStart } }] },
          select: { id: true },
        });
        const workingDays = weekdays(run.periodStart, run.periodEnd);
        for (const employee of employees) {
          const [attendance, leaves, holidays] = await Promise.all([
            prisma.attendanceRecord.findMany({ where: { companyId, employeeId: employee.id, date: { gte: run.periodStart, lte: run.periodEnd } } }),
            prisma.leaveRequest.findMany({ where: { companyId, employeeId: employee.id, status: 'APPROVED', startDate: { lte: run.periodEnd }, endDate: { gte: run.periodStart } }, include: { leaveType: true } }),
            prisma.holiday.count({ where: { companyId, date: { gte: run.periodStart, lte: run.periodEnd } } }),
          ]);
          const count = (status: string) => attendance.filter(item => item.status === status).length;
          const paidLeaveDays = leaves.filter(item => item.leaveType.isPaid).reduce((sum, item) => sum + item.totalDays, 0);
          const unpaidLeaveDays = leaves.filter(item => !item.leaveType.isPaid).reduce((sum, item) => sum + item.totalDays, 0);
          const presentDays = count('PRESENT');
          const lateDays = count('LATE');
          const halfDays = count('HALF_DAY');
          const absentDays = count('ABSENT');
          const accounted = presentDays + lateDays + halfDays + absentDays + paidLeaveDays + unpaidLeaveDays + holidays;
          await prisma.payrollAttendanceReview.create({ data: {
            companyId, payrollRunId: run.id, employeeId: employee.id, workingDays,
            presentDays, lateDays, halfDays, absentDays, paidLeaveDays, unpaidLeaveDays,
            holidays, weeklyOffDays: Math.max(0, run.periodEnd.getUTCDate() - workingDays),
            missingAttendanceDays: Math.max(0, workingDays - accounted),
            exceptions: Math.max(0, workingDays - accounted) ? ['Missing attendance'] : [],
          } });
        }
      }
      return ok(res, await prisma.payrollAttendanceReview.findMany({
        where: { companyId, payrollRunId: run.id },
        include: { changes: { orderBy: { changedAt: 'desc' } } },
        orderBy: { employeeId: 'asc' },
      }));
    } catch (error) { next(error); }
  });

  router.put('/payroll/runs/:id/attendance/:employeeId', async (req: Req, res, next) => {
    try {
      const body = z.object({ field: z.enum(editableFields), value: z.number().min(0).max(366), reason: z.string().trim().min(3).max(500) }).parse(req.body);
      const run = await prisma.payrollRun.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'ATTENDANCE_REVIEW' } });
      if (!run) return fail(res, 409, 'PAYROLL_ATTENDANCE_LOCKED', 'Attendance can only be adjusted during attendance review.');
      const review = await prisma.payrollAttendanceReview.findFirst({ where: { payrollRunId: run.id, employeeId: String(req.params.employeeId), companyId: req.auth!.companyId } });
      if (!review) return fail(res, 404, 'PAYROLL_ATTENDANCE_NOT_FOUND', 'Employee attendance review was not found.');
      const oldValue = Number(review[body.field]);
      const result = await prisma.$transaction(async tx => {
        const updated = await tx.payrollAttendanceReview.update({ where: { id: review.id }, data: { [body.field]: body.value, adjustedById: req.auth!.id, adjustedAt: new Date() } });
        await tx.payrollAttendanceChange.create({ data: {
          companyId: req.auth!.companyId, reviewId: review.id, employeeId: review.employeeId,
          field: body.field, oldValue, newValue: body.value, reason: body.reason, changedById: req.auth!.id,
        } });
        return updated;
      });
      await audit(req, 'ADJUST_PAYROLL_ATTENDANCE', `${review.employeeId} ${body.field}: ${oldValue} -> ${body.value}. Reason: ${body.reason}`);
      return ok(res, result);
    } catch (error) { next(error); }
  });

  router.post('/payroll/runs/:id/finalize-attendance', async (req: Req, res, next) => {
    try {
      const run = await prisma.payrollRun.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'ATTENDANCE_REVIEW' } });
      if (!run?.periodStart || !run.periodEnd) return fail(res, 409, 'PAYROLL_STATE_INVALID', 'Payroll is not in attendance review.');
      const unresolved = await prisma.payrollAttendanceReview.count({ where: { payrollRunId: run.id, missingAttendanceDays: { gt: 0 } } });
      const reason = z.object({ confirmation: z.boolean(), reason: z.string().trim().max(500).optional() }).parse(req.body);
      if (!reason.confirmation) return fail(res, 400, 'CONFIRMATION_REQUIRED', 'Confirm attendance finalization.');
      const result = await prisma.$transaction(async tx => {
        const lock = await tx.attendancePeriodLock.create({ data: { companyId: run.companyId, periodStart: run.periodStart!, periodEnd: run.periodEnd!, lockedById: req.auth!.id, reason: reason.reason || `Payroll ${run.month} attendance finalized` } });
        return tx.payrollRun.update({ where: { id: run.id }, data: { status: 'ATTENDANCE_FINALIZED', attendanceLockId: lock.id } });
      });
      await audit(req, 'FINALIZE_PAYROLL_ATTENDANCE', `Attendance finalized for ${run.month}; ${unresolved} exception(s) retained in the audit snapshot.`);
      return ok(res, result);
    } catch (error) { next(error); }
  });

  router.post('/payroll/runs/:id/submit', async (req: Req, res, next) => {
    try {
      const updated = await prisma.payrollRun.updateMany({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: { in: ['CALCULATED','HR_REVIEW','REJECTED'] } }, data: { status: 'PENDING_APPROVAL' } });
      if (!updated.count) return fail(res, 409, 'PAYROLL_STATE_INVALID', 'Only reviewed or rejected payroll can be submitted.');
      await audit(req, 'SUBMIT_PAYROLL_APPROVAL', `Payroll ${req.params.id} submitted for approval.`);
      return ok(res, { status: 'PENDING_APPROVAL' });
    } catch (error) { next(error); }
  });

  router.post('/payroll/runs/:id/approve', permit('payroll.approve'), async (req: Req, res, next) => {
    try {
      const body = z.object({ remarks: z.string().trim().max(1000).optional() }).parse(req.body);
      const updated = await prisma.payrollRun.updateMany({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'PENDING_APPROVAL' }, data: { status: 'APPROVED', financeApprovedById: req.auth!.id, financeApprovedAt: new Date() } });
      if (!updated.count) return fail(res, 409, 'PAYROLL_STATE_INVALID', 'Pending payroll approval was not found.');
      await audit(req, 'APPROVE_PAYROLL', `Payroll ${req.params.id} approved. ${body.remarks || ''}`);
      return ok(res, { status: 'APPROVED' });
    } catch (error) { next(error); }
  });

  router.post('/payroll/runs/:id/reject', permit('payroll.approve'), async (req: Req, res, next) => {
    try {
      const body = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
      const updated = await prisma.payrollRun.updateMany({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED' } });
      if (!updated.count) return fail(res, 409, 'PAYROLL_STATE_INVALID', 'Pending payroll approval was not found.');
      await audit(req, 'REJECT_PAYROLL', `Payroll ${req.params.id} rejected: ${body.reason}`);
      return ok(res, { status: 'REJECTED' });
    } catch (error) { next(error); }
  });

  router.post('/payroll/runs/:id/generate-payslips', permit('payroll.approve'), async (req: Req, res, next) => {
    try {
      const run = await prisma.payrollRun.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'APPROVED' }, include: { lines: true } });
      if (!run) return fail(res, 409, 'PAYROLL_STATE_INVALID', 'Only approved payroll can generate payslips.');
      await prisma.$transaction(async tx => {
        for (let index = 0; index < run.lines.length; index++) {
          const line = run.lines[index];
          const breakdown = line.breakdown as Record<string, number>;
          const payslipNumber = `PS-${run.month}-${String(index + 1).padStart(6, '0')}`;
          await tx.payslip.create({ data: {
            companyId: run.companyId, payrollRunId: run.id, employeeId: line.employeeId, month: run.month,
            basicSalary: breakdown.BASIC || 0, hra: breakdown.HRA || 0,
            allowances: Math.max(0, line.grossEarnings - (breakdown.BASIC || 0) - (breakdown.HRA || 0)),
            grossSalary: line.grossEarnings, providentFund: breakdown.PF_EMPLOYEE || 0,
            taxDeductions: (breakdown.TDS || 0) + (breakdown.PROFESSIONAL_TAX || 0),
            otherDeductions: Math.max(0, line.employeeDeductions - (breakdown.PF_EMPLOYEE || 0) - (breakdown.TDS || 0) - (breakdown.PROFESSIONAL_TAX || 0)),
            totalDeductions: line.employeeDeductions, netSalary: line.netPay,
            workingDays: Math.round(line.workingDays), presentDays: Math.round(line.payableDays),
            paidLeaveDays: 0, unpaidDays: Math.round(line.unpaidDays), status: 'GENERATED',
            payslipNumber, breakdown: line.breakdown as Prisma.InputJsonValue, calculationTrace: line.calculationTrace as Prisma.InputJsonValue,
            netPayInWords: numberWords(line.netPay), generatedAt: new Date(),
          } });
        }
        await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAYSLIP_GENERATED' } });
      });
      await audit(req, 'GENERATE_PAYSLIPS', `${run.lines.length} payslips generated for ${run.month}.`);
      return ok(res, { status: 'PAYSLIP_GENERATED', count: run.lines.length });
    } catch (error) { next(error); }
  });
  return router;
}
