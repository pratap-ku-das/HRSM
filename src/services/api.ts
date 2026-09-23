import { 
  Company, User, Employee, Department, Designation, AttendanceRecord, 
  LeaveType, LeaveRequest, PayrollRun, Payslip, JobPosting, JobApplicant, 
  PerformanceGoal, Asset, CompanyDocument, Holiday, Announcement, ExpenseClaim, 
  AuditLog, CompanySettings, AttendanceStatus, OrganizationStructure, AccessConfiguration, PermissionScope, WorkflowDefinition, WorkflowInstance, ApprovalInboxItem, WorkflowModule, AttendanceConfiguration, AttendanceRequestItem, PayrollConfiguration, Employee360, CommandCenterData, OrbitNotification, NotificationPreference, PerformanceWorkspace
} from '../types';

const API_BASE = '/api';
const ACCESS_TOKEN_KEY = 'orbithr_access_token';
const REFRESH_TOKEN_KEY = 'orbithr_refresh_token';

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };
let refreshRequest: Promise<string> | null = null;
let sessionExpiryAnnounced = false;

function announceSessionExpiry() {
  if (sessionExpiryAnnounced) return;
  sessionExpiryAnnounced = true;
  window.dispatchEvent(new CustomEvent('orbithr:session-expired'));
}

async function renewAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('Your session has expired. Please sign in again.');
  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceName: 'OrbitHR Web' }),
    }).then(async response => {
      if (!response.ok) throw new Error('Your session has expired. Please sign in again.');
      const result = await response.json() as ApiEnvelope<{ accessToken: string; refreshToken: string }>;
      localStorage.setItem(ACCESS_TOKEN_KEY, result.data.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken);
      return result.data.accessToken;
    }).catch(error => {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      announceSessionExpiry();
      throw error;
    }).finally(() => { refreshRequest = null; });
  }
  return refreshRequest;
}

async function fetchJSON<T>(url: string, options?: RequestInit, retryAuth = true): Promise<T> {
  const requestHeaders = new Headers(options?.headers);
  if (!requestHeaders.has('Content-Type') && !(options?.body instanceof FormData)) requestHeaders.set('Content-Type', 'application/json');
  const res = await fetch(url, {
    ...options,
    headers: requestHeaders,
  });

  if (res.status === 401 && retryAuth && !url.endsWith('/auth/login') && !url.endsWith('/auth/refresh')) {
    const accessToken = await renewAccessToken();
    const headers = new Headers(options?.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetchJSON<T>(url, { ...options, headers }, false);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Network request failed' }));
    throw new Error(typeof errorData.error === 'string' ? errorData.error : errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

async function downloadFile(url:string,options:RequestInit,retryAuth=true){const headers=new Headers(options.headers);const response=await fetch(url,{...options,headers});if(response.status===401&&retryAuth){headers.set('Authorization',`Bearer ${await renewAccessToken()}`);return downloadFile(url,{...options,headers},false)}if(!response.ok){const errorData=await response.json().catch(()=>null);throw new Error(errorData?.error?.message||`Export failed (${response.status})`)}const blob=await response.blob(),disposition=response.headers.get('content-disposition')||'',name=/filename="([^"]+)"/.exec(disposition)?.[1]||'orbithr-report';const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(href)}

export const api = {
  // Health
  checkHealth: () => fetchJSON<{ status: string; database: string }>(`${API_BASE}/health`),

  // Auth
  login: (email: string) => 
    fetchJSON<{ user: User; company: Company; settings: CompanySettings }>(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  loginV1: async (email: string, password: string, mfaCode?: string) => {
    const result = await fetchJSON<ApiEnvelope<{ accessToken: string; refreshToken: string; expiresInSeconds: number }>>(`${API_BASE}/v1/auth/login`, {
      method: 'POST', body: JSON.stringify({ email, password, deviceName: 'OrbitHR Web', mfaCode: mfaCode || undefined }),
    });
    localStorage.setItem(ACCESS_TOKEN_KEY, result.data.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken);
    sessionExpiryAnnounced = false;
    return result.data;
  },
  activateAccount: (token: string, password: string) =>
    fetchJSON<ApiEnvelope<{ activated: boolean }>>(`${API_BASE}/v1/auth/activate`, {
      method: 'POST', body: JSON.stringify({ token, password }),
    }),
  forgotPassword: (email: string) => fetchJSON<ApiEnvelope<{ accepted: boolean }>>(`${API_BASE}/v1/auth/forgot-password`, {
    method: 'POST', body: JSON.stringify({ email }),
  }),
  resetPassword: (token: string, password: string) => fetchJSON<ApiEnvelope<{ reset: boolean }>>(`${API_BASE}/v1/auth/reset-password`, {
    method: 'POST', body: JSON.stringify({ token, password }),
  }),
  getMeV1: () => fetchJSON<ApiEnvelope<{ user: User; company: Company; employee?: Employee }>>(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  }),
  getMyAttendance: async () => (await fetchJSON<ApiEnvelope<AttendanceRecord[]>>(`${API_BASE}/v1/me/attendance`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  getMyLeave: async () => (await fetchJSON<ApiEnvelope<{ requests: LeaveRequest[]; types: LeaveType[]; balances: Array<{ leaveTypeId: string; year: number; entitlement: number; used: number; available: number }> }>>(`${API_BASE}/v1/me/leaves`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  applyMyLeave: async (body: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) => (await fetchJSON<ApiEnvelope<LeaveRequest>>(`${API_BASE}/v1/me/leaves`, {
    method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body),
  })).data,
  cancelMyLeave: async (id: string) => (await fetchJSON<ApiEnvelope<{ cancelled: boolean }>>(`${API_BASE}/v1/me/leaves/${id}/cancel`, {
    method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  getMyPayslips: async () => (await fetchJSON<ApiEnvelope<Payslip[]>>(`${API_BASE}/v1/me/payslips`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  getMyExpenses: async () => (await fetchJSON<ApiEnvelope<ExpenseClaim[]>>(`${API_BASE}/v1/me/expenses`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  submitMyExpense: async (body: { title: string; category: 'TRAVEL' | 'MEALS' | 'HARDWARE' | 'CERTIFICATION' | 'MISC'; amount: number; expenseDate: string; notes?: string }) => (await fetchJSON<ApiEnvelope<ExpenseClaim>>(`${API_BASE}/v1/me/expenses`, {
    method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body),
  })).data,
  clearV1Session: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionExpiryAnnounced = false;
  },
  hasV1Session: () => Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)),

  registerCompany: (companyData: any, adminData: any, plan: string) =>
    fetchJSON<{ company: Company; user: User; settings: CompanySettings }>(`${API_BASE}/auth/register-company`, {
      method: 'POST',
      body: JSON.stringify({ companyData, adminData, plan }),
    }),

  // Companies
  getCompanies: () => fetchJSON<Company[]>(`${API_BASE}/companies`),

  getOrganization: async () => (await fetchJSON<ApiEnvelope<OrganizationStructure>>(`${API_BASE}/v1/organization`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createOrganizationItem: async (kind: 'branches' | 'locations' | 'teams' | 'cost-centers' | 'grades' | 'departments' | 'designations', body: Record<string, unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/organization/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  getAccessConfiguration: async () => (await fetchJSON<ApiEnvelope<AccessConfiguration>>(`${API_BASE}/v1/rbac`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createPermission: async (key: string, description?: string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/rbac/permissions`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ key, description }) })).data,
  createAccessRole: async (body: { name: string; code: string; description?: string; permissionIds: string[] }) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/rbac/roles`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  createAccessGrant: async (body: { userId: string; roleId: string; scope: PermissionScope; scopeEntityId?: string; expiresAt?: string }) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/rbac/grants`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  revokeAccessGrant: async (id: string) => (await fetchJSON<ApiEnvelope<{ revoked: boolean }>>(`${API_BASE}/v1/rbac/grants/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getWorkflowDefinitions: async () => (await fetchJSON<ApiEnvelope<WorkflowDefinition[]>>(`${API_BASE}/v1/workflows/definitions`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createWorkflowDefinition: async (body: { module: WorkflowModule; name: string; code: string; steps: Array<{ name: string; approverType: string; approverReference?: string; minimumApprovals: number; slaHours?: number }> }) => (await fetchJSON<ApiEnvelope<WorkflowDefinition>>(`${API_BASE}/v1/workflows/definitions`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  activateWorkflowDefinition: async (id: string) => (await fetchJSON<ApiEnvelope<{ activated: boolean }>>(`${API_BASE}/v1/workflows/definitions/${id}/activate`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getApprovalInbox: async () => (await fetchJSON<ApiEnvelope<ApprovalInboxItem[]>>(`${API_BASE}/v1/workflows/inbox`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getMyRequests: async () => (await fetchJSON<ApiEnvelope<WorkflowInstance[]>>(`${API_BASE}/v1/workflows/my-requests`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  actOnWorkflow: async (id: string, action: 'APPROVE' | 'REJECT' | 'COMMENT', comment?: string) => (await fetchJSON<ApiEnvelope<{ status: string }>>(`${API_BASE}/v1/workflows/instances/${id}/actions`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ action, comment }) })).data,
  withdrawWorkflow: async (id: string, comment?: string) => (await fetchJSON<ApiEnvelope<{ status: string }>>(`${API_BASE}/v1/workflows/instances/${id}/withdraw`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ comment }) })).data,
  getAttendanceConfiguration: async () => (await fetchJSON<ApiEnvelope<AttendanceConfiguration>>(`${API_BASE}/v1/attendance/config`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createShift: async (body: Record<string, unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/attendance/shifts`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  createAttendancePolicy: async (body: Record<string, unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/attendance/policies`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  assignShift: async (body: Record<string, unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/attendance/assignments`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  lockAttendancePeriod: async (body: { periodStart: string; periodEnd: string; reason?: string }) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/attendance/locks`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  saveManualAttendanceV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<AttendanceRecord>>(`${API_BASE}/v1/attendance/manual`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  getLeaveAdministration: async() => (await fetchJSON<ApiEnvelope<{types:LeaveType[];requests:Array<LeaveRequest&{employee:{employeeCode:string;firstName:string;lastName:string};leaveType:LeaveType}>}>>(`${API_BASE}/v1/leave-administration`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  createLeaveTypeV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<LeaveType>>(`${API_BASE}/v1/leave-administration/types`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  getAttendanceRequests: async () => (await fetchJSON<ApiEnvelope<AttendanceRequestItem[]>>(`${API_BASE}/v1/me/attendance/requests`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createAttendanceRequest: async (body: Omit<AttendanceRequestItem,'id'|'status'|'workflowInstanceId'|'createdAt'>) => (await fetchJSON<ApiEnvelope<AttendanceRequestItem>>(`${API_BASE}/v1/me/attendance/requests`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  startBreak: async () => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/me/attendance/breaks/start`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  endBreak: async () => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/me/attendance/breaks/end`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getPayrollConfiguration: async () => (await fetchJSON<ApiEnvelope<PayrollConfiguration>>(`${API_BASE}/v1/payroll/config`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createSalaryStructure: async (body: Record<string,unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/structures`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  createSalaryRevision: async (body: Record<string,unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/revisions`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  approveSalaryRevision: async (id: string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/revisions/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createStatutoryRule: async (body: Record<string,unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/statutory-rules`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  createPayrollRun: async (month: string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({month}) })).data,
  payrollRunAction: async (id: string, action: 'lock-attendance'|'calculate'|'hr-review'|'finance-approve'|'lock'|'publish') => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getBankExportPreview: async (id: string) => (await fetchJSON<ApiEnvelope<{month:string;deliveryRequired:boolean;rows:Array<{employeeCode:string;beneficiary:string;maskedAccount?:string;amount:number}>}>>(`${API_BASE}/v1/payroll/runs/${id}/bank-export-preview`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getEmployee360: async (id: string) => (await fetchJSON<ApiEnvelope<Employee360>>(`${API_BASE}/v1/employees/${id}/360`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getCommandCenter: async () => (await fetchJSON<ApiEnvelope<CommandCenterData>>(`${API_BASE}/v1/command-center`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getNotifications: async (unread=false) => (await fetchJSON<ApiEnvelope<OrbitNotification[]>>(`${API_BASE}/v1/notifications?unread=${unread}`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  readNotification: async (id:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/notifications/${id}/read`, { method:'PATCH', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  readAllNotifications: async () => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/notifications/read-all`, { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getNotificationPreferences: async () => (await fetchJSON<ApiEnvelope<NotificationPreference[]>>(`${API_BASE}/v1/notifications/preferences`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  saveNotificationPreferences: async (preferences:NotificationPreference[]) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/notifications/preferences`, { method:'PUT', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body:JSON.stringify({preferences}) })).data,

  // Employees
  getEmployees: (companyId: string) => fetchJSON<Employee[]>(`${API_BASE}/employees?companyId=${companyId}`),
  getEmployeesV1: async () => {
    const result = await fetchJSON<ApiEnvelope<Employee[]>>(`${API_BASE}/v1/employees?page=1&pageSize=100`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    });
    return result.data.map(employee => ({
      ...employee,
      dateOfJoining: employee.dateOfJoining?.slice(0, 10),
      dateOfBirth: employee.dateOfBirth?.slice(0, 10),
    }));
  },
  saveEmployee: (emp: Partial<Employee>) => 
    fetchJSON<Employee>(`${API_BASE}/employees`, {
      method: 'POST',
      body: JSON.stringify(emp),
    }),
  updateEmployeeLifecycle: async (id:string,body:{status:string;confirmationDate?:string|null;probationEndDate?:string|null;resignationDate?:string|null;lastWorkingDay?:string|null}) => (await fetchJSON<ApiEnvelope<Employee>>(`${API_BASE}/v1/employees/${id}/lifecycle`,{method:'PATCH',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  onboardEmployee: (emp: Pick<Employee, 'employeeCode' | 'firstName' | 'lastName' | 'email' | 'departmentId' | 'designationId' | 'dateOfJoining' | 'employmentType'> & Partial<Pick<Employee, 'reportingManagerId' | 'workLocation' | 'phone'>>) =>
    fetchJSON<ApiEnvelope<{ employee: Employee; emailDelivery: { id: string; status: string } }>>(`${API_BASE}/v1/employees/onboard`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(emp),
    }),
  resendOnboarding: (employeeId: string) =>
    fetchJSON<ApiEnvelope<{ id: string; status: string }>>(`${API_BASE}/v1/employees/${employeeId}/resend-onboarding`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
    }),
  deleteEmployee: (id: string) => 
    fetchJSON<{ success: boolean }>(`${API_BASE}/employees/${id}`, {
      method: 'DELETE',
    }),
  getFaceEnrollment: (employeeId: string) => fetchJSON<ApiEnvelope<{
    enrolled: boolean;
    enrolledAt?: string;
    enrolledBy?: string;
    enrolledByRole?: string;
    provider?: string;
  }>>(`${API_BASE}/v1/employees/${employeeId}/face-enrollment`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  }),
  enrollFace: (employeeId: string, face: File) => {
    const form = new FormData();
    form.append('face', face);
    form.append('consentAcknowledged', 'true');
    return fetchJSON<ApiEnvelope<{ enrolled: boolean; enrolledAt: string }>>(`${API_BASE}/v1/employees/${employeeId}/face-enrollment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body: form,
    });
  },
  revokeFaceEnrollment: (employeeId: string) => fetchJSON<ApiEnvelope<{ enrolled: boolean }>>(`${API_BASE}/v1/employees/${employeeId}/face-enrollment`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  }),

  // Departments
  getDepartments: (companyId: string) => fetchJSON<Department[]>(`${API_BASE}/departments?companyId=${companyId}`),
  getDepartmentsV1: async () => (await fetchJSON<ApiEnvelope<Department[]>>(`${API_BASE}/v1/departments`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  saveDepartment: (dept: Partial<Department>) => 
    fetchJSON<Department>(`${API_BASE}/departments`, {
      method: 'POST',
      body: JSON.stringify(dept),
    }),

  // Designations
  getDesignations: (companyId: string) => fetchJSON<Designation[]>(`${API_BASE}/designations?companyId=${companyId}`),
  getDesignationsV1: async () => (await fetchJSON<ApiEnvelope<Designation[]>>(`${API_BASE}/v1/designations`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  saveDesignation: (desig: Partial<Designation>) => 
    fetchJSON<Designation>(`${API_BASE}/designations`, {
      method: 'POST',
      body: JSON.stringify(desig),
    }),

  // Attendance
  getAttendance: (companyId: string) => fetchJSON<AttendanceRecord[]>(`${API_BASE}/attendance?companyId=${companyId}`),
  getAttendanceV1: async (from?: string) => {
    const query = from ? `?from=${encodeURIComponent(from)}` : '';
    const result = await fetchJSON<ApiEnvelope<AttendanceRecord[]>>(`${API_BASE}/v1/attendance${query}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    });
    return result.data.map(record => ({ ...record, date: record.date.slice(0, 10) }));
  },
  saveAttendanceRecord: (record: any) => 
    fetchJSON<AttendanceRecord>(`${API_BASE}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body: JSON.stringify(record),
    }),
  bulkMarkAttendance: (records: any[]) => 
    fetchJSON<{ count: number }>(`${API_BASE}/attendance/bulk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body: JSON.stringify({ records }),
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
  getRecruitmentWorkspace: async () => (await fetchJSON<ApiEnvelope<{jobs: JobPosting[]; applicants: JobApplicant[]}>>(`${API_BASE}/v1/recruitment`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createJobV1: async (job: Omit<JobPosting,'id'|'companyId'|'applicantCount'|'postedAt'>) => (await fetchJSON<ApiEnvelope<JobPosting>>(`${API_BASE}/v1/recruitment/jobs`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}, body:JSON.stringify(job) })).data,
  createApplicantV1: async (body: Record<string, unknown>) => (await fetchJSON<ApiEnvelope<JobApplicant>>(`${API_BASE}/v1/recruitment/applicants`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}, body:JSON.stringify(body) })).data,
  advanceApplicantV1: async (id:string,stage:string) => (await fetchJSON<ApiEnvelope<JobApplicant>>(`${API_BASE}/v1/recruitment/applicants/${id}/stage`, { method:'PATCH', headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}, body:JSON.stringify({stage}) })).data,
  getOperationsWorkspace: async () => (await fetchJSON<ApiEnvelope<{assets:Asset[];expenses:ExpenseClaim[];holidays:Holiday[];announcements:Announcement[];documents:CompanyDocument[];auditLogs:AuditLog[];canManage:boolean;canReadAllAudit:boolean}>>(`${API_BASE}/v1/operations/workspace`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  getWorkspaceSettingsV1: async() => (await fetchJSON<ApiEnvelope<CompanySettings|null>>(`${API_BASE}/v1/workspace-settings`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  updateWorkspaceSettingsV1: async(body:CompanySettings) => (await fetchJSON<ApiEnvelope<CompanySettings>>(`${API_BASE}/v1/workspace-settings`,{method:'PUT',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  createAssetV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<Asset>>(`${API_BASE}/v1/operations/assets`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  assignAssetV1: async(id:string,employeeId:string|null) => (await fetchJSON<ApiEnvelope<Asset>>(`${API_BASE}/v1/operations/assets/${id}/assignment`,{method:'PATCH',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify({employeeId})})).data,
  reviewExpenseV1: async(id:string,status:'APPROVED'|'REJECTED') => (await fetchJSON<ApiEnvelope<ExpenseClaim>>(`${API_BASE}/v1/operations/expenses/${id}/review`,{method:'PATCH',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify({status})})).data,
  createHolidayV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<Holiday>>(`${API_BASE}/v1/operations/holidays`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  createAnnouncementV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<Announcement>>(`${API_BASE}/v1/operations/announcements`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  createCompanyDocumentV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<CompanyDocument>>(`${API_BASE}/v1/operations/company-documents`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
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

  universalSearch: async (q: string) => (await fetchJSON<ApiEnvelope<Array<{ type: string; id: string; title: string; subtitle: string; route: string }>>>(`${API_BASE}/v1/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getReportCatalog: async () => (await fetchJSON<ApiEnvelope<Array<{ key: string; name: string }>>>(`${API_BASE}/v1/reports/catalog`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getReport: async (key: string) => (await fetchJSON<ApiEnvelope<{ key: string; rows: Record<string, unknown>[]; truncated: boolean }>>(`${API_BASE}/v1/reports/${key}`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  requestReportExport: (key: string, format: 'CSV'|'XLSX'|'PDF') => downloadFile(`${API_BASE}/v1/reports/${key}/exports`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}`, 'Content-Type':'application/json' }, body: JSON.stringify({ format, filters: {} }) }),
  getSecuritySessions: async () => (await fetchJSON<ApiEnvelope<Array<{ id: string; deviceName?: string; createdAt: string; lastUsedAt?: string; expiresAt: string }>>>(`${API_BASE}/v1/security/sessions`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  revokeSecuritySession: (id: string) => fetchJSON<ApiEnvelope<{ revoked: boolean }>>(`${API_BASE}/v1/security/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }),
  getLoginHistory: async () => (await fetchJSON<ApiEnvelope<Array<{ id: string; email: string; success: boolean; reason?: string; ipAddress: string; createdAt: string }>>>(`${API_BASE}/v1/security/login-history`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getMfaStatus: async () => (await fetchJSON<ApiEnvelope<{enabled:boolean;verifiedAt?:string}>>(`${API_BASE}/v1/security/mfa`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  setupMfa: async () => (await fetchJSON<ApiEnvelope<{secret:string;otpauthUri:string}>>(`${API_BASE}/v1/security/mfa/setup`, { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  confirmMfa: (code:string) => fetchJSON<ApiEnvelope<{enabled:boolean}>>(`${API_BASE}/v1/security/mfa/confirm`, { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body:JSON.stringify({code}) }),
  disableMfa: (code:string) => fetchJSON<ApiEnvelope<{enabled:boolean;reauthenticationRequired:boolean}>>(`${API_BASE}/v1/security/mfa/disable`, { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body:JSON.stringify({code}) }),
  getEmployeeDocumentsV1: async () => (await fetchJSON<ApiEnvelope<Record<string, unknown>[]>>(`${API_BASE}/v1/employee-documents`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getPerformanceWorkspace: async () => (await fetchJSON<ApiEnvelope<PerformanceWorkspace>>(`${API_BASE}/v1/performance-engine`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createPerformanceCycle: async (body:{name:string;startsAt:string;endsAt:string;status:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/cycles`, { method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  createPerformanceReviewV1: async (body:{cycleId:string;employeeId:string;reviewerId:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/reviews`, { method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  updatePerformanceReviewV1: async (id:string,body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/reviews/${id}`, { method:'PATCH',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  askOrbitAi: async (prompt: string) => (await fetchJSON<ApiEnvelope<{ id: string; intent: string; answer: string; sources: Array<{ type: string; id: string }>; readOnly: boolean }>>(`${API_BASE}/v1/ai/ask`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ prompt }) })).data,
};
