import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, ChevronDown, Bell, Search, Shield, User as UserIcon, 
  LogOut, Sparkles, Check, Globe
} from 'lucide-react';
import { storageService } from '../../services/storageService';

interface NavbarProps {
  onOpenRoleSwitcher: () => void;
  onNavigateToPublic: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenRoleSwitcher, 
  onNavigateToPublic,
  setActiveView 
}) => {
  const { currentUser, currentCompany, companies, switchCompany, logout } = useAuth();
  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const pendingLeaves = storageService.getLeaveRequests(currentCompany?.id).filter(r => r.status === 'PENDING').length;
  const announcements = storageService.getAnnouncements(currentCompany?.id).slice(0, 3);

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'COMPANY_ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'HR_MANAGER':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'DEPT_HEAD':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'EMPLOYEE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const formatRoleName = (role?: string) => {
    switch (role) {
      case 'COMPANY_ADMIN': return 'Company Admin';
      case 'HR_MANAGER': return 'HR Director';
      case 'DEPT_HEAD': return 'Department Lead';
      case 'EMPLOYEE': return 'Employee';
      case 'SUPER_ADMIN': return 'Super Admin';
      default: return role || 'User';
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 md:px-6 flex items-center justify-between">
      {/* Left: Company Workspace Selector */}
      <div className="flex items-center space-x-3">
        <div className="relative">
          <button
            onClick={() => setShowCompanyMenu(!showCompanyMenu)}
            className="flex items-center space-x-3 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              {currentCompany?.name.charAt(0) || 'H'}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold text-slate-200 group-hover:text-white flex items-center space-x-1.5">
                <span>{currentCompany?.name || 'Workspace'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {currentCompany?.plan || 'PRO'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {currentCompany?.slug || 'workspace'}.hrms.io
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCompanyMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Company Switcher Dropdown */}
          {showCompanyMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCompanyMenu(false)} />
              <div className="absolute left-0 mt-2 w-64 rounded-xl glass-dropdown z-50 p-2 py-2 border border-slate-700/80 shadow-2xl animate-fade-in">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Switch Workspace
                </div>
                {companies.map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => {
                      switchCompany(comp.id);
                      setShowCompanyMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all ${
                      comp.id === currentCompany?.id
                        ? 'bg-brand-500/20 text-brand-200 font-medium'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                        {comp.name.charAt(0)}
                      </div>
                      <span className="truncate">{comp.name}</span>
                    </div>
                    {comp.id === currentCompany?.id && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                  </button>
                ))}
                <div className="border-t border-slate-800 my-1 pt-1">
                  <button
                    onClick={() => {
                      setShowCompanyMenu(false);
                      onNavigateToPublic();
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-400 hover:text-brand-300 hover:bg-slate-800/50 rounded-lg transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Register New Company</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Global Public Website Link */}
        <button
          onClick={onNavigateToPublic}
          className="hidden md:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700"
          title="Visit Public Website & Marketing Landing Page"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Public Site</span>
        </button>
      </div>

      {/* Center Search Input */}
      <div className="hidden lg:flex items-center flex-1 max-w-md mx-6">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Quick search employees, departments, policies..."
            className="w-full bg-slate-800/60 border border-slate-700/60 focus:border-brand-500 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setActiveView('employees');
              }
            }}
          />
          <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700">
            /
          </kbd>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {/* Quick Demo Role Switcher CTA */}
        <button
          onClick={onOpenRoleSwitcher}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-500/20 to-purple-500/20 hover:from-brand-500/30 hover:to-purple-500/30 border border-brand-500/30 text-xs font-medium text-brand-200 shadow-sm transition-all animate-pulse-subtle"
          title="Switch between Admin, HR Manager, Lead, and Employee roles"
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden sm:inline">Role Switcher</span>
        </button>

        {/* Notifications Tray */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all border border-slate-700/40"
          >
            <Bell className="w-4 h-4" />
            {pendingLeaves > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
            {pendingLeaves > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 rounded-2xl glass-dropdown z-50 p-4 border border-slate-700/80 shadow-2xl animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Notifications</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-semibold">
                    {pendingLeaves} Action Required
                  </span>
                </div>

                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {pendingLeaves > 0 && (
                    <div 
                      onClick={() => {
                        setActiveView('leaves');
                        setShowNotifications(false);
                      }}
                      className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 cursor-pointer transition-all"
                    >
                      <div className="text-xs font-semibold text-amber-300">Pending Leave Approvals</div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {pendingLeaves} employee leave request{pendingLeaves > 1 ? 's' : ''} awaiting review.
                      </p>
                    </div>
                  )}

                  {announcements.map((anc) => (
                    <div 
                      key={anc.id}
                      onClick={() => {
                        setActiveView('holidays');
                        setShowNotifications(false);
                      }}
                      className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:bg-slate-800 cursor-pointer transition-all"
                    >
                      <div className="text-xs font-semibold text-slate-200 truncate">{anc.title}</div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{anc.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Profile Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2.5 p-1.5 pr-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all text-left"
          >
            <img
              src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
              alt={currentUser?.fullName || 'User'}
              className="w-7 h-7 rounded-lg object-cover border border-slate-600"
            />
            <div className="hidden md:block">
              <div className="text-xs font-semibold text-slate-200 leading-tight">
                {currentUser?.fullName || 'User'}
              </div>
              <div className="flex items-center space-x-1 mt-0.5">
                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-medium ${getRoleBadgeColor(currentUser?.role)}`}>
                  {formatRoleName(currentUser?.role)}
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 rounded-xl glass-dropdown z-50 p-2 border border-slate-700/80 shadow-2xl animate-fade-in">
                <div className="px-3 py-2 border-b border-slate-800">
                  <div className="text-xs font-bold text-slate-200">{currentUser?.fullName}</div>
                  <div className="text-[11px] text-slate-400 truncate">{currentUser?.email}</div>
                  <div className="mt-1.5 inline-block">
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${getRoleBadgeColor(currentUser?.role)}`}>
                      {formatRoleName(currentUser?.role)}
                    </span>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setActiveView('employees');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveView('settings');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all"
                  >
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>Workspace Settings</span>
                  </button>

                  <div className="border-t border-slate-800 my-1"></div>

                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                      onNavigateToPublic();
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
