import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar,
  CalendarCheck2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Filter,
  ShieldAlert,
  ShieldCheck,
  User,
  ArrowUpRight,
  ChevronRight,
  Layers,
  FileText,
  Search,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { calendarApi, type CalendarOverview, type CalendarObligation } from "./calendarApi";

interface Props {
  onNavigateTab?: (tab: string) => void;
}

const DOMAIN_LABELS: Record<string, { label: string; color: string }> = {
  EPF_ECR: { label: "EPF / ECR", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  ESIC_MONTHLY: { label: "ESIC", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  TDS_24Q: { label: "TDS (24Q / 138)", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  PROFESSIONAL_TAX: { label: "Professional Tax", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  UPCOMING: { label: "Upcoming", bg: "bg-slate-800", text: "text-slate-300" },
  DUE_SOON: { label: "Due Soon (≤7d)", bg: "bg-amber-500/20", text: "text-amber-300" },
  DUE_TODAY: { label: "Due Today", bg: "bg-orange-500/20", text: "text-orange-300 font-semibold" },
  OVERDUE: { label: "OVERDUE", bg: "bg-rose-500/20", text: "text-rose-300 font-bold" },
  FILED: { label: "Return Filed", bg: "bg-blue-500/20", text: "text-blue-300" },
  PAID: { label: "Challan Paid", bg: "bg-emerald-500/20", text: "text-emerald-300" },
  COMPLETED: { label: "Fully Completed", bg: "bg-emerald-500/30", text: "text-emerald-200 font-semibold" },
  EXEMPT: { label: "Exempt", bg: "bg-slate-800", text: "text-slate-400" },
  NEEDS_REVIEW: { label: "Needs Review", bg: "bg-yellow-500/20", text: "text-yellow-300" },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const ComplianceCalendarTab: React.FC<Props> = ({ onNavigateTab }) => {
  const toast = useToast();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getUTCFullYear());
  const [overview, setOverview] = useState<CalendarOverview | null>(null);
  const [obligations, setObligations] = useState<CalendarObligation[]>([]);

  // Filter States
  const [viewMode, setViewMode] = useState<"list" | "months">("months");
  const [domainFilter, setDomainFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Target Date Modal
  const [editingTargetObligation, setEditingTargetObligation] = useState<CalendarObligation | null>(null);
  const [newTargetDate, setNewTargetDate] = useState<string>("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ovData, obList] = await Promise.all([
        calendarApi.getOverview(selectedYear),
        calendarApi.getObligations({ year: selectedYear }),
      ]);
      setOverview(ovData);
      setObligations(obList);
    } catch (err: unknown) {
      toast.error("Failed to load compliance calendar", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await calendarApi.syncCalendar(selectedYear);
      toast.success("Calendar synchronized", `Processed ${res.totalProcessed} obligations (${res.syncedFilings} filings linked).`);
      await loadData();
    } catch (err: unknown) {
      toast.error("Sync failed", err instanceof Error ? err.message : "Error");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveTargetDate = async () => {
    if (!editingTargetObligation) return;
    try {
      await calendarApi.updateTargetDate(editingTargetObligation.id, newTargetDate || null);
      toast.success("Target date updated");
      setEditingTargetObligation(null);
      await loadData();
    } catch (err: unknown) {
      toast.error("Update failed", err instanceof Error ? err.message : "Error");
    }
  };

  const handleCompleteManual = async (ob: CalendarObligation) => {
    const confirm = window.confirm(`Mark "${ob.domain} ${ob.obligationType}" as manually completed?`);
    if (!confirm) return;
    try {
      await calendarApi.completeObligation(ob.id, "Manually marked completed by compliance officer");
      toast.success("Obligation completed");
      await loadData();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : "Error");
    }
  };

  const filteredObligations = useMemo(() => {
    return obligations.filter((o) => {
      if (domainFilter !== "ALL" && o.domain !== domainFilter) return false;
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (jurisdictionFilter !== "ALL" && o.jurisdiction !== jurisdictionFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const titleMatch = (o.obligationType || "").toLowerCase().includes(q);
        const domainMatch = (o.domain || "").toLowerCase().includes(q);
        const jurMatch = (o.jurisdiction || "").toLowerCase().includes(q);
        if (!titleMatch && !domainMatch && !jurMatch) return false;
      }
      return true;
    });
  }, [obligations, domainFilter, statusFilter, jurisdictionFilter, searchTerm]);

  // Group by Month for Month View
  const obligationsByMonth = useMemo(() => {
    const map = new Map<number, CalendarObligation[]>();
    for (let m = 1; m <= 12; m++) map.set(m, []);
    for (const o of filteredObligations) {
      const dueMonth = new Date(o.statutoryDueDate).getUTCMonth() + 1;
      const list = map.get(dueMonth) || [];
      list.push(o);
      map.set(dueMonth, list);
    }
    return map;
  }, [filteredObligations]);

  const navigateToDomainModule = (domain: string) => {
    if (!onNavigateTab) return;
    switch (domain) {
      case "EPF_ECR":
        onNavigateTab("epfCompliance");
        break;
      case "ESIC_MONTHLY":
        onNavigateTab("esicCompliance");
        break;
      case "TDS_24Q":
        onNavigateTab("tdsCompliance");
        break;
      case "PROFESSIONAL_TAX":
        onNavigateTab("ptCompliance");
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
            <CalendarCheck2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Unified Statutory Compliance Calendar</h2>
            <p className="text-xs text-slate-400">
              Orchestrate legal deadlines, internal targets, and filing synchronizations across EPF, ESIC, TDS, and Multi-State PT.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200"
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                Calendar Year {y}
              </option>
            ))}
          </select>

          <button
            onClick={() => void handleSync()}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Obligations"}
          </button>

          <a
            href={calendarApi.exportScheduleUrl(selectedYear, "csv")}
            download
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" />
            Export CSV
          </a>
        </div>
      </div>

      {/* 2. Executive Metrics */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <span className="text-xs font-medium text-slate-400">Total Obligations</span>
            <div className="mt-1 text-2xl font-bold text-white">{overview.metrics.total}</div>
            <div className="mt-1 text-[11px] text-slate-500">Across 4 statutory domains</div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <span className="text-xs font-semibold text-amber-300">Due Soon (≤7d)</span>
            <div className="mt-1 text-2xl font-bold text-amber-200">{overview.metrics.dueSoon}</div>
            <div className="mt-1 text-[11px] text-amber-400/80">Pending filing or deposit</div>
          </div>

          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
            <span className="text-xs font-semibold text-orange-300">Due Today</span>
            <div className="mt-1 text-2xl font-bold text-orange-200">{overview.metrics.dueToday}</div>
            <div className="mt-1 text-[11px] text-orange-400/80">Immediate action required</div>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
            <span className="text-xs font-semibold text-rose-300">Overdue</span>
            <div className="mt-1 text-2xl font-bold text-rose-200">{overview.metrics.overdue}</div>
            <div className="mt-1 text-[11px] text-rose-400/80">Statutory deadline passed</div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
            <span className="text-xs font-semibold text-blue-300">Returns Filed</span>
            <div className="mt-1 text-2xl font-bold text-blue-200">{overview.metrics.filed}</div>
            <div className="mt-1 text-[11px] text-blue-400/80">Confirmed Portal Submissions</div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <span className="text-xs font-semibold text-emerald-300">Challan Paid</span>
            <div className="mt-1 text-2xl font-bold text-emerald-200">{overview.metrics.paid || 0}</div>
            <div className="mt-1 text-[11px] text-emerald-400/80">Challan Cleared · Return Pending</div>
          </div>

          <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
            <span className="text-xs font-semibold text-teal-300">Fully Completed</span>
            <div className="mt-1 text-2xl font-bold text-teal-200">{overview.metrics.completed}</div>
            <div className="mt-1 text-[11px] text-teal-400/80">Filed & Challan Reconciled</div>
          </div>
        </div>
      )}

      {/* 3. Filter Bar & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search obligations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500"
            />
          </div>

          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Domains</option>
            <option value="EPF_ECR">EPF / ECR</option>
            <option value="ESIC_MONTHLY">ESIC Monthly</option>
            <option value="TDS_24Q">TDS (24Q / 138)</option>
            <option value="PROFESSIONAL_TAX">Professional Tax</option>
          </select>

          <select
            value={jurisdictionFilter}
            onChange={(e) => setJurisdictionFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Jurisdictions</option>
            <option value="IN">Central (All India)</option>
            <option value="KA">Karnataka (KA)</option>
            <option value="MH">Maharashtra (MH)</option>
            <option value="TS">Telangana (TS)</option>
            <option value="WB">West Bengal (WB)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Statuses</option>
            <option value="DUE_SOON">Due Soon</option>
            <option value="DUE_TODAY">Due Today</option>
            <option value="OVERDUE">Overdue</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="FILED">Filed</option>
            <option value="PAID">Challan Paid</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
          <button
            onClick={() => setViewMode("months")}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              viewMode === "months" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Month View
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`rounded px-3 py-1 text-xs font-medium transition ${
              viewMode === "list" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Table View
          </button>
        </div>
      </div>

      {/* 4. Month Matrix View */}
      {viewMode === "months" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MONTH_NAMES.map((monthName, idx) => {
            const m = idx + 1;
            const items = obligationsByMonth.get(m) || [];
            const hasOverdue = items.some((i) => i.status === "OVERDUE");
            const hasDueSoon = items.some((i) => i.status === "DUE_SOON" || i.status === "DUE_TODAY");

            return (
              <div
                key={m}
                className={`flex flex-col rounded-2xl border p-4 transition ${
                  hasOverdue
                    ? "border-rose-500/40 bg-rose-950/10"
                    : hasDueSoon
                    ? "border-amber-500/40 bg-amber-950/10"
                    : "border-slate-800 bg-slate-900/80"
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {monthName} {selectedYear}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {items.length} {items.length === 1 ? "due" : "dues"}
                    </span>
                  </div>
                  {hasOverdue && (
                    <span className="flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                </div>

                <div className="mt-3 flex-1 space-y-2.5">
                  {items.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">No scheduled statutory deadlines</div>
                  ) : (
                    items.map((ob) => {
                      const domainMeta = DOMAIN_LABELS[ob.domain] || { label: ob.domain, color: "bg-slate-800" };
                      const statusMeta = STATUS_BADGES[ob.status] || { label: ob.status, bg: "bg-slate-800", text: "text-slate-300" };
                      const dueStr = new Date(ob.statutoryDueDate).toISOString().slice(0, 10);
                      const targetStr = ob.internalTargetDate ? new Date(ob.internalTargetDate).toISOString().slice(0, 10) : null;

                      return (
                        <div
                          key={ob.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 transition hover:border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${domainMeta.color}`}>
                              {domainMeta.label}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.bg} ${statusMeta.text}`}>
                              {statusMeta.label}
                            </span>
                          </div>

                          <div className="mt-2 text-xs font-semibold text-slate-200">
                            {ob.obligationType.replace(/_/g, " ")}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Jurisdiction: <b className="text-slate-300">{ob.jurisdiction}</b> | Period:{" "}
                            {ob.quarter ? ob.quarter : `${ob.periodYear}-${String(ob.periodMonth || 0).padStart(2, "0")}`}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between border-t border-slate-900 pt-2 text-[11px]">
                            <div className="text-slate-400">
                              Legal Due: <b className="text-white">{dueStr}</b>
                            </div>
                            {targetStr && (
                              <div className="text-indigo-400">
                                Target: <b>{targetStr}</b>
                              </div>
                            )}
                          </div>

                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-900/80 pt-2">
                            <button
                              onClick={() => {
                                setEditingTargetObligation(ob);
                                setNewTargetDate(targetStr || "");
                              }}
                              className="text-[10px] text-brand-400 hover:underline"
                            >
                              {targetStr ? "Change Target" : "+ Set Target"}
                            </button>

                            <div className="flex items-center gap-2">
                              {["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE"].includes(ob.status) && (
                                <button
                                  onClick={() => void handleCompleteManual(ob)}
                                  className="text-[10px] text-emerald-400 hover:underline"
                                >
                                  Mark Done
                                </button>
                              )}
                              <button
                                onClick={() => navigateToDomainModule(ob.domain)}
                                className="flex items-center gap-0.5 text-[10px] font-medium text-slate-300 hover:text-white"
                              >
                                Filing <ArrowUpRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Comprehensive Table View */}
      {viewMode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-semibold uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Statutory Domain</th>
                  <th className="px-4 py-3">Obligation Type</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Legal Due Date</th>
                  <th className="px-4 py-3">Internal Target</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Linked Filing</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredObligations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No statutory obligations match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredObligations.map((ob) => {
                    const domainMeta = DOMAIN_LABELS[ob.domain] || { label: ob.domain, color: "bg-slate-800" };
                    const statusMeta = STATUS_BADGES[ob.status] || { label: ob.status, bg: "bg-slate-800", text: "text-slate-300" };
                    const dueStr = new Date(ob.statutoryDueDate).toISOString().slice(0, 10);
                    const targetStr = ob.internalTargetDate ? new Date(ob.internalTargetDate).toISOString().slice(0, 10) : "—";

                    return (
                      <tr key={ob.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-medium">
                          <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${domainMeta.color}`}>
                            {domainMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          <div className="font-semibold">{ob.obligationType.replace(/_/g, " ")}</div>
                          <div className="text-[10px] text-slate-500">Jurisdiction: {ob.jurisdiction}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {ob.quarter ? ob.quarter : `${ob.periodYear}-${String(ob.periodMonth || 0).padStart(2, "0")}`}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{dueStr}</td>
                        <td className="px-4 py-3 text-indigo-300">
                          <button
                            onClick={() => {
                              setEditingTargetObligation(ob);
                              setNewTargetDate(ob.internalTargetDate ? new Date(ob.internalTargetDate).toISOString().slice(0, 10) : "");
                            }}
                            className="hover:underline"
                          >
                            {targetStr}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${statusMeta.bg} ${statusMeta.text}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {ob.statutoryFiling ? (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                              {ob.statutoryFiling.status}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">Not Generated</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {["UPCOMING", "DUE_SOON", "DUE_TODAY", "OVERDUE"].includes(ob.status) && (
                              <button
                                onClick={() => void handleCompleteManual(ob)}
                                className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                              >
                                Complete
                              </button>
                            )}
                            <button
                              onClick={() => navigateToDomainModule(ob.domain)}
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
                            >
                              Go to Filing
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Edit Target Date Modal */}
      {editingTargetObligation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Set Internal Target Date</h3>
            <p className="mt-1 text-xs text-slate-400">
              Establish a company target date before the legal statutory due date for pre-filing Maker/Checker approvals.
            </p>

            <div className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Domain:</span>
                <span className="font-semibold text-white">{editingTargetObligation.domain}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Legal Due Date:</span>
                <span className="font-bold text-amber-300">
                  {new Date(editingTargetObligation.statutoryDueDate).toISOString().slice(0, 10)}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-300">Internal Target Date (YYYY-MM-DD)</label>
              <input
                type="date"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditingTargetObligation(null)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveTargetDate()}
                className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
              >
                Save Target Date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
