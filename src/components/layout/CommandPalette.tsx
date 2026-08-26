import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, LayoutDashboard, Users, CalendarCheck, CalendarDays, 
  CreditCard, Briefcase, Target, ShieldCheck, Settings, 
  Plus, Clock, Laptop, FileText, Megaphone, Receipt, GitBranch,
  ArrowRight, UserCheck, Sparkles, Command
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveView: (view: string) => void;
  onOpenRoleSwitcher: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: 'NAVIGATION' | 'ACTIONS' | 'EMPLOYEES' | 'SECURITY';
  icon: any;
  action: () => void;
  subtitle?: string;
  badge?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  setActiveView,
  onOpenRoleSwitcher,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { currentCompany, currentUser } = useAuth();
  const toast = useToast();

  const employees = storageService.getEmployees(currentCompany?.id);
  const departments = storageService.getDepartments(currentCompany?.id);
  const designations = storageService.getDesignations(currentCompany?.id);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build commands list
  const baseCommands: CommandItem[] = [
    // Quick Actions
    {
      id: 'act-clock-in',
      title: 'Clock In / Out (Today)',
      category: 'ACTIONS',
      icon: Clock,
      subtitle: 'Record instant attendance punch',
      badge: 'Quick Action',
      action: () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const records = storageService.getAttendanceRecords(currentCompany?.id);
        const myEmp = employees.find(e => e.email === currentUser?.email) || employees[0];
        
        if (myEmp) {
          const existing = records.find(r => r.employeeId === myEmp.id && r.date === todayStr);
          const nowTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const nowIso = new Date().toISOString();
          
          if (!existing || !existing.clockInTime) {
            storageService.saveAttendanceRecord({
              id: existing?.id || 'att_' + Math.random().toString(36).substring(2, 9),
              companyId: currentCompany?.id || '',
              employeeId: myEmp.id,
              date: todayStr,
              clockInTime: nowTime,
              status: 'PRESENT',
              faceAuthVerified: true,
              source: 'MOBILE_FACE',
              createdAt: existing?.createdAt || nowIso,
              updatedAt: nowIso,
            });
            toast.success('Clocked In Successfully', `Checked in at ${nowTime} with Face Auth`);
          } else {
            storageService.saveAttendanceRecord({
              ...existing,
              clockOutTime: nowTime,
              updatedAt: nowIso,
            });
            toast.success('Clocked Out Successfully', `Checked out at ${nowTime}`);
          }
        }
        setActiveView('attendance');
        onClose();
      }
    },
    {
      id: 'act-add-employee',
      title: 'Add New Employee Profile',
      category: 'ACTIONS',
      icon: Plus,
      subtitle: 'Onboard new team member to workspace',
      action: () => {
        setActiveView('employees');
        onClose();
      }
    },
    {
      id: 'act-role-switcher',
      title: 'Switch Demo Role (Admin, HR, Lead, Employee)',
      category: 'ACTIONS',
      icon: Sparkles,
      subtitle: 'Simulate RBAC view permissions',
      badge: 'Demo Mode',
      action: () => {
        onClose();
        onOpenRoleSwitcher();
      }
    },

    // Navigation Items
    {
      id: 'nav-dashboard',
      title: 'Dashboard Overview',
      category: 'NAVIGATION',
      icon: LayoutDashboard,
      subtitle: 'Workforce stats, charts & pending items',
      action: () => { setActiveView('dashboard'); onClose(); }
    },
    {
      id: 'nav-employees',
      title: 'Employee Directory & Profiles',
      category: 'NAVIGATION',
      icon: Users,
      subtitle: `${employees.length} active team members`,
      action: () => { setActiveView('employees'); onClose(); }
    },
    {
      id: 'nav-departments',
      title: 'Departments & Org Hierarchy',
      category: 'NAVIGATION',
      icon: GitBranch,
      subtitle: `${departments.length} departments mapped`,
      action: () => { setActiveView('departments'); onClose(); }
    },
    {
      id: 'nav-attendance',
      title: 'Time & Attendance Matrix',
      category: 'NAVIGATION',
      icon: CalendarCheck,
      subtitle: 'Monthly attendance matrix & mobile logs',
      action: () => { setActiveView('attendance'); onClose(); }
    },
    {
      id: 'nav-leaves',
      title: 'Leave Approvals & Ledgers',
      category: 'NAVIGATION',
      icon: CalendarDays,
      subtitle: 'Leave requests and holiday policies',
      action: () => { setActiveView('leaves'); onClose(); }
    },
    {
      id: 'nav-payroll',
      title: 'Payroll, Allowances & Payslips',
      category: 'NAVIGATION',
      icon: CreditCard,
      subtitle: 'Salary disbursement & printable payslips',
      action: () => { setActiveView('payroll'); onClose(); }
    },
    {
      id: 'nav-recruitment',
      title: 'Recruitment ATS & Pipeline',
      category: 'NAVIGATION',
      icon: Briefcase,
      subtitle: 'Job openings and applicant pipeline',
      action: () => { setActiveView('recruitment'); onClose(); }
    },
    {
      id: 'nav-performance',
      title: 'Performance & OKR Appraisals',
      category: 'NAVIGATION',
      icon: Target,
      subtitle: 'Quarterly reviews & goal trackers',
      action: () => { setActiveView('performance'); onClose(); }
    },
    {
      id: 'nav-assets',
      title: 'Hardware & Assets Tracker',
      category: 'NAVIGATION',
      icon: Laptop,
      subtitle: 'Laptops, monitors & serial registry',
      action: () => { setActiveView('assets'); onClose(); }
    },
    {
      id: 'nav-documents',
      title: 'Documents Vault',
      category: 'NAVIGATION',
      icon: FileText,
      subtitle: 'Compliance documents & policies',
      action: () => { setActiveView('documents'); onClose(); }
    },
    {
      id: 'nav-holidays',
      title: 'Company Broadcasts & Holidays',
      category: 'NAVIGATION',
      icon: Megaphone,
      subtitle: 'Announcements & public holiday calendar',
      action: () => { setActiveView('holidays'); onClose(); }
    },
    {
      id: 'nav-expenses',
      title: 'Expense Reimbursements',
      category: 'NAVIGATION',
      icon: Receipt,
      subtitle: 'Pending receipts and payouts',
      action: () => { setActiveView('expenses'); onClose(); }
    },
    {
      id: 'nav-audit',
      title: 'Audit Trail & SOC-2 Logs',
      category: 'SECURITY',
      icon: ShieldCheck,
      subtitle: 'Tamper-evident activity logs',
      action: () => { setActiveView('audit'); onClose(); }
    },
    {
      id: 'nav-settings',
      title: 'Workspace Settings',
      category: 'SECURITY',
      icon: Settings,
      subtitle: 'Company policies, shifts & integrations',
      action: () => { setActiveView('settings'); onClose(); }
    },
  ];

  // Dynamic Employee search commands
  const employeeCommands: CommandItem[] = employees.map(emp => {
    const dept = departments.find(d => d.id === emp.departmentId);
    const desig = designations.find(d => d.id === emp.designationId);
    return {
      id: `emp-${emp.id}`,
      title: `${emp.firstName} ${emp.lastName}`,
      category: 'EMPLOYEES',
      icon: UserCheck,
      subtitle: `${desig?.title || 'Staff'} • ${emp.email}`,
      badge: dept?.name || 'Staff',
      action: () => {
        setActiveView('employees');
        onClose();
      }
    };
  });

  const allCommands = [...baseCommands, ...employeeCommands];

  const filteredCommands = allCommands.filter(cmd => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q)) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.badge && cmd.badge.toLowerCase().includes(q))
    );
  });

  // Handle keyboard shortcuts inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % (filteredCommands.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div 
        className="relative w-full max-w-2xl rounded-2xl glass-modal border border-white/10 shadow-2xl overflow-hidden animate-slide-down flex flex-col max-h-[80vh] z-10"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/60">
          <Search className="w-5 h-5 text-brand-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command, employee name, module or action..."
            className="flex-1 ml-3 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
          />
          <div className="flex items-center space-x-1">
            <kbd className="px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded-md">
              ESC
            </kbd>
          </div>
        </div>

        {/* Command list */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto text-slate-400/50 mb-2" />
              <p className="text-sm font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-slate-400 mt-1">Try searching for employees, attendance, leaves, or roles</p>
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-brand-600/30 to-indigo-600/30 border border-brand-500/40 text-white shadow-md'
                      : 'text-slate-300 hover:bg-slate-800/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`p-2 rounded-lg ${
                      isSelected 
                        ? 'bg-brand-500 text-white shadow-glow' 
                        : 'bg-slate-800/80 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-white truncate flex items-center space-x-2">
                        <span>{cmd.title}</span>
                        {cmd.badge && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                            {cmd.badge}
                          </span>
                        )}
                      </div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {cmd.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-slate-400 shrink-0 ml-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {cmd.category}
                    </span>
                    {isSelected && (
                      <ArrowRight className="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 rounded border border-slate-700">↑</kbd>
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 rounded border border-slate-700">↓</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 rounded border border-slate-700">↵</kbd>
              <span className="ml-1">Select</span>
            </span>
          </div>
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Command className="w-3 h-3 text-brand-400" />
            <span>OrbitHR Global Command Hub</span>
          </div>
        </div>
      </div>
    </div>
  );
};
