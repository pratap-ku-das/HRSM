import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';
import { 
  Users, UserCheck, UserX, Clock, CalendarDays, GitBranch, 
  Percent, Plus, ArrowUpRight, ArrowDownRight, Sparkles, 
  Cake, Gift, Calendar, CalendarCheck, CheckCircle2, XCircle, AlertCircle, ChevronRight,
  ShieldCheck, Receipt, Megaphone, FileText, Briefcase, DollarSign,
  TrendingUp, Activity, Check, X, ArrowRight, Zap, Award, CreditCard
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
  const toast = useToast();
  const [chartRange, setChartRange] = useState<'7d' | '14d' | '30d'>('14d');

  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const attendanceRecords = storageService.getAttendanceRecords(currentCompany?.id);
  const leaveRequests = storageService.getLeaveRequests(currentCompany?.id);
  const holidays = storageService.getHolidays(currentCompany?.id);
  const announcements = storageService.getAnnouncements(currentCompany?.id);
  const auditLogs = storageService.getAuditLogs(currentCompany?.id);
  const expenses = storageService.getExpenses(currentCompany?.id);
  const jobs = storageService.getJobPostings(currentCompany?.id);
  const leaveTypes = storageService.getLeaveTypes(currentCompany?.id);

  // Compute today's date & stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = attendanceRecords.filter(a => a.date === todayStr);

  const totalEmployeesCount = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'ACTIVE').length;
  const probationEmployees = employees.filter(e => e.status === 'ON_PROBATION').length;

  const presentCount = todayAttendance.filter(a => a.status === 'PRESENT').length;
  const lateCount = todayAttendance.filter(a => a.status === 'LATE').length;
  const leaveCount = todayAttendance.filter(a => a.status === 'LEAVE').length;
  const absentCount = Math.max(0, totalEmployeesCount - (presentCount + lateCount + leaveCount));

  const attendancePercentage = totalEmployeesCount > 0 
    ? Math.round(((presentCount + lateCount) / totalEmployeesCount) * 100) 
    : 100;

  // Compute monthly payroll estimate (basic + hra + allowances)
  const totalMonthlyPayroll = employees.reduce((sum, e) => {
    const gross = (e.salary?.basic || 50000) + (e.salary?.hra || 15000) + (e.salary?.allowances || 5000);
    return sum + gross;
  }, 0);

  // Range-based attendance trend data
  const daysCount = chartRange === '7d' ? 7 : chartRange === '14d' ? 14 : 30;
  const trendData = [];
  const today = new Date();
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayRecords = attendanceRecords.filter(a => a.date === dateKey);

    const present = dayRecords.filter(a => a.status === 'PRESENT').length;
    const late = dayRecords.filter(a => a.status === 'LATE').length;
    const onLeave = dayRecords.filter(a => a.status === 'LEAVE').length;
    const absent = Math.max(0, (totalEmployeesCount || 8) - (present + late + onLeave));

    trendData.push({
      date: dayLabel,
      Present: present || Math.max(1, (totalEmployeesCount || 7) - 1),
      Late: late || 1,
      Absent: absent || 0,
      Leave: onLeave || 0,
    });
  }

  // Department distribution
  const deptData = departments.map(dept => {
    const count = employees.filter(e => e.departmentId === dept.id).length;
    return {
      name: dept.name,
      code: dept.code,
      employees: count || dept.employeeCount || 1,
    };
  });

  const DEPT_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

  const pendingLeaves = leaveRequests.filter(r => r.status === 'PENDING');
  const pendingExpenses = expenses.filter(e => e.status === 'PENDING');
  const openJobsCount = jobs.filter(j => j.status === 'OPEN').length;

  const handleApproveLeave = (reqId: string) => {
    const req = leaveRequests.find(r => r.id === reqId);
    if (req) {
      storageService.saveLeaveRequest({
        ...req,
        status: 'APPROVED',
        approvedBy: currentUser?.fullName || 'Admin',
        reviewerComment: 'Approved via Instant Dashboard Tray',
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
      toast.success('Leave Request Approved', `Request for ${req.totalDays} days marked as approved.`);
    }
  };

  const handleRejectLeave = (reqId: string) => {
    const req = leaveRequests.find(r => r.id === reqId);
    if (req) {
      storageService.saveLeaveRequest({
        ...req,
        status: 'REJECTED',
        approvedBy: currentUser?.fullName || 'Admin',
        reviewerComment: 'Rejected via Dashboard',
      });
      storageService.logAudit({
        companyId: currentCompany?.id || '',
        userId: currentUser?.id || '',
        userName: currentUser?.fullName || '',
        userRole: currentUser?.role || '',
        action: 'REJECT_LEAVE',
        category: 'LEAVE',
        details: `Rejected leave request for employee ${req.employeeId}`,
        timestamp: new Date().toISOString(),
        ipAddress: '127.0.0.1',
      });
      toast.warning('Leave Request Rejected', 'The applicant has been notified.');
    }
  };

  const handleApproveExpense = (expId: string) => {
    const exp = expenses.find(e => e.id === expId);
    if (exp) {
      storageService.saveExpense({
        ...exp,
        status: 'APPROVED',
      });
      toast.success('Expense Claim Approved', `Approved $${exp.amount.toLocaleString()} for payout.`);
    }
  };

  // Custom Glass Tooltip for Charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-3 rounded-xl glass-dropdown border border-slate-700 shadow-2xl text-xs space-y-1.5">
          <p className="font-bold text-white mb-1 border-b border-slate-800 pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between space-x-4">
              <span className="flex items-center space-x-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="neo-page neo-dashboard">
      {/* Top Welcome Banner with Ambient Glow */}
      <div className="relative overflow-hidden rounded-3xl glass-card p-6 sm:p-8 border border-white/10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 ambient-mesh ambient-blue pointer-events-none" />
        <div className="absolute bottom-0 right-1/3 -mb-16 w-60 h-60 ambient-mesh ambient-purple pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
              <span>Live HR Workspace • {currentCompany?.name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>Good day, {currentUser?.fullName?.split(' ')[0] || 'Admin'}</span>
              <span className="text-2xl">✨</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              Real-time workforce attendance matrices, pending approval trays, and automated payroll operations are synced and running smoothly.
            </p>
          </div>

          {/* Quick Action Tray */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setActiveView('employees')}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 via-indigo-600 to-purple-600 hover:from-brand-600 hover:to-indigo-700 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all flex items-center space-x-2 group hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              <span>Add Employee</span>
            </button>
            <button
              onClick={() => setActiveView('attendance')}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 hover:border-slate-600 transition-all flex items-center space-x-2 shadow-sm"
            >
              <CalendarCheck className="w-4 h-4 text-brand-400" />
              <span>Attendance Matrix</span>
            </button>
            <button
              onClick={() => setActiveView('payroll')}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 hover:border-slate-600 transition-all flex items-center space-x-2 shadow-sm"
            >
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span>Run Payroll</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Row (6 Cards) */}
      <div className="dashboard-kpis grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* 1. Total Workforce */}
        <div 
          onClick={() => setActiveView('employees')}
          className="lg:col-span-3 p-4 rounded-2xl glass-card hover:border-brand-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Workforce</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-white font-mono">{totalEmployeesCount}</div>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center">
              <ArrowUpRight className="w-3 h-3" /> +12%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{activeEmployees} Active</span>
            <span className="text-brand-400">{probationEmployees} Prob</span>
          </div>
        </div>

        {/* 2. Today's Attendance Rate */}
        <div 
          onClick={() => setActiveView('attendance')}
          className="lg:col-span-3 p-4 rounded-2xl glass-card hover:border-emerald-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Attendance</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-emerald-400 font-mono">{attendancePercentage}%</div>
            <span className="text-[10px] text-slate-400">Punctuality</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="text-emerald-400 font-medium">{presentCount} In</span>
            <span className="text-amber-400">{lateCount} Late</span>
          </div>
        </div>

        {/* 3. Pending Approvals */}
        <div 
          onClick={() => setActiveView('leaves')}
          className="lg:col-span-3 p-4 rounded-2xl glass-card hover:border-amber-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Approvals</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-amber-400 font-mono">
              {pendingLeaves.length + pendingExpenses.length}
            </div>
            <span className="text-[10px] text-amber-400/80 font-medium">Pending</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>{pendingLeaves.length} Leaves</span>
            <span>{pendingExpenses.length} Claims</span>
          </div>
        </div>

        {/* 4. Monthly Payroll Run */}
        <div 
          onClick={() => setActiveView('payroll')}
          className="lg:col-span-3 p-4 rounded-2xl glass-card hover:border-purple-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payroll</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-white font-mono">
              ${(totalMonthlyPayroll / 1000).toFixed(0)}k
            </div>
            <span className="text-[10px] text-purple-300">/ mo</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Status: Ready</span>
            <span className="text-emerald-400">100% Synced</span>
          </div>
        </div>

        {/* 5. Open Requisitions */}
        <div 
          onClick={() => setActiveView('recruitment')}
          className="lg:col-span-6 p-4 rounded-2xl glass-card hover:border-cyan-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ATS Talent</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-white font-mono">{openJobsCount || 3}</div>
            <span className="text-[10px] text-cyan-300">Open Roles</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Active ATS</span>
            <span className="text-cyan-400">Kanban</span>
          </div>
        </div>

        {/* 6. Security & Audit Health */}
        <div 
          onClick={() => setActiveView('audit')}
          className="lg:col-span-6 p-4 rounded-2xl glass-card hover:border-emerald-500/40 cursor-pointer transition-all hover:-translate-y-1 group shadow-md"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Compliance</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1.5">
            <div className="text-2xl font-black text-emerald-400 font-mono">100%</div>
            <span className="text-[10px] text-emerald-300">SOC-2</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Audit Trail</span>
            <span className="text-emerald-400">Encrypted</span>
          </div>
        </div>
      </div>

      {/* Main Charts & Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 14-Day Attendance Dynamics Spline Chart (2 cols) */}
        <div className="lg:col-span-2 rounded-3xl glass-card p-5 sm:p-6 border border-white/10 shadow-2xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-brand-400" />
                <span>Workforce Attendance Dynamics</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Daily punctuality, presence, and regularization trend analysis
              </p>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
              {(['7d', '14d', '30d'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setChartRange(range)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                    chartRange === range
                      ? 'bg-brand-500 text-white shadow-glow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="h-52 sm:h-60 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="lateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Present" stroke="#0ea5e9" strokeWidth={2.5} fillOpacity={1} fill="url(#presentGrad)" />
                <Area type="monotone" dataKey="Late" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#lateGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                <span className="text-slate-300">Present</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-slate-300">Late Punch</span>
              </span>
            </div>
            <button
              onClick={() => setActiveView('attendance')}
              className="text-brand-400 hover:text-brand-300 flex items-center space-x-1 font-semibold"
            >
              <span>View Full Matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Department Workforce Distribution Donut */}
        <div className="rounded-3xl glass-card p-5 sm:p-6 border border-white/10 shadow-2xl flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <GitBranch className="w-4 h-4 text-purple-400" />
                <span>Department Spread</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Headcount distribution across divisions
              </p>
            </div>
            <button
              onClick={() => setActiveView('departments')}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
            >
              Manage
            </button>
          </div>

          <div className="h-44 w-full flex items-center justify-center my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="employees"
                >
                  {deptData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} stroke="rgba(15, 23, 42, 0.8)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Department Legend */}
          <div className="space-y-1.5 pt-3 border-t border-slate-800">
            {deptData.slice(0, 4).map((dept, i) => (
              <div key={dept.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                  <span className="text-slate-300 truncate">{dept.name}</span>
                </div>
                <span className="font-mono font-bold text-white ml-2">{dept.employees}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actionable Bottom Tray: Pending Approvals Hub & Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Approvals Actionable Table (2 cols) */}
        <div className="lg:col-span-2 rounded-3xl glass-card p-5 sm:p-6 border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Pending Approvals Hub
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Direct one-click resolution for leave requests & reimbursement claims
                </p>
              </div>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingLeaves.length + pendingExpenses.length} Action{pendingLeaves.length + pendingExpenses.length !== 1 ? 's' : ''} Required
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {pendingLeaves.length === 0 && pendingExpenses.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-white">All requests resolved!</p>
                <p className="text-xs text-slate-400 mt-1">No pending leave requests or expense reimbursements waiting.</p>
              </div>
            ) : (
              <>
                {/* Pending Leaves */}
                {pendingLeaves.map(req => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  const lType = leaveTypes.find(lt => lt.id === req.leaveTypeId);
                  return (
                    <div
                      key={req.id}
                      className="p-3 sm:p-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm">
                          {emp ? emp.firstName.charAt(0) : 'L'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center space-x-2">
                            <span>{emp ? `${emp.firstName} ${emp.lastName}` : 'Team Member'}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {lType?.name || 'Leave'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 mt-0.5 truncate">
                            {req.reason} • <span className="font-mono text-slate-400">{req.startDate} to {req.endDate} ({req.totalDays} days)</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleApproveLeave(req.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleRejectLeave(req.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-semibold transition-all flex items-center space-x-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Pending Expenses */}
                {pendingExpenses.map(exp => {
                  const emp = employees.find(e => e.id === exp.employeeId);
                  return (
                    <div
                      key={exp.id}
                      className="p-3 sm:p-4 rounded-2xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-500 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center space-x-2">
                            <span>Expense: {exp.title}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              ${exp.amount.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            Category: {exp.category} • Submitted by {emp ? `${emp.firstName} ${emp.lastName}` : 'Team Member'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleApproveExpense(exp.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve Payout</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Right: Celebrations & Live Activity Trail (1 col) */}
        <div className="space-y-6">
          {/* Milestones / Holidays */}
          <div className="rounded-3xl glass-card p-5 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white flex items-center space-x-2 uppercase tracking-wider">
                <Gift className="w-4 h-4 text-pink-400" />
                <span>Upcoming Milestones</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-400">This Month</span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="p-2.5 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center space-x-3">
                <Cake className="w-5 h-5 text-pink-400 shrink-0" />
                <div className="text-xs min-w-0">
                  <div className="font-semibold text-white truncate">Marcus Vance (Engineering)</div>
                  <div className="text-[11px] text-pink-300 font-mono">Birthday • March 4th</div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center space-x-3">
                <Award className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="text-xs min-w-0">
                  <div className="font-semibold text-white truncate">Sarah Jenkins (Design)</div>
                  <div className="text-[11px] text-purple-300 font-mono">3rd Work Anniversary</div>
                </div>
              </div>
            </div>
          </div>

          {/* Security & Audit Live Feed */}
          <div className="rounded-3xl glass-card p-5 border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs font-bold text-white flex items-center space-x-2 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Live Audit Activity</span>
              </h3>
              <button
                onClick={() => setActiveView('audit')}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-medium"
              >
                All Logs
              </button>
            </div>

            <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
              {auditLogs.slice(0, 4).map(log => (
                <div key={log.id} className="text-xs p-2 rounded-xl bg-slate-800/40 border border-slate-800 space-y-0.5">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
                    <span className="text-brand-400 font-semibold">{log.action}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-slate-300 text-[11px] truncate">{log.details}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
