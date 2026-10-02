import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  HelpCircle,
  Landmark,
  Percent,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  DeductionDeclarationInput,
  SalaryBreakdownInput,
  TaxSimulationComparisonResult,
} from '../../types/taxSimulator';
import { useToast } from '../../context/ToastContext';

const money = (n = 0) =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

interface TaxSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEmployeeId?: string;
  employeeName?: string;
}

export const TaxSimulatorModal: React.FC<TaxSimulatorModalProps> = ({
  isOpen,
  onClose,
  targetEmployeeId,
  employeeName,
}) => {
  const toast = useToast();
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<TaxSimulationComparisonResult | null>(null);

  // Form states
  const [salary, setSalary] = useState<SalaryBreakdownInput>({
    annualCtc: 1200000,
    basicSalary: 600000,
    hra: 240000,
    specialAllowance: 285500,
    employeePf: 72000,
    professionalTax: 2500,
  });

  const [declarations, setDeclarations] = useState<DeductionDeclarationInput>({
    rentPaidAnnual: 180000,
    isMetro: true,
    section80C: 150000,
    section80DSelf: 25000,
    section80DParents: 25000,
    section80CCD1B: 50000,
    section24bHomeLoanInterest: 0,
  });

  const [showAdvancedDeductions, setShowAdvancedDeductions] = useState(false);

  // Run simulation
  const runSimulation = useCallback(
    async (fy = financialYear, sal = salary, dec = declarations) => {
      setBusy(true);
      try {
        const data = await api.simulateTax({
          financialYear: fy,
          employeeId: targetEmployeeId,
          salary: sal,
          declarations: dec,
        });
        setResult(data);
      } catch (err) {
        toast.error(
          'Simulation failed',
          err instanceof Error ? err.message : 'Unknown error during tax computation',
        );
      } finally {
        setBusy(false);
      }
    },
    [financialYear, salary, declarations, targetEmployeeId, toast],
  );

  useEffect(() => {
    if (isOpen) {
      void runSimulation();
    }
  }, [isOpen, runSimulation]);

  if (!isOpen) return null;

  const handleApplyRegime = async (regime: 'NEW' | 'OLD') => {
    setApplying(true);
    try {
      await api.applyTaxRegime({
        employeeId: targetEmployeeId,
        financialYear,
        regime,
        notes: `Confirmed via Income Tax Simulator. Annual CTC: ${money(salary.annualCtc || 0)}.`,
      });
      toast.success(
        `${regime} Tax Regime Applied!`,
        `Your tax declaration for FY ${financialYear} has been updated to the ${regime} Regime.`,
      );
      onClose();
    } catch (err) {
      toast.error('Failed to apply regime', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-500/20 p-2.5 text-brand-400">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                Income Tax & Salary Simulator
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Old vs New Regime
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {employeeName ? `Simulating for ${employeeName} · ` : ''}
                Advisory comparison based on Finance Act specifications.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                void runSimulation(e.target.value);
              }}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="2025-26">FY 2025-26 (AY 2026-27 — Budget 2025)</option>
              <option value="2026-27">FY 2026-27 (AY 2027-28 — Budget 2025)</option>
              <option value="2024-25">FY 2024-25 (AY 2025-26 — Finance Act 2024)</option>
              <option value="2023-24">FY 2023-24 (AY 2024-25 — Finance Act 2023)</option>
            </select>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="grid flex-1 overflow-auto lg:grid-cols-[380px_1fr]">
          {/* Controls Sidebar */}
          <aside className="space-y-4 border-r border-slate-800/80 bg-slate-950/40 p-5 overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-semibold text-slate-200 uppercase text-[11px] tracking-wider">
                Salary & Inputs
              </h3>
              <button
                onClick={() => void runSimulation()}
                disabled={busy}
                className="flex items-center gap-1 text-[11px] text-brand-400 hover:underline"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
                Recalculate
              </button>
            </div>

            {/* Salary Breakdown */}
            <div className="space-y-2.5">
              <div>
                <label className="text-slate-400 block mb-1">Annual CTC (₹)</label>
                <input
                  type="number"
                  value={salary.annualCtc || ''}
                  onChange={(e) => {
                    const ctc = Number(e.target.value);
                    const basic = Math.round(ctc * 0.5);
                    const hra = Math.round(basic * 0.4);
                    const pf = Math.round(Math.min(basic, 180000) * 0.12);
                    const special = Math.max(0, ctc - basic - hra - pf - 2500);
                    const newSal = {
                      ...salary,
                      annualCtc: ctc,
                      basicSalary: basic,
                      hra,
                      specialAllowance: special,
                      employeePf: pf,
                    };
                    setSalary(newSal);
                    void runSimulation(financialYear, newSal, declarations);
                  }}
                  className="input w-full py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Basic Salary (₹)</label>
                  <input
                    type="number"
                    value={salary.basicSalary}
                    onChange={(e) => {
                      const newSal = { ...salary, basicSalary: Number(e.target.value) };
                      setSalary(newSal);
                      void runSimulation(financialYear, newSal, declarations);
                    }}
                    className="input w-full py-1.5"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">HRA Received (₹)</label>
                  <input
                    type="number"
                    value={salary.hra}
                    onChange={(e) => {
                      const newSal = { ...salary, hra: Number(e.target.value) };
                      setSalary(newSal);
                      void runSimulation(financialYear, newSal, declarations);
                    }}
                    className="input w-full py-1.5"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Special & Other Allowances (₹)</label>
                <input
                  type="number"
                  value={salary.specialAllowance || ''}
                  onChange={(e) => {
                    const newSal = { ...salary, specialAllowance: Number(e.target.value) };
                    setSalary(newSal);
                    void runSimulation(financialYear, newSal, declarations);
                  }}
                  className="input w-full py-1.5"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Employee PF Contribution (₹)</label>
                <input
                  type="number"
                  value={salary.employeePf || ''}
                  onChange={(e) => {
                    const newSal = { ...salary, employeePf: Number(e.target.value) };
                    setSalary(newSal);
                    void runSimulation(financialYear, newSal, declarations);
                  }}
                  className="input w-full py-1.5"
                />
              </div>
            </div>

            {/* Deductions & Exemptions (Accordion) */}
            <div className="border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedDeductions((v) => !v)}
                className="flex w-full items-center justify-between font-semibold text-slate-200"
              >
                <span>Old Regime Deductions</span>
                {showAdvancedDeductions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showAdvancedDeductions && (
                <div className="mt-3 space-y-2.5 pt-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-medium text-slate-300">House Rent Paid (Annual)</span>
                      <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={declarations.isMetro}
                          onChange={(e) => {
                            const newDec = { ...declarations, isMetro: e.target.checked };
                            setDeclarations(newDec);
                            void runSimulation(financialYear, salary, newDec);
                          }}
                        />
                        Metro (50%)
                      </label>
                    </div>
                    <input
                      type="number"
                      placeholder="e.g. 180000"
                      value={declarations.rentPaidAnnual || ''}
                      onChange={(e) => {
                        const newDec = { ...declarations, rentPaidAnnual: Number(e.target.value) };
                        setDeclarations(newDec);
                        void runSimulation(financialYear, salary, newDec);
                      }}
                      className="input w-full py-1"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">
                      Section 80C (PPF, ELSS, LIC, PF) · Max 1.5L
                    </label>
                    <input
                      type="number"
                      max={150000}
                      value={declarations.section80C || ''}
                      onChange={(e) => {
                        const newDec = { ...declarations, section80C: Number(e.target.value) };
                        setDeclarations(newDec);
                        void runSimulation(financialYear, salary, newDec);
                      }}
                      className="input w-full py-1.5"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 block mb-1">80D Self (Max 25k)</label>
                      <input
                        type="number"
                        max={25000}
                        value={declarations.section80DSelf || ''}
                        onChange={(e) => {
                          const newDec = { ...declarations, section80DSelf: Number(e.target.value) };
                          setDeclarations(newDec);
                          void runSimulation(financialYear, salary, newDec);
                        }}
                        className="input w-full py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">80D Parents (Max 50k)</label>
                      <input
                        type="number"
                        max={50000}
                        value={declarations.section80DParents || ''}
                        onChange={(e) => {
                          const newDec = { ...declarations, section80DParents: Number(e.target.value) };
                          setDeclarations(newDec);
                          void runSimulation(financialYear, salary, newDec);
                        }}
                        className="input w-full py-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">
                      80CCD(1B) Voluntary NPS · Max 50k
                    </label>
                    <input
                      type="number"
                      max={50000}
                      value={declarations.section80CCD1B || ''}
                      onChange={(e) => {
                        const newDec = { ...declarations, section80CCD1B: Number(e.target.value) };
                        setDeclarations(newDec);
                        void runSimulation(financialYear, salary, newDec);
                      }}
                      className="input w-full py-1.5"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">
                      Sec 24(b) Home Loan Interest · Max 2L
                    </label>
                    <input
                      type="number"
                      max={200000}
                      value={declarations.section24bHomeLoanInterest || ''}
                      onChange={(e) => {
                        const newDec = {
                          ...declarations,
                          section24bHomeLoanInterest: Number(e.target.value),
                        };
                        setDeclarations(newDec);
                        void runSimulation(financialYear, salary, newDec);
                      }}
                      className="input w-full py-1.5"
                    />
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Results Main Stage */}
          <main className="space-y-5 p-6 overflow-y-auto">
            {/* Recommendation Banner */}
            {result && (
              <div
                className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
                  result.comparison.recommendedRegime === 'NEW'
                    ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/20 via-slate-900 to-slate-900'
                    : result.comparison.recommendedRegime === 'OLD'
                    ? 'border-blue-500/40 bg-gradient-to-r from-blue-500/20 via-slate-900 to-slate-900'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-xl p-2.5 ${
                        result.comparison.recommendedRegime === 'NEW'
                          ? 'bg-emerald-500/30 text-emerald-300'
                          : 'bg-blue-500/30 text-blue-300'
                      }`}
                    >
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Smart Recommendation
                      </span>
                      <h4 className="text-base font-bold text-white">
                        {result.comparison.recommendationSummary}
                      </h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Take-home delta:</span>
                    <b className="text-sm text-emerald-400">
                      +{money(result.comparison.monthlyTakeHomeDifference)}/mo
                    </b>
                  </div>
                </div>
              </div>
            )}

            {/* Comparison Cards */}
            {result && (
              <div className="grid gap-4 md:grid-cols-2">
                {/* New Tax Regime Card */}
                <div
                  className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                    result.comparison.recommendedRegime === 'NEW'
                      ? 'border-emerald-500/60 bg-emerald-950/20 shadow-lg shadow-emerald-950/40'
                      : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                          Section 115BAC
                        </span>
                        <h4 className="mt-1 text-lg font-bold text-white">New Tax Regime</h4>
                      </div>
                      {result.comparison.recommendedRegime === 'NEW' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" /> Recommended
                        </span>
                      )}
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Gross Salary:</span>
                        <b className="text-slate-200">{money(result.newRegime.grossSalary)}</b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Standard Deduction:</span>
                        <b className="text-emerald-400">
                          -{money(result.newRegime.standardDeduction)}
                        </b>
                      </div>
                      <div className="flex justify-between border-t border-slate-800/80 pt-1.5 font-semibold text-slate-300">
                        <span>Net Taxable Income:</span>
                        <span className="text-white">{money(result.newRegime.netTaxableIncome)}</span>
                      </div>

                      {/* Slabs preview */}
                      <div className="my-2 rounded-xl bg-slate-900/80 p-2.5 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Slab Breakdown
                        </span>
                        {result.newRegime.slabWiseTax.map((s, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] text-slate-400">
                            <span>
                              {s.slab} ({s.ratePercent}%)
                            </span>
                            <span>{money(s.taxAmount)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between text-slate-400">
                        <span>Section 87A Rebate:</span>
                        <b className="text-emerald-400">
                          {result.newRegime.section87ARebate > 0
                            ? `-${money(result.newRegime.section87ARebate)}`
                            : '₹0'}
                        </b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Health & Edu Cess (4%):</span>
                        <span>{money(result.newRegime.cess)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400">Annual Tax</span>
                        <p className="text-xl font-extrabold text-white">
                          {money(result.newRegime.totalAnnualTax)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase text-slate-400">Monthly TDS</span>
                        <p className="text-base font-bold text-rose-400">
                          {money(result.newRegime.monthlyEstimatedTds)}/mo
                        </p>
                      </div>
                    </div>

                    <button
                      disabled={applying}
                      onClick={() => void handleApplyRegime('NEW')}
                      className={`mt-4 w-full rounded-xl py-2 text-xs font-bold transition-all ${
                        result.comparison.recommendedRegime === 'NEW'
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : 'bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      {applying ? 'Applying…' : 'Apply New Regime to My Declaration'}
                    </button>
                  </div>
                </div>

                {/* Old Tax Regime Card */}
                <div
                  className={`flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                    result.comparison.recommendedRegime === 'OLD'
                      ? 'border-blue-500/60 bg-blue-950/20 shadow-lg shadow-blue-950/40'
                      : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                      <div>
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                          Itemized Deductions
                        </span>
                        <h4 className="mt-1 text-lg font-bold text-white">Old Tax Regime</h4>
                      </div>
                      {result.comparison.recommendedRegime === 'OLD' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-blue-400">
                          <CheckCircle2 className="h-4 w-4" /> Recommended
                        </span>
                      )}
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Gross Salary:</span>
                        <b className="text-slate-200">{money(result.oldRegime.grossSalary)}</b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Standard Deduction:</span>
                        <b className="text-emerald-400">
                          -{money(result.oldRegime.standardDeduction)}
                        </b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Total Exemptions & 80C/80D:</span>
                        <b className="text-emerald-400">
                          -{money(result.oldRegime.totalExemptionsAndDeductions - result.oldRegime.standardDeduction)}
                        </b>
                      </div>
                      <div className="flex justify-between border-t border-slate-800/80 pt-1.5 font-semibold text-slate-300">
                        <span>Net Taxable Income:</span>
                        <span className="text-white">{money(result.oldRegime.netTaxableIncome)}</span>
                      </div>

                      {/* Slabs preview */}
                      <div className="my-2 rounded-xl bg-slate-900/80 p-2.5 space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                          Slab Breakdown
                        </span>
                        {result.oldRegime.slabWiseTax.map((s, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] text-slate-400">
                            <span>
                              {s.slab} ({s.ratePercent}%)
                            </span>
                            <span>{money(s.taxAmount)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between text-slate-400">
                        <span>Section 87A Rebate:</span>
                        <b className="text-emerald-400">
                          {result.oldRegime.section87ARebate > 0
                            ? `-${money(result.oldRegime.section87ARebate)}`
                            : '₹0'}
                        </b>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Health & Edu Cess (4%):</span>
                        <span>{money(result.oldRegime.cess)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-800 pt-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-[10px] uppercase text-slate-400">Annual Tax</span>
                        <p className="text-xl font-extrabold text-white">
                          {money(result.oldRegime.totalAnnualTax)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase text-slate-400">Monthly TDS</span>
                        <p className="text-base font-bold text-rose-400">
                          {money(result.oldRegime.monthlyEstimatedTds)}/mo
                        </p>
                      </div>
                    </div>

                    <button
                      disabled={applying}
                      onClick={() => void handleApplyRegime('OLD')}
                      className={`mt-4 w-full rounded-xl py-2 text-xs font-bold transition-all ${
                        result.comparison.recommendedRegime === 'OLD'
                          ? 'bg-blue-500 text-white hover:bg-blue-400'
                          : 'bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      {applying ? 'Applying…' : 'Apply Old Regime to My Declaration'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Note & Advisory Disclaimer */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs text-slate-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <b className="text-slate-300">Statutory Notice:</b>
                  <p className="mt-0.5">
                    This simulator is for calculation and advisory purposes. Selecting a regime
                    updates your tax declaration and TDS deduction schedule for monthly payroll.
                    Proof submissions (e.g., rent receipts, LIC policies) will be verified by HR
                    before final Form 16 issuance.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
