import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RefreshCw,
  Scale,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../../services/api';
import type { Employee } from '../../types';
import type {
  DeductionDeclarationInput,
  SalaryBreakdownInput,
  TaxSimulationComparisonResult,
} from '../../types/taxSimulator';
import { useToast } from '../../context/ToastContext';

const money = (n = 0) =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

export const AdminTaxSimulatorTab: React.FC<{ employees: Employee[] }> = ({ employees }) => {
  const toast = useToast();
  const [financialYear, setFinancialYear] = useState('2025-26');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
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

  const runSimulation = useCallback(
    async (empId = selectedEmployeeId, fy = financialYear, sal = salary, dec = declarations) => {
      setBusy(true);
      try {
        const data = await api.simulateTax({
          financialYear: fy,
          employeeId: empId || undefined,
          salary: empId ? undefined : sal, // If empId provided, let backend auto-fetch employee structure unless customized
          declarations: empId ? undefined : dec,
        });
        setResult(data);
        if (empId) {
          // Sync salary state with fetched result
          setSalary({
            basicSalary: data.oldRegime.grossSalary * 0.5,
            hra: data.oldRegime.grossSalary * 0.2,
            specialAllowance: data.oldRegime.grossSalary * 0.3,
          });
        }
      } catch (err) {
        toast.error(
          'Simulation failed',
          err instanceof Error ? err.message : 'Unknown error during tax calculation',
        );
      } finally {
        setBusy(false);
      }
    },
    [selectedEmployeeId, financialYear, salary, declarations, toast],
  );

  useEffect(() => {
    void runSimulation();
  }, [runSimulation]);

  const handleApplyRegime = async (regime: 'NEW' | 'OLD') => {
    if (!selectedEmployeeId) {
      toast.error('Employee selection required', 'Please select an employee to apply their regime.');
      return;
    }

    setApplying(true);
    try {
      await api.applyTaxRegime({
        employeeId: selectedEmployeeId,
        financialYear,
        regime,
        notes: `Applied by HR/Admin via Tax Simulator workspace.`,
      });
      toast.success(
        `${regime} Tax Regime Applied!`,
        `Tax declaration for FY ${financialYear} updated to ${regime} Regime.`,
      );
    } catch (err) {
      toast.error('Failed to apply regime', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <Scale className="h-5 w-5 text-brand-400" />
            Income Tax & Statutory Compensation Simulator
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Advisory salary structuring, New vs Old Regime comparison, and employee tax planning.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <select
              value={selectedEmployeeId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedEmployeeId(id);
                void runSimulation(id, financialYear);
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
            >
              <option value="">Custom CTC Simulation (No Employee)</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <select
            value={financialYear}
            onChange={(e) => {
              setFinancialYear(e.target.value);
              void runSimulation(selectedEmployeeId, e.target.value);
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <option value="2025-26">FY 2025-26 (AY 2026-27 — Budget 2025)</option>
            <option value="2026-27">FY 2026-27 (AY 2027-28 — Budget 2025)</option>
            <option value="2024-25">FY 2024-25 (AY 2025-26 — Finance Act 2024)</option>
            <option value="2023-24">FY 2023-24 (AY 2024-25 — Finance Act 2023)</option>
          </select>

          <button
            onClick={() => void runSimulation()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500/20 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/30"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      </section>

      {/* Main Grid: Inputs vs Results */}
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {/* Left Inputs */}
        <aside className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-xs">
          <h3 className="font-semibold text-white uppercase text-[11px] tracking-wider border-b border-slate-800 pb-2">
            Compensation Components
          </h3>

          {!selectedEmployeeId && (
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
                  void runSimulation('', financialYear, newSal, declarations);
                }}
                className="input w-full py-1.5"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1">Basic Salary (₹)</label>
              <input
                type="number"
                value={salary.basicSalary}
                onChange={(e) => {
                  const newSal = { ...salary, basicSalary: Number(e.target.value) };
                  setSalary(newSal);
                  void runSimulation('', financialYear, newSal, declarations);
                }}
                className="input w-full py-1.5"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">HRA (₹)</label>
              <input
                type="number"
                value={salary.hra}
                onChange={(e) => {
                  const newSal = { ...salary, hra: Number(e.target.value) };
                  setSalary(newSal);
                  void runSimulation('', financialYear, newSal, declarations);
                }}
                className="input w-full py-1.5"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Special / Other Allowances (₹)</label>
            <input
              type="number"
              value={salary.specialAllowance || ''}
              onChange={(e) => {
                const newSal = { ...salary, specialAllowance: Number(e.target.value) };
                setSalary(newSal);
                void runSimulation('', financialYear, newSal, declarations);
              }}
              className="input w-full py-1.5"
            />
          </div>

          {/* Deductions Dropdown */}
          <div className="border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setShowAdvancedDeductions((v) => !v)}
              className="flex w-full items-center justify-between font-semibold text-slate-200"
            >
              <span>Exemptions & Chapter VI-A</span>
              {showAdvancedDeductions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showAdvancedDeductions && (
              <div className="mt-3 space-y-2.5 pt-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-slate-300">Annual Rent Paid</span>
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={declarations.isMetro}
                        onChange={(e) => {
                          const newDec = { ...declarations, isMetro: e.target.checked };
                          setDeclarations(newDec);
                          void runSimulation('', financialYear, salary, newDec);
                        }}
                      />
                      Metro (50%)
                    </label>
                  </div>
                  <input
                    type="number"
                    value={declarations.rentPaidAnnual || ''}
                    onChange={(e) => {
                      const newDec = { ...declarations, rentPaidAnnual: Number(e.target.value) };
                      setDeclarations(newDec);
                      void runSimulation('', financialYear, salary, newDec);
                    }}
                    className="input w-full py-1"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Section 80C (Max 1.5L)</label>
                  <input
                    type="number"
                    max={150000}
                    value={declarations.section80C || ''}
                    onChange={(e) => {
                      const newDec = { ...declarations, section80C: Number(e.target.value) };
                      setDeclarations(newDec);
                      void runSimulation('', financialYear, salary, newDec);
                    }}
                    className="input w-full py-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">80D Self (25k)</label>
                    <input
                      type="number"
                      max={25000}
                      value={declarations.section80DSelf || ''}
                      onChange={(e) => {
                        const newDec = { ...declarations, section80DSelf: Number(e.target.value) };
                        setDeclarations(newDec);
                        void runSimulation('', financialYear, salary, newDec);
                      }}
                      className="input w-full py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">80D Parents (50k)</label>
                    <input
                      type="number"
                      max={50000}
                      value={declarations.section80DParents || ''}
                      onChange={(e) => {
                        const newDec = { ...declarations, section80DParents: Number(e.target.value) };
                        setDeclarations(newDec);
                        void runSimulation('', financialYear, salary, newDec);
                      }}
                      className="input w-full py-1.5"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Sec 24(b) Home Loan Interest (2L)</label>
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
                      void runSimulation('', financialYear, salary, newDec);
                    }}
                    className="input w-full py-1.5"
                  />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Stage: Side-by-Side Cards */}
        <main className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          {/* Smart Recommendation Banner */}
          {result && (
            <div
              className={`rounded-2xl border p-4 ${
                result.comparison.recommendedRegime === 'NEW'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : result.comparison.recommendedRegime === 'OLD'
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-950'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-brand-500/20 p-2 text-brand-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <b className="text-sm text-white">{result.comparison.recommendationSummary}</b>
                    <p className="text-xs text-slate-400">
                      Annual tax difference:{' '}
                      <span className="font-semibold text-emerald-400">
                        {money(result.comparison.annualTaxDifference)}
                      </span>
                    </p>
                  </div>
                </div>
                {selectedEmployeeId && (
                  <div className="flex gap-2">
                    <button
                      disabled={applying}
                      onClick={() => void handleApplyRegime('NEW')}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      Apply New Regime
                    </button>
                    <button
                      disabled={applying}
                      onClick={() => void handleApplyRegime('OLD')}
                      className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      Apply Old Regime
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Side by side comparison */}
          {result && (
            <div className="grid gap-4 md:grid-cols-2 text-xs">
              {/* New Regime Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <b className="text-sm text-white">New Tax Regime (Sec 115BAC)</b>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                    Std Ded: {money(result.newRegime.standardDeduction)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span>Gross Earnings:</span>
                    <span className="text-white">{money(result.newRegime.grossSalary)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Standard Deduction:</span>
                    <span className="text-emerald-400">-{money(result.newRegime.standardDeduction)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-semibold text-slate-200">
                    <span>Taxable Income:</span>
                    <span>{money(result.newRegime.netTaxableIncome)}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 p-2 space-y-1">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Slabs</span>
                  {result.newRegime.slabWiseTax.map((s, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-slate-400">
                      <span>
                        {s.slab} ({s.ratePercent}%)
                      </span>
                      <span>{money(s.taxAmount)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-bold">
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block">Total Annual Tax</span>
                    <span className="text-lg text-white">{money(result.newRegime.totalAnnualTax)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-500 block">Monthly TDS</span>
                    <span className="text-sm text-rose-400">{money(result.newRegime.monthlyEstimatedTds)}/mo</span>
                  </div>
                </div>
              </div>

              {/* Old Regime Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <b className="text-sm text-white">Old Tax Regime</b>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                    Itemized Deductions
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-400">
                    <span>Gross Earnings:</span>
                    <span className="text-white">{money(result.oldRegime.grossSalary)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Exemptions & Deductions:</span>
                    <span className="text-emerald-400">-{money(result.oldRegime.totalExemptionsAndDeductions)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/80 pt-1 font-semibold text-slate-200">
                    <span>Taxable Income:</span>
                    <span>{money(result.oldRegime.netTaxableIncome)}</span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-900 p-2 space-y-1">
                  <span className="text-[10px] uppercase text-slate-500 font-semibold block">Slabs</span>
                  {result.oldRegime.slabWiseTax.map((s, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] text-slate-400">
                      <span>
                        {s.slab} ({s.ratePercent}%)
                      </span>
                      <span>{money(s.taxAmount)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-800 pt-2 flex items-center justify-between font-bold">
                  <div>
                    <span className="text-[10px] uppercase text-slate-500 block">Total Annual Tax</span>
                    <span className="text-lg text-white">{money(result.oldRegime.totalAnnualTax)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-slate-500 block">Monthly TDS</span>
                    <span className="text-sm text-rose-400">{money(result.oldRegime.monthlyEstimatedTds)}/mo</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
