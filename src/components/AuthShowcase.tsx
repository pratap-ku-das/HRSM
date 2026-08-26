import React from 'react';
import { CheckCircle2, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { ProductLogo } from './ProductLogo';

export const AuthShowcase: React.FC<{ mode: 'login' | 'register' }> = ({ mode }) => {
  const isLogin = mode === 'login';

  return (
    <aside className="auth-showcase fixed inset-y-0 left-0 hidden w-[43vw] overflow-hidden lg:flex lg:flex-col lg:justify-between p-10 xl:p-14">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />

      <div className="relative z-10 w-fit rounded-2xl bg-white/95 px-5 py-2 shadow-xl shadow-indigo-950/20">
        <ProductLogo className="h-14 w-52" />
      </div>

      <div className="relative z-10 max-w-xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-cyan-100 backdrop-blur-xl">
          <Sparkles className="h-4 w-4" />
          One workspace. Every people operation.
        </div>
        <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white xl:text-6xl">
          {isLogin ? 'Welcome back to better work.' : 'Build a workplace people love.'}
        </h1>
        <p className="mt-5 max-w-lg text-sm leading-7 text-indigo-100/85 xl:text-base">
          {isLogin
            ? 'Your workforce, payroll, attendance and talent insights are ready when you are.'
            : 'Launch a secure, intelligent HR workspace designed to grow with your team.'}
        </p>

        <div className="mt-9 grid grid-cols-2 gap-3">
          <div className="auth-feature-card">
            <Users className="h-5 w-5 text-cyan-300" />
            <strong>People-first</strong>
            <span>One connected employee experience</span>
          </div>
          <div className="auth-feature-card">
            <ShieldCheck className="h-5 w-5 text-violet-200" />
            <strong>Enterprise secure</strong>
            <span>Protected company workspaces</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-3 text-xs font-semibold text-indigo-100/80">
        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
        Attendance · Payroll · Talent · Analytics
      </div>
    </aside>
  );
};
