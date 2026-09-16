import { Router, type Request, type RequestHandler, type Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { employeeWhere } from './governance.js';

type Auth = { id: string; companyId: string; role: string; employeeId?: string; permissions: string[]; accessScopes?: Array<{ scope: string; scopeEntityId?: string | null; permissions: string[] }> };
type Req = Request & { auth?: Auth; requestId?: string };

export function detectAiIntent(prompt: string) {
  const query = prompt.toLowerCase();
  if (/absent.*yesterday|yesterday.*absent/.test(query)) return 'ABSENT_YESTERDAY';
  if (/repeated.*late|late.*this month/.test(query)) return 'REPEATED_LATE';
  if (/payroll cost|salary cost/.test(query)) return 'PAYROLL_COST';
  if (/attrition|highest.*exit/.test(query)) return 'ATTRITION';
  if (/draft.*(holiday|email|announcement)/.test(query)) return 'DRAFT_ANNOUNCEMENT';
  if (/create|draft/.test(query) && /leave policy/.test(query)) return 'DRAFT_LEAVE_POLICY';
  if (/pending.*approval/.test(query)) return 'APPROVALS';
  if (/headcount|employee count/.test(query)) return 'HEADCOUNT';
  return 'HELP';
}

export function createAiAssistantRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use('/ai', authenticate);
  router.get('/ai/history', async (req: Req, res, next) => { try { res.json({ data: await prisma.aiInteraction.findMany({ where: { companyId: req.auth!.companyId, userId: req.auth!.id }, orderBy: { createdAt: 'desc' }, take: 100 }), meta: { requestId: req.requestId } }); } catch (error) { next(error); } });
  router.post('/ai/ask', async (req: Req, res, next) => { try {
    const auth = req.auth!;
    const { prompt } = z.object({ prompt: z.string().trim().min(3).max(1000) }).parse(req.body);
    const intent = detectAiIntent(prompt);
    const scopedIds = (await prisma.employee.findMany({ where: employeeWhere(auth), select: { id: true } })).map(item => item.id);
    let answer = 'I can answer authorized questions about headcount, absence, repeated late attendance, payroll cost, attrition, and pending approvals. I can also draft announcements and leave policies without publishing them.';
    let sources: Array<{ type: string; id: string }> = [];
    let proposedAction: Prisma.InputJsonObject | undefined;
    if (intent === 'HEADCOUNT') {
      if (!auth.permissions.some(permission => permission.startsWith('employee.read'))) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Employee access is required.');
      const count = await prisma.employee.count({ where: { ...employeeWhere(auth), status: { in: ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE'] } } });
      answer = `Authorized active workforce: ${count}.`; sources = [{ type: 'EMPLOYEE_AGGREGATE', id: auth.companyId }];
    } else if (intent === 'ABSENT_YESTERDAY') {
      if (!auth.permissions.includes('attendance.read.team')) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Team attendance access is required.');
      const date = new Date(); date.setUTCDate(date.getUTCDate() - 1); date.setUTCHours(0, 0, 0, 0);
      const count = await prisma.attendanceRecord.count({ where: { companyId: auth.companyId, employeeId: { in: scopedIds }, date, status: 'ABSENT' } });
      answer = `${count} authorized employees were absent yesterday${scopedIds.length ? `, ${((count / scopedIds.length) * 100).toFixed(1)}% of the visible workforce` : ''}.`; sources = [{ type: 'ATTENDANCE_DATE', id: date.toISOString().slice(0, 10) }];
    } else if (intent === 'REPEATED_LATE') {
      if (!auth.permissions.includes('attendance.read.team')) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Team attendance access is required.');
      const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
      const evaluations = await prisma.attendanceEvaluation.findMany({ where: { lateMinutes: { gt: 0 }, record: { companyId: auth.companyId, employeeId: { in: scopedIds }, date: { gte: start } } }, select: { lateMinutes: true, record: { select: { employeeId: true } } } });
      const totals = [...evaluations.reduce<Map<string, { count: number; minutes: number }>>((map, item) => { const current = map.get(item.record.employeeId) || { count: 0, minutes: 0 }; current.count++; current.minutes += item.lateMinutes; map.set(item.record.employeeId, current); return map; }, new Map()).entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20);
      answer = totals.length ? `${totals.length} employees have late arrivals this month. Top records: ${totals.map(([employeeId, total]) => `${employeeId} (${total.count} times, ${total.minutes} minutes)`).join('; ')}.` : 'No repeated late arrivals were found this month.'; sources = [{ type: 'ATTENDANCE_MONTH', id: start.toISOString().slice(0, 7) }];
    } else if (intent === 'PAYROLL_COST') {
      if (!auth.permissions.includes('payroll.manage')) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Payroll permission is required.');
      const run = await prisma.payrollRun.findFirst({ where: { companyId: auth.companyId }, orderBy: { month: 'desc' } });
      answer = run ? `Payroll cost for ${run.month}: gross INR ${run.totalGrossSalary.toLocaleString('en-IN')}, deductions INR ${run.totalDeductions.toLocaleString('en-IN')}, net INR ${run.totalNetPayout.toLocaleString('en-IN')}.` : 'No payroll run is available.'; sources = run ? [{ type: 'PAYROLL_RUN', id: run.id }] : [];
    } else if (intent === 'ATTRITION') {
      if (!auth.permissions.includes('employee.read.all')) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Company workforce access is required.');
      const exits = await prisma.employee.findMany({ where: { companyId: auth.companyId, status: { in: ['RESIGNED', 'TERMINATED'] } }, select: { department: { select: { name: true } } } });
      const groups = [...exits.reduce<Map<string, number>>((map, item) => map.set(item.department.name, (map.get(item.department.name) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
      answer = groups[0] ? `${groups[0][0]} has the highest recorded exits (${groups[0][1]}).` : 'No exits are recorded.'; sources = [{ type: 'EMPLOYEE_EXIT_AGGREGATE', id: auth.companyId }];
    } else if (intent === 'APPROVALS') {
      if (!auth.permissions.includes('workflow.review')) return fail(res, 403, 'AI_PERMISSION_DENIED', 'Workflow review permission is required.');
      const count = await prisma.workflowInstance.count({ where: { companyId: auth.companyId, status: 'PENDING' } }); answer = `${count} workflow requests are pending review.`; sources = [{ type: 'WORKFLOW_AGGREGATE', id: auth.companyId }];
    } else if (intent === 'DRAFT_ANNOUNCEMENT') {
      answer = 'Draft prepared for review. Nothing has been published.'; proposedAction = { type: 'ANNOUNCEMENT_DRAFT', title: 'Holiday reminder', content: 'Reminder: the office will be closed tomorrow for the scheduled holiday. Please coordinate any urgent coverage with your manager.', requiresApproval: true };
    } else if (intent === 'DRAFT_LEAVE_POLICY') {
      answer = 'A conservative leave-policy draft has been prepared. An HR administrator must review statutory and company-specific requirements before activation.'; proposedAction = { type: 'LEAVE_POLICY_DRAFT', name: 'Annual Leave', code: 'AL', daysAllowedPerYear: 18, accrualFrequency: 'MONTHLY', carryForwardDays: 5, minimumNoticeDays: 3, requiresApproval: true };
    }
    const saved = await prisma.aiInteraction.create({ data: { companyId: auth.companyId, userId: auth.id, prompt, intent, answer, sources, proposedAction } });
    return res.json({ data: { id: saved.id, intent, answer, sources, proposedAction, readOnly: true }, meta: { requestId: req.requestId } });
  } catch (error) { next(error); } });
  return router;
}
