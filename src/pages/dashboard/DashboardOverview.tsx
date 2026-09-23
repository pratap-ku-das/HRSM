import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, CalendarDays, CheckSquare, RefreshCw, UserCheck, UserMinus, Users } from 'lucide-react';
import { api } from '../../services/api';
import type { ApprovalInboxItem, CommandCenterData, OrbitNotification } from '../../types';
import { useToast } from '../../context/ToastContext';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { canAccessView, hasPermission, workspaceTitle } from '../../config/workspaceAccess';

const metricCards = [
  { key: 'activeEmployees', label: 'Active employees', icon: Users, tone: 'violet' },
  { key: 'presentToday', label: 'Present today', icon: UserCheck, tone: 'emerald' },
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
  }  return <div className="neo-page neo-dashboard">
    <header className="flex justify-between border-b border-slate-800 pb-4"><div><h1 className="text-2xl font-bold">HR Command Dashboard</h1><p className="text-xs text-slate-400">A live view of attendance, approvals, announcements and workforce operations.</p></div><button onClick={() => void load()} aria-label="Refresh dashboard"><RefreshCw className={`w-4 ${busy ? 'animate-spin' : ''}`}/></button></header>
    <section className="neo-metric-grid" aria-label="Workforce summary">{metricCards.map(({ key, label, icon: Icon, tone }) => <button key={key} onClick={() => setActiveView('command-center')} className={`neo-metric-card neo-metric-card--${tone}`}><span className="neo-metric-card__icon"><Icon/></span><span><small>{label}</small><strong>{center?.metrics[key] ?? 0}</strong></span></button>)}</section>
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
