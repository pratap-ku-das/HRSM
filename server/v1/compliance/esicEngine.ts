import crypto from 'crypto';
import { money, ESIC_IP_REGEX } from './types.js';

export type EsicWageClassification = 'INCLUDED' | 'EXCLUDED' | 'CONDITIONAL' | 'MANUAL_REVIEW';

export interface EsicDiagnosticIssue {
  ruleId: string;
  ruleName: string;
  severity: 'BLOCKING' | 'WARNING';
  employeeCode?: string;
  message: string;
}

export interface EsicDiagnosticResult {
  valid: boolean;
  errors: EsicDiagnosticIssue[];
  warnings: EsicDiagnosticIssue[];
}

export interface EsicSnapshotItemInput {
  employeeId?: string;
  snapshotEmployeeCode: string;
  snapshotEmployeeName: string;
  snapshotEsicIp: string | null;
  grossWages: number;
  payableDays: number;
  workingDays?: number;
  eeEsiShare: number;
  erEsiShare: number;
  snapshotLastWorkingDay?: Date | string | null;
  status?: string;
  exitReason?: string;
  calculationDetails?: Record<string, unknown> | null;
}

export interface EsicRuleConfiguration {
  employeeEsiRate?: number; // default 0.0075 (0.75%)
  employerEsiRate?: number; // default 0.0325 (3.25%)
  wageCeiling?: number;     // default 21000.0
  pwdWageCeiling?: number;  // default 25000.0
  dailyWageExemptionLimit?: number; // default 176.0
}

/**
 * 16-Row Deterministic ESIC Wage Classification Matrix under Section 2(22).
 */
export const ESIC_STANDARD_WAGE_CLASSIFICATION: Record<string, { classification: EsicWageClassification; reason: string }> = {
  BASIC: { classification: 'INCLUDED', reason: 'Basic wages payable under contract of employment (Sec 2(22))' },
  DA: { classification: 'INCLUDED', reason: 'Dearness allowance forms part of wages (Sec 2(22))' },
  HRA: { classification: 'EXCLUDED', reason: 'House Rent Allowance excluded from ESI wages per statutory exclusion' },
  SPECIAL_ALLOWANCE: { classification: 'INCLUDED', reason: 'Regular monthly allowance paid for work performed' },
  CONVEYANCE: { classification: 'EXCLUDED', reason: 'Traveling allowance / conveyance excluded under Section 2(22)(a)' },
  OVERTIME: { classification: 'INCLUDED', reason: 'Remuneration paid for overtime work included under Section 2(22)' },
  BONUS: { classification: 'EXCLUDED', reason: 'Statutory/annual bonus paid at intervals exceeding two months' },
  INCENTIVE: { classification: 'INCLUDED', reason: 'Regular monthly production/performance incentive' },
  COMMISSION: { classification: 'INCLUDED', reason: 'Monthly contractual sales commission' },
  ARREARS: { classification: 'INCLUDED', reason: 'Arrears of wages paid in respect of employment period' },
  EX_GRATIA: { classification: 'EXCLUDED', reason: 'Voluntary ex-gratia payment without contractual obligation' },
  REIMBURSEMENT: { classification: 'EXCLUDED', reason: 'Reimbursement of expenses incurred against actual vouchers' },
  MEDICAL_REIMBURSEMENT: { classification: 'EXCLUDED', reason: 'Actual medical expense reimbursement' },
  LEAVE_ENCASHMENT: { classification: 'EXCLUDED', reason: 'Leave encashment on termination / separation is excluded' },
  GRATUITY: { classification: 'EXCLUDED', reason: 'Gratuity payable on discharge excluded under Section 2(22)' },
  NOTICE_PAY: { classification: 'EXCLUDED', reason: 'Notice period compensation is excluded from contribution wages' },
};

/**
 * Classifies a salary component for ESIC wage calculation.
 * Unknown custom components return MANUAL_REVIEW to prevent silent omission.
 */
export function classifyEsicWageComponent(
  code: string,
  customMappings?: Record<string, EsicWageClassification>
): { classification: EsicWageClassification; reason: string } {
  const normalized = code.trim().toUpperCase();

  if (customMappings && customMappings[normalized]) {
    return {
      classification: customMappings[normalized],
      reason: `Custom company mapping defined as ${customMappings[normalized]}`,
    };
  }

  if (ESIC_STANDARD_WAGE_CLASSIFICATION[normalized]) {
    return ESIC_STANDARD_WAGE_CLASSIFICATION[normalized];
  }

  return {
    classification: 'MANUAL_REVIEW',
    reason: `Unmapped custom salary component "${code}" requires manual statutory review before export.`,
  };
}

/**
 * Calculate Average Daily Wage for Rule 52 exemption.
 * If payableDays <= 0, returns 'NOT_APPLICABLE' to prevent zero-division or accidental exemption.
 */
export function calculateAverageDailyWage(
  grossWages: number,
  payableDays: number
): number | 'NOT_APPLICABLE' {
  if (!payableDays || payableDays <= 0) {
    return 'NOT_APPLICABLE';
  }
  return money(grossWages / payableDays);
}

/**
 * Check if employee is exempt from employee-share contribution under Rule 52 (daily wage <= 176).
 */
export function isRule52Exempt(
  averageDailyWage: number | 'NOT_APPLICABLE',
  limit: number = 176.0
): boolean {
  if (averageDailyWage === 'NOT_APPLICABLE') {
    return false;
  }
  return averageDailyWage <= limit;
}

/**
 * Format a Date to Indian standard DD/MM/YYYY for ESIC bulk portal.
 */
export function formatEsicDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Event-First Hierarchical Reason Code and Last Working Day determination.
 * Evaluates verified exit events first (Death -> Retired -> Left Service)
 * even if employee earned wages in the wage month.
 */
export function determineReasonCodeAndLwd(params: {
  grossWages: number;
  payableDays: number;
  snapshotLastWorkingDay?: Date | string | null;
  status?: string;
  exitReason?: string;
  periodYear: number;
  periodMonth: number;
}): { reasonCode: number | null; lastWorkingDay: string; ambiguous: boolean; reasonDesc: string } {
  const { grossWages, payableDays, snapshotLastWorkingDay, status, exitReason, periodYear, periodMonth } = params;

  let lwdDate: Date | null = null;
  if (snapshotLastWorkingDay) {
    const parsed = typeof snapshotLastWorkingDay === 'string' ? new Date(snapshotLastWorkingDay) : snapshotLastWorkingDay;
    if (!isNaN(parsed.getTime())) {
      lwdDate = parsed;
    }
  }

  const normStatus = (status || '').toUpperCase();
  const normReason = (exitReason || '').toUpperCase();

  // 1. Deceased / Expired Event
  if (normReason.includes('DEATH') || normReason.includes('DECEASED') || normStatus === 'DECEASED') {
    return {
      reasonCode: 5,
      lastWorkingDay: formatEsicDate(lwdDate),
      ambiguous: !lwdDate,
      reasonDesc: 'Deceased / Expired (Code 5)',
    };
  }

  // 2. Retired Event
  if (normReason.includes('RETIRE') || normStatus === 'RETIRED') {
    return {
      reasonCode: 3,
      lastWorkingDay: formatEsicDate(lwdDate),
      ambiguous: !lwdDate,
      reasonDesc: 'Retired (Code 3)',
    };
  }

  // 3. Left Service / Resigned / Terminated
  const hasSeparationDateInPeriod = lwdDate && (
    (lwdDate.getUTCFullYear() === periodYear && (lwdDate.getUTCMonth() + 1) === periodMonth) ||
    normStatus === 'TERMINATED' || normStatus === 'RESIGNED' || normStatus === 'INACTIVE'
  );

  if (hasSeparationDateInPeriod || normStatus === 'TERMINATED' || normStatus === 'RESIGNED') {
    if (lwdDate) {
      return {
        reasonCode: 2,
        lastWorkingDay: formatEsicDate(lwdDate),
        ambiguous: false,
        reasonDesc: 'Left Service / Resigned (Code 2)',
      };
    }
    // Separation status present but missing LWD snapshot
    return {
      reasonCode: null,
      lastWorkingDay: '',
      ambiguous: true,
      reasonDesc: 'Employee separated but missing authoritative Last Working Day snapshot.',
    };
  }

  // 4. Normal Active Employee with wages and payable days
  if (grossWages > 0 && payableDays > 0) {
    return {
      reasonCode: 0,
      lastWorkingDay: '',
      ambiguous: false,
      reasonDesc: 'No Statutory Reason Event / Normal Contribution (Code 0)',
    };
  }

  // 5. Zero Wages & Zero Days (Unpaid Leave / Sickness / Absent)
  if (grossWages === 0 && payableDays === 0) {
    return {
      reasonCode: 1,
      lastWorkingDay: '',
      ambiguous: false,
      reasonDesc: 'On Leave without Pay / Absent / Sickness (Code 1)',
    };
  }

  // 6. Conflicting state (e.g. Wages > 0 with 0 days, or 0 wages with days > 0)
  return {
    reasonCode: null,
    lastWorkingDay: '',
    ambiguous: true,
    reasonDesc: `Ambiguous state: Wages=₹${grossWages}, PayableDays=${payableDays} without exit event.`,
  };
}

/**
 * Sanitizes IP Name for ESIC Bulk Upload.
 * Allowed: Uppercase, alphabets, dots, spaces. Max 50 characters.
 */
export function sanitizeIpName(rawName: string): string {
  if (!rawName) return '';
  return rawName
    .toUpperCase()
    .replace(/[^A-Z. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Pre-Upload Statutory Diagnostics Suite (ESI-DIAG-00 through ESI-DIAG-08).
 */
export function runEsicDiagnostics(params: {
  filing: {
    domain: string;
    periodYear: number;
    periodMonth?: number | null;
  };
  companySettings?: {
    esiRegistrationNumber?: string | null;
  } | null;
  items: EsicSnapshotItemInput[];
}): EsicDiagnosticResult {
  const errors: EsicDiagnosticIssue[] = [];
  const warnings: EsicDiagnosticIssue[] = [];

  const periodYear = params.filing.periodYear;
  const periodMonth = params.filing.periodMonth || 1;

  // ESI-DIAG-00: Missing ESI Registration Number
  const esiReg = (params.companySettings?.esiRegistrationNumber || '').trim();
  if (!esiReg || esiReg === 'UNCONFIGURED') {
    errors.push({
      ruleId: 'ESI-DIAG-00',
      ruleName: 'Missing ESI Registration Number',
      severity: 'BLOCKING',
      message: 'Company profile is missing the authoritative 17-digit ESI Registration Number.',
    });
  }

  for (const item of params.items) {
    const code = item.snapshotEmployeeCode;
    const ip = (item.snapshotEsicIp || '').trim();

    // ESI-DIAG-01: Missing ESIC IP Number for covered employee
    if ((item.eeEsiShare > 0 || item.erEsiShare > 0 || item.grossWages > 0) && !ip) {
      errors.push({
        ruleId: 'ESI-DIAG-01',
        ruleName: 'Missing ESIC IP Number',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} is covered under ESI but missing the mandatory 10-digit ESIC IP number.`,
      });
    }

    // ESI-DIAG-02: Invalid ESIC IP Number
    if (ip && !ESIC_IP_REGEX.test(ip)) {
      errors.push({
        ruleId: 'ESI-DIAG-02',
        ruleName: 'Invalid ESIC IP Number Format',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} ESIC IP "${ip}" is invalid. Must be exactly 10 numeric digits.`,
      });
    }

    // ESI-DIAG-03: Invalid IP Name
    const rawName = item.snapshotEmployeeName || '';
    if (/[^a-zA-Z. ]/.test(rawName)) {
      errors.push({
        ruleId: 'ESI-DIAG-03',
        ruleName: 'Invalid Employee Name Characters',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} name "${rawName}" contains special characters not allowed by ESIC portal (only alphabets, dot, and space permitted).`,
      });
    }

    // ESI-DIAG-04: Invalid Payable Days
    if (item.payableDays < 0 || item.payableDays > 31 || item.payableDays % 1 !== 0) {
      errors.push({
        ruleId: 'ESI-DIAG-04',
        ruleName: 'Invalid Payable Days',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} payable days (${item.payableDays}) must be a whole integer between 0 and 31.`,
      });
    }

    // ESI-DIAG-05: Potential PwD or Special Ceiling Requires Manual Review
    // Standard ceiling is 21,000. 21,001 to 25,000 requires manual review.
    if (item.grossWages > 21000 && item.grossWages <= 25000) {
      warnings.push({
        ruleId: 'ESI-DIAG-05',
        ruleName: 'Potential PwD / Special Ceiling Manual Review',
        severity: 'WARNING',
        employeeCode: code,
        message: `Employee ${code} wages (₹${item.grossWages}) fall between ₹21,001 and ₹25,000. Authoritative PwD certificate required if claiming disability coverage extension.`,
      });
    }

    // ESI-DIAG-06: Custom Unmapped Salary Component Check
    const breakdown = (item.calculationDetails?.breakdownSnapshot as Record<string, unknown>) || {};
    for (const compCode of Object.keys(breakdown)) {
      if (['PF_EMPLOYEE', 'PF_EMPLOYER', 'ESI_EMPLOYEE', 'ESI_EMPLOYER', 'PROFESSIONAL_TAX', 'TDS', 'LWF_EMPLOYEE', 'LWF_EMPLOYER', 'LOAN_REPAYMENT'].includes(compCode)) {
        continue;
      }
      const wageClass = classifyEsicWageComponent(compCode);
      if (wageClass.classification === 'MANUAL_REVIEW') {
        errors.push({
          ruleId: 'ESI-DIAG-06',
          ruleName: 'Unmapped Custom Component',
          severity: 'BLOCKING',
          employeeCode: code,
          message: `Employee ${code} includes custom salary component "${compCode}" which is not mapped in the ESIC wage matrix. Manual review required.`,
        });
      }
    }

    // ESI-DIAG-07: Daily Average Wage Rule 52 Invariant
    const adw = calculateAverageDailyWage(item.grossWages, item.payableDays);
    if (adw !== 'NOT_APPLICABLE') {
      if (adw <= 176.0 && item.eeEsiShare > 0) {
        errors.push({
          ruleId: 'ESI-DIAG-07',
          ruleName: 'Rule 52 Exemption Violation',
          severity: 'BLOCKING',
          employeeCode: code,
          message: `Employee ${code} average daily wage is ₹${adw} (<= ₹176), but employee share of ₹${item.eeEsiShare} was deducted. Employee share must be ₹0 under Rule 52.`,
        });
      }
      if (adw > 176.0 && item.eeEsiShare === 0 && item.grossWages <= 21000 && item.payableDays > 0) {
        warnings.push({
          ruleId: 'ESI-DIAG-07',
          ruleName: 'Zero EE Deduction Above Exemption Limit',
          severity: 'WARNING',
          employeeCode: code,
          message: `Employee ${code} average daily wage is ₹${adw} (> ₹176) with ₹0 EE share deducted. Verify contribution period continuation or employer-absorption status.`,
        });
      }
    }

    // ESI-DIAG-08: Ambiguous Reason Code or Missing LWD
    const reasonResult = determineReasonCodeAndLwd({
      grossWages: item.grossWages,
      payableDays: item.payableDays,
      snapshotLastWorkingDay: item.snapshotLastWorkingDay,
      status: item.status,
      exitReason: item.exitReason,
      periodYear,
      periodMonth,
    });

    if (reasonResult.reasonCode === null || reasonResult.ambiguous) {
      errors.push({
        ruleId: 'ESI-DIAG-08',
        ruleName: 'Ambiguous Reason Code / Missing LWD',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code}: ${reasonResult.reasonDesc}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 6-Column ESIC Monthly Bulk Return File Generator.
 * Format: IP Number, IP Name, No. of Days, Total Wages, Reason Code, Last Working Day
 * Delimiter: Comma (CSV)
 * Deterministic CRLF line endings.
 */
export function generateEsicBulkUpload(params: {
  periodYear: number;
  periodMonth: number;
  items: Array<{
    snapshotEsicIp: string | null;
    snapshotEmployeeName: string;
    grossWages: number;
    payableDays: number;
    snapshotLastWorkingDay?: Date | string | null;
    status?: string;
    exitReason?: string;
  }>;
}): {
  csv: string;
  checksum: string;
  recordCount: number;
} {
  const lines: string[] = [];

  for (const item of params.items) {
    const ip = (item.snapshotEsicIp || '').trim();
    const name = sanitizeIpName(item.snapshotEmployeeName);
    const payableDays = Math.max(0, Math.round(item.payableDays));
    const monthlyWages = Math.round(item.grossWages);

    const reasonEval = determineReasonCodeAndLwd({
      grossWages: item.grossWages,
      payableDays: item.payableDays,
      snapshotLastWorkingDay: item.snapshotLastWorkingDay,
      status: item.status,
      exitReason: item.exitReason,
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
    });

    const reasonCode = reasonEval.reasonCode ?? 0;
    const lwd = reasonEval.lastWorkingDay;

    const row = [
      ip,
      name,
      payableDays,
      monthlyWages,
      reasonCode,
      lwd,
    ].join(',');

    lines.push(row);
  }

  // Windows standard CRLF newline
  const csv = lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
  const checksum = crypto.createHash('sha256').update(Buffer.from(csv, 'utf8')).digest('hex');

  return {
    csv,
    checksum,
    recordCount: lines.length,
  };
}

/**
 * Calculate Monthly ESIC Challan Totals.
 * Standard rates: 0.75% EE, 3.25% ER. Total = EE + ER.
 */
export function calculateEsicChallanTotals(
  items: Array<{
    grossWages: number;
    eeEsiShare: number;
    erEsiShare: number;
  }>
): {
  totalEmployees: number;
  totalWages: number;
  employeeShare: number;
  employerShare: number;
  totalAmount: number;
} {
  let sumWages = 0;
  let sumEe = 0;
  let sumEr = 0;

  for (const it of items) {
    sumWages += Math.round(it.grossWages);
    sumEe += Math.round(it.eeEsiShare);
    sumEr += Math.round(it.erEsiShare);
  }

  const totalAmount = money(sumEe + sumEr);

  return {
    totalEmployees: items.length,
    totalWages: money(sumWages),
    employeeShare: money(sumEe),
    employerShare: money(sumEr),
    totalAmount,
  };
}
