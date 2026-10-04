import crypto from 'crypto';
import { money, UAN_REGEX } from './types.js';

export interface EpfDiagnosticIssue {
  ruleId: string;
  ruleName: string;
  severity: 'BLOCKING' | 'WARNING';
  employeeCode?: string;
  message: string;
}

export interface EpfDiagnosticResult {
  valid: boolean;
  errors: EpfDiagnosticIssue[];
  warnings: EpfDiagnosticIssue[];
}

export interface EpfSnapshotItemInput {
  employeeId?: string;
  snapshotEmployeeCode: string;
  snapshotEmployeeName: string;
  snapshotUan: string | null;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  eePfShare: number;
  erEpsShare: number;
  erEpfShare: number;
  ncpDays: number;
  workingDays?: number;
  payableDays?: number;
  unpaidDays?: number;
  dateOfBirth?: string | Date | null;
  epsExempt?: boolean;
}

export interface EpfRuleConfiguration {
  adminChargeRate?: number; // default 0.0050 (0.50%)
  minAdminChargeAmount?: number; // default 500.0
  edliContributionRate?: number; // default 0.0050 (0.50%)
  edliAdminChargeRate?: number; // default 0.00 (0.00%)
  wageCeiling?: number; // default 15000.0
  epsRate?: number; // default 0.0833 (8.33%)
  epsMaxMonthlyContribution?: number; // default 1250.0
  employeePfRate?: number; // default 0.12
  employerPfRate?: number; // default 0.12
}

/**
 * Locked Rule 9: Deterministic NCP days calculation.
 * NCP days = Math.min(daysInMonth, Math.max(0, Math.floor(unpaidDays)))
 * If payableDays is 0, full month is non-contributing.
 */
export function calculateNcpDays(unpaidDays: number, daysInMonth: number, payableDays?: number): number {
  if (payableDays !== undefined && payableDays <= 0) {
    return daysInMonth;
  }
  const cleanUnpaid = Number.isFinite(unpaidDays) ? unpaidDays : 0;
  return Math.min(daysInMonth, Math.max(0, Math.floor(cleanUnpaid)));
}

/**
 * Locked Rule 9: Deterministic Age-58 EPS calculation.
 * - epsExempt => EPS 0
 * - age 58 on/before first day of wage month => EPS 0
 * - mid-month attainment => contributory days proration
 * - post-month attainment (<58) => normal calculation
 */
export function calculateAge58EpsSplit(params: {
  epfWages: number;
  eePfShare: number;
  totalEmployerPf: number;
  dateOfBirth?: string | Date | null;
  epsExempt?: boolean;
  periodYear: number;
  periodMonth: number;
  payableDays?: number;
  daysInMonth?: number;
}): {
  epsWages: number;
  erEpsShare: number;
  erEpfShare: number;
} {
  const {
    epfWages,
    eePfShare,
    totalEmployerPf,
    dateOfBirth,
    epsExempt = false,
    periodYear,
    periodMonth,
    payableDays = 30,
    daysInMonth = 30,
  } = params;

  // 1. Explicit Profile Exemption
  if (epsExempt) {
    return {
      epsWages: 0,
      erEpsShare: 0,
      erEpfShare: totalEmployerPf,
    };
  }

  // If no valid DOB provided, default to standard <58 calculation
  if (!dateOfBirth) {
    const cappedWages = Math.min(15000, Math.round(epfWages));
    const epsShare = Math.min(1250, Math.round(cappedWages * 0.0833));
    return {
      epsWages: cappedWages,
      erEpsShare: epsShare,
      erEpfShare: totalEmployerPf - epsShare,
    };
  }

  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(dob.getTime())) {
    const cappedWages = Math.min(15000, Math.round(epfWages));
    const epsShare = Math.min(1250, Math.round(cappedWages * 0.0833));
    return {
      epsWages: cappedWages,
      erEpsShare: epsShare,
      erEpfShare: totalEmployerPf - epsShare,
    };
  }

  // Exact 58th birthday date (UTC normalized)
  const birthYear = dob.getUTCFullYear();
  const birthMonth = dob.getUTCMonth(); // 0-indexed
  const birthDay = dob.getUTCDate();
  const date58th = new Date(Date.UTC(birthYear + 58, birthMonth, birthDay));

  const firstOfWageMonth = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
  const daysInThisMonth = daysInMonth || new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate();
  const lastOfWageMonth = new Date(Date.UTC(periodYear, periodMonth - 1, daysInThisMonth));

  // Case 2: Attained age 58 ON OR BEFORE the 1st day of the wage month
  if (date58th <= firstOfWageMonth) {
    return {
      epsWages: 0,
      erEpsShare: 0,
      erEpfShare: totalEmployerPf,
    };
  }

  // Case 3: Attained age 58 MID-MONTH (after 1st of month, on or before end of month)
  if (date58th > firstOfWageMonth && date58th <= lastOfWageMonth) {
    // Contributory days prior to 58th birthday
    const birthDayOfMonth = date58th.getUTCDate();
    const contributoryDays = Math.max(0, Math.min(payableDays, birthDayOfMonth - 1));
    const proratedEpfWages = Math.min(15000, Math.round((epfWages * contributoryDays) / daysInThisMonth));
    const proratedEpsCap = Math.round((1250 * contributoryDays) / daysInThisMonth);
    const epsShare = Math.min(proratedEpsCap, Math.round(proratedEpfWages * 0.0833));

    return {
      epsWages: proratedEpfWages,
      erEpsShare: epsShare,
      erEpfShare: totalEmployerPf - epsShare,
    };
  }

  // Case 4: Attains age 58 AFTER the wage month (<58 years throughout this month)
  const cappedWages = Math.min(15000, Math.round(epfWages));
  const epsShare = Math.min(1250, Math.round(cappedWages * 0.0833));
  return {
    epsWages: cappedWages,
    erEpsShare: epsShare,
    erEpfShare: totalEmployerPf - epsShare,
  };
}

/**
 * Sanitize Member Name to official EPFO ECR 2.0 requirements:
 * Max 80 characters, A-Z, single spaces, dots allowed.
 */
export function sanitizeMemberName(name: string): string {
  if (!name) return 'UNKNOWN';
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || 'UNKNOWN';
}

/**
 * Pre-upload Statutory Diagnostics Suite (ECR-DIAG-00 through ECR-DIAG-10).
 */
export function runEpfDiagnostics(params: {
  companyPfRegistrationNumber?: string | null;
  periodYear: number;
  periodMonth?: number | null;
  items: EpfSnapshotItemInput[];
}): EpfDiagnosticResult {
  const errors: EpfDiagnosticIssue[] = [];
  const warnings: EpfDiagnosticIssue[] = [];

  const { companyPfRegistrationNumber, periodYear, periodMonth, items } = params;
  const daysInMonth = periodMonth ? new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate() : 30;

  // ECR-DIAG-00: Missing PF Establishment Code
  if (!companyPfRegistrationNumber || !companyPfRegistrationNumber.trim()) {
    errors.push({
      ruleId: 'ECR-DIAG-00',
      ruleName: 'Missing PF Establishment Code',
      severity: 'BLOCKING',
      message: 'Company PF Establishment Code (CompanySettings.pfRegistrationNumber) is missing or blank.',
    });
  }

  if (!items || items.length === 0) {
    errors.push({
      ruleId: 'ECR-DIAG-EMPTY',
      ruleName: 'Empty Snapshot',
      severity: 'BLOCKING',
      message: 'No employee line records found in statutory filing snapshot.',
    });
    return { valid: false, errors, warnings };
  }

  for (const item of items) {
    const code = item.snapshotEmployeeCode;

    // ECR-DIAG-01: Missing UAN
    if (item.eePfShare > 0 && (!item.snapshotUan || !item.snapshotUan.trim())) {
      errors.push({
        ruleId: 'ECR-DIAG-01',
        ruleName: 'Missing UAN',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} has PF contribution of ₹${item.eePfShare} but is missing a UAN.`,
      });
    }

    // ECR-DIAG-02: Invalid UAN
    if (item.snapshotUan) {
      const uan = item.snapshotUan.trim();
      if (!UAN_REGEX.test(uan) || uan.startsWith('0')) {
        errors.push({
          ruleId: 'ECR-DIAG-02',
          ruleName: 'Invalid UAN Format',
          severity: 'BLOCKING',
          employeeCode: code,
          message: `Employee ${code} has invalid UAN "${uan}". UAN must be exactly 12 numeric digits and cannot start with '0'.`,
        });
      }
    }

    // ECR-DIAG-03: Invalid Member Name
    const rawName = item.snapshotEmployeeName || '';
    if (/[^a-zA-Z. ]/.test(rawName)) {
      errors.push({
        ruleId: 'ECR-DIAG-03',
        ruleName: 'Invalid Member Name Characters',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} name "${rawName}" contains special characters not allowed by EPFO ECR specification (only alphabetic, dot, and space permitted).`,
      });
    }

    // ECR-DIAG-04: Gross Wages < EPF Wages
    if (item.grossWages < item.epfWages) {
      errors.push({
        ruleId: 'ECR-DIAG-04',
        ruleName: 'Gross Wages Less than EPF Wages',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} Gross Wages (₹${item.grossWages}) cannot be less than EPF Wages (₹${item.epfWages}).`,
      });
    }

    // ECR-DIAG-05: EPS Wage Cap Violation
    if (item.epsWages > 15000) {
      errors.push({
        ruleId: 'ECR-DIAG-05',
        ruleName: 'EPS Wage Cap Violation',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} EPS Wages (₹${item.epsWages}) exceeds the statutory maximum ceiling of ₹15,000.`,
      });
    }

    // ECR-DIAG-06: EPS Remittance Violation
    if (item.erEpsShare > 1250) {
      errors.push({
        ruleId: 'ECR-DIAG-06',
        ruleName: 'EPS Remittance Cap Violation',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} EPS Share (₹${item.erEpsShare}) exceeds the statutory maximum monthly cap of ₹1,250.`,
      });
    }

    // ECR-DIAG-07: Age-58 EPS Violation
    if (item.dateOfBirth && periodMonth) {
      const dob = typeof item.dateOfBirth === 'string' ? new Date(item.dateOfBirth) : item.dateOfBirth;
      if (!isNaN(dob.getTime())) {
        const firstOfMonth = new Date(Date.UTC(periodYear, periodMonth - 1, 1));
        const date58th = new Date(Date.UTC(dob.getUTCFullYear() + 58, dob.getUTCMonth(), dob.getUTCDate()));
        if (date58th <= firstOfMonth && (item.epsWages > 0 || item.erEpsShare > 0)) {
          errors.push({
            ruleId: 'ECR-DIAG-07',
            ruleName: 'Age-58 EPS Invariant Violation',
            severity: 'BLOCKING',
            employeeCode: code,
            message: `Employee ${code} attained age 58 before the wage month. Both EPS Wages and EPS Share must be 0.`,
          });
        }
      }
    }

    // ECR-DIAG-08: Invalid NCP Days
    if (item.ncpDays < 0 || item.ncpDays > daysInMonth || item.ncpDays % 1 !== 0) {
      errors.push({
        ruleId: 'ECR-DIAG-08',
        ruleName: 'Invalid NCP Days',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} NCP Days (${item.ncpDays}) must be a whole integer between 0 and ${daysInMonth}.`,
      });
    }

    // ECR-DIAG-09: EE vs Employer Mathematical Reconciliation Failure
    const expectedTotalEr = item.erEpsShare + item.erEpfShare;
    if (Math.abs(item.eePfShare - expectedTotalEr) > 0.01) {
      errors.push({
        ruleId: 'ECR-DIAG-09',
        ruleName: 'EE / Employer Contribution Mismatch',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} EE Share (₹${item.eePfShare}) does not equal Employer Share sum (A/c 10 ₹${item.erEpsShare} + A/c 1 ₹${item.erEpfShare} = ₹${expectedTotalEr}).`,
      });
    }

    // ECR-DIAG-10: Fractional Statutory Remittance
    if (item.eePfShare % 1 !== 0 || item.erEpsShare % 1 !== 0 || item.erEpfShare % 1 !== 0) {
      errors.push({
        ruleId: 'ECR-DIAG-10',
        ruleName: 'Fractional Remittance Invariant Violation',
        severity: 'BLOCKING',
        employeeCode: code,
        message: `Employee ${code} statutory remittances contain fractional paise. All EPFO ECR remittance amounts must be rounded to nearest whole rupee.`,
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
 * 11-Column EPFO ECR 2.0 Flat Text Generator.
 * Delimiter: #~#
 * No Header. No Trailer. Deterministic sequence.
 */
export function generateEcrFlatText(params: {
  items: Array<{
    snapshotUan: string | null;
    snapshotEmployeeName: string;
    grossWages: number;
    epfWages: number;
    epsWages: number;
    edliWages: number;
    eePfShare: number;
    erEpsShare: number;
    erEpfShare: number;
    ncpDays: number;
    refundOfAdvances?: number;
  }>;
}): {
  text: string;
  checksum: string;
  recordCount: number;
} {
  const lines: string[] = [];

  for (const item of params.items) {
    const uan = (item.snapshotUan || '').trim();
    const name = sanitizeMemberName(item.snapshotEmployeeName);
    const gross = Math.round(item.grossWages);
    const epfWages = Math.round(item.epfWages);
    const epsWages = Math.round(item.epsWages);
    const edliWages = Math.round(item.edliWages);
    const eeShare = Math.round(item.eePfShare);
    const epsShare = Math.round(item.erEpsShare);
    const erShare = Math.round(item.erEpfShare);
    const ncp = Math.round(item.ncpDays);
    const refund = Math.round(item.refundOfAdvances || 0);

    const record = [
      uan,
      name,
      gross,
      epfWages,
      epsWages,
      edliWages,
      eeShare,
      epsShare,
      erShare,
      ncp,
      refund,
    ].join('#~#');

    lines.push(record);
  }

  // Windows standard CRLF newline
  const text = lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
  const checksum = crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

  return {
    text,
    checksum,
    recordCount: lines.length,
  };
}

/**
 * Calculate Monthly EPF Challan (SBI 5-Account Breakdown).
 */
export function calculateEpfChallanTotals(
  items: Array<{
    epfWages: number;
    edliWages: number;
    eePfShare: number;
    erEpfShare: number;
    erEpsShare: number;
  }>,
  config?: EpfRuleConfiguration,
): {
  account1Amount: number;
  account2Amount: number;
  account10Amount: number;
  account21Amount: number;
  account22Amount: number;
  totalAmount: number;
  totalEpfWages: number;
  totalEdliWages: number;
} {
  const adminChargeRate = config?.adminChargeRate ?? 0.0050; // 0.50%
  const minAdminCharge = config?.minAdminChargeAmount ?? 500.0; // ₹500 min
  const edliContributionRate = config?.edliContributionRate ?? 0.0050; // 0.50%
  const edliAdminChargeRate = config?.edliAdminChargeRate ?? 0.00; // 0.00% (waived)

  let sumEePf = 0;
  let sumErEpf = 0;
  let sumErEps = 0;
  let sumEpfWages = 0;
  let sumEdliWages = 0;

  for (const it of items) {
    sumEePf += Math.round(it.eePfShare);
    sumErEpf += Math.round(it.erEpfShare);
    sumErEps += Math.round(it.erEpsShare);
    sumEpfWages += Math.round(it.epfWages);
    sumEdliWages += Math.round(it.edliWages);
  }

  const account1Amount = money(sumEePf + sumErEpf);
  const calculatedAdmin = Math.round(sumEpfWages * adminChargeRate);
  const account2Amount = money(sumEpfWages > 0 ? Math.max(minAdminCharge, calculatedAdmin) : 0);
  const account10Amount = money(sumErEps);
  const account21Amount = money(Math.round(sumEdliWages * edliContributionRate));
  const account22Amount = money(Math.round(sumEdliWages * edliAdminChargeRate));

  const totalAmount = money(
    account1Amount +
    account2Amount +
    account10Amount +
    account21Amount +
    account22Amount
  );

  return {
    account1Amount,
    account2Amount,
    account10Amount,
    account21Amount,
    account22Amount,
    totalAmount,
    totalEpfWages: sumEpfWages,
    totalEdliWages: sumEdliWages,
  };
}
