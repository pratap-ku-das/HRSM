import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  Coins,
  CreditCard,
  DollarSign,
  Info,
  Receipt,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api';
import type { AttendanceRecord, ExpenseClaim, Payslip } from '../../types';
import type {
  LeaveEncashmentEligibility,
  LeaveEncashmentItem,
} from '../../types/leaveEncashment';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { MyPaySection } from './MyPaySection';

type Section = 'attendance' | 'leave' | 'pay' | 'expenses';
type LeaveData = Awaited<ReturnType<typeof api.getMyLeave>>;

const sectionMeta = {
  attendance: {
    title: 'My Attendance',
    description: 'Your server-recorded punches and attendance status.',
    icon: CalendarCheck,
  },
  leave: {
    title: 'My Leave & Encashment',
    description: 'Balances, requests, and leave encashment simulation.',
    icon: CalendarDays,
  },
  pay: {
    title: 'My Pay',
    description: 'Your published payslips and net salary history.',
    icon: CreditCard,
  },
  expenses: {
    title: 'My Expenses',
    description: 'Submit and track your expense claims.',
    icon: Receipt,
  },
} as const;

export const EmployeeSelfServicePage: React.FC<{
  section: Section;
}> = ({ section }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leave, setLeave] = useState<LeaveData | null>(null);
  const [encashmentEligibility, setEncashmentEligibility] =
    useState<LeaveEncashmentEligibility | null>(null);
  const [encashmentRequests, setEncashmentRequests] = useState<
    LeaveEncashmentItem[]
  >([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [leaveSubTab, setLeaveSubTab] = useState<'apply' | 'encash'>('apply');

  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const [encashmentForm, setEncashmentForm] = useState({
    leaveTypeId: '',
    days: 1,
    reason: '',
  });

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'TRAVEL' as ExpenseClaim['category'],
    amount: 0,
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const meta = sectionMeta[section];
  const Icon = meta.icon;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (section === 'attendance') {
        setAttendance(await api.getMyAttendance());
      }
      if (section === 'leave') {
        const [leaveData, eligData, encashmentData] = await Promise.all([
          api.getMyLeave(),
          api.getLeaveEncashmentEligibility().catch(() => null),
          api.getLeaveEncashmentRequests().catch(() => []),
        ]);
        setLeave(leaveData);
        setEncashmentEligibility(eligData);
        setEncashmentRequests(encashmentData || []);

        setLeaveForm((value) => ({
          ...value,
          leaveTypeId: leaveData.types.some(
            (type) => type.id === value.leaveTypeId,
          )
            ? value.leaveTypeId
            : leaveData.types[0]?.id || '',
        }));

        if (eligData && eligData.leaveTypes.length > 0) {
          const firstElig = eligData.leaveTypes.find((lt) => lt.eligible);
          if (firstElig) {
            setEncashmentForm((prev) => ({
              ...prev,
              leaveTypeId: prev.leaveTypeId || firstElig.leaveTypeId,
            }));
          }
        }
      }
      if (section === 'pay') {
        setPayslips(await api.getMyPayslips());
      }
      if (section === 'expenses') {
        setExpenses(await api.getMyExpenses());
      }
    } catch (error) {
      toast.error(
        `${meta.title} could not be loaded`,
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }, [meta.title, section, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyLeave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!leaveForm.leaveTypeId) {
      toast.error('Choose a leave category');
      return;
    }
    setBusy(true);
    try {
      await api.applyMyLeave(leaveForm);
      setLeaveForm((value) => ({
        ...value,
        startDate: '',
        endDate: '',
        reason: '',
      }));
      await load();
      toast.success('Leave request submitted');
    } catch (error) {
      toast.error(
        'Leave request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitEncashment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!encashmentForm.leaveTypeId) {
      toast.error('Choose an eligible leave category');
      return;
    }
    setBusy(true);
    try {
      const res = await api.requestLeaveEncashment({
        leaveTypeId: encashmentForm.leaveTypeId,
        days: Number(encashmentForm.days),
        reason: encashmentForm.reason,
      });
      toast.success(
        `Leave encashment request for ₹${(
          res.serviceRequest.amount || 0
        ).toLocaleString('en-IN')} submitted.`,
      );
      setEncashmentForm((prev) => ({ ...prev, days: 1, reason: '' }));
      await load();
    } catch (error) {
      toast.error(
        'Encashment request failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.submitMyExpense({
        ...expenseForm,
        amount: Number(expenseForm.amount),
      });
      setExpenseForm((value) => ({ ...value, title: '', amount: 0, notes: '' }));
      await load();
      toast.success('Expense claim submitted');
    } catch (error) {
      toast.error(
        'Expense submission failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const selectedEncashType = encashmentEligibility?.leaveTypes.find(
    (lt) => lt.leaveTypeId === encashmentForm.leaveTypeId,
  );
  const dailyRate = encashmentEligibility?.dailyRate || 0;
  const estimatedEncashmentPayout = Math.round(
    dailyRate * Number(encashmentForm.days || 0) * 100,
  ) / 100;

  return (
    <div className="neo-page neo-self-service space-y-6">
      <header className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-100">
            <Icon className="text-brand-400" />
            {meta.title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{meta.description}</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={busy}
          aria-label="Refresh section"
          className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-slate-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {section === 'attendance' && (
        <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-400">
                <th className="p-3 text-left">Date</th>
                <th className="text-left">Status</th>
                <th className="text-left">Clock in</th>
                <th className="text-left">Clock out</th>
                <th className="text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-800 hover:bg-slate-800/20"
                >
                  <td className="p-3 text-slate-200">
                    {item.date ? String(item.date).slice(0, 10) : '—'}
                  </td>
                  <td>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold text-xs ${
                        item.status === 'PRESENT'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : item.status === 'LATE'
                          ? 'bg-amber-500/10 text-amber-300'
                          : 'bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="text-slate-300">
                    {item.clockInTime
                      ? new Date(item.clockInTime).toLocaleTimeString()
                      : '—'}
                  </td>
                  <td className="text-slate-300">
                    {item.clockOutTime
                      ? new Date(item.clockOutTime).toLocaleTimeString()
                      : '—'}
                  </td>
                  <td className="text-slate-400">{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!attendance.length && (
            <EmptyState
              title="No attendance yet"
              description="Verified punches will appear here."
              icon={CalendarCheck}
            />
          )}
        </div>
      )}

      {section === 'leave' && (
        <div className="space-y-6">
          {/* Leave Balances Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leave?.balances.map((b) => {
              const lt = leave.types.find((t) => t.id === b.leaveTypeId);
              return (
                <article
                  key={b.leaveTypeId}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lt?.name || 'Leave'}
                  </span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-slate-100">
                      {b.available.toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-400">days available</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400">
                    <span>Entitlement: {b.entitlement.toFixed(1)}d</span>
                    <span>Used: {b.used.toFixed(1)}d</span>
                    {(b as Record<string, unknown>).encashed ? (
                      <span className="text-amber-400 font-medium">
                        Encashed: {Number((b as Record<string, unknown>).encashed).toFixed(1)}d
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Sub-tab selection: Apply vs Encash */}
          <div className="flex border-b border-slate-800 gap-4 text-sm font-semibold">
            <button
              onClick={() => setLeaveSubTab('apply')}
              className={`flex items-center gap-2 border-b-2 pb-2.5 transition-colors ${
                leaveSubTab === 'apply'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Apply for Leave
            </button>
            <button
              onClick={() => setLeaveSubTab('encash')}
              className={`flex items-center gap-2 border-b-2 pb-2.5 transition-colors ${
                leaveSubTab === 'encash'
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Coins className="h-4 w-4" />
              Encash Leave
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[11px] font-bold text-emerald-400">
                Payout Preview
              </span>
            </button>
          </div>

          {leaveSubTab === 'apply' && (
            <form
              onSubmit={applyLeave}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
            >
              <h2 className="mb-4 font-semibold text-slate-100">Apply for leave</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    Leave category
                  </span>
                  <select
                    required
                    disabled={!leave?.types.length}
                    value={leaveForm.leaveTypeId}
                    onChange={(event) =>
                      setLeaveForm((value) => ({
                        ...value,
                        leaveTypeId: event.target.value,
                      }))
                    }
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  >
                    <option value="">Select a category</option>
                    {leave?.types.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    Reason
                  </span>
                  <input
                    required
                    minLength={3}
                    value={leaveForm.reason}
                    onChange={(event) =>
                      setLeaveForm((value) => ({
                        ...value,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="Why do you need leave?"
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    Start date
                  </span>
                  <input
                    required
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(event) =>
                      setLeaveForm((value) => ({
                        ...value,
                        startDate: event.target.value,
                      }))
                    }
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    End date
                  </span>
                  <input
                    required
                    type="date"
                    min={leaveForm.startDate || undefined}
                    value={leaveForm.endDate}
                    onChange={(event) =>
                      setLeaveForm((value) => ({
                        ...value,
                        endDate: event.target.value,
                      }))
                    }
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  />
                </label>
              </div>
              {!leave?.types.length && (
                <p className="mt-3 text-sm text-amber-300">
                  No leave categories are available. Ask your company administrator
                  to create one.
                </p>
              )}
              <button
                disabled={busy || !leave?.types.length}
                className="mt-5 rounded-xl bg-brand-500 px-6 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? 'Submitting…' : 'Apply leave'}
              </button>
            </form>
          )}

          {leaveSubTab === 'encash' && (
            <div className="space-y-6">
              {/* Formula & Policy Card */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-semibold text-emerald-400">
                  <Sparkles className="h-4 w-4" />
                  Leave Encashment Policy & Calculation
                </div>
                <p className="mt-1 text-slate-400">
                  Daily Payout Rate = Monthly Basic Salary ÷ 30 days. Payout = Daily
                  Rate × Encashed Days.
                  A minimum buffer of{' '}
                  <strong className="text-slate-200">
                    {encashmentEligibility?.minBufferDays || 10} days
                  </strong>{' '}
                  must remain in your balance after encashment. Approved encashments
                  are credited in active payroll.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-slate-500">Monthly Basic Salary</span>
                    <strong className="block text-sm text-slate-200">
                      ₹{(encashmentEligibility?.monthlyBasic || 0).toLocaleString('en-IN')}
                    </strong>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <span className="text-slate-500">Per-Day Encashment Rate</span>
                    <strong className="block text-sm text-emerald-400">
                      ₹{(dailyRate || 0).toLocaleString('en-IN')}/day
                    </strong>
                  </div>
                </div>
              </div>

              {/* Encashment Application Form */}
              <form
                onSubmit={submitEncashment}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4"
              >
                <h2 className="font-semibold text-slate-100">
                  Request Leave Encashment
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-slate-300">
                      Leave Category
                    </span>
                    <select
                      required
                      value={encashmentForm.leaveTypeId}
                      onChange={(e) =>
                        setEncashmentForm((prev) => ({
                          ...prev,
                          leaveTypeId: e.target.value,
                        }))
                      }
                      className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                    >
                      <option value="">Select an eligible leave category</option>
                      {encashmentEligibility?.leaveTypes.map((type) => (
                        <option
                          key={type.leaveTypeId}
                          value={type.leaveTypeId}
                          disabled={!type.eligible}
                        >
                          {type.name} (Max encashable: {type.maxEncashable} days)
                          {!type.eligible ? ` — ${type.ineligibleReason || 'Ineligible'}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-slate-300">
                      Days to Encash
                    </span>
                    <input
                      required
                      type="number"
                      step="0.5"
                      min="1"
                      max={selectedEncashType?.maxEncashable || 30}
                      value={encashmentForm.days}
                      onChange={(e) =>
                        setEncashmentForm((prev) => ({
                          ...prev,
                          days: Math.max(1, Number(e.target.value)),
                        }))
                      }
                      className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">
                    Reason for Encashment
                  </span>
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={encashmentForm.reason}
                    onChange={(e) =>
                      setEncashmentForm((prev) => ({
                        ...prev,
                        reason: e.target.value,
                      }))
                    }
                    placeholder="E.g. Festival encashment, annual leave conversion"
                    className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
                  />
                </label>

                {/* Instant Calculation Preview */}
                {selectedEncashType && (
                  <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Available Balance:</span>{' '}
                      <strong className="text-slate-200">
                        {selectedEncashType.availableBalance} days
                      </strong>
                      <span className="mx-2 text-slate-600">·</span>
                      <span className="text-slate-400">Retention Buffer:</span>{' '}
                      <strong className="text-slate-200">
                        {selectedEncashType.minBufferDays} days
                      </strong>
                      <span className="mx-2 text-slate-600">·</span>
                      <span className="text-slate-400">Remaining After:</span>{' '}
                      <strong className="text-slate-200">
                        {selectedEncashType.availableBalance - Number(encashmentForm.days)} days
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Estimated Payout</span>
                      <strong className="text-lg text-emerald-400 font-bold">
                        ₹{estimatedEncashmentPayout.toLocaleString('en-IN')}
                      </strong>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    busy ||
                    !selectedEncashType?.eligible ||
                    Number(encashmentForm.days) > (selectedEncashType?.maxEncashable || 0)
                  }
                  className="rounded-xl bg-brand-500 px-6 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
                >
                  <Coins className="h-4 w-4" />
                  {busy ? 'Submitting…' : 'Submit Encashment Request'}
                </button>
              </form>

              {/* Past Encashment Requests */}
              <section>
                <h3 className="mb-3 font-semibold text-slate-100">
                  Encashment History & Status
                </h3>
                <div className="space-y-2">
                  {encashmentRequests.map((item) => (
                    <article
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-xs"
                    >
                      <div>
                        <strong className="text-sm text-slate-200 block">
                          {item.title}
                        </strong>
                        <p className="mt-0.5 text-slate-400">
                          {item.reason} · Applied on{' '}
                          {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <strong className="text-emerald-400 text-sm block">
                          ₹{(item.amount || 0).toLocaleString('en-IN')}
                        </strong>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 font-semibold text-[11px] mt-1 ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : item.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-300'
                              : 'bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </article>
                  ))}
                  {!encashmentRequests.length && (
                    <EmptyState
                      title="No encashment requests"
                      description="Your submitted leave encashment requests will appear here."
                      icon={Coins}
                    />
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Regular Leave Requests List */}
          {leaveSubTab === 'apply' && (
            <section>
              <h2 className="mb-3 font-semibold text-slate-100">My requests</h2>
              <div className="space-y-2">
                {leave?.requests.map((item) => (
                  <article
                    key={item.id}
                    className="flex justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <div>
                      <strong className="text-slate-200">
                        {leave.types.find((type) => type.id === item.leaveTypeId)
                          ?.name || 'Leave'}
                      </strong>
                      <p className="text-xs text-slate-500">
                        {item.startDate.slice(0, 10)} — {item.endDate.slice(0, 10)} ·{' '}
                        {item.totalDays} days
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        item.status === 'APPROVED'
                          ? 'text-emerald-400'
                          : item.status === 'REJECTED'
                          ? 'text-rose-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {item.status}
                    </span>
                  </article>
                ))}
              </div>
              {!leave?.requests.length && (
                <EmptyState
                  title="No leave requests"
                  description="Your submitted leave requests will appear here."
                  icon={CalendarDays}
                />
              )}
            </section>
          )}
        </div>
      )}

      {section === 'pay' && <MyPaySection payslips={payslips} busy={busy} />}

      {section === 'expenses' && (
        <>
          <form
            onSubmit={submitExpense}
            className="grid md:grid-cols-6 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4"
          >
            <input
              required
              minLength={3}
              value={expenseForm.title}
              onChange={(event) =>
                setExpenseForm({ ...expenseForm, title: event.target.value })
              }
              placeholder="Claim title"
              className="input bg-slate-950 text-sm border-slate-700 rounded-xl"
            />
            <select
              value={expenseForm.category}
              onChange={(event) =>
                setExpenseForm({
                  ...expenseForm,
                  category: event.target.value as ExpenseClaim['category'],
                })
              }
              className="input bg-slate-950 text-sm border-slate-700 rounded-xl"
            >
              {['TRAVEL', 'MEALS', 'HARDWARE', 'CERTIFICATION', 'MISC'].map(
                (item) => (
                  <option key={item}>{item}</option>
                ),
              )}
            </select>
            <input
              required
              type="number"
              min="1"
              value={expenseForm.amount || ''}
              onChange={(event) =>
                setExpenseForm({
                  ...expenseForm,
                  amount: Number(event.target.value),
                })
              }
              placeholder="Amount"
              className="input bg-slate-950 text-sm border-slate-700 rounded-xl"
            />
            <input
              required
              type="date"
              value={expenseForm.expenseDate}
              onChange={(event) =>
                setExpenseForm({
                  ...expenseForm,
                  expenseDate: event.target.value,
                })
              }
              className="input bg-slate-950 text-sm border-slate-700 rounded-xl"
            />
            <input
              value={expenseForm.notes}
              onChange={(event) =>
                setExpenseForm({ ...expenseForm, notes: event.target.value })
              }
              placeholder="Notes"
              className="input bg-slate-950 text-sm border-slate-700 rounded-xl"
            />
            <button
              disabled={busy}
              className="bg-brand-500 rounded-xl font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Submit claim
            </button>
          </form>
          <div className="space-y-2">
            {expenses.map((item) => (
              <article
                key={item.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between"
              >
                <div>
                  <strong className="text-slate-200">{item.title}</strong>
                  <p className="text-xs text-slate-500">
                    {item.category} · {item.currency} {item.amount.toLocaleString()}{' '}
                    · {item.expenseDate.slice(0, 10)}
                  </p>
                </div>
                <span className="text-xs text-brand-300 font-medium">
                  {item.status}
                </span>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
