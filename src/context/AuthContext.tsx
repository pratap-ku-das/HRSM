// @refresh reset
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Company, UserRole, CompanySettings } from '../types';
import { storageService } from '../services/storageService';
import { api } from '../services/api';

interface AuthContextType {
  currentUser: User | null;
  currentCompany: Company | null;
  companies: Company[];
  settings: CompanySettings | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<boolean>;
  loginAsDemoUser: (userId: string) => void;
  registerCompany: (companyData: Partial<Company>, adminData: Partial<User>, plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => Promise<void>;
  switchCompany: (companyId: string) => void;
  logout: () => void;
  refreshState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeIndianSettings = (value: CompanySettings | null): CompanySettings | null => value ? {
  ...value,
  currency: 'INR',
  currencySymbol: '₹',
  timezone: 'Asia/Kolkata (IST - UTC+5:30)',
} : null;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const refreshState = async () => {
    storageService.init();

    try {
      // Fetch live companies from PostgreSQL backend
      const liveCompanies = await api.getCompanies().catch(() => storageService.getCompanies());
      setCompanies(liveCompanies);

      const storedSession = localStorage.getItem('hrms_active_session_v2');
      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          const comp = liveCompanies.find(c => c.id === session.companyId);
          if (comp) {
            const users = storageService.getUsersByCompany(comp.id);
            const user = users.find(u => u.id === session.userId) || users[0] || null;
            setCurrentCompany(comp);
            setCurrentUser(user);
            const liveSettings = await api.getSettings(comp.id).catch(() => storageService.getSettings(comp.id));
            setSettings(normalizeIndianSettings(liveSettings));
            return;
          }
        } catch (e) {
          console.error('Session load error', e);
        }
      }

      if (liveCompanies.length > 0) {
        const firstComp = liveCompanies[0];
        const users = storageService.getUsersByCompany(firstComp.id);
        const user = users[0] || null;
        setCurrentCompany(firstComp);
        setCurrentUser(user);
        const liveSettings = await api.getSettings(firstComp.id).catch(() => storageService.getSettings(firstComp.id));
        setSettings(normalizeIndianSettings(liveSettings));
      } else {
        setCurrentCompany(null);
        setCurrentUser(null);
        setSettings(null);
      }
    } catch (err) {
      console.warn('API refresh error:', err);
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  const login = async (email: string): Promise<boolean> => {
    try {
      // Attempt login via PostgreSQL API
      const result = await api.login(email).catch(async () => {
        // Fallback to local storage lookup
        const users = storageService.getUsers();
        const matched = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (matched) {
          const comp = storageService.getCompanyById(matched.companyId);
          if (comp) {
            return { user: matched, company: comp, settings: storageService.getSettings(comp.id) };
          }
        }
        throw new Error('User not found');
      });

      if (result && result.user && result.company) {
        setCurrentUser(result.user);
        setCurrentCompany(result.company);
        setSettings(normalizeIndianSettings(result.settings));
        localStorage.setItem('hrms_active_session_v2', JSON.stringify({ userId: result.user.id, companyId: result.company.id }));
        return true;
      }
    } catch (err) {
      console.warn('Login error:', err);
    }
    return false;
  };

  const loginAsDemoUser = (userId: string) => {
    const user = storageService.getUsers().find(u => u.id === userId);
    if (user) {
      const comp = storageService.getCompanyById(user.companyId);
      if (comp) {
        setCurrentUser(user);
        setCurrentCompany(comp);
        setSettings(normalizeIndianSettings(storageService.getSettings(comp.id)));
        localStorage.setItem('hrms_active_session_v2', JSON.stringify({ userId: user.id, companyId: comp.id }));
      }
    }
  };

  const registerCompany = async (
    companyData: Partial<Company>, 
    adminData: Partial<User>, 
    plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE'
  ) => {
    try {
      // Register in Supabase PostgreSQL via API
      const res = await api.registerCompany(companyData, adminData, plan);
      if (res && res.company && res.user) {
        // Synchronize local cache
        storageService.createCompany(res.company, res.user, res.settings);

        setCurrentCompany(res.company);
        setCurrentUser(res.user);
        setSettings(res.settings);
        setCompanies(prev => [res.company, ...prev]);
        localStorage.setItem('hrms_active_session_v2', JSON.stringify({ userId: res.user.id, companyId: res.company.id }));
        return;
      }
    } catch (err) {
      console.warn('Direct API registration error, creating via local storage service:', err);
      // Fallback
      const companyId = `comp-${Date.now()}`;
      const adminId = `usr-${Date.now()}`;

      const newCompany: Company = {
        id: companyId,
        name: companyData.name || 'New Enterprise Corp',
        slug: (companyData.name || 'new-corp').toLowerCase().replace(/[^a-z0-9]/g, '-'),
        email: companyData.email || 'admin@newcorp.com',
        phone: companyData.phone || '+91 80 4000 0000',
        address: companyData.address || 'Bengaluru, Karnataka, India',
        industry: companyData.industry || 'Technology & Services',
        size: companyData.size || '11-50',
        plan: plan,
        createdAt: new Date().toISOString(),
      };

      const newAdmin: User = {
        id: adminId,
        companyId: companyId,
        email: adminData.email || 'admin@newcorp.com',
        fullName: adminData.fullName || 'Admin User',
        role: 'COMPANY_ADMIN',
        avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
        createdAt: new Date().toISOString(),
      };

      const initialSettings: CompanySettings = {
        id: `set-${companyId}`,
        companyId: companyId,
        companyName: newCompany.name,
        legalEntityName: `${newCompany.name} Private Limited`,
        taxRegistrationNumber: `GSTIN: 29AABCA${Math.floor(1000 + Math.random() * 9000)}F1Z8`,
        currency: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata (IST)',
        workDays: [1, 2, 3, 4, 5],
        businessHoursStart: '09:00',
        businessHoursEnd: '18:00',
        enableAutomaticOvertime: true,
        enableAuditLogging: true,
        defaultProbationPeriodMonths: 3,
      };

      storageService.createCompany(newCompany, newAdmin, initialSettings);
      setCompanies(storageService.getCompanies());
      setCurrentCompany(newCompany);
      setCurrentUser(newAdmin);
      setSettings(initialSettings);
      localStorage.setItem('hrms_active_session_v2', JSON.stringify({ userId: newAdmin.id, companyId: newCompany.id }));
    }
  };

  const switchCompany = (companyId: string) => {
    const comp = companies.find(c => c.id === companyId) || storageService.getCompanyById(companyId);
    if (comp) {
      const companyUsers = storageService.getUsersByCompany(companyId);
      const userToSet = companyUsers[0] || null;
      setCurrentCompany(comp);
      setCurrentUser(userToSet);
      setSettings(normalizeIndianSettings(storageService.getSettings(comp.id)));
      if (userToSet) {
        localStorage.setItem('hrms_active_session_v2', JSON.stringify({ userId: userToSet.id, companyId: comp.id }));
      }
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('hrms_active_session_v2');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentCompany,
        companies,
        settings,
        isAuthenticated: !!currentUser && !!currentCompany,
        login,
        loginAsDemoUser,
        registerCompany,
        switchCompany,
        logout,
        refreshState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
