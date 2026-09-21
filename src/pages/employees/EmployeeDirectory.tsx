import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Users, RefreshCw } from "lucide-react";
import { api } from "../../services/api";
import type {
  Department,
  Designation,
  Employee,
  EmployeeStatus,
  EmploymentType,
} from "../../types";
import { useToast } from "../../context/ToastContext";
export const EmployeeDirectory: React.FC = () => {
  const toast = useToast(),
    [employees, setEmployees] = useState<Employee[]>([]),
    [departments, setDepartments] = useState<Department[]>([]),
    [designations, setDesignations] = useState<Designation[]>([]),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("ALL"),
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
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [people, units, roles] = await Promise.all([
        api.getEmployeesV1(),
        api.getDepartmentsV1(),
        api.getDesignationsV1(),
      ]);
      setEmployees(people);
      setDepartments(units);
      setDesignations(roles);
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
  }, [toast]);
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
      await api.onboardEmployee(form);
      setForm({
        ...form,
        employeeCode: "",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
      });
      toast.success("Employee onboarded");
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
            transitions.
          </p>
        </div>
        <button onClick={() => void load()}>
          <RefreshCw className={`w-4 ${busy ? "animate-spin" : ""}`} />
        </button>
      </header>
      <form
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
      </form>
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
              <th className="text-left">Lifecycle action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="border-t border-slate-800">
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
                <td className="p-2">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
