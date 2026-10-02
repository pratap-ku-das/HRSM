import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  ShieldCheck,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import type {
  Department,
  Designation,
  Employee,
  EmployeeOnboardingDraft,
  PayrollConfiguration,
} from '../../types';
import { useToast } from '../../context/ToastContext';

const steps = [
  'Personal',
  'Documents',
  'Salary',
  'Face authentication',
  'Additional',
  'Review',
] as const;
const documentTypes = [
  ['AADHAAR', 'Aadhaar card'],
  ['PAN', 'PAN card'],
  ['PASSPORT', 'Passport'],
  ['DRIVING_LICENCE', 'Driving licence'],
  ['VOTER_ID', 'Voter ID'],
  ['ADDRESS_PROOF', 'Address proof'],
  ['EDUCATION_CERTIFICATE', 'Education certificate'],
  ['EXPERIENCE_CERTIFICATE', 'Experience certificate'],
  ['BANK_DOCUMENT', 'Bank document'],
  ['JOINING_DOCUMENT', 'Joining document'],
  ['OTHER', 'Other document'],
] as const;
type Props = {
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  employee?: Employee;
  onClose: () => void;
  onCompleted: () => Promise<void>;
};
const today = () => new Date().toISOString().slice(0, 10);
const normalizeChoice = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[ -]+/g, '_')
    : '';

export const EmployeeOnboardingWizard: React.FC<Props> = ({
  departments,
  designations,
  employees,
  employee,
  onClose,
  onCompleted,
}) => {
  const editing = Boolean(employee);
  const toast = useToast(),
    [step, setStep] = useState(0),
    [draft, setDraft] = useState<EmployeeOnboardingDraft | null>(null),
    [payroll, setPayroll] = useState<PayrollConfiguration | null>(null),
    [busy, setBusy] = useState(true);
  const [personal, setPersonal] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    gender: '',
    dateOfBirth: '',
    bloodGroup: '',
    personalEmail: '',
    mobileNumber: '',
    alternateMobileNumber: '',
    fatherName: '',
    motherName: '',
    maritalStatus: '',
    nationality: 'Indian',
    currentAddress: '',
    permanentAddress: '',
    city: '',
    state: '',
    country: 'India',
    pinCode: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    emergencyContactRelationship: '',
  });
  const [sameAddress, setSameAddress] = useState(false),
    [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]),
    [uploadingDocument, setUploadingDocument] = useState(false),
    [selectedDocumentType, setSelectedDocumentType] = useState('');
  const [salary, setSalary] = useState({
    structureId: '',
    annualCtc: 0,
    effectiveFrom: today(),
    componentValues: {},
    reason: 'Initial salary',
  });
  const [face, setFace] = useState({
    required: false,
    status: 'NOT_REGISTERED',
  });
  const [additional, setAdditional] = useState({
    employeeCode: '',
    workEmail: '',
    departmentId: '',
    designationId: '',
    reportingManagerId: '',
    employmentType: 'FULL_TIME',
    workLocation: '',
    workdayGpsTrackingEnabled: false,
    dateOfJoining: today(),
    probationPeriodMonths: 3,
    weeklyOff: [0, 6],
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    bankBranch: '',
    previousEmployer: '',
    totalExperience: 0,
    skills: [] as string[],
    remarks: '',
    customFields: {},
  });
  useEffect(() => {
    void (async () => {
      try {
        const [d, p] = await Promise.all([
          employee
            ? api.getEmployeeOnboardingRecord(employee.id)
            : api.createEmployeeOnboarding(),
          api.getPayrollConfiguration(),
        ]);
        setDraft(d);
        setPayroll(p);
        const savedPersonal = d.personalDetails || {};
        setPersonal((old) => ({
          ...old,
          ...savedPersonal,
          gender: normalizeChoice(savedPersonal.gender) || old.gender,
          bloodGroup:
            normalizeChoice(savedPersonal.bloodGroup) || old.bloodGroup,
          maritalStatus:
            normalizeChoice(savedPersonal.maritalStatus) || old.maritalStatus,
        }));
        setDocuments(d.documentDetails?.documents || []);
        setSalary((old) => ({
          ...old,
          structureId: p.structures[0]?.id || '',
          ...(d.salaryDetails || {}),
        }));
        setFace((old) => ({ ...old, ...(d.faceDetails || {}) }));
        setAdditional((old) => ({
          ...old,
          departmentId: departments[0]?.id || '',
          designationId:
            designations.find((x) => x.departmentId === departments[0]?.id)
              ?.id || '',
          ...(d.additionalDetails || {}),
        }));
        const details = d.personalDetails || {};
        setSameAddress(
          Boolean(
            details.currentAddress &&
            details.currentAddress === details.permanentAddress,
          ),
        );
      } catch (error) {
        toast.error(
          employee
            ? 'Employee record could not be loaded'
            : 'Onboarding could not start',
          error instanceof Error ? error.message : 'Unknown error',
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [employee?.id]);
  const availableDesignations = useMemo(
    () =>
      designations.filter((x) => x.departmentId === additional.departmentId),
    [designations, additional.departmentId],
  );
  const uploadDocument = async (file?: File) => {
    if (!file) return;
    if (!selectedDocumentType) {
      toast.error('Select document name', 'Choose the document type before uploading the file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Document is too large', 'Choose a file smaller than 20 MB.');
      return;
    }
    setUploadingDocument(true);
    try {
      const uploaded = await api.uploadEmployeeOnboardingDocument(file);
      const selected = documentTypes.find(([value]) => value === selectedDocumentType);
      setDocuments((current) => [
        ...current,
        {
          ...uploaded,
          documentType: selectedDocumentType,
          title: selected?.[1] || uploaded.title,
        },
      ]);
      setSelectedDocumentType('');
      toast.success('Document uploaded', file.name);
    } catch (error) {
      toast.error(
        'Document upload failed',
        error instanceof Error ? error.message : 'Choose a supported document.',
      );
    } finally {
      setUploadingDocument(false);
    }
  };
  const section = async () => {
    if (!draft) throw new Error('Onboarding record is not ready.');
    const name =
      step === 0
        ? 'personal'
        : step === 1
          ? 'documents'
          : step === 2
            ? 'salary'
            : step === 3
              ? 'face'
              : 'additional';
    const body =
      step === 0
        ? {
            ...personal,
            permanentAddress: sameAddress
              ? personal.currentAddress
              : personal.permanentAddress,
          }
        : step === 1
          ? { documents }
          : step === 2
            ? salary
            : step === 3
              ? face
              : {
                  ...additional,
                  reportingManagerId:
                    additional.reportingManagerId || undefined,
                  skills: additional.skills,
                };
    if (editing && employee) {
      await api.updateEmployeeOnboardingSection(employee.id, name, body);
      return draft;
    }
    return api.saveEmployeeOnboardingSection(draft.id, name, body);
  };
  const next = async () => {
    setBusy(true);
    try {
      const value = await section();
      setDraft(value);
      setStep((value) => Math.min(5, value + 1));
      if (step === 4 && !editing) {
        const reviewed = await api.reviewEmployeeOnboarding(draft!.id);
        setDraft(reviewed);
      }
    } catch (error) {
      toast.error(
        'Step could not be saved',
        error instanceof Error ? error.message : 'Check the required fields.',
      );
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      if (editing) {
        if (!employee) throw new Error('Employee record is not ready.');
        await api.updateEmployeeOnboardingSection(employee.id, 'personal', {
          ...personal,
          permanentAddress: sameAddress
            ? personal.currentAddress
            : personal.permanentAddress,
        });
        await api.updateEmployeeOnboardingSection(employee.id, 'documents', {
          documents,
        });
        await api.updateEmployeeOnboardingSection(
          employee.id,
          'salary',
          salary,
        );
        await api.updateEmployeeOnboardingSection(employee.id, 'face', face);
        await api.updateEmployeeOnboardingSection(employee.id, 'additional', {
          ...additional,
          reportingManagerId: additional.reportingManagerId || undefined,
          skills: additional.skills,
        });
        await onCompleted();
        toast.success(
          'Employee onboarding updated',
          'All saved onboarding sections are synchronized with the employee record.',
        );
        onClose();
        return;
      }
      const result = await api.completeEmployeeOnboarding(draft.id);
      toast.success(
        'Employee invited',
        `Activation email queued for ${result.employee.email}.`,
      );
      await onCompleted();
      onClose();
    } catch (error) {
      toast.error(
        editing
          ? 'Employee update could not be completed'
          : 'Onboarding could not be completed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };
  const input = (
    label: string,
    key: keyof typeof personal,
    type = 'text',
    required = false,
  ) => (
    <label className="space-y-1 text-xs">
      <span>{label}</span>
      <input
        required={required}
        type={type}
        value={String(personal[key])}
        onChange={(e) => setPersonal({ ...personal, [key]: e.target.value })}
        className="input w-full"
      />
    </label>
  );
  if (busy && !draft)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80">
        <div className="rounded-2xl bg-slate-900 p-8">
          Preparing secure onboarding…
        </div>
      </div>
    );
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 p-3 md:p-8">
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-800 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <UserPlus className="text-brand-400" />
              {editing
                ? 'Edit complete employee onboarding'
                : 'Employee onboarding'}
            </h2>
            <p className="text-xs text-slate-400">
              Draft {draft?.id.slice(0, 8)} · autosaved step by step
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-800"
          >
            <X />
          </button>
        </header>
        <div className="grid lg:grid-cols-[240px_1fr]">
          <aside className="border-b border-slate-800 p-4 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {steps.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    if (editing || index < step) setStep(index);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ${step === index ? 'bg-brand-500 text-white' : index < step ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-500'}`}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-current">
                    {index < step ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${draft?.progress || 0}%` }}
              />
            </div>
          </aside>
          <main className="min-h-[560px] p-5 md:p-7">
            {step === 0 && (
              <div>
                <Title
                  title="Personal details"
                  detail="Identity, contact, address and emergency information"
                />
                <div className="grid gap-3 md:grid-cols-3">
                  {input('First name', 'firstName', 'text', true)}
                  {input('Middle name', 'middleName')}
                  {input('Last name', 'lastName', 'text', true)}
                  <Field label={'Gender'}>
                    <select
                      required
                      value={personal.gender}
                      onChange={(event) =>
                        setPersonal({ ...personal, gender: event.target.value })
                      }
                      className={'input w-full'}
                    >
                      <option value={''}>Select gender</option>
                      <option value={'MALE'}>Male</option>
                      <option value={'FEMALE'}>Female</option>
                      <option value={'NON_BINARY'}>Non-binary</option>
                      <option value={'PREFER_NOT_TO_SAY'}>Prefer not to say</option>
                    </select>
                  </Field>
                  {input('Date of birth', 'dateOfBirth', 'date', true)}
                  <Field label={'Blood group'}>
                    <select
                      value={personal.bloodGroup}
                      onChange={(event) =>
                        setPersonal({
                          ...personal,
                          bloodGroup: event.target.value,
                        })
                      }
                      className={'input w-full'}
                    >
                      <option value={''}>Select blood group</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(
                        (group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  {input('Personal email', 'personalEmail', 'email', true)}
                  {input('Mobile number', 'mobileNumber', 'tel', true)}
                  {input('Alternate mobile', 'alternateMobileNumber', 'tel')}
                  {input("Father's name", 'fatherName')}
                  {input("Mother's name", 'motherName')}
                  <Field label={'Marital status'}>
                    <select
                      value={personal.maritalStatus}
                      onChange={(event) =>
                        setPersonal({
                          ...personal,
                          maritalStatus: event.target.value,
                        })
                      }
                      className={'input w-full'}
                    >
                      <option value={''}>Select marital status</option>
                      <option value={'SINGLE'}>Single</option>
                      <option value={'MARRIED'}>Married</option>
                      <option value={'DIVORCED'}>Divorced</option>
                      <option value={'WIDOWED'}>Widowed</option>
                      <option value={'SEPARATED'}>Separated</option>
                      <option value={'PREFER_NOT_TO_SAY'}>Prefer not to say</option>
                    </select>
                  </Field>
                  {input('Nationality', 'nationality', 'text', true)}
                  {input('City', 'city', 'text', true)}
                  {input('State', 'state', 'text', true)}
                  {input('Country', 'country', 'text', true)}
                  {input('PIN code', 'pinCode', 'text', true)}
                  {input(
                    'Emergency contact',
                    'emergencyContactName',
                    'text',
                    true,
                  )}
                  {input(
                    'Emergency number',
                    'emergencyContactNumber',
                    'tel',
                    true,
                  )}
                  {input(
                    'Relationship',
                    'emergencyContactRelationship',
                    'text',
                    true,
                  )}
                  <label className="space-y-1 text-xs md:col-span-3">
                    <span>Current address</span>
                    <textarea
                      required
                      value={personal.currentAddress}
                      onChange={(e) =>
                        setPersonal({
                          ...personal,
                          currentAddress: e.target.value,
                        })
                      }
                      className="input min-h-20 w-full"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs md:col-span-3">
                    <input
                      type="checkbox"
                      checked={sameAddress}
                      onChange={(e) => setSameAddress(e.target.checked)}
                    />
                    Permanent address is the same
                  </label>
                  {!sameAddress && (
                    <label className="space-y-1 text-xs md:col-span-3">
                      <span>Permanent address</span>
                      <textarea
                        required
                        value={personal.permanentAddress}
                        onChange={(e) =>
                          setPersonal({
                            ...personal,
                            permanentAddress: e.target.value,
                          })
                        }
                        className="input min-h-20 w-full"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            {step === 1 && (
              <div>
                <Title
                  title="Document details"
                  detail="Upload employee documents securely. PDF, JPG, PNG, DOC, and DOCX files up to 20 MB are supported."
                />
                <div className="flex max-w-2xl flex-col gap-3 sm:flex-row">
                  <select
                    value={selectedDocumentType}
                    onChange={(event) =>
                      setSelectedDocumentType(event.target.value)
                    }
                    className="input min-w-64"
                    aria-label="Document name"
                  >
                    <option value="">Select document name</option>
                    {documentTypes.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label
                    className={
                      'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500/20 px-4 py-2 text-indigo-300 ' +
                      (uploadingDocument || !selectedDocumentType
                        ? 'pointer-events-none cursor-not-allowed opacity-50'
                        : 'cursor-pointer')
                    }
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingDocument
                      ? 'Uploading document...'
                      : 'Upload document'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="sr-only"
                      disabled={uploadingDocument || !selectedDocumentType}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void uploadDocument(file);
                      }}
                    />
                  </label>
                </div>
                <div className="mt-4 space-y-2">
                  {documents.map((document, index) => (
                    <div
                      key={String(document.id || document.objectKey || index)}
                      className="grid gap-2 rounded-xl border border-slate-800 p-3 md:grid-cols-[1fr_1fr_1.2fr_auto]"
                    >
                      <div className="min-w-0 rounded-xl bg-slate-950/50 px-3 py-2">
                        <div className="truncate text-xs font-semibold">
                          {String(document.fileName || 'Document')}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {Math.max(
                            1,
                            Math.ceil(Number(document.sizeBytes || 0) / 1024),
                          )}{' '}
                          KB
                        </div>
                      </div>
                      <select
                        value={String(document.documentType)}
                        onChange={(e) =>
                          setDocuments(
                            documents.map((x, i) =>
                              i === index
                                ? { ...x, documentType: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className="input"
                      >
                        {documentTypes.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={String(document.title)}
                        onChange={(e) =>
                          setDocuments(
                            documents.map((x, i) =>
                              i === index ? { ...x, title: e.target.value } : x,
                            ),
                          )
                        }
                        className="input"
                        placeholder="Title"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDocuments(documents.filter((_, i) => i !== index))
                        }
                        className="px-3 text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div>
                <Title
                  title="Salary details"
                  detail="An effective-dated salary revision preserves payroll history."
                />
                <div className="grid max-w-2xl gap-4 md:grid-cols-2">
                  <Field label="Salary structure">
                    <select
                      required
                      value={salary.structureId}
                      onChange={(e) =>
                        setSalary({ ...salary, structureId: e.target.value })
                      }
                      className="input w-full"
                    >
                      <option value="">Select structure</option>
                      {payroll?.structures.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Annual CTC">
                    <input
                      type="number"
                      min="1"
                      value={salary.annualCtc || ''}
                      onChange={(e) =>
                        setSalary({
                          ...salary,
                          annualCtc: Number(e.target.value),
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Effective from">
                    <input
                      type="date"
                      value={salary.effectiveFrom}
                      onChange={(e) =>
                        setSalary({ ...salary, effectiveFrom: e.target.value })
                      }
                      className="input w-full"
                    />
                  </Field>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <Title
                  title="Face authentication"
                  detail="OrbitHR stores only the approved provider face reference, never the raw image."
                />
                <div className="max-w-xl rounded-2xl border border-slate-800 p-5">
                  <ShieldCheck className="h-10 w-10 text-emerald-300" />
                  <h3 className="mt-3 font-semibold">Face setup policy</h3>
                  <label className="mt-4 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={face.required}
                      onChange={(e) =>
                        setFace({ ...face, required: e.target.checked })
                      }
                    />
                    Require enrollment before completion
                  </label>
                  <select
                    disabled={editing}
                    value={face.status}
                    onChange={(e) =>
                      setFace({ ...face, status: e.target.value })
                    }
                    className="input mt-4 w-full"
                  >
                    <option value="NOT_REGISTERED">Not registered</option>
                    <option value="REGISTRATION_IN_PROGRESS">
                      Registration in progress
                    </option>
                    <option value="REGISTERED">Registered</option>
                    <option value="VERIFICATION_FAILED">
                      Verification failed
                    </option>
                  </select>
                  <p className="mt-3 text-xs text-slate-500">
                    If mandatory face enrollment is selected, complete approved
                    face enrollment before final submission.
                  </p>
                </div>
              </div>
            )}
            {step === 4 && (
              <div>
                <label className={'mb-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm'}>
                  <span><strong className={'block text-slate-900'}>Workday GPS route tracking</strong><small className={'text-slate-500'}>Track only between Android clock-in and clock-out. A persistent notification tells the employee when tracking is active.</small></span>
                  <input type={'checkbox'} checked={additional.workdayGpsTrackingEnabled} onChange={e=>setAdditional({...additional,workdayGpsTrackingEnabled:e.target.checked})} className={'h-5 w-5 accent-brand-500'} />
                </label>
                <Title
                  title="Additional details"
                  detail="Employment, organization and protected bank information."
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Employee ID">
                    <input
                      required
                      value={additional.employeeCode}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          employeeCode: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Work email">
                    <input
                      required
                      type="email"
                      value={additional.workEmail}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          workEmail: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Joining date">
                    <input
                      type="date"
                      value={additional.dateOfJoining}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          dateOfJoining: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Department">
                    <select
                      value={additional.departmentId}
                      onChange={(e) => {
                        const departmentId = e.target.value;
                        setAdditional({
                          ...additional,
                          departmentId,
                          designationId:
                            designations.find(
                              (x) => x.departmentId === departmentId,
                            )?.id || '',
                        });
                      }}
                      className="input w-full"
                    >
                      {departments.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Designation">
                    <select
                      value={additional.designationId}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          designationId: e.target.value,
                        })
                      }
                      className="input w-full"
                    >
                      {availableDesignations.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reporting manager">
                    <select
                      value={additional.reportingManagerId}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          reportingManagerId: e.target.value,
                        })
                      }
                      className="input w-full"
                    >
                      <option value="">None</option>
                      {employees.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.firstName} {x.lastName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Employment type">
                    <select
                      value={additional.employmentType}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          employmentType: e.target.value,
                        })
                      }
                      className="input w-full"
                    >
                      {[
                        'FULL_TIME',
                        'PART_TIME',
                        'CONTRACT',
                        'INTERN',
                        'CONSULTANT',
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Work location">
                    <input
                      value={additional.workLocation}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          workLocation: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Probation months">
                    <input
                      type="number"
                      min="0"
                      max="36"
                      value={additional.probationPeriodMonths}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          probationPeriodMonths: Number(e.target.value),
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Account holder">
                    <input
                      value={additional.accountHolderName}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          accountHolderName: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Bank name">
                    <input
                      value={additional.bankName}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          bankName: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Account number">
                    <input
                      type="password"
                      value={additional.accountNumber}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          accountNumber: e.target.value,
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="IFSC">
                    <input
                      value={additional.ifsc}
                      onChange={(e) =>
                        setAdditional({ ...additional, ifsc: e.target.value })
                      }
                      className="input w-full"
                    />
                  </Field>
                  <Field label="Skills">
                    <input
                      value={additional.skills.join(', ')}
                      onChange={(e) =>
                        setAdditional({
                          ...additional,
                          skills: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                      className="input w-full"
                    />
                  </Field>
                </div>
              </div>
            )}
            {step === 5 && (
              <div>
                <Title
                  title="Review and create employee"
                  detail="Verify every section before creating the account and invitation."
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {steps.slice(0, 5).map((name, index) => (
                    <button
                      key={name}
                      onClick={() => setStep(index)}
                      className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left"
                    >
                      <span>
                        <b>{name}</b>
                        <small className="block text-slate-500">
                          Completed · Edit
                        </small>
                      </span>
                      <Check className="text-emerald-300" />
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
                  Submitting creates the employee, portal user, salary history,
                  document records and one-time activation invitation in one
                  database transaction.
                </div>
              </div>
            )}
          </main>
        </div>
        <footer className="flex justify-between border-t border-slate-800 p-5">
          <button
            disabled={step === 0 || busy}
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 disabled:opacity-40"
          >
            <ArrowLeft className="h-4" />
            Back
          </button>
          {step < 5 ? (
            <button
              disabled={busy}
              onClick={() => void next()}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 font-semibold"
            >
              Save & continue
              <ArrowRight className="h-4" />
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => void complete()}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2 font-semibold text-white"
            >
              <Check className="h-4" />
              {editing ? 'Finish editing' : 'Create employee & invite'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
const Title = ({ title, detail }: { title: string; detail: string }) => (
  <div className="mb-5">
    <h3 className="text-lg font-bold">{title}</h3>
    <p className="text-sm text-slate-400">{detail}</p>
  </div>
);
const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="space-y-1 text-xs">
    <span>{label}</span>
    {children}
  </label>
);
