import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Hash,
  Info,
  Landmark,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  tdsApi,
  type TdsStatutoryFiling,
  type TdsFilingItem,
  type TdsChallan,
  type TdsChallanAllocation,
} from './tdsApi';

const money = (n: number | undefined | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n || 0);

const moneyInt = (n: number | undefined | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

export const TdsComplianceTab: React.FC = () => {
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

  // Master State
  const [busy, setBusy] = useState(false);
  const [filings, setFilings] = useState<TdsStatutoryFiling[]>([]);
  const [challans, setChallans] = useState<TdsChallan[]>([]);
  const [selectedFilingId, setSelectedFilingId] = useState<string | null>(null);
  const [selectedFiling, setSelectedFiling] = useState<TdsStatutoryFiling | null>(null);
  const [allocations, setAllocations] = useState<TdsChallanAllocation[]>([]);
  const [companySettings, setCompanySettings] = useState<any | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);

  // Filter & Sub-Tab State
  const [selectedFy, setSelectedFy] = useState('2025-26');
  const [selectedQuarter, setSelectedQuarter] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'filings' | 'challans'>('filings');
  const [itemSearch, setItemSearch] = useState('');

  // Modals
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showForm27AModal, setShowForm27AModal] = useState(false);
  const [targetItemForAllocation, setTargetItemForAllocation] = useState<TdsFilingItem | null>(null);

  // Snapshot Form
  const [snapshotForm, setSnapshotForm] = useState({
    financialYear: '2025-26',
    quarter: 'Q1' as 'Q1' | 'Q2' | 'Q3' | 'Q4',
    filingType: 'ORIGINAL' as 'ORIGINAL' | 'REVISED',
    supersededFilingId: '',
    tokenNumberPrn: '',
    autoAllocateChallanFifo: true,
    selectedRunIds: [] as string[],
  });

  // Challan Form
  const [challanForm, setChallanForm] = useState({
    financialYear: '2025-26',
    quarter: 'Q1' as 'Q1' | 'Q2' | 'Q3' | 'Q4',
    bsrCode: '',
    challanDate: new Date().toISOString().slice(0, 10),
    challanSerialNo: '',
    minorHead: '200' as '200' | '400',
    tdsAmount: 0,
    surcharge: 0,
    cess: 0,
    interest: 0,
    fee: 0,
    chequeOrDdNo: '',
  });

  // Allocation Form
  const [allocationForm, setAllocationForm] = useState({
    tdsChallanId: '',
    allocatedTds: 0,
    allocatedSurcharge: 0,
    allocatedCess: 0,
  });

  // Token Form
  const [tokenForm, setTokenForm] = useState({
    tokenNumberPrn: '',
    receiptDate: new Date().toISOString().slice(0, 10),
  });

  // Load Master Data
  const loadData = useCallback(async () => {
    setBusy(true);
    try {
      const [filingsList, challansList, cfg, settings] = await Promise.all([
        tdsApi.getFilings(),
        tdsApi.getChallans(),
        tdsApi.getPayrollConfiguration().catch(() => ({ runs: [] })),
        tdsApi.getCompanySettings().catch(() => null),
      ]);
      setFilings(filingsList || []);
      setChallans(challansList || []);
      setPayrollRuns(cfg?.runs || []);
      setCompanySettings(settings);

      if (!selectedFilingId && filingsList && filingsList.length > 0) {
        setSelectedFilingId(filingsList[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load TDS compliance data', err?.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [selectedFilingId, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load Selected Filing Details
  const loadFilingDetails = useCallback(async (id: string) => {
    try {
      const [filing, allocs] = await Promise.all([
        tdsApi.getFiling(id),
        tdsApi.getAllocations(id).catch(() => []),
      ]);
      setSelectedFiling(filing);
      setAllocations(allocs || []);
    } catch (err: any) {
      console.error('Failed to load TDS filing details', err);
    }
  }, []);

  useEffect(() => {
    if (selectedFilingId) {
      void loadFilingDetails(selectedFilingId);
    }
  }, [selectedFilingId, loadFilingDetails]);

  // Filtered filings
  const filteredFilings = useMemo(() => {
    return filings.filter((f) => {
      const fyMatch = !selectedFy || `${f.periodYear}-${String(f.periodYear + 1).slice(-2)}` === selectedFy;
      const quarterMatch = selectedQuarter === 'ALL' || f.quarter === selectedQuarter;
      return fyMatch && quarterMatch;
    });
  }, [filings, selectedFy, selectedQuarter]);

  // Statutory Form resolution based on Financial Year
  const resolvedFormSpec = useMemo(() => {
    const startYear = parseInt(selectedFy.split('-')[0] || '2025', 10);
    if (startYear >= 2026) {
      return {
        formCode: '138',
        governingAct: 'Income-tax Act, 2025',
        formatVersion: 'ITD Unified Return v1.2',
        color: 'indigo',
      };
    }
    return {
      formCode: '24Q',
      governingAct: 'Income-tax Act, 1961',
      formatVersion: 'Protean ASCII e-TDS File v6.3 / v7.5',
      color: 'blue',
    };
  }, [selectedFy]);

  // Eligible payroll runs for snapshot modal
  const eligibleRuns = useMemo(() => {
    const quarterMonthMap: Record<string, string[]> = {
      Q1: ['04', '05', '06'],
      Q2: ['07', '08', '09'],
      Q3: ['10', '11', '12'],
      Q4: ['01', '02', '03'],
    };
    const startYear = parseInt(snapshotForm.financialYear.split('-')[0], 10);
    const months = quarterMonthMap[snapshotForm.quarter] || [];

    return payrollRuns.filter((r) => {
      const parts = r.month.split('-');
      const y = parseInt(parts[0], 10);
      const m = parts[1];
      const matchYear = snapshotForm.quarter === 'Q4' ? y === startYear + 1 : y === startYear;
      return matchYear && months.includes(m);
    });
  }, [payrollRuns, snapshotForm.financialYear, snapshotForm.quarter]);

  // Actions
  const handleValidate = async (id: string) => {
    setBusy(true);
    try {
      const res = await tdsApi.validateFiling(id);
      toast.success('Filing passed statutory diagnostics and is VALIDATED');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      const diagMsg = err.details?.diagnostics?.join(', ') || err.message;
      toast.error('Validation failed', diagMsg);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    setBusy(true);
    try {
      await tdsApi.submitForApproval(id);
      toast.success('Filing submitted for Checker review');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Submission failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (id: string) => {
    setBusy(true);
    try {
      await tdsApi.approveFiling(id);
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
      const locked = await tdsApi.lockFiling(id);
      toast.success(
        `Filing locked and sealed with SHA-256 seal: ${locked.sha256Checksum?.slice(0, 12)}...`
      );
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Locking failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadEtds = async (id: string) => {
    try {
      await tdsApi.downloadEtdsFile(id);
      toast.success('Downloaded official Protean ASCII e-TDS Return text file (.txt)');
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Export failed', err?.message);
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (snapshotForm.selectedRunIds.length === 0) {
      toast.error('Selection required', 'Please select at least 1 locked payroll run.');
      return;
    }
    setBusy(true);
    try {
      const res = await tdsApi.createSnapshot({
        financialYear: snapshotForm.financialYear,
        quarter: snapshotForm.quarter,
        quarterlyPayrollRunIds: snapshotForm.selectedRunIds,
        filingType: snapshotForm.filingType,
        supersededFilingId: snapshotForm.supersededFilingId || undefined,
        tokenNumberPrn: snapshotForm.tokenNumberPrn || undefined,
        autoAllocateChallanFifo: snapshotForm.autoAllocateChallanFifo,
      });

      toast.success(`Form ${res.formCode} quarterly snapshot extracted successfully`);
      setShowSnapshotModal(false);
      await loadData();
      setSelectedFilingId(res.filing.id);
    } catch (err: any) {
      toast.error('Failed to create snapshot', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await tdsApi.createChallan({
        financialYear: challanForm.financialYear,
        quarter: challanForm.quarter,
        bsrCode: challanForm.bsrCode.trim(),
        challanDate: challanForm.challanDate,
        challanSerialNo: challanForm.challanSerialNo.trim(),
        minorHead: challanForm.minorHead,
        tdsAmount: Number(challanForm.tdsAmount),
        surcharge: Number(challanForm.surcharge || 0),
        cess: Number(challanForm.cess || 0),
        interest: Number(challanForm.interest || 0),
        fee: Number(challanForm.fee || 0),
        chequeOrDdNo: challanForm.chequeOrDdNo.trim() || undefined,
        statutoryFilingId: selectedFilingId || undefined,
      });
      toast.success('TDS Challan recorded successfully');
      setShowChallanModal(false);
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Failed to record challan', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAllocationModal = (item: TdsFilingItem) => {
    setTargetItemForAllocation(item);
    const existingAlloc = allocations.find((a) => a.statutoryFilingItemId === item.id);
    setAllocationForm({
      tdsChallanId: existingAlloc?.tdsChallanId || item.tdsChallanId || '',
      allocatedTds: existingAlloc?.allocatedTds ?? item.tdsAmount,
      allocatedSurcharge: existingAlloc?.allocatedSurcharge ?? 0,
      allocatedCess: existingAlloc?.allocatedCess ?? 0,
    });
    setShowAllocationModal(true);
  };

  const handleSaveAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFilingId || !targetItemForAllocation) return;
    if (!allocationForm.tdsChallanId) {
      toast.error('Challan required', 'Please select a deposit challan.');
      return;
    }

    setBusy(true);
    try {
      const allocatedTotal =
        Number(allocationForm.allocatedTds) +
        Number(allocationForm.allocatedSurcharge) +
        Number(allocationForm.allocatedCess);

      await tdsApi.upsertAllocation(selectedFilingId, {
        statutoryFilingItemId: targetItemForAllocation.id,
        tdsChallanId: allocationForm.tdsChallanId,
        allocatedTds: Number(allocationForm.allocatedTds),
        allocatedSurcharge: Number(allocationForm.allocatedSurcharge),
        allocatedCess: Number(allocationForm.allocatedCess),
        allocatedTotal: Number(allocatedTotal.toFixed(2)),
      });

      toast.success('Deductee challan allocation updated');
      setShowAllocationModal(false);
      setTargetItemForAllocation(null);
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Allocation failed', err?.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRecordToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFilingId) return;
    setBusy(true);
    try {
      await tdsApi.recordToken(selectedFilingId, {
        tokenNumberPrn: tokenForm.tokenNumberPrn.trim(),
        receiptDate: tokenForm.receiptDate,
      });
      toast.success('Government ITD PRN / Token Number recorded');
      setShowTokenModal(false);
      await loadData();
      if (selectedFilingId) await loadFilingDetails(selectedFilingId);
    } catch (err: any) {
      toast.error('Failed to record token', err?.message);
    } finally {
      setBusy(false);
    }
  };

  // Status Badge Component
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
            <Clock className="h-3 w-3" /> Draft Snapshot
          </span>
        );
      case 'VALIDATED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-950/80 px-2.5 py-0.5 text-xs font-medium text-blue-300 border border-blue-800/50">
            <ShieldCheck className="h-3 w-3" /> Validated
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 px-2.5 py-0.5 text-xs font-medium text-amber-300 border border-amber-800/50">
            <AlertCircle className="h-3 w-3" /> Pending Checker Approval
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-xs font-medium text-emerald-300 border border-emerald-800/50">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        );
      case 'LOCKED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-950/80 px-2.5 py-0.5 text-xs font-medium text-purple-300 border border-purple-800/50">
            <Lock className="h-3 w-3" /> Sealed & Locked
          </span>
        );
      case 'EXPORTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2.5 py-0.5 text-xs font-medium text-emerald-200 border border-emerald-700">
            <FileCheck2 className="h-3 w-3" /> Exported / Filed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            {status}
          </span>
        );
    }
  };

  // PAN Status Badge
  const renderPanBadge = (status: string, reasonCode?: string | null) => {
    switch (status) {
      case 'VALID':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Valid PAN
          </span>
        );
      case 'PANAPPLIED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
            <Clock className="h-3 w-3" /> PAN Applied
          </span>
        );
      case 'PANNOTAVBL':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
            <AlertTriangle className="h-3 w-3" /> Not Available
            {reasonCode === 'C' && (
              <span className="ml-1 rounded bg-rose-950 px-1 py-0.5 text-[9px] text-rose-300 border border-rose-800">
                Sec 206AA (20%)
              </span>
            )}
          </span>
        );
      case 'PANINVALID':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
            <XCircle className="h-3 w-3" /> Invalid PAN
            {reasonCode === 'C' && (
              <span className="ml-1 rounded bg-rose-950 px-1 py-0.5 text-[9px] text-rose-300 border border-rose-800">
                Sec 206AA (20%)
              </span>
            )}
          </span>
        );
      default:
        return <span className="text-[11px] text-slate-400">{status || '—'}</span>;
    }
  };

  // Segregation of Duties Check
  const isMaker = selectedFiling?.createdById === currentUser?.id;
  const canCheckerApprove = canApprove && !isMaker;

  // Filtered Deductee Items
  const filteredItems = useMemo(() => {
    if (!selectedFiling?.items) return [];
    if (!itemSearch.trim()) return selectedFiling.items;
    const q = itemSearch.toLowerCase();
    return selectedFiling.items.filter(
      (it) =>
        it.snapshotEmployeeName.toLowerCase().includes(q) ||
        it.snapshotEmployeeCode.toLowerCase().includes(q) ||
        (it.snapshotPan && it.snapshotPan.toLowerCase().includes(q))
    );
  }, [selectedFiling?.items, itemSearch]);

  // Aggregate Metrics for Active FY
  const totalTaxForFy = useMemo(
    () => filteredFilings.reduce((sum, f) => sum + (f.totalTaxDeducted || 0), 0),
    [filteredFilings]
  );
  const totalGrossForFy = useMemo(
    () => filteredFilings.reduce((sum, f) => sum + (f.totalGrossWages || 0), 0),
    [filteredFilings]
  );
  const totalChallanDeposited = useMemo(
    () => challans.reduce((sum, c) => sum + (c.totalAmount || 0), 0),
    [challans]
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Statutory Indicator */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Landmark className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  TDS Quarterly Statutory Compliance
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      resolvedFormSpec.formCode === '138'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                        : 'bg-blue-950 text-blue-300 border border-blue-700'
                    }`}
                  >
                    Form {resolvedFormSpec.formCode}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {resolvedFormSpec.governingAct} • {resolvedFormSpec.formatVersion} • Component-level Challan Accounting
                </p>
              </div>
            </div>
          </div>

          {/* Quick Global Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void loadData()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
              title="Refresh compliance filings"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {canManage && (
              <>
                <button
                  onClick={() => setShowChallanModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  Record Challan
                </button>

                <button
                  onClick={() => setShowSnapshotModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-brand-600 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Generate Quarterly Snapshot
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Financial Year:</span>
              <select
                value={selectedFy}
                onChange={(e) => setSelectedFy(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="2024-25">FY 2024-25 (Form 24Q)</option>
                <option value="2025-26">FY 2025-26 (Form 24Q - Transition)</option>
                <option value="2026-27">FY 2026-27 (Form 138 - IT Act 2025)</option>
                <option value="2027-28">FY 2027-28 (Form 138)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Quarter:</span>
              <div className="flex rounded-lg border border-slate-700 bg-slate-800/60 p-0.5">
                {(['ALL', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setSelectedQuarter(q)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      selectedQuarter === q
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sub Navigation */}
          <div className="flex rounded-xl border border-slate-700/80 bg-slate-900 p-1">
            <button
              onClick={() => setActiveSubTab('filings')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeSubTab === 'filings'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Quarterly Filings & Deductees
            </button>
            <button
              onClick={() => setActiveSubTab('challans')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeSubTab === 'challans'
                  ? 'bg-slate-800 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Landmark className="h-3.5 w-3.5" />
              Challan Repository & Ledger
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Quarterly Filings</span>
            <FileText className="h-4 w-4 text-brand-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{filteredFilings.length}</div>
          <div className="mt-1 text-xs text-slate-500">
            {filteredFilings.filter((f) => ['LOCKED', 'EXPORTED'].includes(f.status)).length} sealed / filed
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total TDS Deducted</span>
            <Landmark className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400">{moneyInt(totalTaxForFy)}</div>
          <div className="mt-1 text-xs text-slate-500">Under {resolvedFormSpec.governingAct}</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Gross Wages</span>
            <Users className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{moneyInt(totalGrossForFy)}</div>
          <div className="mt-1 text-xs text-slate-500">Across consolidated runs</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Challan Deposits</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{moneyInt(totalChallanDeposited)}</div>
          <div className="mt-1 text-xs text-slate-500">{challans.length} active challans</div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: FILINGS & DEDUCTEE ROSTER */}
      {/* ===================================================================== */}
      {activeSubTab === 'filings' && (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          {/* Left Column: Filings List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">Returns & Statements</h3>
              <span className="text-xs text-slate-500">{filteredFilings.length} found</span>
            </div>

            <div className="space-y-2">
              {filteredFilings.map((filing) => {
                const isSelected = selectedFilingId === filing.id;
                return (
                  <article
                    key={filing.id}
                    onClick={() => setSelectedFilingId(filing.id)}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/5 shadow-md ring-1 ring-brand-500/30'
                        : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <b className="text-sm text-white">
                            Form {filing.statutoryFormCode || '24Q'} — {filing.quarter}
                          </b>
                          {filing.filingType === 'REVISED' && (
                            <span className="rounded bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-800">
                              REVISED
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          FY {filing.periodYear}-{String(filing.periodYear + 1).slice(-2)} • {filing.totalEmployees} Deductees
                        </p>
                      </div>
                      <div>{renderStatusBadge(filing.status)}</div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs">
                      <div>
                        <span className="text-slate-500">TDS: </span>
                        <b className="text-amber-300">{money(filing.totalTaxDeducted)}</b>
                      </div>
                      <div className="text-slate-400">
                        Gross: {money(filing.totalGrossWages)}
                      </div>
                    </div>

                    {filing.sha256Checksum && (
                      <div className="mt-2 flex items-center gap-1 rounded bg-slate-950/60 px-2 py-1 text-[10px] text-slate-400 font-mono">
                        <Lock className="h-3 w-3 text-purple-400 shrink-0" />
                        <span className="truncate">Seal: {filing.sha256Checksum}</span>
                      </div>
                    )}
                  </article>
                );
              })}

              {filteredFilings.length === 0 && (
                <EmptyState
                  title="No TDS returns found"
                  description="Click 'Generate Quarterly Snapshot' above to extract Form 24Q / 138 from payroll runs."
                  icon={FileSpreadsheet}
                />
              )}
            </div>
          </div>

          {/* Right Column: Selected Filing Details & Actions */}
          <div className="space-y-5">
            {selectedFiling ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-5 shadow-lg">
                {/* Header & Status Bar */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">
                        Form {selectedFiling.statutoryFormCode || '24Q'} — {selectedFiling.quarter} (FY {selectedFiling.periodYear}-{String(selectedFiling.periodYear + 1).slice(-2)})
                      </h2>
                      {renderStatusBadge(selectedFiling.status)}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      ID: <span className="font-mono text-slate-300">{selectedFiling.id}</span> • Created:{' '}
                      {new Date(selectedFiling.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>

                  {/* Maker-Checker & Action Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Step 1: Validate (Maker) */}
                    {['DRAFT', 'VALIDATED'].includes(selectedFiling.status) && canManage && (
                      <button
                        onClick={() => void handleValidate(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-xl border border-blue-700 bg-blue-950/60 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-blue-900 transition"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Run Statutory Validation
                      </button>
                    )}

                    {/* Step 2: Submit for Approval (Maker) */}
                    {selectedFiling.status === 'VALIDATED' && canManage && (
                      <button
                        onClick={() => void handleSubmitForApproval(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 transition"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Submit for Checker Review
                      </button>
                    )}

                    {/* Step 3: Approve (Checker with SoD enforcement) */}
                    {selectedFiling.status === 'PENDING_APPROVAL' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleApprove(selectedFiling.id)}
                          disabled={busy || !canCheckerApprove}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                          title={
                            isMaker
                              ? 'Segregation of Duties: Maker who created the filing cannot approve it'
                              : 'Approve statutory return'
                          }
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Approve Filing
                        </button>

                        {isMaker && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-800/40">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Maker cannot self-approve (SoD)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Step 4: Lock & Seal (Approved -> Locked) */}
                    {selectedFiling.status === 'APPROVED' && canApprove && (
                      <button
                        onClick={() => void handleLock(selectedFiling.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition shadow"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Lock & Generate SHA-256 Seal
                      </button>
                    )}

                    {/* Step 5: Export / Download official e-TDS Return (.txt) */}
                    {['LOCKED', 'EXPORTED'].includes(selectedFiling.status) && canManage && (
                      <button
                        onClick={() => void handleDownloadEtds(selectedFiling.id)}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download e-TDS (.txt)
                      </button>
                    )}

                    {/* Companion Form 27A Sheet */}
                    <button
                      onClick={() => setShowForm27AModal(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
                    >
                      <Printer className="h-3.5 w-3.5 text-brand-400" />
                      View Form 27A
                    </button>

                    {/* Step 6: Record ITD Token / PRN */}
                    {['LOCKED', 'EXPORTED'].includes(selectedFiling.status) && canManage && (
                      <button
                        onClick={() => {
                          setTokenForm({
                            tokenNumberPrn: selectedFiling.tokenNumberPrn || '',
                            receiptDate: selectedFiling.filingReceiptDate
                              ? selectedFiling.filingReceiptDate.slice(0, 10)
                              : new Date().toISOString().slice(0, 10),
                          });
                          setShowTokenModal(true);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-brand-500/50 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300 hover:bg-brand-500/20 transition"
                      >
                        <Hash className="h-3.5 w-3.5" />
                        {selectedFiling.tokenNumberPrn ? 'Update PRN' : 'Record ITD Token'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Audit & Cryptographic Seal Strip */}
                {selectedFiling.sha256Checksum && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-purple-300 font-semibold">
                        <ShieldCheck className="h-4 w-4" />
                        Cryptographic SHA-256 Canonical Seal Verified
                      </div>
                      {selectedFiling.lockedAt && (
                        <span className="text-[11px] text-slate-400">
                          Sealed on: {new Date(selectedFiling.lockedAt).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] text-purple-200/90 break-all bg-slate-950/80 p-2 rounded-lg border border-purple-900/40">
                      {selectedFiling.sha256Checksum}
                    </div>
                  </div>
                )}

                {/* ITD Token Record Strip if present */}
                {selectedFiling.tokenNumberPrn && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <div>
                        <span className="text-slate-400">ITD Provisional Receipt No (PRN): </span>
                        <b className="font-mono text-emerald-300">{selectedFiling.tokenNumberPrn}</b>
                      </div>
                    </div>
                    {selectedFiling.filingReceiptDate && (
                      <span className="text-[11px] text-slate-400">
                        Filed Date: {new Date(selectedFiling.filingReceiptDate).toLocaleDateString('en-IN')}
                      </span>
                    )}
                  </div>
                )}

                {/* Control Totals Breakdown */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Total Deductees</span>
                    <b className="text-base text-white">{selectedFiling.totalEmployees} Employees</b>
                  </div>
                  <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Total Gross Wages Paid</span>
                    <b className="text-base text-white">{money(selectedFiling.totalGrossWages)}</b>
                  </div>
                  <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Total Tax Deducted (TDS)</span>
                    <b className="text-base text-amber-300">{money(selectedFiling.totalTaxDeducted)}</b>
                  </div>
                </div>

                {/* Deductee Items Table & Search */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Users className="h-4 w-4 text-brand-400" />
                      Annexure I — Deductee Records ({filteredItems.length})
                    </h3>

                    <input
                      type="text"
                      placeholder="Search deductee name, code, PAN..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400">
                        <tr>
                          <th className="py-2.5 px-3">Deductee / Code</th>
                          <th className="py-2.5 px-3">PAN & Status</th>
                          <th className="py-2.5 px-3 text-right">Gross Salary (₹)</th>
                          <th className="py-2.5 px-3 text-right">TDS (₹)</th>
                          <th className="py-2.5 px-3">Challan Link</th>
                          <th className="py-2.5 px-3 text-right">Allocated (₹)</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {filteredItems.map((item) => {
                          const linkedChallan = selectedFiling.challans?.find(
                            (c) => c.id === item.tdsChallanId
                          );
                          const alloc = allocations.find(
                            (a) => a.statutoryFilingItemId === item.id
                          );
                          const isFullyAllocated =
                            alloc && Number(alloc.allocatedTotal.toFixed(2)) === Number(item.tdsAmount.toFixed(2));

                          return (
                            <tr key={item.id} className="hover:bg-slate-800/30 transition">
                              <td className="py-2.5 px-3">
                                <b className="text-white block">{item.snapshotEmployeeName}</b>
                                <span className="text-[11px] text-slate-500">
                                  {item.snapshotEmployeeCode}
                                </span>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="font-mono text-slate-300">
                                  {item.snapshotPan || 'PANNOTAVBL'}
                                </div>
                                <div className="mt-0.5">
                                  {renderPanBadge(item.panStatus, item.deducteeReasonCode)}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right font-medium text-slate-200">
                                {money(item.grossWages)}
                              </td>

                              <td className="py-2.5 px-3 text-right font-semibold text-amber-300">
                                {money(item.tdsAmount)}
                              </td>

                              <td className="py-2.5 px-3">
                                {linkedChallan ? (
                                  <div>
                                    <span className="font-mono text-[11px] text-slate-300 block">
                                      BSR: {linkedChallan.bsrCode}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Serial: {linkedChallan.challanSerialNo}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-rose-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Unassigned
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                {alloc ? (
                                  <div>
                                    <span
                                      className={`font-semibold ${
                                        isFullyAllocated ? 'text-emerald-400' : 'text-amber-400'
                                      }`}
                                    >
                                      {money(alloc.allocatedTotal)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 block">
                                      TDS: {money(alloc.allocatedTds)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                {!['LOCKED', 'EXPORTED'].includes(selectedFiling.status) && canManage && (
                                  <button
                                    onClick={() => handleOpenAllocationModal(item)}
                                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition"
                                  >
                                    Adjust
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}

                        {filteredItems.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-6 text-center text-slate-500">
                              No deductee records match search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Select a TDS filing"
                description="Choose a quarterly filing on the left to inspect its deductees, ledger allocations, and lifecycle status."
                icon={FileSpreadsheet}
              />
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: CHALLAN REPOSITORY & LEDGER */}
      {/* ===================================================================== */}
      {activeSubTab === 'challans' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-400" />
                Income Tax Department (ITD) Challan Repository
              </h3>
              <p className="text-xs text-slate-400">
                Challan 281 deposits under Minor Head 200 (Normal Deduction) & 400 (Regular Assessment).
                Penal interest and late fees are quarantined from salary allocations.
              </p>
            </div>

            {canManage && (
              <button
                onClick={() => setShowChallanModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow"
              >
                <Plus className="h-3.5 w-3.5" />
                Record New Challan
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {challans.map((c) => {
              const allocatedSum = allocations
                .filter((a) => a.tdsChallanId === c.id)
                .reduce((sum, a) => sum + (a.allocatedTotal || 0), 0);
              const remainingCap = (c.tdsAmount || 0) + (c.surcharge || 0) + (c.cess || 0) - allocatedSum;
              const hasQuarantinedPenalties = (c.interest || 0) > 0 || (c.fee || 0) > 0;

              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3 shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <b className="text-sm text-white font-mono">BSR: {c.bsrCode}</b>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">
                          SN: {c.challanSerialNo}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Deposited: {new Date(c.challanDate).toLocaleDateString('en-IN')} • Minor Head {c.minorHead}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800">
                      {c.quarter} {c.financialYear}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-950/70 p-3 space-y-1.5 text-xs border border-slate-800/80">
                    <div className="flex justify-between text-slate-400">
                      <span>TDS Tax Component:</span>
                      <b className="text-white">{money(c.tdsAmount)}</b>
                    </div>
                    {(c.surcharge > 0 || c.cess > 0) && (
                      <div className="flex justify-between text-slate-400">
                        <span>Surcharge & Cess:</span>
                        <span className="text-slate-300">{money((c.surcharge || 0) + (c.cess || 0))}</span>
                      </div>
                    )}
                    {hasQuarantinedPenalties && (
                      <div className="flex justify-between text-amber-400/90 border-t border-slate-800/80 pt-1 text-[11px]">
                        <span className="flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          Quarantined Interest & Late Fee:
                        </span>
                        <span>{money((c.interest || 0) + (c.fee || 0))}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-800 pt-1.5 font-bold text-white">
                      <span>Total Deposited:</span>
                      <span className="text-emerald-400">{money(c.totalAmount)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800/60">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Allocated to Deductees</span>
                      <b className="text-slate-300">{money(allocatedSum)}</b>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[10px]">Remaining Balance</span>
                      <b className={remainingCap >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {money(remainingCap)}
                      </b>
                    </div>
                  </div>
                </div>
              );
            })}

            {challans.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="No Challans recorded"
                  description="Add Challan 281 deposits to reconcile deductee tax credits."
                  icon={Landmark}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: GENERATE QUARTERLY SNAPSHOT */}
      {/* ===================================================================== */}
      {showSnapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-brand-400" />
                  Generate Quarterly TDS Snapshot
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Consolidates 1–3 locked monthly payroll runs into a quarterly statutory return.
                </p>
              </div>
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Financial Year</label>
                  <select
                    value={snapshotForm.financialYear}
                    onChange={(e) =>
                      setSnapshotForm((prev) => ({ ...prev, financialYear: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="2024-25">2024-25</option>
                    <option value="2025-26">2025-26</option>
                    <option value="2026-27">2026-27</option>
                    <option value="2027-28">2027-28</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Quarter</label>
                  <select
                    value={snapshotForm.quarter}
                    onChange={(e) =>
                      setSnapshotForm((prev) => ({
                        ...prev,
                        quarter: e.target.value as any,
                        selectedRunIds: [],
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="Q1">Q1 (Apr – Jun)</option>
                    <option value="Q2">Q2 (Jul – Sep)</option>
                    <option value="Q3">Q3 (Oct – Dec)</option>
                    <option value="Q4">Q4 (Jan – Mar)</option>
                  </select>
                </div>
              </div>

              {/* Resolved Statutory Target Form Banner */}
              <div className="rounded-xl bg-slate-950/80 p-3 border border-slate-800 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-brand-300">
                  <Info className="h-3.5 w-3.5" />
                  Statutory Output Specification:
                </div>
                <p className="text-slate-300">
                  {parseInt(snapshotForm.financialYear.split('-')[0], 10) >= 2026 ? (
                    <span>
                      <b>Form 138</b> under the <i>Income-tax Act, 2025</i>. Generates ITD Unified format return with enhanced deductee fields.
                    </span>
                  ) : (
                    <span>
                      <b>Form 24Q</b> under the <i>Income-tax Act, 1961</i>. Generates official Protean (NSDL) ASCII file (v6.3 / v7.5).
                    </span>
                  )}
                </p>
              </div>

              {/* Constituent Payroll Runs Selector */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Select Constituent Payroll Runs (1 to 3 locked runs required):
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                  {eligibleRuns.map((r) => {
                    const isChecked = snapshotForm.selectedRunIds.includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-900 cursor-pointer transition text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSnapshotForm((prev) => ({
                                ...prev,
                                selectedRunIds: checked
                                  ? [...prev.selectedRunIds, r.id]
                                  : prev.selectedRunIds.filter((id) => id !== r.id),
                              }));
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-0"
                          />
                          <span className="font-semibold text-white">{r.month}</span>
                          <span className="text-[11px] text-slate-400">
                            ({r.totalEmployees} employees)
                          </span>
                        </div>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {r.status}
                        </span>
                      </label>
                    );
                  })}

                  {eligibleRuns.length === 0 && (
                    <p className="py-3 text-center text-slate-500">
                      No payroll runs found for {snapshotForm.financialYear} {snapshotForm.quarter}.
                    </p>
                  )}
                </div>
              </div>

              {/* Filing Type: Original vs Revised */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Statement Type</label>
                  <select
                    value={snapshotForm.filingType}
                    onChange={(e) =>
                      setSnapshotForm((prev) => ({ ...prev, filingType: e.target.value as any }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="ORIGINAL">Original Regular Statement</option>
                    <option value="REVISED">Revised / Correction Statement</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={snapshotForm.autoAllocateChallanFifo}
                      onChange={(e) =>
                        setSnapshotForm((prev) => ({
                          ...prev,
                          autoAllocateChallanFifo: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-0"
                    />
                    <span>Auto-allocate Challans (FIFO)</span>
                  </label>
                </div>
              </div>

              {snapshotForm.filingType === 'REVISED' && (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-500/30 bg-amber-950/10 p-3">
                  <div>
                    <label className="block text-amber-300 mb-1">Previous Token Number / PRN</label>
                    <input
                      type="text"
                      placeholder="15-digit PRN"
                      value={snapshotForm.tokenNumberPrn}
                      onChange={(e) =>
                        setSnapshotForm((prev) => ({ ...prev, tokenNumberPrn: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-amber-300 mb-1">Superseded Filing ID</label>
                    <input
                      type="text"
                      placeholder="Original UUID"
                      value={snapshotForm.supersededFilingId}
                      onChange={(e) =>
                        setSnapshotForm((prev) => ({
                          ...prev,
                          supersededFilingId: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSnapshotModal(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 font-medium text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || snapshotForm.selectedRunIds.length === 0}
                  className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition"
                >
                  Extract Snapshot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: RECORD CHALLAN */}
      {/* ===================================================================== */}
      {showChallanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-emerald-400" />
                  Record TDS Challan 281 Deposit
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Record bank counterfoil details for quarterly reconciliation.
                </p>
              </div>
              <button
                onClick={() => setShowChallanModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChallan} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Financial Year</label>
                  <select
                    value={challanForm.financialYear}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, financialYear: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  >
                    <option value="2024-25">2024-25</option>
                    <option value="2025-26">2025-26</option>
                    <option value="2026-27">2026-27</option>
                    <option value="2027-28">2027-28</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Quarter</label>
                  <select
                    value={challanForm.quarter}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, quarter: e.target.value as any }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  >
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="Q4">Q4</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">BSR Code (7 Digits)</label>
                  <input
                    required
                    maxLength={7}
                    pattern="^[0-9]{7}$"
                    placeholder="e.g. 0210001"
                    value={challanForm.bsrCode}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, bsrCode: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Challan Date</label>
                  <input
                    required
                    type="date"
                    value={challanForm.challanDate}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, challanDate: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Serial No (5 Digits)</label>
                  <input
                    required
                    maxLength={5}
                    pattern="^[0-9]{5}$"
                    placeholder="e.g. 00042"
                    value={challanForm.challanSerialNo}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, challanSerialNo: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Minor Head</label>
                  <select
                    value={challanForm.minorHead}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, minorHead: e.target.value as any }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  >
                    <option value="200">200 (Normal Deduction)</option>
                    <option value="400">400 (Regular Assessment)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">TDS Amount (₹)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={challanForm.tdsAmount || ''}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, tdsAmount: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Surcharge (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={challanForm.surcharge || ''}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, surcharge: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Cess (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={challanForm.cess || ''}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, cess: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-amber-300 mb-1">Interest u/s 201(1A)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={challanForm.interest || ''}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, interest: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-amber-800/60 bg-slate-950 p-2 text-amber-300"
                    title="Quarantined penalty - not allocable to salary deductees"
                  />
                </div>

                <div>
                  <label className="block text-amber-300 mb-1">Late Fee u/s 234E</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={challanForm.fee || ''}
                    onChange={(e) =>
                      setChallanForm((prev) => ({ ...prev, fee: Number(e.target.value) }))
                    }
                    className="w-full rounded-xl border border-amber-800/60 bg-slate-950 p-2 text-amber-300"
                    title="Quarantined penalty - not allocable to salary deductees"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Cheque / DD / Reference No (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 542018"
                  value={challanForm.chequeOrDdNo}
                  onChange={(e) =>
                    setChallanForm((prev) => ({ ...prev, chequeOrDdNo: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowChallanModal(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 font-medium text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Save Challan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: ADJUST DEDUCTEE CHALLAN ALLOCATION */}
      {/* ===================================================================== */}
      {showAllocationModal && targetItemForAllocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-400" />
                  Adjust Component Allocation
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {targetItemForAllocation.snapshotEmployeeName} ({targetItemForAllocation.snapshotEmployeeCode})
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAllocationModal(false);
                  setTargetItemForAllocation(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAllocation} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Target Deposit Challan</label>
                <select
                  required
                  value={allocationForm.tdsChallanId}
                  onChange={(e) =>
                    setAllocationForm((prev) => ({ ...prev, tdsChallanId: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white"
                >
                  <option value="">Select Challan</option>
                  {challans.map((c) => (
                    <option key={c.id} value={c.id}>
                      BSR {c.bsrCode} • Serial {c.challanSerialNo} • Total {money(c.totalAmount)} ({c.quarter} {c.financialYear})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-slate-950/70 p-3 space-y-1 border border-slate-800 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Gross Salary:</span>
                  <span className="text-white">{money(targetItemForAllocation.grossWages)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Deducted TDS:</span>
                  <b className="text-amber-300">{money(targetItemForAllocation.tdsAmount)}</b>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-slate-400 mb-1">Allocated TDS Tax (₹)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={allocationForm.allocatedTds}
                    onChange={(e) =>
                      setAllocationForm((prev) => ({
                        ...prev,
                        allocatedTds: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1">Allocated Surcharge (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={allocationForm.allocatedSurcharge}
                      onChange={(e) =>
                        setAllocationForm((prev) => ({
                          ...prev,
                          allocatedSurcharge: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Allocated Cess (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={allocationForm.allocatedCess}
                      onChange={(e) =>
                        setAllocationForm((prev) => ({
                          ...prev,
                          allocatedCess: Number(e.target.value),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center rounded-xl bg-slate-950 p-2.5 font-bold border border-slate-800">
                <span className="text-slate-400">Total Allocated:</span>
                <span className="text-emerald-400">
                  {money(
                    Number(allocationForm.allocatedTds) +
                      Number(allocationForm.allocatedSurcharge) +
                      Number(allocationForm.allocatedCess)
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAllocationModal(false);
                    setTargetItemForAllocation(null);
                  }}
                  className="rounded-xl bg-slate-800 px-4 py-2 font-medium text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 transition"
                >
                  Save Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: RECORD ITD TOKEN NUMBER / PRN */}
      {/* ===================================================================== */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Hash className="h-5 w-5 text-brand-400" />
                  Record Government PRN / Token Number
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Provisional Receipt Number issued by TIN-FC / Income Tax portal upon return upload.
                </p>
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordToken} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  15-Digit Token Number / PRN
                </label>
                <input
                  required
                  minLength={5}
                  maxLength={30}
                  placeholder="e.g. 050010200000123"
                  value={tokenForm.tokenNumberPrn}
                  onChange={(e) =>
                    setTokenForm((prev) => ({ ...prev, tokenNumberPrn: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Filing Receipt Date</label>
                <input
                  required
                  type="date"
                  value={tokenForm.receiptDate}
                  onChange={(e) =>
                    setTokenForm((prev) => ({ ...prev, receiptDate: e.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 font-medium text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 transition"
                >
                  Save Token Number
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: INTERNAL FORM 27A CONTROL SUMMARY / PHYSICAL VERIFICATION SHEET */}
      {/* ===================================================================== */}
      {showForm27AModal && selectedFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-white p-8 text-slate-900 shadow-2xl space-y-6 my-8">
            {/* Action Bar for Modal */}
            <div className="flex items-center justify-between border-b pb-4 print:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Internal Form 27A Control Summary / Physical Verification Sheet
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Form 27A
                </button>
                <button
                  onClick={() => setShowForm27AModal(false)}
                  className="rounded-xl border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Printable Form 27A Document */}
            <div className="space-y-6 text-xs text-slate-800">
              {/* Header */}
              <div className="text-center space-y-1">
                <h1 className="text-base font-bold uppercase tracking-wide">
                  Form No. 27A
                </h1>
                <p className="text-[11px] text-slate-600">
                  [See rule 37A and 37B of Income-tax Rules, 1962]
                </p>
                <p className="text-xs font-semibold">
                  Form for furnishing information with the statement or return of tax deducted at source
                </p>
                <p className="text-[11px] font-medium text-slate-600">
                  Statement for Form {selectedFiling.statutoryFormCode || '24Q'} — Quarter {selectedFiling.quarter} (FY {selectedFiling.periodYear}-{String(selectedFiling.periodYear + 1).slice(-2)})
                </p>
              </div>

              {/* Deductor Block */}
              <div className="border border-slate-300 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Tax Deduction Account No. (TAN)</span>
                    <b className="font-mono text-sm">{companySettings?.tanNumber || 'TANNOTSET1'}</b>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Permanent Account No. (PAN)</span>
                    <b className="font-mono text-sm">{companySettings?.panNumber || 'PANNOTSET1'}</b>
                  </div>
                </div>

                <div className="border-t pt-2 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Name of the Deductor</span>
                    <b className="text-xs">{companySettings?.legalEntityName || 'OrbitHR Enterprise Employer'}</b>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Type of Deductor</span>
                    <span className="text-xs">Others (Company / Corporate)</span>
                  </div>
                </div>

                <div className="border-t pt-2 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Address of Deductor</span>
                    <p className="text-xs">{companySettings?.registeredAddress || 'Registered Office Address'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Person Responsible for Deduction</span>
                    <b className="text-xs">{companySettings?.responsiblePersonName || 'Authorized Signatory'}</b>
                    <p className="text-[11px] text-slate-600">
                      Designation: {companySettings?.responsiblePersonDesignation || 'Finance Director'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Control Totals */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-2.5 border-b">Control Line</th>
                      <th className="p-2.5 border-b text-right">Value / Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="p-2.5">1. Total Number of Deductee Records (Annexure I)</td>
                      <td className="p-2.5 text-right font-semibold">{selectedFiling.totalEmployees}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">2. Total Gross Amount Paid / Credited to Employees</td>
                      <td className="p-2.5 text-right font-semibold">{money(selectedFiling.totalGrossWages)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">3. Total Tax Deducted at Source (TDS)</td>
                      <td className="p-2.5 text-right font-semibold">{money(selectedFiling.totalTaxDeducted)}</td>
                    </tr>
                    <tr>
                      <td className="p-2.5">4. Total Tax Deposited into Government Treasury via Challans</td>
                      <td className="p-2.5 text-right font-semibold">
                        {money(
                          selectedFiling.challans?.reduce(
                            (s, c) => s + (c.totalAmount || 0),
                            0
                          ) || 0
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Challan Breakdown Table */}
              <div className="space-y-1">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  Summary of Challans Included
                </h4>
                <div className="border border-slate-300 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2">Sl. No.</th>
                        <th className="p-2 font-mono">BSR Code</th>
                        <th className="p-2">Date</th>
                        <th className="p-2 font-mono">Serial No.</th>
                        <th className="p-2 text-right">TDS (₹)</th>
                        <th className="p-2 text-right">Total Deposited (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedFiling.challans?.map((c, i) => (
                        <tr key={c.id}>
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 font-mono">{c.bsrCode}</td>
                          <td className="p-2">{new Date(c.challanDate).toLocaleDateString('en-IN')}</td>
                          <td className="p-2 font-mono">{c.challanSerialNo}</td>
                          <td className="p-2 text-right">{money(c.tdsAmount)}</td>
                          <td className="p-2 text-right font-semibold">{money(c.totalAmount)}</td>
                        </tr>
                      ))}

                      {(!selectedFiling.challans || selectedFiling.challans.length === 0) && (
                        <tr>
                          <td colSpan={6} className="p-3 text-center text-slate-500">
                            No challans linked to this filing.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Verification & Declaration Block */}
              <div className="border-t pt-4 space-y-4 text-xs">
                <p className="text-justify leading-relaxed">
                  I, <b>{companySettings?.responsiblePersonName || 'Authorized Signatory'}</b>, hereby certify
                  that all the particulars furnished above and in the accompanying e-TDS electronic return
                  are correct and complete according to the books of accounts and records maintained by the deductor.
                </p>

                <div className="flex justify-between items-end pt-6">
                  <div>
                    <p>Place: <b>{companySettings?.city || 'Corporate Office'}</b></p>
                    <p>Date: <b>{new Date().toLocaleDateString('en-IN')}</b></p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="h-10 border-b border-slate-400 w-48"></div>
                    <p className="font-semibold">Signature of Responsible Person</p>
                    <p className="text-[10px] text-slate-500">Name & Official Seal</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
