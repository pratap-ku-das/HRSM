import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Lock,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  ptApi,
  type PtOverview,
  type PtRegistration,
  type PtFiling,
  type PtChallan,
} from "./ptApi";

export const PtComplianceTab: React.FC = () => {
  const { currentUser } = useAuth();
  const toast = useToast();

  const [activeSubTab, setActiveSubTab] = useState<"overview" | "registrations" | "filings" | "challans">("overview");
  const [selectedState, setSelectedState] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(true);
  const [overview, setOverview] = useState<PtOverview | null>(null);
  const [registrations, setRegistrations] = useState<PtRegistration[]>([]);
  const [filings, setFilings] = useState<PtFiling[]>([]);
  const [challans, setChallans] = useState<PtChallan[]>([]);

  // Modals & form state
  const [showRegModal, setShowRegModal] = useState<boolean>(false);
  const [regForm, setRegForm] = useState({
    stateCode: "KA" as "KA" | "MH" | "TS" | "WB",
    registrationType: "PT_RC" as "PT_RC" | "PT_EC",
    certificateNumber: "",
    issuingAuthority: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    notes: "",
  });

  const [showGenFilingModal, setShowGenFilingModal] = useState<boolean>(false);
  const [genForm, setGenForm] = useState({
    payrollRunId: "",
    stateCode: "KA" as "KA" | "MH" | "TS" | "WB",
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
  });

  const [showChallanModal, setShowChallanModal] = useState<boolean>(false);
  const [challanForm, setChallanForm] = useState({
    statutoryFilingId: "",
    challanNumber: "",
    challanDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const [showPayModal, setShowPayModal] = useState<boolean>(false);
  const [selectedChallanId, setSelectedChallanId] = useState<string>("");
  const [payForm, setPayForm] = useState({
    paidDate: new Date().toISOString().slice(0, 10),
    cinNumber: "",
    bankReference: "",
    notes: "",
  });

  const [viewingFiling, setViewingFiling] = useState<PtFiling | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovData, regData, filData, chData] = await Promise.all([
        ptApi.getOverview().catch(() => null),
        ptApi.getRegistrations().catch(() => []),
        ptApi.getFilings().catch(() => []),
        ptApi.getChallans().catch(() => []),
      ]);
      setOverview(ovData);
      setRegistrations(regData);
      setFilings(filData);
      setChallans(chData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load PT compliance data";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handlers
  const handleCreateReg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ptApi.createRegistration({
        stateCode: regForm.stateCode,
        registrationType: regForm.registrationType,
        certificateNumber: regForm.certificateNumber,
        issuingAuthority: regForm.issuingAuthority || null,
        effectiveFrom: regForm.effectiveFrom,
        effectiveTo: regForm.effectiveTo || null,
        notes: regForm.notes || null,
      });
      toast.success("Professional Tax registration created successfully");
      setShowRegModal(false);
      setRegForm({
        stateCode: "KA",
        registrationType: "PT_RC",
        certificateNumber: "",
        issuingAuthority: "",
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveTo: "",
        notes: "",
      });
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create registration";
      toast.error(message);
    }
  };

  const handleGenerateFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ptApi.generateFiling({
        payrollRunId: genForm.payrollRunId,
        stateCode: genForm.stateCode,
        periodYear: Number(genForm.periodYear),
        periodMonth: Number(genForm.periodMonth),
      });
      toast.success("PT Filing generated from payroll snapshot");
      setShowGenFilingModal(false);
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate filing";
      toast.error(message);
    }
  };

  const handleValidateFiling = async (id: string) => {
    try {
      await ptApi.validateFiling(id);
      toast.success("PT Filing validated successfully");
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Validation failed";
      toast.error(message);
    }
  };

  const handleSubmitFiling = async (id: string) => {
    try {
      await ptApi.submitFiling(id);
      toast.success("Filing submitted for Checker approval");
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submit failed";
      toast.error(message);
    }
  };

  const handleApproveFiling = async (id: string) => {
    try {
      await ptApi.approveFiling(id);
      toast.success("Filing approved by Checker");
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Approval failed";
      toast.error(message);
    }
  };

  const handleLockFiling = async (id: string) => {
    try {
      await ptApi.lockFiling(id);
      toast.success("Filing cryptographically sealed and LOCKED");
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Lock failed";
      toast.error(message);
    }
  };

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ptApi.createChallan({
        statutoryFilingId: challanForm.statutoryFilingId,
        challanNumber: challanForm.challanNumber,
        challanDate: challanForm.challanDate,
        notes: challanForm.notes || null,
      });
      toast.success("PT Challan record created");
      setShowChallanModal(false);
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create challan";
      toast.error(message);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ptApi.recordPayment(selectedChallanId, {
        paidDate: payForm.paidDate,
        cinNumber: payForm.cinNumber || null,
        bankReference: payForm.bankReference || null,
        notes: payForm.notes || null,
      });
      toast.success("Challan payment recorded successfully");
      setShowPayModal(false);
      void loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to record payment";
      toast.error(message);
    }
  };

  const handleReconcile = async (id: string) => {
    try {
      const res = await ptApi.reconcileChallan(id);
      if (res.reconciled) {
        toast.success("Challan reconciled with 0 variance");
        void loadData();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Reconciliation failed";
      toast.error(message);
    }
  };


  const handleExport = (filingId: string, format: "csv" | "json") => {
    window.open(`/api/v1/compliance/pt/filings/${filingId}/export?format=${format}`, "_blank");
  };

  const filteredFilings = filings.filter((f) => (selectedState === "ALL" ? true : f.stateCode === selectedState));
  const filteredRegs = registrations.filter((r) => (selectedState === "ALL" ? true : r.stateCode === selectedState));
  const filteredChallans = challans.filter((c) => (selectedState === "ALL" ? true : c.stateCode === selectedState));

  return (
    <div className="space-y-6">
      {/* Statutory Certification & Boundary Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-amber-300">
              UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY
            </p>
            <p className="text-xs text-amber-200/80">
              Multi-state Professional Tax deductions are certified for Karnataka (KA), Maharashtra (MH),
              Telangana (TS), and West Bengal (WB). Direct electronic portal upload schemas remain subject to state
              portal sandbox certification. Audit summaries and schedules are available for verified export.
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">KA: Certified</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">MH: Certified (Female ₹25k Exemption)</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">TS: Certified</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">WB: Certified (Oct 2026 Transition)</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">TN: Deferred (Municipal Model)</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">GJ: Deferred (Municipal Split)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation & State Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
          <button
            onClick={() => setActiveSubTab("overview")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSubTab === "overview" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Overview & Liabilities
          </button>
          <button
            onClick={() => setActiveSubTab("registrations")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSubTab === "registrations" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            State Registrations ({registrations.length})
          </button>
          <button
            onClick={() => setActiveSubTab("filings")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSubTab === "filings" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Returns & Filings ({filings.length})
          </button>
          <button
            onClick={() => setActiveSubTab("challans")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeSubTab === "challans" ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Challans & Reconciliation ({challans.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400">Jurisdiction:</label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="ALL">All States (Multi-State)</option>
            <option value="KA">Karnataka (KA)</option>
            <option value="MH">Maharashtra (MH)</option>
            <option value="TS">Telangana (TS)</option>
            <option value="WB">West Bengal (WB)</option>
          </select>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* 1. OVERVIEW & LIABILITIES TAB */}
      {activeSubTab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overview?.stateMetrics.map((sm) => (
              <div key={sm.stateCode} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {sm.stateCode === "KA"
                      ? "Karnataka"
                      : sm.stateCode === "MH"
                      ? "Maharashtra"
                      : sm.stateCode === "TS"
                      ? "Telangana"
                      : "West Bengal"}
                  </span>
                  <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-xs font-bold text-brand-300">
                    {sm.stateCode}
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="text-xl font-bold text-white">₹{sm.totalFiledLiability.toLocaleString()}</div>
                  <p className="text-xs text-slate-400">Total Filed Liability</p>
                </div>
                <div className="mt-3 border-t border-slate-800/80 pt-2 text-xs text-slate-400">
                  <div className="flex justify-between py-0.5">
                    <span>Paid / Reconciled:</span>
                    <span className="text-emerald-400 font-medium">₹{sm.totalPaidLiability.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Variance:</span>
                    <span className={sm.variance > 0 ? "text-rose-400 font-semibold" : "text-slate-400"}>
                      ₹{sm.variance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>Active PT-RC:</span>
                    <span className="text-white">{sm.activeRegistrationsCount} registered</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions & Recent Filings Summary */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Recent Multi-State PT Filings</h3>
              <button
                onClick={() => setShowGenFilingModal(true)}
                className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" /> Generate PT Filing
              </button>
            </div>

            {filteredFilings.length === 0 ? (
              <EmptyState
                icon={FileCheck2}
                title="No PT Filings generated"
                description="Generate a Professional Tax monthly return for Karnataka, Maharashtra, Telangana, or West Bengal from finalized payroll runs."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="border-b border-slate-800 text-xs font-medium text-slate-400 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">State</th>
                      <th className="py-2.5 px-3">Period</th>
                      <th className="py-2.5 px-3">Form</th>
                      <th className="py-2.5 px-3">Employees</th>
                      <th className="py-2.5 px-3">PT Liability</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Challan</th>
                      <th className="py-2.5 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredFilings.slice(0, 10).map((f) => (
                      <tr key={f.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-white">{f.stateCode}</td>
                        <td className="py-2.5 px-3">
                          {f.periodYear}-{String(f.periodMonth || 0).padStart(2, "0")}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-slate-400">{f.statutoryFormCode}</td>
                        <td className="py-2.5 px-3">{f.totalEmployees}</td>
                        <td className="py-2.5 px-3 font-medium text-white">₹{f.totalTaxDeducted.toLocaleString()}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              f.status === "LOCKED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : f.status === "APPROVED"
                                ? "bg-blue-500/20 text-blue-300"
                                : f.status === "PENDING_APPROVAL"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          {f.ptChallan ? (
                            <span className="text-emerald-400 font-medium">
                              #{f.ptChallan.challanNumber} ({f.ptChallan.status})
                            </span>
                          ) : (
                            <span className="text-slate-500">Unpaid</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => {
                              void ptApi.getFilingById(f.id).then(setViewingFiling);
                            }}
                            className="text-xs text-brand-400 hover:underline"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. REGISTRATIONS TAB */}
      {activeSubTab === "registrations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">State PT Registrations (PT-RC / PT-EC)</h3>
              <p className="text-xs text-slate-400">
                Manage state Certificates of Registration (PT-RC) required for legal deduction and return filing.
              </p>
            </div>
            <button
              onClick={() => setShowRegModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Add PT Registration
            </button>
          </div>

          {filteredRegs.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No Registrations Found"
              description="Register your state PT-RC certificate numbers for Karnataka, Maharashtra, Telangana, or West Bengal to authorize filing."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRegs.map((reg) => (
                <div key={reg.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-300">
                      {reg.stateCode} — {reg.registrationType}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        reg.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {reg.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-base font-bold text-white tracking-wide">{reg.certificateNumber}</div>
                    <p className="text-xs text-slate-400">Authority: {reg.issuingAuthority || "State Tax Department"}</p>
                  </div>
                  <div className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Effective From:</span>
                      <span className="text-white">{reg.effectiveFrom.slice(0, 10)}</span>
                    </div>
                    {reg.workLocation && (
                      <div className="flex justify-between">
                        <span>Work Location:</span>
                        <span className="text-white">{reg.workLocation.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. RETURNS & FILINGS TAB */}
      {activeSubTab === "filings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Monthly PT Returns & Filings</h3>
              <p className="text-xs text-slate-400">
                Authoritative statutory filing lifecycle: Draft → Validate → Submit → Maker/Checker Approval → Lock → Export.
              </p>
            </div>
            <button
              onClick={() => setShowGenFilingModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Generate PT Filing
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 text-xs font-medium text-slate-400 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">State</th>
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">Employees</th>
                    <th className="py-2.5 px-3">Gross Wages</th>
                    <th className="py-2.5 px-3">PT Deducted</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredFilings.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-white">{f.stateCode}</td>
                      <td className="py-2.5 px-3">
                        {f.periodYear}-{String(f.periodMonth || 0).padStart(2, "0")}
                      </td>
                      <td className="py-2.5 px-3">{f.totalEmployees}</td>
                      <td className="py-2.5 px-3">₹{f.totalGrossWages.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-bold text-white">₹{f.totalTaxDeducted.toLocaleString()}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            f.status === "LOCKED"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : f.status === "APPROVED"
                              ? "bg-blue-500/20 text-blue-300"
                              : f.status === "PENDING_APPROVAL"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {f.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          {f.status === "DRAFT" && (
                            <button
                              onClick={() => void handleValidateFiling(f.id)}
                              className="rounded bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700"
                            >
                              Validate
                            </button>
                          )}
                          {f.status === "VALIDATED" && (
                            <button
                              onClick={() => void handleSubmitFiling(f.id)}
                              className="rounded bg-brand-500 px-2 py-1 text-white hover:bg-brand-600 flex items-center gap-1"
                            >
                              <Send className="h-3 w-3" /> Submit
                            </button>
                          )}
                          {f.status === "PENDING_APPROVAL" && (
                            <button
                              onClick={() => void handleApproveFiling(f.id)}
                              className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700 flex items-center gap-1"
                            >
                              <UserCheck className="h-3 w-3" /> Approve (Checker)
                            </button>
                          )}
                          {f.status === "APPROVED" && (
                            <button
                              onClick={() => void handleLockFiling(f.id)}
                              className="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700 flex items-center gap-1"
                            >
                              <Lock className="h-3 w-3" /> Lock & Seal
                            </button>
                          )}
                          <button
                            onClick={() => handleExport(f.id, "csv")}
                            className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:text-white flex items-center gap-1"
                            title="Export CSV schedule"
                          >
                            <Download className="h-3 w-3" /> CSV
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CHALLANS & RECONCILIATION TAB */}
      {activeSubTab === "challans" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">State PT Challans & Bank Reconciliation</h3>
              <p className="text-xs text-slate-400">
                1:1 State return e-challan tracking, treasury CIN numbers, and zero-variance ledger reconciliation.
              </p>
            </div>
            <button
              onClick={() => setShowChallanModal(true)}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" /> Link PT Challan
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 text-xs font-medium text-slate-400 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">State</th>
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">Challan No</th>
                    <th className="py-2.5 px-3">Challan Date</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">CIN / Bank Ref</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredChallans.map((ch) => (
                    <tr key={ch.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-white">{ch.stateCode}</td>
                      <td className="py-2.5 px-3">
                        {ch.challanPeriodYear}-{String(ch.challanPeriodMonth).padStart(2, "0")}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-white">{ch.challanNumber}</td>
                      <td className="py-2.5 px-3">{ch.challanDate.slice(0, 10)}</td>
                      <td className="py-2.5 px-3 font-bold text-white">₹{ch.totalAmount.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-400">
                        {ch.cinNumber ? `CIN: ${ch.cinNumber}` : ch.bankReference || "Pending Payment"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            ch.status === "RECONCILED"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : ch.status === "PAID"
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {ch.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {ch.status === "CHALLAN_GENERATED" && (
                            <button
                              onClick={() => {
                                setSelectedChallanId(ch.id);
                                setShowPayModal(true);
                              }}
                              className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600"
                            >
                              Record Payment
                            </button>
                          )}
                          {ch.status === "PAID" && (
                            <button
                              onClick={() => void handleReconcile(ch.id)}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 flex items-center gap-1"
                            >
                              <ShieldCheck className="h-3 w-3" /> Reconcile
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD REGISTRATION */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Add PT Registration (PT-RC / PT-EC)</h3>
              <button onClick={() => setShowRegModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateReg} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">State Jurisdiction</label>
                <select
                  value={regForm.stateCode}
                  onChange={(e) => setRegForm({ ...regForm, stateCode: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="KA">Karnataka (KA)</option>
                  <option value="MH">Maharashtra (MH)</option>
                  <option value="TS">Telangana (TS)</option>
                  <option value="WB">West Bengal (WB)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Registration Type</label>
                <select
                  value={regForm.registrationType}
                  onChange={(e) => setRegForm({ ...regForm, registrationType: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="PT_RC">PT-RC (Deduction from Employees)</option>
                  <option value="PT_EC">PT-EC (Establishment Enrollment)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Certificate / Reg Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 27000000000P"
                  value={regForm.certificateNumber}
                  onChange={(e) => setRegForm({ ...regForm, certificateNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Issuing Authority</label>
                <input
                  type="text"
                  placeholder="e.g. Commercial Taxes Dept"
                  value={regForm.issuingAuthority}
                  onChange={(e) => setRegForm({ ...regForm, issuingAuthority: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Effective From Date *</label>
                <input
                  required
                  type="date"
                  value={regForm.effectiveFrom}
                  onChange={(e) => setRegForm({ ...regForm, effectiveFrom: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Save Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GENERATE PT FILING */}
      {showGenFilingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Generate Monthly PT Filing</h3>
              <button onClick={() => setShowGenFilingModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleGenerateFiling} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Payroll Run ID *</label>
                <input
                  required
                  type="text"
                  placeholder="Enter finalized Payroll Run UUID"
                  value={genForm.payrollRunId}
                  onChange={(e) => setGenForm({ ...genForm, payrollRunId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Must be in LOCKED / PAYSLIP_GENERATED status.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Jurisdiction State *</label>
                <select
                  value={genForm.stateCode}
                  onChange={(e) => setGenForm({ ...genForm, stateCode: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="KA">Karnataka (KA - Form 5)</option>
                  <option value="MH">Maharashtra (MH - Form III-B)</option>
                  <option value="TS">Telangana (TS - Form V)</option>
                  <option value="WB">West Bengal (WB - Form III)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">Year</label>
                  <input
                    type="number"
                    value={genForm.periodYear}
                    onChange={(e) => setGenForm({ ...genForm, periodYear: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">Month (1–12)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={genForm.periodMonth}
                    onChange={(e) => setGenForm({ ...genForm, periodMonth: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGenFilingModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Extract Snapshot & Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LINK CHALLAN */}
      {showChallanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Create & Link PT Challan</h3>
              <button onClick={() => setShowChallanModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateChallan} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Target PT Filing *</label>
                <select
                  required
                  value={challanForm.statutoryFilingId}
                  onChange={(e) => setChallanForm({ ...challanForm, statutoryFilingId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select PT Filing</option>
                  {filings
                    .filter((f) => !f.ptChallan)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.stateCode} ({f.periodYear}-{f.periodMonth}) — ₹{f.totalTaxDeducted}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">e-Challan Reference Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. MH-PT-2026-00123"
                  value={challanForm.challanNumber}
                  onChange={(e) => setChallanForm({ ...challanForm, challanNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Challan Generation Date *</label>
                <input
                  required
                  type="date"
                  value={challanForm.challanDate}
                  onChange={(e) => setChallanForm({ ...challanForm, challanDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChallanModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Create Challan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD PAYMENT */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Record Bank Payment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Payment Date *</label>
                <input
                  required
                  type="date"
                  value={payForm.paidDate}
                  onChange={(e) => setPayForm({ ...payForm, paidDate: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Challan Identification Number (CIN)</label>
                <input
                  type="text"
                  placeholder="e.g. 05100012026100100012"
                  value={payForm.cinNumber}
                  onChange={(e) => setPayForm({ ...payForm, cinNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Bank Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC1234567890"
                  value={payForm.bankReference}
                  onChange={(e) => setPayForm({ ...payForm, bankReference: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW FILING DETAILS */}
      {viewingFiling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="font-semibold text-white">
                  PT Filing Details: {viewingFiling.stateCode} ({viewingFiling.periodYear}-{viewingFiling.periodMonth})
                </h3>
                <p className="text-xs text-slate-400">
                  Status: {viewingFiling.status} | Form: {viewingFiling.statutoryFormCode}
                </p>
              </div>
              <button onClick={() => setViewingFiling(null)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                <div>
                  <span className="text-slate-500">Total Employees</span>
                  <p className="text-base font-bold text-white">{viewingFiling.totalEmployees}</p>
                </div>
                <div>
                  <span className="text-slate-500">Gross Wages</span>
                  <p className="text-base font-bold text-white">₹{viewingFiling.totalGrossWages.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-slate-500">PT Deducted</span>
                  <p className="text-base font-bold text-emerald-400">₹{viewingFiling.totalTaxDeducted.toLocaleString()}</p>
                </div>
              </div>

              {viewingFiling.items && viewingFiling.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2 px-2">Emp Code</th>
                        <th className="py-2 px-2">Name</th>
                        <th className="py-2 px-2">Gross Wages</th>
                        <th className="py-2 px-2">PT Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {viewingFiling.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2 px-2 font-mono">{it.snapshotEmployeeCode}</td>
                          <td className="py-2 px-2">{it.snapshotEmployeeName}</td>
                          <td className="py-2 px-2">₹{it.grossWages.toLocaleString()}</td>
                          <td className="py-2 px-2 font-semibold text-white">₹{it.ptAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setViewingFiling(null)}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
