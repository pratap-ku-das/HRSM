import type { PtCalculationInput, PtCalculationResult } from "../types.js";

/**
 * West Bengal Professional Tax Adapter
 * Governing Statute: West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979
 * Amendments: Schedule amended w.e.f. October 1, 2026
 * 
 * Temporal Rule Boundary:
 * - Pre-October 2026 (Version 1):
 *     <= ₹10,000: NIL
 *     ₹10,001 - ₹15,000: ₹110 / month
 *     ₹15,001 - ₹20,000: ₹130 / month
 *     ₹20,001 - ₹40,000: ₹150 / month
 *     > ₹40,000: ₹200 / month
 * - Post-October 1, 2026 (Version 2 - Gazetted):
 *     <= ₹20,000: NIL
 *     ₹20,001 - ₹30,000: ₹100 / month
 *     ₹30,001 - ₹50,000: ₹140 / month
 *     ₹50,001 - ₹100,000: ₹170 / month
 *     > ₹100,000: ₹208 / month
 */
export function calculateWestBengalPt(input: PtCalculationInput): PtCalculationResult {
  const wage = input.grossApplicableWage;
  const isPostOct2026 =
    input.payrollYear > 2026 || (input.payrollYear === 2026 && input.payrollMonth >= 10);

  if (isPostOct2026) {
    // Post-October 1, 2026 Schedule
    if (wage <= 20000) {
      return {
        amount: 0,
        stateCode: "WB",
        grossApplicableWage: wage,
        slabApplied: { min: 0, max: 20000, amount: 0, note: "Gross up to ₹20,000 exempt (post-Oct 2026)" },
        calculationTrace: `WB (v2 post-Oct-2026): Gross ₹${wage.toFixed(2)} <= ₹20,000 -> PT ₹0.00`,
        isFebruaryAdjustmentApplied: false,
        isExempt: true,
        exemptionReason: "EARNINGS_UP_TO_20000",
      };
    }
    if (wage <= 30000) {
      return {
        amount: 100,
        stateCode: "WB",
        grossApplicableWage: wage,
        slabApplied: { min: 20000.01, max: 30000, amount: 100, note: "₹20,001 to ₹30,000 slab" },
        calculationTrace: `WB (v2 post-Oct-2026): Gross ₹${wage.toFixed(2)} in [20,001, 30,000] -> PT ₹100.00`,
        isFebruaryAdjustmentApplied: false,
        isExempt: false,
      };
    }
    if (wage <= 50000) {
      return {
        amount: 140,
        stateCode: "WB",
        grossApplicableWage: wage,
        slabApplied: { min: 30000.01, max: 50000, amount: 140, note: "₹30,001 to ₹50,000 slab" },
        calculationTrace: `WB (v2 post-Oct-2026): Gross ₹${wage.toFixed(2)} in [30,001, 50,000] -> PT ₹140.00`,
        isFebruaryAdjustmentApplied: false,
        isExempt: false,
      };
    }
    if (wage <= 100000) {
      return {
        amount: 170,
        stateCode: "WB",
        grossApplicableWage: wage,
        slabApplied: { min: 50000.01, max: 100000, amount: 170, note: "₹50,001 to ₹100,000 slab" },
        calculationTrace: `WB (v2 post-Oct-2026): Gross ₹${wage.toFixed(2)} in [50,001, 100,000] -> PT ₹170.00`,
        isFebruaryAdjustmentApplied: false,
        isExempt: false,
      };
    }
    return {
      amount: 208,
      stateCode: "WB",
      grossApplicableWage: wage,
      slabApplied: { min: 100000.01, max: null, amount: 208, note: "Above ₹100,000 slab" },
      calculationTrace: `WB (v2 post-Oct-2026): Gross ₹${wage.toFixed(2)} > ₹100,000 -> PT ₹208.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }

  // Pre-October 2026 Schedule
  if (wage <= 10000) {
    return {
      amount: 0,
      stateCode: "WB",
      grossApplicableWage: wage,
      slabApplied: { min: 0, max: 10000, amount: 0, note: "Gross up to ₹10,000 exempt (pre-Oct 2026)" },
      calculationTrace: `WB (v1 pre-Oct-2026): Gross ₹${wage.toFixed(2)} <= ₹10,000 -> PT ₹0.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: true,
      exemptionReason: "EARNINGS_UP_TO_10000",
    };
  }
  if (wage <= 15000) {
    return {
      amount: 110,
      stateCode: "WB",
      grossApplicableWage: wage,
      slabApplied: { min: 10000.01, max: 15000, amount: 110, note: "₹10,001 to ₹15,000 slab" },
      calculationTrace: `WB (v1 pre-Oct-2026): Gross ₹${wage.toFixed(2)} in [10,001, 15,000] -> PT ₹110.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }
  if (wage <= 20000) {
    return {
      amount: 130,
      stateCode: "WB",
      grossApplicableWage: wage,
      slabApplied: { min: 15000.01, max: 20000, amount: 130, note: "₹15,001 to ₹20,000 slab" },
      calculationTrace: `WB (v1 pre-Oct-2026): Gross ₹${wage.toFixed(2)} in [15,001, 20,000] -> PT ₹130.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }
  if (wage <= 40000) {
    return {
      amount: 150,
      stateCode: "WB",
      grossApplicableWage: wage,
      slabApplied: { min: 20000.01, max: 40000, amount: 150, note: "₹20,001 to ₹40,000 slab" },
      calculationTrace: `WB (v1 pre-Oct-2026): Gross ₹${wage.toFixed(2)} in [20,001, 40,000] -> PT ₹150.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }
  return {
    amount: 200,
    stateCode: "WB",
    grossApplicableWage: wage,
    slabApplied: { min: 40000.01, max: null, amount: 200, note: "Above ₹40,000 slab" },
    calculationTrace: `WB (v1 pre-Oct-2026): Gross ₹${wage.toFixed(2)} > ₹40,000 -> PT ₹200.00`,
    isFebruaryAdjustmentApplied: false,
    isExempt: false,
  };
}
