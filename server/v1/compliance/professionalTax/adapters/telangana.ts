import type { PtCalculationInput, PtCalculationResult } from "../types.js";

/**
 * Telangana Professional Tax Adapter
 * Governing Statute: Telangana Tax on Professions, Trades, Callings and Employments Act, 1987
 * 
 * Rules:
 * - Gross <= ₹15,000: NIL
 * - Gross ₹15,001 - ₹20,000: ₹150 / month
 * - Gross > ₹20,000: ₹200 / month (all 12 months, total ₹2,400/year)
 */
export function calculateTelanganaPt(input: PtCalculationInput): PtCalculationResult {
  const wage = input.grossApplicableWage;

  if (wage <= 15000) {
    return {
      amount: 0,
      stateCode: "TS",
      grossApplicableWage: wage,
      slabApplied: { min: 0, max: 15000, amount: 0, note: "Gross up to ₹15,000 exempt" },
      calculationTrace: `TS: Gross ₹${wage.toFixed(2)} <= ₹15,000 -> PT ₹0.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: true,
      exemptionReason: "EARNINGS_UP_TO_15000",
    };
  }

  if (wage <= 20000) {
    return {
      amount: 150,
      stateCode: "TS",
      grossApplicableWage: wage,
      slabApplied: { min: 15000.01, max: 20000, amount: 150, note: "₹15,001 to ₹20,000 slab" },
      calculationTrace: `TS: Gross ₹${wage.toFixed(2)} in [15,001, 20,000] -> PT ₹150.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }

  return {
    amount: 200,
    stateCode: "TS",
    grossApplicableWage: wage,
    slabApplied: { min: 20000.01, max: null, amount: 200, note: "Above ₹20,000 slab" },
    calculationTrace: `TS: Gross ₹${wage.toFixed(2)} > ₹20,000 -> PT ₹200.00`,
    isFebruaryAdjustmentApplied: false,
    isExempt: false,
  };
}
