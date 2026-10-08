import type { PtCalculationInput, PtCalculationResult } from "../types.js";

/**
 * Karnataka Professional Tax Adapter
 * Governing Statute: Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976
 * Amendments: Karnataka Act No. 14 of 2023 & Karnataka Act No. 11 of 2025
 * 
 * Rules:
 * - Gross < ₹25,000: Nil
 * - Gross >= ₹25,000: ₹200 for months March through January, ₹300 for February (total ₹2,500/year).
 */
export function calculateKarnatakaPt(input: PtCalculationInput): PtCalculationResult {
  const wage = input.grossApplicableWage;
  const isFeb = input.payrollMonth === 2;

  if (wage < 25000) {
    return {
      amount: 0,
      stateCode: "KA",
      grossApplicableWage: wage,
      slabApplied: { min: 0, max: 24999.99, amount: 0, note: "Below ₹25,000 exemption limit" },
      calculationTrace: `KA: Gross ₹${wage.toFixed(2)} < ₹25,000 threshold -> PT ₹0.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: true,
      exemptionReason: "EARNINGS_BELOW_25000",
    };
  }

  const amount = isFeb ? 300 : 200;
  return {
    amount,
    stateCode: "KA",
    grossApplicableWage: wage,
    slabApplied: {
      min: 25000,
      max: null,
      amount,
      note: isFeb ? "February statutory adjustment ₹300" : "Standard monthly ₹200",
    },
    calculationTrace: `KA: Gross ₹${wage.toFixed(2)} >= ₹25,000 (${isFeb ? "February adjustment" : "Standard month"}) -> PT ₹${amount.toFixed(2)}`,
    isFebruaryAdjustmentApplied: isFeb,
    isExempt: false,
  };
}
