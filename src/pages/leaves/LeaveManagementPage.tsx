import React, { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Check, Plus, RefreshCw, Tag, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import type { LeaveRequest, LeaveType } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/ui/EmptyState';

type Row = LeaveRequest & {
  employee: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
  leaveType: LeaveType;
  workflowInstanceId?: string;
  workflowStatus?: string;
  canReview: boolean;
};

export const LeaveManagementPage: React.FC = () => {
  const toast = useToast();
  const { currentUser } = useAuth();
  const canManagePolicy = currentUser?.permissions?.includes('leave.policy.manage') === true;
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.getLeaveAdministration();
      setTypes(data.types);
      setRequests(data.requests);
    } catch (error) {
      toast.error('Leave administration could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createLeaveTypeV1({ name });
      setName('');
      await load();
      toast.success('Leave category created');
    } catch (error) {
      toast.error('Category could not be saved', error instanceof Error ? error.message : 'Unknown error');
      setBusy(false);
    }
  };

  const remove = async (item: LeaveType) => {
    if (!confirm(`Delete ${item.name}?`)) return;
    setDeletingId(item.id);
    try {
      await api.deleteLeaveTypeV1(item.id);
      await load();
      toast.success('Leave category deleted');
    } catch (error) {
      toast.error('Delete failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setDeletingId(null);
    }
  };

  const review = async (item: Row, action: 'APPROVE' | 'REJECT') => {
    if (!item.workflowInstanceId) return;
    if (action === 'REJECT' && !confirm(`Reject ${item.employee.firstName}'s leave request?`)) return;
    setReviewingId(item.id);
    try {
      await api.actOnWorkflow(item.workflowInstanceId, action);
      toast.success(action === 'APPROVE' ? 'Leave approved' : 'Leave rejected');
      await load();
    } catch (error) {
      toast.error('Leave review failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setReviewingId(null);
    }
  };

  return <div className="neo-page neo-leaves space-y-6">
    <header className="flex items-start justify-between border-b border-slate-800 pb-4">
      <div>
        <h1 className="flex gap-2 text-2xl font-bold"><CalendarRange className="text-brand-400"/>Leave Administration</h1>
        <p className="mt-1 text-sm text-slate-400">Create leave categories and review requests assigned to you.</p>
      </div>
      <button onClick={() => void load()} aria-label="Refresh leave administration">
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`}/>
      </button>
    </header>

    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold">Leave categories</h2>
      <p className="mb-4 text-xs text-slate-500">These names appear in the Apply Leave form.</p>
      {canManagePolicy && <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="mb-1 block text-xs">Category name</span>
          <input required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="For example: Casual Leave" className="input w-full"/>
        </label>
        <button disabled={busy || !name.trim()} className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 disabled:opacity-50"><Plus className="h-4 w-4"/>Add category</button>
      </form>}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {types.map(item => <article key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex min-w-0 items-center gap-3"><Tag className="h-4 w-4 text-brand-300"/><strong className="truncate">{item.name}</strong></div>
          {canManagePolicy && <button type="button" disabled={deletingId === item.id} onClick={() => void remove(item)} aria-label={`Delete ${item.name}`} className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-50"><Trash2 className="h-4 w-4"/></button>}
        </article>)}
      </div>
      {!types.length && <EmptyState title="No leave categories" description="Add a category so employees can apply for leave." icon={Tag}/>}
    </section>

    <section>
      <h2 className="mb-3 font-semibold">Leave requests</h2>
      <div className="overflow-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="bg-slate-900">
              <th className="p-3 text-left">Employee</th>
              <th className="text-left">Category</th>
              <th className="text-left">Dates</th>
              <th className="text-left">Days</th>
              <th className="text-left">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>{requests.map(item => <tr key={item.id} className="border-t border-slate-800">
            <td className="p-3">{item.employee.firstName} {item.employee.lastName}<small className="block text-slate-500">{item.employee.employeeCode}</small></td>
            <td>{item.leaveType.name}</td>
            <td>{item.startDate.slice(0, 10)} – {item.endDate.slice(0, 10)}</td>
            <td>{item.totalDays}</td>
            <td><span className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${item.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-300' : item.status === 'PENDING' ? 'bg-amber-500/10 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>{item.status}</span></td>
            <td className="p-3">
              <div className="flex justify-end gap-2">
                {item.status === 'PENDING' && item.canReview && item.workflowInstanceId ? <>
                  <button type="button" disabled={reviewingId === item.id} onClick={() => void review(item, 'REJECT')} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-3 py-2 text-rose-300 disabled:opacity-50"><X className="h-4 w-4"/>Reject</button>
                  <button type="button" disabled={reviewingId === item.id} onClick={() => void review(item, 'APPROVE')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4"/>Approve</button>
                </> : item.status === 'PENDING' ? <span className="text-slate-500">{item.workflowInstanceId ? 'Assigned to another reviewer' : 'Workflow setup required'}</span> : <span className="text-slate-600">Completed</span>}
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </div>;
};
