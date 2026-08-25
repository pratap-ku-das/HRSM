import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, Lock, Mail, ArrowRight, Eye, EyeOff, 
  AlertCircle, CheckCircle2, User, Sparkles, ShieldCheck, ChevronRight
} from 'lucide-react';
import { storageService } from '../../services/storageService';

interface LoginPageProps {
  onNavigateToRegister: () => void;
  onNavigateToLanding: () => void;
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigateToRegister,
  onNavigateToLanding,
  onLoginSuccess,
}) => {
  const { login, loginAsDemoUser } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotSent, setForgotSent] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const success = await login(email);
      if (success) {
        onLoginSuccess();
      } else {
        setErrorMsg('Invalid email or company credentials. If you haven\'t registered a company workspace yet, please click "Register Company Workspace".');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const registeredUsers = storageService.getUsers();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative font-sans selection:bg-brand-500 selection:text-white overflow-hidden">
      {/* Background glowing gradients */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[650px] h-[450px] ambient-mesh ambient-blue pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-[500px] h-[500px] ambient-mesh ambient-purple pointer-events-none" />

      {/* Top Header Link */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6 relative z-10">
        <button
          onClick={onNavigateToLanding}
          className="inline-flex items-center space-x-3 hover:opacity-90 transition-all hover:scale-105 group"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-brand-500/25">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="text-left">
            <div className="text-xl font-black text-white tracking-tight flex items-center space-x-1.5">
              <span>HRSM Cloud</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">Enterprise Workforce OS</p>
          </div>
        </button>
        <h2 className="mt-5 text-2xl sm:text-3xl font-black tracking-tight text-white">
          Sign In to Workspace
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Enter your registered work email to access your PostgreSQL-backed workspace.
        </p>
      </div>

      {/* Form Container */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="glass-card py-8 px-6 sm:px-8 border border-white/15 rounded-3xl shadow-2xl space-y-6">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-start space-x-2.5 text-xs text-rose-300 animate-slide-up">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">Work / Admin Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@yourcompany.com"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl pl-10 pr-3.5 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs shadow-inner"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-semibold text-slate-300">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-brand-400 hover:text-brand-300 text-[11px] font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl pl-10 pr-10 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 text-xs font-mono shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-brand-500 focus:ring-0 cursor-pointer"
                />
                <span className="text-slate-400 text-xs font-medium">Remember this device</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-brand-500 via-indigo-600 to-purple-600 hover:from-brand-600 hover:to-indigo-700 shadow-xl shadow-brand-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 hover:scale-[1.02]"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick 1-Click Demo Accounts */}
          {registeredUsers.length > 0 && (
            <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                <span>1-Click Demo Accounts ({registeredUsers.length})</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {registeredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      loginAsDemoUser(u.id);
                      onLoginSuccess();
                    }}
                    className="w-full p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-brand-500/40 flex items-center justify-between text-left transition-all group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-white truncate group-hover:text-brand-300 transition-colors">{u.fullName}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{u.email}</div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-bold shrink-0 border border-brand-500/30">
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Register CTA */}
          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-xs text-slate-400">
              New organization?{' '}
              <button
                onClick={onNavigateToRegister}
                className="text-brand-400 hover:text-brand-300 font-bold"
              >
                Register Company Workspace
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowForgotModal(false)} />
          <div className="relative w-full max-w-md glass-modal rounded-3xl p-6 shadow-2xl z-10 animate-slide-up text-xs">
            <h3 className="text-base font-bold text-white">Reset Password</h3>
            <p className="text-xs text-slate-400 mt-1">
              Enter your registered work email and we will generate a password reset link.
            </p>

            {forgotSent ? (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 className="w-6 h-6 mb-2" />
                <div className="font-bold">Reset link sent!</div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Check your inbox for password reset instructions.
                </p>
                <button
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotSent(false);
                  }}
                  className="mt-4 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setForgotSent(true);
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Your Registered Work Email</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold shadow"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
