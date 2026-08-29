import React, { useState } from 'react';
import { PayrollRun, Payslip, Employee } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { downloadPayslipPdf } from '../../utils/payslipPdf';
import { 
  CreditCard, DollarSign, Download, Printer, CheckCircle2, 
  Calendar, FileText, X, Sparkles, Building2, User, ArrowUpRight
} from 'lucide-react';

export const PayrollPage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [activePayslip, setActivePayslip] = useState<Payslip | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const employees = storageService.getEmployees(currentCompany?.id);
  const payrollRuns = storageService.getPayrollRuns(currentCompany?.id);
  const payslips = storageService.getPayslips(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const designations = storageService.getDesignations(currentCompany?.id);
  const settings = storageService.getSettings(currentCompany?.id || '');

  const currentRun = payrollRuns.find(r => r.month === selectedMonth);
  const monthPayslips = payslips.filter(p => p.month === selectedMonth);

  // Totals
  const totalGross = monthPayslips.reduce((acc, p) => acc + p.grossSalary, 0);
  const totalDeductions = monthPayslips.reduce((acc, p) => acc + p.totalDeductions, 0);
  const totalNet = monthPayslips.reduce((acc, p) => acc + p.netSalary, 0);

  const handleGeneratePayroll = () => {
    setIsProcessing(true);

    setTimeout(() => {
      const newPayslips: Payslip[] = employees.map(emp => {
        const gross = emp.salary.basic + emp.salary.hra + emp.salary.allowances;
        const deductions = emp.salary.providentFund + emp.salary.taxDeduction;
        const net = gross - deductions;

        return {
          id: `ps-${emp.id}-${selectedMonth}`,
          companyId: currentCompany?.id || '',
          payrollRunId: `pr-${selectedMonth}`,
          employeeId: emp.id,
          month: selectedMonth,
          basicSalary: emp.salary.basic,
          hra: emp.salary.hra,
          allowances: emp.salary.allowances,
          grossSalary: gross,
          providentFund: emp.salary.providentFund,
          taxDeductions: emp.salary.taxDeduction,
          otherDeductions: 0,
          totalDeductions: deductions,
          netSalary: net,
          workingDays: 22,
          presentDays: 21,
          paidLeaveDays: 1,
          unpaidDays: 0,
          status: 'PAID',
          paymentDate: new Date().toISOString().split('T')[0],
        };
      });

      const newRun: PayrollRun = {
        id: `pr-${selectedMonth}`,
        companyId: currentCompany?.id || '',
        month: selectedMonth,
        status: 'PAID',
        totalEmployees: employees.length,
        totalGrossSalary: newPayslips.reduce((acc, p) => acc + p.grossSalary, 0),
        totalDeductions: newPayslips.reduce((acc, p) => acc + p.totalDeductions, 0),
        totalNetPayout: newPayslips.reduce((acc, p) => acc + p.netSalary, 0),
        processedDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      storageService.savePayrollRun(newRun);
      newPayslips.forEach(ps => storageService.savePayslip(ps));

      storageService.logAudit({
        companyId: currentCompany?.id || '',
        userId: currentUser?.id || '',
        userName: currentUser?.fullName || 'Admin',
        userRole: currentUser?.role || 'ADMIN',
        action: 'PROCESS_PAYROLL',
        category: 'PAYROLL',
        details: `Generated and disbursed payroll for ${selectedMonth} (${newRun.totalEmployees} employees, Net: ₹${newRun.totalNetPayout.toLocaleString('en-IN')}).`,
        timestamp: new Date().toISOString(),
        ipAddress: '127.0.0.1',
      });

      setIsProcessing(false);
    }, 1000);
  };

  const handleDownloadPayslip = async () => {
    if (!activePayslip || !currentCompany || !settings) return;
    const employee = employees.find(item => item.id === activePayslip.employeeId);
    if (!employee) return;
    setIsGeneratingPdf(true);
    try {
      await downloadPayslipPdf({
        company: currentCompany,
        settings,
        employee,
        department: departments.find(item => item.id === employee.departmentId),
        designation: designations.find(item => item.id === employee.designationId),
        payslip: activePayslip,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const currSymbol = settings?.currencySymbol || '₹';

  return (
    <div className="neo-page neo-payroll">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <CreditCard className="w-6 h-6 text-brand-400" />
            <span>Payroll Management & Digital Payslips ({currSymbol} INR)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Automated Indian statutory payroll, EPF (12%), Professional Tax, TDS deductions, and instant employee payslips.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-4 h-4 text-brand-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none font-mono"
            >
              <option value="2026-08" className="bg-slate-900">August 2026</option>
              <option value="2026-07" className="bg-slate-900">July 2026</option>
              <option value="2026-06" className="bg-slate-900">June 2026</option>
              <option value="2026-05" className="bg-slate-900">May 2026</option>
            </select>
          </div>

          <button
            onClick={handleGeneratePayroll}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            {isProcessing ? (
              <div className="flex items-center space-x-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Computing...</span>
              </div>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Payroll for {selectedMonth}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Total Gross Salary ({selectedMonth})</div>
          <div className="text-2xl font-bold text-white font-mono mt-1">{currSymbol}{totalGross.toLocaleString('en-IN')}.00</div>
          <div className="text-[10px] text-slate-500 mt-1">Basic + HRA + Allowances</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Total Deductions (EPF & Tax TDS)</div>
          <div className="text-2xl font-bold text-rose-400 font-mono mt-1">-{currSymbol}{totalDeductions.toLocaleString('en-IN')}.00</div>
          <div className="text-[10px] text-slate-500 mt-1">Indian statutory withholdings</div>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/30 border border-emerald-500/30">
          <div className="text-xs text-emerald-300 font-medium">Total Net Disbursed Payout</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{currSymbol}{totalNet.toLocaleString('en-IN')}.00</div>
          <div className="text-[10px] text-emerald-400 flex items-center space-x-1 mt-1 font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            <span>{currentRun?.status === 'PAID' ? 'Fully Processed & Disbursed' : 'Ready for Payout'}</span>
          </div>
        </div>
      </div>

      {/* Payslips Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <h3 className="font-bold text-white">Employee Payslips for {selectedMonth}</h3>
          <span className="text-[11px] text-slate-400 font-mono">{monthPayslips.length} Payslips Generated</span>
        </div>

        {monthPayslips.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <CreditCard className="w-10 h-10 text-slate-600 mx-auto" />
            <p>No payroll run generated for {selectedMonth} yet.</p>
            <button
              onClick={handleGeneratePayroll}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold shadow"
            >
              Generate Payroll Run Now
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Basic Pay</th>
                  <th className="py-3 px-4">HRA + Allowances</th>
                  <th className="py-3 px-4">Gross Pay</th>
                  <th className="py-3 px-4">PF & Tax Deductions</th>
                  <th className="py-3 px-4">Net Salary</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Digital Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {monthPayslips.map((ps) => {
                  const emp = employees.find(e => e.id === ps.employeeId);

                  return (
                    <tr key={ps.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <img
                            src={emp?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                            alt="Emp"
                            className="w-7 h-7 rounded-lg object-cover border border-slate-700"
                          />
                          <div>
                            <div className="font-bold text-white">{emp ? `${emp.firstName} ${emp.lastName}` : 'Employee'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{emp?.employeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 font-semibold">{currSymbol}{ps.basicSalary.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-mono text-slate-300">{currSymbol}{(ps.hra + ps.allowances).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">{currSymbol}{ps.grossSalary.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-mono text-rose-400">-{currSymbol}{ps.totalDeductions.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-sm">{currSymbol}{ps.netSalary.toLocaleString('en-IN')}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                          {ps.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setActivePayslip(ps)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-brand-300 border border-slate-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center space-x-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View Payslip</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Digital Payslip Modal */}
      {activePayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setActivePayslip(null)} />
          
          <div className="relative w-full max-w-2xl bg-white text-slate-900 rounded-3xl shadow-2xl p-8 z-10 animate-slide-up text-xs font-sans">
            {/* Payslip Header */}
            <div className="flex items-start justify-between pb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="text-base font-extrabold text-slate-900">{currentCompany?.name}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{currentCompany?.address}</p>
                <p className="text-[10px] font-mono text-slate-400">GSTIN / Tax Reg: {settings?.taxRegistrationNumber || '29AABCA1234F1Z8'}</p>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
                  Official Payslip
                </span>
                <div className="text-sm font-extrabold text-slate-900 mt-2 font-mono">
                  {new Date(`${activePayslip.month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </div>
                <div className="text-[10px] text-emerald-600 font-bold mt-0.5">● DISBURSED & PAID (INR)</div>
              </div>
            </div>

            {/* Employee Info Block */}
            {(() => {
              const emp = employees.find(e => e.id === activePayslip.employeeId);
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Employee Name</span>
                    <div className="font-bold text-slate-900 mt-0.5">{emp ? `${emp.firstName} ${emp.lastName}` : 'Employee'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Employee Code / UAN</span>
                    <div className="font-bold text-slate-900 font-mono mt-0.5">{emp?.employeeCode}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Bank / IFSC</span>
                    <div className="font-bold text-slate-900 font-mono mt-0.5">{emp?.bankDetails?.accountNumber || 'HDFC0001234 • 5010023412'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Working Days</span>
                    <div className="font-bold text-slate-900 font-mono mt-0.5">{activePayslip.presentDays} / {activePayslip.workingDays} days</div>
                  </div>
                </div>
              );
            })()}

            {/* Earnings & Deductions Tables */}
            <div className="grid grid-cols-2 gap-6 py-5 border-b border-slate-200">
              {/* Earnings */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 text-xs pb-1 border-b border-slate-100 flex justify-between">
                  <span>Earnings Breakdown</span>
                  <span>Amount ({currSymbol})</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>Basic Salary</span>
                  <span className="font-mono font-semibold">{currSymbol}{activePayslip.basicSalary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>House Rent Allowance (HRA)</span>
                  <span className="font-mono font-semibold">{currSymbol}{activePayslip.hra.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>Special / Travel Allowances</span>
                  <span className="font-mono font-semibold">{currSymbol}{activePayslip.allowances.toLocaleString('en-IN')}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-slate-900">
                  <span>Total Gross Earnings</span>
                  <span className="font-mono">{currSymbol}{activePayslip.grossSalary.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Deductions */}
              <div className="space-y-2">
                <div className="font-bold text-slate-800 text-xs pb-1 border-b border-slate-100 flex justify-between">
                  <span>Statutory Deductions</span>
                  <span>Amount ({currSymbol})</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>Employee Provident Fund (EPF 12%)</span>
                  <span className="font-mono font-semibold">{currSymbol}{activePayslip.providentFund.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>TDS / Income Tax</span>
                  <span className="font-mono font-semibold">{currSymbol}{activePayslip.taxDeductions.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-600 py-1">
                  <span>Professional Tax (PT)</span>
                  <span className="font-mono font-semibold">{currSymbol}200</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-rose-600">
                  <span>Total Deductions</span>
                  <span className="font-mono">-{currSymbol}{activePayslip.totalDeductions.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Net Pay Payout Box */}
            <div className="my-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Net In-Hand Take Home</span>
                <p className="text-[10px] text-emerald-600">Disbursed via NEFT / IMPS Electronic Bank Transfer</p>
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 font-mono">
                {currSymbol}{activePayslip.netSalary.toLocaleString('en-IN')}.00
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Generated automatically by OrbitHR Platform</span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownloadPayslip}
                  disabled={isGeneratingPdf}
                  className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 rounded-xl font-bold flex items-center space-x-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>{isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}</span>
                </button>
                <button
                  onClick={() => setActivePayslip(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
