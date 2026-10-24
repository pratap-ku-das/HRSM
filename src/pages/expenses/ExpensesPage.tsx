import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReceiptIndianRupee,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  X,
  Filter,
  Paperclip,
} from 'lucide-react';
import { api } from '../../services/api';
import type { ExpenseClaim } from '../../types';
import { useToast } from '../../context/ToastContext';

interface ActiveReceiptPreview {
  url: string;
  mime: string;
  claimTitle: string;
}

export const ExpensesPage: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<ExpenseClaim[]>([]);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'INGESTED' | 'REIMBURSED' | 'REJECTED'>('ALL');
  const [activeReceipt, setActiveReceipt] = useState<ActiveReceiptPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const workspace = await api.getOperationsWorkspace();
      setItems(workspace.expenses || []);
    } catch (error) {
      toast.error('Expenses could not be loaded', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.reviewExpenseV1(id, status);
      toast.success(`Claim ${status === 'APPROVED' ? 'approved' : 'rejected'} successfully.`);
      await load();
    } catch (error) {
      toast.error('Review failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const openReceipt = async (claim: ExpenseClaim) => {
    setPreviewLoading(true);
    try {
      const token = localStorage.getItem('hrms_access_token_v1') || '';
      const url = api.getExpenseReceiptUrl(claim.id);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Receipt file could not be retrieved.');
      }
      const mime = res.headers.get('content-type') || 'application/pdf';
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setActiveReceipt({
        url: objectUrl,
        mime,
        claimTitle: claim.title,
      });
    } catch (error) {
      toast.error('Failed to open receipt', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeReceipt = () => {
    if (activeReceipt) {
      URL.revokeObjectURL(activeReceipt.url);
      setActiveReceipt(null);
    }
  };

  const hasReceipt = (notes: string | null | undefined): boolean => {
    if (!notes) return false;
    return notes.includes('[RECEIPT:');
  };

  const filteredItems = useMemo(() => {
    if (statusFilter === 'ALL') return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const pendingCount = useMemo(() => items.filter((i) => i.status === 'PENDING').length, [items]);
  const approvedSum = useMemo(
    () => items.filter((i) => i.status === 'APPROVED').reduce((sum, i) => sum + i.amount, 0),
    [items],
  );

  return (
    <div className="neo-page neo-expenses space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-100">
            <span className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <ReceiptIndianRupee className="w-6 h-6" />
            </span>
            Enterprise Expense Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Audited claim workflow, policy validation rules, and secure receipt verification.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void load()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Total Claims</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{items.length}</p>
        </div>
        <div className="bg-white border border-amber-200/90 rounded-2xl p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs text-amber-700 font-semibold tracking-wide uppercase">Pending Approvals</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-white border border-emerald-200/90 rounded-2xl p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs text-emerald-700 font-semibold tracking-wide uppercase">Approved Value</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">₹{approvedSum.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white border border-sky-200/90 rounded-2xl p-5 shadow-xs transition hover:shadow-sm">
          <p className="text-xs text-sky-700 font-semibold tracking-wide uppercase">With Receipts</p>
          <p className="text-2xl font-bold text-sky-700 mt-1">
            {items.filter((i) => hasReceipt(i.notes)).length}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex items-center gap-1.5 p-1.5 bg-slate-100/90 border border-slate-200/80 rounded-2xl shadow-2xs">
          <div className="px-2 text-slate-400">
            <Filter className="w-3.5 h-3.5" />
          </div>
          {(['ALL', 'PENDING', 'APPROVED', 'INGESTED', 'REIMBURSED', 'REJECTED'] as const).map((tab) => {
            const isActive = statusFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {tab === 'INGESTED' ? 'In Payroll' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                {tab === 'PENDING' && pendingCount > 0 && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expense List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-16 px-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs flex flex-col items-center justify-center">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-100/80 flex items-center justify-center text-amber-700 mb-3 shadow-2xs">
              <ReceiptIndianRupee className="w-7 h-7" />
            </div>
            <h4 className="text-base font-semibold text-slate-900">No expense claims found</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
              No expense records match the active filter. Choose a different status filter or refresh the workspace.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const receiptAttached = hasReceipt(item.notes);
            return (
              <article
                key={item.id}
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition shadow-xs hover:shadow-sm"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-base font-semibold text-slate-900">{item.title}</strong>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      {item.category}
                    </span>
                    {receiptAttached && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200">
                        <Paperclip className="w-3 h-3 text-sky-600" />
                        Receipt
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{item.amount.toLocaleString('en-IN')}
                    </span>
                    <span>·</span>
                    <span>Date: {item.expenseDate ? new Date(item.expenseDate).toLocaleDateString() : 'N/A'}</span>
                    {item.notes && !item.notes.startsWith('[RECEIPT:') && (
                      <>
                        <span>·</span>
                        <span className="italic truncate max-w-xs text-slate-600">"{item.notes}"</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  {/* Status Badge */}
                  <div>
                    {item.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 border border-amber-300">
                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Pending
                      </span>
                    )}
                    {item.status === 'APPROVED' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Approved
                      </span>
                    )}
                    {item.status === 'INGESTED' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-purple-50 text-purple-800 border border-purple-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" /> In Payroll
                      </span>
                    )}
                    {item.status === 'REIMBURSED' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-sky-50 text-sky-800 border border-sky-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" /> Reimbursed
                      </span>
                    )}
                    {item.status === 'REJECTED' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-300">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" /> Rejected
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {receiptAttached && (
                      <button
                        onClick={() => void openReceipt(item)}
                        disabled={previewLoading}
                        className="px-3 py-1.5 text-xs font-semibold bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-xl transition flex items-center gap-1.5 border border-sky-200 shadow-2xs"
                        title="Inspect uploaded receipt"
                      >
                        <FileText className="w-3.5 h-3.5 text-sky-600" />
                        <span>Receipt</span>
                      </button>
                    )}

                    {item.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => void review(item.id, 'APPROVED')}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition shadow-xs flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => void review(item.id, 'REJECTED')}
                          className="px-3 py-1.5 text-xs font-semibold bg-white text-rose-600 hover:bg-rose-50 rounded-xl transition border border-rose-200 flex items-center gap-1 shadow-2xs"
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-500" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Receipt Modal Preview */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                <h3 className="font-semibold text-slate-100 text-sm truncate">
                  Receipt — {activeReceipt.claimTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={activeReceipt.url}
                  download={`receipt-${activeReceipt.claimTitle.slice(0, 30)}.pdf`}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                  title="Download File"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={closeReceipt}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                  title="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/40">
              {activeReceipt.mime.startsWith('image/') ? (
                <img
                  src={activeReceipt.url}
                  alt="Receipt Preview"
                  className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain border border-slate-800"
                />
              ) : (
                <iframe
                  src={activeReceipt.url}
                  className="w-full h-[70vh] rounded-xl border border-slate-800 bg-white"
                  title="Receipt Preview PDF"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
