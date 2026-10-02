import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Clock3, Landmark, MapPin, Save, Settings, Sparkles } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import type { CompanySettings } from '../../types';
import { StatutoryWizard } from '../../components/StatutoryWizard';

const initial: CompanySettings = {
  id: '',
  companyId: '',
  companyName: '',
  legalEntityName: '',
  taxRegistrationNumber: '',
  companyType: 'PRIVATE_LIMITED',
  registrationNumber: '',
  panNumber: '',
  tanNumber: '',
  udyamRegistrationNumber: '',
  pfRegistrationNumber: '',
  esiRegistrationNumber: '',
  professionalTaxNumber: '',
  labourLicenseNumber: '',
  officialEmail: '',
  officialPhone: '',
  website: '',
  registeredAddress: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
  industry: '',
  companySize: '',
  financialYearStartMonth: 4,
  currency: 'INR',
  currencySymbol: '\u20B9',
  timezone: 'Asia/Kolkata',
  workDays: [1, 2, 3, 4, 5],
  businessHoursStart: '09:30',
  businessHoursEnd: '18:30',
  enableAutomaticOvertime: true,
  enableAuditLogging: true,
  defaultProbationPeriodMonths: 3,
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, required, children }) => (
  <label className="space-y-1 text-xs">
    <span className="font-semibold text-slate-600">
      {label}
      {required ? ' *' : ''}
    </span>
    {children}
  </label>
);

export const SettingsPage: React.FC = () => {
  const toast = useToast();
  const [form, setForm] = useState<CompanySettings>(initial);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const value = await api.getWorkspaceSettingsV1();
      if (value) {
        setForm({
          ...initial,
          ...value,
          incorporationDate: value.incorporationDate?.slice(0, 10),
        });
      }
    } catch (error) {
      toast.error(
        'Settings could not be loaded',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const days = [
    ['Mon', 1],
    ['Tue', 2],
    ['Wed', 3],
    ['Thu', 4],
    ['Fri', 5],
    ['Sat', 6],
    ['Sun', 0],
  ] as const;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setForm(await api.updateWorkspaceSettingsV1(form));
      toast.success('Workspace registration and settings saved');
    } catch (error) {
      toast.error(
        'Settings save failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="neo-page neo-settings space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="flex gap-2 text-2xl font-bold">
            <Settings className="text-brand-400" />
            Workspace Settings
          </h1>
          <p className="text-xs text-slate-400">
            Complete legal registration, statutory identity, contact information,
            payroll calendar and workplace defaults.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWizard(v => !v)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg"
        >
          <Sparkles className="w-4 h-4" />
          {showWizard ? 'Hide Statutory Wizard' : 'Open Statutory Onboarding Wizard'}
        </button>
      </header>

      {showWizard && (
        <StatutoryWizard
          initialSettings={form}
          onSaved={() => void load()}
          onClose={() => setShowWizard(false)}
        />
      )}
      <form onSubmit={save} className="space-y-4">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold">
            <Building2 className="h-5 w-5 text-brand-400" />
            Legal identity
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Company display name" required>
              <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Registered legal name" required>
              <input required value={form.legalEntityName} onChange={(e) => setForm({ ...form, legalEntityName: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Entity type">
              <select value={form.companyType} onChange={(e) => setForm({ ...form, companyType: e.target.value as CompanySettings['companyType'] })} className="input w-full">
                <option value="PRIVATE_LIMITED">Private limited company</option>
                <option value="PUBLIC_LIMITED">Public limited company</option>
                <option value="LLP">Limited liability partnership</option>
                <option value="PARTNERSHIP">Partnership</option>
                <option value="PROPRIETORSHIP">Proprietorship</option>
                <option value="TRUST">Trust</option>
                <option value="SOCIETY">Society</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="CIN / LLPIN / registration number">
              <input value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="Date of incorporation">
              <input type="date" value={form.incorporationDate || ''} onChange={(e) => setForm({ ...form, incorporationDate: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Industry">
              <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Software and technology" className="input w-full" />
            </Field>
            <Field label="Company size">
              <select value={form.companySize} onChange={(e) => setForm({ ...form, companySize: e.target.value })} className="input w-full">
                <option value="">Select headcount</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-500">201-500 employees</option>
                <option value="501-1000">501-1000 employees</option>
                <option value="1000+">1000+ employees</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold">
            <MapPin className="h-5 w-5 text-brand-400" />
            Registered office and contact
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Official email">
              <input type="email" value={form.officialEmail} onChange={(e) => setForm({ ...form, officialEmail: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Official phone">
              <input value={form.officialPhone} onChange={(e) => setForm({ ...form, officialPhone: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Website">
              <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://company.example" className="input w-full" />
            </Field>
            <Field label="Registered office address">
              <input value={form.registeredAddress} onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })} className="input w-full" />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input w-full" />
            </Field>
            <Field label="State">
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Country">
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input w-full" />
            </Field>
            <Field label="PIN / postal code">
              <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className="input w-full" />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold">
            <Landmark className="h-5 w-5 text-brand-400" />
            Tax and statutory registrations
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="GSTIN">
              <input value={form.taxRegistrationNumber} onChange={(e) => setForm({ ...form, taxRegistrationNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="Company PAN">
              <input value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="TAN">
              <input value={form.tanNumber} onChange={(e) => setForm({ ...form, tanNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="Udyam / MSME number">
              <input value={form.udyamRegistrationNumber} onChange={(e) => setForm({ ...form, udyamRegistrationNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="EPFO establishment ID">
              <input value={form.pfRegistrationNumber} onChange={(e) => setForm({ ...form, pfRegistrationNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="ESIC employer code">
              <input value={form.esiRegistrationNumber} onChange={(e) => setForm({ ...form, esiRegistrationNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="Professional tax number">
              <input value={form.professionalTaxNumber} onChange={(e) => setForm({ ...form, professionalTaxNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
            <Field label="Labour licence number">
              <input value={form.labourLicenseNumber} onChange={(e) => setForm({ ...form, labourLicenseNumber: e.target.value.toUpperCase() })} className="input w-full" />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <Clock3 className="h-5 w-5 text-brand-400" />
            Payroll calendar and workplace defaults
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Timezone">
              <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="input w-full">
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New York</option>
              </select>
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value, currencySymbol: e.target.value === 'INR' ? '\u20B9' : e.target.value === 'USD' ? '$' : e.target.value === 'GBP' ? '\u00A3' : '\u20AC' })} className="input w-full">
                <option value="INR">INR - Indian rupee</option>
                <option value="USD">USD - US dollar</option>
                <option value="GBP">GBP - Pound sterling</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </Field>
            <Field label="Financial year starts">
              <select value={form.financialYearStartMonth} onChange={(e) => setForm({ ...form, financialYearStartMonth: Number(e.target.value) })} className="input w-full">
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </Field>
            <Field label="Default probation months">
              <input type="number" min="0" max="36" value={form.defaultProbationPeriodMonths} onChange={(e) => setForm({ ...form, defaultProbationPeriodMonths: Number(e.target.value) })} className="input w-full" />
            </Field>
            <Field label="Business start">
              <input type="time" value={form.businessHoursStart} onChange={(e) => setForm({ ...form, businessHoursStart: e.target.value })} className="input w-full" />
            </Field>
            <Field label="Business end">
              <input type="time" value={form.businessHoursEnd} onChange={(e) => setForm({ ...form, businessHoursEnd: e.target.value })} className="input w-full" />
            </Field>
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Working days</span>
            <div className="flex flex-wrap gap-2">
              {days.map(([label, value]) => (
                <label key={value} className={`rounded-xl px-3 py-2 text-xs ${form.workDays.includes(value) ? 'bg-brand-500 text-white' : 'bg-slate-950'}`}>
                  <input type="checkbox" className="hidden" checked={form.workDays.includes(value)} onChange={() => setForm({ ...form, workDays: form.workDays.includes(value) ? form.workDays.filter((day) => day !== value) : [...form.workDays, value].sort() })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={form.enableAutomaticOvertime} onChange={(e) => setForm({ ...form, enableAutomaticOvertime: e.target.checked })} />Automatic overtime evaluation</label>
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={form.enableAuditLogging} onChange={(e) => setForm({ ...form, enableAuditLogging: e.target.checked })} />Audit logging enabled</label>
          </div>
        </section>
        <button disabled={busy} className="flex gap-2 rounded-xl bg-brand-500 px-5 py-3 text-white">
          <Save className="h-4 w-4" />
          {busy ? 'Saving...' : 'Save registration and settings'}
        </button>
      </form>
    </div>
  );
};
