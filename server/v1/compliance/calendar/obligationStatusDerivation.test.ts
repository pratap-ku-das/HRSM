import { describe, it, expect } from "vitest";
import { deriveObligationStatus } from "./syncService.js";
import type { StatutoryFilingStatus } from "@prisma/client";

type FilingWithRelations = NonNullable<Parameters<typeof deriveObligationStatus>[0]["filing"]>;

function makeFiling(partial: Partial<FilingWithRelations> = {}): FilingWithRelations {
  return {
    id: "filing-001",
    companyId: "company-001",
    periodYear: 2026,
    periodMonth: 9,
    filingType: "ORIGINAL",
    status: "DRAFT",
    filingReceiptDate: null,
    acknowledgementNumber: null,
    tokenNumberPrn: null,
    totalGrossAmount: 100000,
    totalEmployeeContribution: 12000,
    totalEmployerContribution: 12000,
    challanUrl: null,
    rawPayloadUrl: null,
    filingArtifacts: null,
    rejectionReason: null,
    createdById: "user-001",
    approvedById: null,
    approvedAt: null,
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-01"),
    ptChallan: null,
    epfChallans: [],
    esicChallans: [],
    challans: [],
    ...partial,
  } as FilingWithRelations;
}

describe("P2.11 Compliance Obligation Status Derivation Engine", () => {
  const baseDueDate = new Date("2026-10-15T00:00:00Z");

  describe("1. Manual Completion Override", () => {
    it("returns COMPLETED immediately when manualCompletedAt is set", () => {
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        manualCompletedAt: new Date("2026-10-09T00:00:00Z"),
      });
      expect(status).toBe("COMPLETED");
    });
  });

  describe("2. Maker-Checker Invariant: Internal Stages Never Prematurely FILED (OBS-P2.10-01)", () => {
    const internalStatuses: StatutoryFilingStatus[] = [
      "DRAFT",
      "VALIDATED",
      "PENDING_APPROVAL",
      "APPROVED",
      "LOCKED",
      "EXPORTED",
    ];

    for (const internalStatus of internalStatuses) {
      it(`does NOT return FILED for internal status ${internalStatus} when unsubmitted`, () => {
        const filing = makeFiling({ status: internalStatus });
        const status = deriveObligationStatus({
          dueDate: baseDueDate,
          now: new Date("2026-10-14T00:00:00Z"), // 1 day before due
          filing,
        });
        expect(status).not.toBe("FILED");
        expect(status).toBe("DUE_SOON");
      });
    }

    it("evaluates OVERDUE when an internal filing passes the statutory deadline", () => {
      const filing = makeFiling({ status: "PENDING_APPROVAL" });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-16T00:00:00Z"), // 1 day overdue
        filing,
      });
      expect(status).toBe("OVERDUE");
    });

    it("evaluates DUE_TODAY when now matches statutory deadline date", () => {
      const filing = makeFiling({ status: "VALIDATED" });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-15T08:30:00Z"),
        filing,
      });
      expect(status).toBe("DUE_TODAY");
    });

    it("evaluates UPCOMING when now is more than 3 days prior to deadline", () => {
      const filing = makeFiling({ status: "DRAFT" });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-05T00:00:00Z"), // 10 days before
        filing,
      });
      expect(status).toBe("UPCOMING");
    });
  });

  describe("3. Reconciled Challan Visibility (OBS-P2.10-02): PAID State", () => {
    it("returns PAID when EPF challan is reconciled but return not yet submitted", () => {
      const filing = makeFiling({
        status: "APPROVED",
        epfChallans: [{ status: "RECONCILED", trrnNumber: null }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("PAID");
    });

    it("returns PAID when ESIC challan is PAID without CPRN confirmation", () => {
      const filing = makeFiling({
        status: "APPROVED",
        esicChallans: [{ status: "PAID", challanNumber: null, cprnNumber: null }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("PAID");
    });

    it("returns PAID when PT Challan is PAID without external filing confirmation", () => {
      const filing = makeFiling({
        status: "APPROVED",
        ptChallan: { status: "PAID", challanNumber: null },
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("PAID");
    });

    it("returns PAID when TDS Challan is linked but quarterly return not yet filed", () => {
      const filing = makeFiling({
        status: "APPROVED",
        challans: [{ id: "tds-ch-1", challanSerialNo: "00123", bsrCode: "0510321" }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("PAID");
    });
  });

  describe("4. External Submission Evidence (FILED and COMPLETED)", () => {
    it("returns FILED when EPF TRRN is generated but payment not yet reconciled", () => {
      const filing = makeFiling({
        status: "EXPORTED",
        epfChallans: [{ status: "CHALLAN_GENERATED", trrnNumber: "TRRN123456789" }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("FILED");
    });

    it("returns FILED when ESIC CPRN is present but payment not yet reconciled", () => {
      const filing = makeFiling({
        status: "EXPORTED",
        esicChallans: [{ status: "CHALLAN_GENERATED", cprnNumber: "CPRN9876543210" }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("FILED");
    });

    it("returns COMPLETED when both external submission evidence and paid challan exist", () => {
      const filing = makeFiling({
        status: "EXPORTED",
        tokenNumberPrn: "PRN-2026-Q2-8877",
        challans: [{ id: "tds-ch-1", challanSerialNo: "00123" }],
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("COMPLETED");
    });
  });

  describe("5. Rejections, Cancellations, and Proximity Extensions", () => {
    it("returns OVERDUE for cancelled filing past due date", () => {
      const filing = makeFiling({ status: "CANCELLED" });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-18T00:00:00Z"),
        filing,
      });
      expect(status).toBe("OVERDUE");
    });

    it("returns NEEDS_REVIEW for rejected filing before due date", () => {
      const filing = makeFiling({
        status: "DRAFT",
        rejectionReason: "Portal upload failed schema validation",
      });
      const status = deriveObligationStatus({
        dueDate: baseDueDate,
        now: new Date("2026-10-10T00:00:00Z"),
        filing,
      });
      expect(status).toBe("NEEDS_REVIEW");
    });

    it("respects extendedDueDate over standard dueDate", () => {
      const filing = makeFiling({ status: "DRAFT" });
      const status = deriveObligationStatus({
        dueDate: baseDueDate, // Oct 15
        extendedDueDate: new Date("2026-10-25T00:00:00Z"), // Oct 25
        now: new Date("2026-10-16T00:00:00Z"), // Oct 16
        filing,
      });
      // Rather than OVERDUE (based on Oct 15), it evaluates against Oct 25 (9 days before -> UPCOMING)
      expect(status).toBe("UPCOMING");
    });
  });
});
