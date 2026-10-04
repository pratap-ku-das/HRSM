import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/ui/EmptyState';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export const EpfComplianceTab: React.FC = () => {
  const toast = useToast();
  const { currentUser } = useAuth();

  const canManage =
    currentUser?.permissions?.includes('compliance.manage') === true ||
    currentUser?.role === 'COMPANY_ADMIN' ||
    currentUser?.role === 'SUPER_ADMIN';

  const canApprove =
    currentUser?.permissions?.includes('compliance.approve') === true ||
    currentUser?.role === 'COMPANY_ADMIN' ||
    currentUser?.role === 'SUPER_ADMIN';

  const [busy, setBusy] = useState(false);
  const [filings, setFilings] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [selectedFilingId, setSelectedFilingId] = useState<string | null>(null);
  const [selectedFiling, setSelectedFiling] = useState<any | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'filings' | 'challans'>('filings');

  // Modal / Action states
  const [showTrrnModal, setShowTrrnModal] = useState(false);
  const [targetChallan, setTargetChallan] = useState<any | null>(null);
  const [trrnInput, setTrrnInput] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paidDate: new Date().toISOString().slice(0, 10),
    challanSerialNo: '',
    crnNumber: '',
    bankReference: '',
    trrnNumber: '',
  });

  const loadData = useCallback(async () => {
    setBusy(true);
    try {
      const [filingsList, challansList] = await Promise.all([
        api.getComplianceFilings({ domain: 'EPF_ECR' }),
        api.getEpfChallans(),
      ]);
      setFilings(filingsList || []);
      setChallans(challansList || []);
      if (!selectedFilingId && filingsList && filingsList.length > 0) {
        setSelectedFilingId(filingsList[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load EPF compliance data', err?.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [selectedFilingId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadFilingDetails = useCallback(
    async (id: string) => {
      try {
        const [filing, diag] = await Promise.all([
          api.getComplianceFiling(id),
          api.getComplianceDiagnostics(id).catch(() => null),
        ]);
        setSelectedFiling(filing);
        setDiagnostics(diag);
      } catch (err: any) {
        console.error('Failed to load filing details', err);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedFilingId) {
      void loadFilingDetails(selectedFilingId);
    }
  }, [selectedFilingId, loadFilingDetails]);

  const handleValidate = async (id: string) => {
    setBusy(true);
    try {
      await api.validateComplianceFiling(id);
      toast.success('Filing passed statutory diagnostics and is validated');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Validation failed', err?.message || 'Statutory check errors detected');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    setBusy(true);
    try {
      await api.submitComplianceApproval(id);
      toast.success('Submitted for Checker approval');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Failed to submit for approval', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (id: string) => {
    setBusy(true);
    try {
      await api.approveComplianceFiling(id);
      toast.success('Filing approved by Checker');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Approval failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLock = async (id: string) => {
    setBusy(true);
    try {
      await api.lockComplianceFiling(id);
      toast.success('Filing permanently locked with SHA-256 canonical checksum');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Locking failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadEcr = async (id: string) => {
    try {
      await api.downloadEcrFile(id);
      toast.success('Downloaded EPFO ECR 2.0 flat text file');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('ECR Export failed', err?.message);
    }
  };

  const handleCreateChallan = async (filingId: string) => {
    setBusy(true);
    try {
      await api.createEpfChallan({
        statutoryFilingId: filingId,
        challanDate: new Date().toISOString().slice(0, 10),
      });
      toast.success('Generated EPF Challan liability with SBI 5-Account breakdown');
      await loadData();
      setActiveSubTab('challans');
    } catch (err: any) {
      toast.error('Failed to generate challan', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSetTrrn = async () => {
    if (!targetChallan || !trrnInput) return;
    setBusy(true);
    try {
      await api.updateEpfChallan(targetChallan.id, {
        action: 'SET_TRRN',
        trrnNumber: trrnInput.trim(),
      });
      toast.success('TRRN updated successfully');
      setShowTrrnModal(false);
      setTargetChallan(null);
      setTrrnInput('');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to set TRRN', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleInitiatePayment = async (challan: any) => {
    setBusy(true);
    try {
      await api.updateEpfChallan(challan.id, {
        action: 'INITIATE_PAYMENT',
      });
      toast.success('Payment initiated towards EPFO State Bank of India account');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to initiate payment', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!targetChallan) return;
    setBusy(true);
    try {
      await api.updateEpfChallan(targetChallan.id, {
        action: 'RECORD_PAYMENT',
        paidDate: paymentForm.paidDate,
        trrnNumber: paymentForm.trrnNumber || targetChallan.trrnNumber,
        challanSerialNo: paymentForm.challanSerialNo || undefined,
        crnNumber: paymentForm.crnNumber || undefined,
        bankReference: paymentForm.bankReference || undefined,
      });
      toast.success('Recorded EPFO Challan payment confirmation');
      setShowPaymentModal(false);
      setTargetChallan(null);
      await loadData();
    } catch (err: any) {
      toast.error('Payment recording failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReconcile = async (challanId: string) => {
    setBusy(true);
    try {
      await api.updateEpfChallan(challanId, { action: 'RECONCILE' });
      toast.success('EPF Challan reconciled against payroll ledger');
      await loadData();
    } catch (err: any) {
      toast.error('Reconciliation failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelChallan = async (challanId: string) => {
    setBusy(true);
    try {
      await api.updateEpfChallan(challanId, { action: 'CANCEL' });
      toast.success('Challan cancelled');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to cancel challan', err?.message);
    } finally {
      setBusy(false);
    }
  };

  // Metrics
  const totalFilings = filings.length;
  const lockedFilings = filings.filter((f) => ['LOCKED', 'EXPORTED'].includes(f.status)).length;
  const totalChallanLiability = challans.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
  const reconciledChallans = challans.filter((c) => c.status === 'RECONCILED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & KPI Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>EPF Monthly Returns</span>
            <FileSpreadsheet className="h-4 w-4 text-brand-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalFilings}</div>
          <div className="mt-1 text-xs text-slate-500">{lockedFilings} locked / exported</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>EPFO Challans</span>
            <Landmark className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{challans.length}</div>
          <div className="mt-1 text-xs text-slate-500">{reconciledChallans} reconciled</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Challan Liability</span>
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{money(totalChallanLiability)}</div>
          <div className="mt-1 text-xs text-slate-500">SBI 5-Account Remittance</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ECR 2.0 Compliance</span>
            <FileCheck2 className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">Active</div>
          <div className="mt-1 text-xs text-slate-500">11-Column #~# Flat-File Spec</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('filings')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeSubTab === 'filings'
                ? 'bg-brand-500 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileText className="h-4 w-4" />
            EPF Monthly Returns (ECR 2.0)
          </button>
          <button
            onClick={() => setActiveSubTab('challans')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              activeSubTab === 'challans'
                ? 'bg-brand-500 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Landmark className="h-4 w-4" />
            EPF Challans & Reconciliation
          </button>
        </div>

        <button
          onClick={() => void loadData()}
          aria-label="Refresh"
          className="rounded-xl border border-slate-700 p-2 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* SUBTAB 1: FILINGS LIST & ECR EXPORT */}
      {activeSubTab === 'filings' && (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left Column: Filings List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Statutory Filings
            </h3>
            {filings.map((f) => {
              const isSelected = f.id === selectedFilingId;
              const hasChallan = challans.some((c) => c.statutoryFilingId === f.id && c.status !== 'CANCELLED');
              return (
                <div
                  key={f.id}
                  onClick={() => setSelectedFilingId(f.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    isSelected
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {f.periodYear}-{String(f.periodMonth).padStart(2, '0')}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        f.status === 'LOCKED' || f.status === 'EXPORTED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : f.status === 'APPROVED'
                          ? 'bg-blue-500/20 text-blue-400'
                          : f.status === 'PENDING_APPROVAL'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <div>
                      <span>Members:</span>{' '}
                      <b className="text-slate-200">{f.totalEmployees}</b>
                    </div>
                    <div>
                      <span>EPF Wages:</span>{' '}
                      <b className="text-slate-200">{money(f.totalEpfWages)}</b>
                    </div>
                    <div>
                      <span>EE Share (12%):</span>{' '}
                      <b className="text-slate-200">{money(f.totalEeShare)}</b>
                    </div>
                    <div>
                      <span>ER Share:</span>{' '}
                      <b className="text-slate-200">{money(f.totalErShare)}</b>
                    </div>
                  </div>

                  {f.sha256Checksum && (
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Lock className="h-3 w-3 text-emerald-400" />
                      <span className="truncate font-mono">
                        {f.sha256Checksum.slice(0, 16)}...
                      </span>
                    </div>
                  )}

                  {hasChallan && (
                    <div className="mt-2 text-[11px] font-medium text-emerald-400">
                      ✓ Challan Linked
                    </div>
                  )}
                </div>
              );
            })}

            {filings.length === 0 && (
              <EmptyState
                title="No EPF Filings Found"
                description="Lock a monthly payroll run and generate a statutory snapshot."
                icon={FileSpreadsheet}
              />
            )}
          </div>

          {/* Right Column: Selected Filing Details & Actions */}
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {selectedFiling ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      EPF ECR Filing: {selectedFiling.periodYear}-
                      {String(selectedFiling.periodMonth).padStart(2, '0')}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Master Filing ID: <span className="font-mono">{selectedFiling.id}</span>
                    </p>
                  </div>

                  {/* Lifecycle Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedFiling.status === 'DRAFT' && canManage && (
                      <button
                        onClick={() => void handleValidate(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Run Diagnostics & Validate
                      </button>
                    )}

                    {selectedFiling.status === 'VALIDATED' && canManage && (
                      <button
                        onClick={() => void handleSubmitForApproval(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                        Submit for Checker Approval
                      </button>
                    )}

                    {selectedFiling.status === 'PENDING_APPROVAL' && canApprove && (
                      <button
                        onClick={() => void handleApprove(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Checker Approve
                      </button>
                    )}

                    {selectedFiling.status === 'APPROVED' && canApprove && (
                      <button
                        onClick={() => void handleLock(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        <Lock className="h-4 w-4" />
                        Lock Snapshot & Generate Checksum
                      </button>
                    )}

                    {['LOCKED', 'EXPORTED'].includes(selectedFiling.status) && (
                      <>
                        <button
                          onClick={() => void handleDownloadEcr(selectedFiling.id)}
                          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                        >
                          <Download className="h-4 w-4" />
                          Download ECR 2.0 Text File
                        </button>

                        {!challans.some(
                          (c) =>
                            c.statutoryFilingId === selectedFiling.id &&
                            c.status !== 'CANCELLED',
                        ) && (
                          <button
                            onClick={() => void handleCreateChallan(selectedFiling.id)}
                            disabled={busy}
                            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-400 disabled:opacity-50"
                          >
                            <Landmark className="h-4 w-4" />
                            Generate Monthly Challan
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Pre-Upload Diagnostics Banner */}
                {diagnostics && (
                  <div
                    className={`rounded-xl border p-4 ${
                      diagnostics.valid
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-2">
                        {diagnostics.valid ? (
                          <ShieldCheck className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="h-5 w-5 text-red-400" />
                        )}
                        Pre-Upload Statutory Diagnostics
                      </span>
                      <span className="text-xs">
                        {diagnostics.valid
                          ? '10 / 10 Rules Passed'
                          : `${diagnostics.errors.length} Blocking Issue(s) Detected`}
                      </span>
                    </div>

                    {!diagnostics.valid && (
                      <div className="mt-3 space-y-1.5 text-xs text-red-200">
                        {diagnostics.errors.map((e: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="font-mono font-bold text-red-400">[{e.ruleId}]</span>
                            <span>{e.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Snapshot Items Table (11-Column Flat-File Source) */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300">
                    Snapshot Line Items ({selectedFiling.items?.length || 0} Members)
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                        <tr>
                          <th className="py-2.5 px-3">UAN</th>
                          <th className="py-2.5 px-3">Member Name</th>
                          <th className="py-2.5 px-3 text-right">Gross</th>
                          <th className="py-2.5 px-3 text-right">EPF Wages</th>
                          <th className="py-2.5 px-3 text-right">EPS Wages</th>
                          <th className="py-2.5 px-3 text-right">EDLI Wages</th>
                          <th className="py-2.5 px-3 text-right">EE Share</th>
                          <th className="py-2.5 px-3 text-right">EPS Share</th>
                          <th className="py-2.5 px-3 text-right">ER Share</th>
                          <th className="py-2.5 px-3 text-center">NCP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {selectedFiling.items?.map((it: any) => (
                          <tr key={it.id} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {it.snapshotUan || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {it.snapshotEmployeeName}
                              <small className="block text-[10px] text-slate-500 font-normal">
                                {it.snapshotEmployeeCode}
                              </small>
                            </td>
                            <td className="py-2.5 px-3 text-right">{money(it.grossWages)}</td>
                            <td className="py-2.5 px-3 text-right">{money(it.epfWages)}</td>
                            <td className="py-2.5 px-3 text-right">{money(it.epsWages)}</td>
                            <td className="py-2.5 px-3 text-right">{money(it.edliWages)}</td>
                            <td className="py-2.5 px-3 text-right font-medium text-blue-400">
                              {money(it.eePfShare)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-amber-400">
                              {money(it.erEpsShare)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-emerald-400">
                              {money(it.erEpfShare)}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              {it.ncpDays}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="Select a Filing"
                description="Select an EPF filing from the left panel to inspect details and diagnostics."
                icon={FileSpreadsheet}
              />
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: EPF CHALLANS & RECONCILIATION */}
      {activeSubTab === 'challans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Monthly Challan Liabilities & SBI Accounts
            </h3>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {challans.map((ch) => (
              <div
                key={ch.id}
                className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="font-bold text-white">
                      Wage Month: {ch.wageYear}-{String(ch.wageMonth).padStart(2, '0')}
                    </span>
                    <p className="text-[11px] text-slate-400">Est Code: {ch.establishmentCode}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      ch.status === 'RECONCILED'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : ch.status === 'PAID'
                        ? 'bg-blue-500/20 text-blue-400'
                        : ch.status === 'PAYMENT_INITIATED'
                        ? 'bg-amber-500/20 text-amber-400'
                        : ch.status === 'CANCELLED'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {ch.status}
                  </span>
                </div>

                {/* 5-Account Breakdown */}
                <div className="space-y-1.5 rounded-xl bg-slate-950/60 p-3 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>A/c 1 (EPF Contribution):</span>
                    <b className="text-slate-200">{money(ch.account1Amount)}</b>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>A/c 2 (Admin Charges):</span>
                    <b className="text-slate-200">{money(ch.account2Amount)}</b>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>A/c 10 (EPS Pension):</span>
                    <b className="text-slate-200">{money(ch.account10Amount)}</b>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>A/c 21 (EDLI Contribution):</span>
                    <b className="text-slate-200">{money(ch.account21Amount)}</b>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>A/c 22 (EDLI Admin):</span>
                    <b className="text-slate-200">{money(ch.account22Amount || 0)}</b>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 font-bold text-white">
                    <span>Total SBI Remittance:</span>
                    <span className="text-emerald-400">{money(ch.totalAmount)}</span>
                  </div>
                </div>

                {/* TRRN & Payment Metadata */}
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>TRRN:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {ch.trrnNumber || 'Pending Portal Upload'}
                    </span>
                  </div>
                  {ch.paidDate && (
                    <div className="flex justify-between">
                      <span>Paid Date:</span>
                      <span className="text-slate-200">
                        {new Date(ch.paidDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  )}
                  {ch.crnNumber && (
                    <div className="flex justify-between">
                      <span>CRN / Bank Ref:</span>
                      <span className="font-mono text-slate-200">{ch.crnNumber}</span>
                    </div>
                  )}
                </div>

                {/* Challan Action Workflow */}
                <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                  {!ch.trrnNumber && ch.status === 'CHALLAN_GENERATED' && (
                    <button
                      onClick={() => {
                        setTargetChallan(ch);
                        setTrrnInput('');
                        setShowTrrnModal(true);
                      }}
                      className="rounded-lg bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30"
                    >
                      Enter TRRN
                    </button>
                  )}

                  {ch.status === 'CHALLAN_GENERATED' && ch.trrnNumber && (
                    <button
                      onClick={() => void handleInitiatePayment(ch)}
                      className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/30"
                    >
                      Initiate Payment
                    </button>
                  )}

                  {['CHALLAN_GENERATED', 'PAYMENT_INITIATED'].includes(ch.status) && (
                    <button
                      onClick={() => {
                        setTargetChallan(ch);
                        setPaymentForm({
                          paidDate: new Date().toISOString().slice(0, 10),
                          challanSerialNo: '',
                          crnNumber: '',
                          bankReference: '',
                          trrnNumber: ch.trrnNumber || '',
                        });
                        setShowPaymentModal(true);
                      }}
                      className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30"
                    >
                      Record Payment
                    </button>
                  )}

                  {ch.status === 'PAID' && canApprove && (
                    <button
                      onClick={() => void handleReconcile(ch.id)}
                      className="rounded-lg bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/30"
                    >
                      Reconcile Ledger
                    </button>
                  )}

                  {['CHALLAN_GENERATED', 'PAYMENT_INITIATED'].includes(ch.status) && (
                    <button
                      onClick={() => void handleCancelChallan(ch.id)}
                      className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}

            {challans.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="No EPF Challans"
                  description="Generate a challan from a locked EPF monthly return to begin reconciliation."
                  icon={Landmark}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ENTER TRRN */}
      {showTrrnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Enter EPFO Portal TRRN</h3>
            <p className="text-xs text-slate-400">
              Enter the Temporary Return Reference Number generated by the EPFO Unified Portal upon ECR upload.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-300">TRRN Number (12-20 chars)</label>
              <input
                type="text"
                value={trrnInput}
                onChange={(e) => setTrrnInput(e.target.value.toUpperCase())}
                placeholder="e.g. TRRN123456789012"
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTrrnModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSetTrrn()}
                disabled={!trrnInput.trim() || busy}
                className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-400 disabled:opacity-50"
              >
                Save TRRN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RECORD PAYMENT */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Record EPFO Challan Payment</h3>
            <p className="text-xs text-slate-400">
              Confirm payment receipt and record bank transaction reference numbers.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-300">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.paidDate}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, paidDate: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="font-medium text-slate-300">TRRN Number</label>
                <input
                  type="text"
                  value={paymentForm.trrnNumber}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, trrnNumber: e.target.value.toUpperCase() })
                  }
                  placeholder="TRRN Number"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="font-medium text-slate-300">Challan Reference Number (CRN)</label>
                <input
                  type="text"
                  value={paymentForm.crnNumber}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, crnNumber: e.target.value })
                  }
                  placeholder="e.g. CRN0987654321"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="font-medium text-slate-300">Bank Reference (UTR / Txn ID)</label>
                <input
                  type="text"
                  value={paymentForm.bankReference}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, bankReference: e.target.value })
                  }
                  placeholder="e.g. SBI-NEFT-12345"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRecordPayment()}
                disabled={!paymentForm.paidDate || (!paymentForm.trrnNumber && !targetChallan?.trrnNumber) || busy}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
