import crypto from "crypto";
import { money } from "./types.js";

export interface SnapshotEmployeeInfo {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  taxIdentifier?: string | null;
  activeProfile?: {
    uan?: string | null;
    panNumber?: string | null;
    esicIpNumber?: string | null;
    epsExempt?: boolean;
    pfOptOut?: boolean;
    ptState?: string | null;
  } | null;
}

export interface SnapshotPayrollLineInfo {
  employeeId: string;
  workingDays: number;
  payableDays: number;
  unpaidDays: number;
  grossEarnings: number;
  employeeDeductions: number;
  employerContributions: number;
  reimbursements: number;
  netPay: number;
  breakdown: Record<string, unknown>;
}

export interface ExtractedSnapshotItem {
  employeeId: string;
  snapshotEmployeeCode: string;
  snapshotEmployeeName: string;
  snapshotUan: string | null;
  snapshotPan: string | null;
  snapshotEsicIp: string | null;
  workingDays: number;
  payableDays: number;
  ncpDays: number;
  grossWages: number;
  epfWages: number;
  epsWages: number;
  edliWages: number;
  eePfShare: number;
  erEpsShare: number;
  erEpfShare: number;
  eeEsiShare: number;
  erEsiShare: number;
  ptAmount: number;
  tdsAmount: number;
  calculationDetails: Record<string, unknown>;
}

export interface ExtractedSnapshotTotals {
  totalEmployees: number;
  totalGrossWages: number;
  totalEpfWages: number;
  totalEeShare: number;
  totalErShare: number;
  totalTaxDeducted: number;
}

/**
 * Pure extraction engine: Extracts authoritative statutory figures already calculated
 * by P2.3 and stored in PayrollLine without introducing new statutory calculation formulas.
 */
export function extractStatutorySnapshot(
  runStatus: string,
  lines: SnapshotPayrollLineInfo[],
  employeeMap: Map<string, SnapshotEmployeeInfo>,
): {
  items: ExtractedSnapshotItem[];
  totals: ExtractedSnapshotTotals;
} {
  const allowedStatuses = [
    "LOCKED",
    "PAYSLIP_GENERATED",
    "PAYSLIPS_PUBLISHED",
    "BANK_EXPORTED",
    "PROCESSED",
    "PAID",
  ];

  if (!allowedStatuses.includes(runStatus)) {
    throw new Error("PAYROLL_NOT_LOCKED");
  }

  const items: ExtractedSnapshotItem[] = [];

  for (const line of lines) {
    const employee = employeeMap.get(line.employeeId);
    if (!employee) continue;

    const b = line.breakdown || {};
    const getNum = (key: string): number => {
      const v = (b as Record<string, unknown>)[key];
      return typeof v === "number" && Number.isFinite(v) ? money(v) : 0;
    };

    // Authoritative frozen P2.3 payroll output
    const basic = getNum("BASIC");
    const pfEmployee = getNum("PF_EMPLOYEE");
    const pfEmployer = getNum("PF_EMPLOYER");
    const esiEmployee = getNum("ESI_EMPLOYEE");
    const esiEmployer = getNum("ESI_EMPLOYER");
    const ptAmount = getNum("PROFESSIONAL_TAX");
    const tdsAmount = getNum("TDS");

    // Copy point-in-time identifiers from active profile or employee fallback
    const profile = employee.activeProfile;
    const uan = profile?.uan || null;
    const pan = profile?.panNumber || employee.taxIdentifier || null;
    const esicIp = profile?.esicIpNumber || null;

    items.push({
      employeeId: employee.id,
      snapshotEmployeeCode: employee.employeeCode,
      snapshotEmployeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      snapshotUan: uan,
      snapshotPan: pan ? pan.toUpperCase() : null,
      snapshotEsicIp: esicIp,
      workingDays: line.workingDays,
      payableDays: line.payableDays,
      ncpDays: line.unpaidDays,
      grossWages: money(line.grossEarnings),
      epfWages: basic,
      epsWages: basic,
      edliWages: basic,
      eePfShare: pfEmployee,
      erEpsShare: 0, // Split deferred to P2.7-B
      erEpfShare: pfEmployer,
      eeEsiShare: esiEmployee,
      erEsiShare: esiEmployer,
      ptAmount,
      tdsAmount,
      calculationDetails: {
        breakdownSnapshot: b,
        unpaidDays: line.unpaidDays,
      },
    });
  }

  // Calculate totals
  const totals: ExtractedSnapshotTotals = items.reduce(
    (acc, it) => ({
      totalEmployees: acc.totalEmployees + 1,
      totalGrossWages: money(acc.totalGrossWages + it.grossWages),
      totalEpfWages: money(acc.totalEpfWages + it.epfWages),
      totalEeShare: money(acc.totalEeShare + it.eePfShare + it.eeEsiShare),
      totalErShare: money(acc.totalErShare + it.erEpfShare + it.erEsiShare),
      totalTaxDeducted: money(acc.totalTaxDeducted + it.tdsAmount + it.ptAmount),
    }),
    {
      totalEmployees: 0,
      totalGrossWages: 0,
      totalEpfWages: 0,
      totalEeShare: 0,
      totalErShare: 0,
      totalTaxDeducted: 0,
    },
  );

  return { items, totals };
}

/**
 * Deterministic canonical serialization and SHA-256 integrity checksum generator.
 */
export function generateCanonicalChecksum(
  filing: {
    id: string;
    domain: string;
    periodYear: number;
    periodMonth?: number | null;
    quarter?: string | null;
    stateCode?: string | null;
    payrollRunId: string;
    totalEmployees: number;
    totalGrossWages: number;
    totalTaxDeducted: number;
  },
  items: ExtractedSnapshotItem[],
): string {
  // 1. Sort items deterministically by employeeId ascending
  const sortedItems = [...items].sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  // 2. Build canonical object with normalized strings and numbers
  const canonicalPayload = {
    filingId: filing.id,
    domain: filing.domain,
    periodYear: filing.periodYear,
    periodMonth: filing.periodMonth || null,
    quarter: filing.quarter || null,
    stateCode: filing.stateCode || null,
    payrollRunId: filing.payrollRunId,
    totals: {
      employees: filing.totalEmployees,
      grossWages: money(filing.totalGrossWages).toFixed(2),
      deductions: money(filing.totalTaxDeducted).toFixed(2),
    },
    items: sortedItems.map((item) => ({
      employeeId: item.employeeId,
      employeeCode: item.snapshotEmployeeCode,
      uan: item.snapshotUan || "",
      pan: item.snapshotPan || "",
      esicIp: item.snapshotEsicIp || "",
      grossWages: money(item.grossWages).toFixed(2),
      workingDays: item.workingDays.toFixed(1),
      payableDays: item.payableDays.toFixed(1),
      ncpDays: item.ncpDays.toFixed(1),
      eePfShare: money(item.eePfShare).toFixed(2),
      erPfShare: money(item.erEpfShare).toFixed(2),
      eeEsiShare: money(item.eeEsiShare).toFixed(2),
      erEsiShare: money(item.erEsiShare).toFixed(2),
      ptAmount: money(item.ptAmount).toFixed(2),
      tdsAmount: money(item.tdsAmount).toFixed(2),
    })),
  };

  const canonicalString = JSON.stringify(canonicalPayload);
  return crypto.createHash("sha256").update(Buffer.from(canonicalString, "utf8")).digest("hex");
}

/**
 * Pre-validation engine: Validates snapshot items against statutory requirements.
 */
export function validateSnapshotItems(
  domain: string,
  items: ExtractedSnapshotItem[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (items.length === 0) {
    errors.push("No employee lines found in snapshot.");
    return { valid: false, errors };
  }

  for (const item of items) {
    if (domain === "EPF_ECR") {
      if (item.eePfShare > 0 && !item.snapshotUan) {
        errors.push(`Employee ${item.snapshotEmployeeCode} has PF deduction of ₹${item.eePfShare} but missing UAN.`);
      }
    }
    if (domain === "ESIC_MONTHLY") {
      if (item.eeEsiShare > 0 && !item.snapshotEsicIp) {
        errors.push(`Employee ${item.snapshotEmployeeCode} has ESI deduction of ₹${item.eeEsiShare} but missing ESIC IP number.`);
      }
    }
    if (domain === "TDS_24Q") {
      if (item.tdsAmount > 0 && !item.snapshotPan) {
        errors.push(`Employee ${item.snapshotEmployeeCode} has TDS deduction of ₹${item.tdsAmount} but missing PAN.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
