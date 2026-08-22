import React, { useState } from 'react';
import { AuditLog } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  ShieldCheck, Search, Filter, Lock, Download, 
  Terminal, CheckCircle2, Clock, User, Shield
} from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const { currentCompany } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const auditLogs = storageService.getAuditLogs(currentCompany?.id);

  const filteredLogs = auditLogs.filter(l => {
    const matchesSearch = 
      l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || l.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleExportLogs = () => {
    const headers = ['Timestamp', 'User', 'Role', 'Category', 'Action', 'Details', 'IP Address'];
    const rows = filteredLogs.map(l => [
      l.timestamp,
      `"${l.userName}"`,
      l.userRole,
      l.category,
      l.action,
      `"${l.details.replace(/"/g, '""')}"`,
      l.ipAddress
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${currentCompany?.slug || 'company'}_audit_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'AUTH': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'ATTENDANCE': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'LEAVE': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'PAYROLL': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'EMPLOYEE': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>Immutable Compliance & Security Audit Logs</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Tamper-evident system activity ledger tracking every administrative write, adjustment, and employee state change.
          </p>
        </div>

        <button
          onClick={handleExportLogs}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center space-x-1.5"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Trail (CSV)</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 text-xs">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by user, action, or details..."
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Audit Categories</option>
            <option value="EMPLOYEE">Employee Lifecycle</option>
            <option value="ATTENDANCE">Attendance & Adjustments</option>
            <option value="LEAVE">Leave Approvals</option>
            <option value="PAYROLL">Payroll & Payouts</option>
            <option value="AUTH">Authentication & Sessions</option>
            <option value="SYSTEM">System & Multi-Tenancy</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden text-xs shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/60 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Event Description</th>
                <th className="py-3 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-white">{log.userName}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{log.userRole}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getCategoryBadge(log.category)}`}>
                      {log.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-brand-300 text-[11px]">{log.action}</td>
                  <td className="py-3 px-4 text-slate-300 max-w-md">{log.details}</td>
                  <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
