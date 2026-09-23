import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, CreditCard, Receipt, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import type { AttendanceRecord, ExpenseClaim, Payslip } from '../../types';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/ui/EmptyState';

type Section = 'attendance' | 'leave' | 'pay' | 'expenses';
type LeaveData = Awaited<ReturnType<typeof api.getMyLeave>>;

const sectionMeta = {
  attendance: { title: 'My Attendance', description: 'Your server-recorded punches and attendance status.', icon: CalendarCheck },
  leave: { title: 'My Leave', description: 'Balances, requests and leave applications.', icon: CalendarDays },
  pay: { title: 'My Pay', description: 'Your published payslips and net salary history.', icon: CreditCard },
  expenses: { title: 'My Expenses', description: 'Submit and track your expense claims.', icon: Receipt },
} as const;

export const EmployeeSelfServicePage: React.FC<{ section: Section }> = ({ section }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leave, setLeave] = useState<LeaveData | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [leaveForm, setLeaveForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [expenseForm, setExpenseForm] = useState({ title: '', category: 'TRAVEL' as ExpenseClaim['category'], amount: 0, expenseDate: new Date().toISOString().slice(0, 10), notes: '' });
  const meta = sectionMeta[section];
  const Icon = meta.icon;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (section === 'attendance') setAttendance(await api.getMyAttendance());
      if (section === 'leave') {
        const data = await api.getMyLeave();
        setLeave(data);
        setLeaveForm(value => ({ ...value, leaveTypeId: value.leaveTypeId || data.types[0]?.id || '' }));
      }
      if (section === 'pay') setPayslips(await api.getMyPayslips());
      if (section === 'expenses') setExpenses(await api.getMyExpenses());
    } catch (error) {
      toast.error(`${meta.title} could not be loaded`, error instanceof Error ? error.message : 'Unknown error');
    } finally { setBusy(false); }
  }, [meta.title, section, toast]);
  useEffect(() => { void load(); }, [load]);

  const applyLeave = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await api.applyMyLeave(leaveForm); setLeaveForm(value => ({ ...value, startDate: '', endDate: '', reason: '' })); await load(); toast.success('Leave request submitted'); }
    catch (error) { toast.error('Leave request failed', error instanceof Error ? error.message : 'Unknown error'); setBusy(false); }
  };
  const submitExpense = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await api.submitMyExpense({ ...expenseForm, amount: Number(expenseForm.amount) }); setExpenseForm(value => ({ ...value, title: '', amount: 0, notes: '' })); await load(); toast.success('Expense claim submitted'); }
    catch (error) { toast.error('Expense submission failed', error instanceof Error ? error.message : 'Unknown error'); setBusy(false); }
  };

  return <div className="neo-page space-y-5">
    <header className="flex justify-between border-b border-slate-800 pb-4"><div><h1 className="text-2xl font-bold flex gap-2"><Icon className="text-brand-400"/>{meta.title}</h1><p className="text-xs text-slate-400">{meta.description}</p></div><button onClick={() => void load()} aria-label={`Refresh ${meta.title}`}><RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`}/></button></header>

    {section === 'attendance' && <div className="overflow-auto border border-slate-800 rounded-2xl"><table className="w-full text-xs"><thead><tr className="bg-slate-900"><th className="p-3 text-left">Date</th><th className="text-left">Status</th><th className="text-left">Clock in</th><th className="text-left">Clock out</th><th className="text-left">Source</th></tr></thead><tbody>{attendance.map(item => <tr key={item.id} className="border-t border-slate-800"><td className="p-3">{item.date.slice(0, 10)}</td><td>{item.status}</td><td>{item.clockInTime ? new Date(item.clockInTime).toLocaleTimeString() : '?'}</td><td>{item.clockOutTime ? new Date(item.clockOutTime).toLocaleTimeString() : '?'}</td><td>{item.source}</td></tr>)}</tbody></table>{!attendance.length && <EmptyState title="No attendance yet" description="Verified punches will appear here." icon={CalendarCheck}/>}</div>}

    {section === 'leave' && <><div className="grid md:grid-cols-3 gap-3">{leave?.balances.map(balance => { const type = leave.types.find(item => item.id === balance.leaveTypeId); return <article key={balance.leaveTypeId} className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><strong>{type?.name || 'Leave'}</strong><p className="text-2xl font-bold text-brand-300 mt-2">{balance.available.toFixed(1)}</p><small className="text-slate-500">days available ? {balance.used.toFixed(1)} used</small></article>; })}</div><form onSubmit={applyLeave} className="grid md:grid-cols-5 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4"><select required value={leaveForm.leaveTypeId} onChange={event => setLeaveForm({ ...leaveForm, leaveTypeId: event.target.value })} className="input"><option value="">Leave type</option>{leave?.types.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input required type="date" value={leaveForm.startDate} onChange={event => setLeaveForm({ ...leaveForm, startDate: event.target.value })} className="input"/><input required type="date" value={leaveForm.endDate} onChange={event => setLeaveForm({ ...leaveForm, endDate: event.target.value })} className="input"/><input required minLength={3} value={leaveForm.reason} onChange={event => setLeaveForm({ ...leaveForm, reason: event.target.value })} placeholder="Reason" className="input"/><button disabled={busy} className="bg-brand-500 rounded-xl">Apply leave</button></form><div className="space-y-2">{leave?.requests.map(item => <article key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between"><div><strong>{leave.types.find(type => type.id === item.leaveTypeId)?.name || 'Leave'}</strong><p className="text-xs text-slate-500">{item.startDate.slice(0, 10)} ? {item.endDate.slice(0, 10)} ? {item.totalDays} days</p></div><span className="text-xs text-brand-300">{item.status}</span></article>)}</div></>}

    {section === 'pay' && <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{payslips.map(item => <article key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><small className="text-slate-500">{item.month}</small><p className="text-2xl font-bold mt-2">?{item.netSalary.toLocaleString()}</p><p className="text-xs text-slate-500">Gross ?{item.grossSalary.toLocaleString()} ? Deductions ?{item.totalDeductions.toLocaleString()}</p><span className="inline-block mt-3 text-xs text-brand-300">{item.status}</span></article>)}{!payslips.length && <EmptyState title="No payslips published" description="Published payslips will appear here." icon={CreditCard}/>}</div>}

    {section === 'expenses' && <><form onSubmit={submitExpense} className="grid md:grid-cols-6 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4"><input required minLength={3} value={expenseForm.title} onChange={event => setExpenseForm({ ...expenseForm, title: event.target.value })} placeholder="Claim title" className="input"/><select value={expenseForm.category} onChange={event => setExpenseForm({ ...expenseForm, category: event.target.value as ExpenseClaim['category'] })} className="input">{['TRAVEL','MEALS','HARDWARE','CERTIFICATION','MISC'].map(item => <option key={item}>{item}</option>)}</select><input required type="number" min="1" value={expenseForm.amount || ''} onChange={event => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })} placeholder="Amount" className="input"/><input required type="date" value={expenseForm.expenseDate} onChange={event => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} className="input"/><input value={expenseForm.notes} onChange={event => setExpenseForm({ ...expenseForm, notes: event.target.value })} placeholder="Notes" className="input"/><button disabled={busy} className="bg-brand-500 rounded-xl">Submit claim</button></form><div className="space-y-2">{expenses.map(item => <article key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between"><div><strong>{item.title}</strong><p className="text-xs text-slate-500">{item.category} ? {item.currency} {item.amount.toLocaleString()} ? {item.expenseDate.slice(0, 10)}</p></div><span className="text-xs text-brand-300">{item.status}</span></article>)}</div></>}
  </div>;
};
