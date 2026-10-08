/**
 * OrbitHR Multi-State Professional Tax API Client (P2.9)
 * Typed client for /api/v1/compliance/pt endpoints.
 */

const API_BASE = "/api/v1";
const ACCESS_TOKEN_KEY = "orbithr_access_token";

function getAuthHeaders(): HeadersInit {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) || "" : "";
  return {
    "Content-Type": "application/json",
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
      (typeof errorBody.error === "string" ? errorBody.error : null) ||
      errorBody.message ||
      `HTTP ${res.status}: ${res.statusText}`;
    const err = new Error(message) as Error & { code?: string; details?: unknown };
    err.code = errorBody.error?.code;
    err.details = errorBody.error?.details;
    throw err;
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export interface PtRegistration {
  id: string;
  companyId: string;
  stateCode: "KA" | "MH" | "TS" | "WB";
  registrationType: "PT_RC" | "PT_EC";
  certificateNumber: string;
  issuingAuthority?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  workLocationId?: string | null;
  workLocation?: { id: string; name: string; state?: string | null } | null;
  notes?: string | null;
  createdAt: string;
}

export interface PtFilingItem {
  id: string;
  filingId: string;
  employeeId: string;
  snapshotEmployeeCode: string;
  snapshotEmployeeName: string;
  snapshotPan?: string | null;
  workingDays: number;
  payableDays: number;
  grossWages: number;
  ptAmount: number;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    gender?: string | null;
  };
}

export interface PtChallan {
  id: string;
  statutoryFilingId: string;
  stateCode: string;
  challanNumber: string;
  challanPeriodYear: number;
  challanPeriodMonth: number;
  totalEmployees: number;
  totalAmount: number;
  challanDate: string;
  paidDate?: string | null;
  cinNumber?: string | null;
  bankReference?: string | null;
  status: "CHALLAN_GENERATED" | "PAID" | "RECONCILED" | "CANCELLED";
  notes?: string | null;
  reconciledAt?: string | null;
}

export interface PtFiling {
  id: string;
  companyId: string;
  domain: string;
  stateCode: "KA" | "MH" | "TS" | "WB";
  periodYear: number;
  periodMonth?: number | null;
  status: "DRAFT" | "VALIDATED" | "PENDING_APPROVAL" | "APPROVED" | "LOCKED" | "EXPORTED";
  statutoryFormCode: string;
  totalEmployees: number;
  totalGrossWages: number;
  totalTaxDeducted: number;
  payrollRunId: string;
  sha256Checksum?: string | null;
  createdById: string;
  approvedById?: string | null;
  lockedAt?: string | null;
  ptChallan?: PtChallan | null;
  items?: PtFilingItem[];
  _count?: { items: number };
}

export interface PtStateMetric {
  stateCode: "KA" | "MH" | "TS" | "WB";
  activeRegistrationsCount: number;
  filingsCount: number;
  totalFiledLiability: number;
  totalPaidLiability: number;
  variance: number;
}

export interface PtOverview {
  supportedStates: Array<"KA" | "MH" | "TS" | "WB">;
  registrations: PtRegistration[];
  recentFilings: PtFiling[];
  stateMetrics: PtStateMetric[];
}

export const ptApi = {
  getOverview: () => request<PtOverview>("/compliance/pt/overview"),

  getRegistrations: () => request<PtRegistration[]>("/compliance/pt/registrations"),

  createRegistration: (payload: {
    stateCode: "KA" | "MH" | "TS" | "WB";
    registrationType?: "PT_RC" | "PT_EC";
    certificateNumber: string;
    issuingAuthority?: string | null;
    effectiveFrom: string;
    effectiveTo?: string | null;
    workLocationId?: string | null;
    notes?: string | null;
  }) =>
    request<PtRegistration>("/compliance/pt/registrations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateRegistration: (
    id: string,
    payload: {
      certificateNumber?: string;
      issuingAuthority?: string | null;
      status?: "ACTIVE" | "SUSPENDED" | "EXPIRED";
      effectiveTo?: string | null;
      workLocationId?: string | null;
      notes?: string | null;
    },
  ) =>
    request<PtRegistration>(`/compliance/pt/registrations/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteRegistration: (id: string) =>
    request<{ deleted: boolean }>(`/compliance/pt/registrations/${id}`, {
      method: "DELETE",
    }),

  getFilings: (params?: { stateCode?: string; periodYear?: number; periodMonth?: number }) => {
    const q = new URLSearchParams();
    if (params?.stateCode) q.set("stateCode", params.stateCode);
    if (params?.periodYear) q.set("periodYear", String(params.periodYear));
    if (params?.periodMonth) q.set("periodMonth", String(params.periodMonth));
    const qs = q.toString() ? `?${q.toString()}` : "";
    return request<PtFiling[]>(`/compliance/pt/filings${qs}`);
  },

  getFilingById: (id: string) => request<PtFiling>(`/compliance/pt/filings/${id}`),

  generateFiling: (payload: {
    payrollRunId: string;
    stateCode: "KA" | "MH" | "TS" | "WB";
    periodYear: number;
    periodMonth: number;
  }) =>
    request<PtFiling>("/compliance/pt/filings/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  validateFiling: (id: string) =>
    request<PtFiling>(`/compliance/pt/filings/${id}/validate`, {
      method: "POST",
    }),

  submitFiling: (id: string) =>
    request<PtFiling>(`/compliance/pt/filings/${id}/submit`, {
      method: "POST",
    }),

  approveFiling: (id: string) =>
    request<PtFiling>(`/compliance/pt/filings/${id}/approve`, {
      method: "POST",
    }),

  lockFiling: (id: string) =>
    request<PtFiling>(`/compliance/pt/filings/${id}/lock`, {
      method: "POST",
    }),

  getFilingExport: (id: string, format: "json" | "csv" = "json") =>
    request<unknown>(`/compliance/pt/filings/${id}/export?format=${format}`),

  getChallans: (stateCode?: string) => {
    const qs = stateCode ? `?stateCode=${stateCode}` : "";
    return request<PtChallan[]>(`/compliance/pt/challans${qs}`);
  },

  createChallan: (payload: {
    statutoryFilingId: string;
    challanNumber: string;
    challanDate: string;
    notes?: string | null;
  }) =>
    request<PtChallan>("/compliance/pt/challans", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  recordPayment: (
    id: string,
    payload: {
      paidDate: string;
      cinNumber?: string | null;
      bankReference?: string | null;
      notes?: string | null;
    },
  ) =>
    request<PtChallan>(`/compliance/pt/challans/${id}/record-payment`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  reconcileChallan: (id: string) =>
    request<{ reconciled: boolean; challan: PtChallan; variance: number }>(
      `/compliance/pt/challans/${id}/reconcile`,
      { method: "POST" },
    ),
};
