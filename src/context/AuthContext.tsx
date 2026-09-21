// @refresh reset
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Company, CompanySettings, User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  currentUser: User | null;
  currentCompany: Company | null;
  companies: Company[];
  settings: CompanySettings | null;
  isAuthenticated: boolean;
  isRestoringSession: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<boolean>;
  loginAsDemoUser: (userId: string) => void;
  registerCompany: (companyData: Partial<Company>, adminData: Partial<User> & { password?: string }, plan: 'STARTER' | 'GROWTH' | 'ENTERPRISE') => Promise<void>;
  switchCompany: (companyId: string) => void;
  logout: () => void;
  refreshState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const establishSession = async () => {
    const me = (await api.getMeV1()).data;
    setCurrentUser(me.user);
    setCurrentCompany(me.company);
    setSettings(await api.getWorkspaceSettingsV1());
  };
  const clearSession = () => { api.clearV1Session(); setCurrentUser(null); setCurrentCompany(null); setSettings(null); };
  useEffect(() => {
    const handleSessionExpiry = () => clearSession();
    window.addEventListener('orbithr:session-expired', handleSessionExpiry);
    return () => window.removeEventListener('orbithr:session-expired', handleSessionExpiry);
  }, []);
  const refreshState = async () => {
    setIsRestoringSession(true);
    try {
      if (api.hasV1Session()) await establishSession();
      else clearSession();
    } catch (error) {
      console.warn('Authenticated session could not be restored:', error);
      clearSession();
    } finally { setIsRestoringSession(false); }
  };
  useEffect(() => { void refreshState(); }, []);

  const login = async (email: string, password: string, mfaCode?: string) => {
    try { await api.loginV1(email, password, mfaCode); await establishSession(); return true; }
    catch (error) { clearSession(); throw error; }
  };
  const registerCompany: AuthContextType['registerCompany'] = async (companyData, adminData, plan) => {
    if (!adminData.email || !adminData.password) throw new Error('Administrator email and password are required.');
    await api.registerCompany(companyData, adminData, plan);
    await api.loginV1(adminData.email, adminData.password);
    await establishSession();
  };
  const rejectDemoSession = () => { throw new Error('Local demo sessions are disabled. Sign in with an authorized account.'); };
  const logout = () => clearSession();

  return <AuthContext.Provider value={{
    currentUser, currentCompany, companies: currentCompany ? [currentCompany] : [], settings,
    isAuthenticated: Boolean(currentUser && currentCompany), isRestoringSession, login,
    loginAsDemoUser: rejectDemoSession, registerCompany, switchCompany: rejectDemoSession,
    logout, refreshState,
  }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
