import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { RoleSwitcherModal } from './components/layout/RoleSwitcherModal';
import { CommandPalette } from './components/layout/CommandPalette';

// Public Pages
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterCompanyPage } from './pages/public/RegisterCompanyPage';

// Authenticated HRMS Portal Pages
import { DashboardOverview } from './pages/dashboard/DashboardOverview';
import { EmployeeDirectory } from './pages/employees/EmployeeDirectory';
import { DepartmentsPage } from './pages/departments/DepartmentsPage';
import { AttendancePage } from './pages/attendance/AttendancePage';
import { LeaveManagementPage } from './pages/leaves/LeaveManagementPage';
import { PayrollPage } from './pages/payroll/PayrollPage';
import { RecruitmentPage } from './pages/recruitment/RecruitmentPage';
import { PerformancePage } from './pages/performance/PerformancePage';
import { AssetsPage } from './pages/assets/AssetsPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { HolidaysPage } from './pages/holidays/HolidaysPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { AuditLogsPage } from './pages/audit/AuditLogsPage';
import { SettingsPage } from './pages/settings/SettingsPage';

const MainApp: React.FC = () => {
  const { isAuthenticated } = useAuth();
  
  // Page mode: 'public_landing' | 'public_login' | 'public_register' | 'authenticated'
  const [pageMode, setPageMode] = useState<'public_landing' | 'public_login' | 'public_register' | 'authenticated'>('authenticated');
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

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
    switch (activeView) {
      case 'dashboard':
        return <DashboardOverview setActiveView={setActiveView} />;
      case 'employees':
        return <EmployeeDirectory />;
      case 'departments':
        return <DepartmentsPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'leaves':
        return <LeaveManagementPage />;
      case 'payroll':
        return <PayrollPage />;
      case 'recruitment':
        return <RecruitmentPage />;
      case 'performance':
        return <PerformancePage />;
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
          onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
          onNavigateToPublic={() => setPageMode('public_landing')}
          activeView={activeView}
          setActiveView={setActiveView}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        {/* Dynamic Page Content */}
        <main className="app-workspace flex-1 overflow-y-auto relative">
          <div className="app-page-frame">
            {renderActiveView()}
          </div>
        </main>
      </div>

      {/* Universal Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        setActiveView={setActiveView}
        onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
      />

      {/* Instant Demo Role Switcher Modal */}
      <RoleSwitcherModal
        isOpen={isRoleSwitcherOpen}
        onClose={() => setIsRoleSwitcherOpen(false)}
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
