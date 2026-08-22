import React, { useState } from 'react';
import { LeaveRequest, LeaveType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  CalendarDays, Plus, Check, X, Clock, CheckCircle2, 
  XCircle, Filter, Calendar, User, FileText, Sparkles
} from 'lucide-react';

export const LeaveManagementPage: React.FC = () => {
  const { currentCompany, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'requests' | 'balances' | 'policies'>('requests');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [totalDays, setTotalDays] = useState<number>(1);
  const [reason, setReason] = useState<string>('');

  const employees = storageService.getEmployees(currentCompany?.id);
  const leaveTypes = storageService.getLeaveTypes(currentCompany?.id);
  const leaveRequests = storageService.getLeaveRequests(currentCompany?.id);

  const filteredRequests = leaveRequests.filter(r => {
    return statusFilter === 'ALL' || r.status === statusFilter;
  });

  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    const newReq: LeaveRequest = {
      id: `lr-${Date.now()}`,
      companyId: currentCompany?.id || '',
      employeeId: currentUser?.employeeId || employees[0]?.id || 'emp-1',
      leaveTypeId: leaveTypeId || leaveTypes[0]?.id || '',
      startDate,
      endDate,
      totalDays: Number(totalDays),
      reason,
      status: 'PENDING',
      appliedAt: new Date().toISOString(),
    };

    storageService.saveLeaveRequest(newReq);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'User',
      userRole: currentUser?.role || 'EMPLOYEE',
      action: 'APPLY_LEAVE',
      category: 'LEAVE',
      details: `Submitted leave request for ${newReq.totalDays} day(s): ${newReq.reason}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setIsApplyModalOpen(false);
    setReason('');
  };

  const handleReview = (req: LeaveRequest, newStatus: 'APPROVED' | 'REJECTED') => {
    const updated: LeaveRequest = {
      ...req,
      status: newStatus,
      approvedBy: currentUser?.fullName || 'HR Manager',
      reviewerComment: newStatus === 'APPROVED' ? 'Approved by HR Operations.' : 'Request declined.',
    };

    storageService.saveLeaveRequest(updated);

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: newStatus === 'APPROVED' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
      category: 'LEAVE',
      details: `${newStatus === 'APPROVED' ? 'Approved' : 'Rejected'} leave request (${req.id}) for employee ${req.employeeId}`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'REJECTED': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default: return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <CalendarDays className="w-6 h-6 text-brand-400" />
            <span>Leave Management & Time-Off</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage paid time-off, sick days, approval queues, and annual leave balance ledgers.
          </p>
        </div>

        <button
          onClick={() => {
            if (leaveTypes.length > 0) setLeaveTypeId(leaveTypes[0].id);
            setIsApplyModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Apply for Leave</span>
        </button>
      </div>

      {/* Leave Balance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {leaveTypes.map((type) => (
          <div
            key={type.id}
            className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between shadow-sm"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">{type.name}</span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: type.color }}
              />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-white font-mono">{type.daysAllowedPerYear}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Days / Year (Annual Policy)</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
        <div className="flex space-x-2 font-semibold">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'requests'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Leave Requests ({leaveRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('policies')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'policies'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Leave Policies ({leaveTypes.length})
          </button>
        </div>

        {activeTab === 'requests' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Declined</option>
          </select>
        )}
      </div>

      {/* TAB 1: REQUESTS TABLE */}
      {activeTab === 'requests' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Leave Type</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Approval Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredRequests.map((req) => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  const lType = leaveTypes.find(t => t.id === req.leaveTypeId);

                  return (
                    <tr key={req.id} className="hover:bg-slate-800/40 transition-colors">
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
                      <td className="py-3 px-4">
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{ backgroundColor: `${lType?.color || '#3b82f6'}25`, color: lType?.color || '#93c5fd' }}
                        >
                          {lType?.name || 'Leave'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300 text-[11px]">
                        {req.startDate} {req.startDate !== req.endDate ? `→ ${req.endDate}` : ''}
                      </td>
                      <td className="py-3 px-4 font-bold text-white font-mono">{req.totalDays}d</td>
                      <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{req.reason}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadge(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {req.status === 'PENDING' ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleReview(req, 'APPROVED')}
                              className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleReview(req, 'REJECTED')}
                              className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1"
                            >
                              <X className="w-3 h-3" />
                              <span>Decline</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            {req.approvedBy ? `by ${req.approvedBy}` : 'Processed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: POLICIES */}
      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {leaveTypes.map((t) => (
            <div key={t.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="font-bold text-white text-sm">{t.name}</span>
                </div>
                <span className="font-mono text-slate-400 text-xs font-bold">{t.code}</span>
              </div>
              <p className="text-slate-400">
                Annual allocation quota is <strong className="text-white">{t.daysAllowedPerYear} days</strong> per calendar year. 
                {t.isPaid ? ' 100% Paid Time Off.' : ' Unpaid leave allocation.'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Apply Leave Modal */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsApplyModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Apply for Leave / Time-Off</h3>
            <p className="text-xs text-slate-400 mt-0.5">Submit request to manager and HR for review.</p>

            <form onSubmit={handleApplyLeave} className="mt-4 space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Leave Category *</label>
                <select
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.daysAllowedPerYear} days/yr)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Total Days *</label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  required
                  value={totalDays}
                  onChange={(e) => setTotalDays(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason for Leave *</label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Attending family wedding, personal doctor appointment..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
