import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';

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
  router.get('/command-center',async(req:Req,res,next)=>{try{const auth=req.auth!;if(!auth.permissions.includes('employee.read.all'))return fail(res,403,'FORBIDDEN','Company-wide workforce access is required.');const now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),month=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;const[active,present,onLeave,pendingApprovals,missingPunches,expiringDocuments,payroll]=await prisma.$transaction([prisma.employee.count({where:{companyId:auth.companyId,status:{in:['ACTIVE','ON_PROBATION']}}}),prisma.attendanceRecord.count({where:{companyId:auth.companyId,date:today,clockInTime:{not:null}}}),prisma.leaveRequest.count({where:{companyId:auth.companyId,status:'APPROVED',startDate:{lte:today},endDate:{gte:today}}}),prisma.workflowInstance.count({where:{companyId:auth.companyId,status:'PENDING'}}),prisma.attendanceRecord.count({where:{companyId:auth.companyId,date:today,clockInTime:{not:null},clockOutTime:null}}),prisma.employeeDocument.count({where:{companyId:auth.companyId,expiryDate:{gte:today,lte:new Date(today.getTime()+7*86_400_000)}}}),prisma.payrollRun.findFirst({where:{companyId:auth.companyId,month},orderBy:{createdAt:'desc'}})]);return ok(res,{metrics:{activeEmployees:active,presentToday:present,absentToday:Math.max(0,active-present-onLeave),onLeaveToday:onLeave},alerts:[{key:'MISSING_PUNCH',severity:'WARNING',count:missingPunches,message:`${missingPunches} employees have an incomplete punch today.`},{key:'DOCUMENT_EXPIRY',severity:'WARNING',count:expiringDocuments,message:`${expiringDocuments} employee documents expire within seven days.`},{key:'PENDING_APPROVAL',severity:'INFO',count:pendingApprovals,message:`${pendingApprovals} requests are awaiting approval.`},{key:'PAYROLL',severity:payroll?'INFO':'WARNING',count:payroll?1:0,message:payroll?`Payroll ${month} is ${payroll.status}.`:`Payroll ${month} has not been started.`}]})}catch(error){next(error)}});
  return router;
}
