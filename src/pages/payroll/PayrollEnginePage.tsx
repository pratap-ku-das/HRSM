import React,{useCallback,useEffect,useMemo,useState}from'react';
import{AlertTriangle,Calculator,CheckCircle2,CircleDollarSign,Download,FileCheck2,FileText,Landmark,LockKeyhole,Play,Printer,RefreshCw,ShieldCheck,Users}from'lucide-react';
import{api}from'../../services/api';import type{Employee,PayrollAttendanceReview,PayrollConfiguration,PayrollEngineRun,PayrollLineDetail}from'../../types';import{useToast}from'../../context/ToastContext';import{useAuth}from'../../context/AuthContext';import{EmptyState}from'../../components/ui/EmptyState';
import{BankExportTab}from'./BankExportTab';
import{AdminTaxSimulatorTab}from'./AdminTaxSimulatorTab';
type Tab='overview'|'setup'|'runs'|'payslips'|'settlements'|'form16'|'bankExport'|'taxSimulator';
type Review={run:PayrollEngineRun;lines:PayrollLineDetail[];exceptions:Array<{employeeId:string;employeeName:string;messages:string[]}>};
const stages=['DRAFT','ATTENDANCE_REVIEW','ATTENDANCE_FINALIZED','CALCULATED','PENDING_APPROVAL','APPROVED','PAYSLIP_GENERATED','PAYSLIPS_PUBLISHED'];
const labels:Record<string,string>={DRAFT:'Draft',ATTENDANCE_REVIEW:'Attendance review',ATTENDANCE_FINALIZED:'Attendance finalized',ATTENDANCE_LOCKED:'Attendance locked',CALCULATED:'Calculated',PENDING_APPROVAL:'Pending approval',APPROVED:'Approved',PAYSLIP_GENERATED:'Payslips generated',REJECTED:'Rejected',HR_REVIEW:'HR reviewed',FINANCE_APPROVED:'Finance approved',LOCKED:'Locked',PAYSLIPS_PUBLISHED:'Published',PAID:'Paid'};
const money=(value=0)=>`₹${value.toLocaleString('en-IN',{maximumFractionDigits:0})}`;
export const PayrollEnginePage:React.FC=()=>{const toast=useToast(),{currentUser}=useAuth();const[data,setData]=useState<PayrollConfiguration|null>(null),[employees,setEmployees]=useState<Employee[]>([]),[attendance,setAttendance]=useState<PayrollAttendanceReview[]>([]),[busy,setBusy]=useState(false),[tab,setTab]=useState<Tab>('overview'),[month,setMonth]=useState(new Date().toISOString().slice(0,7)),[selectedId,setSelectedId]=useState(''),[review,setReview]=useState<Review|null>(null);const[revision,setRevision]=useState({employeeId:'',structureId:'',effectiveFrom:new Date().toISOString().slice(0,10),annualCtc:0,reason:''}),[rule,setRule]=useState({type:'PF',effectiveFrom:new Date().toISOString().slice(0,10),employeeRate:12,employerRate:12,ceiling:15000,monthlyAmount:0,sourceNote:''}),[payment,setPayment]=useState({paymentDate:new Date().toISOString().slice(0,10),paymentReference:''});
 const[settlements,setSettlements]=useState<any[]>([]),[selectedSettlement,setSelectedSettlement]=useState<any|null>(null);
 const[settlementPreview,setSettlementPreview]=useState<any|null>(null),[previewLoading,setPreviewLoading]=useState(false);
 const[settlementForm,setSettlementForm]=useState({employeeId:'',lastWorkingDay:new Date().toISOString().slice(0,10),unpaidSalary:0,leaveEncashment:0,gratuity:0,bonus:0,recoveries:0,loanRecovery:0,taxDeduction:0});
 const loadSettlementPreview=useCallback(async(employeeId:string,lwd:string)=>{if(!employeeId){setSettlementPreview(null);return}setPreviewLoading(true);try{const preview=await api.getSettlementPreview(employeeId,lwd);setSettlementPreview(preview);setSettlementForm(prev=>({...prev,unpaidSalary:preview.unpaidSalary?.finalMonthSalary??prev.unpaidSalary,leaveEncashment:preview.leaveEncashment?.encashmentAmount??prev.leaveEncashment,gratuity:preview.gratuity?.gratuityAmount??prev.gratuity,recoveries:preview.statutoryDeductions?.noticeRecovery??prev.recoveries,loanRecovery:preview.loanRecovery?.totalOutstandingLoan??prev.loanRecovery,taxDeduction:preview.statutoryDeductions?.taxDeduction??prev.taxDeduction}))}catch(e){console.error('Failed to load settlement preview',e)}finally{setPreviewLoading(false)}},[]);
 const[form16List,setForm16List]=useState<any[]>([]),[form16Fy,setForm16Fy]=useState('2025-26'),[form16PublishAll,setForm16PublishAll]=useState(false);
 const load=useCallback(async()=>{setBusy(true);try{const[c,e]=await Promise.all([api.getPayrollConfiguration(),api.getEmployeesV1()]);setData(c);setEmployees(e);setSelectedId(value=>value||c.runs[0]?.id||'')}catch(error){toast.error('Payroll workspace could not be loaded',error instanceof Error?error.message:'Unknown error')}finally{setBusy(false)}},[toast]);useEffect(()=>{void load()},[load]);
 const loadReview=useCallback(async(id:string)=>{if(!id){setReview(null);setAttendance([]);return}try{setReview(await api.getPayrollRunReview(id))}catch{setReview(null)}try{setAttendance(await api.getPayrollAttendanceReview(id))}catch{setAttendance([])}},[]);useEffect(()=>{void loadReview(selectedId)},[selectedId,loadReview]);
 const loadSettlements=useCallback(async()=>{try{const list=await api.getSettlements();setSettlements(list)}catch(e){console.error(e)}},[]);
 const loadForm16=useCallback(async()=>{try{const list=await api.getForm16List();setForm16List(list)}catch(e){console.error(e)}},[]);
 useEffect(()=>{if(tab==='settlements')void loadSettlements();if(tab==='form16')void loadForm16()},[tab,loadSettlements,loadForm16]);
 const runAction=async(action:()=>Promise<unknown>,message:string)=>{setBusy(true);try{await action();toast.success(message);await load();if(selectedId)await loadReview(selectedId);if(tab==='settlements')await loadSettlements();if(tab==='form16')await loadForm16()}catch(error){toast.error('Payroll action failed',error instanceof Error?error.message:'Unknown error')}finally{setBusy(false)}};
 const activeEmployees=employees.filter(x=>['ACTIVE','ON_PROBATION','ON_LEAVE'].includes(x.status)),approvedIds=new Set(data?.revisions.filter(x=>x.status==='APPROVED').map(x=>x.employeeId)),missingSalary=activeEmployees.filter(x=>!approvedIds.has(x.id)),currentRun=data?.runs[0],selectedRun=data?.runs.find(x=>x.id===selectedId),published=data?.runs.filter(x=>['PAYSLIPS_PUBLISHED','PAID'].includes(x.status))||[],canApprove=currentUser?.permissions?.includes('payroll.approve')===true;
 const configuration=useMemo(()=>{if(rule.type==='PF')return{baseCodes:['BASIC'],wageCeiling:rule.ceiling,employeeRate:rule.employeeRate,employerRate:rule.employerRate};if(rule.type==='ESI')return{grossCeiling:rule.ceiling,employeeRate:rule.employeeRate,employerRate:rule.employerRate};if(rule.type==='LWF')return{employeeAmount:rule.employeeRate,employerAmount:rule.employerRate};if(rule.type==='PROFESSIONAL_TAX')return{slabs:[{min:0,amount:rule.monthlyAmount}]};return{monthlyAmount:rule.monthlyAmount}},[rule]);
 const createDefault=()=>runAction(()=>api.createSalaryStructure({name:'India Standard Monthly',code:'IN_STD',components:[{code:'BASIC',name:'Basic salary',kind:'EARNING',method:'FIXED',value:30000,taxable:true,proratable:true},{code:'HRA',name:'House rent allowance',kind:'EARNING',method:'PERCENT_BASIC',value:40,taxable:true,proratable:true},{code:'SPECIAL',name:'Special allowance',kind:'EARNING',method:'FIXED',value:10000,taxable:true,proratable:true}]}),'Salary template created');
 const next=async(run:PayrollEngineRun)=>{if(run.status==='DRAFT'){await runAction(()=>api.getPayrollAttendanceReview(run.id),'Attendance review prepared');setSelectedId(run.id);return}if(run.status==='ATTENDANCE_REVIEW')return runAction(()=>api.finalizePayrollAttendance(run.id),'Attendance finalized');if(['ATTENDANCE_FINALIZED','ATTENDANCE_LOCKED'].includes(run.status))return runAction(()=>api.payrollRunAction(run.id,'calculate'),'Payroll calculated');if(['CALCULATED','HR_REVIEW','REJECTED'].includes(run.status))return runAction(()=>api.submitPayrollApproval(run.id),'Payroll submitted for approval');if(run.status==='PENDING_APPROVAL')return runAction(()=>api.approvePayroll(run.id),'Payroll approved');if(run.status==='APPROVED')return runAction(()=>api.generatePayslips(run.id),'Payslips generated');if(run.status==='PAYSLIP_GENERATED')return runAction(()=>api.payrollRunAction(run.id,'publish'),'Payslips published')};
 const actionLabel=(run:PayrollEngineRun)=>run.status==='DRAFT'?'Review attendance':run.status==='ATTENDANCE_REVIEW'?'Finalize attendance':['ATTENDANCE_FINALIZED','ATTENDANCE_LOCKED'].includes(run.status)?'Calculate payroll':['CALCULATED','HR_REVIEW','REJECTED'].includes(run.status)?'Submit for approval':run.status==='PENDING_APPROVAL'?'Approve payroll':run.status==='APPROVED'?'Generate payslips':run.status==='PAYSLIP_GENERATED'?'Publish payslips':'';
 return <div className="neo-page neo-payroll space-y-5"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Calculator className="text-brand-400"/>Payroll & Compliance</h1><p className="mt-1 text-sm text-slate-400">Configure salaries, run monthly payroll, manage Full & Final settlements and Form 16 compliance.</p></div><button onClick={()=>void load()} aria-label="Refresh payroll" className="rounded-xl border border-slate-700 p-2"><RefreshCw className={`h-4 w-4 ${busy?'animate-spin':''}`}/></button></header>
 <nav className="flex gap-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-1">{(['overview','setup','runs','payslips','settlements','form16','bankExport','taxSimulator']as Tab[]).map(item=><button key={item} onClick={()=>setTab(item)} className={`rounded-lg px-4 py-2 text-sm whitespace-nowrap capitalize ${tab===item?'bg-brand-500 text-white':'text-slate-400 hover:text-white'}`}>{item==='settlements'?'Full & Final (F&F)':item==='form16'?'Form 16':item==='bankExport'?'Bank Export (NEFT/RTGS)':item==='taxSimulator'?'Tax Simulator':item}</button>)}</nav>
 {tab==='overview'&&<div className="space-y-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric icon={Users} label="Active employees" value={String(activeEmployees.length)}/><Metric icon={AlertTriangle} label="Missing salary" value={String(missingSalary.length)} warn={missingSalary.length>0}/><Metric icon={CircleDollarSign} label="Latest net payout" value={money(currentRun?.totalNetPayout)}/><Metric icon={CheckCircle2} label="Current status" value={currentRun?labels[currentRun.status]||currentRun.status:'No run'}/></div><section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Pre-payroll readiness</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Check label="Salary assigned" detail={`${activeEmployees.length-missingSalary.length} of ${activeEmployees.length}`} ok={!missingSalary.length}/><Check label="Attendance" detail={currentRun&&currentRun.status!=='DRAFT'?'Locked for processing':'Lock when inputs are final'} ok={Boolean(currentRun&&currentRun.status!=='DRAFT')}/><Check label="Bank details" detail={review?.exceptions.some(x=>x.messages.includes('Bank details incomplete'))?'Missing information found':'No blocking issue found'} ok={!review?.exceptions.some(x=>x.messages.includes('Bank details incomplete'))}/></div></section>{currentRun?<RunCard run={currentRun} selected={true} onSelect={()=>{setSelectedId(currentRun.id);setTab('runs')}} onAction={()=>void next(currentRun)} actionLabel={actionLabel(currentRun)} busy={busy}/>:<EmptyState title="No payroll run" description="Create the first monthly run from Payroll Runs." icon={Calculator}/>}</div>}
 {tab==='setup'&&<div className="grid gap-4 xl:grid-cols-3"><section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Salary templates</h2><p className="mb-4 text-xs text-slate-500">Reusable earnings and deduction structures.</p><div className="space-y-2">{data?.structures.map(x=><article key={x.id} className="rounded-xl bg-slate-950 p-3"><b>{x.name}</b><p className="text-xs text-slate-500">{x.components.length} components · {x.code}</p></article>)}</div><button disabled={busy} onClick={()=>void createDefault()} className="mt-4 w-full rounded-xl bg-indigo-500/20 p-2 text-indigo-300">Create standard template</button></section><form onSubmit={e=>{e.preventDefault();void runAction(()=>api.createSalaryRevision(revision),'Salary assignment submitted')}} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">Assign employee salary</h2><Field label="Employee"><select required value={revision.employeeId} onChange={e=>setRevision({...revision,employeeId:e.target.value})} className="input w-full"><option value="">Select employee</option>{employees.map(x=><option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</select></Field><Field label="Salary template"><select required value={revision.structureId} onChange={e=>setRevision({...revision,structureId:e.target.value})} className="input w-full"><option value="">Select template</option>{data?.structures.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Annual CTC"><input required type="number" min="1" value={revision.annualCtc||''} onChange={e=>setRevision({...revision,annualCtc:Number(e.target.value)})} className="input w-full"/></Field><Field label="Effective from"><input type="date" value={revision.effectiveFrom} onChange={e=>setRevision({...revision,effectiveFrom:e.target.value})} className="input w-full"/></Field><button disabled={busy} className="w-full rounded-xl bg-brand-500 p-2.5 font-medium">Submit assignment</button></form><form onSubmit={e=>{e.preventDefault();void runAction(()=>api.createStatutoryRule({type:rule.type,effectiveFrom:rule.effectiveFrom,configuration,sourceNote:rule.sourceNote}),'Statutory rule saved')}} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="flex gap-2 font-semibold"><Landmark className="h-4 w-4"/>Statutory rule</h2><Field label="Rule"><select value={rule.type} onChange={e=>setRule({...rule,type:e.target.value})} className="input w-full">{['PF','ESI','PROFESSIONAL_TAX','TDS','LWF'].map(x=><option key={x}>{x}</option>)}</select></Field>{['PF','ESI','LWF'].includes(rule.type)&&<div className="grid grid-cols-2 gap-2"><Field label="Employee rate / amount"><input type="number" value={rule.employeeRate} onChange={e=>setRule({...rule,employeeRate:Number(e.target.value)})} className="input w-full"/></Field><Field label="Employer rate / amount"><input type="number" value={rule.employerRate} onChange={e=>setRule({...rule,employerRate:Number(e.target.value)})} className="input w-full"/></Field></div>}{['PF','ESI'].includes(rule.type)&&<Field label="Wage ceiling"><input type="number" value={rule.ceiling} onChange={e=>setRule({...rule,ceiling:Number(e.target.value)})} className="input w-full"/></Field>}{['TDS','PROFESSIONAL_TAX'].includes(rule.type)&&<Field label="Monthly amount"><input type="number" value={rule.monthlyAmount} onChange={e=>setRule({...rule,monthlyAmount:Number(e.target.value)})} className="input w-full"/></Field>}<Field label="Effective from"><input type="date" value={rule.effectiveFrom} onChange={e=>setRule({...rule,effectiveFrom:e.target.value})} className="input w-full"/></Field><button disabled={busy} className="w-full rounded-xl bg-brand-500 p-2.5 font-medium">Save rule</button></form></div>}
 {tab==='runs'&&<div className="grid gap-4 xl:grid-cols-[360px_1fr]"><section className="space-y-3"><form onSubmit={e=>{e.preventDefault();void runAction(()=>api.createPayrollRun(month),'Payroll run created')}} className="flex gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="input min-w-0 flex-1"/><button disabled={busy} className="rounded-xl bg-brand-500 px-3 font-medium">New run</button></form>{data?.runs.map(run=><RunCard key={run.id} run={run} selected={selectedId===run.id} onSelect={()=>setSelectedId(run.id)} onAction={()=>void next(run)} actionLabel={actionLabel(run)} busy={busy}/>)}</section><section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">{selectedRun?<><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{selectedRun.month}</h2><p className="text-xs text-slate-500">{labels[selectedRun.status]||selectedRun.status}</p></div><div className="text-right"><b>{money(selectedRun.totalNetPayout)}</b><p className="text-xs text-slate-500">Net payout</p></div></div><div className="my-5 flex overflow-auto">{stages.map((stage,index)=>{const reached=stages.indexOf(selectedRun.status)>=index;return <div key={stage} className="flex min-w-28 flex-1 items-center"><span className={`h-2.5 w-2.5 rounded-full ${reached?'bg-brand-400':'bg-slate-700'}`}/><span className={`ml-2 text-[10px] ${reached?'text-slate-200':'text-slate-600'}`}>{labels[stage]}</span>{index<stages.length-1&&<span className={`mx-2 h-px flex-1 ${reached?'bg-brand-500/50':'bg-slate-800'}`}/>}</div>})}</div>{review?.exceptions.length?<div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><b className="text-sm text-amber-300">{review.exceptions.length} employees need attention</b>{review.exceptions.slice(0,4).map(x=><p key={x.employeeId} className="mt-1 text-xs text-slate-300">{x.employeeName}: {x.messages.join(', ')}</p>)}</div>:selectedRun.status!=='DRAFT'&&<p className="mb-4 text-sm text-emerald-300">No payroll exceptions detected.</p>}<div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-2">Employee</th><th>Payable days</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Variance</th></tr></thead><tbody>{review?.lines.map(line=><tr key={line.id} className="border-t border-slate-800"><td className="py-3"><b>{line.employee?`${line.employee.firstName} ${line.employee.lastName}`:line.employeeId}</b><small className="block text-slate-500">{line.employee?.employeeCode}</small></td><td>{line.payableDays}/{line.workingDays}</td><td>{money(line.grossEarnings)}</td><td>{money(line.employeeDeductions)}</td><td className="font-semibold">{money(line.netPay)}</td><td className={Math.abs(line.variancePercent||0)>=20?'text-amber-300':'text-slate-400'}>{line.variancePercent===undefined?'New':`${line.variancePercent>0?'+':''}${line.variancePercent.toFixed(1)}%`}</td></tr>)}</tbody></table>{!review?.lines.length&&<EmptyState title="No calculation yet" description="Lock attendance and calculate payroll to review employees." icon={Calculator}/>}</div>{selectedRun.status==='LOCKED'&&!selectedRun.paymentDate&&canApprove&&<form onSubmit={e=>{e.preventDefault();void runAction(()=>api.recordPayrollPayment(selectedRun.id,payment),'Payment recorded')}} className="mt-5 grid gap-2 rounded-xl border border-slate-700 p-3 md:grid-cols-[1fr_1fr_auto]"><input required type="date" value={payment.paymentDate} onChange={e=>setPayment({...payment,paymentDate:e.target.value})} className="input"/><input required minLength={3} value={payment.paymentReference} onChange={e=>setPayment({...payment,paymentReference:e.target.value})} placeholder="Bank reference" className="input"/><button disabled={busy} className="rounded-xl bg-emerald-500 px-4 font-medium">Record payment</button></form>}{actionLabel(selectedRun)&&<button disabled={busy||(['HR_REVIEW','FINANCE_APPROVED','LOCKED'].includes(selectedRun.status)&&!canApprove)} onClick={()=>void next(selectedRun)} className="mt-5 flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 font-medium disabled:opacity-50">{selectedRun.status==='LOCKED'?<FileCheck2 className="h-4 w-4"/>:selectedRun.status.includes('LOCK')?<LockKeyhole className="h-4 w-4"/>:<Play className="h-4 w-4"/>}{actionLabel(selectedRun)}</button>}</>:<EmptyState title="Select a payroll run" description="Choose a month to inspect its progress and employee calculations." icon={Calculator}/>}</section></div>}
 {tab==='payslips'&&<div className="space-y-3">{published.map(run=><article key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5"><div><b>{new Date(`${run.month}-01T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</b><p className="text-xs text-slate-500">{run.totalEmployees} payslips · Published {run.publishedAt?new Date(run.publishedAt).toLocaleDateString('en-IN'):'—'}</p></div><div className="text-right"><b>{money(run.totalNetPayout)}</b><p className="text-xs text-emerald-300">Paid and published</p></div></article>)}{!published.length&&<EmptyState title="No published payslips" description="Complete a payroll run, record payment and publish payslips." icon={FileCheck2}/>}</div>}
 {tab==='settlements'&&<div className="grid gap-5 xl:grid-cols-[420px_1fr]">
   <form onSubmit={e=>{e.preventDefault();void runAction(async()=>{await api.calculateSettlement({employeeId:settlementForm.employeeId,lastWorkingDay:settlementForm.lastWorkingDay,unpaidSalary:Number(settlementForm.unpaidSalary),leaveEncashment:Number(settlementForm.leaveEncashment),gratuity:Number(settlementForm.gratuity),bonus:Number(settlementForm.bonus),recoveries:Number(settlementForm.recoveries),loanRecovery:Number(settlementForm.loanRecovery),taxDeduction:Number(settlementForm.taxDeduction)});await loadSettlements();},'F&F Settlement calculated')}} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
     <div className="flex items-center justify-between">
       <div>
         <h2 className="text-lg font-bold">Calculate Exit Settlement</h2>
         <p className="text-xs text-slate-400">Compute full and final settlement including gratuity, encashment, and loan recoveries.</p>
       </div>
       {previewLoading&&<RefreshCw className="h-4 w-4 animate-spin text-brand-400"/>}
     </div>
     <Field label="Exiting Employee">
       <select required value={settlementForm.employeeId} onChange={e=>{const empId=e.target.value;setSettlementForm(prev=>({...prev,employeeId:empId}));if(empId)void loadSettlementPreview(empId,settlementForm.lastWorkingDay);else setSettlementPreview(null)}} className="input w-full">
         <option value="">Select employee</option>
         {employees.map(x=><option key={x.id} value={x.id}>{x.firstName} {x.lastName} ({x.employeeCode})</option>)}
       </select>
     </Field>
     <Field label="Last Working Day">
       <input required type="date" value={settlementForm.lastWorkingDay} onChange={e=>{const lwd=e.target.value;setSettlementForm(prev=>({...prev,lastWorkingDay:lwd}));if(settlementForm.employeeId)void loadSettlementPreview(settlementForm.employeeId,lwd)}} className="input w-full"/>
     </Field>
     {settlementPreview&&<div className="space-y-2 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 text-xs">
       <div className="flex items-center justify-between border-b border-brand-500/20 pb-1.5 font-semibold text-brand-300">
         <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5"/>Statutory Breakdown & Previews</span>
         <button type="button" onClick={()=>void loadSettlementPreview(settlementForm.employeeId,settlementForm.lastWorkingDay)} className="text-[11px] underline text-brand-400 hover:text-brand-300">Refresh</button>
       </div>
       <div className="grid grid-cols-2 gap-2 text-[11px]">
         <div className="rounded-lg bg-slate-950/60 p-2">
           <span className="text-slate-400 block font-medium">Gratuity (Sec 4(2))</span>
           <span className={settlementPreview.gratuity?.eligible?'text-emerald-400 font-semibold':'text-amber-400 font-medium'}>
             {settlementPreview.gratuity?.eligible?`${money(settlementPreview.gratuity.gratuityAmount)} (${settlementPreview.gratuity.payableYears} yrs)`:'Ineligible (< 5 yrs)'}
           </span>
           <p className="text-[10px] text-slate-500 mt-0.5">Exempt up to ₹20L</p>
         </div>
         <div className="rounded-lg bg-slate-950/60 p-2">
           <span className="text-slate-400 block font-medium">Leave Encashment</span>
           <span className="text-emerald-400 font-semibold">{money(settlementPreview.leaveEncashment?.encashmentAmount||0)}</span>
           <p className="text-[10px] text-slate-500 mt-0.5">{settlementPreview.leaveEncashment?.remainingLeaveDays||0} days · Sec 10(10AA)</p>
         </div>
       </div>
       {settlementPreview.loanRecovery?.totalOutstandingLoan>0&&<div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2 text-rose-300">
         <div className="flex justify-between font-medium">
           <span>Active Loans Auto-Deduction:</span>
           <b>-{money(settlementPreview.loanRecovery.totalOutstandingLoan)}</b>
         </div>
         <p className="text-[10px] text-rose-400/80 mt-0.5">Will be automatically amortized and closed on settlement payment.</p>
       </div>}
       {settlementPreview.assets&&<div className="rounded-lg bg-slate-950/60 p-2">
         <div className="flex justify-between items-center text-[11px]">
           <span className="text-slate-400 font-medium">Hardware Assets Clearance:</span>
           <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${settlementPreview.assets.allReturned?'bg-emerald-500/20 text-emerald-300':'bg-amber-500/20 text-amber-300'}`}>
             {settlementPreview.assets.allReturned?'All Assets Returned':`${settlementPreview.assets.assignedAssets?.filter((a:any)=>!a.returnedAt).length||0} Pending Return`}
           </span>
         </div>
       </div>}
     </div>}
     <div className="grid grid-cols-2 gap-2">
       <Field label="Unpaid Salary (₹)"><input type="number" min="0" value={settlementForm.unpaidSalary||''} onChange={e=>setSettlementForm({...settlementForm,unpaidSalary:Number(e.target.value)})} className="input w-full"/></Field>
       <Field label="Leave Encashment (₹)"><input type="number" min="0" value={settlementForm.leaveEncashment||''} onChange={e=>setSettlementForm({...settlementForm,leaveEncashment:Number(e.target.value)})} className="input w-full"/></Field>
     </div>
     <div className="grid grid-cols-2 gap-2">
       <Field label="Gratuity (₹)"><input type="number" min="0" value={settlementForm.gratuity||''} onChange={e=>setSettlementForm({...settlementForm,gratuity:Number(e.target.value)})} className="input w-full"/></Field>
       <Field label="Bonus / Ex-gratia (₹)"><input type="number" min="0" value={settlementForm.bonus||''} onChange={e=>setSettlementForm({...settlementForm,bonus:Number(e.target.value)})} className="input w-full"/></Field>
     </div>
     <div className="grid grid-cols-2 gap-2">
       <Field label="Notice / Recoveries (₹)"><input type="number" min="0" value={settlementForm.recoveries||''} onChange={e=>setSettlementForm({...settlementForm,recoveries:Number(e.target.value)})} className="input w-full"/></Field>
       <Field label="Loan Recovery (₹)"><input type="number" min="0" value={settlementForm.loanRecovery||''} onChange={e=>setSettlementForm({...settlementForm,loanRecovery:Number(e.target.value)})} className="input w-full"/></Field>
     </div>
     <Field label="TDS / Tax Deduction (₹)"><input type="number" min="0" value={settlementForm.taxDeduction||''} onChange={e=>setSettlementForm({...settlementForm,taxDeduction:Number(e.target.value)})} className="input w-full"/></Field>
     <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs">
       <div className="flex justify-between py-0.5 text-slate-400"><span>Gross Additions:</span><span className="text-emerald-400 font-semibold">{money(settlementForm.unpaidSalary+settlementForm.leaveEncashment+settlementForm.gratuity+settlementForm.bonus)}</span></div>
       <div className="flex justify-between py-0.5 text-slate-400"><span>Recoveries, Loans & Tax:</span><span className="text-rose-400 font-semibold">{money(settlementForm.recoveries+settlementForm.loanRecovery+settlementForm.taxDeduction)}</span></div>
       <div className="mt-2 flex justify-between border-t border-slate-800 pt-1 text-sm font-bold text-white"><span>Estimated Net:</span><span className="text-brand-300">{money(Math.max(0,(settlementForm.unpaidSalary+settlementForm.leaveEncashment+settlementForm.gratuity+settlementForm.bonus)-(settlementForm.recoveries+settlementForm.loanRecovery+settlementForm.taxDeduction)))}</span></div>
     </div>
     <button disabled={busy||!settlementForm.employeeId} className="w-full rounded-xl bg-brand-500 p-2.5 font-medium disabled:opacity-50">Calculate & Save Settlement</button>
   </form>
   <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
     <div className="flex items-center justify-between"><h2 className="font-semibold text-lg">Settlement Records</h2><span className="text-xs text-slate-400">{settlements.length} exit statements</span></div>
     {!settlements.length&&<EmptyState title="No settlement records" description="Calculate full and final exit statements for leaving staff." icon={FileCheck2}/>}
     <div className="space-y-3">
       {settlements.map(item=><article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 transition-all hover:border-slate-700">
         <div className="flex flex-wrap items-start justify-between gap-3">
           <div>
             <h3 className="font-bold text-base text-white">{item.employee?`${item.employee.firstName} ${item.employee.lastName}`:'Employee'}</h3>
             <p className="text-xs text-slate-400">{item.employee?.employeeCode} · {item.employee?.designation||'Staff'} · Last day: {new Date(item.lastWorkingDay).toLocaleDateString('en-IN')}</p>
           </div>
           <div className="text-right">
             <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${item.status==='PAID'?'bg-emerald-500/20 text-emerald-300':item.status==='APPROVED'?'bg-blue-500/20 text-blue-300':'bg-amber-500/20 text-amber-300'}`}>{item.status}</span>
             <p className="mt-1 text-lg font-bold text-emerald-400">{money(item.netSettlement)}</p>
           </div>
         </div>
         <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-900 pt-3 text-xs sm:grid-cols-4">
           <div><span className="text-slate-500 block">Salary / Leave:</span><b className="text-slate-300">{money(item.unpaidSalary+item.leaveEncashment)}</b></div>
           <div><span className="text-slate-500 block">Gratuity & Bonus:</span><b className="text-slate-300">{money(item.gratuity+item.bonus)}</b></div>
           <div><span className="text-slate-500 block">Loan Recovery:</span><b className="text-rose-400">{money(item.loanRecovery)}</b></div>
           <div><span className="text-slate-500 block">Tax / Recoveries:</span><b className="text-rose-400">{money(item.taxDeduction+item.recoveries)}</b></div>
         </div>
         <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3">
           <button onClick={()=>setSelectedSettlement(item)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"><FileText className="h-3.5 w-3.5"/>View Statement</button>
           <button onClick={()=>void api.downloadSettlementPdf(item.id,item.employee?.employeeCode)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-brand-300 hover:text-white flex items-center gap-1.5"><Download className="h-3.5 w-3.5"/>Voucher (PDF)</button>
           {item.status==='CALCULATED'&&canApprove&&<button onClick={()=>void runAction(async()=>{await api.approveSettlement(item.id);await loadSettlements()},'Settlement approved')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Approve Settlement</button>}
           {item.status==='APPROVED'&&canApprove&&<button onClick={()=>void runAction(async()=>{await api.paySettlement(item.id);await loadSettlements()},'Settlement marked as paid')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">Mark as Paid</button>}
         </div>
       </article>)}
     </div>
   </section>
 </div>}
 {tab==='form16'&&<div className="space-y-5">
   <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
     <div className="flex flex-wrap items-center justify-between gap-4">
       <div>
         <h2 className="text-lg font-bold">Tax Compliance & Form 16 Batch Center</h2>
         <p className="text-xs text-slate-400">Generate and publish digital Form 16 TDS certificates for employee tax filing.</p>
       </div>
       <form onSubmit={e=>{e.preventDefault();void runAction(async()=>{await api.batchGenerateForm16({financialYear:form16Fy,publishAll:form16PublishAll});await loadForm16();},'Form 16 batch generated successfully')}} className="flex flex-wrap items-center gap-3">
         <label className="text-xs text-slate-300 flex items-center gap-2">Financial Year: <input required value={form16Fy} onChange={e=>setForm16Fy(e.target.value)} placeholder="YYYY-YY" className="input py-1 text-xs w-28"/></label>
         <label className="text-xs text-slate-300 flex items-center gap-1.5"><input type="checkbox" checked={form16PublishAll} onChange={e=>setForm16PublishAll(e.target.checked)}/> Publish immediately</label>
         <button disabled={busy} className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-medium hover:bg-brand-600">Batch Generate</button>
       </form>
     </div>
   </section>
   <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
     <div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-base">Generated Form 16 Certificates</h3><span className="text-xs text-slate-400">{form16List.length} documents</span></div>
     {!form16List.length&&<EmptyState title="No Form 16 documents generated" description="Use the batch generator above to issue certificates for the fiscal year." icon={FileText}/>}
     <div className="overflow-auto">
       {form16List.length>0&&<table className="w-full text-xs">
         <thead>
           <tr className="border-b border-slate-800 text-left text-slate-500">
             <th className="py-2.5">Employee</th>
             <th>Department</th>
             <th>Financial Year</th>
             <th>Generated</th>
             <th>Status</th>
             <th className="text-right">Action</th>
           </tr>
         </thead>
         <tbody>
           {form16List.map(item=><tr key={item.id} className="border-b border-slate-800/60">
             <td className="py-3"><b>{item.employee?`${item.employee.firstName} ${item.employee.lastName}`:item.employeeId}</b><small className="block text-slate-500">{item.employee?.employeeCode}</small></td>
             <td>{item.employee?.department||'—'}</td>
             <td className="font-semibold text-slate-200">{item.financialYear}</td>
             <td className="text-slate-400">{new Date(item.generatedAt).toLocaleDateString('en-IN')}</td>
             <td>
               <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.publishedAt?'bg-emerald-500/20 text-emerald-300':'bg-amber-500/20 text-amber-300'}`}>{item.publishedAt?'Published':'Draft'}</span>
             </td>
             <td className="text-right">
               {!item.publishedAt&&canApprove&&<button onClick={()=>void runAction(async()=>{await api.publishForm16(item.id);await loadForm16();},'Form 16 published')} className="rounded-lg bg-emerald-600/30 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-600/50">Publish</button>}
               {item.publishedAt&&<span className="text-xs text-slate-400">Available to employee</span>}
             </td>
           </tr>)}
         </tbody>
       </table>}
     </div>
   </section>
 </div>}
 {tab==='bankExport'&&<BankExportTab/>}
 {tab==='taxSimulator'&&<AdminTaxSimulatorTab employees={employees}/>}
 {selectedSettlement&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
   <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
     <div className="flex items-start justify-between border-b border-slate-800 pb-3">
       <div>
         <h3 className="text-lg font-bold text-white">Full & Final Settlement Statement</h3>
         <p className="text-xs text-slate-400">{selectedSettlement.employee?`${selectedSettlement.employee.firstName} ${selectedSettlement.employee.lastName}`:'Employee'} ({selectedSettlement.employee?.employeeCode})</p>
       </div>
       <button onClick={()=>setSelectedSettlement(null)} className="rounded-lg p-1 text-slate-400 hover:text-white">✕</button>
     </div>
     <div className="mt-4 space-y-2 text-xs">
       <div className="flex justify-between py-1 text-slate-300"><span>Last Working Day:</span><b>{new Date(selectedSettlement.lastWorkingDay).toLocaleDateString('en-IN')}</b></div>
       <div className="flex justify-between py-1 text-slate-300"><span>Status:</span><b className="uppercase text-brand-300">{selectedSettlement.status}</b></div>
       <div className="border-t border-slate-800 pt-2 font-semibold text-slate-400 uppercase text-[10px]">Earnings & Dues</div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Unpaid Salary:</span><b>{money(selectedSettlement.unpaidSalary)}</b></div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Leave Encashment:</span><b>{money(selectedSettlement.leaveEncashment)}</b></div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Gratuity:</span><b>{money(selectedSettlement.gratuity)}</b></div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Bonus / Ex-Gratia:</span><b>{money(selectedSettlement.bonus)}</b></div>
       <div className="border-t border-slate-800 pt-2 font-semibold text-slate-400 uppercase text-[10px]">Recoveries & Deductions</div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Notice / Recoveries:</span><b className="text-rose-400">-{money(selectedSettlement.recoveries)}</b></div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Active Loan Recovery:</span><b className="text-rose-400">-{money(selectedSettlement.loanRecovery)}</b></div>
       <div className="flex justify-between py-0.5 text-slate-300"><span>Tax Deductions (TDS):</span><b className="text-rose-400">-{money(selectedSettlement.taxDeduction)}</b></div>
       <div className="mt-3 flex justify-between border-t border-slate-700 pt-3 text-base font-bold text-white">
         <span>Net Settlement Amount:</span><span className="text-emerald-400">{money(selectedSettlement.netSettlement)}</span>
       </div>
     </div>
     <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
       <button onClick={()=>void api.downloadSettlementPdf(selectedSettlement.id,selectedSettlement.employee?.employeeCode)} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600"><Download className="h-3.5 w-3.5"/>Download PDF Voucher</button>
       <button onClick={()=>window.print()} className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:text-white"><Printer className="h-3.5 w-3.5"/>Print Statement</button>
       <button onClick={()=>setSelectedSettlement(null)} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700">Close</button>
     </div>
   </div>
 </div>}
 </div>};
const Metric=({icon:Icon,label,value,warn=false}:{icon:React.ElementType;label:string;value:string;warn?:boolean})=><article className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><Icon className={`h-5 w-5 ${warn?'text-amber-300':'text-brand-300'}`}/><p className="mt-3 text-xs text-slate-500">{label}</p><b className="text-xl">{value}</b></article>;
const Check=({label,detail,ok}:{label:string;detail:string;ok:boolean})=><div className="flex gap-3 rounded-xl bg-slate-950 p-3"><CheckCircle2 className={`h-5 w-5 shrink-0 ${ok?'text-emerald-400':'text-amber-400'}`}/><div><b className="text-sm">{label}</b><p className="text-xs text-slate-500">{detail}</p></div></div>;
const Field=({label,children}:{label:string;children:React.ReactNode})=><label><span className="mb-1 block text-xs text-slate-400">{label}</span>{children}</label>;
const RunCard=({run,selected,onSelect,onAction,actionLabel,busy}:{run:PayrollEngineRun;selected:boolean;onSelect:()=>void;onAction:()=>void;actionLabel:string;busy:boolean})=><article onClick={onSelect} className={`cursor-pointer rounded-2xl border p-4 ${selected?'border-brand-500 bg-brand-500/5':'border-slate-800 bg-slate-900'}`}><div className="flex justify-between gap-3"><div><b>{run.month}</b><p className="text-xs text-slate-500">{run.totalEmployees} employees · {labels[run.status]||run.status}</p></div><b>{money(run.totalNetPayout)}</b></div>{actionLabel&&<button onClick={e=>{e.stopPropagation();onAction()}} disabled={busy} className="mt-3 rounded-lg bg-indigo-500/20 px-3 py-1.5 text-xs text-indigo-300">{actionLabel}</button>}</article>;

