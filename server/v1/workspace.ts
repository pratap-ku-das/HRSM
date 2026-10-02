import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { reconcileMidnightAbsentMissingClockOut } from './attendancePolicies.js';

type Req=Request&{auth?:{id:string;companyId:string;role:string;employeeId?:string;permissions:string[];accessScopes?:Array<{scope:string;scopeEntityId?:string|null;permissions:string[]}>};requestId?:string};
export function createWorkspaceRouter(prisma:PrismaClient,authenticate:RequestHandler){
  const router=Router();
  const ok=(res:Response,data:unknown)=>res.json({data,meta:{requestId:(res.req as Req).requestId}});
  const fail=(res:Response,status:number,code:string,message:string)=>res.status(status).json({error:{code,message}});
  router.use(authenticate);
  router.get('/employees/:id/360',async(req:Req,res,next)=>{try{
    const auth=req.auth!,targetId=String(req.params.id);
    if(!auth.permissions.some(permission=>['employee.read.all','employee.read.team','employee.read.self'].includes(permission)))return fail(res,403,'FORBIDDEN','You do not have permission to view employee profiles.');
    const scopes:Record<string,unknown>[]=[];
    if(['SUPER_ADMIN','COMPANY_ADMIN','HR_MANAGER','PAYROLL_ADMIN'].includes(auth.role))scopes.push({companyId:auth.companyId});
    if(auth.employeeId){scopes.push({id:auth.employeeId});if(auth.permissions.includes('employee.read.team'))scopes.push({reportingManagerId:auth.employeeId})}
    for(const grant of auth.accessScopes||[]){if(!grant.permissions.some(permission=>permission.startsWith('employee.read')))continue;if(grant.scope==='ALL_COMPANY')scopes.push({companyId:auth.companyId});if(grant.scope==='BRANCH'&&grant.scopeEntityId)scopes.push({branchId:grant.scopeEntityId});if(grant.scope==='DEPARTMENT'&&grant.scopeEntityId)scopes.push({departmentId:grant.scopeEntityId});if(grant.scope==='TEAM'&&grant.scopeEntityId)scopes.push({teamId:grant.scopeEntityId})}
    const employee=await prisma.employee.findFirst({where:{id:targetId,companyId:auth.companyId,OR:scopes},include:{department:true,designation:true,branch:true,location:true,team:true,costCenter:true,employeeGrade:true,reportingManager:{select:{id:true,firstName:true,lastName:true,employeeCode:true}}}});
    if(!employee)return fail(res,404,'EMPLOYEE_NOT_FOUND','Employee was not found within your access scope.');
    const [attendance,leave,payslips,assets,expenses,goals,revisions]=await prisma.$transaction([
      prisma.attendanceRecord.findMany({where:{companyId:auth.companyId,employeeId:employee.id},include:{evaluation:true},orderBy:{date:'desc'},take:100}),
      prisma.leaveRequest.findMany({where:{companyId:auth.companyId,employeeId:employee.id},include:{leaveType:true},orderBy:{appliedAt:'desc'},take:100}),
      prisma.payslip.findMany({where:{companyId:auth.companyId,employeeId:employee.id},orderBy:{month:'desc'},take:36}),
      prisma.asset.findMany({where:{companyId:auth.companyId,assignedToEmployeeId:employee.id},orderBy:{assignedDate:'desc'}}),
      prisma.expenseClaim.findMany({where:{companyId:auth.companyId,employeeId:employee.id},orderBy:{submittedAt:'desc'},take:100}),
      prisma.performanceGoal.findMany({where:{companyId:auth.companyId,employeeId:employee.id},orderBy:{targetDate:'desc'},take:100}),
      prisma.employeeSalaryRevision.findMany({where:{companyId:auth.companyId,employeeId:employee.id},orderBy:{effectiveFrom:'desc'},take:20}),
    ]);
    const requests=employee.userId?await prisma.workflowInstance.findMany({where:{companyId:auth.companyId,requesterUserId:employee.userId},orderBy:{submittedAt:'desc'},take:100}):[];
    const timeline=[...attendance.flatMap(item=>[{id:`attendance-${item.id}-in`,at:item.clockInTime||item.date,type:'ATTENDANCE',title:item.clockInTime?'Clocked in':item.status,detail:item.status},...(item.clockOutTime?[{id:`attendance-${item.id}-out`,at:item.clockOutTime,type:'ATTENDANCE',title:'Clocked out',detail:item.status}]:[])]),...leave.map(item=>({id:`leave-${item.id}`,at:item.appliedAt,type:'LEAVE',title:`${item.leaveType.name} leave`,detail:item.status})),...expenses.map(item=>({id:`expense-${item.id}`,at:item.submittedAt,type:'EXPENSE',title:item.title,detail:item.status})),...revisions.map(item=>({id:`salary-${item.id}`,at:item.effectiveFrom,type:'SALARY',title:'Salary revision',detail:item.status})),...requests.map(item=>({id:`request-${item.id}`,at:item.submittedAt,type:'REQUEST',title:item.title,detail:item.status}))].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,200);
    return ok(res,{employee,attendance,leave,payslips,assets,expenses,goals,revisions,requests,timeline});
  }catch(error){next(error)}});
  router.get('/command-center', async (req: Req, res, next) => {
    try {
      const auth = req.auth!;
      if (!auth.permissions.includes('employee.read.all')) return fail(res, 403, 'FORBIDDEN', 'Company-wide workforce access is required.');
      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      
      const preSettings = await prisma.companySettings.findUnique({ where: { companyId: auth.companyId } });
      const rawTz = preSettings?.timezone || 'Asia/Kolkata';
      const tz = rawTz.split(/[\s(]/)[0] || 'Asia/Kolkata';
      const localDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      const today = new Date(`${localDateStr}T00:00:00.000Z`);

      await reconcileMidnightAbsentMissingClockOut(prisma, auth.companyId);

      const [active, attendanceToday, onLeave, pendingApprovals, missingPunches, expiringDocuments, payroll, policy] = await prisma.$transaction([
        prisma.employee.count({ where: { companyId: auth.companyId, status: { in: ['ACTIVE', 'ON_PROBATION'] } } }),
        prisma.attendanceRecord.findMany({
          where: { companyId: auth.companyId, date: today, clockInTime: { not: null } },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
                avatarUrl: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { clockInTime: 'asc' },
        }),
        prisma.leaveRequest.count({ where: { companyId: auth.companyId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } }),
        prisma.workflowInstance.count({ where: { companyId: auth.companyId, status: 'PENDING' } }),
        prisma.attendanceRecord.count({ where: { companyId: auth.companyId, date: today, clockInTime: { not: null }, clockOutTime: null } }),
        prisma.employeeDocument.count({ where: { companyId: auth.companyId, expiryDate: { gte: today, lte: new Date(today.getTime() + 7 * 86_400_000) } } }),
        prisma.payrollRun.findFirst({ where: { companyId: auth.companyId, month }, orderBy: { createdAt: 'desc' } }),
        prisma.attendancePolicy.findFirst({ where: { companyId: auth.companyId }, orderBy: { effectiveFrom: 'desc' } }),
      ]);

      const [startH, startM] = (preSettings?.businessHoursStart || '10:00').split(':').map(Number);
      const startTotalMinutes = (isNaN(startH) ? 10 : startH) * 60 + (isNaN(startM) ? 0 : startM);
      const graceMinutes = policy?.graceInMinutes ?? 60;
      const cutoffMinutes = startTotalMinutes + graceMinutes;

      const lateCutoffH = Math.floor(cutoffMinutes / 60) % 24;
      const lateCutoffM = cutoffMinutes % 60;
      const lateThresholdFormatted = `${String(lateCutoffH).padStart(2, '0')}:${String(lateCutoffM).padStart(2, '0')}`;

      const lateEntries: Array<{
        id: string;
        employeeId: string;
        employeeName: string;
        employeeCode: string;
        department: string;
        avatarUrl?: string | null;
        clockInTime: string;
        clockInFormatted: string;
        lateMinutes: number;
        status: string;
      }> = [];

      let lateCount = 0;
      let onTimeCount = 0;

      for (const record of attendanceToday) {
        let isLate = record.status === 'LATE';
        let lateMinutes = 0;
        let formattedTime = '';

        if (record.clockInTime) {
          const clockInDate = new Date(record.clockInTime);
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
          }).formatToParts(clockInDate);
          const inH = Number(parts.find(p => p.type === 'hour')?.value ?? clockInDate.getHours());
          const inM = Number(parts.find(p => p.type === 'minute')?.value ?? clockInDate.getMinutes());
          const inTotalMinutes = inH * 60 + inM;

          if (inTotalMinutes > cutoffMinutes) {
            isLate = true;
          }
          if (inTotalMinutes > startTotalMinutes) {
            lateMinutes = inTotalMinutes - startTotalMinutes;
          }

          formattedTime = new Intl.DateTimeFormat('en-IN', {
            timeZone: tz,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(clockInDate);
        }

        if (isLate) {
          lateCount++;
          lateEntries.push({
            id: record.id,
            employeeId: record.employeeId,
            employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
            employeeCode: record.employee.employeeCode,
            department: record.employee.department?.name || 'General',
            avatarUrl: record.employee.avatarUrl,
            clockInTime: record.clockInTime ? record.clockInTime.toISOString() : '',
            clockInFormatted: formattedTime || 'Late entry',
            lateMinutes: lateMinutes > 0 ? lateMinutes : Math.max(1, cutoffMinutes - startTotalMinutes),
            status: 'LATE',
          });
        } else {
          onTimeCount++;
        }
      }

      const totalPresent = attendanceToday.length;
      const totalAbsent = Math.max(0, active - totalPresent - onLeave);

      const alerts = [
        ...(lateCount > 0 ? [{
          key: 'LATE_ENTRY',
          severity: 'WARNING' as const,
          count: lateCount,
          message: `${lateCount} ${lateCount === 1 ? 'employee clocked in late today' : 'employees clocked in late today'} (after ${lateThresholdFormatted}).`,
        }] : []),
        { key: 'MISSING_PUNCH', severity: 'WARNING' as const, count: missingPunches, message: `${missingPunches} employees have an incomplete punch today.` },
        { key: 'DOCUMENT_EXPIRY', severity: 'WARNING' as const, count: expiringDocuments, message: `${expiringDocuments} employee documents expire within seven days.` },
        { key: 'PENDING_APPROVAL', severity: 'INFO' as const, count: pendingApprovals, message: `${pendingApprovals} requests are awaiting approval.` },
        { key: 'PAYROLL', severity: payroll ? ('INFO' as const) : ('WARNING' as const), count: payroll ? 1 : 0, message: payroll ? `Payroll ${month} is ${payroll.status}.` : `Payroll ${month} has not been started.` },
      ];

      return ok(res, {
        metrics: {
          activeEmployees: active,
          presentToday: totalPresent,
          onTimeToday: onTimeCount,
          lateToday: lateCount,
          absentToday: totalAbsent,
          onLeaveToday: onLeave,
        },
        alerts,
        lateEntries,
        workSchedule: {
          businessHoursStart: preSettings?.businessHoursStart || '10:00',
          lateThresholdTime: lateThresholdFormatted,
          timezone: tz,
        },
      });
    } catch (error) { next(error); }
  });
  return router;
}
