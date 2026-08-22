import React, { useState, useEffect } from 'react';
import { CompanySettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { 
  Settings, Building2, Globe, Clock, ShieldCheck, 
  CheckCircle2, Save, Sparkles, DollarSign, Calendar
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentCompany, settings, currentUser } = useAuth();
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const [companyName, setCompanyName] = useState<string>('');
  const [legalName, setLegalName] = useState<string>('');
  const [taxId, setTaxId] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USD');
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [timezone, setTimezone] = useState<string>('America/Los_Angeles (PST)');
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hoursStart, setHoursStart] = useState<string>('09:00');
  const [hoursEnd, setHoursEnd] = useState<string>('18:00');
  const [autoOvertime, setAutoOvertime] = useState<boolean>(true);
  const [auditLogging, setAuditLogging] = useState<boolean>(true);
  const [probationMonths, setProbationMonths] = useState<number>(3);

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.companyName);
      setLegalName(settings.legalEntityName);
      setTaxId(settings.taxRegistrationNumber);
      setCurrency(settings.currency);
      setCurrencySymbol(settings.currencySymbol);
      setTimezone(settings.timezone);
      setWorkDays(settings.workDays);
      setHoursStart(settings.businessHoursStart);
      setHoursEnd(settings.businessHoursEnd);
      setAutoOvertime(settings.enableAutomaticOvertime);
      setAuditLogging(settings.enableAuditLogging);
      setProbationMonths(settings.defaultProbationPeriodMonths);
    } else if (currentCompany) {
      setCompanyName(currentCompany.name);
      setLegalName(`${currentCompany.name} Inc.`);
      setTaxId('TAX-8291048');
    }
  }, [settings, currentCompany]);

  const toggleWorkDay = (day: number) => {
    if (workDays.includes(day)) {
      setWorkDays(workDays.filter(d => d !== day));
    } else {
      setWorkDays([...workDays, day].sort());
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) return;

    const newSettings: CompanySettings = {
      id: `set-${currentCompany.id}`,
      companyId: currentCompany.id,
      companyName,
      legalEntityName: legalName,
      taxRegistrationNumber: taxId,
      currency,
      currencySymbol,
      timezone,
      workDays,
      businessHoursStart: hoursStart,
      businessHoursEnd: hoursEnd,
      enableAutomaticOvertime: autoOvertime,
      enableAuditLogging: auditLogging,
      defaultProbationPeriodMonths: Number(probationMonths),
    };

    storageService.saveSettings(newSettings);

    storageService.logAudit({
      companyId: currentCompany.id,
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: 'UPDATE_SETTINGS',
      category: 'SETTINGS',
      details: 'Updated workspace business hours, timezone, and statutory settings.',
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const dayNames = [
    { num: 1, label: 'Mon' },
    { num: 2, label: 'Tue' },
    { num: 3, label: 'Wed' },
    { num: 4, label: 'Thu' },
    { num: 5, label: 'Fri' },
    { num: 6, label: 'Sat' },
    { num: 0, label: 'Sun' },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Settings className="w-6 h-6 text-brand-400" />
            <span>Workspace & Tenant Settings</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure company legal registration, operational working hours, currencies, and security policies.
          </p>
        </div>

        {saveSuccess && (
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-xs">
        {/* Company Identity */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white pb-3 border-b border-slate-800">
            <Building2 className="w-4 h-4 text-brand-400" />
            <span>Company Legal Identity</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Company Display Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Legal Entity Registered Name</label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Tax / VAT Registration ID</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Subdomain Slug</label>
              <input
                type="text"
                disabled
                value={`${currentCompany?.slug || 'workspace'}.hrms.io`}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-400 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Working Hours & Shift Rules */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white pb-3 border-b border-slate-800">
            <Clock className="w-4 h-4 text-brand-400" />
            <span>Shift Timings & Working Days</span>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-2">Standard Working Days</label>
            <div className="flex flex-wrap gap-2">
              {dayNames.map((d) => {
                const isSelected = workDays.includes(d.num);
                return (
                  <button
                    key={d.num}
                    type="button"
                    onClick={() => toggleWorkDay(d.num)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20 font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Shift Start Time (HH:mm)</label>
              <input
                type="time"
                value={hoursStart}
                onChange={(e) => setHoursStart(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Shift End Time (HH:mm)</label>
              <input
                type="time"
                value={hoursEnd}
                onChange={(e) => setHoursEnd(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              >
                <option>America/Los_Angeles (PST)</option>
                <option>America/New_York (EST)</option>
                <option>Europe/London (GMT)</option>
                <option>Europe/Berlin (CET)</option>
                <option>Asia/Dubai (GST)</option>
                <option>Asia/Kolkata (IST)</option>
                <option>Asia/Singapore (SGT)</option>
                <option>Asia/Tokyo (JST)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Currency Code</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="INR">INR (₹)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
                <option value="SGD">SGD ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Security & Audit Policies */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white pb-3 border-b border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Compliance & Multi-Tenant Security</span>
          </div>

          <div className="space-y-3">
            <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60">
              <input
                type="checkbox"
                checked={auditLogging}
                onChange={(e) => setAuditLogging(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-brand-500 focus:ring-0 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-white">Enable Immutable Audit Trail</div>
                <p className="text-[11px] text-slate-400">Log all administrative actions, salary edits, and status changes for SOC-2 compliance.</p>
              </div>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-2xl bg-slate-800/50 border border-slate-700/60">
              <input
                type="checkbox"
                checked={autoOvertime}
                onChange={(e) => setAutoOvertime(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-brand-500 focus:ring-0 cursor-pointer"
              />
              <div>
                <div className="font-semibold text-white">Automatic Overtime Calculation</div>
                <p className="text-[11px] text-slate-400">Compute overtime rates for working beyond scheduled shift end times.</p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 bg-gradient-to-r from-brand-500 to-indigo-600 hover:from-brand-600 hover:to-indigo-700 text-white rounded-xl font-bold flex items-center space-x-2 shadow-lg shadow-brand-500/25 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Save Workspace Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
