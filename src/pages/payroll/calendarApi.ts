export interface CalendarOverview {
  year: number;
  metrics: {
    total: number;
    upcoming: number;
    dueSoon: number;
    dueToday: number;
    overdue: number;
    filed: number;
    paid: number;
    completed: number;
    exempt: number;
  };
  domainBreakdown: {
    epf: number;
    esic: number;
    tds: number;
    pt: number;
  };
  recentUpcoming: CalendarObligation[];
}

export interface StatutoryFilingDetail {
  id: string;
  status: string;
  statutoryFormCode: string;
  domain?: string;
  filingType?: string;
  periodYear?: number;
  periodMonth?: number | null;
  quarter?: string | null;
  stateCode?: string | null;
  tokenNumberPrn?: string | null;
  filingReceiptDate?: string | null;
  totalEmployees?: number;
  totalGrossWages?: number;
  totalTaxDeducted?: number;
  sha256Checksum?: string | null;
  createdById?: string;
  validatedAt?: string | null;
  approvedById?: string | null;
  approvedAt?: string | null;
  lockedAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  ptChallan?: {
    id: string;
    challanNumber: string;
    cinNumber?: string | null;
    stateCode: string;
    challanPeriodYear: number;
    challanPeriodMonth: number;
    totalAmount: number;
    totalEmployees: number;
    challanDate: string;
    paidDate?: string | null;
    bankReference?: string | null;
    status: string;
    reconciledById?: string | null;
    reconciledAt?: string | null;
  } | null;
  epfChallans?: Array<{
    id: string;
    establishmentCode: string;
    wageMonth: number;
    wageYear: number;
    trrnNumber?: string | null;
    crnNumber?: string | null;
    totalAmount: number;
    challanDate: string;
    paidDate?: string | null;
    bankReference?: string | null;
    status: string;
    reconciledById?: string | null;
    reconciledAt?: string | null;
  }>;
  esicChallans?: Array<{
    id: string;
    cprnNumber?: string | null;
    challanPeriodYear: number;
    challanPeriodMonth: number;
    totalAmount: number;
    totalEmployees: number;
    challanDate: string;
    paidDate?: string | null;
    transactionReference?: string | null;
    bankReference?: string | null;
    status: string;
    reconciledById?: string | null;
    reconciledAt?: string | null;
  }>;
  challans?: Array<{
    id: string;
    financialYear?: string;
    quarter?: string;
    bsrCode?: string;
    challanDate?: string;
    challanSerialNo?: string;
    minorHead?: string;
    tdsAmount?: number;
    surcharge?: number;
    cess?: number;
    interest?: number;
    fee?: number;
    totalAmount?: number;
    chequeOrDdNo?: string | null;
    status?: string;
  }>;
}

export interface CalendarObligation {
  id: string;
  companyId: string;
  domain: "EPF_ECR" | "ESIC_MONTHLY" | "TDS_24Q" | "PROFESSIONAL_TAX";
  obligationType: string;
  jurisdiction: string;
  periodYear: number;
  periodMonth: number | null;
  quarter: string | null;
  statutoryDueDate: string;
  extendedDueDate: string | null;
  extensionReason: string | null;
  internalTargetDate: string | null;
  status: "UPCOMING" | "DUE_SOON" | "DUE_TODAY" | "OVERDUE" | "FILED" | "PAID" | "COMPLETED" | "EXEMPT" | "NEEDS_REVIEW";
  statutoryFilingId: string | null;
  assignedUserId: string | null;
  remindedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUser?: {
    id: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
  } | null;
  statutoryFiling?: StatutoryFilingDetail | null;
}

export interface CalendarFilterParams {
  year?: number;
  month?: number;
  quarter?: string;
  domain?: string;
  jurisdiction?: string;
  status?: string;
  assignedUserId?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("orbithr_auth_token");
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error?.message || errorData.message || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export const calendarApi = {
  getOverview(year?: number): Promise<CalendarOverview> {
    const q = year ? `?year=${year}` : "";
    return request<CalendarOverview>(`/compliance/calendar/overview${q}`);
  },

  getObligations(params?: CalendarFilterParams): Promise<CalendarObligation[]> {
    const sp = new URLSearchParams();
    if (params?.year) sp.set("year", String(params.year));
    if (params?.month) sp.set("month", String(params.month));
    if (params?.quarter) sp.set("quarter", params.quarter);
    if (params?.domain) sp.set("domain", params.domain);
    if (params?.jurisdiction) sp.set("jurisdiction", params.jurisdiction);
    if (params?.status) sp.set("status", params.status);
    if (params?.assignedUserId) sp.set("assignedUserId", params.assignedUserId);
    const qs = sp.toString() ? `?${sp.toString()}` : "";
    return request<CalendarObligation[]>(`/compliance/calendar/obligations${qs}`);
  },

  getObligation(id: string): Promise<CalendarObligation> {
    return request<CalendarObligation>(`/compliance/calendar/obligations/${id}`);
  },

  syncCalendar(year?: number, month?: number): Promise<{ totalProcessed: number; created: number; updated: number; syncedFilings: number }> {
    return request(`/compliance/calendar/sync`, {
      method: "POST",
      body: JSON.stringify({ year, month }),
    });
  },

  updateTargetDate(id: string, internalTargetDate: string | null): Promise<CalendarObligation> {
    return request<CalendarObligation>(`/compliance/calendar/obligations/${id}/target-date`, {
      method: "PATCH",
      body: JSON.stringify({ internalTargetDate }),
    });
  },

  assignObligation(id: string, assignedUserId: string | null): Promise<CalendarObligation> {
    return request<CalendarObligation>(`/compliance/calendar/obligations/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assignedUserId }),
    });
  },

  updateNotes(id: string, notes: string | null): Promise<CalendarObligation> {
    return request<CalendarObligation>(`/compliance/calendar/obligations/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    });
  },

  completeObligation(id: string, notes?: string): Promise<CalendarObligation> {
    return request<CalendarObligation>(`/compliance/calendar/obligations/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  exportScheduleUrl(year?: number, format: "csv" | "json" = "csv"): string {
    const y = year || new Date().getUTCFullYear();
    return `/api/v1/compliance/calendar/export?year=${y}&format=${format}`;
  },
};
