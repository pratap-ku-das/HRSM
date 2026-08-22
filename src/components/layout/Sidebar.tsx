import React from 'react';
import { 
  LayoutDashboard, Users, GitBranch, CalendarCheck, CalendarDays, 
  CreditCard, Briefcase, Target, Laptop, FileText, 
  Megaphone, Receipt, ShieldCheck, Settings, Sparkles, ChevronRight
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  isCollapsed,
  setIsCollapsed,
}) => {
  const { currentCompany, currentUser } = useAuth();

  const pendingLeaves = storageService.getLeaveRequests(currentCompany?.id).filter(r => r.status === 'PENDING').length;
  const openJobs = storageService.getJobPostings(currentCompany?.id).filter(j => j.status === 'OPEN').length;
  const pendingExpenses = storageService.getExpenses(currentCompany?.id).filter(e => e.status === 'PENDING').length;

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      section: 'OVERVIEW'
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: Users,
      badge: null,
      section: 'WORKFORCE'
    },
    {
      id: 'departments',
      label: 'Departments',
      icon: GitBranch,
      badge: null,
      section: 'WORKFORCE'
    },
    {
      id: 'attendance',
      label: 'Attendance Matrix',
      icon: CalendarCheck,
      badge: 'Phase 6 Ready',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      section: 'TIME & ATTENDANCE'
    },
    {
      id: 'leaves',
      label: 'Leave Management',
      icon: CalendarDays,
      badge: pendingLeaves > 0 ? `${pendingLeaves}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      section: 'TIME & ATTENDANCE'
    },
    {
      id: 'payroll',
      label: 'Payroll & Payslips',
      icon: CreditCard,
      badge: null,
      section: 'COMPENSATION'
    },
    {
      id: 'expenses',
      label: 'Expense Claims',
      icon: Receipt,
      badge: pendingExpenses > 0 ? `${pendingExpenses}` : null,
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      section: 'COMPENSATION'
    },
    {
      id: 'recruitment',
      label: 'Recruitment & ATS',
      icon: Briefcase,
      badge: openJobs > 0 ? `${openJobs} Open` : null,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      section: 'TALENT'
    },
    {
      id: 'performance',
      label: 'Performance & OKRs',
      icon: Target,
      badge: null,
      section: 'TALENT'
    },
    {
      id: 'assets',
      label: 'Assets & Hardware',
      icon: Laptop,
      badge: null,
      section: 'ORGANIZATION'
    },
    {
      id: 'documents',
      label: 'Documents Vault',
      icon: FileText,
      badge: null,
      section: 'ORGANIZATION'
    },
    {
      id: 'holidays',
      label: 'Holidays & Broadcasts',
      icon: Megaphone,
      badge: null,
      section: 'ORGANIZATION'
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: ShieldCheck,
      badge: null,
      section: 'SECURITY & SYSTEM'
    },
    {
      id: 'settings',
      label: 'Workspace Settings',
      icon: Settings,
      badge: null,
      section: 'SECURITY & SYSTEM'
    },
  ];

  const sections = Array.from(new Set(navItems.map(item => item.section)));

  return (
    <aside 
      className={`h-[calc(100vh-4rem)] sticky top-16 border-r border-slate-800 bg-slate-900/95 flex flex-col justify-between transition-all duration-300 z-20 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map(section => {
          const items = navItems.filter(i => i.section === section);
          return (
            <div key={section} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                  {section}
                </div>
              )}
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center ${
                      isCollapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2'
                    } rounded-xl text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/20 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                      }`} />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </div>

                    {!isCollapsed && item.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono font-medium ${
                        item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer / Mobile App Preview Card */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800 bg-slate-900/60">
          <div 
            onClick={() => setActiveView('attendance')}
            className="p-3 rounded-xl bg-gradient-to-br from-slate-800/80 to-brand-950/40 border border-brand-500/20 hover:border-brand-500/40 cursor-pointer transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-brand-400 font-semibold text-[11px]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Phase 6 Architecture</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-400 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-[11px] text-slate-300 mt-1 leading-snug">
              Mobile Face-Auth & Attendance API ready.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};
