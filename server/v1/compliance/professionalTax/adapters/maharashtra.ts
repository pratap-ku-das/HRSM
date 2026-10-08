import type { PtCalculationInput, PtCalculationResult } from "../types.js";
import { MissingRequiredGenderException } from "../types.js";

/**
 * Maharashtra Professional Tax Adapter
 * Governing Statute: Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975
 * Amendments: Maharashtra Tax Laws (Levy and Amendment) Act, 2023 (w.e.f. 2023-04-01)
 * 
 * Rules:
 * - Women (w.e.f. 2023-04-01):
 *     Gross <= ₹25,000: NIL (Exempt)
 *     Gross > ₹25,000: ₹200 (March through January), ₹300 in February
 * - Men:
 *     Gross <= ₹7,500: NIL
 *     Gross ₹7,501 - ₹10,000: ₹175 / month
 *     Gross > ₹10,000: ₹200 (March through January), ₹300 in February
 */
export function calculateMaharashtraPt(input: PtCalculationInput): PtCalculationResult {
  const wage = input.grossApplicableWage;
  const isFeb = input.payrollMonth === 2;
  const rawGender = input.gender ? String(input.gender).trim().toUpperCase() : null;

  if (!rawGender || (rawGender !== "MALE" && rawGender !== "FEMALE" && rawGender !== "OTHER")) {
    throw new MissingRequiredGenderException(
      "Maharashtra PT calculation requires employee gender to evaluate the ₹25,000 female exemption threshold",
      { grossApplicableWage: wage, payrollMonth: input.payrollMonth, gender: input.gender },
    );
  }

  const isFemale = rawGender === "FEMALE";

  if (isFemale) {
    if (wage <= 25000) {
      return {
        amount: 0,
        stateCode: "MH",
        grossApplicableWage: wage,
        slabApplied: { min: 0, max: 25000, amount: 0, note: "Women earning up to ₹25,000 exempt under 2023 amendment" },
        calculationTrace: `MH (Female): Gross ₹${wage.toFixed(2)} <= ₹25,000 statutory exemption threshold -> PT ₹0.00`,
        isFebruaryAdjustmentApplied: false,
        isExempt: true,
        exemptionReason: "WOMEN_EARNINGS_UP_TO_25000",
      };
    }

    const amount = isFeb ? 300 : 200;
    return {
      amount,
      stateCode: "MH",
      grossApplicableWage: wage,
      slabApplied: {
        min: 25000.01,
        max: null,
        amount,
        note: isFeb ? "February adjustment ₹300" : "Standard monthly ₹200",
      },
      calculationTrace: `MH (Female): Gross ₹${wage.toFixed(2)} > ₹25,000 (${isFeb ? "February adjustment" : "Standard month"}) -> PT ₹${amount.toFixed(2)}`,
      isFebruaryAdjustmentApplied: isFeb,
      isExempt: false,
    };
  }

  // Male / Other
  if (wage <= 7500) {
    return {
      amount: 0,
      stateCode: "MH",
      grossApplicableWage: wage,
      slabApplied: { min: 0, max: 7500, amount: 0, note: "Gross up to ₹7,500 exempt" },
      calculationTrace: `MH (Male/Other): Gross ₹${wage.toFixed(2)} <= ₹7,500 -> PT ₹0.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: true,
      exemptionReason: "EARNINGS_UP_TO_7500",
    };
  }

  if (wage <= 10000) {
    return {
      amount: 175,
      stateCode: "MH",
      grossApplicableWage: wage,
      slabApplied: { min: 7500.01, max: 10000, amount: 175, note: "₹7,501 to ₹10,000 slab" },
      calculationTrace: `MH (Male/Other): Gross ₹${wage.toFixed(2)} in [7,501, 10,000] -> PT ₹175.00`,
      isFebruaryAdjustmentApplied: false,
      isExempt: false,
    };
  }

  const amount = isFeb ? 300 : 200;
  return {
    amount,
    stateCode: "MH",
    grossApplicableWage: wage,
    slabApplied: {
      min: 10000.01,
      max: null,
      amount,
      note: isFeb ? "February adjustment ₹300" : "Standard monthly ₹200",
    },
    calculationTrace: `MH (Male/Other): Gross ₹${wage.toFixed(2)} > ₹10,000 (${isFeb ? "February adjustment" : "Standard month"}) -> PT ₹${amount.toFixed(2)}`,
    isFebruaryAdjustmentApplied: isFeb,
    isExempt: false,
  };
}
