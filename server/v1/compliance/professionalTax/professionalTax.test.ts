import { describe, it, expect } from "vitest";
import {
  calculateProfessionalTax,
  UnsupportedPtStateException,
  MissingRequiredGenderException,
} from "./index.js";

describe("P2.9 Multi-State Professional Tax Statutory Engine", () => {
  describe("Karnataka (KA) Adapter", () => {
    it("returns ₹0 when gross earnings are below ₹25,000 threshold", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 24999.5,
        stateCode: "KA",
        payrollMonth: 5,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(0);
      expect(res.isExempt).toBe(true);
      expect(res.exemptionReason).toBe("EARNINGS_BELOW_25000");
    });

    it("returns ₹200 for normal months (March–January) when gross >= ₹25,000", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 50000,
        stateCode: "KA",
        payrollMonth: 6,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(200);
      expect(res.isFebruaryAdjustmentApplied).toBe(false);
      expect(res.isExempt).toBe(false);
    });

    it("returns ₹300 for February when gross >= ₹25,000 (annual ₹2,500 ceiling)", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 50000,
        stateCode: "KA",
        payrollMonth: 2,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(300);
      expect(res.isFebruaryAdjustmentApplied).toBe(true);
    });

    it("verifies annual Karnataka tax total equals exactly ₹2,500", () => {
      let annualTax = 0;
      for (let month = 1; month <= 12; month++) {
        const res = calculateProfessionalTax({
          grossApplicableWage: 60000,
          stateCode: "KA",
          payrollMonth: month,
          payrollYear: 2026,
        });
        annualTax += res.amount;
      }
      expect(annualTax).toBe(2500); // 11 * 200 + 300 = 2,500
    });
  });

  describe("Maharashtra (MH) Adapter", () => {
    it("throws MissingRequiredGenderException when gender is not specified", () => {
      expect(() =>
        calculateProfessionalTax({
          grossApplicableWage: 20000,
          stateCode: "MH",
          payrollMonth: 4,
          payrollYear: 2026,
          gender: null,
        }),
      ).toThrow(MissingRequiredGenderException);
    });

    it("exempts female employees earning up to ₹25,000 under the 2023 statutory amendment", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 25000,
        stateCode: "MH",
        gender: "FEMALE",
        payrollMonth: 4,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(0);
      expect(res.isExempt).toBe(true);
      expect(res.exemptionReason).toBe("WOMEN_EARNINGS_UP_TO_25000");
    });

    it("deducts ₹200 for female employees earning > ₹25,000 in normal months", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 25001,
        stateCode: "MH",
        gender: "FEMALE",
        payrollMonth: 4,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(200);
      expect(res.isFebruaryAdjustmentApplied).toBe(false);
    });

    it("deducts ₹300 in February for female employees earning > ₹25,000", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 30000,
        stateCode: "MH",
        gender: "FEMALE",
        payrollMonth: 2,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(300);
      expect(res.isFebruaryAdjustmentApplied).toBe(true);
    });

    it("evaluates male slabs: ₹0 for gross <= ₹7,500", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 7500,
        stateCode: "MH",
        gender: "MALE",
        payrollMonth: 5,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(0);
      expect(res.isExempt).toBe(true);
    });

    it("evaluates male slabs: ₹175 for gross in [7,501, 10,000]", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 8500,
        stateCode: "MH",
        gender: "MALE",
        payrollMonth: 5,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(175);
    });

    it("evaluates male slabs: ₹200 for gross > ₹10,000 in normal months, ₹300 in February", () => {
      const normalMonth = calculateProfessionalTax({
        grossApplicableWage: 15000,
        stateCode: "MH",
        gender: "MALE",
        payrollMonth: 5,
        payrollYear: 2026,
      });
      expect(normalMonth.amount).toBe(200);

      const febMonth = calculateProfessionalTax({
        grossApplicableWage: 15000,
        stateCode: "MH",
        gender: "MALE",
        payrollMonth: 2,
        payrollYear: 2026,
      });
      expect(febMonth.amount).toBe(300);
    });
  });

  describe("Telangana (TS) Adapter", () => {
    it("evaluates TS 3-tier slabs accurately: <= ₹15,000 is NIL", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 15000,
        stateCode: "TS",
        payrollMonth: 6,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(0);
      expect(res.isExempt).toBe(true);
    });

    it("evaluates TS 3-tier slabs: ₹15,001 to ₹20,000 is ₹150", () => {
      const res = calculateProfessionalTax({
        grossApplicableWage: 18000,
        stateCode: "TS",
        payrollMonth: 6,
        payrollYear: 2026,
      });
      expect(res.amount).toBe(150);
    });

    it("evaluates TS 3-tier slabs: > ₹20,000 is ₹200 across all 12 months (total ₹2,400)", () => {
      let annualTax = 0;
      for (let month = 1; month <= 12; month++) {
        const res = calculateProfessionalTax({
          grossApplicableWage: 25000,
          stateCode: "TS",
          payrollMonth: month,
          payrollYear: 2026,
        });
        annualTax += res.amount;
        expect(res.amount).toBe(200);
      }
      expect(annualTax).toBe(2400);
    });
  });

  describe("West Bengal (WB) Adapter (Temporal Versioning)", () => {
    it("evaluates Pre-October 2026 schedule (Version 1)", () => {
      const testCases = [
        { wage: 10000, expected: 0 },
        { wage: 12000, expected: 110 },
        { wage: 18000, expected: 130 },
        { wage: 30000, expected: 150 },
        { wage: 45000, expected: 200 },
      ];

      for (const tc of testCases) {
        const res = calculateProfessionalTax({
          grossApplicableWage: tc.wage,
          stateCode: "WB",
          payrollMonth: 5,
          payrollYear: 2026, // May 2026 < Oct 2026
        });
        expect(res.amount).toBe(tc.expected);
      }
    });

    it("evaluates Post-October 1, 2026 Amended Gazetted Schedule (Version 2)", () => {
      const testCases = [
        { wage: 20000, expected: 0 },
        { wage: 25000, expected: 100 },
        { wage: 40000, expected: 140 },
        { wage: 75000, expected: 170 },
        { wage: 120000, expected: 208 },
      ];

      for (const tc of testCases) {
        const res = calculateProfessionalTax({
          grossApplicableWage: tc.wage,
          stateCode: "WB",
          payrollMonth: 10,
          payrollYear: 2026, // October 2026 >= Oct 2026
        });
        expect(res.amount).toBe(tc.expected);
      }
    });
  });

  describe("Unsupported States", () => {
    it("throws UnsupportedPtStateException for deferred/unsupported states like TN and GJ", () => {
      expect(() =>
        calculateProfessionalTax({
          grossApplicableWage: 50000,
          stateCode: "TN" as any,
          payrollMonth: 4,
          payrollYear: 2026,
        }),
      ).toThrow(UnsupportedPtStateException);

      expect(() =>
        calculateProfessionalTax({
          grossApplicableWage: 50000,
          stateCode: "GJ" as any,
          payrollMonth: 4,
          payrollYear: 2026,
        }),
      ).toThrow(UnsupportedPtStateException);
    });
  });
});
