import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ObligationDetailModal } from "./ObligationDetailModal";
import type { CalendarObligation } from "../../pages/payroll/calendarApi";

describe("ObligationDetailModal Component (P2.11)", () => {
  const baseObligation: CalendarObligation = {
    id: "ob-101",
    companyId: "comp-test-1",
    domain: "EPF_ECR",
    obligationType: "EPF_ECR_MONTHLY_RETURN",
    jurisdiction: "IN",
    periodYear: 2026,
    periodMonth: 5,
    quarter: null,
    statutoryDueDate: "2026-06-15T00:00:00.000Z",
    extendedDueDate: null,
    extensionReason: null,
    internalTargetDate: "2026-06-10T00:00:00.000Z",
    status: "DUE_SOON",
    statutoryFilingId: "filing-epf-1",
    assignedUserId: "user-comp-1",
    remindedAt: null,
    completedAt: null,
    notes: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    assignedUser: {
      id: "user-comp-1",
      fullName: "Compliance Lead",
      email: "lead@example.com",
    },
    statutoryFiling: {
      id: "filing-epf-1",
      status: "APPROVED",
      statutoryFormCode: "ECR",
      createdById: "maker-user-42",
      validatedAt: "2026-06-08T10:00:00.000Z",
      approvedById: "checker-user-99",
      approvedAt: "2026-06-09T14:30:00.000Z",
      lockedAt: null,
      rejectionReason: null,
      epfChallans: [
        {
          id: "epf-chal-1",
          establishmentCode: "KN/BNG/0012345/000",
          wageMonth: 5,
          wageYear: 2026,
          trrnNumber: "TRRN-987654321",
          crnNumber: "CRN-55443322",
          totalAmount: 185400,
          challanDate: "2026-06-08T00:00:00.000Z",
          paidDate: "2026-06-09T00:00:00.000Z",
          bankReference: "HDFC-TXN-009988",
          status: "RECONCILED",
          reconciledById: "fin-audit-1",
          reconciledAt: "2026-06-10T09:00:00.000Z",
        },
      ],
    },
  };

  it("renders nothing when isOpen is false", () => {
    const html = renderToString(
      <ObligationDetailModal
        isOpen={false}
        obligationId="ob-101"
        initialObligation={baseObligation}
        onClose={vi.fn()}
      />
    );
    expect(html).toBe("");
  });

  it("renders authoritative header, domain, and status badges when open", () => {
    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={baseObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("EPF / ECR");
    expect(html).toContain("Due Soon");
    expect(html).toContain("Jurisdiction:");
    expect(html).toContain("IN");
    expect(html).toContain("EPF ECR MONTHLY RETURN");
    expect(html).toContain("2026-06-15");
    expect(html).toContain("2026-06-10");
    expect(html).toContain("Compliance Lead");
  });

  it("renders Maker–Checker approval stage and audit metadata", () => {
    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={baseObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Maker–Checker Approval Lifecycle");
    expect(html).toContain("Filing Status:");
    expect(html).toContain("APPROVED");
    expect(html).toContain("1. Maker Created");
    expect(html).toContain("2. Validated");
    expect(html).toContain("3. Approved");
    expect(html).toContain("maker-user-42");
    expect(html).toContain("checker-user-99");
    expect(html).toContain("2026-06-08");
    expect(html).toContain("2026-06-09");
  });

  it("renders rejection notice prominently when filing was rejected", () => {
    const rejectedObligation: CalendarObligation = {
      ...baseObligation,
      statutoryFiling: {
        id: "filing-rej-1",
        status: "REJECTED",
        statutoryFormCode: "ECR",
        createdById: "maker-user-42",
        rejectionReason: "Wages calculation discrepancy detected in Account 10 share.",
      },
    };

    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={rejectedObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Rejection Notice");
    expect(html).toContain("Wages calculation discrepancy detected in Account 10 share.");
  });

  it("renders empty state message when no statutory filing is linked yet", () => {
    const unlinkedObligation: CalendarObligation = {
      ...baseObligation,
      statutoryFilingId: null,
      statutoryFiling: null,
    };

    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={unlinkedObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("No Statutory Filing Linked");
    expect(html).toContain("A statutory return has not yet been generated for this period");
  });

  it("renders EPF Challan reconciliation details correctly", () => {
    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={baseObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("TRRN:");
    expect(html).toContain("TRRN-987654321");
    expect(html).toContain("KN/BNG/0012345/000");
    expect(html).toContain("RECONCILED");
    expect(html).toContain("HDFC-TXN-009988");
  });

  it("renders ESIC CPRN challan details when obligation is ESIC", () => {
    const esicObligation: CalendarObligation = {
      ...baseObligation,
      domain: "ESIC_MONTHLY",
      obligationType: "ESIC_MONTHLY_CONTRIBUTION",
      statutoryFiling: {
        id: "filing-esic-1",
        status: "PAID",
        statutoryFormCode: "ESIC_MONTHLY",
        esicChallans: [
          {
            id: "esic-chal-1",
            cprnNumber: "CPRN-11223344",
            challanPeriodYear: 2026,
            challanPeriodMonth: 5,
            totalAmount: 45200,
            totalEmployees: 32,
            challanDate: "2026-06-10T00:00:00.000Z",
            paidDate: "2026-06-12T00:00:00.000Z",
            transactionReference: "ESIC-PAY-776655",
            bankReference: "SBI-TXN-112233",
            status: "PAID",
          },
        ],
      },
    };

    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={esicObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("CPRN:");
    expect(html).toContain("CPRN-11223344");
    expect(html).toContain("Employees:");
    expect(html).toContain("32");
    expect(html).toContain("PAID");
    expect(html).toContain("SBI-TXN-112233");
  });

  it("renders Professional Tax challan details when obligation is PT", () => {
    const ptObligation: CalendarObligation = {
      ...baseObligation,
      domain: "PROFESSIONAL_TAX",
      obligationType: "PT_FORM_5A_MONTHLY_RETURN",
      jurisdiction: "KA",
      statutoryFiling: {
        id: "filing-pt-1",
        status: "APPROVED",
        statutoryFormCode: "FORM_5A",
        ptChallan: {
          id: "pt-chal-1",
          challanNumber: "KA-PT-202605-0012",
          cinNumber: "CIN-998877",
          stateCode: "KA",
          challanPeriodYear: 2026,
          challanPeriodMonth: 5,
          totalAmount: 12000,
          totalEmployees: 60,
          challanDate: "2026-06-05T00:00:00.000Z",
          paidDate: "2026-06-08T00:00:00.000Z",
          status: "RECONCILED",
          reconciledAt: "2026-06-09T00:00:00.000Z",
        },
      },
    };

    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={ptObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("Challan No:");
    expect(html).toContain("KA-PT-202605-0012");
    expect(html).toContain("State:");
    expect(html).toContain("KA");
    expect(html).toContain("CIN-998877");
    expect(html).toContain("RECONCILED");
  });

  it("renders TDS Challan details when obligation is TDS", () => {
    const tdsObligation: CalendarObligation = {
      ...baseObligation,
      domain: "TDS_24Q",
      obligationType: "TDS_24Q_Q1_RETURN",
      quarter: "Q1",
      statutoryFiling: {
        id: "filing-tds-1",
        status: "LOCKED",
        statutoryFormCode: "24Q",
        tokenNumberPrn: "050010200000123",
        challans: [
          {
            id: "tds-chal-1",
            bsrCode: "0210045",
            challanSerialNo: "00123",
            challanDate: "2026-07-05T00:00:00.000Z",
            tdsAmount: 55000,
            cess: 2200,
            fee: 0,
            totalAmount: 57200,
          },
        ],
      },
    };

    const html = renderToString(
      <ObligationDetailModal
        isOpen={true}
        obligationId="ob-101"
        initialObligation={tdsObligation}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("BSR:");
    expect(html).toContain("0210045");
    expect(html).toContain("Challan #");
    expect(html).toContain("00123");
    expect(html).toContain("DEPOSITED");
    expect(html).toContain("050010200000123");
  });
});
