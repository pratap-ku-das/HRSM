import React, { useState } from 'react';
import { ExpenseClaim, ExpenseStatus } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Receipt, Plus, DollarSign, CheckCircle2, XCircle, 
  Clock, Calendar, User, FileText, X, Check
} from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const { currentCompany, currentUser, settings } = useAuth();
  const currencySymbol = settings?.currencySymbol || '₹';
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);

  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<ExpenseClaim['category']>('TRAVEL');
  const [amount, setAmount] = useState<number>(150);
  const [notes, setNotes] = useState<string>('');
  const [empId, setEmpId] = useState<string>('');

  const employees = storageService.getEmployees(currentCompany?.id);
  const expenses = storageService.getExpenses(currentCompany?.id);

  const handleSubmitClaim = (e: React.FormEvent) => {
    e.preventDefault();
    const newClaim: ExpenseClaim = {
      id: `exp-${Date.now()}`,
      companyId: currentCompany?.id || '',
      employeeId: empId || currentUser?.employeeId || employees[0]?.id || 'emp-1',
      title,
      category,
      amount: Number(amount),
      currency: settings?.currency || 'INR',
      expenseDate: new Date().toISOString().split('T')[0],
      status: 'PENDING',
      notes,
      submittedAt: new Date().toISOString(),
    };

    storageService.saveExpense(newClaim);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'User',
      userRole: currentUser?.role || 'EMPLOYEE',
      action: 'SUBMIT_EXPENSE',
      category: 'PAYROLL',
      details: `Submitted expense claim: ${newClaim.title} (${currencySymbol}${newClaim.amount.toLocaleString('en-IN')})`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setIsSubmitModalOpen(false);
    setTitle('');
    setNotes('');
  };

  const handleReview = (claim: ExpenseClaim, newStatus: ExpenseStatus) => {
    const updated: ExpenseClaim = {
      ...claim,
      status: newStatus,
    };
    storageService.saveExpense(updated);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'REVIEW_EXPENSE',
      category: 'PAYROLL',
      details: `${newStatus} expense claim (${claim.title} - ${currencySymbol}${claim.amount.toLocaleString('en-IN')})`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });
  };

  const getStatusBadge = (status: ExpenseStatus) => {
    switch (status) {
      case 'APPROVED':
      case 'REIMBURSED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'REJECTED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
  };

  return (
    <div className="neo-page neo-expenses">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Receipt className="w-6 h-6 text-brand-400" />
            <span>Expense Claims & Reimbursements</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit employee travel, meal, hardware, and client entertainment expense claims for reimbursement.
          </p>
        </div>

        <button
          onClick={() => {
            if (employees.length > 0) setEmpId(employees[0].id);
            setIsSubmitModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Submit Claim</span>
        </button>
      </div>

      {/* Claims Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Claim Title</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {expenses.map((exp) => {
                const emp = employees.find(e => e.id === exp.employeeId);

                return (
                  <tr key={exp.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-white">{exp.title}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <img
                          src={emp?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                          alt="Emp"
                          className="w-6 h-6 rounded-lg object-cover border border-slate-700"
                        />
                        <span className="text-slate-300 font-medium">{emp ? `${emp.firstName} ${emp.lastName}` : 'Employee'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-sm">{currencySymbol}{exp.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{exp.expenseDate}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadge(exp.status)}`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {exp.status === 'PENDING' ? (
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleReview(exp, 'APPROVED')}
                            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReview(exp, 'REJECTED')}
                            className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[11px] font-semibold transition-all"
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500 font-mono text-[11px]">Processed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submit Claim Modal */}
      {isSubmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsSubmitModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Submit Expense Claim</h3>

            <form onSubmit={handleSubmitClaim} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Claim Title / Purpose *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. AWS Cloud Summit Pass & Travel"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="TRAVEL">Flight & Travel</option>
                    <option value="MEALS">Client Meals & Dining</option>
                    <option value="HARDWARE">Hardware & Peripherals</option>
                    <option value="CERTIFICATION">Certification & Course</option>
                    <option value="MISC">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Amount ({currencySymbol}) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Claiming Employee</label>
                <select
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Receipt Notes / Description</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Expense business justification..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Submit Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
