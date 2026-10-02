/**
 * OrbitHR — Full & Final (F&F) Settlement & Statutory Exit Engine
 * 
 * Complies with:
 * 1. Payment of Gratuity Act, 1972 (15/26 formula, 5-yr rule, >6 month rounding, ₹20L cap)
 * 2. Section 10(10) of Income Tax Act (Gratuity exemption up to ₹20,00,000)
 * 3. Section 10(10AA) of Income Tax Act (Leave encashment exemption up to ₹25,00,000)
 * 4. Contractual notice period shortfall recovery
 * 5. Final month pro-rata salary and LOP reconciliation
 * 6. Outstanding loan recovery (Section 7(2)(f) Payment of Wages Act)
 * 7. Asset clearance and unreturned equipment recovery
 */

export interface GratuityCalculationInput {
  dateOfJoining: Date | string;
  lastWorkingDay: Date | string;
  lastDrawnBasicSalary: number;
  isDeathOrDisability?: boolean;
}

export interface GratuityCalculationResult {
  dateOfJoining: string;
  lastWorkingDay: string;
  totalServiceDays: number;
  completedYears: number;
  remainingMonths: number;
  remainingDays: number;
  effectiveServiceYears: number;
  isEligible: boolean;
  ineligibilityReason?: string;
  formula: string;
  dailyWageRate: number;
  fifteenDaysRate: number;
  rawGratuity: number;
  statutoryCeiling: number;
  payableGratuity: number;
  taxExemptGratuity: number;
  taxableGratuity: number;
  calculationTrace: string[];
}

export interface LeaveEncashmentInput {
  monthlyBasicSalary: number;
  encashableDays: number;
  daysInMonthDivisor?: number;
}

export interface SettlementLeaveEncashmentResult {
  monthlyBasicSalary: number;
  divisor: number;
  dailyRate: number;
  encashableDays: number;
  grossAmount: number;
  statutoryExemptionLimit: number; // Section 10(10AA) limit: ₹25,00,000
  taxExemptAmount: number;
  taxableAmount: number;
  calculationTrace: string[];
}

export interface NoticePeriodInput {
  monthlyGrossSalary: number;
  contractualNoticeDays: number;
  noticeServedDays: number;
  daysInMonthDivisor?: number;
}

export interface NoticePeriodResult {
  contractualNoticeDays: number;
  noticeServedDays: number;
  shortfallDays: number;
  divisor: number;
  dailyRate: number;
  recoveryAmount: number;
  calculationTrace: string[];
}

export interface FinalMonthSalaryInput {
  monthlyGrossSalary: number;
  monthlyBasicSalary: number;
  monthDays: number;
  payableDays: number;
  unpaidLopDays: number;
}

export interface FinalMonthSalaryResult {
  monthlyGrossSalary: number;
  monthDays: number;
  payableDays: number;
  unpaidLopDays: number;
  dailyRate: number;
  unpaidSalary: number;
  lopDeduction: number;
  calculationTrace: string[];
}

export interface FullSettlementCalculationInput {
  employeeId: string;
  dateOfJoining: Date | string;
  lastWorkingDay: Date | string;
  monthlyBasicSalary: number;
  monthlyGrossSalary: number;
  encashableLeaveDays?: number;
  isDeathOrDisability?: boolean;
  contractualNoticeDays?: number;
  noticeServedDays?: number;
  finalMonthDays?: number;
  finalMonthPayableDays?: number;
  finalMonthLopDays?: number;
  bonus?: number;
  otherEarnings?: Array<{ name: string; amount: number }>;
  loanOutstanding?: number;
  unreturnedAssetDeduction?: number;
  otherDeductions?: Array<{ name: string; amount: number }>;
  customTaxDeduction?: number;
}

export interface FullSettlementBreakdown {
  employeeId: string;
  dateOfJoining: string;
  lastWorkingDay: string;
  gratuity: GratuityCalculationResult;
  leaveEncashment: SettlementLeaveEncashmentResult;
  noticePeriod: NoticePeriodResult;
  finalMonthSalary: FinalMonthSalaryResult;
  additions: {
    unpaidSalary: number;
    leaveEncashment: number;
    gratuity: number;
    bonus: number;
    otherEarnings: number;
    otherEarningsList: Array<{ name: string; amount: number }>;
    totalGrossEarnings: number;
  };
  deductions: {
    noticeShortfallRecovery: number;
    loanRecovery: number;
    assetRecovery: number;
    otherDeductions: number;
    otherDeductionsList: Array<{ name: string; amount: number }>;
    taxDeduction: number;
    totalDeductions: number;
  };
  taxSummary: {
    totalExemptTerminalDues: number;
    totalTaxableTerminalDues: number;
    tdsDeducted: number;
  };
  netSettlement: number;
  calculationTrace: string[];
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calculates statutory gratuity under the Payment of Gratuity Act, 1972.
 * Formula: (15 * Last Drawn Monthly Basic * Effective Service Years) / 26
 * - Service >= 5 years required, unless waived due to death or disablement.
 * - Incomplete year: > 6 months (>= 183 days) rounded up to +1 year.
 * - Statutory Ceiling: ₹20,00,000 (Section 4(3)).
 * - Income Tax Exemption: Section 10(10) exempts up to ₹20,00,000.
 */
export function calculateGratuity(input: GratuityCalculationInput): GratuityCalculationResult {
  const trace: string[] = [];
  const doj = new Date(input.dateOfJoining);
  const lwd = new Date(input.lastWorkingDay);

  if (isNaN(doj.getTime()) || isNaN(lwd.getTime())) {
    throw new Error('Invalid date provided for Gratuity calculation.');
  }
  if (lwd < doj) {
    throw new Error('Last working day cannot be prior to Date of Joining.');
  }

  const diffMs = lwd.getTime() - doj.getTime();
  const totalServiceDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive of both days

  // Compute years, months, remaining days accurately
  let years = lwd.getUTCFullYear() - doj.getUTCFullYear();
  let months = lwd.getUTCMonth() - doj.getUTCMonth();
  let days = lwd.getUTCDate() - doj.getUTCDate();

  if (days < 0) {
    months -= 1;
    // previous month's days
    const prevMonthLastDay = new Date(Date.UTC(lwd.getUTCFullYear(), lwd.getUTCMonth(), 0)).getUTCDate();
    days += prevMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  trace.push(`Service tenure: ${years} years, ${months} months, ${days} days (${totalServiceDays} total days).`);

  // Section 4(2) Rounding Rule: If remaining fraction of year exceeds 6 months, round up to 1 year
  // In days/months terms, if months > 6 or (months === 6 && days > 0), round up
  const hasMoreThanSixMonths = months > 6 || (months === 6 && days > 0);
  const effectiveServiceYears = hasMoreThanSixMonths ? years + 1 : years;

  trace.push(`Effective service years under Gratuity Act (round up if >6m): ${effectiveServiceYears} years.`);

  // Section 4(1) 5-year continuous service rule
  const isEligible = input.isDeathOrDisability === true || effectiveServiceYears >= 5;
  let ineligibilityReason: string | undefined;

  if (!isEligible) {
    ineligibilityReason = 'Employee has not completed 5 years of continuous service as required by Section 4(1) of the Payment of Gratuity Act, 1972.';
    trace.push(ineligibilityReason);
  }

  const statutoryCeiling = 20_00_000; // 20 Lakhs statutory ceiling
  const basic = Math.max(0, input.lastDrawnBasicSalary);

  // 15 days of wages based on 26-day month: (Basic / 26) * 15
  const dailyWageRate = money(basic / 26);
  const fifteenDaysRate = money((basic * 15) / 26);
  trace.push(`Monthly Basic: ₹${basic}, Daily Wage Rate (Basic/26): ₹${dailyWageRate}, 15-day factor: ₹${fifteenDaysRate}.`);

  const formula = '(15 * LastDrawnBasic * EffectiveServiceYears) / 26';
  const rawGratuity = isEligible ? money((15 * basic * effectiveServiceYears) / 26) : 0;
  const payableGratuity = Math.min(rawGratuity, statutoryCeiling);

  trace.push(`Raw Gratuity: ₹${rawGratuity}. Statutory Ceiling: ₹${statutoryCeiling}. Payable: ₹${payableGratuity}.`);

  // Section 10(10) Income Tax exemption
  const taxExemptGratuity = Math.min(payableGratuity, 20_00_000);
  const taxableGratuity = money(Math.max(0, payableGratuity - taxExemptGratuity));

  trace.push(`Section 10(10) Tax Exemption: ₹${taxExemptGratuity}, Taxable Gratuity: ₹${taxableGratuity}.`);

  return {
    dateOfJoining: doj.toISOString().split('T')[0],
    lastWorkingDay: lwd.toISOString().split('T')[0],
    totalServiceDays,
    completedYears: years,
    remainingMonths: months,
    remainingDays: days,
    effectiveServiceYears,
    isEligible,
    ineligibilityReason,
    formula,
    dailyWageRate,
    fifteenDaysRate,
    rawGratuity,
    statutoryCeiling,
    payableGratuity,
    taxExemptGratuity,
    taxableGratuity,
    calculationTrace: trace,
  };
}

/**
 * Calculates leave encashment on retirement/resignation.
 * Standard statutory divisor = 30 days.
 * Exemption ceiling under Section 10(10AA) = ₹25,00,000 (Notification 31/2023).
 */
export function calculateSettlementLeaveEncashment(input: LeaveEncashmentInput): SettlementLeaveEncashmentResult {
  const trace: string[] = [];
  const basic = Math.max(0, input.monthlyBasicSalary);
  const encashableDays = Math.max(0, input.encashableDays);
  const divisor = input.daysInMonthDivisor && input.daysInMonthDivisor > 0 ? input.daysInMonthDivisor : 30;

  const dailyRate = money(basic / divisor);
  const grossAmount = money(dailyRate * encashableDays);
  trace.push(`Leave Encashment: ${encashableDays} days @ ₹${dailyRate}/day (Basic ₹${basic} / ${divisor}) = ₹${grossAmount}.`);

  const statutoryExemptionLimit = 25_00_000; // 25 Lakhs statutory limit
  const taxExemptAmount = Math.min(grossAmount, statutoryExemptionLimit);
  const taxableAmount = money(Math.max(0, grossAmount - taxExemptAmount));
  trace.push(`Section 10(10AA) Exemption: ₹${taxExemptAmount}, Taxable Encashment: ₹${taxableAmount}.`);

  return {
    monthlyBasicSalary: basic,
    divisor,
    dailyRate,
    encashableDays,
    grossAmount,
    statutoryExemptionLimit,
    taxExemptAmount,
    taxableAmount,
    calculationTrace: trace,
  };
}

/**
 * Calculates notice period shortfall recovery.
 * If employee serves less than contractual notice, unserved days are recovered at gross daily rate.
 */
export function calculateNoticePeriodShortfall(input: NoticePeriodInput): NoticePeriodResult {
  const trace: string[] = [];
  const contractual = Math.max(0, input.contractualNoticeDays);
  const served = Math.max(0, input.noticeServedDays);
  const shortfallDays = Math.max(0, contractual - served);
  const divisor = input.daysInMonthDivisor && input.daysInMonthDivisor > 0 ? input.daysInMonthDivisor : 30;

  const dailyRate = money(Math.max(0, input.monthlyGrossSalary) / divisor);
  const recoveryAmount = money(dailyRate * shortfallDays);

  trace.push(`Notice Period: Contractual ${contractual} days, Served ${served} days, Shortfall ${shortfallDays} days.`);
  if (shortfallDays > 0) {
    trace.push(`Notice Recovery: ${shortfallDays} days @ ₹${dailyRate}/day = ₹${recoveryAmount}.`);
  } else {
    trace.push('Notice Period obligation fully served. Zero recovery.');
  }

  return {
    contractualNoticeDays: contractual,
    noticeServedDays: served,
    shortfallDays,
    divisor,
    dailyRate,
    recoveryAmount,
    calculationTrace: trace,
  };
}

/**
 * Calculates pro-rata salary for the exit month and deductions for loss-of-pay (LOP).
 */
export function calculateFinalMonthSalary(input: FinalMonthSalaryInput): FinalMonthSalaryResult {
  const trace: string[] = [];
  const gross = Math.max(0, input.monthlyGrossSalary);
  const monthDays = input.monthDays > 0 ? input.monthDays : 30;
  const payableDays = Math.max(0, Math.min(monthDays, input.payableDays));
  const lopDays = Math.max(0, input.unpaidLopDays);

  const dailyRate = money(gross / monthDays);
  const unpaidSalary = money(dailyRate * payableDays);
  const lopDeduction = money(dailyRate * lopDays);

  trace.push(`Final Month Salary: ${payableDays} payable days of ${monthDays} days @ ₹${dailyRate}/day = ₹${unpaidSalary}.`);
  if (lopDays > 0) {
    trace.push(`Loss of Pay (LOP): ${lopDays} days = ₹${lopDeduction}.`);
  }

  return {
    monthlyGrossSalary: gross,
    monthDays,
    payableDays,
    unpaidLopDays: lopDays,
    dailyRate,
    unpaidSalary,
    lopDeduction,
    calculationTrace: trace,
  };
}

/**
 * Master Full & Final Settlement Calculator.
 * Synthesizes all earnings, deductions, tax exemptions, and produces a complete financial breakdown.
 */
export function calculateFullAndFinalSettlement(input: FullSettlementCalculationInput): FullSettlementBreakdown {
  const masterTrace: string[] = [];
  masterTrace.push(`Initiating Full & Final Settlement calculation for employee: ${input.employeeId}.`);

  // 1. Gratuity
  const gratuity = calculateGratuity({
    dateOfJoining: input.dateOfJoining,
    lastWorkingDay: input.lastWorkingDay,
    lastDrawnBasicSalary: input.monthlyBasicSalary,
    isDeathOrDisability: input.isDeathOrDisability,
  });
  masterTrace.push(...gratuity.calculationTrace);

  // 2. Leave Encashment
  const leaveEncashment = calculateSettlementLeaveEncashment({
    monthlyBasicSalary: input.monthlyBasicSalary,
    encashableDays: input.encashableLeaveDays || 0,
  });
  masterTrace.push(...leaveEncashment.calculationTrace);

  // 3. Notice Period Shortfall
  const noticePeriod = calculateNoticePeriodShortfall({
    monthlyGrossSalary: input.monthlyGrossSalary,
    contractualNoticeDays: input.contractualNoticeDays || 0,
    noticeServedDays: input.noticeServedDays || 0,
  });
  masterTrace.push(...noticePeriod.calculationTrace);

  // 4. Final Month Unpaid Salary
  const finalMonthSalary = calculateFinalMonthSalary({
    monthlyGrossSalary: input.monthlyGrossSalary,
    monthlyBasicSalary: input.monthlyBasicSalary,
    monthDays: input.finalMonthDays || 30,
    payableDays: input.finalMonthPayableDays != null ? input.finalMonthPayableDays : 30,
    unpaidLopDays: input.finalMonthLopDays || 0,
  });
  masterTrace.push(...finalMonthSalary.calculationTrace);

  // 5. Additions
  const bonus = money(Math.max(0, input.bonus || 0));
  const otherEarningsList = (input.otherEarnings || []).map(x => ({ name: x.name, amount: money(Math.max(0, x.amount)) }));
  const otherEarningsTotal = money(otherEarningsList.reduce((acc, curr) => acc + curr.amount, 0));

  const totalGrossEarnings = money(
    finalMonthSalary.unpaidSalary +
    leaveEncashment.grossAmount +
    gratuity.payableGratuity +
    bonus +
    otherEarningsTotal
  );

  masterTrace.push(`Total Gross Earnings: ₹${totalGrossEarnings} (Salary: ₹${finalMonthSalary.unpaidSalary}, Encashment: ₹${leaveEncashment.grossAmount}, Gratuity: ₹${gratuity.payableGratuity}, Bonus: ₹${bonus}, Other: ₹${otherEarningsTotal}).`);

  // 6. Deductions
  const loanRecovery = money(Math.max(0, input.loanOutstanding || 0));
  const assetRecovery = money(Math.max(0, input.unreturnedAssetDeduction || 0));
  const otherDeductionsList = (input.otherDeductions || []).map(x => ({ name: x.name, amount: money(Math.max(0, x.amount)) }));
  const otherDeductionsTotal = money(otherDeductionsList.reduce((acc, curr) => acc + curr.amount, 0));
  const taxDeduction = money(Math.max(0, input.customTaxDeduction || 0));

  const totalDeductions = money(
    noticePeriod.recoveryAmount +
    loanRecovery +
    assetRecovery +
    otherDeductionsTotal +
    taxDeduction
  );

  masterTrace.push(`Total Deductions: ₹${totalDeductions} (Notice: ₹${noticePeriod.recoveryAmount}, Loan: ₹${loanRecovery}, Assets: ₹${assetRecovery}, Tax: ₹${taxDeduction}, Other: ₹${otherDeductionsTotal}).`);

  // 7. Net Settlement
  const netSettlement = money(Math.max(0, totalGrossEarnings - totalDeductions));
  masterTrace.push(`Net Full & Final Settlement Payout: ₹${netSettlement}.`);

  // 8. Tax Exempt Summary
  const totalExemptTerminalDues = money(gratuity.taxExemptGratuity + leaveEncashment.taxExemptAmount);
  const totalTaxableTerminalDues = money(gratuity.taxableGratuity + leaveEncashment.taxableAmount);

  return {
    employeeId: input.employeeId,
    dateOfJoining: gratuity.dateOfJoining,
    lastWorkingDay: gratuity.lastWorkingDay,
    gratuity,
    leaveEncashment,
    noticePeriod,
    finalMonthSalary,
    additions: {
      unpaidSalary: finalMonthSalary.unpaidSalary,
      leaveEncashment: leaveEncashment.grossAmount,
      gratuity: gratuity.payableGratuity,
      bonus,
      otherEarnings: otherEarningsTotal,
      otherEarningsList,
      totalGrossEarnings,
    },
    deductions: {
      noticeShortfallRecovery: noticePeriod.recoveryAmount,
      loanRecovery,
      assetRecovery,
      otherDeductions: otherDeductionsTotal,
      otherDeductionsList,
      taxDeduction,
      totalDeductions,
    },
    taxSummary: {
      totalExemptTerminalDues,
      totalTaxableTerminalDues,
      tdsDeducted: taxDeduction,
    },
    netSettlement,
    calculationTrace: masterTrace,
  };
}
