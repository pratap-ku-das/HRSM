import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileCheck,
  FileText,
  HelpCircle,
  Landmark,
  Layers,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { CompanySettings } from '../types';

interface StatutoryDocument {
  id: string;
  docType: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  title: string;
  fileName: string;
  uploadedAt: string;
  remarks?: string;
}

interface StatutoryStatus {
  completionPercentage: number;
  isFullyCompliant: boolean;
  statutoryFields: Record<string, string | null>;
  missingFields: string[];
  documents: StatutoryDocument[];
}

const docTypes = [
  { key: 'CERTIFICATE_OF_INCORPORATION', label: 'Certificate of Incorporation (CIN / COI)' },
  { key: 'PAN_CARD', label: 'Company PAN Card' },
  { key: 'TAN_ALLOTMENT', label: 'TAN Allotment Letter' },
  { key: 'GST_CERTIFICATE', label: 'GST Registration Certificate' },
  { key: 'EPFO_REGISTRATION', label: 'EPFO / PF Registration Certificate' },
  { key: 'ESIC_REGISTRATION', label: 'ESIC Registration Certificate' },
  { key: 'PROFESSIONAL_TAX', label: 'Professional Tax (PT) Certificate' },
  { key: 'LABOUR_LICENSE', label: 'Labour License / Contract Registration' },
  { key: 'SHOPS_AND_ESTABLISHMENT', label: 'Shops & Establishment Certificate' },
  { key: 'UDYAM_MSME', label: 'Udyam / MSME Certificate' },
];

export const StatutoryWizard: React.FC<{
  initialSettings: CompanySettings;
  onSaved?: () => void;
  onClose?: () => void;
}> = ({ initialSettings, onSaved, onClose }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [busy, setBusy] = useState(false);
  const [statusData, setStatusData] = useState<StatutoryStatus | null>(null);

  const [form, setForm] = useState<Partial<CompanySettings>>({
    companyName: initialSettings.companyName || '',
    legalEntityName: initialSettings.legalEntityName || '',
    taxRegistrationNumber: initialSettings.taxRegistrationNumber || '',
    companyType: initialSettings.companyType || 'PRIVATE_LIMITED',
    registrationNumber: initialSettings.registrationNumber || '',
    incorporationDate: initialSettings.incorporationDate ? initialSettings.incorporationDate.slice(0, 10) : '',
    panNumber: initialSettings.panNumber || '',
    tanNumber: initialSettings.tanNumber || '',
    udyamRegistrationNumber: initialSettings.udyamRegistrationNumber || '',
    pfRegistrationNumber: initialSettings.pfRegistrationNumber || '',
    esiRegistrationNumber: initialSettings.esiRegistrationNumber || '',
    professionalTaxNumber: initialSettings.professionalTaxNumber || '',
    labourLicenseNumber: initialSettings.labourLicenseNumber || '',
    officialEmail: initialSettings.officialEmail || '',
    officialPhone: initialSettings.officialPhone || '',
    website: initialSettings.website || '',
    registeredAddress: initialSettings.registeredAddress || '',
    city: initialSettings.city || '',
    state: initialSettings.state || '',
    country: initialSettings.country || 'India',
    postalCode: initialSettings.postalCode || '',
    industry: initialSettings.industry || '',
    companySize: initialSettings.companySize || '',
  });

  // Upload State
  const [selectedDocType, setSelectedDocType] = useState('CERTIFICATE_OF_INCORPORATION');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getStatutoryStatusV1();
      setStatusData(data);
    } catch {
      // Ignore initial load failure if new
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const saveDraft = async () => {
    setBusy(true);
    try {
      await api.saveStatutoryDraftV1(form);
      toast.success('Statutory draft saved successfully');
      await loadStatus();
      if (onSaved) onSaved();
    } catch (error) {
      toast.error('Draft save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error('File required', 'Please select a PDF, JPG, or PNG document.');
      return;
    }
    setBusy(true);
    try {
      await api.uploadStatutoryDocumentV1(uploadFile, selectedDocType, expiryDate || undefined);
      toast.success('Document uploaded for statutory review');
      setUploadFile(null);
      setExpiryDate('');
      await loadStatus();
    } catch (error) {
      toast.error('Upload failed', error instanceof Error ? error.message : 'Could not upload document');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (id: string, status: 'VERIFIED' | 'REJECTED') => {
    setBusy(true);
    try {
      await api.verifyStatutoryDocumentV1(id, status, status === 'REJECTED' ? rejectRemarks : undefined);
      toast.success(status === 'VERIFIED' ? 'Document verified' : 'Document rejected');
      setVerifyingDocId(null);
      setRejectRemarks('');
      await loadStatus();
    } catch (error) {
      toast.error('Verification failed', error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { num: 1, title: 'Company Details', icon: Building2 },
    { num: 2, title: 'Statutory Numbers', icon: Landmark },
    { num: 3, title: 'Document Upload', icon: UploadCloud },
    { num: 4, title: 'Verification', icon: FileCheck },
    { num: 5, title: 'Completion', icon: ShieldCheck },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 text-slate-100 shadow-2xl">
      {/* Wizard Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-brand-500/20 text-brand-400 text-xs px-2.5 py-1 rounded-full font-semibold border border-brand-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Compliance Onboarding
            </span>
            <span className="text-xs text-slate-400">Step {currentStep} of 5</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold mt-1 text-white">Company Statutory Registration Wizard</h2>
          <p className="text-xs text-slate-400">Complete legal identity, PAN, TAN, GSTIN, EPFO, ESIC and statutory document verification.</p>
        </div>
        <div className="flex items-center gap-2">
          {statusData && (
            <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2 rounded-2xl border border-slate-800">
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Compliance</span>
                <strong className="text-sm font-bold text-brand-400">{statusData.completionPercentage}%</strong>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-brand-400 border border-brand-500/30">
                {statusData.completionPercentage}%
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition border border-slate-700 text-slate-200"
          >
            <Save className="w-3.5 h-3.5" /> Save Draft
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs bg-slate-800/60 hover:bg-slate-800 px-3 py-2 rounded-xl text-slate-400 hover:text-white"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="grid grid-cols-5 gap-2 border-b border-slate-800/80 pb-5">
        {steps.map(s => {
          const Icon = s.icon;
          const isActive = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setCurrentStep(s.num as any)}
              className={`flex flex-col md:flex-row items-center gap-2 p-2.5 rounded-2xl text-left transition ${
                isActive
                  ? 'bg-brand-500/15 border border-brand-500/40 text-brand-300'
                  : isDone
                  ? 'bg-slate-950/50 text-slate-300 border border-slate-800/80'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                  isActive ? 'bg-brand-500 text-slate-950' : isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <div className="hidden md:block">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Step {s.num}</span>
                <span className="text-xs font-semibold">{s.title}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* STEP 1: Basic Company Information */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-white">
            <Building2 className="w-4 h-4 text-brand-400" /> Step 1: Legal Entity & Corporate Profile
          </h3>
          <div className="grid md:grid-cols-3 gap-4">
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Legal Company Name *</span>
              <input
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={form.legalEntityName || ''}
                onChange={e => setForm({ ...form, legalEntityName: e.target.value })}
                placeholder="e.g. Acme Innovations Private Limited"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Trade / Brand Name *</span>
              <input
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={form.companyName || ''}
                onChange={e => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g. Acme Corp"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Entity Type *</span>
              <select
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={form.companyType || 'PRIVATE_LIMITED'}
                onChange={e => setForm({ ...form, companyType: e.target.value as any })}
              >
                <option value="PRIVATE_LIMITED">Private Limited Company</option>
                <option value="PUBLIC_LIMITED">Public Limited Company</option>
                <option value="LLP">Limited Liability Partnership (LLP)</option>
                <option value="PARTNERSHIP">Partnership Firm</option>
                <option value="PROPRIETORSHIP">Sole Proprietorship</option>
                <option value="TRUST">Trust</option>
                <option value="SOCIETY">Society</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Corporate Identity Number (CIN)</span>
              <input
                className="input w-full bg-slate-950 border-slate-800 rounded-xl font-mono uppercase"
                value={form.registrationNumber || ''}
                onChange={e => setForm({ ...form, registrationNumber: e.target.value.toUpperCase() })}
                placeholder="e.g. U72200DL2024PTC123456"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Date of Incorporation</span>
              <input
                type="date"
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={form.incorporationDate || ''}
                onChange={e => setForm({ ...form, incorporationDate: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Industry</span>
              <input
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={form.industry || ''}
                onChange={e => setForm({ ...form, industry: e.target.value })}
                placeholder="e.g. Information Technology"
              />
            </label>
          </div>

          <div className="border-t border-slate-800/80 pt-4">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">Registered Office Address & Contact</h4>
            <div className="grid md:grid-cols-4 gap-4">
              <label className="space-y-1 text-xs md:col-span-2">
                <span className="font-semibold text-slate-300">Address Line *</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.registeredAddress || ''}
                  onChange={e => setForm({ ...form, registeredAddress: e.target.value })}
                  placeholder="Plot No., Building, Street"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">City *</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.city || ''}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  placeholder="City"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">State *</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.state || ''}
                  onChange={e => setForm({ ...form, state: e.target.value })}
                  placeholder="State / UT"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">PIN / Postal Code *</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.postalCode || ''}
                  onChange={e => setForm({ ...form, postalCode: e.target.value })}
                  placeholder="6-digit PIN"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">Official Compliance Email</span>
                <input
                  type="email"
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.officialEmail || ''}
                  onChange={e => setForm({ ...form, officialEmail: e.target.value })}
                  placeholder="compliance@company.com"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">Official Phone</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.officialPhone || ''}
                  onChange={e => setForm({ ...form, officialPhone: e.target.value })}
                  placeholder="+91..."
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold text-slate-300">Official Website</span>
                <input
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                  value={form.website || ''}
                  onChange={e => setForm({ ...form, website: e.target.value })}
                  placeholder="https://..."
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Statutory Registrations */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2 text-white">
              <Landmark className="w-4 h-4 text-brand-400" /> Step 2: Indian Statutory Registrations
            </h3>
            <span className="text-xs text-slate-400">Fill applicable tax and labour identifiers</span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Direct & Indirect Tax
              </h4>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">Company Permanent Account Number (PAN) *</span>
                <input
                  required
                  maxLength={10}
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.panNumber || ''}
                  onChange={e => setForm({ ...form, panNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. AAACB1234F"
                />
              </label>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">Tax Deduction and Collection Account Number (TAN) *</span>
                <input
                  required
                  maxLength={10}
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.tanNumber || ''}
                  onChange={e => setForm({ ...form, tanNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. DELB12345A"
                />
              </label>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">GST Identification Number (GSTIN) *</span>
                <input
                  maxLength={15}
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.taxRegistrationNumber || ''}
                  onChange={e => setForm({ ...form, taxRegistrationNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                />
              </label>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Social Security & Labour Compliances
              </h4>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">EPFO / Provident Fund Code</span>
                <input
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.pfRegistrationNumber || ''}
                  onChange={e => setForm({ ...form, pfRegistrationNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. GNGGN1234567000"
                />
              </label>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">ESIC Employer Code</span>
                <input
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.esiRegistrationNumber || ''}
                  onChange={e => setForm({ ...form, esiRegistrationNumber: e.target.value.toUpperCase() })}
                  placeholder="17-digit ESIC Code"
                />
              </label>
              <label className="space-y-1 text-xs block">
                <span className="font-semibold text-slate-300">Professional Tax (PT) Registration Number</span>
                <input
                  className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-sm"
                  value={form.professionalTaxNumber || ''}
                  onChange={e => setForm({ ...form, professionalTaxNumber: e.target.value.toUpperCase() })}
                  placeholder="PT Registration / RC Number"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-xs block">
                  <span className="font-semibold text-slate-300">Labour License No.</span>
                  <input
                    className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-xs"
                    value={form.labourLicenseNumber || ''}
                    onChange={e => setForm({ ...form, labourLicenseNumber: e.target.value.toUpperCase() })}
                    placeholder="Labour license"
                  />
                </label>
                <label className="space-y-1 text-xs block">
                  <span className="font-semibold text-slate-300">Udyam / MSME No.</span>
                  <input
                    className="input w-full bg-slate-900 border-slate-800 rounded-xl font-mono uppercase text-xs"
                    value={form.udyamRegistrationNumber || ''}
                    onChange={e => setForm({ ...form, udyamRegistrationNumber: e.target.value.toUpperCase() })}
                    placeholder="UDYAM-XX-00-0000000"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Document Upload */}
      {currentStep === 3 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2 text-white">
              <UploadCloud className="w-4 h-4 text-brand-400" /> Step 3: Statutory Document Repository
            </h3>
            <span className="text-xs text-slate-400">Supported formats: PDF, JPG, PNG (Max 10MB)</span>
          </div>

          <form onSubmit={handleFileUpload} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 grid md:grid-cols-4 gap-4 items-end">
            <label className="space-y-1 text-xs md:col-span-2">
              <span className="font-semibold text-slate-300">Statutory Document Category *</span>
              <select
                className="input w-full bg-slate-900 border-slate-800 rounded-xl"
                value={selectedDocType}
                onChange={e => setSelectedDocType(e.target.value)}
              >
                {docTypes.map(d => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Document Expiry Date (if applicable)</span>
              <input
                type="date"
                className="input w-full bg-slate-900 border-slate-800 rounded-xl"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Choose File *</span>
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="input w-full bg-slate-900 border-slate-800 rounded-xl text-xs py-1"
              />
            </label>

            <div className="md:col-span-4 flex justify-end">
              <button
                type="submit"
                disabled={busy || !uploadFile}
                className="bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4" /> Upload Statutory Document
              </button>
            </div>
          </form>

          {/* List of uploaded documents */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Uploaded Documents ({statusData?.documents.length || 0})</h4>
            {statusData?.documents.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-500">
                No statutory documents uploaded yet. Upload your Certificate of Incorporation, PAN card, and GSTIN certificates above.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {statusData?.documents.map(doc => (
                  <div key={doc.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-brand-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <strong className="block text-slate-200">{doc.title}</strong>
                        <span className="text-[11px] text-slate-500">
                          {doc.fileName} · Uploaded {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'recently'}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        doc.status === 'VERIFIED'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : doc.status === 'REJECTED'
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: Verification */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2 text-white">
              <FileCheck className="w-4 h-4 text-brand-400" /> Step 4: Compliance Officer Document Review
            </h3>
            <span className="text-xs text-slate-400">Admin / Authorized HR verification workspace</span>
          </div>

          <div className="space-y-3">
            {statusData?.documents.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                Please upload statutory documents in Step 3 before proceeding with verification.
              </div>
            ) : (
              statusData?.documents.map(doc => (
                <div key={doc.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{doc.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          doc.status === 'VERIFIED'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : doc.status === 'REJECTED'
                            ? 'bg-rose-500/15 text-rose-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">File: {doc.fileName}</p>
                    {doc.remarks && <p className="text-xs text-amber-400 italic">Remark: {doc.remarks}</p>}
                  </div>

                  <div className="flex items-center gap-2">
                    {verifyingDocId === doc.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="Rejection remark..."
                          value={rejectRemarks}
                          onChange={e => setRejectRemarks(e.target.value)}
                          className="input bg-slate-900 border-slate-800 text-xs px-2 py-1.5 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => void handleVerify(doc.id, 'REJECTED')}
                          className="bg-rose-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold"
                        >
                          Confirm Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setVerifyingDocId(null)}
                          className="text-xs text-slate-400 px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleVerify(doc.id, 'VERIFIED')}
                          disabled={busy || doc.status === 'VERIFIED'}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyingDocId(doc.id);
                            setRejectRemarks('');
                          }}
                          disabled={busy}
                          className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* STEP 5: Completion & Status */}
      {currentStep === 5 && (
        <div className="space-y-6">
          <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {statusData?.isFullyCompliant ? (
                  <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> 100% Fully Compliant
                  </span>
                ) : (
                  <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Setup In Progress ({statusData?.completionPercentage}%)
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white">Statutory Onboarding Overview</h3>
              <p className="text-xs text-slate-400 max-w-xl">
                Statutory profiles ensure lawful employee hiring, automated PF/ESIC deductions, correct TDS calculations on Form 16, and smooth corporate audits.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-center">
                <span className="text-3xl font-extrabold text-brand-400">{statusData?.completionPercentage}%</span>
                <span className="block text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Readiness</span>
              </div>
            </div>
          </div>

          {/* Missing Checklist */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" /> Missing Statutory Identifiers ({statusData?.missingFields.length || 0})
              </h4>
              {statusData?.missingFields.length === 0 ? (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> All required statutory registration identifiers are set.
                </p>
              ) : (
                <ul className="text-xs space-y-1.5 text-slate-400">
                  {statusData?.missingFields.map(f => (
                    <li key={f} className="flex items-center gap-2 text-rose-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-brand-400" /> Document Verification Summary
              </h4>
              <div className="text-xs space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Verified Documents:</span>
                  <strong className="text-emerald-400">
                    {statusData?.documents.filter(d => d.status === 'VERIFIED').length || 0}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Pending Documents:</span>
                  <strong className="text-amber-400">
                    {statusData?.documents.filter(d => d.status === 'PENDING').length || 0}
                  </strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Rejected Documents:</span>
                  <strong className="text-rose-400">
                    {statusData?.documents.filter(d => d.status === 'REJECTED').length || 0}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-5">
        <button
          type="button"
          onClick={() => setCurrentStep(prev => Math.max(1, prev - 1) as any)}
          disabled={currentStep === 1 || busy}
          className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
        >
          Previous Step
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy}
            className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            Save Progress
          </button>
          {currentStep < 5 ? (
            <button
              type="button"
              onClick={() => {
                void saveDraft();
                setCurrentStep(prev => Math.min(5, prev + 1) as any);
              }}
              disabled={busy}
              className="bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              Next Step <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await saveDraft();
                toast.success('Company statutory setup confirmed and completed');
                if (onClose) onClose();
              }}
              disabled={busy}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              <CheckCircle2 className="w-4 h-4" /> Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
