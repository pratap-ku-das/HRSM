import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Mail, Search, UserPlus, Users, RefreshCw } from "lucide-react";
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
      </header>
      {canManage && <form
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
                  </div>
                </td>}
              </tr>
              {faceEmployeeId === item.id && (
                <tr className="border-t border-slate-800">
                  <td colSpan={canManage ? 6 : 4} className="p-4 bg-slate-950/50"><FaceEnrollmentPanel employee={item}/></td>
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
    </div>
  );
};
