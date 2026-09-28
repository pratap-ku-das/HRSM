import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Mail, Pencil, Save, Search, Trash2, UserPlus, Users, RefreshCw, X } from "lucide-react";
import { api } from "../../services/api";
import type {
  Department,
  Designation,
  Employee,
  EmployeeStatus,
  EmploymentType,
} from "../../types";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { FaceEnrollmentPanel } from "./FaceEnrollmentPanel";
import { EmployeeOnboardingWizard } from "./EmployeeOnboardingWizard";
export const EmployeeDirectory: React.FC = () => {
  const toast = useToast(),
    [employees, setEmployees] = useState<Employee[]>([]),
    [departments, setDepartments] = useState<Department[]>([]),
    [designations, setDesignations] = useState<Designation[]>([]),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL"),
    [faceEmployeeId, setFaceEmployeeId] = useState<string | null>(null),
    [onboardingResult, setOnboardingResult] = useState<{ employeeId: string; email: string; emailStatus: string } | null>(null),
    [resendingId, setResendingId] = useState<string | null>(null),
    [showWizard, setShowWizard] = useState(false),
    [editing, setEditing] = useState<Employee | null>(null),
    [savingId, setSavingId] = useState<string | null>(null),
    [exitDate, setExitDate] = useState<Record<string, string>>({}),
    [form, setForm] = useState({
      employeeCode: "",
      firstName: "",
      lastName: "",
      email: "",
      departmentId: "",
      designationId: "",
      dateOfJoining: new Date().toISOString().slice(0, 10),
      employmentType: "FULL_TIME" as EmploymentType,
      phone: "",
    });
  const { currentUser, currentCompany } = useAuth();
  const canManage = currentUser?.permissions?.includes("employee.manage") || ["SUPER_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"].includes(currentUser?.role || "");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [peopleResult, unitsResult, rolesResult] = await Promise.allSettled([
        api.getEmployeesV1(),
        api.getDepartmentsV1(),
        api.getDesignationsV1(),
      ]);
      if (peopleResult.status === "rejected") throw peopleResult.reason;
      const people = peopleResult.value;
      const units = unitsResult.status === "fulfilled" ? unitsResult.value : [];
      const roles = rolesResult.status === "fulfilled" ? rolesResult.value : [];
      setEmployees(people);
      setDepartments(units);
      setDesignations(roles);
      if (canManage && (unitsResult.status === "rejected" || rolesResult.status === "rejected")) {
        const failure = unitsResult.status === "rejected" ? unitsResult.reason : rolesResult.status === "rejected" ? rolesResult.reason : null;
        toast.error("Organization options could not be loaded", failure instanceof Error ? failure.message : "Check organization permissions.");
      }
      setForm((old) => ({
        ...old,
        departmentId: old.departmentId || units[0]?.id || "",
        designationId:
          old.designationId ||
          roles.find(
            (x) => x.departmentId === (old.departmentId || units[0]?.id),
          )?.id ||
          roles[0]?.id ||
          "",
      }));
    } catch (error) {
      toast.error(
        "Employee directory could not be loaded",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }, [canManage, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      employees.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          `${item.firstName} ${item.lastName} ${item.email} ${item.employeeCode}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [employees, query, status],
  );
  const onboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.onboardEmployee(form);
      setOnboardingResult({
        employeeId: result.data.employee.id,
        email: result.data.employee.email,
        emailStatus: result.data.emailDelivery.status,
      });
      setFaceEmployeeId(result.data.employee.id);
      setForm({
        ...form,
        employeeCode: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
      });
      toast.success("Employee profile created", "Activation email queued. Complete face enrollment below to unlock mobile attendance.");
      await load();
    } catch (error) {
      toast.error(
        "Onboarding failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  };
  const resend = async (item: Employee) => {
    setResendingId(item.id);
    try {
      const result = await api.resendOnboarding(item.id);
      setOnboardingResult({ employeeId: item.id, email: item.email, emailStatus: result.data.status });
      toast.success("Activation email queued", `A fresh activation link will be sent to ${item.email}.`);
    } catch (error) {
      toast.error("Activation email could not be queued", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setResendingId(null);
    }
  };
  const lifecycle = async (item: Employee, next: EmployeeStatus) => {
    const exiting = ["RESIGNED", "TERMINATED"].includes(next),
      lastWorkingDay = exitDate[item.id];
    if (exiting && !lastWorkingDay) {
      toast.error("Last working day required");
      return;
    }
    try {
      await api.updateEmployeeLifecycle(item.id, {
        status: next,
        lastWorkingDay: exiting ? lastWorkingDay : null,
        resignationDate:
          next === "RESIGNED" ? new Date().toISOString().slice(0, 10) : null,
        confirmationDate:
          next === "ACTIVE" && item.status === "ON_PROBATION"
            ? new Date().toISOString().slice(0, 10)
            : item.confirmationDate,
      });
      await load();
      toast.success("Employment lifecycle updated");
    } catch (error) {
      toast.error(
        "Lifecycle update failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSavingId(editing.id);
    try {
      await api.updateEmployee(editing.id, {
        employeeCode: editing.employeeCode,
        firstName: editing.firstName,
        lastName: editing.lastName,
        email: editing.email,
        phone: editing.phone || "",
        departmentId: editing.departmentId,
        designationId: editing.designationId,
        reportingManagerId: editing.reportingManagerId,
        dateOfJoining: editing.dateOfJoining,
        employmentType: editing.employmentType,
        workLocation: editing.workLocation || "",
      });
      setEditing(null);
      await load();
      toast.success("Employee profile updated");
    } catch (error) {
      toast.error("Employee update failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };
  const removeEmployee = async (item: Employee) => {
    const confirmation = window.prompt("Permanently delete this new employee? Type " + item.employeeCode + " to confirm. Employees with attendance, leave, expense, or payroll history cannot be deleted.");
    if (confirmation !== item.employeeCode) return;
    setSavingId(item.id);
    try {
      await api.deleteEmployeeV1(item.id);
      await load();
      toast.success("Employee deleted", "The unused portal account and onboarding draft were removed.");
    } catch (error) {
      toast.error("Employee could not be deleted", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };
  return (
    <div className="neo-page neo-employees space-y-5">
      <header className="flex justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex gap-2">
            <Users className="text-brand-400" />
            Employee Directory
          </h1>
          <p className="text-xs text-slate-400">
            Authoritative workforce roster, onboarding, and audited lifecycle
            transitions. Signed in to {currentCompany?.name || "your workspace"} as {currentUser?.email}.
          </p>
        </div>
        <button onClick={() => void load()}>
          <RefreshCw className={`w-4 ${busy ? "animate-spin" : ""}`} />
        </button>
        {canManage && <button onClick={()=>setShowWizard(true)} className="ml-3 flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold"><UserPlus className="h-4"/>Start onboarding</button>}
      </header>
      {false && canManage && <form
        onSubmit={onboard}
        className="grid md:grid-cols-4 xl:grid-cols-8 gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-4"
      >
        <input
          required
          value={form.employeeCode}
          onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
          placeholder="Code"
          className="input"
        />
        <input
          required
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          placeholder="First name"
          className="input"
        />
        <input
          required
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          placeholder="Last name"
          className="input"
        />
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Email"
          className="input"
        />
        <select
          required
          value={form.departmentId}
          onChange={(e) => {
            const departmentId = e.target.value;
            setForm({
              ...form,
              departmentId,
              designationId:
                designations.find((x) => x.departmentId === departmentId)?.id ||
                "",
            });
          }}
          className="input"
        >
          {departments.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select
          required
          value={form.designationId}
          onChange={(e) => setForm({ ...form, designationId: e.target.value })}
          className="input"
        >
          {designations
            .filter((x) => x.departmentId === form.departmentId)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
        </select>
        <input
          type="date"
          value={form.dateOfJoining}
          onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })}
          className="input"
        />
        <button
          disabled={busy}
          className="bg-brand-500 rounded-xl flex items-center justify-center gap-1"
        >
          <UserPlus className="w-4" />
          Onboard
        </button>
      </form>}
      {onboardingResult && (
        <section className="grid md:grid-cols-3 gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4" aria-label="Onboarding progress">
          <div className="flex gap-2 items-start"><CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0"/><div><b className="text-sm">1. Profile created</b><p className="text-[11px] text-slate-400">The employee and portal account are ready.</p></div></div>
          <div className="flex gap-2 items-start"><Mail className="w-5 h-5 text-sky-300 shrink-0"/><div><b className="text-sm">2. Activation {onboardingResult.emailStatus.toLowerCase()}</b><p className="text-[11px] text-slate-400">Delivery to {onboardingResult.email} is processed asynchronously.</p></div></div>
          <div className="flex gap-2 items-start"><Camera className="w-5 h-5 text-amber-300 shrink-0"/><div><b className="text-sm">3. Enroll approved face</b><p className="text-[11px] text-slate-400">Required before Android clock-in or clock-out.</p></div></div>
        </section>
      )}
      <div className="grid md:grid-cols-4 gap-2">
        <div className="md:col-span-3 relative">
          <Search className="absolute left-3 top-3 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees"
            className="input w-full pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input"
        >
          <option value="ALL">All statuses</option>
          {[
            "ACTIVE",
            "ON_PROBATION",
            "ON_LEAVE",
            "RESIGNED",
            "TERMINATED",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="overflow-auto border border-slate-800 rounded-2xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-900">
              <th className="p-3 text-left">Employee</th>
              <th className="text-left">Organization</th>
              <th className="text-left">Joined</th>
              <th className="text-left">Status</th>
              {canManage && <th className="text-left">Lifecycle action</th>}
              {canManage && <th className="text-left">Onboarding</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <React.Fragment key={item.id}>
              <tr className="border-t border-slate-800">
                <td className="p-3">
                  <strong>
                    {item.firstName} {item.lastName}
                  </strong>
                  <small className="block text-slate-500">
                    {item.employeeCode} · {item.email}
                  </small>
                </td>
                <td>
                  {departments.find((x) => x.id === item.departmentId)?.name}
                  <small className="block text-slate-500">
                    {
                      designations.find((x) => x.id === item.designationId)
                        ?.title
                    }
                  </small>
                </td>
                <td>{item.dateOfJoining}</td>
                <td>{item.status}</td>
                {canManage && <td className="p-2">
                  <div className="flex gap-2">
                    <select
                      defaultValue={item.status}
                      onChange={(e) =>
                        void lifecycle(item, e.target.value as EmployeeStatus)
                      }
                      className="input"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="ON_PROBATION">ON PROBATION</option>
                      <option value="ON_LEAVE">ON LEAVE</option>
                      <option value="RESIGNED">RESIGNED</option>
                      <option value="TERMINATED">TERMINATED</option>
                    </select>
                    <input
                      type="date"
                      aria-label="Last working day"
                      value={exitDate[item.id] || ""}
                      onChange={(e) =>
                        setExitDate({ ...exitDate, [item.id]: e.target.value })
                      }
                      className="input"
                    />
                  </div>
                </td>}
                {canManage && <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setFaceEmployeeId(faceEmployeeId === item.id ? null : item.id)} className="px-2.5 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                      {faceEmployeeId === item.id ? "Close face setup" : "Face setup"}
                    </button>
                    <button type="button" disabled={resendingId === item.id} onClick={() => void resend(item)} className="px-2.5 py-2 rounded-lg bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
                      {resendingId === item.id ? "Queuing..." : "Resend activation"}
                    </button>
                    <button type="button" disabled={savingId === item.id} onClick={() => setEditing({...item})} className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-2 text-violet-700 hover:bg-violet-500/20 disabled:opacity-50">
                      <Pencil className="h-3.5 w-3.5"/>Edit
                    </button>
                    <button type="button" disabled={savingId === item.id} onClick={() => void removeEmployee(item)} className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-2 text-rose-700 hover:bg-rose-500/20 disabled:opacity-50">
                      <Trash2 className="h-3.5 w-3.5"/>Delete
                    </button>
                  </div>
                </td>}
              </tr>
              {faceEmployeeId === item.id && (
                <tr className="border-t border-slate-800">
                  <td colSpan={canManage ? 6 : 4} className="bg-slate-50 p-4"><FaceEnrollmentPanel employee={item}/></td>
                </tr>
              )}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={canManage ? 6 : 4} className="p-12 text-center text-slate-500">No employees are visible for {currentCompany?.name || "this workspace"}. Confirm the web and Android apps are signed in with the same email and company.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing&&<EmployeeEditDialog employee={editing} employees={employees} departments={departments} designations={designations} busy={savingId===editing.id} onChange={setEditing} onClose={()=>setEditing(null)} onSave={saveProfile}/>}
      {showWizard&&<EmployeeOnboardingWizard departments={departments} designations={designations} employees={employees} onClose={()=>setShowWizard(false)} onCompleted={load}/>}
    </div>
  );
};

type EditDialogProps={employee:Employee;employees:Employee[];departments:Department[];designations:Designation[];busy:boolean;onChange:(employee:Employee)=>void;onClose:()=>void;onSave:(event:React.FormEvent)=>void};
const EmployeeEditDialog:React.FC<EditDialogProps>=({employee,employees,departments,designations,busy,onChange,onClose,onSave})=>{
  const set=<K extends keyof Employee>(key:K,value:Employee[K])=>onChange({...employee,[key]:value});
  const available=designations.filter(item=>item.departmentId===employee.departmentId);
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
    <form onSubmit={onSave} className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
      <header className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">Edit employee</h2><p className="text-sm text-slate-500">Update profile and organization details. Changes are recorded in the audit log.</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5"/></button></header>
      <div className="grid gap-3 md:grid-cols-2">
        <EditField label="Employee ID"><input required value={employee.employeeCode} onChange={e=>set("employeeCode",e.target.value)} className="input w-full"/></EditField>
        <EditField label="Work email"><input required type="email" value={employee.email} onChange={e=>set("email",e.target.value)} className="input w-full"/></EditField>
        <EditField label="First name"><input required value={employee.firstName} onChange={e=>set("firstName",e.target.value)} className="input w-full"/></EditField>
        <EditField label="Last name"><input required value={employee.lastName} onChange={e=>set("lastName",e.target.value)} className="input w-full"/></EditField>
        <EditField label="Phone"><input value={employee.phone||""} onChange={e=>set("phone",e.target.value)} className="input w-full"/></EditField>
        <EditField label="Joining date"><input required type="date" value={employee.dateOfJoining?.slice(0,10)||""} onChange={e=>set("dateOfJoining",e.target.value)} className="input w-full"/></EditField>
        <EditField label="Department"><select required value={employee.departmentId} onChange={e=>{const departmentId=e.target.value;onChange({...employee,departmentId,designationId:designations.find(item=>item.departmentId===departmentId)?.id||""})}} className="input w-full">{departments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></EditField>
        <EditField label="Designation"><select required value={employee.designationId} onChange={e=>set("designationId",e.target.value)} className="input w-full">{available.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></EditField>
        <EditField label="Reporting manager"><select value={employee.reportingManagerId||""} onChange={e=>set("reportingManagerId",e.target.value||undefined)} className="input w-full"><option value="">None</option>{employees.filter(item=>item.id!==employee.id).map(item=><option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></EditField>
        <EditField label="Employment type"><select value={employee.employmentType} onChange={e=>set("employmentType",e.target.value as EmploymentType)} className="input w-full">{["FULL_TIME","PART_TIME","CONTRACT","INTERN","CONSULTANT"].map(item=><option key={item}>{item.replace("_"," ")}</option>)}</select></EditField>
        <EditField label="Work location"><input value={employee.workLocation||""} onChange={e=>set("workLocation",e.target.value)} className="input w-full"/></EditField>
      </div>
      <footer className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700">Cancel</button><button disabled={busy} className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{busy?"Saving...":"Save changes"}</button></footer>
    </form>
  </div>
};
const EditField=({label,children}:{label:string;children:React.ReactNode})=><label className="space-y-1 text-xs font-medium text-slate-600"><span>{label}</span>{children}</label>;
