import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Settings,
  ChevronRight,
  RefreshCw,
  Building2,
  CreditCard,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const SuperAdminSubscriptionsPage: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<{ stats: any; companies: any[] } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');

  // Override Modal
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('ACTIVE');
  const [overridePlan, setOverridePlan] = useState<string>('GROWTH');
  const [overrideDays, setOverrideDays] = useState<number>(30);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState<boolean>(false);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getSuperAdminSubscriptions({
        search: searchTerm,
        status: statusFilter,
        plan: planFilter,
      });
      setData(res);
    } catch (err: any) {
      toast.showToast({
        type: 'error',
        title: 'Super Admin Access Failed',
        message: err?.message || 'Failed to retrieve company subscription records.',
      });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, planFilter, toast]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleOpenOverrideModal = (company: any) => {
    setSelectedCompany(company);
    setOverrideStatus(company.status || 'ACTIVE');
    setOverridePlan(company.plan || 'GROWTH');
    setOverrideDays(30);
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedCompany) return;
    if (!overrideReason.trim()) {
      toast.showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'An audit reason is required for administrative subscription overrides.',
      });
      return;
    }

    try {
      setSubmittingOverride(true);
      await api.superAdminOverrideSubscription(selectedCompany.id, {
        status: overrideStatus,
        planCode: overridePlan,
        reason: overrideReason,
        extendDays: overrideDays,
      });

      toast.showToast({
        type: 'success',
        title: 'Access Override Recorded',
        message: `Subscription for ${selectedCompany.name} updated to ${overrideStatus} (${overridePlan}).`,
      });

      setOverrideModalOpen(false);
      await fetchSubscriptions();
    } catch (err: any) {
      toast.showToast({
        type: 'error',
        title: 'Override Failed',
        message: err?.message || 'Failed to apply subscription override.',
      });
    } finally {
      setSubmittingOverride(false);
    }
  };

  const stats = data?.stats || {
    totalCompanies: 0,
    totalRevenue: 0,
    activeSubscriptions: 0,
    trialSubscriptions: 0,
    pastDueSubscriptions: 0,
    cancelledSubscriptions: 0,
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-brand-400" />
            Super Admin: Company Subscriptions & Billing
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Global visibility across tenant subscriptions, Razorpay transaction volumes, and manual access controls.
          </p>
        </div>

        <button
          onClick={fetchSubscriptions}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Registry
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Companies</span>
          <div className="text-2xl font-bold text-white mt-1">{stats.totalCompanies}</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Revenue</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            ₹{stats.totalRevenue?.toLocaleString('en-IN') || 0}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Active</span>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{stats.activeSubscriptions}</div>
        </div>

        <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">Trial</span>
          <div className="text-2xl font-bold text-indigo-300 mt-1">{stats.trialSubscriptions}</div>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Past Due</span>
          <div className="text-2xl font-bold text-amber-300 mt-1">{stats.pastDueSubscriptions}</div>
        </div>

        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">Cancelled / Expired</span>
          <div className="text-2xl font-bold text-rose-300 mt-1">{stats.cancelledSubscriptions}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search company name or slug…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="PAST_DUE">Past Due</option>
              <option value="HALTED">Halted</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="py-1.5 px-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">All Plans</option>
            <option value="STARTER">Starter (₹299)</option>
            <option value="GROWTH">Growth (₹799)</option>
            <option value="BUSINESS">Business (₹1,199)</option>
          </select>
        </div>
      </div>

      {/* Companies Subscriptions Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {loading && !data ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
            <p className="mt-3 text-xs text-slate-400">Loading company subscriptions…</p>
          </div>
        ) : (data?.companies || []).length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No matching companies found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Company</th>
                  <th className="py-3 px-4 font-semibold">Plan</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Staff</th>
                  <th className="py-3 px-4 font-semibold">Billing Expiry / Renewal</th>
                  <th className="py-3 px-4 font-semibold">Razorpay Sub ID</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data?.companies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400">{c.email} • {c.slug}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white">{c.planName}</span>
                      <div className="text-[10px] text-slate-400 font-mono">₹{c.price}/mo</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : c.status === 'TRIAL'
                            ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">{c.employeeCount}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {c.currentPeriodEnd
                        ? new Date(c.currentPeriodEnd).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : c.trialEndsAt
                        ? `Trial ends ${new Date(c.trialEndsAt).toLocaleDateString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {c.razorpaySubscriptionId || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenOverrideModal(c)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                      >
                        Manage Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Override Modal */}
      {overrideModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-brand-400" />
              Administrative Subscription Override
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Directly grant or adjust subscription tier for <strong className="text-white">{selectedCompany.name}</strong>.
              All administrative overrides are logged in the SOC-2 audit stream.
            </p>

            <div className="mt-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Target Status</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ACTIVE">ACTIVE (Full access)</option>
                  <option value="TRIAL">TRIAL (14-day evaluation)</option>
                  <option value="PAST_DUE">PAST_DUE (Grace period)</option>
                  <option value="HALTED">HALTED (Payment halted)</option>
                  <option value="EXPIRED">EXPIRED (Restricted)</option>
                  <option value="CANCELLED">CANCELLED (Cancelled at term)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Assigned Plan</label>
                <select
                  value={overridePlan}
                  onChange={(e) => setOverridePlan(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="STARTER">Starter — ₹299/mo</option>
                  <option value="GROWTH">Growth — ₹799/mo</option>
                  <option value="BUSINESS">Business — ₹1,199/mo</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Extension Duration (Days from now)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={overrideDays}
                  onChange={(e) => setOverrideDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Audit Log Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Granted 30-day enterprise pilot extension per executive agreement."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                disabled={submittingOverride}
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={submittingOverride}
                onClick={handleSaveOverride}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 transition-colors flex items-center gap-1.5"
              >
                {submittingOverride ? 'Saving…' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

