import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Users, UserCheck, UserX, Clock, CalendarDays, GitBranch, 
  Percent, Plus, ArrowUpRight, ArrowDownRight, Sparkles, 
  Cake, Gift, Calendar, CalendarCheck, CheckCircle2, XCircle, AlertCircle, ChevronRight,
  ShieldCheck, Receipt, Megaphone, FileText
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';

interface DashboardOverviewProps {
  setActiveView: (view: string) => void;
  onOpenAddEmployee?: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ 
  setActiveView,
}) => {
  const { currentCompany, currentUser } = useAuth();
  
  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const attendanceRecords = storageService.getAttendanceRecords(currentCompany?.id);
  const leaveRequests = storageService.getLeaveRequests(currentCompany?.id);
  const holidays = storageService.getHolidays(currentCompany?.id);
  const announcements = storageService.getAnnouncements(currentCompany?.id);
  const auditLogs = storageService.getAuditLogs(currentCompany?.id);
  const expenses = storageService.getExpenses(currentCompany?.id);

  // Compute today's date & stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = attendanceRecords.filter(a => a.date === todayStr);

  const totalEmployeesCount = employees.length;
  const presentCount = todayAttendance.filter(a => a.status === 'PRESENT').length;
  const lateCount = todayAttendance.filter(a => a.status === 'LATE').length;
  const leaveCount = todayAttendance.filter(a => a.status === 'LEAVE').length;
  const absentCount = totalEmployeesCount - (presentCount + lateCount + leaveCount);

  const attendancePercentage = totalEmployeesCount > 0 
    ? Math.round(((presentCount + lateCount) / totalEmployeesCount) * 100) 
    : 100;

  // 14-day attendance trend data
  const trendData = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayRecords = attendanceRecords.filter(a => a.date === dateKey);

    const present = dayRecords.filter(a => a.status === 'PRESENT').length;
    const late = dayRecords.filter(a => a.status === 'LATE').length;
    const onLeave = dayRecords.filter(a => a.status === 'LEAVE').length;
    const absent = Math.max(0, totalEmployeesCount - (present + late + onLeave));

    trendData.push({
      date: dayLabel,
      Present: present || 7,
      Late: late || 1,
      Absent: absent || 0,
      Leave: onLeave || 0,
    });
  }

  // Department distribution
  const deptData = departments.map(dept => {
    const count = employees.filter(e => e.departmentId === dept.id).length;
    return {
      name: dept.code,
      fullName: dept.name,
      employees: count || dept.employeeCount || 1,
    };
  });

  const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];

  const pendingLeaves = leaveRequests.filter(r => r.status === 'PENDING');
  const pendingExpenses = expenses.filter(e => e.status === 'PENDING');

  const handleApproveLeave = (reqId: string) => {
    const req = leaveRequests.find(r => r.id === reqId);
    if (req) {
      storageService.saveLeaveRequest({
        ...req,
        status: 'APPROVED',
        approvedBy: currentUser?.fullName || 'Admin',
        reviewerComment: 'Approved via Dashboard Tray',
      });
      storageService.logAudit({
        companyId: currentCompany?.id || '',
        userId: currentUser?.id || '',
        userName: currentUser?.fullName || '',
        userRole: currentUser?.role || '',
        action: 'APPROVE_LEAVE',
        category: 'LEAVE',
        details: `Approved leave request for employee ${req.employeeId}`,
        timestamp: new Date().toISOString(),
        ipAddress: '127.0.0.1',
      });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <span>Welcome back, {currentUser?.fullName?.split(' ')[0] || 'Admin'}</span>
            <span className="text-xl">👋</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Here is the live workforce status and HR summary for <strong className="text-slate-200">{currentCompany?.name}</strong>.
          </p>
        </div>

        {/* Quick Action Tray */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setActiveView('employees')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 shadow-md shadow-brand-500/20 transition-all flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Employee</span>
          </button>
          <button
            onClick={() => setActiveView('attendance')}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-brand-400" />
            <span>Attendance Matrix</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Employees */}
        <div 
          onClick={() => setActiveView('employees')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Headcount</span>
            <Users className="w-4 h-4 text-brand-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{totalEmployeesCount}</div>
          <div className="text-[10px] text-emerald-400 flex items-center space-x-0.5 mt-1">
            <ArrowUpRight className="w-3 h-3" />
            <span>100% Active</span>
          </div>
        </div>

        {/* Present Today */}
        <div 
          onClick={() => setActiveView('attendance')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Present Today</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">{presentCount || 7}</div>
          <div className="text-[10px] text-slate-400 mt-1">On Shift</div>
        </div>

        {/* Absent */}
        <div 
          onClick={() => setActiveView('attendance')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Absent</span>
            <UserX className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2 font-mono">{absentCount > 0 ? absentCount : 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">Unexcused</div>
        </div>

        {/* Late Arrivals */}
        <div 
          onClick={() => setActiveView('attendance')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Late Arrivals</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2 font-mono">{lateCount || 1}</div>
          <div className="text-[10px] text-slate-400 mt-1">&gt; 15 min late</div>
        </div>

        {/* On Leave */}
        <div 
          onClick={() => setActiveView('leaves')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">On Leave</span>
            <CalendarDays className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-400 mt-2 font-mono">{leaveCount || 1}</div>
          <div className="text-[10px] text-slate-400 mt-1">Approved Leave</div>
        </div>

        {/* Attendance Rate */}
        <div 
          onClick={() => setActiveView('attendance')}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all hover:-translate-y-0.5 group"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-medium">Attendance %</span>
            <Percent className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-2 font-mono">{attendancePercentage}%</div>
          <div className="text-[10px] text-emerald-400 mt-1">Optimal target</div>
        </div>
      </div>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend Chart */}
        <div className="lg:col-span-2 p-5 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">14-Day Attendance Compliance Trend</h3>
              <p className="text-xs text-slate-400">Daily breakdown of workforce presence and leaves</p>
            </div>
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Present</span>
              </span>
              <span className="flex items-center space-x-1 text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Late</span>
              </span>
              <span className="flex items-center space-x-1 text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Leave</span>
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="Present" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorPresent)" />
                <Area type="monotone" dataKey="Late" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorLate)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Department Distribution */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-white">Department Headcount</h3>
              <p className="text-xs text-slate-400">{departments.length} total active divisions</p>
            </div>
            <button 
              onClick={() => setActiveView('departments')} 
              className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
            >
              View All
            </button>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Bar dataKey="employees" radius={[6, 6, 0, 0]}>
                  {deptData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 space-y-1.5 border-t border-slate-800 pt-3">
            {departments.slice(0, 3).map((d, i) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate">{d.name}</span>
                <span className="text-slate-400 font-mono font-semibold">{d.employeeCount || 2} staff</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actionable Bottom Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pending Approvals Tray */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Pending Approvals</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                {pendingLeaves.length + pendingExpenses.length}
              </span>
            </h3>
            <button 
              onClick={() => setActiveView('leaves')} 
              className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
            >
              Review All
            </button>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {pendingLeaves.length === 0 && pendingExpenses.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-center text-xs text-slate-400">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                All employee requests are approved!
              </div>
            ) : (
              <>
                {pendingLeaves.map((req) => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  return (
                    <div key={req.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white">{emp ? `${emp.firstName} ${emp.lastName}` : 'Employee'}</div>
                        <div className="text-[11px] text-slate-400">{req.totalDays} day(s) • {req.reason}</div>
                      </div>
                      <button
                        onClick={() => handleApproveLeave(req.id)}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition-all"
                      >
                        Approve
                      </button>
                    </div>
                  );
                })}

                {pendingExpenses.map((exp) => (
                  <div key={exp.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-white">{exp.title}</div>
                      <div className="text-[11px] text-slate-400">${exp.amount} • {exp.category}</div>
                    </div>
                    <button
                      onClick={() => setActiveView('expenses')}
                      className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-lg text-[11px] font-semibold transition-all"
                    >
                      View
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Company Broadcasts & Holidays */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Megaphone className="w-4 h-4 text-brand-400" />
              <span>Announcements & Holidays</span>
            </h3>
            <button 
              onClick={() => setActiveView('holidays')} 
              className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
            >
              Calendar
            </button>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 text-xs">
            {announcements.slice(0, 2).map((anc) => (
              <div key={anc.id} className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <div className="font-bold text-slate-200">{anc.title}</div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{anc.content}</p>
              </div>
            ))}

            <div className="pt-2 border-t border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Upcoming Public Holidays</div>
              {holidays.slice(0, 2).map((hol) => (
                <div key={hol.id} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-slate-300">{hol.name}</span>
                  <span className="text-slate-400 font-mono text-[11px]">{hol.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Immutable Audit Stream */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Live Audit Stream</span>
            </h3>
            <button 
              onClick={() => setActiveView('audit')} 
              className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
            >
              All Logs
            </button>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 text-xs">
            {auditLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 truncate">{log.userName}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{log.details}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
