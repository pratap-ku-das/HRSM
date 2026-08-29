import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  ChevronDown, Bell, Search, Shield, User as UserIcon, 
  LogOut, Sparkles, Globe, Clock, CheckCircle2, AlertCircle, 
  Moon, Sun, Laptop, ArrowRight, X, Megaphone, CalendarCheck, Menu
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import { useToast } from '../../context/ToastContext';

interface NavbarProps {
  onOpenRoleSwitcher: () => void;
  onNavigateToPublic: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  onOpenCommandPalette?: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenRoleSwitcher, 
  onNavigateToPublic,
  setActiveView,
  onOpenCommandPalette,
  onToggleMobileSidebar,
}) => {
  const { currentUser, currentCompany, logout } = useAuth();
  const toast = useToast();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'all' | 'approvals' | 'broadcasts'>('all');

  // Clock in/out tracking state
  const [isClockedIn, setIsClockedIn] = useState<boolean>(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const employees = storageService.getEmployees(currentCompany?.id);
  const myEmployee = employees.find(e => e.email === currentUser?.email) || employees[0];
  const pendingLeaves = storageService.getLeaveRequests(currentCompany?.id).filter(r => r.status === 'PENDING');
  const announcements = storageService.getAnnouncements(currentCompany?.id);
  const leaveTypes = storageService.getLeaveTypes(currentCompany?.id);

  // Check today's attendance status
  useEffect(() => {
    if (!myEmployee) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const records = storageService.getAttendanceRecords(currentCompany?.id);
    const todayRecord = records.find(r => r.employeeId === myEmployee.id && r.date === todayStr);

    if (todayRecord && todayRecord.clockInTime && !todayRecord.clockOutTime) {
      setIsClockedIn(true);
      setClockInTime(todayRecord.clockInTime);
    } else {
      setIsClockedIn(false);
      setClockInTime(null);
    }
  }, [currentCompany?.id, myEmployee]);

  // Live Timer for clocked in duration
  useEffect(() => {
    let interval: any;
    if (isClockedIn) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn]);

  const formatElapsed = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleClock = () => {
    if (!myEmployee) {
      toast.error('No employee profile found for this user account');
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const records = storageService.getAttendanceRecords(currentCompany?.id);
    const existing = records.find(r => r.employeeId === myEmployee.id && r.date === todayStr);
    const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const nowIso = new Date().toISOString();

    if (!isClockedIn) {
      // Clock In
      const attendanceTimestamp = new Date().toISOString();
      storageService.saveAttendanceRecord({
        id: existing?.id || 'att_' + Math.random().toString(36).substring(2, 9),
        companyId: currentCompany?.id || '',
        employeeId: myEmployee.id,
        date: todayStr,
        clockInTime: nowTime,
        status: 'PRESENT',
        faceAuthVerified: true,
        source: 'MOBILE_FACE',
        deviceId: 'DEV-SIMULATED-BROWSER-V2',
        createdAt: existing?.createdAt || attendanceTimestamp,
        updatedAt: attendanceTimestamp,
      });

      storageService.logAudit({
        companyId: currentCompany?.id || '',
        userId: currentUser?.id || '',
        userName: currentUser?.fullName || 'Employee',
        userRole: currentUser?.role || 'EMPLOYEE',
        action: 'ATTENDANCE_CLOCK_IN',
        category: 'ATTENDANCE',
        details: `Clocked In at ${nowTime} with simulated face-auth.`,
        timestamp: nowIso,
        ipAddress: '127.0.0.1 (Local)',
      });

      setIsClockedIn(true);
      setClockInTime(nowTime);
      toast.success(`Clocked In successfully at ${nowTime}! (Simulated Face-Auth Verified)`);
    } else {
      // Clock Out
      if (existing) {
        storageService.saveAttendanceRecord({
          ...existing,
          clockOutTime: nowTime,
        });
      }

      storageService.logAudit({
        companyId: currentCompany?.id || '',
        userId: currentUser?.id || '',
        userName: currentUser?.fullName || 'Employee',
        userRole: currentUser?.role || 'EMPLOYEE',
        action: 'ATTENDANCE_CLOCK_OUT',
        category: 'ATTENDANCE',
        details: `Clocked Out at ${nowTime}.`,
        timestamp: nowIso,
        ipAddress: '127.0.0.1 (Local)',
      });

      setIsClockedIn(false);
      setClockInTime(null);
      toast.info(`Clocked Out successfully at ${nowTime}. Total active session recorded.`);
    }
  };

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
    <header className="app-navbar h-16 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-2xl sticky top-0 z-30 px-3 sm:px-5 md:px-6 flex items-center justify-between">
      {/* Left: Mobile Drawer Trigger + Product Brand */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 border border-slate-700/60"
            aria-label="Toggle navigation drawer"
          >
            <Menu className="w-5 h-5 text-brand-400" />
          </button>
        )}

      </div>

      {/* Center: Global Command Search Trigger (Responsive) */}
      <div className="flex-1 max-w-md mx-2 sm:mx-4 hidden md:block">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 transition-all text-xs group shadow-inner"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-400 transition-colors" />
            <span className="font-medium text-[11px]">Omnisearch commands or staff...</span>
          </div>
          <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-700 rounded-md">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right Action Icons & User Profile */}
      <div className="flex items-center space-x-1.5 sm:space-x-2.5">
        {/* Mobile Search Icon */}
        <button
          onClick={onOpenCommandPalette}
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 border border-slate-700/60"
          title="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Live Attendance Clock-In Widget */}
        <div className="flex items-center">
          <button
            onClick={handleToggleClock}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              isClockedIn
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            title={isClockedIn ? 'Click to Clock Out' : 'Click to Clock In'}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${isClockedIn ? 'bg-emerald-400 pulse-dot' : 'bg-slate-500'}`} />
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono text-[11px] hidden xs:inline">
              {isClockedIn ? formatElapsed(elapsedSeconds) : 'Clock In'}
            </span>
          </button>
        </div>

        {/* Demo Persona Switcher Tag */}
        <button
          onClick={onOpenRoleSwitcher}
          className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-all hover:scale-105 ${getRoleBadgeColor(currentUser?.role)}`}
          title="Switch Demo Persona"
        >
          <Sparkles className="w-3 h-3" />
          <span>{formatRoleName(currentUser?.role)}</span>
        </button>

        {/* Notifications Drawer Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all"
            title="Notifications & Approvals"
          >
            <Bell className="w-4 h-4" />
            {pendingLeaves.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-slate-900">
                {pendingLeaves.length}
              </span>
            )}
          </button>

          {/* Notifications Flyout */}
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-dropdown z-50 p-4 border border-slate-700/80 shadow-2xl animate-slide-down">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Bell className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-bold text-white">Notifications & Alerts</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300">
                    {pendingLeaves.length} Action Items
                  </span>
                </div>

                {/* Tabs */}
                <div className="flex items-center space-x-1 pt-3 pb-2 text-[11px] font-medium">
                  <button
                    onClick={() => setNotificationTab('all')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      notificationTab === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({pendingLeaves.length + announcements.length})
                  </button>
                  <button
                    onClick={() => setNotificationTab('approvals')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      notificationTab === 'approvals' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Approvals ({pendingLeaves.length})
                  </button>
                  <button
                    onClick={() => setNotificationTab('broadcasts')}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      notificationTab === 'broadcasts' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Broadcasts ({announcements.length})
                  </button>
                </div>

                {/* Notification Items */}
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {pendingLeaves.map(leave => {
                    const emp = employees.find(e => e.id === leave.employeeId);
                    const lType = leaveTypes.find(t => t.id === leave.leaveTypeId);
                    return (
                      <div key={leave.id} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-white truncate">
                            {emp ? `${emp.firstName} ${emp.lastName}` : 'Employee'}
                          </span>
                          <span className="text-amber-400 font-mono">{leave.totalDays} Days</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Requested {lType?.name || 'Leave'}: {leave.startDate} to {leave.endDate}
                        </p>
                        <div className="mt-2 flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setActiveView('leaves');
                              setShowNotifications(false);
                            }}
                            className="text-[10px] font-bold text-brand-400 hover:text-brand-300 flex items-center space-x-1"
                          >
                            <span>Review in Leave Manager</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {announcements.map(a => (
                    <div key={a.id} className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 text-xs">
                      <div className="flex items-center space-x-1.5 text-blue-400 font-semibold text-[11px]">
                        <Megaphone className="w-3 h-3 shrink-0" />
                        <span className="truncate">{a.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{a.content}</p>
                    </div>
                  ))}

                  {pendingLeaves.length === 0 && announcements.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1 opacity-80" />
                      <div>All caught up! No pending approvals.</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Profile Avatar Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 p-1 pl-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-all"
          >
            <img
              src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
              alt={currentUser?.fullName}
              className="w-7 h-7 rounded-lg object-cover border border-slate-700 shrink-0"
            />
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 mt-2 w-56 rounded-2xl glass-dropdown z-50 p-2 border border-slate-700/80 shadow-2xl animate-slide-down text-xs">
                <div className="px-3 py-2 border-b border-slate-800">
                  <div className="font-bold text-white truncate">{currentUser?.fullName}</div>
                  <div className="text-[10px] text-slate-400 font-mono truncate">{currentUser?.email}</div>
                  <span className={`inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-semibold border ${getRoleBadgeColor(currentUser?.role)}`}>
                    {formatRoleName(currentUser?.role)}
                  </span>
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    onClick={() => {
                      onOpenRoleSwitcher();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                    <span>Switch Demo Persona</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveView('settings');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>Workspace Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      onNavigateToPublic();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
                  >
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span>View Public Landing</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-800">
                  <button
                    onClick={() => {
                      logout();
                      onNavigateToPublic();
                      setShowUserMenu(false);
                      toast.info('Logged out from workspace.');
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-all font-semibold"
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
