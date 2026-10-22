import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  FileText,
  CreditCard,
  Building2,
  Lock,
  UserCheck,
  ArrowUpRight,
  RefreshCw,
  Info,
} from "lucide-react";
import { calendarApi, type CalendarObligation, type StatutoryFilingDetail } from "../../pages/payroll/calendarApi";

interface ObligationDetailModalProps {
  isOpen: boolean;
  obligationId: string | null;
  initialObligation?: CalendarObligation | null;
  onClose: () => void;
  onNavigateFiling?: (domain: string) => void;
}

const DOMAIN_LABELS: Record<string, { label: string; color: string; border: string }> = {
  EPF_ECR: {
    label: "EPF / ECR",
    color: "bg-indigo-500/15 text-indigo-300",
    border: "border-indigo-500/30",
  },
  ESIC_MONTHLY: {
    label: "ESIC Monthly",
    color: "bg-cyan-500/15 text-cyan-300",
    border: "border-cyan-500/30",
  },
  TDS_24Q: {
    label: "TDS (24Q / 138)",
    color: "bg-amber-500/15 text-amber-300",
    border: "border-amber-500/30",
  },
  PROFESSIONAL_TAX: {
    label: "Professional Tax",
    color: "bg-purple-500/15 text-purple-300",
    border: "border-purple-500/30",
  },
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

function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) return "₹0.00";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

export const ObligationDetailModal: React.FC<ObligationDetailModalProps> = ({
  isOpen,
  obligationId,
  initialObligation,
  onClose,
  onNavigateFiling,
}) => {
  const [obligation, setObligation] = useState<CalendarObligation | null>(initialObligation || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await calendarApi.getObligation(id);
      setObligation(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load obligation details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setObligation(null);
      setError(null);
      return;
    }
    if (obligationId) {
      void fetchDetail(obligationId);
    } else if (initialObligation) {
      setObligation(initialObligation);
    }
  }, [isOpen, obligationId, initialObligation, fetchDetail]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const domainMeta = obligation?.domain
    ? DOMAIN_LABELS[obligation.domain] || {
        label: obligation.domain,
        color: "bg-slate-800 text-slate-300",
        border: "border-slate-700",
      }
    : null;

  const statusMeta = obligation?.status
    ? STATUS_BADGES[obligation.status] || {
        label: obligation.status,
        bg: "bg-slate-800",
        text: "text-slate-300",
      }
    : null;

  const filing = obligation?.statutoryFiling as StatutoryFilingDetail | undefined;

  // Compute Maker-Checker Step Progress
  const isRejected = filing?.status === "REJECTED" || Boolean(filing?.rejectionReason);
  const isCreated = Boolean(filing?.createdById || filing?.createdAt);
  const isValidated = Boolean(filing?.validatedAt);
  const isApproved = Boolean(filing?.approvedAt || filing?.approvedById);
  const isLockedOrFiled = Boolean(filing?.lockedAt || filing?.status === "FILED" || filing?.status === "LOCKED");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="obligation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-8 w-full max-w-3xl rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {domainMeta && (
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${domainMeta.color} ${domainMeta.border}`}
                >
                  {domainMeta.label}
                </span>
              )}
              {statusMeta && (
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusMeta.bg} ${statusMeta.text}`}
                >
                  {statusMeta.label}
                </span>
              )}
              <span className="text-xs text-slate-400">
                Jurisdiction: <b className="text-slate-200">{obligation?.jurisdiction || "—"}</b>
              </span>
            </div>
            <h2 id="obligation-modal-title" className="text-lg font-bold text-white">
              {obligation ? obligation.obligationType.replace(/_/g, " ") : "Obligation Detail"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {obligationId && (
              <button
                type="button"
                onClick={() => void fetchDetail(obligationId)}
                disabled={loading}
                aria-label="Refresh obligation details"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="max-h-[75vh] space-y-6 overflow-y-auto p-6">
          {/* Loading State */}
          {loading && !obligation && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
              <p className="mt-3 text-xs">Loading compliance obligation details...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-300">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
              <div className="flex-1">
                <h4 className="font-semibold text-rose-200">Unable to load obligation data</h4>
                <p className="mt-1">{error}</p>
              </div>
              {obligationId && (
                <button
                  onClick={() => void fetchDetail(obligationId)}
                  className="rounded bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Main Content when obligation is present */}
          {obligation && (
            <>
              {/* Section 1: Statutory Timelines & Metadata */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400">Statutory Period</span>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {obligation.quarter
                      ? obligation.quarter
                      : `${obligation.periodYear}-${String(obligation.periodMonth || 0).padStart(2, "0")}`}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400">Legal Due Date</span>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {formatDate(obligation.statutoryDueDate)}
                  </div>
                  {obligation.extendedDueDate && (
                    <div className="mt-0.5 text-[10px] text-amber-400">
                      Ext: {formatDate(obligation.extendedDueDate)}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400">Internal Target</span>
                  <div className="mt-1 text-sm font-semibold text-indigo-300">
                    {formatDate(obligation.internalTargetDate)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">Maker-Checker deadline</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-[11px] font-medium text-slate-400">Assigned Officer</span>
                  <div className="mt-1 truncate text-sm font-semibold text-white">
                    {obligation.assignedUser?.fullName || obligation.assignedUser?.email || "Unassigned"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500">Compliance owner</div>
                </div>
              </div>

              {obligation.extensionReason && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <Info className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    <b>Extension Notice:</b> {obligation.extensionReason}
                  </span>
                </div>
              )}

              {/* Section 2: Maker–Checker Approval Lifecycle */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-brand-400" />
                    <h3 className="text-sm font-bold text-white">Maker–Checker Approval Lifecycle</h3>
                  </div>
                  {filing ? (
                    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                      Filing Status: <b className="text-white">{filing.status}</b>
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-500">
                      Not Initialized
                    </span>
                  )}
                </div>

                {!filing ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    <FileText className="mx-auto h-7 w-7 text-slate-600" />
                    <p className="mt-2 font-medium text-slate-400">No Statutory Filing Linked</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      A statutory return has not yet been generated for this period. Use the Filing module to generate.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    {/* Stepper Progress */}
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      {/* Step 1: Draft / Maker */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          isCreated
                            ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                            : "border-slate-800 bg-slate-900 text-slate-500"
                        }`}
                      >
                        <div className="font-semibold">1. Maker Created</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {filing.createdAt ? formatDate(filing.createdAt) : "Pending"}
                        </div>
                      </div>

                      {/* Step 2: Validated */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          isValidated
                            ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                            : "border-slate-800 bg-slate-900 text-slate-500"
                        }`}
                      >
                        <div className="font-semibold">2. Validated</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {filing.validatedAt ? formatDate(filing.validatedAt) : "Pending"}
                        </div>
                      </div>

                      {/* Step 3: Approved */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          isRejected
                            ? "border-rose-500/30 bg-rose-950/20 text-rose-300"
                            : isApproved
                            ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                            : "border-slate-800 bg-slate-900 text-slate-500"
                        }`}
                      >
                        <div className="font-semibold">{isRejected ? "Rejected" : "3. Approved"}</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {filing.approvedAt ? formatDate(filing.approvedAt) : "Pending"}
                        </div>
                      </div>

                      {/* Step 4: Locked / Filed */}
                      <div
                        className={`rounded-xl border p-2.5 transition ${
                          isLockedOrFiled
                            ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                            : "border-slate-800 bg-slate-900 text-slate-500"
                        }`}
                      >
                        <div className="font-semibold">4. Locked / Filed</div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          {filing.lockedAt
                            ? formatDate(filing.lockedAt)
                            : filing.status === "FILED"
                            ? "Portal Filed"
                            : "Pending"}
                        </div>
                      </div>
                    </div>

                    {/* Rejection Alert if rejected */}
                    {isRejected && filing.rejectionReason && (
                      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                        <div>
                          <span className="font-bold text-rose-200">Rejection Notice: </span>
                          {filing.rejectionReason}
                        </div>
                      </div>
                    )}

                    {/* Maker-Checker Detailed Audit Details */}
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="text-[10px] text-slate-500">Maker ID</span>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-300">
                          {filing.createdById || "System"}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="text-[10px] text-slate-500">Validated At</span>
                        <div className="mt-0.5 font-medium text-slate-300">
                          {formatDate(filing.validatedAt)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="text-[10px] text-slate-500">Approver ID</span>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-slate-300">
                          {filing.approvedById || "—"}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <span className="text-[10px] text-slate-500">Lock Timestamp</span>
                        <div className="mt-0.5 font-medium text-slate-300">
                          {formatDate(filing.lockedAt)}
                        </div>
                      </div>
                    </div>

                    {filing.tokenNumberPrn && (
                      <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs">
                        <span className="text-blue-300">Statutory Filing Receipt / PRN:</span>
                        <span className="font-mono font-bold text-blue-200">{filing.tokenNumberPrn}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 3: Challan Reconciliation Details */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Challan Reconciliation & Payment Details</h3>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {/* EPF Challans */}
                  {filing?.epfChallans && filing.epfChallans.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">EPF Challans (TRRN)</div>
                      {filing.epfChallans.map((epf) => (
                        <div
                          key={epf.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-indigo-300">
                              TRRN: {epf.trrnNumber || "Not Generated"}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                epf.status === "RECONCILED"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : epf.status === "PAID"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {epf.status.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                            <div>
                              <span className="text-slate-500">Establishment:</span>{" "}
                              <span className="text-slate-300">{epf.establishmentCode}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Amount:</span>{" "}
                              <span className="font-semibold text-white">{formatCurrency(epf.totalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Paid Date:</span>{" "}
                              <span className="text-slate-300">{formatDate(epf.paidDate)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Reconciled:</span>{" "}
                              <span className="text-slate-300">{formatDate(epf.reconciledAt)}</span>
                            </div>
                          </div>
                          {epf.bankReference && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Bank Ref: <span className="font-mono text-slate-400">{epf.bankReference}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ESIC Challans */}
                  {filing?.esicChallans && filing.esicChallans.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">ESIC Challans (CPRN)</div>
                      {filing.esicChallans.map((esic) => (
                        <div
                          key={esic.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-cyan-300">
                              CPRN: {esic.cprnNumber || "Not Generated"}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                esic.status === "RECONCILED"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : esic.status === "PAID"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {esic.status.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                            <div>
                              <span className="text-slate-500">Employees:</span>{" "}
                              <span className="text-slate-300">{esic.totalEmployees}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Amount:</span>{" "}
                              <span className="font-semibold text-white">{formatCurrency(esic.totalAmount)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Paid Date:</span>{" "}
                              <span className="text-slate-300">{formatDate(esic.paidDate)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Reconciled:</span>{" "}
                              <span className="text-slate-300">{formatDate(esic.reconciledAt)}</span>
                            </div>
                          </div>
                          {esic.bankReference && (
                            <div className="mt-1 text-[10px] text-slate-500">
                              Bank Ref: <span className="font-mono text-slate-400">{esic.bankReference}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Professional Tax Challan */}
                  {filing?.ptChallan && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">Professional Tax Challan</div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-purple-300">
                            Challan No: {filing.ptChallan.challanNumber}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                              filing.ptChallan.status === "RECONCILED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : filing.ptChallan.status === "PAID"
                                ? "bg-blue-500/20 text-blue-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {filing.ptChallan.status.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                          <div>
                            <span className="text-slate-500">State:</span>{" "}
                            <span className="text-slate-300">{filing.ptChallan.stateCode}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Amount:</span>{" "}
                            <span className="font-semibold text-white">
                              {formatCurrency(filing.ptChallan.totalAmount)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Paid Date:</span>{" "}
                            <span className="text-slate-300">{formatDate(filing.ptChallan.paidDate)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">CIN:</span>{" "}
                            <span className="font-mono text-slate-300">
                              {filing.ptChallan.cinNumber || "—"}
                            </span>
                          </div>
                        </div>
                        {filing.ptChallan.reconciledAt && (
                          <div className="mt-1 text-[10px] text-slate-500">
                            Reconciled on: {formatDate(filing.ptChallan.reconciledAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TDS Challans */}
                  {filing?.challans && filing.challans.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">TDS Challans (ITNS 281)</div>
                      {filing.challans.map((tds) => (
                        <div
                          key={tds.id}
                          className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-amber-300">
                              BSR: {tds.bsrCode} | Challan #{tds.challanSerialNo}
                            </span>
                            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              DEPOSITED
                            </span>
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
                            <div>
                              <span className="text-slate-500">Deposit Date:</span>{" "}
                              <span className="text-slate-300">{formatDate(tds.challanDate)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">TDS:</span>{" "}
                              <span className="text-slate-300">{formatCurrency(tds.tdsAmount)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Cess / Fee:</span>{" "}
                              <span className="text-slate-300">
                                {formatCurrency((tds.cess || 0) + (tds.fee || 0))}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500">Total Deposited:</span>{" "}
                              <span className="font-semibold text-white">{formatCurrency(tds.totalAmount)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty state when no challans are linked */}
                  {(!filing ||
                    ((!filing.epfChallans || filing.epfChallans.length === 0) &&
                      (!filing.esicChallans || filing.esicChallans.length === 0) &&
                      !filing.ptChallan &&
                      (!filing.challans || filing.challans.length === 0))) && (
                    <div className="py-6 text-center text-xs text-slate-500">
                      <CreditCard className="mx-auto h-7 w-7 text-slate-600" />
                      <p className="mt-2 font-medium text-slate-400">No Challans Associated</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Challan payment and bank reconciliation have not been recorded for this period yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Close
          </button>

          {obligation && onNavigateFiling && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateFiling(obligation.domain);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-500/20 hover:bg-brand-600"
            >
              <span>Go to {obligation.domain.replace(/_/g, " ")} Filing</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
