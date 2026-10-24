import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ComplianceCalendarTab } from "./ComplianceCalendarTab";

// Use vi.hoisted to ensure mock data is accessible inside hoisted vi.mock
const { mockObligations, mockOverview } = vi.hoisted(() => {
  const obligations = [
    {
      id: "ob-epf-1",
      companyId: "comp-1",
      domain: "EPF_ECR",
      obligationType: "EPF_ECR_MONTHLY_RETURN",
      jurisdiction: "IN",
      periodYear: 2026,
      periodMonth: 9,
      quarter: null,
      statutoryDueDate: "2026-10-15T00:00:00.000Z",
      extendedDueDate: null,
      extensionReason: null,
      internalTargetDate: "2026-10-10T00:00:00.000Z",
      status: "DUE_SOON",
      statutoryFilingId: "filing-epf-1",
      assignedUserId: "user-1",
      remindedAt: null,
      completedAt: null,
      notes: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      assignedUser: {
        id: "user-1",
        fullName: "Pooja Sharma",
        email: "pooja@example.com",
      },
      statutoryFiling: {
        id: "filing-epf-1",
        status: "APPROVED",
        statutoryFormCode: "ECR",
        createdById: "user-1",
        validatedAt: "2026-10-08T00:00:00.000Z",
        approvedById: "user-admin",
        approvedAt: "2026-10-09T00:00:00.000Z",
        lockedAt: null,
        rejectionReason: null,
        epfChallans: [
          {
            id: "chal-1",
            establishmentCode: "DL/CPM/0012345/000",
            wageMonth: 9,
            wageYear: 2026,
            trrnNumber: "TRRN-123456789",
            crnNumber: null,
            totalAmount: 45000,
            challanDate: "2026-10-08T00:00:00.000Z",
            paidDate: "2026-10-09T00:00:00.000Z",
            bankReference: "HDFC-12345",
            status: "RECONCILED",
            reconciledById: "user-admin",
            reconciledAt: "2026-10-09T00:00:00.000Z",
          },
        ],
      },
    },
  ];

  const overview = {
    year: 2026,
    metrics: {
      total: 3,
      upcoming: 0,
      dueSoon: 1,
      dueToday: 0,
      overdue: 1,
      filed: 0,
      paid: 1,
      completed: 0,
    },
    obligations,
  };

  return { mockObligations: obligations, mockOverview: overview };
});

// Mock AuthContext
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    currentUser: {
      id: "test-user-admin",
      fullName: "Admin User",
      role: "COMPANY_ADMIN",
      email: "admin@example.com",
    },
  }),
}));

// Mock ToastContext
vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

// Mock calendarApi
vi.mock("./calendarApi", () => ({
  calendarApi: {
    getOverview: vi.fn().mockResolvedValue(mockOverview),
    getObligations: vi.fn().mockResolvedValue(mockObligations),
    syncCalendar: vi.fn().mockResolvedValue({ synchronized: 3 }),
    updateObligation: vi.fn().mockResolvedValue({ id: "ob-epf-1" }),
    exportCalendarCsv: vi.fn().mockReturnValue("data:text/csv;charset=utf-8,id,domain"),
    exportScheduleUrl: vi.fn().mockReturnValue("/api/v1/compliance/calendar/export?year=2026&format=csv"),
  },
}));

describe("ComplianceCalendarTab Component (Frontend Automation Suite)", () => {
  it("renders authoritative header title and executive actions", () => {
    const html = renderToString(<ComplianceCalendarTab />);

    expect(html).toContain("Unified Statutory Compliance Calendar");
    expect(html).toContain("Orchestrate legal deadlines, internal targets, and filing synchronizations");
    expect(html).toContain("Sync Obligations");
    expect(html).toContain("Export CSV");
    expect(html).toContain("Calendar Year");
  });

  it("renders domain filter select options correctly", () => {
    const html = renderToString(<ComplianceCalendarTab />);

    expect(html).toContain("All Domains");
    expect(html).toContain("EPF / ECR");
    expect(html).toContain("ESIC Monthly");
    expect(html).toContain("TDS (24Q / 138)");
    expect(html).toContain("Professional Tax");
  });

  it("renders status filter select options correctly", () => {
    const html = renderToString(<ComplianceCalendarTab />);

    expect(html).toContain("All Statuses");
    expect(html).toContain("Due Soon");
    expect(html).toContain("Due Today");
    expect(html).toContain("Overdue");
    expect(html).toContain("Upcoming");
    expect(html).toContain("Filed");
    expect(html).toContain("Challan Paid");
    expect(html).toContain("Completed");
  });

  it("renders search input field with correct placeholder", () => {
    const html = renderToString(<ComplianceCalendarTab />);

    expect(html).toContain('placeholder="Search obligations..."');
  });

  it("renders view mode switcher buttons", () => {
    const html = renderToString(<ComplianceCalendarTab />);

    expect(html).toContain("Month View");
    expect(html).toContain("Table View");
  });
});
