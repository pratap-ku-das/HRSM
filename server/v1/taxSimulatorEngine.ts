/**
 * OrbitHR Versioned Indian Income Tax & Salary Simulator Engine (P2.3)
 * Pure functional statutory calculation engine for Old vs New Tax Regimes.
 * Covers Finance Act 2023, 2024, and 2025 specifications.
 */

export interface TaxSlab {
  min: number;
  max: number | null; // null represents infinity / above min
  rate: number; // e.g. 0.05 for 5%
}

export interface StatutoryTaxRuleSet {
  financialYear: string;
  assessmentYear: string;
  newRegime: {
    standardDeduction: number;
    slabs: TaxSlab[];
    rebate87AThreshold: number; // Taxable income threshold for 87A rebate
    rebate87AMaxAmount: number;
    employerNpsAllowed: boolean;
    employerNpsMaxPercentBasic: number; // e.g. 10 or 14%
  };
  oldRegime: {
    standardDeduction: number;
    slabs: TaxSlab[];
    rebate87AThreshold: number;
    rebate87AMaxAmount: number;
    sec80CLimit: number;
    sec80DLimitSelf: number;
    sec80DLimitParents: number;
    sec80CCD1BLimit: number; // NPS self contribution
    sec24bHomeLoanInterestLimit: number;
  };
  cessRate: number; // 0.04 (4% Health and Education Cess)
}

/**
 * Versioned Tax Rule Sets by Financial Year and corresponding Assessment Year.
 * Can be expanded for future budgets without altering historical calculations.
 */
export const VERSIONED_TAX_RULES: Record<string, StatutoryTaxRuleSet> = {
  // FY 2023-24 (Assessment Year 2024-25) - Finance Act 2023 Baseline
  '2023-24': {
    financialYear: '2023-24',
    assessmentYear: '2024-25',
    newRegime: {
      standardDeduction: 50000,
      slabs: [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 600000, rate: 0.05 },
        { min: 600000, max: 900000, rate: 0.1 },
        { min: 900000, max: 1200000, rate: 0.15 },
        { min: 1200000, max: 1500000, rate: 0.2 },
        { min: 1500000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 700000,
      rebate87AMaxAmount: 25000,
      employerNpsAllowed: true,
      employerNpsMaxPercentBasic: 0.1,
    },
    oldRegime: {
      standardDeduction: 50000,
      slabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 500000,
      rebate87AMaxAmount: 12500,
      sec80CLimit: 150000,
      sec80DLimitSelf: 25000,
      sec80DLimitParents: 50000,
      sec80CCD1BLimit: 50000,
      sec24bHomeLoanInterestLimit: 200000,
    },
    cessRate: 0.04,
  },

  // FY 2024-25 (Assessment Year 2025-26) - Finance (No. 2) Act 2024
  '2024-25': {
    financialYear: '2024-25',
    assessmentYear: '2025-26',
    newRegime: {
      standardDeduction: 75000,
      slabs: [
        { min: 0, max: 300000, rate: 0 },
        { min: 300000, max: 700000, rate: 0.05 },
        { min: 700000, max: 1000000, rate: 0.1 },
        { min: 1000000, max: 1200000, rate: 0.15 },
        { min: 1200000, max: 1500000, rate: 0.2 },
        { min: 1500000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 700000,
      rebate87AMaxAmount: 25000,
      employerNpsAllowed: true,
      employerNpsMaxPercentBasic: 0.14,
    },
    oldRegime: {
      standardDeduction: 50000,
      slabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 500000,
      rebate87AMaxAmount: 12500,
      sec80CLimit: 150000,
      sec80DLimitSelf: 25000,
      sec80DLimitParents: 50000,
      sec80CCD1BLimit: 50000,
      sec24bHomeLoanInterestLimit: 200000,
    },
    cessRate: 0.04,
  },

  // FY 2025-26 (Assessment Year 2026-27) - Union Budget 2025 / Finance Act 2025
  // Slabs: 0-4L Nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%
  // Section 87A rebate increased to ₹60,000 for taxable income up to ₹12,00,000
  '2025-26': {
    financialYear: '2025-26',
    assessmentYear: '2026-27',
    newRegime: {
      standardDeduction: 75000,
      slabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.1 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.2 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 1200000,
      rebate87AMaxAmount: 60000,
      employerNpsAllowed: true,
      employerNpsMaxPercentBasic: 0.14,
    },
    oldRegime: {
      standardDeduction: 50000,
      slabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 500000,
      rebate87AMaxAmount: 12500,
      sec80CLimit: 150000,
      sec80DLimitSelf: 25000,
      sec80DLimitParents: 50000,
      sec80CCD1BLimit: 50000,
      sec24bHomeLoanInterestLimit: 200000,
    },
    cessRate: 0.04,
  },

  // FY 2026-27 (Assessment Year 2027-28) - Budget 2025 Baseline Continued
  '2026-27': {
    financialYear: '2026-27',
    assessmentYear: '2027-28',
    newRegime: {
      standardDeduction: 75000,
      slabs: [
        { min: 0, max: 400000, rate: 0 },
        { min: 400000, max: 800000, rate: 0.05 },
        { min: 800000, max: 1200000, rate: 0.1 },
        { min: 1200000, max: 1600000, rate: 0.15 },
        { min: 1600000, max: 2000000, rate: 0.2 },
        { min: 2000000, max: 2400000, rate: 0.25 },
        { min: 2400000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 1200000,
      rebate87AMaxAmount: 60000,
      employerNpsAllowed: true,
      employerNpsMaxPercentBasic: 0.14,
    },
    oldRegime: {
      standardDeduction: 50000,
      slabs: [
        { min: 0, max: 250000, rate: 0 },
        { min: 250000, max: 500000, rate: 0.05 },
        { min: 500000, max: 1000000, rate: 0.2 },
        { min: 1000000, max: null, rate: 0.3 },
      ],
      rebate87AThreshold: 500000,
      rebate87AMaxAmount: 12500,
      sec80CLimit: 150000,
      sec80DLimitSelf: 25000,
      sec80DLimitParents: 50000,
      sec80CCD1BLimit: 50000,
      sec24bHomeLoanInterestLimit: 200000,
    },
    cessRate: 0.04,
  },
};

export interface HraExemptionParams {
  basicSalary: number; // Annual basic salary
  hraReceived: number; // Annual HRA received
  rentPaid: number; // Annual rent paid
  isMetro: boolean; // Metro (50%) vs Non-Metro (40%)
}

/**
 * Calculates Section 10(13A) HRA Exemption (Least of 3 conditions).
 */
export function calculateHraExemption(params: HraExemptionParams): {
  exemptHra: number;
  taxableHra: number;
  breakdown: {
    actualHra: number;
    excessRentOverTenPercent: number;
    salaryPercentageLimit: number;
  };
} {
  const { basicSalary, hraReceived, rentPaid, isMetro } = params;

  if (rentPaid <= 0 || hraReceived <= 0 || basicSalary <= 0) {
    return {
      exemptHra: 0,
      taxableHra: Math.max(0, hraReceived),
      breakdown: {
        actualHra: hraReceived,
        excessRentOverTenPercent: 0,
        salaryPercentageLimit: 0,
      },
    };
  }

  const excessRent = Math.max(0, rentPaid - 0.1 * basicSalary);
  const salaryPercent = (isMetro ? 0.5 : 0.4) * basicSalary;

  const exempt = Math.round(Math.min(hraReceived, excessRent, salaryPercent));
  const taxable = Math.round(Math.max(0, hraReceived - exempt));

  return {
    exemptHra: exempt,
    taxableHra: taxable,
    breakdown: {
      actualHra: Math.round(hraReceived),
      excessRentOverTenPercent: Math.round(excessRent),
      salaryPercentageLimit: Math.round(salaryPercent),
    },
  };
}

export interface TaxSlabComputation {
  slab: string;
  ratePercent: number;
  taxableInSlab: number;
  taxAmount: number;
}

export interface RegimeTaxBreakdown {
  regime: 'NEW' | 'OLD';
  grossSalary: number;
  standardDeduction: number;
  totalExemptionsAndDeductions: number;
  deductionsBreakdown: Record<string, number>;
  netTaxableIncome: number;
  slabWiseTax: TaxSlabComputation[];
  taxBeforeRebate: number;
  section87ARebate: number;
  taxAfterRebate: number;
  surcharge: number;
  surchargeMarginalRelief: number;
  cess: number;
  totalAnnualTax: number;
  monthlyEstimatedTds: number;
  monthlyNetTakeHome: number;
}

export interface SalaryBreakdownInput {
  annualCtc?: number;
  basicSalary: number;
  hra: number;
  specialAllowance?: number;
  otherAllowances?: number;
  bonusVariable?: number;
  employerPf?: number;
  employerNps?: number;
  employeePf?: number;
  professionalTax?: number;
}

export interface DeductionDeclarationInput {
  rentPaidAnnual?: number;
  isMetro?: boolean;
  section80C?: number; // PPF, EPF, ELSS, LIC, Home Loan Principal (capped at 1.5L)
  section80DSelf?: number; // Health insurance self/family (capped at 25k)
  section80DParents?: number; // Health insurance parents (capped at 50k)
  section80CCD1B?: number; // Voluntary NPS (capped at 50k)
  section24bHomeLoanInterest?: number; // Self-occupied home loan interest (capped at 2L)
  otherExemptions?: number;
}

export interface TaxSimulationInput {
  financialYear: string;
  salary: SalaryBreakdownInput;
  declarations?: DeductionDeclarationInput;
}

export interface TaxSimulationComparisonResult {
  financialYear: string;
  assessmentYear: string;
  grossSalary: number;
  oldRegime: RegimeTaxBreakdown;
  newRegime: RegimeTaxBreakdown;
  comparison: {
    recommendedRegime: 'NEW' | 'OLD' | 'EQUAL';
    annualTaxDifference: number; // positive = amount saved in recommended regime
    monthlyTakeHomeDifference: number;
    recommendationSummary: string;
  };
}

/**
 * Computes progressive tax across slabs.
 */
function computeSlabTax(taxableIncome: number, slabs: TaxSlab[]): {
  slabBreakdown: TaxSlabComputation[];
  totalTax: number;
} {
  let totalTax = 0;
  const slabBreakdown: TaxSlabComputation[] = [];

  for (const s of slabs) {
    if (taxableIncome <= s.min) {
      continue;
    }

    const slabUpper = s.max != null ? Math.min(taxableIncome, s.max) : taxableIncome;
    const taxableInThisSlab = Math.max(0, slabUpper - s.min);
    const taxInThisSlab = Math.round(taxableInThisSlab * s.rate);

    totalTax += taxInThisSlab;

    const slabLabel =
      s.max != null
        ? `₹${(s.min / 100000).toFixed(1)}L - ₹${(s.max / 100000).toFixed(1)}L`
        : `Above ₹${(s.min / 100000).toFixed(1)}L`;

    slabBreakdown.push({
      slab: slabLabel,
      ratePercent: Math.round(s.rate * 100),
      taxableInSlab: Math.round(taxableInThisSlab),
      taxAmount: taxInThisSlab,
    });
  }

  return { slabBreakdown, totalTax };
}

/**
 * Surcharge computation with marginal relief across statutory thresholds (50L, 1Cr, 2Cr, 5Cr).
 */
export interface SurchargeComputation {
  surchargeRate: number;
  grossSurcharge: number;
  marginalRelief: number;
  netSurcharge: number;
}

export function computeSurcharge(
  taxableIncome: number,
  taxAfterRebate: number,
  regime: 'NEW' | 'OLD',
  slabs: TaxSlab[],
): SurchargeComputation {
  if (taxableIncome <= 5000000 || taxAfterRebate <= 0) {
    return { surchargeRate: 0, grossSurcharge: 0, marginalRelief: 0, netSurcharge: 0 };
  }

  let rate = 0;
  let threshold = 5000000;

  if (taxableIncome > 5000000 && taxableIncome <= 10000000) {
    rate = 0.10;
    threshold = 5000000;
  } else if (taxableIncome > 10000000 && taxableIncome <= 20000000) {
    rate = 0.15;
    threshold = 10000000;
  } else if (taxableIncome > 20000000 && taxableIncome <= 50000000) {
    rate = 0.25;
    threshold = 20000000;
  } else {
    // Under Finance Act 2023 onwards, maximum surcharge under New Regime is capped at 25%
    rate = regime === 'NEW' ? 0.25 : 0.37;
    threshold = 50000000;
  }

  const grossSurcharge = Math.round(taxAfterRebate * rate);

  // Marginal relief on surcharge:
  // Tax + Surcharge cannot exceed: (Tax at threshold + Surcharge at threshold) + (Income - threshold)
  const { totalTax: taxAtThreshold } = computeSlabTax(threshold, slabs);
  let surchargeAtThreshold = 0;
  if (threshold === 10000000) {
    surchargeAtThreshold = Math.round(taxAtThreshold * 0.10);
  } else if (threshold === 20000000) {
    surchargeAtThreshold = Math.round(taxAtThreshold * 0.15);
  } else if (threshold === 50000000) {
    surchargeAtThreshold = Math.round(taxAtThreshold * 0.25);
  }

  const maxAllowableTotal = taxAtThreshold + surchargeAtThreshold + (taxableIncome - threshold);
  const currentTotal = taxAfterRebate + grossSurcharge;

  let marginalRelief = 0;
  if (currentTotal > maxAllowableTotal) {
    marginalRelief = Math.round(currentTotal - maxAllowableTotal);
  }

  const netSurcharge = Math.max(0, grossSurcharge - marginalRelief);

  return {
    surchargeRate: rate,
    grossSurcharge,
    marginalRelief,
    netSurcharge,
  };
}

/**
 * Calculates Tax under New Regime (Section 115BAC).
 */
export function calculateNewRegimeTax(
  salary: SalaryBreakdownInput,
  declarations: DeductionDeclarationInput = {},
  fy = '2025-26',
): RegimeTaxBreakdown {
  const ruleSet = VERSIONED_TAX_RULES[fy] || VERSIONED_TAX_RULES['2025-26'];
  const rules = ruleSet.newRegime;

  const grossEarnings =
    salary.basicSalary +
    salary.hra +
    (salary.specialAllowance || 0) +
    (salary.otherAllowances || 0) +
    (salary.bonusVariable || 0);

  // Standard deduction
  const standardDeduction = rules.standardDeduction;

  // Under New Regime, Section 80CCD(2) employer NPS is allowed up to cap
  const maxEmployerNps = salary.basicSalary * rules.employerNpsMaxPercentBasic;
  const eligibleEmployerNps = Math.min(salary.employerNps || 0, maxEmployerNps);

  const deductionsBreakdown: Record<string, number> = {
    'Standard Deduction (Sec 16ia)': standardDeduction,
  };

  if (eligibleEmployerNps > 0) {
    deductionsBreakdown['Employer NPS (Sec 80CCD2)'] = Math.round(eligibleEmployerNps);
  }

  const totalDeductions = standardDeduction + eligibleEmployerNps;
  const netTaxableIncome = Math.max(0, Math.round(grossEarnings - totalDeductions));

  // Slab tax computation
  const { slabBreakdown, totalTax: taxBeforeRebate } = computeSlabTax(netTaxableIncome, rules.slabs);

  // Section 87A rebate & Marginal Relief under Section 115BAC proviso
  let section87ARebate = 0;
  if (netTaxableIncome <= rules.rebate87AThreshold) {
    section87ARebate = Math.min(taxBeforeRebate, rules.rebate87AMaxAmount);
  } else if (netTaxableIncome > rules.rebate87AThreshold) {
    // Proviso to Section 87A: Tax payable before cess cannot exceed income in excess of threshold
    const excessIncome = netTaxableIncome - rules.rebate87AThreshold;
    if (taxBeforeRebate > excessIncome) {
      section87ARebate = Math.max(0, taxBeforeRebate - excessIncome);
    }
  }

  const taxAfterRebate = Math.max(0, taxBeforeRebate - section87ARebate);

  // Surcharge computation with marginal relief
  const surchargeResult = computeSurcharge(netTaxableIncome, taxAfterRebate, 'NEW', rules.slabs);
  const surcharge = surchargeResult.netSurcharge;
  const surchargeMarginalRelief = surchargeResult.marginalRelief;

  const taxAndSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxAndSurcharge * ruleSet.cessRate);

  // Section 288B: Round off total annual tax to the nearest multiple of ₹10
  const totalAnnualTax = Math.round((taxAndSurcharge + cess) / 10) * 10;
  const monthlyEstimatedTds = Math.round(totalAnnualTax / 12);

  // Take-home calculation
  const employeePf = salary.employeePf || 0;
  const professionalTax = salary.professionalTax || 0;
  const monthlyGross = grossEarnings / 12;
  const monthlyNetTakeHome = Math.max(
    0,
    Math.round(monthlyGross - monthlyEstimatedTds - employeePf / 12 - professionalTax / 12),
  );

  return {
    regime: 'NEW',
    grossSalary: Math.round(grossEarnings),
    standardDeduction,
    totalExemptionsAndDeductions: Math.round(totalDeductions),
    deductionsBreakdown,
    netTaxableIncome,
    slabWiseTax: slabBreakdown,
    taxBeforeRebate,
    section87ARebate,
    taxAfterRebate,
    surcharge,
    surchargeMarginalRelief,
    cess,
    totalAnnualTax,
    monthlyEstimatedTds,
    monthlyNetTakeHome,
  };
}

/**
 * Calculates Tax under Old Regime.
 */
export function calculateOldRegimeTax(
  salary: SalaryBreakdownInput,
  declarations: DeductionDeclarationInput = {},
  fy = '2025-26',
): RegimeTaxBreakdown {
  const ruleSet = VERSIONED_TAX_RULES[fy] || VERSIONED_TAX_RULES['2025-26'];
  const rules = ruleSet.oldRegime;

  const grossEarnings =
    salary.basicSalary +
    salary.hra +
    (salary.specialAllowance || 0) +
    (salary.otherAllowances || 0) +
    (salary.bonusVariable || 0);

  const deductionsBreakdown: Record<string, number> = {};

  // 1. Standard deduction (Sec 16ia)
  const standardDeduction = rules.standardDeduction;
  deductionsBreakdown['Standard Deduction (Sec 16ia)'] = standardDeduction;

  // 2. Professional Tax (Sec 16iii)
  const ptAnnual = salary.professionalTax || 0;
  if (ptAnnual > 0) {
    deductionsBreakdown['Professional Tax (Sec 16iii)'] = Math.round(ptAnnual);
  }

  // 3. HRA Exemption (Sec 10(13A))
  let hraExempt = 0;
  if (declarations.rentPaidAnnual && declarations.rentPaidAnnual > 0) {
    const hraResult = calculateHraExemption({
      basicSalary: salary.basicSalary,
      hraReceived: salary.hra,
      rentPaid: declarations.rentPaidAnnual,
      isMetro: Boolean(declarations.isMetro),
    });
    hraExempt = hraResult.exemptHra;
    if (hraExempt > 0) {
      deductionsBreakdown['HRA Exemption (Sec 10(13A))'] = hraExempt;
    }
  }

  // 4. Section 80C (Auto-add employee PF contribution up to cap)
  const raw80C = (declarations.section80C || 0) + (salary.employeePf || 0);
  const eligible80C = Math.min(raw80C, rules.sec80CLimit);
  if (eligible80C > 0) {
    deductionsBreakdown['Section 80C (Investments & PF)'] = Math.round(eligible80C);
  }

  // 5. Section 80D (Health Insurance)
  const eligible80DSelf = Math.min(declarations.section80DSelf || 0, rules.sec80DLimitSelf);
  const eligible80DParents = Math.min(declarations.section80DParents || 0, rules.sec80DLimitParents);
  const total80D = eligible80DSelf + eligible80DParents;
  if (total80D > 0) {
    deductionsBreakdown['Section 80D (Medical Insurance)'] = Math.round(total80D);
  }

  // 6. Section 80CCD(1B) (Voluntary NPS)
  const eligibleNps = Math.min(declarations.section80CCD1B || 0, rules.sec80CCD1BLimit);
  if (eligibleNps > 0) {
    deductionsBreakdown['Section 80CCD(1B) (Voluntary NPS)'] = Math.round(eligibleNps);
  }

  // 7. Section 24(b) (Home loan interest)
  const eligibleHomeLoan = Math.min(
    declarations.section24bHomeLoanInterest || 0,
    rules.sec24bHomeLoanInterestLimit,
  );
  if (eligibleHomeLoan > 0) {
    deductionsBreakdown['Section 24(b) (Home Loan Interest)'] = Math.round(eligibleHomeLoan);
  }

  // 8. Section 80CCD(2) (Employer NPS up to 10% of Basic)
  const maxEmployerNps = salary.basicSalary * 0.10;
  const eligibleEmployerNps = Math.min(salary.employerNps || 0, maxEmployerNps);
  if (eligibleEmployerNps > 0) {
    deductionsBreakdown['Employer NPS (Sec 80CCD2)'] = Math.round(eligibleEmployerNps);
  }

  // 9. Other verified exemptions
  if (declarations.otherExemptions && declarations.otherExemptions > 0) {
    deductionsBreakdown['Other Exemptions'] = Math.round(declarations.otherExemptions);
  }

  const totalDeductions = Object.values(deductionsBreakdown).reduce((s, val) => s + val, 0);
  const netTaxableIncome = Math.max(0, Math.round(grossEarnings - totalDeductions));

  // Slab tax computation
  const { slabBreakdown, totalTax: taxBeforeRebate } = computeSlabTax(netTaxableIncome, rules.slabs);

  // Section 87A rebate
  let section87ARebate = 0;
  if (netTaxableIncome <= rules.rebate87AThreshold) {
    section87ARebate = Math.min(taxBeforeRebate, rules.rebate87AMaxAmount);
  }

  const taxAfterRebate = Math.max(0, taxBeforeRebate - section87ARebate);

  // Surcharge computation with marginal relief
  const surchargeResult = computeSurcharge(netTaxableIncome, taxAfterRebate, 'OLD', rules.slabs);
  const surcharge = surchargeResult.netSurcharge;
  const surchargeMarginalRelief = surchargeResult.marginalRelief;

  const taxAndSurcharge = taxAfterRebate + surcharge;
  const cess = Math.round(taxAndSurcharge * ruleSet.cessRate);

  // Section 288B: Round off total annual tax to the nearest multiple of ₹10
  const totalAnnualTax = Math.round((taxAndSurcharge + cess) / 10) * 10;
  const monthlyEstimatedTds = Math.round(totalAnnualTax / 12);

  // Take-home calculation
  const employeePf = salary.employeePf || 0;
  const professionalTax = salary.professionalTax || 0;
  const monthlyGross = grossEarnings / 12;
  const monthlyNetTakeHome = Math.max(
    0,
    Math.round(monthlyGross - monthlyEstimatedTds - employeePf / 12 - professionalTax / 12),
  );

  return {
    regime: 'OLD',
    grossSalary: Math.round(grossEarnings),
    standardDeduction,
    totalExemptionsAndDeductions: Math.round(totalDeductions),
    deductionsBreakdown,
    netTaxableIncome,
    slabWiseTax: slabBreakdown,
    taxBeforeRebate,
    section87ARebate,
    taxAfterRebate,
    surcharge,
    surchargeMarginalRelief,
    cess,
    totalAnnualTax,
    monthlyEstimatedTds,
    monthlyNetTakeHome,
  };
}

/**
 * Main Simulator function: Computes and compares both regimes side-by-side.
 */
export function simulateTaxComparison(input: TaxSimulationInput): TaxSimulationComparisonResult {
  const fy = input.financialYear || '2025-26';
  const newRegime = calculateNewRegimeTax(input.salary, input.declarations, fy);
  const oldRegime = calculateOldRegimeTax(input.salary, input.declarations, fy);

  const diff = oldRegime.totalAnnualTax - newRegime.totalAnnualTax;
  let recommendedRegime: 'NEW' | 'OLD' | 'EQUAL' = 'EQUAL';
  let summary = '';

  if (diff > 0) {
    recommendedRegime = 'NEW';
    const monthlySave = Math.round(diff / 12);
    summary = `New Tax Regime saves ₹${diff.toLocaleString('en-IN')} annually (approx. ₹${monthlySave.toLocaleString('en-IN')}/month higher take-home).`;
  } else if (diff < 0) {
    recommendedRegime = 'OLD';
    const annualSave = Math.abs(diff);
    const monthlySave = Math.round(annualSave / 12);
    summary = `Old Tax Regime saves ₹${annualSave.toLocaleString('en-IN')} annually due to itemized deductions (approx. ₹${monthlySave.toLocaleString('en-IN')}/month higher take-home).`;
  } else {
    recommendedRegime = 'EQUAL';
    summary = 'Both regimes result in the identical tax liability for this income bracket.';
  }

  const monthlyTakeHomeDiff = Math.abs(newRegime.monthlyNetTakeHome - oldRegime.monthlyNetTakeHome);

  const ruleSet = VERSIONED_TAX_RULES[fy] || VERSIONED_TAX_RULES['2025-26'];
  return {
    financialYear: fy,
    assessmentYear: ruleSet.assessmentYear,
    grossSalary: newRegime.grossSalary,
    oldRegime,
    newRegime,
    comparison: {
      recommendedRegime,
      annualTaxDifference: Math.abs(diff),
      monthlyTakeHomeDifference: monthlyTakeHomeDiff,
      recommendationSummary: summary,
    },
  };
}
