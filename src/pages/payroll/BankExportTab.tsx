import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileCheck,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import type { PayrollRun } from '../../types';
import type {
  BankExportBatchItem,
  BankExportPreviewResponse,
  BankFormat,
} from '../../types/bankExport';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/ui/EmptyState';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

const BANK_FORMAT_OPTIONS: Array<{ code: BankFormat; name: string; description: string }> = [
  { code: 'STANDARD_RBI', name: 'Standard RBI NEFT / RTGS (CSV)', description: 'Universal bulk payment format compatible with all major banks' },
  { code: 'HDFC_CMS', name: 'HDFC Corporate CMS / ENet', description: 'Standard HDFC corporate cash management format' },
  { code: 'ICICI_CIB', name: 'ICICI Corporate Internet Banking (CIB)', description: 'ICICI bulk upload layout with debit product code' },
  { code: 'SBI_CMP', name: 'SBI Cash Management Product (CMP)', description: 'State Bank of India corporate file specification' },
];

export const BankExportTab: React.FC = () => {
  const toast = useToast();
  const { currentUser } = useAuth();
  const canApprove =
    currentUser?.permissions?.includes('payroll.approve') === true ||
    currentUser?.role === 'COMPANY_ADMIN' ||
    currentUser?.role === 'HR_MANAGER';

  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<{
    payrollRuns: PayrollRun[];
    reimbursements: { count: number; totalAmount: number; claims: unknown[] };
  } | null>(null);

  const [sourceType, setSourceType] = useState<'PAYROLL' | 'REIMBURSEMENT' | 'COMBINED'>('PAYROLL');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [bankFormat, setBankFormat] = useState<BankFormat>('STANDARD_RBI');
  const [preview, setPreview] = useState<BankExportPreviewResponse | null>(null);
  const [batches, setBatches] = useState<BankExportBatchItem[]>([]);
  const [notes, setNotes] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const loadSourcesAndBatches = useCallback(async () => {
    setBusy(true);
    try {
      const [src, batchList] = await Promise.all([
        api.getBankExportSources(),
        api.getBankExportBatches(),
      ]);
      setSources(src);
      setBatches(batchList);

      if (src.payrollRuns.length > 0 && !selectedRunId) {
        setSelectedRunId(src.payrollRuns[0].id);
      }
    } catch (error) {
      toast.error('Could not load bank export data', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [toast, selectedRunId]);

  useEffect(() => {
    void loadSourcesAndBatches();
  }, [loadSourcesAndBatches]);

  const handlePreview = async () => {
    if (sourceType !== 'REIMBURSEMENT' && !selectedRunId) {
      toast.error('Select a payroll run to export');
      return;
    }

    setBusy(true);
    try {
      const data = await api.previewBankExport({
        sourceType,
        payrollRunId: selectedRunId || undefined,
        bankFormat,
      });
      setPreview(data);
      toast.success(`Validated ${data.summary.totalRecords} transfer records`);
    } catch (error) {
      toast.error('Bank validation failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleInitiateBatch = async () => {
    if (!preview || preview.validEntries.length === 0) {
      toast.error('No valid transfer entries to export');
      return;
    }

    setBusy(true);
    try {
      const res = await api.initiateBankExportBatch({
        sourceType,
        payrollRunId: selectedRunId || undefined,
        bankFormat,
        notes: notes.trim() || undefined,
      });
      toast.success(`Export batch ${res.batchId.slice(0, 8)} initiated (Maker). Awaiting Checker verification.`);
      setPreview(null);
      setNotes('');
      await loadSourcesAndBatches();
    } catch (error) {
      toast.error('Initiation failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveBatch = async (batchId: string) => {
    setActionId(batchId);
    try {
      await api.approveBankExportBatch(batchId);
      toast.success('Batch approved by Checker. File export locked and ready for download.');
      await loadSourcesAndBatches();
    } catch (error) {
      toast.error('Batch approval failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setActionId(null);
    }
  };

  const handleDownloadFile = async (batchId: string) => {
    setActionId(batchId);
    try {
      await api.downloadBankExportFile(batchId);
      toast.success('Bank transfer file downloaded');
    } catch (error) {
      toast.error('Download failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Building2 className="text-brand-400 h-6 w-6" />
            Bulk NEFT / RTGS Bank Export
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Export approved payroll and reimbursements into standard bank corporate formats with validation, duplicate detection, and Maker/Checker governance.
          </p>
        </div>
        <button
          onClick={() => void loadSourcesAndBatches()}
          disabled={busy}
          className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-400 hover:text-white disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Step 1: Configuration & Validation Trigger */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-brand-400" />
          Step 1: Select Payment Source & Bank Specification
        </h3>

        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Disbursement Type</span>
            <select
              value={sourceType}
              onChange={(e) => {
                setSourceType(e.target.value as any);
                setPreview(null);
              }}
              className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
            >
              <option value="PAYROLL">Approved Payroll Run</option>
              <option value="REIMBURSEMENT">Approved Reimbursements</option>
              <option value="COMBINED">Combined (Payroll + Claims)</option>
            </select>
          </label>

          {sourceType !== 'REIMBURSEMENT' && (
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Payroll Month</span>
              <select
                value={selectedRunId}
                onChange={(e) => {
                  setSelectedRunId(e.target.value);
                  setPreview(null);
                }}
                className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
              >
                <option value="">Select a payroll run</option>
                {sources?.payrollRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.month} ({run.status}) · {money(run.totalNetPayout)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span className="mb-1.5 block text-xs font-medium text-slate-300">Bank Corporate Format</span>
            <select
              value={bankFormat}
              onChange={(e) => {
                setBankFormat(e.target.value as BankFormat);
                setPreview(null);
              }}
              className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
            >
              {BANK_FORMAT_OPTIONS.map((fmt) => (
                <option key={fmt.code} value={fmt.code}>
                  {fmt.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={() => void handlePreview()}
          disabled={busy || (sourceType !== 'REIMBURSEMENT' && !selectedRunId)}
          className="rounded-xl bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <ShieldCheck className="h-4 w-4" />
          {busy ? 'Validating…' : 'Validate Bank Details & Preview Batch'}
        </button>
      </section>

      {/* Step 2: Validation Preview, Duplicate Warnings, and Maker Action */}
      {preview && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Step 2: Bank Validation & Duplicate Analysis
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every beneficiary IFSC and account number verified against Indian banking rules.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Total Payout</span>
              <strong className="text-lg font-bold text-emerald-400">
                {money(preview.summary.totalAmount)}
              </strong>
            </div>
          </div>

          {/* Metrics summary cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-400">Beneficiaries</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-bold text-slate-100">{preview.summary.totalRecords}</span>
                <span className="text-emerald-400 font-semibold">{preview.summary.validRecords} Valid</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-400">Invalid / Incomplete</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className={`text-lg font-bold ${preview.summary.invalidRecords > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {preview.summary.invalidRecords}
                </span>
                <span className="text-slate-500">Must be corrected</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-400">NEFT (&lt; ₹2 Lakhs)</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-bold text-slate-100">{preview.summary.neftCount}</span>
                <span className="text-slate-400">{money(preview.summary.neftAmount)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <span className="text-slate-400">RTGS (≥ ₹2 Lakhs)</span>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-bold text-slate-100">{preview.summary.rtgsCount}</span>
                <span className="text-slate-400">{money(preview.summary.rtgsAmount)}</span>
              </div>
            </div>
          </div>

          {/* Duplicate Account Warnings */}
          {preview.duplicateWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <h4 className="flex items-center gap-2 font-semibold text-amber-300 text-xs">
                <AlertTriangle className="h-4 w-4" />
                Duplicate Account Warnings ({preview.duplicateWarnings.length})
              </h4>
              {preview.duplicateWarnings.map((w, idx) => (
                <p key={idx} className="text-xs text-slate-300">
                  {w.warning}
                </p>
              ))}
            </div>
          )}

          {/* Invalid Beneficiaries Alert */}
          {preview.invalidEntries.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-3">
              <h4 className="flex items-center gap-2 font-semibold text-rose-300 text-xs">
                <AlertCircle className="h-4 w-4" />
                Incomplete Bank Details ({preview.invalidEntries.length} employees will be excluded)
              </h4>
              <div className="space-y-1.5 text-xs text-slate-300">
                {preview.invalidEntries.map((e) => (
                  <div key={e.employeeId} className="flex justify-between border-b border-rose-500/20 pb-1">
                    <span>
                      {e.beneficiaryName} ({e.employeeCode}):
                    </span>
                    <span className="text-rose-400 font-medium">
                      {e.validationErrors.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank-wise Batch Grouping */}
          <div>
            <h4 className="font-semibold text-slate-200 text-xs mb-2">Destination Bank Distribution</h4>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {preview.bankBatches.map((b) => (
                <div key={b.bankName} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                  <strong className="block text-slate-200 truncate">{b.bankName}</strong>
                  <div className="mt-1 flex justify-between text-slate-400">
                    <span>{b.recordCount} accounts</span>
                    <span className="font-semibold text-slate-300">{money(b.totalAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Valid Beneficiaries Table Preview */}
          <div>
            <h4 className="font-semibold text-slate-200 text-xs mb-2">
              Valid Beneficiaries ({preview.validEntries.length})
            </h4>
            <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-950 max-h-60 text-xs">
              <table className="w-full min-w-[700px]">
                <thead className="bg-slate-900 text-slate-400 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2.5">Beneficiary</th>
                    <th>Account Number</th>
                    <th>IFSC Code</th>
                    <th>Type</th>
                    <th className="text-right p-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {preview.validEntries.map((e) => (
                    <tr key={e.employeeId} className="hover:bg-slate-900/50">
                      <td className="p-2.5 font-medium text-slate-200">
                        {e.beneficiaryName}
                        <small className="block text-slate-500">{e.employeeCode}</small>
                      </td>
                      <td className="font-mono text-slate-400">
                        ••••{e.accountNumber.slice(-4)}
                      </td>
                      <td className="font-mono text-brand-300">{e.ifscCode}</td>
                      <td>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            e.paymentType === 'RTGS' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {e.paymentType}
                        </span>
                      </td>
                      <td className="text-right p-2.5 font-semibold text-emerald-400">
                        {money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Maker Initiation Form */}
          <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-end gap-3">
            <label className="flex-1 w-full">
              <span className="mb-1 block text-xs text-slate-400">Maker Audit Notes (Optional)</span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Verified by Payroll Ops for October salary run"
                className="input w-full bg-slate-950 text-sm border-slate-700 rounded-xl"
              />
            </label>
            <button
              onClick={() => void handleInitiateBatch()}
              disabled={busy || preview.validEntries.length === 0}
              className="rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2 text-sm whitespace-nowrap"
            >
              <Send className="h-4 w-4" />
              Initiate Export Batch (Maker)
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Batches History, Checker Verification, and Download */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-100 flex items-center gap-2 text-sm">
              <FileCheck className="h-4 w-4 text-brand-400" />
              Export Batches & Checker Verification History
            </h3>
            <p className="text-xs text-slate-400">
              Batches require Checker approval before bank transfer files can be downloaded.
            </p>
          </div>
        </div>

        <div className="overflow-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-400 text-left">
                <th className="p-3">Batch ID / Date</th>
                <th>Format</th>
                <th>Records</th>
                <th>Total Payout</th>
                <th>Maker</th>
                <th>Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {batches.map((batch) => {
                const f = batch.filters;
                const isApproved = batch.status === 'COMPLETED';
                const isPending = batch.status === 'PENDING';

                return (
                  <tr key={batch.id} className="hover:bg-slate-800/20">
                    <td className="p-3">
                      <strong className="block text-slate-200 font-mono">
                        {batch.id.slice(0, 8)}…
                      </strong>
                      <span className="text-slate-500">
                        {new Date(batch.createdAt).toLocaleDateString()} {new Date(batch.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="font-medium text-slate-300">{batch.format}</td>
                    <td className="text-slate-300 font-semibold">{batch.rowCount}</td>
                    <td className="font-bold text-emerald-400">
                      {f?.totalAmount ? money(f.totalAmount) : '—'}
                    </td>
                    <td className="text-slate-400">
                      {batch.user?.fullName || batch.userId.slice(0, 8)}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          isApproved
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : isPending
                            ? 'bg-amber-500/10 text-amber-300'
                            : 'bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {isApproved ? <Lock className="h-3 w-3" /> : null}
                        {isApproved ? 'Approved & Locked' : isPending ? 'Pending Checker' : 'Failed'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        {isPending && canApprove && (
                          <button
                            onClick={() => void handleApproveBatch(batch.id)}
                            disabled={actionId === batch.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-white hover:bg-emerald-600 disabled:opacity-50 text-xs"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Approve (Checker)
                          </button>
                        )}

                        {isApproved && (
                          <button
                            onClick={() => void handleDownloadFile(batch.id)}
                            disabled={actionId === batch.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 font-semibold text-brand-300 hover:bg-brand-500/20 disabled:opacity-50 text-xs"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download Bank CSV
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!batches.length && (
            <EmptyState
              title="No bank export batches"
              description="Initiate your first NEFT/RTGS batch above."
              icon={FileSpreadsheet}
            />
          )}
        </div>
      </section>
    </div>
  );
};
