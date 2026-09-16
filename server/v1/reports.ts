import { Router, type Request, type RequestHandler, type Response } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { zipSync, strToU8 } from 'fflate';
import { jsPDF } from 'jspdf';
import { employeeWhere } from './governance.js';

type Auth = {
  id: string;
  companyId: string;
  role: string;
  employeeId?: string;
  permissions: string[];
  accessScopes?: Array<{ scope: string; scopeEntityId?: string | null; permissions: string[] }>;
};
type Req = Request & { auth?: Auth; requestId?: string };
type Row = Record<string, unknown>;
type ReportDefinition = readonly [key: string, name: string, permission: string];

export const reportDefinitions: readonly ReportDefinition[] = [
  ['WORKFORCE_HEADCOUNT', 'Headcount register', 'employee.read.all'],
  ['WORKFORCE_ATTRITION', 'Attrition by department', 'employee.read.all'],
  ['WORKFORCE_NEW_HIRES', 'New hires', 'employee.read.all'],
  ['WORKFORCE_EXITS', 'Employee exits', 'employee.read.all'],
  ['WORKFORCE_DEPARTMENTS', 'Department distribution', 'employee.read.all'],
  ['WORKFORCE_DEMOGRAPHICS', 'Gender and age distribution', 'employee.read.all'],
  ['WORKFORCE_EMPLOYMENT_TYPES', 'Employment type distribution', 'employee.read.all'],
  ['ATTENDANCE_SUMMARY', 'Attendance summary', 'attendance.read.team'],
  ['ATTENDANCE_LATE', 'Late arrivals', 'attendance.read.team'],
  ['ATTENDANCE_ABSENCE', 'Absence report', 'attendance.read.team'],
  ['ATTENDANCE_OVERTIME', 'Overtime report', 'attendance.read.team'],
  ['ATTENDANCE_SHIFTS', 'Shift assignments', 'attendance.read.team'],
  ['LEAVE_UTILIZATION', 'Leave utilization', 'leave.review'],
  ['LEAVE_DEPARTMENTS', 'Department-wise leave', 'leave.review'],
  ['LEAVE_TRENDS', 'Leave trends', 'leave.review'],
  ['LEAVE_BALANCES', 'Leave balances', 'leave.review'],
  ['PAYROLL_SUMMARY', 'Payroll summary', 'payroll.manage'],
  ['PAYROLL_DEPARTMENT_COST', 'Department salary cost', 'payroll.manage'],
  ['PAYROLL_EMPLOYER_CONTRIBUTION', 'Employer contribution', 'payroll.manage'],
  ['PAYROLL_TAX', 'Tax and professional tax', 'payroll.manage'],
  ['PAYROLL_PF', 'Provident fund', 'payroll.manage'],
  ['PAYROLL_ESI', 'Employee state insurance', 'payroll.manage'],
  ['PAYROLL_TREND', 'Salary trend', 'payroll.manage'],
  ['RECRUITMENT_FUNNEL', 'Hiring funnel', 'recruitment.manage'],
  ['RECRUITMENT_TIME_TO_HIRE', 'Time to hire', 'recruitment.manage'],
  ['RECRUITMENT_SOURCE_EFFECTIVENESS', 'Source effectiveness', 'recruitment.manage'],
  ['RECRUITMENT_OPEN_POSITIONS', 'Open positions', 'recruitment.manage'],
  ['PERFORMANCE_GOALS', 'Goal completion', 'goal.manage.team'],
  ['PERFORMANCE_DISTRIBUTION', 'Performance distribution', 'performance.review'],
  ['PERFORMANCE_DEPARTMENTS', 'Department performance', 'performance.review'],
];

const definition = (key: string) => reportDefinitions.find(item => item[0] === key);
const group = <T>(values: T[], key: (value: T) => string) => values.reduce<Record<string, T[]>>((all, value) => {
  (all[key(value)] ||= []).push(value);
  return all;
}, {});
const sum = <T>(values: T[], value: (item: T) => number) => values.reduce((total, item) => total + value(item), 0);
const asObject = (value: Prisma.JsonValue): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const dateRange = (filters: Record<string, unknown>) => ({
  from: typeof filters.from === 'string' ? new Date(filters.from) : undefined,
  to: typeof filters.to === 'string' ? new Date(filters.to) : undefined,
});
const between = (date: Date, range: { from?: Date; to?: Date }) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
const ageBand = (birth: Date | null, now = new Date()) => {
  if (!birth) return 'UNSPECIFIED';
  const age = Math.floor((now.getTime() - birth.getTime()) / 31_556_952_000);
  return age < 25 ? 'UNDER_25' : age < 35 ? '25_34' : age < 45 ? '35_44' : age < 55 ? '45_54' : '55_PLUS';
};

export async function reportRows(prisma: PrismaClient, auth: Auth, key: string, filters: Record<string, unknown> = {}): Promise<Row[]> {
  const def = definition(key);
  if (!def || !auth.permissions.includes(def[2])) throw Object.assign(new Error('This report is not available to your role.'), { status: 403, code: 'REPORT_FORBIDDEN' });
  const scopedEmployees = await prisma.employee.findMany({
    where: employeeWhere(auth),
    select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true, employmentType: true, dateOfBirth: true, gender: true, dateOfJoining: true, resignationDate: true, lastWorkingDay: true, departmentId: true, department: { select: { name: true } }, designation: { select: { title: true } } },
    orderBy: { employeeCode: 'asc' },
  });
  const scopedIds = scopedEmployees.map(employee => employee.id);
  const range = dateRange(filters);
  const dateFilter = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined;

  if (key.startsWith('WORKFORCE_')) {
    const active = scopedEmployees.filter(employee => ['ACTIVE', 'ON_PROBATION', 'ON_LEAVE'].includes(employee.status));
    const exits = scopedEmployees.filter(employee => ['RESIGNED', 'TERMINATED'].includes(employee.status));
    if (key === 'WORKFORCE_ATTRITION') {
      return Object.entries(group(scopedEmployees, employee => employee.department.name)).map(([department, employees]) => {
        const departmentExits = employees.filter(employee => ['RESIGNED', 'TERMINATED'].includes(employee.status)).length;
        return { department, headcount: employees.length, exits: departmentExits, attritionPercent: employees.length ? Number((departmentExits * 100 / employees.length).toFixed(2)) : 0 };
      });
    }
    if (key === 'WORKFORCE_NEW_HIRES') return scopedEmployees.filter(employee => between(employee.dateOfJoining, range));
    if (key === 'WORKFORCE_EXITS') return exits.filter(employee => !employee.lastWorkingDay || between(employee.lastWorkingDay, range));
    if (key === 'WORKFORCE_DEPARTMENTS') return Object.entries(group(active, employee => employee.department.name)).map(([department, employees]) => ({ department, headcount: employees.length }));
    if (key === 'WORKFORCE_DEMOGRAPHICS') return Object.entries(group(active, employee => `${employee.gender || 'UNSPECIFIED'}|${ageBand(employee.dateOfBirth)}`)).map(([bucket, employees]) => { const [gender, age] = bucket.split('|'); return { gender, ageBand: age, headcount: employees.length }; });
    if (key === 'WORKFORCE_EMPLOYMENT_TYPES') return Object.entries(group(active, employee => employee.employmentType)).map(([employmentType, employees]) => ({ employmentType, headcount: employees.length }));
    return active;
  }

  if (key.startsWith('ATTENDANCE_')) {
    if (key === 'ATTENDANCE_SHIFTS') {
      const assignments = await prisma.shiftAssignment.findMany({ where: { companyId: auth.companyId, employeeId: { in: scopedIds } }, include: { shiftTemplate: true }, orderBy: { startsOn: 'desc' } });
      return assignments.map(item => ({ employeeId: item.employeeId, startsOn: item.startsOn, endsOn: item.endsOn, shiftName: item.shiftTemplate.name, shiftCode: item.shiftTemplate.code, shiftType: item.shiftTemplate.type, startMinute: item.shiftTemplate.startMinute, endMinute: item.shiftTemplate.endMinute, crossesMidnight: item.shiftTemplate.crossesMidnight }));
    }
    const records = await prisma.attendanceRecord.findMany({ where: { companyId: auth.companyId, employeeId: { in: scopedIds }, ...(dateFilter ? { date: dateFilter } : {}) }, include: { evaluation: true }, orderBy: { date: 'desc' }, take: 10_000 });
    const flattened = records.map(item => ({ employeeId: item.employeeId, date: item.date, status: item.status, clockInTime: item.clockInTime, clockOutTime: item.clockOutTime, workedMinutes: item.evaluation?.workedMinutes ?? 0, lateMinutes: item.evaluation?.lateMinutes ?? 0, earlyExitMinutes: item.evaluation?.earlyExitMinutes ?? 0, overtimeMinutes: item.evaluation?.overtimeMinutes ?? 0, flags: item.evaluation?.flags.join(', ') ?? '' }));
    if (key === 'ATTENDANCE_LATE') return flattened.filter(item => item.lateMinutes > 0);
    if (key === 'ATTENDANCE_ABSENCE') return flattened.filter(item => item.status === 'ABSENT');
    if (key === 'ATTENDANCE_OVERTIME') return flattened.filter(item => item.overtimeMinutes > 0);
    return flattened;
  }

  if (key.startsWith('LEAVE_')) {
    const requests = await prisma.leaveRequest.findMany({ where: { companyId: auth.companyId, employeeId: { in: scopedIds }, ...(dateFilter ? { startDate: dateFilter } : {}) }, include: { leaveType: { select: { name: true, daysAllowedPerYear: true, carryForwardDays: true } }, employee: { select: { department: { select: { name: true } } } } }, orderBy: { startDate: 'desc' } });
    if (key === 'LEAVE_BALANCES') return Object.values(group(requests, request => `${request.employeeId}:${request.leaveTypeId}`)).map(items => { const first = items[0]; const used = sum(items.filter(item => ['PENDING', 'APPROVED'].includes(item.status)), item => item.totalDays); const entitlement = first.leaveType.daysAllowedPerYear + first.leaveType.carryForwardDays; return { employeeId: first.employeeId, leaveType: first.leaveType.name, entitlement, used, available: entitlement - used }; });
    if (key === 'LEAVE_TRENDS') return Object.entries(group(requests, request => request.startDate.toISOString().slice(0, 7))).map(([month, items]) => ({ month, requests: items.length, days: sum(items, item => item.totalDays) }));
    if (key === 'LEAVE_DEPARTMENTS') return Object.entries(group(requests, request => request.employee.department.name)).map(([department, items]) => ({ department, requests: items.length, approvedDays: sum(items.filter(item => item.status === 'APPROVED'), item => item.totalDays) }));
    return requests.map(item => ({ employeeId: item.employeeId, leaveType: item.leaveType.name, department: item.employee.department.name, startDate: item.startDate, endDate: item.endDate, days: item.totalDays, status: item.status }));
  }

  if (key.startsWith('PAYROLL_')) {
    const runs = await prisma.payrollRun.findMany({ where: { companyId: auth.companyId }, include: { lines: true }, orderBy: { month: 'desc' } });
    if (key === 'PAYROLL_DEPARTMENT_COST') { const departments = new Map(scopedEmployees.map(employee => [employee.id, employee.department.name])); return runs.flatMap(run => Object.entries(group(run.lines, line => departments.get(line.employeeId) || 'Unknown')).map(([department, lines]) => ({ month: run.month, department, gross: sum(lines, line => line.grossEarnings), employerContribution: sum(lines, line => line.employerContributions), net: sum(lines, line => line.netPay) }))); }
    if (key === 'PAYROLL_EMPLOYER_CONTRIBUTION') return runs.map(run => ({ month: run.month, employerContribution: sum(run.lines, line => line.employerContributions), employees: run.lines.length }));
    const statutory = (codes: string[]) => runs.flatMap(run => run.lines.map(line => ({ month: run.month, employeeId: line.employeeId, ...Object.fromEntries(codes.map(code => [code, numberValue(asObject(line.breakdown)[code])])) })));
    if (key === 'PAYROLL_TAX') return statutory(['TDS', 'PROFESSIONAL_TAX', 'LWF_EMPLOYEE', 'LWF_EMPLOYER']);
    if (key === 'PAYROLL_PF') return statutory(['PF_EMPLOYEE', 'PF_EMPLOYER']);
    if (key === 'PAYROLL_ESI') return statutory(['ESI_EMPLOYEE', 'ESI_EMPLOYER']);
    return runs.map(run => ({ month: run.month, status: run.status, totalEmployees: run.totalEmployees, totalGross: run.totalGrossSalary, employerContribution: sum(run.lines, line => line.employerContributions), totalDeductions: run.totalDeductions, totalNet: run.totalNetPayout }));
  }

  if (key.startsWith('RECRUITMENT_')) {
    if (key === 'RECRUITMENT_OPEN_POSITIONS') return prisma.jobPosting.findMany({ where: { companyId: auth.companyId, status: 'OPEN' }, select: { title: true, department: { select: { name: true } }, location: true, applicantCount: true, postedAt: true } });
    const applicants = await prisma.jobApplicant.findMany({ where: { companyId: auth.companyId }, include: { jobPosting: { select: { title: true } } } });
    if (key === 'RECRUITMENT_TIME_TO_HIRE') return applicants.filter(item => item.hiredAt).map(item => ({ candidate: item.fullName, position: item.jobPosting.title, appliedAt: item.appliedAt, hiredAt: item.hiredAt, daysToHire: Math.ceil((item.hiredAt!.getTime() - item.appliedAt.getTime()) / 86_400_000) }));
    if (key === 'RECRUITMENT_SOURCE_EFFECTIVENESS') return Object.entries(group(applicants, item => item.source || 'UNSPECIFIED')).map(([source, items]) => ({ source, applicants: items.length, hired: items.filter(item => item.stage === 'HIRED').length, conversionPercent: items.length ? Number((items.filter(item => item.stage === 'HIRED').length * 100 / items.length).toFixed(2)) : 0 }));
    return Object.entries(group(applicants, item => item.stage)).map(([stage, items]) => ({ stage, candidates: items.length }));
  }

  if (key === 'PERFORMANCE_GOALS') return prisma.performanceGoal.findMany({ where: { companyId: auth.companyId, employeeId: { in: scopedIds } }, select: { employeeId: true, title: true, category: true, targetDate: true, progress: true, status: true }, orderBy: { targetDate: 'desc' } });
  const reviews = await prisma.performanceReview.findMany({ where: { companyId: auth.companyId, employeeId: { in: scopedIds }, overallRating: { not: null } }, include: { employee: { select: { department: { select: { name: true } } } }, cycle: { select: { name: true } } } });
  if (key === 'PERFORMANCE_DISTRIBUTION') return Object.entries(group(reviews, review => `${Math.round(review.overallRating || 0)} STAR`)).map(([rating, items]) => ({ rating, reviews: items.length }));
  return Object.entries(group(reviews, review => review.employee.department.name)).map(([department, items]) => ({ department, reviews: items.length, averageRating: Number((sum(items, item => item.overallRating || 0) / items.length).toFixed(2)) }));
}

const flat = (value: unknown) => value instanceof Date ? value.toISOString() : value && typeof value === 'object' ? JSON.stringify(value) : value ?? '';
const xml = (value: unknown) => String(flat(value)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columnName = (index: number) => { let result = ''; for (index++; index; index = Math.floor((index - 1) / 26)) result = String.fromCharCode(65 + (index - 1) % 26) + result; return result; };

export function renderReport(rows: Row[], format: 'CSV' | 'XLSX' | 'PDF') {
  const headers = [...new Set(rows.flatMap(Object.keys))];
  if (format === 'CSV') { const cell = (value: unknown) => `"${String(flat(value)).replace(/"/g, '""')}"`; return { mime: 'text/csv; charset=utf-8', extension: 'csv', bytes: Buffer.from('\uFEFF' + [headers.map(cell).join(','), ...rows.map(row => headers.map(header => cell(row[header])).join(','))].join('\r\n')) }; }
  if (format === 'PDF') { const doc = new jsPDF({ orientation: 'landscape' }); const lines = [headers.join(' | '), ...rows.map(row => headers.map(header => String(flat(row[header]))).join(' | '))]; let y = 12; doc.setFontSize(7); for (const line of lines) { const wrapped = doc.splitTextToSize(line, 275); if (y + wrapped.length * 4 > 195) { doc.addPage(); y = 12; } doc.text(wrapped, 10, y); y += wrapped.length * 4; } return { mime: 'application/pdf', extension: 'pdf', bytes: Buffer.from(doc.output('arraybuffer')) }; }
  const all = [headers, ...rows.map(row => headers.map(header => row[header]))];
  const sheet = all.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => typeof value === 'number' ? `<c r="${columnName(columnIndex)}${rowIndex + 1}"><v>${value}</v></c>` : `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`).join('')}</row>`).join('');
  const files = { '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'), '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'), 'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OrbitHR Report" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`) };
  return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', bytes: Buffer.from(zipSync(files, { level: 6 })) };
}

export function createReportRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  router.use('/reports', authenticate);
  router.get('/reports/catalog', (req: Req, res) => res.json({ data: reportDefinitions.filter(item => req.auth!.permissions.includes(item[2])).map(([key, name]) => ({ key, name })), meta: { requestId: req.requestId } }));
  router.get('/reports/exports/history', async (req: Req, res, next) => { try { res.json({ data: await prisma.reportExport.findMany({ where: { companyId: req.auth!.companyId, userId: req.auth!.id }, orderBy: { createdAt: 'desc' }, take: 100 }), meta: { requestId: req.requestId } }); } catch (error) { next(error); } });
  router.get('/reports/:key', async (req: Req, res, next) => { try { const filters = z.record(z.string(), z.unknown()).parse(req.query); const key = String(req.params.key).toUpperCase(); const rows = await reportRows(prisma, req.auth!, key, filters); res.json({ data: { key, rows, truncated: false }, meta: { requestId: req.requestId } }); } catch (error) { next(error); } });
  router.post('/reports/:key/exports', async (req: Req, res, next) => { try { const body = z.object({ format: z.enum(['CSV', 'XLSX', 'PDF']), filters: z.record(z.string(), z.unknown()).default({}) }).parse(req.body); const key = String(req.params.key).toUpperCase(); const rows = await reportRows(prisma, req.auth!, key, body.filters); const record = await prisma.reportExport.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, reportKey: key, format: body.format, filters: body.filters as Prisma.InputJsonValue, status: 'COMPLETED', rowCount: rows.length, completedAt: new Date() } }); const file = renderReport(rows, body.format); await prisma.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action: 'REPORT_EXPORTED', category: 'DATA_EXPORT', details: `${key} ${body.format} export ${record.id} generated with ${rows.length} rows.`, ipAddress: req.ip || 'unknown' } }); res.setHeader('content-type', file.mime); res.setHeader('content-disposition', `attachment; filename="orbithr-${key.toLowerCase()}-${record.id}.${file.extension}"`); res.setHeader('x-report-export-id', record.id); return res.send(file.bytes); } catch (error) { next(error); } });
  return router;
}
