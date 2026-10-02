import{Router,type Request,type RequestHandler,type Response}from'express';import type{Prisma,PrismaClient}from'@prisma/client';import{z}from'zod';
import { generatePayslipPdfBuffer, generateForm16PdfBuffer, generateExitSettlementPdfBuffer } from './pdfGenerators.js';
import { calculateFullAndFinalSettlement, calculateGratuity, calculateSettlementLeaveEncashment, calculateNoticePeriodShortfall } from './settlementEngine.js';
type Req=Request&{auth?:{id:string;companyId:string;role:string;employeeId?:string;permissions:string[]};requestId?:string};const uuid=z.string().trim().min(3).max(64);const fy=z.string().regex(/^\d{4}-\d{2}$/);const objectKey=z.string().trim().min(3).max(500).regex(/^[a-zA-Z0-9/_\-.]+$/);
export function createPayrollComplianceRouter(prisma:PrismaClient,authenticate:RequestHandler){const router=Router(),ok=(res:Response,data:unknown,status=200)=>res.status(status).json({data,meta:{requestId:(res.req as Req).requestId}}),fail=(res:Response,status:number,code:string,message:string)=>res.status(status).json({error:{code,message}}),permit=(p:string):RequestHandler=>(req:Req,res,next)=>req.auth?.permissions.includes(p)?next():fail(res,403,'FORBIDDEN','You do not have permission to perform this action.'),audit=(req:Req,action:string,details:string)=>prisma.auditLog.create({data:{companyId:req.auth!.companyId,userId:req.auth!.id,userName:req.auth!.id,userRole:req.auth!.role,action,category:'PAYROLL_COMPLIANCE',details,ipAddress:req.ip||'unknown'}});
router.use('/me/payroll',authenticate);
router.get('/me/payroll/tax-declarations',async(req:Req,res,next)=>{try{if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');return ok(res,await prisma.taxDeclaration.findMany({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId},include:{proofs:true},orderBy:{financialYear:'desc'}}))}catch(e){next(e)}});
router.put('/me/payroll/tax-declarations/:financialYear',async(req:Req,res,next)=>{try{if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');const financialYear=fy.parse(req.params.financialYear),body=z.object({regime:z.enum(['OLD','NEW']).default('NEW'),declarations:z.record(z.string(),z.number().min(0).max(100000000))}).parse(req.body),totalDeclared=Object.values(body.declarations).reduce((a,b)=>a+b,0);const value=await prisma.taxDeclaration.upsert({where:{employeeId_financialYear:{employeeId:req.auth!.employeeId,financialYear}},create:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,financialYear,...body,totalDeclared},update:{...body,totalDeclared,status:'DRAFT',submittedAt:null}});return ok(res,value)}catch(e){next(e)}});
router.post('/me/payroll/tax-declarations/:id/submit',async(req:Req,res,next)=>{try{if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');const updated=await prisma.taxDeclaration.updateMany({where:{id:String(req.params.id),companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,status:'DRAFT'},data:{status:'SUBMITTED',submittedAt:new Date()}});if(!updated.count)return fail(res,409,'DECLARATION_STATE_INVALID','Draft declaration was not found.');return ok(res,{status:'SUBMITTED'})}catch(e){next(e)}});
router.post('/me/payroll/tax-declarations/:id/proofs',async(req:Req,res,next)=>{try{if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');const body=z.object({category:z.string().trim().min(2).max(100),amount:z.number().positive(),documentKey:objectKey}).parse(req.body),declaration=await prisma.taxDeclaration.findFirst({where:{id:String(req.params.id),companyId:req.auth!.companyId,employeeId:req.auth!.employeeId}});if(!declaration)return fail(res,404,'DECLARATION_NOT_FOUND','Tax declaration was not found.');return ok(res,await prisma.investmentProof.create({data:{...body,declarationId:declaration.id}}),201)}catch(e){next(e)}});
router.get('/me/payroll/form16',async(req:Req,res,next)=>{try{if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');return ok(res,await prisma.form16Document.findMany({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,publishedAt:{not:null}},orderBy:{financialYear:'desc'}}))}catch(e){next(e)}});
router.get('/me/payroll/form16/:id/file',async(req:Req,res,next)=>{
  try{
    if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');
    const form16=await prisma.form16Document.findFirst({
      where:{id:String(req.params.id),companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,publishedAt:{not:null}},
    });
    if(!form16)return fail(res,404,'DOCUMENT_NOT_FOUND','Form 16 document was not found or is not published.');
    const [company,settings,employee,taxDeclaration]=await Promise.all([
      prisma.company.findUnique({where:{id:req.auth!.companyId}}),
      prisma.companySettings.findUnique({where:{companyId:req.auth!.companyId}}),
      prisma.employee.findUnique({where:{id:req.auth!.employeeId}}),
      prisma.taxDeclaration.findFirst({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,financialYear:form16.financialYear}}),
    ]);
    if(!employee||!company)return fail(res,404,'ENTITY_NOT_FOUND','Employee or company record not found.');
    const buffer=generateForm16PdfBuffer({
      company:{name:company.name,address:company.address},
      settings:{legalEntityName:settings?.legalEntityName||company.name,panNumber:settings?.panNumber,tanNumber:settings?.tanNumber},
      employee:{firstName:employee.firstName,lastName:employee.lastName,employeeCode:employee.employeeCode,bankDetails:(employee as any).bankDetails},
      form16:{financialYear:form16.financialYear,generatedAt:form16.generatedAt,publishedAt:form16.publishedAt},
      taxDetails:{chapterVIA:taxDeclaration?.totalVerified||150000},
    });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`inline; filename="Form16-${form16.financialYear}.pdf"`);
    return res.send(buffer);
  }catch(e){next(e)}
});
router.get('/me/payroll/payslips/:id/pdf',async(req:Req,res,next)=>{
  try{
    if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked.');
    const payslip=await prisma.payslip.findFirst({
      where:{id:String(req.params.id),companyId:req.auth!.companyId,employeeId:req.auth!.employeeId},
    });
    if(!payslip)return fail(res,404,'PAYSLIP_NOT_FOUND','Payslip was not found.');
    const [company,settings,employee]=await Promise.all([
      prisma.company.findUnique({where:{id:req.auth!.companyId}}),
      prisma.companySettings.findUnique({where:{companyId:req.auth!.companyId}}),
      prisma.employee.findUnique({where:{id:req.auth!.employeeId},include:{department:true,designation:true}}),
    ]);
    if(!employee||!company)return fail(res,404,'ENTITY_NOT_FOUND','Employee or company record not found.');
    const buffer=generatePayslipPdfBuffer({
      company:{id:company.id,name:company.name,address:company.address,phone:company.phone,email:company.email,logoUrl:company.logoUrl,industry:company.industry},
      settings:{legalEntityName:settings?.legalEntityName,taxRegistrationNumber:settings?.taxRegistrationNumber,currency:settings?.currency,currencySymbol:settings?.currencySymbol},
      employee:{id:employee.id,employeeCode:employee.employeeCode,firstName:employee.firstName,lastName:employee.lastName,email:employee.email,phone:employee.phone,employmentType:employee.employmentType,dateOfJoining:employee.dateOfJoining,workLocation:employee.workLocation,department:employee.department,designation:employee.designation,bankDetails:(employee as any).bankDetails},
      payslip:{id:payslip.id,month:payslip.month,status:payslip.status,basicSalary:payslip.basicSalary,hra:payslip.hra,allowances:payslip.allowances,grossSalary:payslip.grossSalary,providentFund:payslip.providentFund,taxDeductions:payslip.taxDeductions,otherDeductions:payslip.otherDeductions,totalDeductions:payslip.totalDeductions,netSalary:payslip.netSalary,workingDays:payslip.workingDays,presentDays:payslip.presentDays,paidLeaveDays:payslip.paidLeaveDays,unpaidDays:payslip.unpaidDays,paymentDate:payslip.paymentDate,breakdown:payslip.breakdown as any,ytdBreakdown:(payslip as any).ytdBreakdown,componentMeta:(payslip as any).componentMeta},
    });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`inline; filename="payslip-${payslip.month}.pdf"`);
    return res.send(buffer);
  }catch(e){next(e)}
});
router.use('/payroll/compliance',authenticate,permit('payroll.manage'));router.post('/payroll/compliance/proofs/:id/review',async(req:Req,res,next)=>{try{const body=z.object({status:z.enum(['VERIFIED','REJECTED']),comment:z.string().trim().max(500).optional()}).parse(req.body),proof=await prisma.investmentProof.findFirst({where:{id:String(req.params.id),declaration:{companyId:req.auth!.companyId}}});if(!proof)return fail(res,404,'PROOF_NOT_FOUND','Investment proof was not found.');const value=await prisma.investmentProof.update({where:{id:proof.id},data:{status:body.status,comment:body.comment,reviewerId:req.auth!.id,reviewedAt:new Date()}});await audit(req,'REVIEW_INVESTMENT_PROOF',`Proof ${proof.id} ${body.status}.`);return ok(res,value)}catch(e){next(e)}});router.post('/payroll/compliance/declarations/:id/verify',async(req:Req,res,next)=>{try{const declaration=await prisma.taxDeclaration.findFirst({where:{id:String(req.params.id),companyId:req.auth!.companyId,status:'SUBMITTED'},include:{proofs:true}});if(!declaration)return fail(res,409,'DECLARATION_STATE_INVALID','Submitted declaration was not found.');const totalVerified=declaration.proofs.filter(x=>x.status==='VERIFIED').reduce((a,b)=>a+b.amount,0),value=await prisma.taxDeclaration.update({where:{id:declaration.id},data:{status:'VERIFIED',totalVerified,verifiedById:req.auth!.id,verifiedAt:new Date()}});await audit(req,'VERIFY_TAX_DECLARATION',`Declaration ${declaration.id} verified.`);return ok(res,value)}catch(e){next(e)}});router.post('/payroll/compliance/form16',permit('payroll.approve'),async(req:Req,res,next)=>{try{const body=z.object({employeeId:uuid,financialYear:fy,documentKey:objectKey,publish:z.boolean().default(false)}).parse(req.body);if(!await prisma.employee.findFirst({where:{id:body.employeeId,companyId:req.auth!.companyId}}))return fail(res,400,'EMPLOYEE_INVALID','Employee is not part of this company.');const value=await prisma.form16Document.upsert({where:{employeeId_financialYear:{employeeId:body.employeeId,financialYear:body.financialYear}},create:{companyId:req.auth!.companyId,employeeId:body.employeeId,financialYear:body.financialYear,documentKey:body.documentKey,publishedAt:body.publish?new Date():null},update:{documentKey:body.documentKey,publishedAt:body.publish?new Date():undefined}});await audit(req,'REGISTER_FORM16',`Form 16 ${body.financialYear} registered for employee ${body.employeeId}.`);return ok(res,value,201)}catch(e){next(e)}});
router.get('/payroll/compliance/settlements',async(req:Req,res,next)=>{try{const settlements=await prisma.fullFinalSettlement.findMany({where:{companyId:req.auth!.companyId},include:{employee:{select:{id:true,firstName:true,lastName:true,employeeCode:true,designation:true,department:true}}},orderBy:{createdAt:'desc'}});return ok(res,settlements)}catch(e){next(e)}});

router.get('/payroll/compliance/settlements/preview/:employeeId',async(req:Req,res,next)=>{try{
  const companyId=req.auth!.companyId,employeeId=String(req.params.employeeId);
  const employee=await prisma.employee.findFirst({where:{id:employeeId,companyId},include:{department:true,designation:true}});
  if(!employee)return fail(res,404,'EMPLOYEE_NOT_FOUND','Employee was not found.');
  const lastWorkingDay=req.query.lastWorkingDay?new Date(String(req.query.lastWorkingDay)):new Date();
  
  const revision=await prisma.employeeSalaryRevision.findFirst({where:{companyId,employeeId,status:'APPROVED',effectiveFrom:{lte:lastWorkingDay}},include:{structure:{include:{components:true}}},orderBy:{effectiveFrom:'desc'}});
  const components=(revision?.structure?.components||[])as Array<{code:string;kind:string;value:number;method:string}>;
  const basicComp=components.find(c=>c.code==='BASIC');
  const annualCtc = revision?.annualCtc;
  const monthlyBasic=basicComp?(revision?.componentValues as Record<string,number>)?.[basicComp.code]||basicComp.value||(annualCtc?annualCtc/24:30000):(annualCtc?annualCtc/24:30000);
  const monthlyGross=annualCtc?annualCtc/12:monthlyBasic*2;

  const [activeLoans,assignedAssets,attendanceRecords]=await Promise.all([
    prisma.employeeLoan.findMany({where:{companyId,employeeId,status:'ACTIVE'}}),
    prisma.asset.findMany({where:{companyId,assignedToEmployeeId:employeeId}}),
    prisma.attendanceRecord.findMany({where:{companyId,employeeId,date:{gte:new Date(Date.UTC(lastWorkingDay.getFullYear(),lastWorkingDay.getMonth(),1)),lte:lastWorkingDay}}}),
  ]);

  const totalOutstandingLoan=activeLoans.reduce((sum,l)=>sum+l.outstanding,0);
  const payableDays=attendanceRecords.filter(r=>['PRESENT','LATE'].includes(r.status)).length+(attendanceRecords.filter(r=>r.status==='HALF_DAY').length*0.5);
  const monthDays=new Date(lastWorkingDay.getFullYear(),lastWorkingDay.getMonth()+1,0).getDate();

  const preview=calculateFullAndFinalSettlement({
    employeeId,
    dateOfJoining:employee.dateOfJoining||new Date('2022-01-01'),
    lastWorkingDay,
    monthlyBasicSalary:monthlyBasic,
    monthlyGrossSalary:monthlyGross,
    encashableLeaveDays:15,
    contractualNoticeDays:30,
    noticeServedDays:30,
    finalMonthDays:monthDays,
    finalMonthPayableDays:payableDays>0?payableDays:lastWorkingDay.getDate(),
    loanOutstanding:totalOutstandingLoan,
  });

  return ok(res,{
    employee:{id:employee.id,employeeCode:employee.employeeCode,firstName:employee.firstName,lastName:employee.lastName,designation:employee.designation?.title,department:employee.department?.name,dateOfJoining:employee.dateOfJoining},
    monthlyBasic,monthlyGross,
    activeLoans,assignedAssets,
    preview,
  });
}catch(e){next(e)}});

router.post('/payroll/compliance/settlements/calculate',async(req:Req,res,next)=>{try{
  const companyId=req.auth!.companyId;
  const body=z.object({
    employeeId:uuid,
    lastWorkingDay:z.coerce.date(),
    isDeathOrDisability:z.boolean().default(false),
    contractualNoticeDays:z.number().min(0).default(30),
    noticeServedDays:z.number().min(0).default(30),
    encashableLeaveDays:z.number().min(0).optional(),
    bonus:z.number().min(0).default(0),
    unreturnedAssetDeduction:z.number().min(0).default(0),
    customTaxDeduction:z.number().min(0).optional(),
    unpaidSalaryOverride:z.number().min(0).optional(),
    leaveEncashmentOverride:z.number().min(0).optional(),
    gratuityOverride:z.number().min(0).optional(),
    recoveriesOverride:z.number().min(0).optional(),
  }).parse(req.body);

  const employee=await prisma.employee.findFirst({where:{id:body.employeeId,companyId}});
  if(!employee)return fail(res,400,'EMPLOYEE_INVALID','Employee is not part of this company.');

  const revision=await prisma.employeeSalaryRevision.findFirst({where:{companyId,employeeId:body.employeeId,status:'APPROVED',effectiveFrom:{lte:body.lastWorkingDay}},include:{structure:{include:{components:true}}},orderBy:{effectiveFrom:'desc'}});
  const components=(revision?.structure?.components||[])as Array<{code:string;kind:string;value:number}>;
  const basicComp=components.find(c=>c.code==='BASIC');
  const annualCtc = revision?.annualCtc;
  const monthlyBasic=basicComp?(revision?.componentValues as Record<string,number>)?.[basicComp.code]||basicComp.value||(annualCtc?annualCtc/24:30000):(annualCtc?annualCtc/24:30000);
  const monthlyGross=annualCtc?annualCtc/12:monthlyBasic*2;

  const loans=await prisma.employeeLoan.aggregate({where:{companyId,employeeId:body.employeeId,status:'ACTIVE'},_sum:{outstanding:true}});
  const loanRecovery=loans._sum.outstanding||0;

  const monthDays=new Date(body.lastWorkingDay.getFullYear(),body.lastWorkingDay.getMonth()+1,0).getDate();
  const calculated=calculateFullAndFinalSettlement({
    employeeId:body.employeeId,
    dateOfJoining:employee.dateOfJoining||new Date('2022-01-01'),
    lastWorkingDay:body.lastWorkingDay,
    monthlyBasicSalary:monthlyBasic,
    monthlyGrossSalary:monthlyGross,
    encashableLeaveDays:body.encashableLeaveDays??15,
    isDeathOrDisability:body.isDeathOrDisability,
    contractualNoticeDays:body.contractualNoticeDays,
    noticeServedDays:body.noticeServedDays,
    finalMonthDays:monthDays,
    finalMonthPayableDays:body.lastWorkingDay.getDate(),
    bonus:body.bonus,
    loanOutstanding:loanRecovery,
    unreturnedAssetDeduction:body.unreturnedAssetDeduction,
    customTaxDeduction:body.customTaxDeduction,
  });

  const unpaidSalary=body.unpaidSalaryOverride!=null?body.unpaidSalaryOverride:calculated.additions.unpaidSalary;
  const leaveEncashment=body.leaveEncashmentOverride!=null?body.leaveEncashmentOverride:calculated.additions.leaveEncashment;
  const gratuity=body.gratuityOverride!=null?body.gratuityOverride:calculated.additions.gratuity;
  const recoveries=body.recoveriesOverride!=null?body.recoveriesOverride:(calculated.deductions.noticeShortfallRecovery+calculated.deductions.assetRecovery);
  const taxDeduction=body.customTaxDeduction!=null?body.customTaxDeduction:calculated.deductions.taxDeduction;
  const netSettlement=Math.max(0,unpaidSalary+leaveEncashment+gratuity+body.bonus-recoveries-loanRecovery-taxDeduction);

  const breakdown={...calculated,unpaidSalary,leaveEncashment,gratuity,recoveries,taxDeduction,loanRecovery,netSettlement};

  const value=await prisma.fullFinalSettlement.upsert({
    where:{employeeId_lastWorkingDay:{employeeId:body.employeeId,lastWorkingDay:body.lastWorkingDay}},
    create:{companyId,employeeId:body.employeeId,lastWorkingDay:body.lastWorkingDay,unpaidSalary,leaveEncashment,gratuity,bonus:body.bonus,recoveries,loanRecovery,taxDeduction,netSettlement,breakdown:breakdown as unknown as Prisma.InputJsonValue,status:'CALCULATED',calculatedAt:new Date()},
    update:{unpaidSalary,leaveEncashment,gratuity,bonus:body.bonus,recoveries,loanRecovery,taxDeduction,netSettlement,breakdown:breakdown as unknown as Prisma.InputJsonValue,status:'CALCULATED',calculatedAt:new Date()}
  });

  await audit(req,'CALCULATE_FULL_FINAL',`Full and final settlement ${value.id} calculated (Net: ₹${netSettlement}).`);
  return ok(res,value);
}catch(e){next(e)}});

router.post('/payroll/compliance/settlements/:id/approve',permit('payroll.approve'),async(req:Req,res,next)=>{try{
  const updated=await prisma.fullFinalSettlement.updateMany({where:{id:String(req.params.id),companyId:req.auth!.companyId,status:'CALCULATED'},data:{status:'APPROVED',approvedById:req.auth!.id,approvedAt:new Date()}});
  if(!updated.count)return fail(res,409,'SETTLEMENT_STATE_INVALID','Calculated settlement was not found.');
  await audit(req,'APPROVE_FULL_FINAL',`Settlement ${req.params.id} approved.`);
  return ok(res,{status:'APPROVED'});
}catch(e){next(e)}});

router.post('/payroll/compliance/settlements/:id/pay',permit('payroll.approve'),async(req:Req,res,next)=>{try{
  const companyId=req.auth!.companyId;
  const settlement=await prisma.fullFinalSettlement.findFirst({where:{id:String(req.params.id),companyId,status:'APPROVED'}});
  if(!settlement)return fail(res,409,'SETTLEMENT_STATE_INVALID','Approved settlement was not found.');

  await prisma.$transaction(async(tx)=>{
    await tx.fullFinalSettlement.update({where:{id:settlement.id},data:{status:'PAID',paidAt:new Date()}});
    if(settlement.loanRecovery>0){
      const loans=await tx.employeeLoan.findMany({where:{companyId,employeeId:settlement.employeeId,status:'ACTIVE'},orderBy:{startsOn:'asc'}});
      let remainingToDeduct=settlement.loanRecovery;
      for(const loan of loans){
        if(remainingToDeduct<=0)break;
        const deduct=Math.min(loan.outstanding,remainingToDeduct);
        await tx.loanRepayment.create({data:{loanId:loan.id,amount:deduct,payrollRunId:null}});
        await tx.employeeLoan.update({where:{id:loan.id},data:{outstanding:Math.max(0,loan.outstanding-deduct),status:loan.outstanding-deduct<=0?'CLOSED':'ACTIVE'}});
        remainingToDeduct-=deduct;
      }
    }
  });

  await audit(req,'PAY_FULL_FINAL',`Settlement ${settlement.id} marked as paid.`);
  return ok(res,{status:'PAID'});
}catch(e){next(e)}});

router.get('/payroll/compliance/settlements/:id/pdf',async(req:Req,res,next)=>{try{
  const companyId=req.auth!.companyId;
  const [settlement,company,settings]=await Promise.all([
    prisma.fullFinalSettlement.findFirst({where:{id:String(req.params.id),companyId},include:{employee:{include:{department:true,designation:true}}}}),
    prisma.company.findUnique({where:{id:companyId},select:{name:true}}),
    prisma.companySettings.findUnique({where:{companyId}}),
  ]);
  if(!settlement||!company)return fail(res,404,'SETTLEMENT_NOT_FOUND','Settlement was not found.');

  const pdfBuffer=generateExitSettlementPdfBuffer({
    company:{name:company.name,address:settings?.registeredAddress,email:settings?.officialEmail,phone:settings?.officialPhone},
    settings:{legalEntityName:settings?.legalEntityName,panNumber:settings?.panNumber,tanNumber:settings?.tanNumber,currencySymbol:settings?.currencySymbol||'₹'},
    employee:{
      firstName:settlement.employee.firstName,lastName:settlement.employee.lastName,
      employeeCode:settlement.employee.employeeCode,
      designation:settlement.employee.designation?.title,department:settlement.employee.department?.name,
      dateOfJoining:settlement.employee.dateOfJoining||new Date('2022-01-01'),
      lastWorkingDay:settlement.lastWorkingDay,
    },
    settlement:{
      id:settlement.id,status:settlement.status,
      unpaidSalary:settlement.unpaidSalary,leaveEncashment:settlement.leaveEncashment,
      gratuity:settlement.gratuity,bonus:settlement.bonus,
      recoveries:settlement.recoveries,loanRecovery:settlement.loanRecovery,
      taxDeduction:settlement.taxDeduction,netSettlement:settlement.netSettlement,
      calculatedAt:settlement.calculatedAt,approvedAt:settlement.approvedAt,paidAt:settlement.paidAt,
      breakdown:settlement.breakdown as Record<string,any>,
    }
  });

  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`inline; filename="exit-settlement-${settlement.employee.employeeCode}.pdf"`);
  return res.send(pdfBuffer);
}catch(e){next(e)}});

router.get('/payroll/compliance/form16',async(req:Req,res,next)=>{try{const list=await prisma.form16Document.findMany({where:{companyId:req.auth!.companyId},include:{employee:{select:{id:true,firstName:true,lastName:true,employeeCode:true,department:true}}},orderBy:{generatedAt:'desc'}});return ok(res,list)}catch(e){next(e)}});router.post('/payroll/compliance/form16/:id/publish',permit('payroll.approve'),async(req:Req,res,next)=>{try{const updated=await prisma.form16Document.updateMany({where:{id:String(req.params.id),companyId:req.auth!.companyId},data:{publishedAt:new Date()}});if(!updated.count)return fail(res,404,'DOCUMENT_NOT_FOUND','Form 16 document was not found.');await audit(req,'PUBLISH_FORM16',`Form 16 ${req.params.id} published.`);return ok(res,{status:'PUBLISHED'})}catch(e){next(e)}});router.post('/payroll/compliance/form16/generate-batch',permit('payroll.approve'),async(req:Req,res,next)=>{try{const body=z.object({financialYear:fy,publishAll:z.boolean().default(false)}).parse(req.body);const employees=await prisma.employee.findMany({where:{companyId:req.auth!.companyId,status:{in:['ACTIVE','ON_PROBATION','ON_LEAVE','TERMINATED']}},select:{id:true,employeeCode:true}});let count=0;for(const emp of employees){const key=`form16/${body.financialYear}/${emp.employeeCode}.pdf`;await prisma.form16Document.upsert({where:{employeeId_financialYear:{employeeId:emp.id,financialYear:body.financialYear}},create:{companyId:req.auth!.companyId,employeeId:emp.id,financialYear:body.financialYear,documentKey:key,publishedAt:body.publishAll?new Date():null},update:{documentKey:key,publishedAt:body.publishAll?new Date():undefined}});count++;}await audit(req,'BATCH_GENERATE_FORM16',`Generated Form 16 for ${count} employees for FY ${body.financialYear}.`);return ok(res,{count,financialYear:body.financialYear,status:'COMPLETED'})}catch(e){next(e)}});return router}
