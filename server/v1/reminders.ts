import{Router,type Request,type RequestHandler,type Response}from'express';import type{PrismaClient}from'@prisma/client';import{emitNotification}from'./notifications.js';
type Req=Request&{auth?:{id:string;companyId:string;permissions:string[]};requestId?:string};export const daysUntil=(date:Date,now=new Date())=>Math.ceil((date.getTime()-now.getTime())/86_400_000);
export async function runComplianceReminders(prisma:PrismaClient,companyId:string,now=new Date()){
  const until=new Date(now.getTime()+30*86_400_000),since=new Date(now.getTime()-20*60*60_000);
  const [documents,employees]=await prisma.$transaction([
    prisma.employeeDocument.findMany({where:{companyId,expiryDate:{gte:now,lte:until}},include:{employee:{select:{userId:true,firstName:true,lastName:true}}}}),
    prisma.employee.findMany({where:{companyId,probationEndDate:{gte:now,lte:until},userId:{not:null}},select:{id:true,userId:true,firstName:true,lastName:true,probationEndDate:true}})
  ]);
  let emitted=0;
  for(const doc of documents){
    if(!doc.employee.userId)continue;
    const existing=await prisma.notification.findFirst({where:{companyId,userId:doc.employee.userId,eventKey:'DOCUMENT_EXPIRING',entityType:'EmployeeDocument',entityId:doc.id,createdAt:{gte:since}}});
    if(!existing){
      await emitNotification(prisma,{companyId,userId:doc.employee.userId,eventKey:'DOCUMENT_EXPIRING',title:'Document expiring soon',body:`${doc.title} expires in ${daysUntil(doc.expiryDate!,now)} day(s).`,entityType:'EmployeeDocument',entityId:doc.id,actionUrl:'/documents'});
      emitted++;
    }
  }
  for(const employee of employees){
    const existing=await prisma.notification.findFirst({where:{companyId,userId:employee.userId!,eventKey:'PROBATION_ENDING',entityType:'Employee',entityId:employee.id,createdAt:{gte:since}}});
    if(!existing){
      await emitNotification(prisma,{companyId,userId:employee.userId!,eventKey:'PROBATION_ENDING',title:'Probation review approaching',body:`Your probation period ends in ${daysUntil(employee.probationEndDate!,now)} day(s).`,entityType:'Employee',entityId:employee.id,actionUrl:'/profile'});
      emitted++;
    }
  }

  // Statutory Compliance Calendar Reminders
  const obligations = prisma.complianceCalendarObligation
    ? await prisma.complianceCalendarObligation.findMany({
        where: {
          companyId,
          status: { in: ['DUE_SOON', 'DUE_TODAY', 'OVERDUE'] },
        },
      })
    : [];

  for (const obl of obligations) {
    if (!obl.assignedUserId) continue;
    const eventKey = obl.status === 'OVERDUE' ? 'STATUTORY_DEADLINE_OVERDUE' : 'STATUTORY_DEADLINE_APPROACHING';
    const existing = await prisma.notification.findFirst({
      where: { companyId, userId: obl.assignedUserId, eventKey, entityType: 'ComplianceCalendarObligation', entityId: obl.id, createdAt: { gte: since } }
    });
    if (!existing) {
      const days = daysUntil(obl.extendedDueDate || obl.statutoryDueDate, now);
      const title = obl.status === 'OVERDUE' ? `OVERDUE: ${obl.domain} ${obl.obligationType}` : `Statutory deadline approaching: ${obl.domain}`;
      const body = obl.status === 'OVERDUE' ? `${obl.domain} obligation was due ${Math.abs(days)} day(s) ago.` : `${obl.domain} obligation is due in ${days} day(s).`;
      await emitNotification(prisma, {
        companyId,
        userId: obl.assignedUserId,
        eventKey,
        title,
        body,
        entityType: 'ComplianceCalendarObligation',
        entityId: obl.id,
        actionUrl: '/compliance/calendar',
      });
      await prisma.complianceCalendarObligation.update({ where: { id: obl.id }, data: { remindedAt: now } });
      emitted++;
    }
  }

  return {documents:documents.length,probations:employees.length,obligations:obligations.length,emitted};
}
export function createReminderRouter(prisma:PrismaClient,authenticate:RequestHandler){const router=Router();router.post('/notifications/jobs/compliance-reminders',authenticate,async(req:Req,res:Response,next)=>{try{if(!req.auth!.permissions.includes('notification.manage'))return res.status(403).json({error:{code:'FORBIDDEN',message:'Notification management permission is required.'}});return res.json({data:await runComplianceReminders(prisma,req.auth!.companyId),meta:{requestId:req.requestId}})}catch(e){next(e)}});return router}
