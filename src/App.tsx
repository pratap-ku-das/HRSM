import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { CommandPalette } from './components/layout/CommandPalette';

// Public Pages
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterCompanyPage } from './pages/public/RegisterCompanyPage';
import { ActivateAccountPage } from './pages/public/ActivateAccountPage';
import { ResetPasswordPage } from './pages/public/ResetPasswordPage';

// Authenticated HRMS Portal Pages
import { DashboardOverview } from './pages/dashboard/DashboardOverview';
import { EmployeeDirectory } from './pages/employees/EmployeeDirectory';
import { DepartmentsPage } from './pages/departments/DepartmentsPage';
import { AttendancePage } from './pages/attendance/AttendancePage';
import { LeaveManagementPage } from './pages/leaves/LeaveManagementPage';
import { RecruitmentPage } from './pages/recruitment/RecruitmentPage';
import { PerformanceEnginePage } from './pages/performance/PerformanceEnginePage';
import { AssetsPage } from './pages/assets/AssetsPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { HolidaysPage } from './pages/holidays/HolidaysPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { AuditLogsPage } from './pages/audit/AuditLogsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { FoundationAdminPage } from './pages/settings/FoundationAdminPage';
import { ApprovalInboxPage } from './pages/approvals/ApprovalInboxPage';
import { WorkflowBuilderPage } from './pages/settings/WorkflowBuilderPage';
import { AttendancePolicyPage } from './pages/attendance/AttendancePolicyPage';
import { MyAttendanceRequestsPage } from './pages/attendance/MyAttendanceRequestsPage';
import { PayrollEnginePage } from './pages/payroll/PayrollEnginePage';
import { WorkforceCommandCenterPage } from './pages/employees/WorkforceCommandCenterPage';
import { NotificationCenterPage } from './pages/settings/NotificationCenterPage';
import { GovernanceCenterPage } from './pages/governance/GovernanceCenterPage';
import { SecurityCenterPage } from './pages/security/SecurityCenterPage';
import { EmployeeSelfServicePage } from './pages/self-service/EmployeeSelfServicePage';
import { canAccessView } from './config/workspaceAccess';

const MainApp: React.FC = () => {
  const { isAuthenticated, isRestoringSession, currentUser } = useAuth();
  
  // Page mode: 'public_landing' | 'public_login' | 'public_register' | 'authenticated'
  const [pageMode, setPageMode] = useState<'public_landing' | 'public_login' | 'public_register' | 'authenticated'>('authenticated');
  const [activeView, setActiveView] = useState<string>(() => localStorage.getItem('orbithr_active_view') || 'dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const workspaceRef = useRef<HTMLElement>(null);

  // Global keyboard listener for Ctrl+K or Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useLayoutEffect(() => {
    localStorage.setItem('orbithr_active_view', activeView);
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }, [activeView]);

  useEffect(() => {
    const handleSessionExpiry = () => setPageMode('public_login');
    window.addEventListener('orbithr:session-expired', handleSessionExpiry);
    return () => window.removeEventListener('orbithr:session-expired', handleSessionExpiry);
  }, []);

  if (window.location.pathname === '/activate') {
    return <ActivateAccountPage onNavigateToLogin={() => { window.history.replaceState({}, '', '/'); setPageMode('public_login'); }} />;
  }

  if (window.location.pathname === '/reset-password') {
    return <ResetPasswordPage onNavigateToLogin={() => { window.history.replaceState({}, '', '/'); setPageMode('public_login'); }} />;
  }

  if (isRestoringSession) {
    return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-center"><div className="mx-auto h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" /><p className="mt-4 text-sm text-slate-400">Restoring your OrbitHR workspace…</p></div>
    </main>;
  }

  // If user is not authenticated and in app mode, render landing page
  if (!isAuthenticated && pageMode === 'authenticated') {
    return (
      <LandingPage
        onNavigateToLogin={() => setPageMode('public_login')}
        onNavigateToRegister={() => setPageMode('public_register')}
        onNavigateToApp={() => setPageMode('authenticated')}
      />
    );
  }

  if (pageMode === 'public_landing') {
    return (
      <LandingPage
        onNavigateToLogin={() => setPageMode('public_login')}
        onNavigateToRegister={() => setPageMode('public_register')}
        onNavigateToApp={() => setPageMode('authenticated')}
      />
    );
  }

  if (pageMode === 'public_login') {
    return (
      <LoginPage
        onNavigateToRegister={() => setPageMode('public_register')}
        onNavigateToLanding={() => setPageMode('public_landing')}
        onLoginSuccess={() => setPageMode('authenticated')}
      />
    );
  }

  if (pageMode === 'public_register') {
    return (
      <RegisterCompanyPage
        onNavigateToLogin={() => setPageMode('public_login')}
        onNavigateToLanding={() => setPageMode('public_landing')}
        onRegistrationComplete={() => {
          setPageMode('authenticated');
          setActiveView('dashboard');
        }}
      />
    );
  }

  // Render HRMS Authenticated Workspace
  const renderActiveView = () => {
    const authorizedView = canAccessView(currentUser, activeView) ? activeView : 'dashboard';
    switch (authorizedView) {
      case 'dashboard':
        return <DashboardOverview setActiveView={setActiveView} />;
      case 'my-attendance':
        return <EmployeeSelfServicePage section="attendance" />;
      case 'my-leave':
        return <EmployeeSelfServicePage section="leave" />;
      case 'my-pay':
        return <EmployeeSelfServicePage section="pay" />;
      case 'my-expenses':
        return <EmployeeSelfServicePage section="expenses" />;      case 'employees':
        return <EmployeeDirectory />;
      case 'command-center':
        return <WorkforceCommandCenterPage />;
      case 'departments':
        return <DepartmentsPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'leaves':
        return <LeaveManagementPage />;
      case 'payroll':
        return <PayrollEnginePage />;
      case 'recruitment':
        return <RecruitmentPage />;
      case 'performance':
        return <PerformanceEnginePage />;
      case 'assets':
        return <AssetsPage />;
      case 'documents':
        return <DocumentsPage />;
      case 'holidays':
        return <HolidaysPage />;
      case 'expenses':
        return <ExpensesPage />;
      case 'audit':
        return <AuditLogsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'notifications':
        return <NotificationCenterPage />;
      case 'foundation':
        return <FoundationAdminPage />;
      case 'governance':
        return <GovernanceCenterPage />;
      case 'security-center':
        return <SecurityCenterPage />;
      case 'approvals':
        return <ApprovalInboxPage />;
      case 'workflows':
        return <WorkflowBuilderPage />;
      case 'attendance-policy':
        return <AttendancePolicyPage />;
      case 'attendance-requests':
        return <MyAttendanceRequestsPage />;
      default:
        return <DashboardOverview setActiveView={setActiveView} />;
    }
  };

  return (
    <div className="app-shell h-screen overflow-hidden bg-slate-950 text-slate-100 flex font-sans selection:bg-brand-500 selection:text-white">
      {/* Full-height sidebar */}
      <div className="h-full flex-none">
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* Header and workspace content */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <Navbar
          onOpenRoleSwitcher={() => undefined}
          onNavigateToPublic={() => setPageMode('public_landing')}
          activeView={activeView}
          setActiveView={setActiveView}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        {/* Dynamic Page Content */}
        <main ref={workspaceRef} className="app-workspace flex-1 overflow-y-auto relative">
          <div key={activeView} className="app-page-frame">
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Universal Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setActiveView={setActiveView}
        onOpenRoleSwitcher={() => undefined}
      />

    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
