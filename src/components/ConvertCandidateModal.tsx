import React, { useState } from 'react';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  DollarSign,
  Mail,
  Phone,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import type { Department, Designation, JobApplicant, JobPosting } from '../types';

interface ConvertCandidateModalProps {
  candidate: JobApplicant;
  job?: JobPosting;
  departments: Department[];
  designations: Designation[];
  onConverted: (result: { employeeCode: string; candidateId: string }) => void;
  onClose: () => void;
}

export const ConvertCandidateModal: React.FC<ConvertCandidateModalProps> = ({
  candidate,
  job,
  departments,
  designations,
  onConverted,
  onClose,
}) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Parse candidate name
  const nameParts = (candidate.fullName || '').trim().split(/\s+/);
  const initialFirst = nameParts[0] || '';
  const initialLast = nameParts.slice(1).join(' ') || '';

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState(candidate.email || '');
  const [phone, setPhone] = useState(candidate.phone || '');
  const [departmentId, setDepartmentId] = useState(job?.departmentId || departments[0]?.id || '');
  const [designationId, setDesignationId] = useState(designations[0]?.id || '');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [dateOfJoining, setDateOfJoining] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyCtc, setMonthlyCtc] = useState(job?.minSalary ? Math.round(job.minSalary / 12) : 50000);
  const [employeeCode, setEmployeeCode] = useState('');

  // Missing validation check
  const missingFields: string[] = [];
  if (!firstName.trim()) missingFields.push('First Name');
  if (!email.trim()) missingFields.push('Email');
  if (!phone.trim()) missingFields.push('Phone Number');
  if (!departmentId) missingFields.push('Department');
  if (!designationId) missingFields.push('Designation');
  if (!dateOfJoining) missingFields.push('Joining Date');

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingFields.length > 0) {
      toast.error('Incomplete information', `Please provide all required fields: ${missingFields.join(', ')}`);
      return;
    }

    setBusy(true);
    try {
      const result = await api.convertCandidateToEmployeeV1(candidate.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || 'Employee',
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        dateOfJoining,
        departmentId,
        designationId,
        employmentType,
        monthlyCtc: Number(monthlyCtc) || undefined,
        employeeCode: employeeCode.trim() || undefined,
      });

      toast.success(
        'Candidate successfully converted to employee!',
        `Created employee ${result.employee.employeeCode} (${result.employee.firstName} ${result.employee.lastName}) with active onboarding checklist.`
      );

      onConverted({ employeeCode: result.employee.employeeCode, candidateId: candidate.id });
    } catch (error) {
      toast.error('Conversion failed', error instanceof Error ? error.message : 'Could not convert candidate to employee');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 md:p-8 space-y-6 text-slate-100 shadow-2xl relative my-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-full font-semibold border border-emerald-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> One-Click ATS Conversion
            </span>
            <span className="text-xs text-slate-400">Recruitment → HR Onboarding</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white">Convert Candidate to Employee</h2>
          <p className="text-xs text-slate-400">
            Review and map candidate details into a formal employee profile. This creates an employee record, starts an onboarding checklist, and archives candidate recruitment history permanently.
          </p>
        </div>

        {/* Candidate Source Overview */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
          <div>
            <strong className="block text-sm text-slate-200">{candidate.fullName}</strong>
            <span className="text-slate-400">
              Applying for: <span className="text-brand-300 font-semibold">{job?.title || 'Open Position'}</span> · Stage: <span className="text-emerald-400 font-bold">{candidate.stage}</span>
            </span>
          </div>
          <div className="text-right text-slate-500 text-[11px]">
            <span>Source: {candidate.source || 'Direct'}</span>
            <span className="block">Exp: {candidate.experienceYears || 0} years</span>
          </div>
        </div>

        {missingFields.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Missing mandatory employee information</strong>
              <span>OrbitHR does not invent dummy data. Please fill in: {missingFields.join(', ')}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleConvert} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">First Name *</span>
              <input
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Last Name *</span>
              <input
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Official Work Email *</span>
              <div className="relative">
                <input
                  required
                  type="email"
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl pl-8"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
              </div>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Phone Number *</span>
              <div className="relative">
                <input
                  required
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl pl-8"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91..."
                />
                <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
              </div>
            </label>
          </div>

          <div className="border-t border-slate-800/80 pt-4 grid md:grid-cols-2 gap-4">
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Department *</span>
              <select
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Designation *</span>
              <select
                required
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={designationId}
                onChange={e => setDesignationId(e.target.value)}
              >
                {designations.map(d => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Date of Joining *</span>
              <input
                required
                type="date"
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={dateOfJoining}
                onChange={e => setDateOfJoining(e.target.value)}
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Employment Type</span>
              <select
                className="input w-full bg-slate-950 border-slate-800 rounded-xl"
                value={employmentType}
                onChange={e => setEmploymentType(e.target.value)}
              >
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Monthly Gross CTC (INR)</span>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  className="input w-full bg-slate-950 border-slate-800 rounded-xl pl-8"
                  value={monthlyCtc}
                  onChange={e => setMonthlyCtc(Number(e.target.value))}
                />
                <DollarSign className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
              </div>
            </label>

            <label className="space-y-1 text-xs">
              <span className="font-semibold text-slate-300">Custom Employee Code (optional)</span>
              <input
                className="input w-full bg-slate-950 border-slate-800 rounded-xl font-mono uppercase"
                value={employeeCode}
                onChange={e => setEmployeeCode(e.target.value.toUpperCase())}
                placeholder="Leave blank for auto-generation"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || missingFields.length > 0}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition disabled:opacity-50 shadow-lg"
            >
              <UserCheck className="w-4 h-4" /> Convert to Employee & Start Onboarding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
