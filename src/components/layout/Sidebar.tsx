import React from 'react';
import { 
  LayoutDashboard, Users, GitBranch, CalendarCheck, CalendarDays, 
  CreditCard, Briefcase, Target, Laptop, FileText, 
  Megaphone, Receipt, ShieldCheck, Settings, Sparkles, ChevronRight,
  PanelLeftClose, PanelLeftOpen, X
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { currentCompany } = useAuth();

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
      badge: 'Face-Auth',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      section: 'TIME & ATTENDANCE'
    },
    {
      id: 'leaves',
      label: 'Leave Approvals',
      icon: CalendarDays,
      badge: pendingLeaves > 0 ? `${pendingLeaves}` : null,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30 font-bold',
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
      badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30 font-bold',
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
      label: 'Audit Trail (SOC-2)',
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

  const handleNavClick = (id: string) => {
    setActiveView(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      {/* Workspace Header & Collapse Toggle */}
      <div className="sidebar-heading h-[72px] px-4 border-b border-slate-800/60 flex items-center justify-between">
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="text-[9px] font-extrabold text-brand-500 tracking-[0.14em] uppercase">
              Main workspace
            </div>
            <div className="mt-1 text-sm font-extrabold text-slate-900 truncate">
              People operations
            </div>
          </div>
        )}
        <div className="flex items-center space-x-1">
          {/* Desktop collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden md:block p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-brand-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5 text-brand-400" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <div className="sidebar-nav flex-1 min-h-0 overflow-y-auto py-4 px-3 space-y-5">
        {sections.map(section => {
          const sectionItems = navItems.filter(item => item.section === section);
          return (
            <div key={section} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 text-[9px] font-extrabold text-slate-400 uppercase tracking-[0.12em] mb-2">
                  {section}
                </div>
              )}
              <div className="space-y-0.5">
                {sectionItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      className={`sidebar-link w-full min-h-11 flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                        isActive
                          ? 'bg-gradient-to-r from-brand-500/20 to-indigo-600/10 text-brand-300 border border-brand-500/30 shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-300'
                        }`} />
                        {!isCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </div>

                      {!isCollapsed && item.badge && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      {!isCollapsed && (
        <div className="sidebar-footer p-3 border-t border-slate-800/60">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px]">
            <div className="flex items-center space-x-2 truncate">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 grid place-items-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0">
                <strong className="block text-[10px] text-slate-800 truncate">All systems healthy</strong>
                <small className="block text-[8px] text-slate-400 truncate">Workspace is synced</small>
              </span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot shrink-0" />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside 
        className={`app-sidebar hidden md:flex h-full flex-none border-r border-slate-800/80 bg-slate-900/90 backdrop-blur-xl flex-col justify-between overflow-hidden transition-all duration-300 z-20 select-none ${
          isCollapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Out Drawer Overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
            onClick={onCloseMobile}
          />
          {/* Slide-in sidebar panel */}
          <div className="relative w-72 max-w-[85vw] h-full bg-slate-900 border-r border-slate-800 shadow-2xl z-10 animate-slide-right flex flex-col">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
