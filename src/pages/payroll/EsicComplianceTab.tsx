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

export const EsicComplianceTab: React.FC = () => {
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
  const [showCprnModal, setShowCprnModal] = useState(false);
  const [targetChallan, setTargetChallan] = useState<any | null>(null);
  const [cprnInput, setCprnInput] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paidDate: new Date().toISOString().slice(0, 10),
    transactionReference: '',
    bankReference: '',
    cprnNumber: '',
  });

  const loadData = useCallback(async () => {
    setBusy(true);
    try {
      const [filingsList, challansList] = await Promise.all([
        api.getComplianceFilings({ domain: 'ESIC_MONTHLY' }),
        api.getEsicChallans(),
      ]);
      setFilings(filingsList || []);
      setChallans(challansList || []);
      if (!selectedFilingId && filingsList && filingsList.length > 0) {
        setSelectedFilingId(filingsList[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load ESIC compliance data', err?.message || 'Unknown error');
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
    } else {
      setSelectedFiling(null);
      setDiagnostics(null);
    }
  }, [selectedFilingId, loadFilingDetails]);

  // Filing Actions
  const handleValidate = async () => {
    if (!selectedFilingId) return;
    setBusy(true);
    try {
      await api.validateComplianceFiling(selectedFilingId);
      toast.success('Validation Successful', 'ESIC filing verified against statutory rules.');
      await loadData();
      await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Validation Failed', err?.message || 'Check diagnostic errors');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFilingId) return;
    setBusy(true);
    try {
      await api.submitComplianceApproval(selectedFilingId);
      toast.success('Submitted for Approval', 'Sent to statutory Checker for authorization.');
      await loadData();
      await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Submission Failed', err?.message || 'Cannot submit filing');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedFilingId) return;
    setBusy(true);
    try {
      await api.approveComplianceFiling(selectedFilingId);
      toast.success('Filing Approved', 'Authorized by compliance officer.');
      await loadData();
      await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Approval Denied', err?.message || 'Maker cannot approve their own filing.');
    } finally {
      setBusy(false);
    }
  };

  const handleLock = async () => {
    if (!selectedFilingId) return;
    setBusy(true);
    try {
      await api.lockComplianceFiling(selectedFilingId);
      toast.success('Filing Locked', 'SHA-256 integrity hash sealed. Filing is now immutable.');
      await loadData();
      await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Lock Failed', err?.message || 'Could not lock filing');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!selectedFiling) return;
    try {
      const year = selectedFiling.periodYear;
      const month = String(selectedFiling.periodMonth || 1).padStart(2, '0');
      const filename = `ESIC_Return_${year}_${month}.csv`;
      await api.downloadEsicFile(selectedFiling.id, filename);
      toast.success('Export Generated', `Saved 6-column return ${filename}`);
      await loadData();
      await loadFilingDetails(selectedFiling.id);
    } catch (err: any) {
      toast.error('Export Blocked', err?.message || 'Filing must be LOCKED before export');
    }
  };

  const handleCreateChallan = async () => {
    if (!selectedFiling) return;
    setBusy(true);
    try {
      await api.createEsicChallan({
        statutoryFilingId: selectedFiling.id,
        challanDate: new Date().toISOString().slice(0, 10),
        notes: `ESIC Monthly Return ${selectedFiling.periodMonth}/${selectedFiling.periodYear}`,
      });
      toast.success('ESIC Challan Created', 'Calculated 0.75% EE and 3.25% ER liability.');
      await loadData();
      setActiveSubTab('challans');
    } catch (err: any) {
      toast.error('Challan Creation Failed', err?.message || 'Unable to create challan');
    } finally {
      setBusy(false);
    }
  };

  const handleSetCprn = async () => {
    if (!targetChallan || !cprnInput.trim()) return;
    setBusy(true);
    try {
      await api.updateEsicChallan(targetChallan.id, {
        action: 'SET_CPRN',
        cprnNumber: cprnInput.trim(),
      });
      toast.success('CPRN Assigned', `14-digit CPRN ${cprnInput.trim()} linked to challan.`);
      setShowCprnModal(false);
      setCprnInput('');
      setTargetChallan(null);
      await loadData();
    } catch (err: any) {
      toast.error('Failed to assign CPRN', err?.message || 'Invalid or duplicate CPRN');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!targetChallan) return;
    setBusy(true);
    try {
      await api.updateEsicChallan(targetChallan.id, {
        action: 'RECORD_PAYMENT',
        paidDate: paymentForm.paidDate,
        transactionReference: paymentForm.transactionReference || undefined,
        bankReference: paymentForm.bankReference || undefined,
        cprnNumber: paymentForm.cprnNumber || targetChallan.cprnNumber || undefined,
      });
      toast.success('Payment Recorded', 'ESIC challan marked as PAID.');
      setShowPaymentModal(false);
      setTargetChallan(null);
      await loadData();
    } catch (err: any) {
      toast.error('Payment Recording Failed', err?.message || 'Invalid details');
    } finally {
      setBusy(false);
    }
  };

  const handleReconcile = async (challanId: string) => {
    setBusy(true);
    try {
      await api.updateEsicChallan(challanId, { action: 'RECONCILE' });
      toast.success('Reconciliation Complete', 'ESIC Challan verified against locked statutory filing.');
      await loadData();
    } catch (err: any) {
      toast.error('Reconciliation Failed', err?.message || 'Amount mismatch or Maker cannot reconcile');
    } finally {
      setBusy(false);
    }
  };

  // Aggregated totals
  const totalEmployees = selectedFiling?.totalEmployees || 0;
  const totalGrossWages = selectedFiling?.totalGrossWages || 0;
  const totalEeShare = selectedFiling?.totalEeShare || 0;
  const totalErShare = selectedFiling?.totalErShare || 0;
  const totalChallan = totalEeShare + totalErShare;

  return (
    <div className="space-y-6">
      {/* Header & Sub-tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">ESIC Monthly Returns & Challan</h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              P2.7-C Phase 3
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Section 2(22) Wage Matrix, Rule 52 Daily Wage Exemption, Event-First Reason Codes, and 14-Digit CPRN Challan Reconciliation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              onClick={() => setActiveSubTab('filings')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeSubTab === 'filings' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Returns
            </button>
            <button
              onClick={() => setActiveSubTab('challans')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeSubTab === 'challans' ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Challans & CPRN ({challans.length})
            </button>
          </div>
        </div>
      </div>

      {activeSubTab === 'filings' && (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs uppercase font-semibold">Covered Staff</span>
                <Users className="w-4 h-4 text-brand-400" />
              </div>
              <p className="text-2xl font-bold text-white">{totalEmployees}</p>
              <span className="text-xs text-slate-500">Gross &lt;= ₹21,000 / Cont.</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs uppercase font-semibold">Total ESI Wages</span>
                <Building2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white">{money(totalGrossWages)}</p>
              <span className="text-xs text-slate-500">Sec 2(22) matrix base</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs uppercase font-semibold">Employee Share</span>
                <Landmark className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-2xl font-bold text-white">{money(totalEeShare)}</p>
              <span className="text-xs text-slate-500">0.75% (Rule 52 exempt &lt;= ₹176)</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs uppercase font-semibold">Employer Share</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-bold text-white">{money(totalErShare)}</p>
              <span className="text-xs text-slate-500">3.25% statutory rate</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-xs uppercase font-semibold">Total Challan</span>
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-white">{money(totalChallan)}</p>
              <span className="text-xs text-slate-500">EE (0.75%) + ER (3.25%)</span>
            </div>
          </div>

          {/* Master-Detail Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Filing Selection List */}
            <div className="lg:col-span-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase text-slate-400 tracking-wider">Wage Month Filings</h3>
              {filings.length === 0 ? (
                <EmptyState
                  title="No ESIC Filings Found"
                  description="Generate a statutory filing from a finalized payroll run."
                />
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {filings.map((f) => {
                    const isSelected = f.id === selectedFilingId;
                    const statusColors: Record<string, string> = {
                      DRAFT: 'bg-slate-700 text-slate-300',
                      VALIDATED: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
                      PENDING_APPROVAL: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                      APPROVED: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
                      LOCKED: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
                      EXPORTED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                    };
                    return (
                      <div
                        key={f.id}
                        onClick={() => setSelectedFilingId(f.id)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-brand-500/50 bg-brand-500/10 shadow-lg shadow-brand-500/5'
                            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-semibold text-white text-sm">
                            {f.periodMonth ? `Month ${f.periodMonth} / ` : ''}{f.periodYear}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusColors[f.status] || 'bg-slate-800'}`}>
                            {f.status}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{f.totalEmployees} employees</span>
                          <span className="font-mono text-slate-300">{money(f.totalEeShare + f.totalErShare)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Selected Filing Detail & Action Controls */}
            <div className="lg:col-span-8 space-y-4">
              {selectedFiling ? (
                <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/70 space-y-5">
                  {/* Top Bar with Status and Actions */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/80 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-white">
                        ESIC Return Snapshot: {selectedFiling.periodMonth}/{selectedFiling.periodYear}
                      </h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        ID: {selectedFiling.id} • SHA-256: {selectedFiling.sha256Checksum ? `${selectedFiling.sha256Checksum.slice(0, 16)}...` : 'Unsealed'}
                      </p>
                    </div>
                    {/* State-Machine Lifecycle Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedFiling.status === 'DRAFT' && canManage && (
                        <button
                          onClick={handleValidate}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" /> Validate
                        </button>
                      )}
                      {selectedFiling.status === 'VALIDATED' && canManage && (
                        <button
                          onClick={handleSubmit}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium"
                        >
                          <Send className="w-3.5 h-3.5" /> Submit to Checker
                        </button>
                      )}
                      {selectedFiling.status === 'PENDING_APPROVAL' && canApprove && (
                        <button
                          onClick={handleApprove}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Checker Approve
                        </button>
                      )}
                      {selectedFiling.status === 'APPROVED' && canApprove && (
                        <button
                          onClick={handleLock}
                          disabled={busy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
                        >
                          <Lock className="w-3.5 h-3.5" /> Lock & Seal
                        </button>
                      )}
                      {['LOCKED', 'EXPORTED'].includes(selectedFiling.status) && (
                        <>
                          <button
                            onClick={handleExport}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                          >
                            <Download className="w-3.5 h-3.5" /> Export 6-Col CSV
                          </button>
                          {canManage && (
                            <button
                              onClick={handleCreateChallan}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                            >
                              <FileText className="w-3.5 h-3.5" /> Generate Challan
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Pre-Upload Diagnostics Panel */}
                  {diagnostics && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Pre-Upload Statutory Diagnostics
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            diagnostics.valid
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {diagnostics.valid ? 'Compliant for Portal Upload' : `${diagnostics.errors.length} Blocking Issue(s)`}
                        </span>
                      </div>
                      {diagnostics.errors.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {diagnostics.errors.map((err: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">[{err.ruleId}]</span> {err.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {diagnostics.warnings?.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {diagnostics.warnings.map((warn: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">[{warn.ruleId}]</span> {warn.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Employee Snapshot Table */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Captured Employee Snapshot Items ({selectedFiling.items?.length || 0})
                    </span>
                    <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-[350px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">IP Number</th>
                            <th className="py-2.5 px-3">Employee Name</th>
                            <th className="py-2.5 px-3 text-center">Payable Days</th>
                            <th className="py-2.5 px-3 text-right">ESI Wages</th>
                            <th className="py-2.5 px-3 text-right">EE Share (0.75%)</th>
                            <th className="py-2.5 px-3 text-right">ER Share (3.25%)</th>
                            <th className="py-2.5 px-3">LWD Snapshot</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {(selectedFiling.items || []).map((it: any) => (
                            <tr key={it.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 font-mono text-cyan-400">{it.snapshotEsicIp || 'MISSING'}</td>
                              <td className="py-2 px-3 font-medium text-white">{it.snapshotEmployeeName}</td>
                              <td className="py-2 px-3 text-center">{it.payableDays}</td>
                              <td className="py-2 px-3 text-right font-mono">{money(it.grossWages)}</td>
                              <td className="py-2 px-3 text-right font-mono">{money(it.eeEsiShare)}</td>
                              <td className="py-2 px-3 text-right font-mono">{money(it.erEsiShare)}</td>
                              <td className="py-2 px-3 text-slate-400">
                                {it.snapshotLastWorkingDay ? new Date(it.snapshotLastWorkingDay).toLocaleDateString('en-IN') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Select an ESIC Filing"
                  description="Choose a filing from the list to view its immutable statutory snapshot and controls."
                />
              )}
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'challans' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold uppercase text-slate-400 tracking-wider">
              ESIC Monthly Challan Registry
            </h3>
          </div>
          {challans.length === 0 ? (
            <EmptyState
              title="No ESIC Challans Generated"
              description="Lock a monthly filing and click 'Generate Challan' to calculate monthly ESIC liability."
            />
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">CPRN (14-digit)</th>
                    <th className="py-3 px-4 text-center">Employees</th>
                    <th className="py-3 px-4 text-right">Eligible Wages</th>
                    <th className="py-3 px-4 text-right">EE Share</th>
                    <th className="py-3 px-4 text-right">ER Share</th>
                    <th className="py-3 px-4 text-right font-semibold text-white">Total Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {challans.map((ch) => {
                    const statusBadgeColors: Record<string, string> = {
                      CHALLAN_GENERATED: 'bg-slate-700 text-slate-300',
                      PAYMENT_INITIATED: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                      PAID: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
                      RECONCILED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                      CANCELLED: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                    };

                    return (
                      <tr key={ch.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-semibold text-white">
                          {ch.challanPeriodMonth}/{ch.challanPeriodYear}
                        </td>
                        <td className="py-3 px-4 font-mono text-cyan-400">
                          {ch.cprnNumber || <span className="text-slate-500 italic">Unassigned</span>}
                        </td>
                        <td className="py-3 px-4 text-center">{ch.totalEmployees}</td>
                        <td className="py-3 px-4 text-right font-mono">{money(ch.totalWages)}</td>
                        <td className="py-3 px-4 text-right font-mono">{money(ch.employeeShare)}</td>
                        <td className="py-3 px-4 text-right font-mono">{money(ch.employerShare)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          {money(ch.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusBadgeColors[ch.status] || 'bg-slate-800'}`}>
                            {ch.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {ch.status === 'CHALLAN_GENERATED' && (
                            <>
                              <button
                                onClick={() => {
                                  setTargetChallan(ch);
                                  setCprnInput(ch.cprnNumber || '');
                                  setShowCprnModal(true);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                              >
                                Set CPRN
                              </button>
                              {ch.cprnNumber && (
                                <button
                                  onClick={() => {
                                    setTargetChallan(ch);
                                    setPaymentForm({
                                      paidDate: new Date().toISOString().slice(0, 10),
                                      transactionReference: '',
                                      bankReference: '',
                                      cprnNumber: ch.cprnNumber,
                                    });
                                    setShowPaymentModal(true);
                                  }}
                                  className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs"
                                >
                                  Pay
                                </button>
                              )}
                            </>
                          )}
                          {ch.status === 'PAYMENT_INITIATED' && (
                            <button
                              onClick={() => {
                                setTargetChallan(ch);
                                setPaymentForm({
                                  paidDate: new Date().toISOString().slice(0, 10),
                                  transactionReference: '',
                                  bankReference: '',
                                  cprnNumber: ch.cprnNumber || '',
                                });
                                setShowPaymentModal(true);
                              }}
                              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs"
                            >
                              Record Payment
                            </button>
                          )}
                          {ch.status === 'PAID' && canApprove && (
                            <button
                              onClick={() => handleReconcile(ch.id)}
                              disabled={busy}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                            >
                              Reconcile
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Set CPRN Modal */}
      {showCprnModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Assign ESIC 14-Digit CPRN</h3>
            <p className="text-xs text-slate-400">
              Enter the Challan Payment Reference Number (CPRN) issued by the ESIC portal after return upload.
            </p>
            <div>
              <label className="text-xs font-medium text-slate-300">14-Digit CPRN Number</label>
              <input
                type="text"
                maxLength={14}
                value={cprnInput}
                onChange={(e) => setCprnInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 12345678901234"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm tracking-wider focus:outline-none focus:border-brand-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Must be exactly 14 numeric digits.</span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCprnModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSetCprn}
                disabled={cprnInput.length !== 14 || busy}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
              >
                Save CPRN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Record ESIC Challan Payment</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.paidDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paidDate: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Bank / Transaction Reference</label>
                <input
                  type="text"
                  value={paymentForm.transactionReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
                  placeholder="e.g. CIN / UTR / Reference No."
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={!paymentForm.paidDate || busy}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
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
