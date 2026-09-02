import React, { useState, useEffect } from 'react';
import { Employee, Department, Designation, EmploymentType, EmployeeStatus } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { storageService } from '../../services/storageService';
import { api } from '../../services/api';
import { 
  X, User, Mail, Phone, Calendar, Briefcase, CreditCard, 
  Building2, Shield, Heart, Sparkles, Check
} from 'lucide-react';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeToEdit?: Employee | null;
  onSaved: () => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  employeeToEdit,
  onSaved,
}) => {
  const { currentCompany, currentUser, settings } = useAuth();
  const currencySymbol = settings?.currencySymbol || '₹';
  const [activeTab, setActiveTab] = useState<'basic' | 'employment' | 'salary' | 'bank' | 'emergency'>('basic');
  const [stepError, setStepError] = useState<string>('');
  const steps = ['basic', 'employment', 'salary', 'bank', 'emergency'] as const;
  const stepLabels = ['Basic Details', 'Employment & Org', 'Compensation', 'Bank & Statutory', 'Emergency Contact'];
  const activeStepIndex = steps.indexOf(activeTab);

  const departments = storageService.getDepartments(currentCompany?.id);
  const designations = storageService.getDesignations(currentCompany?.id);
  const existingEmployees = storageService.getEmployees(currentCompany?.id);

  // Form State
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('1995-01-01');
  const [gender, setGender] = useState<Employee['gender']>('PREFER_NOT_TO_SAY');

  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [designationId, setDesignationId] = useState<string>('');
  const [reportingManagerId, setReportingManagerId] = useState<string>('');
  const [dateOfJoining, setDateOfJoining] = useState<string>(new Date().toISOString().split('T')[0]);
  const [employmentType, setEmploymentType] = useState<EmploymentType>('FULL_TIME');
  const [status, setStatus] = useState<EmployeeStatus>('ACTIVE');
  const [workLocation, setWorkLocation] = useState<string>('Bengaluru (Hybrid)');
  const [skillsStr, setSkillsStr] = useState<string>('TypeScript, React, Node.js');

  // Salary
  const [basicSalary, setBasicSalary] = useState<number>(60000);
  const [hra, setHra] = useState<number>(24000);
  const [allowances, setAllowances] = useState<number>(8000);
  const [providentFund, setProvidentFund] = useState<number>(7200);
  const [taxDeduction, setTaxDeduction] = useState<number>(5000);
  const [currency, setCurrency] = useState<string>('INR');

  // Bank
  const [bankName, setBankName] = useState<string>('State Bank of India');
  const [accountNumber, setAccountNumber] = useState<string>('••••••••9841');
  const [routingOrIfsc, setRoutingOrIfsc] = useState<string>('SBIN0001234');
  const [taxIdentifier, setTaxIdentifier] = useState<string>('ABCDE1234F');

  // Emergency
  const [emergencyName, setEmergencyName] = useState<string>('');
  const [emergencyRelation, setEmergencyRelation] = useState<string>('Spouse');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');

  useEffect(() => {
    setActiveTab('basic');
    setStepError('');
    if (employeeToEdit) {
      setFirstName(employeeToEdit.firstName);
      setLastName(employeeToEdit.lastName);
      setEmail(employeeToEdit.email);
      setPhone(employeeToEdit.phone);
      setAvatarUrl(employeeToEdit.avatarUrl || '');
      setDateOfBirth(employeeToEdit.dateOfBirth);
      setGender(employeeToEdit.gender);

      setEmployeeCode(employeeToEdit.employeeCode);
      setDepartmentId(employeeToEdit.departmentId);
      setDesignationId(employeeToEdit.designationId);
      setReportingManagerId(employeeToEdit.reportingManagerId || '');
      setDateOfJoining(employeeToEdit.dateOfJoining);
      setEmploymentType(employeeToEdit.employmentType);
      setStatus(employeeToEdit.status);
      setWorkLocation(employeeToEdit.workLocation);
      setSkillsStr(employeeToEdit.skills?.join(', ') || '');

      setBasicSalary(employeeToEdit.salary.basic);
      setHra(employeeToEdit.salary.hra);
      setAllowances(employeeToEdit.salary.allowances);
      setProvidentFund(employeeToEdit.salary.providentFund);
      setTaxDeduction(employeeToEdit.salary.taxDeduction);
      setCurrency(employeeToEdit.salary.currency);

      setBankName(employeeToEdit.bankDetails.bankName);
      setAccountNumber(employeeToEdit.bankDetails.accountNumber);
      setRoutingOrIfsc(employeeToEdit.bankDetails.routingOrIfsc);
      setTaxIdentifier(employeeToEdit.bankDetails.taxIdentifier);

      setEmergencyName(employeeToEdit.emergencyContact.name);
      setEmergencyRelation(employeeToEdit.emergencyContact.relationship);
      setEmergencyPhone(employeeToEdit.emergencyContact.phone);
    } else {
      // Reset for new employee
      const randomId = Math.floor(1000 + Math.random() * 9000);
      setEmployeeCode(`EMP-${randomId}`);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setAvatarUrl(`https://images.unsplash.com/photo-${1534528741775 + randomId % 1000}?w=150&auto=format&fit=crop&q=80`);
      if (departments.length > 0) setDepartmentId(departments[0].id);
      if (designations.length > 0) setDesignationId(designations[0].id);
    }
  }, [employeeToEdit, isOpen]);

  if (!isOpen) return null;

  const validateStep = (step: typeof activeTab): string => {
    if (step === 'basic' && (!firstName.trim() || !lastName.trim() || !email.trim())) return 'First name, last name, and work email are required.';
    if (step === 'employment' && (!employeeCode.trim() || !dateOfJoining || !departmentId || !designationId)) return 'Employee code, joining date, department, and designation are required.';
    if (step === 'salary' && Number(basicSalary) <= 0) return 'Basic monthly salary must be greater than zero.';
    if (step === 'bank' && (!bankName.trim() || !accountNumber.trim() || !routingOrIfsc.trim() || !taxIdentifier.trim())) return 'Bank name, account number, IFSC code, and PAN are required.';
    if (step === 'emergency' && (!emergencyName.trim() || !emergencyPhone.trim())) return 'Emergency contact name and phone are required.';
    return '';
  };

  const goToStep = (step: typeof activeTab) => {
    setStepError('');
    setActiveTab(step);
  };

  const handleNext = () => {
    const error = validateStep(activeTab);
    if (error) { setStepError(error); return; }
    if (activeStepIndex < steps.length - 1) goToStep(steps[activeStepIndex + 1]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const step of steps) {
      const error = validateStep(step);
      if (error) { setActiveTab(step); setStepError(error); return; }
    }

    const newEmp: Employee = {
      id: employeeToEdit ? employeeToEdit.id : `emp-${Date.now()}`,
      companyId: currentCompany?.id || '',
      employeeCode: employeeCode || `EMP-${Date.now()}`,
      firstName,
      lastName,
      email,
      phone,
      avatarUrl: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      dateOfBirth,
      gender,
      departmentId: departmentId || departments[0]?.id || '',
      designationId: designationId || designations[0]?.id || '',
      reportingManagerId: reportingManagerId || undefined,
      dateOfJoining,
      employmentType,
      status,
      workLocation,
      skills: skillsStr.split(',').map(s => s.trim()).filter(Boolean),
      salary: {
        basic: Number(basicSalary),
        hra: Number(hra),
        allowances: Number(allowances),
        providentFund: Number(providentFund),
        taxDeduction: Number(taxDeduction),
        currency,
      },
      bankDetails: {
        bankName,
        accountNumber,
        routingOrIfsc,
        taxIdentifier,
      },
      emergencyContact: {
        name: emergencyName,
        relationship: emergencyRelation,
        phone: emergencyPhone,
      },
      createdAt: employeeToEdit ? employeeToEdit.createdAt : new Date().toISOString(),
    };

    try {
      if (employeeToEdit) {
        storageService.saveEmployee(newEmp);
      } else {
        const onboarded = await api.onboardEmployee({
          employeeCode: newEmp.employeeCode, firstName: newEmp.firstName, lastName: newEmp.lastName,
          email: newEmp.email, departmentId: newEmp.departmentId, designationId: newEmp.designationId,
          reportingManagerId: newEmp.reportingManagerId, dateOfJoining: newEmp.dateOfJoining,
          employmentType: newEmp.employmentType, workLocation: newEmp.workLocation, phone: newEmp.phone,
        });
        newEmp.id = onboarded.data.employee.id;
        storageService.saveEmployee(newEmp, false);
      }
    } catch (caught) {
      setStepError(caught instanceof Error ? caught.message : 'Employee onboarding failed.');
      return;
    }

    storageService.logAudit({
      companyId: currentCompany?.id || '',
      userId: currentUser?.id || '',
      userName: currentUser?.fullName || 'Admin',
      userRole: currentUser?.role || 'ADMIN',
      action: employeeToEdit ? 'UPDATE_EMPLOYEE' : 'CREATE_EMPLOYEE',
      category: 'EMPLOYEE',
      details: `${employeeToEdit ? 'Updated' : 'Added new'} employee profile: ${newEmp.firstName} ${newEmp.lastName} (${newEmp.employeeCode}).`,
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
    });

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950">
      <div className="employee-onboarding-page relative w-full h-full bg-slate-900 overflow-hidden z-10 animate-fade-in flex flex-col">
        {/* Modal Header */}
        <div className="employee-onboarding-header px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {employeeToEdit ? `Edit Employee Profile • ${employeeToEdit.firstName} ${employeeToEdit.lastName}` : 'Add New Employee to Workspace'}
              </h2>
              <p className="text-xs text-slate-400">Complete employee lifecycle, salary structure, and organization profile</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="employee-onboarding-nav flex justify-center px-6 pt-3 border-b border-slate-800 bg-slate-900 space-x-2 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => goToStep('basic')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'basic' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Basic Details</span>
          </button>

          <button
            type="button"
            onClick={() => goToStep('employment')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'employment' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Employment & Org</span>
          </button>

          <button
            type="button"
            onClick={() => goToStep('salary')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'salary' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Compensation & Salary</span>
          </button>

          <button
            type="button"
            onClick={() => goToStep('bank')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'bank' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Bank & Statutory</span>
          </button>

          <button
            type="button"
            onClick={() => goToStep('emergency')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center space-x-1.5 ${
              activeTab === 'emergency' ? 'border-brand-500 text-brand-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Emergency Contact</span>
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="employee-onboarding-form flex-1 overflow-y-auto scroll-smooth p-6 md:p-8 space-y-6 text-xs">
          <div className="mx-auto max-w-6xl rounded-2xl border border-brand-500/20 bg-gradient-to-r from-brand-500/10 to-indigo-500/10 p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">Step {activeStepIndex + 1} of {steps.length}</p>
            <h3 className="mt-1 text-xl font-black text-white">Complete this section to continue</h3>
            <p className="mt-1 text-slate-400">Your information is preserved while moving between tabs.</p>
          </div>
          {stepError && <div className="mx-auto max-w-6xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-300 font-medium">{stepError}</div>}
          {/* TAB 1: BASIC DETAILS */}
          {activeTab === 'basic' && <section id="onboarding-basic" className="employee-onboarding-section mx-auto max-w-6xl space-y-4" data-title="01 · Basic Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Marcus"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Chen"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Work Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marcus.chen@company.com"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="NON_BINARY">Non-Binary</option>
                    <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Avatar Image URL</label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500 text-[11px]"
                  />
                </div>
              </div>
          </section>}

          {/* TAB 2: EMPLOYMENT */}
          {activeTab === 'employment' && <section id="onboarding-employment" className="employee-onboarding-section mx-auto max-w-6xl space-y-4" data-title="02 · Employment & Organization">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Employee Code / ID *</label>
                  <input
                    type="text"
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    placeholder="APX-1009"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Date of Joining *</label>
                  <input
                    type="date"
                    required
                    value={dateOfJoining}
                    onChange={(e) => setDateOfJoining(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department *</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Designation / Title *</label>
                  <select
                    value={designationId}
                    onChange={(e) => setDesignationId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {designations.map((desig) => (
                      <option key={desig.id} value={desig.id}>{desig.title} ({desig.gradeLevel})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="FULL_TIME">Full-Time</option>
                    <option value="PART_TIME">Part-Time</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="INTERN">Intern</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Employment Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="ON_PROBATION">On Probation</option>
                    <option value="ON_LEAVE">On Leave</option>
                    <option value="RESIGNED">Resigned</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Work Location</label>
                  <input
                    type="text"
                    value={workLocation}
                    onChange={(e) => setWorkLocation(e.target.value)}
                    placeholder="HQ / Remote"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Skills & Technical Competencies (Comma-separated)</label>
                <input
                  type="text"
                  value={skillsStr}
                  onChange={(e) => setSkillsStr(e.target.value)}
                  placeholder="React, TypeScript, Python, Architecture"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
          </section>}

          {/* TAB 3: SALARY */}
          {activeTab === 'salary' && <section id="onboarding-salary" className="employee-onboarding-section mx-auto max-w-6xl space-y-4" data-title="03 · Compensation & Salary">
              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300 text-[11px]">
                Define statutory compensation structure. Gross and net payout will be automatically computed during monthly payroll runs.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Basic Monthly Salary ({currencySymbol}) *</label>
                  <input
                    type="number"
                    required
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">HRA Allowance ({currencySymbol})</label>
                  <input
                    type="number"
                    value={hra}
                    onChange={(e) => setHra(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Special Allowances ({currencySymbol})</label>
                  <input
                    type="number"
                    value={allowances}
                    onChange={(e) => setAllowances(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Provident Fund (PF) Deduction ({currencySymbol})</label>
                  <input
                    type="number"
                    value={providentFund}
                    onChange={(e) => setProvidentFund(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Statutory Tax / TDS Deduction ({currencySymbol})</label>
                  <input
                    type="number"
                    value={taxDeduction}
                    onChange={(e) => setTaxDeduction(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Calculated Summary */}
              <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 grid grid-cols-3 text-center">
                <div>
                  <div className="text-[11px] text-slate-400">Total Monthly Gross</div>
                  <div className="text-base font-bold text-white font-mono mt-0.5">
                    {currencySymbol}{(Number(basicSalary) + Number(hra) + Number(allowances)).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Total Monthly Deductions</div>
                  <div className="text-base font-bold text-rose-400 font-mono mt-0.5">
                    -{currencySymbol}{(Number(providentFund) + Number(taxDeduction)).toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Estimated Net Pay</div>
                  <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                    {currencySymbol}{((Number(basicSalary) + Number(hra) + Number(allowances)) - (Number(providentFund) + Number(taxDeduction))).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
          </section>}

          {/* TAB 4: BANK */}
          {activeTab === 'bank' && <section id="onboarding-bank" className="employee-onboarding-section mx-auto max-w-6xl space-y-4" data-title="04 · Bank & Statutory">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="SBI / HDFC Bank / ICICI Bank"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Account Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="••••••••4821"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Routing Number / IFSC Code</label>
                  <input
                    type="text"
                    value={routingOrIfsc}
                    onChange={(e) => setRoutingOrIfsc(e.target.value)}
                    placeholder="SBIN0001234"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">PAN Identifier</label>
                  <input
                    type="text"
                    value={taxIdentifier}
                    onChange={(e) => setTaxIdentifier(e.target.value)}
                    placeholder="ABCDE1234F"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
          </section>}

          {/* TAB 5: EMERGENCY */}
          {activeTab === 'emergency' && <section id="onboarding-emergency" className="employee-onboarding-section mx-auto max-w-6xl space-y-4" data-title="05 · Emergency Contact">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Grace Chen"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Relationship</label>
                  <select
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Partner">Partner</option>
                    <option value="Friend">Friend</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Emergency Phone</label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
          </section>}

          {/* Footer Submit Actions */}
          <div className="employee-onboarding-actions sticky bottom-0 mx-auto max-w-6xl rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium">Cancel</button>
              {activeStepIndex > 0 && (
                <button type="button" onClick={() => goToStep(steps[activeStepIndex - 1])} className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl font-medium">Back</button>
              )}
            </div>

            {activeTab !== 'emergency' ? (
              <button type="button" onClick={handleNext} className="employee-step-primary px-6 py-2.5 rounded-xl font-bold">
                <span>Continue: {stepLabels[activeStepIndex + 1]}</span>
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button type="submit" className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold flex items-center space-x-1.5 shadow-md shadow-emerald-500/25">
                <Check className="w-4 h-4" />
                <span>{employeeToEdit ? 'Update Employee Profile' : 'Save & Provision Employee'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
