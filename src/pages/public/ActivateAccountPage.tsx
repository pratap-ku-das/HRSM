import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { ProductLogo } from '../../components/ProductLogo';

export const ActivateAccountPage: React.FC<{ onNavigateToLogin: () => void }> = ({ onNavigateToLogin }) => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return setError('This activation link is missing its token. Please use the complete link from your email.');
    if (password.length < 10) return setError('Password must contain at least 10 characters.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    setError(''); setSubmitting(true);
    try {
      await api.activateAccount(token, password);
      setActivated(true);
      window.history.replaceState({}, '', '/activate');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account activation failed.');
    } finally { setSubmitting(false); }
  };

  return <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
      <ProductLogo className="mx-auto h-16 w-52" />
      {activated ? <div className="mt-8 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
        <h1 className="mt-4 text-2xl font-bold">Account activated</h1>
        <p className="mt-2 text-sm text-slate-400">You can now sign in to OrbitHR on the web or Android app.</p>
        <button onClick={onNavigateToLogin} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500">Continue to sign in</button>
      </div> : <>
        <div className="mt-6 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-brand-400" /><h1 className="mt-3 text-2xl font-bold">Activate your account</h1><p className="mt-2 text-sm text-slate-400">Choose a password with at least 10 characters.</p></div>
        {error && <div role="alert" className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {[{ label: 'New password', value: password, set: setPassword }, { label: 'Confirm password', value: confirmPassword, set: setConfirmPassword }].map(field => <label key={field.label} className="block text-sm font-medium text-slate-300">{field.label}<span className="relative mt-2 block"><Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input required minLength={10} type={showPassword ? 'text' : 'password'} value={field.value} onChange={e => field.set(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-10 outline-none focus:border-brand-500" /></span></label>)}
          <button type="button" onClick={() => setShowPassword(value => !value)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {showPassword ? 'Hide passwords' : 'Show passwords'}</button>
          <button disabled={submitting || !token} className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold hover:bg-brand-500 disabled:opacity-50">{submitting ? 'Activating…' : 'Activate account'}</button>
        </form>
      </>}
    </section>
  </main>;
};
