import React, { useCallback, useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import type { CompanySettings } from '../../types';

const initial: CompanySettings = {
  id: '', companyId: '', companyName: '', legalEntityName: '', taxRegistrationNumber: '',
  currency: 'INR', currencySymbol: '₹', timezone: 'Asia/Kolkata', workDays: [1, 2, 3, 4, 5],
  businessHoursStart: '09:30', businessHoursEnd: '18:30', enableAutomaticOvertime: true,
  enableAuditLogging: true, defaultProbationPeriodMonths: 3,
};

export const SettingsPage: React.FC = () => {
  const toast = useToast();
  const [form, setForm] = useState<CompanySettings>(initial);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const value = await api.getWorkspaceSettingsV1(); if (value) setForm(value); }
    catch (error) { toast.error('Settings could not be loaded', error instanceof Error ? error.message : 'Unknown error'); }
    finally { setBusy(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const days = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]] as const;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { setForm(await api.updateWorkspaceSettingsV1(form)); toast.success('Workspace settings saved'); }
    catch (error) { toast.error('Settings save failed', error instanceof Error ? error.message : 'Unknown error'); }
    finally { setBusy(false); }
  };
  return <div className="neo-page space-y-5">
    <header className="border-b border-slate-800 pb-4"><h1 className="text-2xl font-bold flex gap-2"><Settings className="text-brand-400" />Workspace Settings</h1><p className="text-xs text-slate-400">Authoritative legal identity, timezone, business hours and policy defaults.</p></header>
    <form onSubmit={save} className="space-y-4">
      <section className="grid md:grid-cols-2 gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <input required value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Company display name" className="input" />
        <input required value={form.legalEntityName} onChange={e => setForm({ ...form, legalEntityName: e.target.value })} placeholder="Legal entity name" className="input" />
        <input value={form.taxRegistrationNumber} onChange={e => setForm({ ...form, taxRegistrationNumber: e.target.value })} placeholder="Tax registration" className="input" />
        <input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} placeholder="IANA timezone" className="input" />
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs">Business start<input type="time" value={form.businessHoursStart} onChange={e => setForm({ ...form, businessHoursStart: e.target.value })} className="input w-full" /></label>
          <label className="text-xs">Business end<input type="time" value={form.businessHoursEnd} onChange={e => setForm({ ...form, businessHoursEnd: e.target.value })} className="input w-full" /></label>
          <label className="text-xs">Probation months<input type="number" min="0" max="36" value={form.defaultProbationPeriodMonths} onChange={e => setForm({ ...form, defaultProbationPeriodMonths: Number(e.target.value) })} className="input w-full" /></label>
        </div>
        <div className="flex flex-wrap gap-2">{days.map(([label, value]) => <label key={value} className={`px-3 py-2 rounded-xl text-xs ${form.workDays.includes(value) ? 'bg-brand-500' : 'bg-slate-950'}`}><input type="checkbox" className="hidden" checked={form.workDays.includes(value)} onChange={() => setForm({ ...form, workDays: form.workDays.includes(value) ? form.workDays.filter(day => day !== value) : [...form.workDays, value].sort() })} />{label}</label>)}</div>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={form.enableAutomaticOvertime} onChange={e => setForm({ ...form, enableAutomaticOvertime: e.target.checked })} />Automatic overtime evaluation</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={form.enableAuditLogging} onChange={e => setForm({ ...form, enableAuditLogging: e.target.checked })} />Audit logging enabled</label>
      </section>
      <button disabled={busy} className="bg-brand-500 px-5 py-3 rounded-xl flex gap-2"><Save className="w-4" />Save settings</button>
    </form>
  </div>;
};
