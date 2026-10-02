import type {
  CanvasLayout,
  WorkflowTemplate,
  WorkflowValidationResult,
  SimulationResult,
  WorkflowDesignerData,
} from '../types/workflowDesigner';
import { 
  Company, User, Employee, Department, Designation, AttendanceRecord, 
  LeaveType, LeaveRequest, PayrollRun, Payslip, JobPosting, JobApplicant, 
  PerformanceGoal, Asset, CompanyDocument, Holiday, Announcement, ExpenseClaim, 
  AuditLog, CompanySettings, AttendanceStatus, OrganizationStructure, AccessConfiguration, PermissionScope, WorkflowDefinition, WorkflowInstance, ApprovalInboxItem, WorkflowModule, AttendanceConfiguration, AttendanceRequestItem, PayrollConfiguration, PayrollEngineRun, PayrollLineDetail, Employee360, CommandCenterData, OrbitNotification, NotificationPreference, PerformanceWorkspace
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
      const latestRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const latestAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (latestRefreshToken && latestRefreshToken !== refreshToken && latestAccessToken) {
        return latestAccessToken;
      }
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
    const errorData = await res.json().catch(() => ({ error: 'Network request failed' })) as {
      error?: string | {
        message?: string;
        fieldErrors?: Record<string, string[] | undefined>;
      };
    };
    const message = typeof errorData.error === 'string'
      ? errorData.error
      : errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    const details = typeof errorData.error === 'object'
      ? Object.entries(errorData.error.fieldErrors || {})
          .flatMap(([field, errors]) => (errors || []).map(error => `${field}: ${error}`))
          .join(' ')
      : '';
    throw new Error(details ? `${message} ${details}` : message);
  }

  return res.json();
}

async function downloadFile(url:string,options:RequestInit,retryAuth=true){const headers=new Headers(options.headers);const response=await fetch(url,{...options,headers});if(response.status===401&&retryAuth){headers.set('Authorization',`Bearer ${await renewAccessToken()}`);return downloadFile(url,{...options,headers},false)}if(!response.ok){const errorData=await response.json().catch(()=>null);throw new Error(errorData?.error?.message||`Export failed (${response.status})`)}const blob=await response.blob(),disposition=response.headers.get('content-disposition')||'',name=/filename="([^"]+)"/.exec(disposition)?.[1]||'orbithr-report';const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(href)}
async function fetchProtectedFile(url:string,retryAuth=true):Promise<{blob:Blob;fileName:string;mimeType:string}>{const headers=new Headers({Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`});const response=await fetch(url,{headers});if(response.status===401&&retryAuth){headers.set('Authorization',`Bearer ${await renewAccessToken()}`);const retry=await fetch(url,{headers});if(!retry.ok){const errorData=await retry.json().catch(()=>null);throw new Error(errorData?.error?.message||`Document could not be opened (${retry.status})`)}const disposition=retry.headers.get('content-disposition')||'';return{blob:await retry.blob(),fileName:decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]||'document'),mimeType:retry.headers.get('content-type')||'application/octet-stream'}}if(!response.ok){const errorData=await response.json().catch(()=>null);throw new Error(errorData?.error?.message||`Document could not be opened (${response.status})`)}const disposition=response.headers.get('content-disposition')||'';return{blob:await response.blob(),fileName:decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]||'document'),mimeType:response.headers.get('content-type')||'application/octet-stream'}}

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
  getWorkflowTemplates: async () => (await fetchJSON<ApiEnvelope<WorkflowTemplate[]>>(`${API_BASE}/v1/workflows/templates`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  instantiateWorkflowTemplate: async (templateKey: string) => (await fetchJSON<ApiEnvelope<WorkflowDesignerData>>(`${API_BASE}/v1/workflows/templates/${templateKey}/instantiate`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getWorkflowDesigner: async (id: string) => (await fetchJSON<ApiEnvelope<WorkflowDesignerData>>(`${API_BASE}/v1/workflows/definitions/${id}/designer`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  saveWorkflowDraft: async (body: {
    definitionId?: string;
    module: WorkflowModule;
    name: string;
    code: string;
    expectedUpdatedAt?: string;
    canvasLayout?: CanvasLayout;
    steps?: Array<{
      name: string;
      approverType: string;
      approverReference?: string | null;
      minimumApprovals: number;
      slaHours?: number | null;
      allowDelegation?: boolean;
      conditions?: Record<string, unknown> | null;
    }>;
  }) => (await fetchJSON<ApiEnvelope<WorkflowDesignerData>>(`${API_BASE}/v1/workflows/definitions/draft`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  validateWorkflow: async (id: string, canvasLayout?: CanvasLayout) => (await fetchJSON<ApiEnvelope<WorkflowValidationResult>>(`${API_BASE}/v1/workflows/definitions/${id}/validate`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ canvasLayout }) })).data,
  publishWorkflow: async (id: string) => (await fetchJSON<ApiEnvelope<{ published: boolean; definitionId: string; version: number; status: string }>>(`${API_BASE}/v1/workflows/definitions/${id}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  simulateWorkflow: async (id: string, sampleRequesterUserId: string) => (await fetchJSON<ApiEnvelope<SimulationResult>>(`${API_BASE}/v1/workflows/definitions/${id}/simulate`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ sampleRequesterUserId }) })).data,
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
  getLeaveAdministration: async() => (await fetchJSON<ApiEnvelope<{types:LeaveType[];requests:Array<LeaveRequest&{employee:{employeeCode:string;firstName:string;lastName:string};leaveType:LeaveType;workflowInstanceId?:string;workflowStatus?:string;canReview:boolean}>}>>(`${API_BASE}/v1/leave-administration`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  createLeaveTypeV1: async(body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<LeaveType>>(`${API_BASE}/v1/leave-administration/types`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  deleteLeaveTypeV1: async(id:string) => (await fetchJSON<ApiEnvelope<{deleted:boolean}>>(`${API_BASE}/v1/leave-administration/types/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  getLeaveEncashmentEligibility: async () =>
    (await fetchJSON<ApiEnvelope<import('../types/leaveEncashment').LeaveEncashmentEligibility>>(
      `${API_BASE}/v1/leave-encashment/eligibility`,
      { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  requestLeaveEncashment: async (body: { leaveTypeId: string; days: number; reason: string; payrollMonth?: string }) =>
    (await fetchJSON<ApiEnvelope<{ serviceRequest: import('../types/leaveEncashment').LeaveEncashmentItem; workflowId?: string }>>(
      `${API_BASE}/v1/leave-encashment/request`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify(body),
      }
    )).data,
  getLeaveEncashmentRequests: async () =>
    (await fetchJSON<ApiEnvelope<import('../types/leaveEncashment').LeaveEncashmentItem[]>>(
      `${API_BASE}/v1/leave-encashment/requests`,
      { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  approveLeaveEncashmentRequest: async (id: string) =>
    (await fetchJSON<ApiEnvelope<{ status: string; payrollMonth: string; amount: number }>>(
      `${API_BASE}/v1/leave-encashment/requests/${id}/approve`,
      { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  rejectLeaveEncashmentRequest: async (id: string, reason: string) =>
    (await fetchJSON<ApiEnvelope<{ status: string }>>(
      `${API_BASE}/v1/leave-encashment/requests/${id}/reject`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify({ reason }),
      }
    )).data,
  triggerSlaEscalationJob: async () =>
    (await fetchJSON<ApiEnvelope<{ checked: number; escalated: unknown[] }>>(
      `${API_BASE}/v1/workflows/jobs/escalate-sla`,
      { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  getBankExportSources: async () =>
    (await fetchJSON<ApiEnvelope<{
      payrollRuns: import('../types').PayrollRun[];
      reimbursements: { count: number; totalAmount: number; claims: unknown[] };
    }>>(
      `${API_BASE}/v1/payroll/bank-export/sources`,
      { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  previewBankExport: async (body: {
    sourceType: 'PAYROLL' | 'REIMBURSEMENT' | 'COMBINED';
    payrollRunId?: string;
    expenseClaimIds?: string[];
    bankFormat: string;
  }) =>
    (await fetchJSON<ApiEnvelope<import('../types/bankExport').BankExportPreviewResponse>>(
      `${API_BASE}/v1/payroll/bank-export/preview`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify(body),
      }
    )).data,
  initiateBankExportBatch: async (body: {
    sourceType: 'PAYROLL' | 'REIMBURSEMENT' | 'COMBINED';
    payrollRunId?: string;
    expenseClaimIds?: string[];
    bankFormat: string;
    notes?: string;
  }) =>
    (await fetchJSON<ApiEnvelope<{
      batchId: string;
      status: string;
      rowCount: number;
      totalAmount: number;
      sha256Checksum: string;
    }>>(
      `${API_BASE}/v1/payroll/bank-export/batch/initiate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify(body),
      }
    )).data,
  getBankExportBatches: async () =>
    (await fetchJSON<ApiEnvelope<import('../types/bankExport').BankExportBatchItem[]>>(
      `${API_BASE}/v1/payroll/bank-export/batches`,
      { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  approveBankExportBatch: async (id: string) =>
    (await fetchJSON<ApiEnvelope<{ status: string; isLocked: boolean }>>(
      `${API_BASE}/v1/payroll/bank-export/batch/${id}/approve`,
      { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  downloadBankExportFile: async (id: string) => {
    const res = await fetch(`${API_BASE}/v1/payroll/bank-export/batch/${id}/download`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Download failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = `bank_transfer_batch_${id.slice(0, 8)}.csv`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  getTaxSimulatorConfig: async (financialYear = '2025-26') =>
    (await fetchJSON<ApiEnvelope<unknown>>(
      `${API_BASE}/v1/payroll/tax-simulator/config/${financialYear}`,
      { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } }
    )).data,
  simulateTax: async (payload: import('../types/taxSimulator').TaxSimulationPayload) =>
    (await fetchJSON<ApiEnvelope<import('../types/taxSimulator').TaxSimulationComparisonResult>>(
      `${API_BASE}/v1/payroll/tax-simulator/simulate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify(payload),
      }
    )).data,
  applyTaxRegime: async (payload: import('../types/taxSimulator').ApplyTaxRegimePayload) =>
    (await fetchJSON<ApiEnvelope<{ declarationId: string; regime: string; appliedAt: string }>>(
      `${API_BASE}/v1/payroll/tax-simulator/apply-regime`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
        body: JSON.stringify(payload),
      }
    )).data,
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
  getPayrollRunReview: async (id: string) => (await fetchJSON<ApiEnvelope<{run:PayrollEngineRun;lines:PayrollLineDetail[];exceptions:Array<{employeeId:string;employeeName:string;messages:string[]}>}>>(`${API_BASE}/v1/payroll/runs/${id}/review`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getPayrollAttendanceReview: async(id:string) => (await fetchJSON<ApiEnvelope<import('../types').PayrollAttendanceReview[]>>(`${API_BASE}/v1/payroll/runs/${id}/attendance`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  adjustPayrollAttendance: async(id:string,employeeId:string,body:{field:string;value:number;reason:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/attendance/${employeeId}`,{method:'PUT',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  finalizePayrollAttendance: async(id:string,reason?:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/finalize-attendance`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify({confirmation:true,reason})})).data,
  submitPayrollApproval: async(id:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/submit`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  approvePayroll: async(id:string,remarks?:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/approve`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify({remarks})})).data,
  rejectPayroll: async(id:string,reason:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/reject`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify({reason})})).data,
  generatePayslips: async(id:string) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/generate-payslips`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  listEmployeeOnboardings: async() => (await fetchJSON<ApiEnvelope<import('../types').EmployeeOnboardingDraft[]>>(`${API_BASE}/v1/employees/onboarding`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  createEmployeeOnboarding: async(body:Record<string,unknown>={}) => (await fetchJSON<ApiEnvelope<import('../types').EmployeeOnboardingDraft>>(`${API_BASE}/v1/employees/onboarding`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  saveEmployeeOnboardingSection: async(id:string,section:'personal'|'documents'|'salary'|'face'|'additional',body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<import('../types').EmployeeOnboardingDraft>>(`${API_BASE}/v1/employees/onboarding/${id}/${section}`,{method:'PUT',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  uploadEmployeeOnboardingDocument: async(file:File) => {
    const body = new FormData();
    body.append('document', file);
    return (await fetchJSON<ApiEnvelope<Record<string, unknown>>>(`${API_BASE}/v1/employees/onboarding/document-upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body,
    })).data;
  },
  reviewEmployeeOnboarding: async(id:string) => (await fetchJSON<ApiEnvelope<import('../types').EmployeeOnboardingDraft>>(`${API_BASE}/v1/employees/onboarding/${id}/review`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  completeEmployeeOnboarding: async(id:string) => (await fetchJSON<ApiEnvelope<{employee:Employee;emailDelivery:{id:string;status:string};onboardingStatus:string}>>(`${API_BASE}/v1/employees/onboarding/${id}/complete`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  getEmployeeOnboardingRecord: async(employeeId:string) => (await fetchJSON<ApiEnvelope<import('../types').EmployeeOnboardingDraft>>(`${API_BASE}/v1/employees/${employeeId}/onboarding-record`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  updateEmployeeOnboardingSection: async(employeeId:string,section:'personal'|'documents'|'salary'|'face'|'additional',body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<{employeeId:string;section:string;updated:boolean}>>(`${API_BASE}/v1/employees/${employeeId}/onboarding-record/${section}`,{method:'PUT',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  recordPayrollPayment: async (id: string, body: {paymentDate:string;paymentReference:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/payroll/runs/${id}/record-payment`, { method:'POST', headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}, body:JSON.stringify(body) })).data,
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
  updateEmployee: async (id:string,body:Partial<Pick<Employee,'employeeCode'|'firstName'|'lastName'|'email'|'phone'|'departmentId'|'designationId'|'reportingManagerId'|'dateOfJoining'|'employmentType'|'workLocation'|'workdayGpsTrackingEnabled'>>) => (await fetchJSON<ApiEnvelope<Employee>>(API_BASE + '/v1/employees/' + id,{method:'PATCH',headers:{Authorization:'Bearer ' + (localStorage.getItem(ACCESS_TOKEN_KEY)||'')},body:JSON.stringify(body)})).data,
  deleteEmployeeV1: async (id:string) => (await fetchJSON<ApiEnvelope<{deleted:boolean}>>(API_BASE + '/v1/employees/' + id,{method:'DELETE',headers:{Authorization:'Bearer ' + (localStorage.getItem(ACCESS_TOKEN_KEY)||'')}})).data,
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
  getStatutoryStatusV1: async () => (await fetchJSON<ApiEnvelope<{
    completionPercentage: number;
    isFullyCompliant: boolean;
    statutoryFields: Record<string, string | null>;
    missingFields: string[];
    documents: Array<{ id: string; docType: string; status: 'PENDING' | 'VERIFIED' | 'REJECTED'; title: string; fileName: string; uploadedAt: string; remarks?: string }>;
  }>>(`${API_BASE}/v1/workspace-settings/statutory-status`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  saveStatutoryDraftV1: async (body: Partial<CompanySettings>) => (await fetchJSON<ApiEnvelope<CompanySettings>>(`${API_BASE}/v1/workspace-settings/statutory-draft`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify(body),
  })).data,
  uploadStatutoryDocumentV1: async (file: File, docType: string, expiryDate?: string) => {
    const body = new FormData();
    body.append('document', file);
    body.append('docType', docType);
    if (expiryDate) body.append('expiryDate', expiryDate);
    return (await fetchJSON<ApiEnvelope<{ id: string; docType: string; status: string; title: string; fileName: string }>>(`${API_BASE}/v1/workspace-settings/statutory-documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body,
    })).data;
  },
  verifyStatutoryDocumentV1: async (id: string, status: 'VERIFIED' | 'REJECTED', remarks?: string) => (await fetchJSON<ApiEnvelope<{ id: string; docType: string; status: string; title: string; remarks?: string }>>(`${API_BASE}/v1/workspace-settings/statutory-documents/${id}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify({ status, remarks }),
  })).data,
  convertCandidateToEmployeeV1: async (id: string, payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfJoining: string;
    departmentId: string;
    designationId: string;
    employmentType?: string;
    monthlyCtc?: number;
    employeeCode?: string;
  }) => (await fetchJSON<ApiEnvelope<{
    candidate: { id: string; fullName: string; stage: string; hiredAt: string; employeeId: string };
    employee: { id: string; employeeCode: string; firstName: string; lastName: string; email: string };
    onboarding: { id: string; status: string };
    activationToken?: string;
  }>>(`${API_BASE}/v1/recruitment/applicants/${id}/convert-to-employee`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify(payload),
  })).data,
  getMyAssetsV1: async () => (await fetchJSON<ApiEnvelope<Array<{
    id: string;
    name: string;
    category: string;
    serialNumber: string;
    assignedDate: string;
    purchaseDate: string;
    status: string;
    condition: string;
    isAcknowledged: boolean;
    acknowledgedAt: string | null;
    hasPendingReturn: boolean;
    hasPendingIssue: boolean;
    returnRequestStatus: string | null;
  }>>>(`${API_BASE}/v1/me/assets`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
  })).data,
  acknowledgeMyAssetV1: async (id: string, body?: { notes?: string; deviceInfo?: string }) => (await fetchJSON<ApiEnvelope<{ success: boolean; assetId: string; acknowledgedAt: string }>>(`${API_BASE}/v1/me/assets/${id}/acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify(body || {}),
  })).data,
  reportMyAssetIssueV1: async (id: string, body: { issueDescription: string; severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) => (await fetchJSON<ApiEnvelope<{ success: boolean; message: string }>>(`${API_BASE}/v1/me/assets/${id}/report-issue`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify(body),
  })).data,
  requestMyAssetReturnV1: async (id: string, body: { reason: string; condition?: string }) => (await fetchJSON<ApiEnvelope<{ success: boolean; message: string }>>(`${API_BASE}/v1/me/assets/${id}/return-request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
    body: JSON.stringify(body),
  })).data,
  uploadCompanyDocumentV1: async(file:File,category:string,title:string) => {
    const body = new FormData();
    body.append('document', file);
    body.append('category', category);
    body.append('title', title);
    return (await fetchJSON<ApiEnvelope<CompanyDocument>>(`${API_BASE}/v1/operations/company-documents/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` },
      body,
    })).data;
  },
  getAttendanceRoute: async (recordId:string) => (await fetchJSON<ApiEnvelope<import('../types').AttendanceRoute>>(`${API_BASE}/v1/attendance/${recordId}/route`,{headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`}})).data,
  getCompanyDocumentFile: (id:string) => fetchProtectedFile(`${API_BASE}/v1/operations/company-documents/${id}/file`),
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
  getEmployeeDocumentFile: (id:string) => fetchProtectedFile(`${API_BASE}/v1/employee-documents/${id}/file`),
  getPerformanceWorkspace: async () => (await fetchJSON<ApiEnvelope<PerformanceWorkspace>>(`${API_BASE}/v1/performance-engine`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  createPerformanceCycle: async (body:{name:string;startsAt:string;endsAt:string;status:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/cycles`, { method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  createPerformanceReviewV1: async (body:{cycleId:string;employeeId:string;reviewerId:string}) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/reviews`, { method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  updatePerformanceReviewV1: async (id:string,body:Record<string,unknown>) => (await fetchJSON<ApiEnvelope<unknown>>(`${API_BASE}/v1/performance-engine/reviews/${id}`, { method:'PATCH',headers:{Authorization:`Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY)||''}`},body:JSON.stringify(body)})).data,
  askOrbitAi: async (prompt: string) => (await fetchJSON<ApiEnvelope<{ id: string; intent: string; answer: string; sources: Array<{ type: string; id: string }>; readOnly: boolean }>>(`${API_BASE}/v1/ai/ask`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify({ prompt }) })).data,

  // Payroll Compliance, Full & Final (F&F) Settlement & Form 16
  getSettlements: async () => (await fetchJSON<ApiEnvelope<any[]>>(`${API_BASE}/v1/payroll/compliance/settlements`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  getSettlementPreview: async (employeeId: string, lastWorkingDay?: string) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/settlements/preview/${employeeId}${lastWorkingDay ? `?lastWorkingDay=${encodeURIComponent(lastWorkingDay)}` : ''}`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  calculateSettlement: async (body: any) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/settlements/calculate`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  approveSettlement: async (id: string) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/settlements/${id}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  paySettlement: async (id: string) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/settlements/${id}/pay`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  downloadSettlementPdf: async (id: string, employeeCode = 'EMP') => {
    const res = await fetch(`${API_BASE}/v1/payroll/compliance/settlements/${id}/pdf`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }
    });
    if (!res.ok) throw new Error('Failed to download settlement voucher');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exit-settlement-${employeeCode}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
  getForm16List: async () => (await fetchJSON<ApiEnvelope<any[]>>(`${API_BASE}/v1/payroll/compliance/form16`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  publishForm16: async (id: string) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/form16/${id}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
  batchGenerateForm16: async (body: { financialYear: string; publishAll?: boolean }) => (await fetchJSON<ApiEnvelope<any>>(`${API_BASE}/v1/payroll/compliance/form16/generate-batch`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` }, body: JSON.stringify(body) })).data,
  getMyForm16List: async () => (await fetchJSON<ApiEnvelope<any[]>>(`${API_BASE}/v1/me/payroll/form16`, { headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_TOKEN_KEY) || ''}` } })).data,
};
