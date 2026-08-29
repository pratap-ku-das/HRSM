import { 
  Company, User, Employee, Department, Designation, AttendanceRecord, 
  LeaveType, LeaveRequest, PayrollRun, Payslip, JobPosting, JobApplicant, 
  PerformanceGoal, Asset, CompanyDocument, Holiday, Announcement, ExpenseClaim, 
  AuditLog, CompanySettings, AttendanceStatus 
} from '../types';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Network request failed' }));
    throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  // Health
  checkHealth: () => fetchJSON<{ status: string; database: string }>(`${API_BASE}/health`),

  // Auth
  login: (email: string) => 
    fetchJSON<{ user: User; company: Company; settings: CompanySettings }>(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  registerCompany: (companyData: any, adminData: any, plan: string) =>
    fetchJSON<{ company: Company; user: User; settings: CompanySettings }>(`${API_BASE}/auth/register-company`, {
      method: 'POST',
      body: JSON.stringify({ companyData, adminData, plan }),
    }),

  // Companies
  getCompanies: () => fetchJSON<Company[]>(`${API_BASE}/companies`),

  // Employees
  getEmployees: (companyId: string) => fetchJSON<Employee[]>(`${API_BASE}/employees?companyId=${companyId}`),
  saveEmployee: (emp: Partial<Employee>) => 
    fetchJSON<Employee>(`${API_BASE}/employees`, {
      method: 'POST',
      body: JSON.stringify(emp),
    }),
  deleteEmployee: (id: string) => 
    fetchJSON<{ success: boolean }>(`${API_BASE}/employees/${id}`, {
      method: 'DELETE',
    }),

  // Departments
  getDepartments: (companyId: string) => fetchJSON<Department[]>(`${API_BASE}/departments?companyId=${companyId}`),
  saveDepartment: (dept: Partial<Department>) => 
    fetchJSON<Department>(`${API_BASE}/departments`, {
      method: 'POST',
      body: JSON.stringify(dept),
    }),

  // Designations
  getDesignations: (companyId: string) => fetchJSON<Designation[]>(`${API_BASE}/designations?companyId=${companyId}`),
  saveDesignation: (desig: Partial<Designation>) => 
    fetchJSON<Designation>(`${API_BASE}/designations`, {
      method: 'POST',
      body: JSON.stringify(desig),
    }),

  // Attendance
  getAttendance: (companyId: string) => fetchJSON<AttendanceRecord[]>(`${API_BASE}/attendance?companyId=${companyId}`),
  saveAttendanceRecord: (record: any) => 
    fetchJSON<AttendanceRecord>(`${API_BASE}/attendance`, {
      method: 'POST',
      body: JSON.stringify(record),
    }),
  bulkMarkAttendance: (records: any[]) => 
    fetchJSON<{ count: number }>(`${API_BASE}/attendance/bulk`, {
      method: 'POST',
      body: JSON.stringify({ records }),
    }),
  mobileVerifyFace: (payload: any) =>
    fetchJSON<{ success: boolean; message: string; record: AttendanceRecord }>(`${API_BASE}/attendance/mobile-verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Leaves
  getLeaveTypes: (companyId: string) => fetchJSON<LeaveType[]>(`${API_BASE}/leaves/types?companyId=${companyId}`),
  saveLeaveType: (leaveType: Partial<LeaveType>, adminUserId: string) =>
    fetchJSON<LeaveType>(`${API_BASE}/leaves/types`, {
      method: 'POST',
      body: JSON.stringify({ ...leaveType, adminUserId }),
    }),
  deleteLeaveType: (id: string, adminUserId: string) =>
    fetchJSON<{ success: boolean }>(`${API_BASE}/leaves/types/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ adminUserId }),
    }),
  getLeaveRequests: (companyId: string) => fetchJSON<LeaveRequest[]>(`${API_BASE}/leaves/requests?companyId=${companyId}`),
  applyLeave: (req: any) => 
    fetchJSON<LeaveRequest>(`${API_BASE}/leaves/apply`, {
      method: 'POST',
      body: JSON.stringify(req),
    }),
  reviewLeave: (id: string, status: string, approvedBy: string, reviewerUserId: string, reviewerComment?: string) =>
    fetchJSON<LeaveRequest>(`${API_BASE}/leaves/review`, {
      method: 'POST',
      body: JSON.stringify({ id, status, approvedBy, reviewerUserId, reviewerComment }),
    }),

  // Payroll
  getPayrollRuns: (companyId: string) => fetchJSON<PayrollRun[]>(`${API_BASE}/payroll/runs?companyId=${companyId}`),
  getPayslips: (companyId: string) => fetchJSON<Payslip[]>(`${API_BASE}/payroll/payslips?companyId=${companyId}`),
  generatePayroll: (companyId: string, month: string) => 
    fetchJSON<{ run: PayrollRun; count: number }>(`${API_BASE}/payroll/generate`, {
      method: 'POST',
      body: JSON.stringify({ companyId, month }),
    }),

  // Recruitment
  getJobs: (companyId: string) => fetchJSON<JobPosting[]>(`${API_BASE}/recruitment/jobs?companyId=${companyId}`),
  saveJob: (job: any) => 
    fetchJSON<JobPosting>(`${API_BASE}/recruitment/jobs`, {
      method: 'POST',
      body: JSON.stringify(job),
    }),
  getApplicants: (companyId: string) => fetchJSON<JobApplicant[]>(`${API_BASE}/recruitment/applicants?companyId=${companyId}`),
  advanceApplicant: (id: string, stage: string) => 
    fetchJSON<JobApplicant>(`${API_BASE}/recruitment/applicants/advance`, {
      method: 'POST',
      body: JSON.stringify({ id, stage }),
    }),

  // Performance
  getGoals: (companyId: string) => fetchJSON<PerformanceGoal[]>(`${API_BASE}/performance/goals?companyId=${companyId}`),
  saveGoal: (goal: any) => 
    fetchJSON<PerformanceGoal>(`${API_BASE}/performance/goals`, {
      method: 'POST',
      body: JSON.stringify(goal),
    }),

  // Assets
  getAssets: (companyId: string) => fetchJSON<Asset[]>(`${API_BASE}/assets?companyId=${companyId}`),
  saveAsset: (asset: any) => 
    fetchJSON<Asset>(`${API_BASE}/assets`, {
      method: 'POST',
      body: JSON.stringify(asset),
    }),

  // Documents
  getDocuments: (companyId: string) => fetchJSON<CompanyDocument[]>(`${API_BASE}/documents?companyId=${companyId}`),
  saveDocument: (doc: any) => 
    fetchJSON<CompanyDocument>(`${API_BASE}/documents`, {
      method: 'POST',
      body: JSON.stringify(doc),
    }),

  // Holidays & Announcements
  getHolidays: (companyId: string) => fetchJSON<Holiday[]>(`${API_BASE}/holidays?companyId=${companyId}`),
  saveHoliday: (hol: any) => 
    fetchJSON<Holiday>(`${API_BASE}/holidays`, {
      method: 'POST',
      body: JSON.stringify(hol),
    }),
  getAnnouncements: (companyId: string) => fetchJSON<Announcement[]>(`${API_BASE}/announcements?companyId=${companyId}`),
  saveAnnouncement: (anc: any) => 
    fetchJSON<Announcement>(`${API_BASE}/announcements`, {
      method: 'POST',
      body: JSON.stringify(anc),
    }),

  // Expenses
  getExpenses: (companyId: string) => fetchJSON<ExpenseClaim[]>(`${API_BASE}/expenses?companyId=${companyId}`),
  submitExpense: (exp: any) => 
    fetchJSON<ExpenseClaim>(`${API_BASE}/expenses/submit`, {
      method: 'POST',
      body: JSON.stringify(exp),
    }),
  reviewExpense: (id: string, status: string) => 
    fetchJSON<ExpenseClaim>(`${API_BASE}/expenses/review`, {
      method: 'POST',
      body: JSON.stringify({ id, status }),
    }),

  // Audit Logs
  getAuditLogs: (companyId: string) => fetchJSON<AuditLog[]>(`${API_BASE}/audit-logs?companyId=${companyId}`),
  logAudit: (log: any) => 
    fetchJSON<AuditLog>(`${API_BASE}/audit-logs`, {
      method: 'POST',
      body: JSON.stringify(log),
    }),

  // Settings
  getSettings: (companyId: string) => fetchJSON<CompanySettings>(`${API_BASE}/settings/${companyId}`),
  saveSettings: (companyId: string, settings: any) => 
    fetchJSON<CompanySettings>(`${API_BASE}/settings/${companyId}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
