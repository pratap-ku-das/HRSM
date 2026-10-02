import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, CheckCircle2, CheckSquare, Clock, RefreshCw, UserCheck, UserMinus, Users } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { api } from '../../services/api';
import type { ApprovalInboxItem, CommandCenterData, OrbitNotification } from '../../types';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { canAccessView, hasPermission, workspaceTitle } from '../../config/workspaceAccess';

const metricCards = [
  { key: 'activeEmployees', label: 'Active employees', icon: Users, tone: 'violet' },
  { key: 'onTimeToday', label: 'On-time present', icon: UserCheck, tone: 'emerald' },
  { key: 'lateToday', label: 'Late entry', icon: Clock, tone: 'amber' },
  { key: 'absentToday', label: 'Absent today', icon: UserMinus, tone: 'rose' },
  { key: 'onLeaveToday', label: 'On leave today', icon: CalendarDays, tone: 'amber' },
] as const;

export const DashboardOverview: React.FC<{ setActiveView: (view: string) => void }> = ({ setActiveView }) => {
  const toast = useToast();
  const { currentUser } = useAuth();
  const [center, setCenter] = useState<CommandCenterData | null>(null);
  const [approvals, setApprovals] = useState<ApprovalInboxItem[]>([]);
  const [notifications, setNotifications] = useState<OrbitNotification[]>([]);
  const [operations, setOperations] = useState<{ announcements: Array<{id:string;title:string;content:string;createdAt:string}>; holidays: Array<{id:string;name:string;date:string}> } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const results = await Promise.allSettled([
      hasPermission(currentUser, 'employee.read.all') ? api.getCommandCenter() : Promise.resolve(null),
      hasPermission(currentUser, 'workflow.review') ? api.getApprovalInbox() : Promise.resolve([] as ApprovalInboxItem[]),
      api.getNotifications(true),
      api.getOperationsWorkspace(),
    ]);
    if (results[0].status === 'fulfilled' && results[0].value) setCenter(results[0].value);
    if (results[1].status === 'fulfilled') setApprovals(results[1].value);
    if (results[2].status === 'fulfilled') setNotifications(results[2].value);
    if (results[3].status === 'fulfilled') setOperations(results[3].value);
    if (results.every((result) => result.status === 'rejected')) toast.error('Dashboard could not be loaded');
    setBusy(false);
  }, [currentUser, toast]);
  useEffect(() => { void load(); }, [load]);
  const upcomingHolidays = operations?.holidays.filter((item) => new Date(item.date) >= new Date()).slice(0, 5) ?? [];
  const workforceAdmin = hasPermission(currentUser, 'employee.read.all');

  const getMetricValue = (key: string) => {
    if (!center) return 0;
    if (key === 'onTimeToday') return center.metrics.onTimeToday ?? center.metrics.presentToday ?? 0;
    if (key === 'lateToday') return center.metrics.lateToday ?? 0;
    return (center.metrics as Record<string, number>)[key] ?? 0;
  };

  const onTimeCount = center?.metrics.onTimeToday ?? center?.metrics.presentToday ?? 0;
  const lateCount = center?.metrics.lateToday ?? 0;
  const absentCount = center?.metrics.absentToday ?? 0;
  const activeCount = center?.metrics.activeEmployees ?? 0;
  const presentTotal = onTimeCount + lateCount;
  const attendanceRate = activeCount > 0 ? Math.round((presentTotal / activeCount) * 100) : 0;

  const attendanceChartData = [
    { name: 'On-time Present', value: onTimeCount, color: '#10b981', tone: 'emerald' },
    { name: 'Late Entry', value: lateCount, color: '#eab308', tone: 'amber' },
    { name: 'Absent', value: absentCount, color: '#ef4444', tone: 'rose' },
  ].filter((item) => item.value > 0);

  const hasChartData = (onTimeCount + lateCount + absentCount) > 0;
  const chartDisplayData = hasChartData ? attendanceChartData : [{ name: 'No data', value: 1, color: '#334155', tone: 'slate' }];

  if (!workforceAdmin) {
    const actions = [
      ['my-attendance', 'My attendance', 'Review your verified punches and attendance history.'],
      ['my-leave', 'My leave', 'Check balances and submit a leave request.'],
      ['my-pay', 'My pay', 'Open your published payslips.'],
      ['my-expenses', 'My expenses', 'Submit and track expense claims.'],
      ['employees', 'My team', 'Open your permission-scoped team directory.'],
      ['approvals', 'Team approvals', 'Review requests assigned to you.'],
    ].filter(([view]) => canAccessView(currentUser, view));
    return <div className="neo-page neo-dashboard space-y-5">
      <header className="flex justify-between border-b border-slate-800 pb-4"><div><p className="text-[10px] uppercase tracking-widest text-brand-300">{workspaceTitle(currentUser)}</p><h1 className="text-2xl font-bold">Welcome, {currentUser?.fullName}</h1><p className="text-xs text-slate-400">Personal work, team responsibilities and company updates in one place.</p></div><button onClick={() => void load()} aria-label="Refresh dashboard"><RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`}/></button></header>
      <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">{actions.map(([view, title, description]) => <button key={view} onClick={() => setActiveView(view)} className="text-left bg-slate-900 border border-slate-800 hover:border-brand-500/50 rounded-2xl p-5"><strong>{title}</strong><p className="text-xs text-slate-500 mt-2">{description}</p></button>)}</section>
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><button onClick={() => setActiveView('approvals')} className="font-bold flex gap-2 mb-3"><CheckSquare className="w-4 text-brand-500"/>Assigned approvals <span className="neo-count">{approvals.length}</span></button>{approvals.length ? approvals.slice(0, 5).map(item => <div key={item.id} className="neo-list-row"><div><strong>{item.instance.title}</strong><small>{item.instance.module}</small></div></div>) : <EmptyState compact title="No assigned approvals" description="Your approval queue is clear." icon={CheckSquare}/>}</section>
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><button onClick={() => setActiveView('notifications')} className="font-bold flex gap-2 mb-3"><Bell className="w-4 text-brand-500"/>Unread notifications <span className="neo-count">{notifications.length}</span></button>{notifications.length ? notifications.slice(0, 5).map(item => <div key={item.id} className="neo-list-row"><div><strong>{item.title}</strong><small>{item.body}</small></div></div>) : <EmptyState compact title="You're all caught up" description="Unread alerts will appear here." icon={Bell}/>}</section>
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h2 className="font-bold mb-3">Announcements</h2>{operations?.announcements.length ? operations.announcements.slice(0, 5).map(item => <article key={item.id} className="neo-list-row"><div><strong>{item.title}</strong><small>{item.content}</small></div></article>) : <EmptyState compact title="No announcements" description="Company updates will appear here." icon={Bell}/>}</section>
      </div>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h2 className="font-bold flex gap-2 mb-3"><CalendarDays className="w-4"/>Upcoming holidays</h2>{upcomingHolidays.length ? upcomingHolidays.map(item => <div key={item.id} className="neo-list-row neo-list-row--split"><strong>{item.name}</strong><time>{new Date(item.date).toLocaleDateString()}</time></div>) : <EmptyState compact title="No upcoming holidays" description="Published company holidays will show here." icon={CalendarDays}/>}</section>
    </div>;
  }

  return <div className="neo-page neo-dashboard space-y-5">
    <header className="flex justify-between border-b border-slate-800 pb-4">
      <div>
        <h1 className="text-2xl font-bold">HR Command Dashboard</h1>
        <p className="text-xs text-slate-400">A live view of attendance punctuality, approvals, announcements and workforce operations.</p>
      </div>
      <button onClick={() => void load()} aria-label="Refresh dashboard"><RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`}/></button>
    </header>

    <section className="neo-metric-grid" aria-label="Workforce summary">
      {metricCards.map(({ key, label, icon: Icon, tone }) => (
        <button key={key} onClick={() => setActiveView('command-center')} className={`neo-metric-card neo-metric-card--${tone}`}>
          <span className="neo-metric-card__icon"><Icon/></span>
          <span>
            <small>{label}</small>
            <strong>{getMetricValue(key)}</strong>
          </span>
        </button>
      ))}
    </section>

    {/* Today's Attendance Punctuality & Breakdown Section */}
    <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-4">
      {/* Circle (Donut) Chart Card */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse"/>
                Today's Attendance Breakdown
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Work start: <span className="font-mono font-medium text-slate-300">{center?.workSchedule?.businessHoursStart || '10:00'}</span> · Late after: <span className="font-mono font-medium text-amber-300">{center?.workSchedule?.lateThresholdTime || '11:00'}</span>
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {presentTotal} / {activeCount} Present
            </span>
          </div>

          <div className="relative my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={chartDisplayData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={hasChartData ? 4 : 0}
                  stroke="#0f172a"
                  strokeWidth={3}
                >
                  {chartDisplayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0];
                      return (
                        <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 text-xs shadow-xl backdrop-blur">
                          <span className="font-semibold text-slate-200">{item.name}</span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.payload.color }} />
                            <span className="font-mono font-bold text-white">{item.value} employees</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold tracking-tight text-white">{hasChartData ? `${attendanceRate}%` : '0%'}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Attendance</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"/> On-time
            </div>
            <div className="text-base font-bold text-emerald-300 mt-0.5">{onTimeCount}</div>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-2 text-center">
            <div className="text-[10px] uppercase font-bold text-amber-400 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block"/> Late
            </div>
            <div className="text-base font-bold text-amber-300 mt-0.5">{lateCount}</div>
          </div>
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2 text-center">
            <div className="text-[10px] uppercase font-bold text-rose-400 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 inline-block"/> Absent
            </div>
            <div className="text-base font-bold text-rose-300 mt-0.5">{absentCount}</div>
          </div>
        </div>
      </section>

      {/* Late Entries Today Panel */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400"/>
              <h2 className="font-bold text-sm text-slate-100">Late Entries Today</h2>
              {lateCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {lateCount} {lateCount === 1 ? 'employee' : 'employees'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              Cutoff: <span className="font-mono text-amber-300 font-semibold">{center?.workSchedule?.lateThresholdTime || '11:00'}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {center?.lateEntries && center.lateEntries.length > 0 ? (
              center.lateEntries.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-amber-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-xs text-amber-300 flex-none">
                      {item.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <strong className="text-xs text-slate-200 block">{item.employeeName}</strong>
                      <span className="text-[10px] text-slate-400">{item.employeeCode} · {item.department}</span>
                    </div>
                  </div>
                  <div className="text-right flex-none">
                    <div className="font-mono text-xs font-semibold text-amber-300">{item.clockInFormatted}</div>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/20">
                      +{item.lateMinutes}m late
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                compact
                title="No late entries today"
                description={`All present employees clocked in before ${center?.workSchedule?.lateThresholdTime || '11:00'}.`}
                icon={CheckCircle2}
              />
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Work start time: <b className="text-slate-300 font-mono">{center?.workSchedule?.businessHoursStart || '10:00'}</b></span>
          <button onClick={() => setActiveView('attendance')} className="text-brand-400 hover:text-brand-300 text-xs font-semibold">
            View All Attendance →
          </button>
        </div>
      </section>
    </div>

    <div className="grid lg:grid-cols-3 gap-4">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h2 className="font-bold flex gap-2 mb-3"><AlertTriangle className="w-4 text-amber-500"/>Action signals</h2>{center?.alerts.length ? center.alerts.map((item) => <div key={item.key} className="neo-list-row"><span className={`neo-status-dot neo-status-dot--${item.severity.toLowerCase()}`}/><div><strong>{item.message}</strong><small>{item.severity} · {item.count} affected</small></div></div>) : <EmptyState compact title="No action required" description="Important workforce exceptions will appear here." icon={AlertTriangle}/>}</section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><button onClick={() => setActiveView('approvals')} className="font-bold flex gap-2 mb-3"><CheckSquare className="w-4 text-brand-500"/>Pending approvals <span className="neo-count">{approvals.length}</span></button>{approvals.length ? approvals.slice(0, 6).map((item) => <div key={item.id} className="neo-list-row"><div><strong>{item.instance.title}</strong><small>{item.instance.module}</small></div></div>) : <EmptyState compact title="Approval queue is clear" description="New requests assigned to you will be listed here." icon={CheckSquare}/>}</section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><button onClick={() => setActiveView('notifications')} className="font-bold flex gap-2 mb-3"><Bell className="w-4 text-brand-500"/>Unread notifications <span className="neo-count">{notifications.length}</span></button>{notifications.length ? notifications.slice(0, 6).map((item) => <div key={item.id} className="neo-list-row"><div><strong>{item.title}</strong><small>{item.body}</small></div></div>) : <EmptyState compact title="You're all caught up" description="Unread alerts and reminders will appear here." icon={Bell}/>}</section>
    </div>
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h2 className="font-bold mb-3">Announcements</h2>{operations?.announcements.length ? operations.announcements.slice(0, 5).map((item) => <article key={item.id} className="neo-list-row"><div><strong>{item.title}</strong><small>{item.content}</small></div></article>) : <EmptyState compact title="No announcements" description="Company-wide updates will appear in this space." icon={Bell}/>}</section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4"><h2 className="font-bold flex gap-2 mb-3"><CalendarDays className="w-4"/>Upcoming holidays</h2>{upcomingHolidays.length ? upcomingHolidays.map((item) => <div key={item.id} className="neo-list-row neo-list-row--split"><strong>{item.name}</strong><time>{new Date(item.date).toLocaleDateString()}</time></div>) : <EmptyState compact title="No upcoming holidays" description="Published company holidays will show here." icon={CalendarDays}/>}</section>
    </div>
  </div>;
};
