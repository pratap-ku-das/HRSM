import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarDays, CreditCard, Receipt, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import type { AttendanceRecord, ExpenseClaim, Payslip } from '../../types';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { MyPaySection } from './MyPaySection';
type Section = 'attendance' | 'leave' | 'pay' | 'expenses';
type LeaveData = Awaited<ReturnType<typeof api.getMyLeave>>;
const sectionMeta = {
    attendance: { title: 'My Attendance', description: 'Your server-recorded punches and attendance status.', icon: CalendarCheck },
    leave: { title: 'My Leave', description: 'Balances, requests and leave applications.', icon: CalendarDays },
    pay: { title: 'My Pay', description: 'Your published payslips and net salary history.', icon: CreditCard },
    expenses: { title: 'My Expenses', description: 'Submit and track your expense claims.', icon: Receipt },
} as const;
export const EmployeeSelfServicePage: React.FC<{
    section: Section;
}> = ({ section }) => {
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
            if (section === 'attendance')
                setAttendance(await api.getMyAttendance());
            if (section === 'leave') {
                const data = await api.getMyLeave();
                setLeave(data);
                setLeaveForm(value => ({ ...value, leaveTypeId: data.types.some(type => type.id === value.leaveTypeId) ? value.leaveTypeId : data.types[0]?.id || '' }));
            }
            if (section === 'pay')
                setPayslips(await api.getMyPayslips());
            if (section === 'expenses')
                setExpenses(await api.getMyExpenses());
        }
        catch (error) {
            toast.error(`${meta.title} could not be loaded`, error instanceof Error ? error.message : 'Unknown error');
        }
        finally {
            setBusy(false);
        }
    }, [meta.title, section, toast]);
    useEffect(() => { void load(); }, [load]);
    const applyLeave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!leaveForm.leaveTypeId) {
            toast.error('Choose a leave category');
            return;
        }
        setBusy(true);
        try {
            await api.applyMyLeave(leaveForm);
            setLeaveForm(value => ({ ...value, startDate: '', endDate: '', reason: '' }));
            await load();
            toast.success('Leave request submitted');
        }
        catch (error) {
            toast.error('Leave request failed', error instanceof Error ? error.message : 'Unknown error');
            setBusy(false);
        }
    };
    const submitExpense = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            await api.submitMyExpense({ ...expenseForm, amount: Number(expenseForm.amount) });
            setExpenseForm(value => ({ ...value, title: '', amount: 0, notes: '' }));
            await load();
            toast.success('Expense claim submitted');
        }
        catch (error) {
            toast.error('Expense submission failed', error instanceof Error ? error.message : 'Unknown error');
            setBusy(false);
        }
    };
    return <div className="neo-page space-y-5">
    <header className="flex justify-between border-b border-slate-800 pb-4">
<div>
<h1 className="text-2xl font-bold flex gap-2">
<Icon className="text-brand-400"/>{meta.title}</h1>
<p className="text-xs text-slate-400">{meta.description}</p>
</div>
<button onClick={() => void load()} aria-label={`Refresh ${meta.title}`}>
<RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`}/>
</button>
</header>

    {section === 'attendance' && <div className="overflow-auto border border-slate-800 rounded-2xl">
<table className="w-full text-xs">
<thead>
<tr className="bg-slate-900">
<th className="p-3 text-left">Date</th>
<th className="text-left">Status</th>
<th className="text-left">Clock in</th>
<th className="text-left">Clock out</th>
<th className="text-left">Source</th>
</tr>
</thead>
<tbody>{attendance.map(item => <tr key={item.id} className="border-t border-slate-800">
<td className="p-3">{item.date.slice(0, 10)}</td>
<td>{item.status}</td>
<td>{item.clockInTime ? new Date(item.clockInTime).toLocaleTimeString() : '?'}</td>
<td>{item.clockOutTime ? new Date(item.clockOutTime).toLocaleTimeString() : '?'}</td>
<td>{item.source}</td>
</tr>)}</tbody>
</table>{!attendance.length && <EmptyState title="No attendance yet" description="Verified punches will appear here." icon={CalendarCheck}/>}</div>}

    {section === 'leave' && <><form onSubmit={applyLeave} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="mb-4 font-semibold">Apply for leave</h2><div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-slate-300">Leave category</span><select required disabled={!leave?.types.length} value={leaveForm.leaveTypeId} onChange={event => setLeaveForm(value => ({ ...value, leaveTypeId: event.target.value }))} className="input w-full"><option value="">Select a category</option>{leave?.types.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-medium text-slate-300">Reason</span><input required minLength={3} value={leaveForm.reason} onChange={event => setLeaveForm(value => ({ ...value, reason: event.target.value }))} placeholder="Why do you need leave?" className="input w-full"/></label><label><span className="mb-1.5 block text-xs font-medium text-slate-300">Start date</span><input required type="date" value={leaveForm.startDate} onChange={event => setLeaveForm(value => ({ ...value, startDate: event.target.value }))} className="input w-full"/></label><label><span className="mb-1.5 block text-xs font-medium text-slate-300">End date</span><input required type="date" min={leaveForm.startDate || undefined} value={leaveForm.endDate} onChange={event => setLeaveForm(value => ({ ...value, endDate: event.target.value }))} className="input w-full"/></label></div>{!leave?.types.length && <p className="mt-3 text-sm text-amber-300">No leave categories are available. Ask your company administrator to create one.</p>}<button disabled={busy || !leave?.types.length} className="mt-5 rounded-xl bg-brand-500 px-6 py-2.5 font-medium disabled:opacity-50">{busy ? 'Submitting…' : 'Apply leave'}</button></form><section><h2 className="mb-3 font-semibold">My requests</h2><div className="space-y-2">{leave?.requests.map(item => <article key={item.id} className="flex justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4"><div><strong>{leave.types.find(type => type.id === item.leaveTypeId)?.name || 'Leave'}</strong><p className="text-xs text-slate-500">{item.startDate.slice(0, 10)} — {item.endDate.slice(0, 10)} · {item.totalDays} days</p></div><span className="text-xs text-brand-300">{item.status}</span></article>)}</div>{!leave?.requests.length && <EmptyState title="No leave requests" description="Your submitted leave requests will appear here." icon={CalendarDays}/>}</section></>}

    {section === 'pay' && <MyPaySection payslips={payslips} busy={busy}/>}

    {section === 'expenses' && <>
<form onSubmit={submitExpense} className="grid md:grid-cols-6 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4">
<input required minLength={3} value={expenseForm.title} onChange={event => setExpenseForm({ ...expenseForm, title: event.target.value })} placeholder="Claim title" className="input"/>
<select value={expenseForm.category} onChange={event => setExpenseForm({ ...expenseForm, category: event.target.value as ExpenseClaim['category'] })} className="input">{['TRAVEL', 'MEALS', 'HARDWARE', 'CERTIFICATION', 'MISC'].map(item => <option key={item}>{item}</option>)}</select>
<input required type="number" min="1" value={expenseForm.amount || ''} onChange={event => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })} placeholder="Amount" className="input"/>
<input required type="date" value={expenseForm.expenseDate} onChange={event => setExpenseForm({ ...expenseForm, expenseDate: event.target.value })} className="input"/>
<input value={expenseForm.notes} onChange={event => setExpenseForm({ ...expenseForm, notes: event.target.value })} placeholder="Notes" className="input"/>
<button disabled={busy} className="bg-brand-500 rounded-xl">Submit claim</button>
</form>
<div className="space-y-2">{expenses.map(item => <article key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between">
<div>
<strong>{item.title}</strong>
<p className="text-xs text-slate-500">{item.category} ? {item.currency} {item.amount.toLocaleString()} ? {item.expenseDate.slice(0, 10)}</p>
</div>
<span className="text-xs text-brand-300">{item.status}</span>
</article>)}</div>
</>}
  </div>;
};
