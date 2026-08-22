import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { Shield, Sparkles, X, Check, Building2, User, UserCheck, Briefcase } from 'lucide-react';

interface RoleSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, currentCompany, loginAsDemoUser } = useAuth();

  if (!isOpen) return null;

  const allUsers = storageService.getUsers();
  const allCompanies = storageService.getCompanies();

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'COMPANY_ADMIN':
      case 'SUPER_ADMIN':
        return Shield;
      case 'HR_MANAGER':
        return UserCheck;
      case 'DEPT_HEAD':
        return Briefcase;
      default:
        return User;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'COMPANY_ADMIN': return 'Company Admin / Executive';
      case 'HR_MANAGER': return 'HR Director / Manager';
      case 'DEPT_HEAD': return 'Engineering Dept Lead';
      case 'EMPLOYEE': return 'Software Engineer (Staff)';
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'COMPANY_ADMIN': return 'from-purple-500 to-indigo-600 border-purple-400/40 text-purple-200';
      case 'HR_MANAGER': return 'from-blue-500 to-cyan-600 border-blue-400/40 text-blue-200';
      case 'DEPT_HEAD': return 'from-amber-500 to-orange-600 border-amber-400/40 text-amber-200';
      case 'EMPLOYEE': return 'from-emerald-500 to-teal-600 border-emerald-400/40 text-emerald-200';
      default: return 'from-slate-600 to-slate-700 border-slate-500 text-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 overflow-hidden animate-slide-up z-10">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Interactive Demo Persona Switcher</h3>
              <p className="text-xs text-slate-400">
                Switch instant roles and test permissions, approvals, and multi-tenancy.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-5 space-y-5 max-h-[65vh] overflow-y-auto pr-1">
          {allCompanies.map((company) => {
            const companyUsers = allUsers.filter(u => u.companyId === company.id);

            return (
              <div key={company.id} className="space-y-2.5">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Building2 className="w-4 h-4 text-brand-400" />
                  <span>{company.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 normal-case font-mono">
                    {company.industry} • {company.plan}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {companyUsers.map((user) => {
                    const Icon = getRoleIcon(user.role);
                    const isSelected = currentUser?.id === user.id && currentCompany?.id === company.id;

                    return (
                      <button
                        key={user.id}
                        onClick={() => {
                          loginAsDemoUser(user.id);
                          onClose();
                        }}
                        className={`relative p-3.5 rounded-xl border text-left transition-all group flex items-start space-x-3 ${
                          isSelected
                            ? 'bg-brand-500/15 border-brand-500 ring-1 ring-brand-500/50 shadow-md shadow-brand-500/10'
                            : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-bold text-white group-hover:text-brand-300 transition-colors truncate">
                              {user.fullName}
                            </div>
                            {isSelected && (
                              <span className="flex items-center space-x-1 text-[10px] font-bold text-brand-400 bg-brand-500/20 px-1.5 py-0.5 rounded border border-brand-500/30">
                                <Check className="w-3 h-3" />
                                <span>Active</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium text-slate-300 mt-0.5">
                            {getRoleLabel(user.role)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                            {user.email}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Tip: You can test different approval states by switching roles.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
