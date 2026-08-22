import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { RoleSwitcherModal } from './components/layout/RoleSwitcherModal';

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
  const { isAuthenticated, currentUser } = useAuth();
  
  // Page mode: 'public_landing' | 'public_login' | 'public_register' | 'authenticated'
  const [pageMode, setPageMode] = useState<'public_landing' | 'public_login' | 'public_register' | 'authenticated'>('authenticated');
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState<boolean>(false);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
        onNavigateToPublic={() => setPageMode('public_landing')}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950/80 relative">
          {renderActiveView()}
        </main>
      </div>

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
      <MainApp />
    </AuthProvider>
  );
}

export default App;
