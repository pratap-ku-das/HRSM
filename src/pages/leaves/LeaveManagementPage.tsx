import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Check,
  Clock,
  Coins,
  DollarSign,
  Plus,
  RefreshCw,
  ShieldAlert,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type { LeaveRequest, LeaveType } from '../../types';
import type { LeaveEncashmentItem } from '../../types/leaveEncashment';
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
  const canReviewLeaves =
    currentUser?.permissions?.includes('leave.review') === true ||
    currentUser?.permissions?.includes('payroll.approve') === true ||
    currentUser?.role === 'COMPANY_ADMIN' ||
    currentUser?.role === 'HR_MANAGER';

  const [activeTab, setActiveTab] = useState<'requests' | 'encashment'>('requests');
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [encashmentRequests, setEncashmentRequests] = useState<LeaveEncashmentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningSla, setRunningSla] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await api.getLeaveAdministration();
      setTypes(data.types);
      setRequests(data.requests);

      if (canReviewLeaves) {
        const encashments = await api.getLeaveEncashmentRequests();
        setEncashmentRequests(encashments);
      }
    } catch (error) {
      toast.error('Leave administration could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast, canReviewLeaves]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const reviewEncashment = async (item: LeaveEncashmentItem, action: 'APPROVE' | 'REJECT') => {
    if (action === 'APPROVE') {
      if (
        !confirm(
          `Approve leave encashment of ₹${(item.amount || 0).toLocaleString('en-IN')} for ${item.employee?.firstName} ${item.employee?.lastName}? This will schedule the payout in active payroll.`,
        )
      ) {
        return;
      }
      setReviewingId(item.id);
      try {
        const res = await api.approveLeaveEncashmentRequest(item.id);
        toast.success(`Leave encashment approved and added to ${res.payrollMonth} payroll.`);
        await load();
      } catch (error) {
        toast.error('Encashment approval failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setReviewingId(null);
      }
    } else {
      const reason = prompt(`Enter rejection reason for ${item.employee?.firstName}'s encashment request:`);
      if (!reason?.trim()) return;
      setReviewingId(item.id);
      try {
        await api.rejectLeaveEncashmentRequest(item.id, reason.trim());
        toast.success('Leave encashment rejected');
        await load();
      } catch (error) {
        toast.error('Encashment rejection failed', error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setReviewingId(null);
      }
    }
  };

  const triggerSlaEscalation = async () => {
    setRunningSla(true);
    try {
      const res = await api.triggerSlaEscalationJob();
      toast.success(`SLA Escalation executed: ${res.escalated.length} overdue step(s) escalated to HR.`);
      await load();
    } catch (error) {
      toast.error('SLA escalation execution failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setRunningSla(false);
    }
  };

  return (
    <div className="neo-page neo-leaves space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarRange className="text-brand-400" />
            Leave Administration & Encashment
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage leave categories, review leave requests, and approve leave encashment with automatic SLA escalation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canReviewLeaves && (
            <button
              onClick={() => void triggerSlaEscalation()}
              disabled={runningSla}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              title="Scan and escalate overdue workflow steps exceeding SLA deadlines"
            >
              <ShieldAlert className={`h-4 w-4 ${runningSla ? 'animate-spin' : ''}`} />
              Run SLA Escalation
            </button>
          )}
          <button
            onClick={() => void load()}
            disabled={busy}
            aria-label="Refresh leave administration"
            className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-slate-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 border-b-2 pb-3 transition-colors ${
            activeTab === 'requests'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarRange className="h-4 w-4" />
          Leave Requests & Categories
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{requests.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('encashment')}
          className={`flex items-center gap-2 border-b-2 pb-3 transition-colors ${
            activeTab === 'encashment'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="h-4 w-4" />
          Leave Encashment (Payroll Integrated)
          {encashmentRequests.some((r) => r.status === 'PENDING') && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
              {encashmentRequests.filter((r) => r.status === 'PENDING').length} Pending
            </span>
          )}
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="font-semibold text-slate-100">Leave categories</h2>
            <p className="mb-4 text-xs text-slate-400">These categories appear in employee self-service leave and encashment.</p>
            {canManagePolicy && (
              <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
                <label className="flex-1">
                  <span className="mb-1 block text-xs text-slate-400">Category name</span>
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="For example: Earned Leave, Casual Leave, Sick Leave"
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  />
                </label>
                <button
                  disabled={busy || !name.trim()}
                  className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white disabled:opacity-50 hover:bg-brand-600"
                >
                  <Plus className="h-4 w-4" />
                  Add category
                </button>
              </form>
            )}
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {types.map((item) => (
                <article
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Tag className="h-4 w-4 text-brand-300 flex-shrink-0" />
                    <div>
                      <strong className="block truncate text-slate-200 text-sm">{item.name}</strong>
                      <span className="text-xs text-slate-400">
                        {item.code} · {item.isPaid ? 'Paid' : 'Unpaid'} · {item.daysAllowedPerYear} days/yr
                      </span>
                    </div>
                  </div>
                  {canManagePolicy && (
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={() => void remove(item)}
                      aria-label={`Delete ${item.name}`}
                      className="p-2 text-slate-500 hover:text-red-400 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!types.length && (
              <EmptyState title="No leave categories" description="Add a category so employees can apply for leave." icon={Tag} />
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold text-slate-100">Leave requests</h2>
            <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900/60">
              <table className="w-full min-w-[860px] text-xs">
                <thead>
                  <tr className="bg-slate-900 text-slate-400">
                    <th className="p-3 text-left">Employee</th>
                    <th className="text-left">Category</th>
                    <th className="text-left">Dates</th>
                    <th className="text-left">Days</th>
                    <th className="text-left">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id} className="border-t border-slate-800 hover:bg-slate-800/20">
                      <td className="p-3 font-medium text-slate-200">
                        {item.employee.firstName} {item.employee.lastName}
                        <small className="block text-slate-500">{item.employee.employeeCode}</small>
                      </td>
                      <td className="text-slate-300">{item.leaveType.name}</td>
                      <td className="text-slate-400">
                        {item.startDate.slice(0, 10)} – {item.endDate.slice(0, 10)}
                      </td>
                      <td className="font-semibold text-slate-200">{item.totalDays}</td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : item.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-300'
                              : item.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {item.status === 'PENDING' && item.canReview && item.workflowInstanceId ? (
                            <>
                              <button
                                type="button"
                                disabled={reviewingId === item.id}
                                onClick={() => void review(item, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId === item.id}
                                onClick={() => void review(item, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                            </>
                          ) : item.status === 'PENDING' ? (
                            <span className="text-slate-500">
                              {item.workflowInstanceId ? 'Assigned to another reviewer' : 'Workflow setup required'}
                            </span>
                          ) : (
                            <span className="text-slate-600">Completed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!requests.length && (
                <EmptyState title="No leave requests" description="No requests have been submitted yet." icon={CalendarRange} />
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'encashment' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-100">Leave Encashment Requests</h2>
              <p className="text-xs text-slate-400">
                Formula: (Basic Salary / 30) × Encashed Days. Approving automatically registers an EARNING in Payroll Adjustments.
              </p>
            </div>
          </div>

          <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="w-full min-w-[960px] text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-400">
                  <th className="p-3 text-left">Employee</th>
                  <th className="text-left">Category</th>
                  <th className="text-left">Encashed Days</th>
                  <th className="text-left">Payout Amount</th>
                  <th className="text-left">Payroll Month</th>
                  <th className="text-left">SLA Status</th>
                  <th className="text-left">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {encashmentRequests.map((item) => {
                  const p = item.payload;
                  return (
                    <tr key={item.id} className="border-t border-slate-800 hover:bg-slate-800/20">
                      <td className="p-3">
                        <strong className="block text-slate-200">
                          {item.employee?.firstName} {item.employee?.lastName}
                        </strong>
                        <span className="text-slate-500">
                          {item.employee?.employeeCode} · {item.employee?.department?.name || 'General'}
                        </span>
                      </td>
                      <td className="text-slate-300 font-medium">{p?.leaveTypeName || 'Earned Leave'}</td>
                      <td className="font-semibold text-slate-200">{p?.days || 0} days</td>
                      <td className="font-bold text-emerald-400">₹{(item.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="text-slate-400">{p?.payrollMonth || 'Active Month'}</td>
                      <td>
                        {item.isOverdue ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                            <AlertTriangle className="h-3 w-3" /> Overdue (Escalated)
                          </span>
                        ) : item.dueAt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Clock className="h-3 w-3 text-amber-400" />
                            Due: {new Date(item.dueAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : item.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-300'
                              : item.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {item.status === 'PENDING' && canReviewLeaves ? (
                            <>
                              <button
                                type="button"
                                disabled={reviewingId === item.id}
                                onClick={() => void reviewEncashment(item, 'REJECT')}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId === item.id}
                                onClick={() => void reviewEncashment(item, 'APPROVE')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Approve
                              </button>
                            </>
                          ) : (
                            <span className="text-slate-600">
                              {item.status === 'APPROVED' ? 'Added to Payroll' : item.status}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!encashmentRequests.length && (
              <EmptyState
                title="No leave encashment requests"
                description="When employees request leave encashment, they will appear here with payroll adjustment previews."
                icon={Coins}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
};
