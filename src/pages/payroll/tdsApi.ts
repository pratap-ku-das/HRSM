/**
 * OrbitHR TDS Compliance API Service Helper (P2.8)
 * Frontend-only service client for TDS Form 24Q / Form 138 statutory endpoints.
 */

const API_BASE = '/api';
const ACCESS_TOKEN_KEY = 'orbithr_access_token';

function getAuthHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) || '' : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      errorBody.error?.message ||
      (typeof errorBody.error === 'string' ? errorBody.error : null) ||
      errorBody.message ||
      `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(message) as Error & { code?: string; details?: any };
    err.code = errorBody.error?.code;
    err.details = errorBody.error?.details;
    throw err;
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export interface TdsFilingItem {
  id: string;
  filingId: string;
  employeeId: string;
  snapshotEmployeeCode: string;
  snapshotEmployeeName: string;
  snapshotPan: string | null;
  panStatus: 'VALID' | 'PANAPPLIED' | 'PANNOTAVBL' | 'PANINVALID' | 'NOT_APPLICABLE' | string;
  grossWages: number;
  tdsAmount: number;
  tdsChallanId: string | null;
  deducteeReasonCode: string | null;
  calculationDetails?: {
    paymentDate?: string;
    rateOfTds?: number;
    certificateNumber?: string;
    [key: string]: any;
  } | null;
}

export interface TdsChallan {
  id: string;
  companyId: string;
  financialYear: string;
  quarter: string;
  bsrCode: string;
  challanDate: string;
  challanSerialNo: string;
  minorHead: string;
  tdsAmount: number;
  surcharge: number;
  cess: number;
  interest: number;
  fee: number;
  totalAmount: number;
  chequeOrDdNo: string | null;
  statutoryFilingId: string | null;
  createdAt: string;
}

export interface TdsChallanAllocation {
  id: string;
  companyId: string;
  statutoryFilingId: string;
  tdsChallanId: string;
  statutoryFilingItemId: string;
  allocatedTds: number;
  allocatedSurcharge: number;
  allocatedCess: number;
  allocatedTotal: number;
  createdById: string;
  createdAt: string;
  challan?: TdsChallan;
  filingItem?: TdsFilingItem;
}

export interface TdsStatutoryFiling {
  id: string;
  companyId: string;
  domain: string;
  statutoryFormCode: string;
  periodYear: number;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  filingType: 'ORIGINAL' | 'REVISED';
  status: 'DRAFT' | 'VALIDATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'LOCKED' | 'EXPORTED' | 'CANCELLED';
  totalEmployees: number;
  totalGrossWages: number;
  totalTaxDeducted: number;
  sha256Checksum: string | null;
  tokenNumberPrn: string | null;
  filingReceiptDate: string | null;
  supersededFilingId: string | null;
  createdById: string;
  approvedById: string | null;
  createdAt: string;
  validatedAt: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  items: TdsFilingItem[];
  challans: TdsChallan[];
}

export interface CreateSnapshotPayload {
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  quarterlyPayrollRunIds: string[];
  filingType?: 'ORIGINAL' | 'REVISED';
  supersededFilingId?: string;
  tokenNumberPrn?: string;
  autoAllocateChallanFifo?: boolean;
}

export interface CreateChallanPayload {
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  bsrCode: string;
  challanDate: string;
  challanSerialNo: string;
  minorHead: '200' | '400';
  tdsAmount: number;
  surcharge?: number;
  cess?: number;
  interest?: number;
  fee?: number;
  chequeOrDdNo?: string;
  statutoryFilingId?: string;
}

export interface UpsertAllocationPayload {
  statutoryFilingItemId: string;
  tdsChallanId: string;
  allocatedTds: number;
  allocatedSurcharge: number;
  allocatedCess: number;
  allocatedTotal?: number;
}

export const tdsApi = {
  getFilings: async (params?: { periodYear?: number; status?: string }): Promise<TdsStatutoryFiling[]> => {
    const q = new URLSearchParams();
    q.set('domain', 'TDS_24Q');
    if (params?.status) q.set('status', params.status);
    if (params?.periodYear) q.set('periodYear', String(params.periodYear));
    return request<TdsStatutoryFiling[]>(`/v1/compliance/filings?${q.toString()}`);
  },

  getFiling: async (id: string): Promise<TdsStatutoryFiling> => {
    return request<TdsStatutoryFiling>(`/v1/compliance/filings/${id}`);
  },

  createSnapshot: async (payload: CreateSnapshotPayload): Promise<{
    filing: TdsStatutoryFiling;
    formCode: string;
    formatVersion: string;
    ledger: any;
    validationWarnings: string[];
  }> => {
    return request(`/v1/compliance/tds/filings/snapshot`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  validateFiling: async (id: string): Promise<{ filing: TdsStatutoryFiling; ledger: any; formatSpec: string }> => {
    return request(`/v1/compliance/tds/filings/${id}/validate`, {
      method: 'POST',
    });
  },

  submitForApproval: async (id: string): Promise<TdsStatutoryFiling> => {
    return request(`/v1/compliance/tds/filings/${id}/submit-for-approval`, {
      method: 'POST',
    });
  },

  approveFiling: async (id: string): Promise<TdsStatutoryFiling> => {
    return request(`/v1/compliance/tds/filings/${id}/approve`, {
      method: 'POST',
    });
  },

  lockFiling: async (id: string): Promise<TdsStatutoryFiling> => {
    return request(`/v1/compliance/tds/filings/${id}/lock`, {
      method: 'POST',
    });
  },

  downloadEtdsFile: async (id: string, customFilename?: string): Promise<void> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) || '' : '';
    const res = await fetch(`${API_BASE}/v1/compliance/tds/filings/${id}/export`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to download e-TDS return file');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = customFilename || `eTDS_Return_${id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  recordToken: async (id: string, payload: { tokenNumberPrn: string; receiptDate: string }): Promise<TdsStatutoryFiling> => {
    return request(`/v1/compliance/tds/filings/${id}/record-token`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAllocations: async (id: string): Promise<TdsChallanAllocation[]> => {
    return request<TdsChallanAllocation[]>(`/v1/compliance/tds/filings/${id}/allocations`);
  },

  upsertAllocation: async (id: string, payload: UpsertAllocationPayload): Promise<TdsChallanAllocation> => {
    return request<TdsChallanAllocation>(`/v1/compliance/tds/filings/${id}/allocations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getChallans: async (params?: { financialYear?: string; quarter?: string }): Promise<TdsChallan[]> => {
    const q = new URLSearchParams();
    if (params?.financialYear) q.set('financialYear', params.financialYear);
    if (params?.quarter) q.set('quarter', params.quarter);
    return request<TdsChallan[]>(`/v1/compliance/challans?${q.toString()}`);
  },

  createChallan: async (payload: CreateChallanPayload): Promise<TdsChallan> => {
    return request<TdsChallan>(`/v1/compliance/challans`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getPayrollConfiguration: async (): Promise<any> => {
    return request(`/v1/payroll/configuration`);
  },

  getCompanySettings: async (): Promise<any> => {
    return request(`/v1/company/settings`).catch(() => null);
  },
};
