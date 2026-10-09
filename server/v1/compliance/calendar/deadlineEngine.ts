import type { StatutoryDeadlineDefinition } from "./types.js";

/**
 * Calculates last day of a given month in a year in UTC Date representation (YYYY-MM-DD).
 */
export function getLastDayOfMonth(year: number, month: number): number {
  // month is 1-indexed (1 to 12)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Creates a UTC Date representing YYYY-MM-DD at 00:00:00Z.
 */
export function createUtcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Derives succeeding month and year for a given calendar month (1 to 12).
 */
export function getSucceedingMonthYear(year: number, month: number): { nextYear: number; nextMonth: number } {
  if (month === 12) {
    return { nextYear: year + 1, nextMonth: 1 };
  }
  return { nextYear: year, nextMonth: month + 1 };
}

/**
 * Core Statutory Deadline Registry
 * Codifies legal due dates for EPF, ESIC, TDS, and Multi-State Professional Tax.
 */
export const STATUTORY_DEADLINE_DEFINITIONS: StatutoryDeadlineDefinition[] = [
  // ---------------------------------------------------------------------------
  // 1. EPF / ECR (Employees' Provident Fund)
  // ---------------------------------------------------------------------------
  {
    domain: "EPF_ECR",
    obligationType: "MONTHLY_ECR_AND_CONTRIBUTION",
    jurisdiction: "IN",
    title: "EPF ECR Filing & Monthly Contribution",
    description: "Monthly Electronic Challan cum Return (ECR) generation and provident fund contribution deposit.",
    frequency: "MONTHLY",
    legalBasis: "Employees' Provident Funds Scheme, 1952, Paragraph 38(1); EPFO Circular WDU/7(1)2006/ECR",
    officialSourceUrl: "https://www.epfindia.gov.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) {
        throw new Error("EPF calculation requires valid month (1-12)");
      }
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 15);
    },
  },

  // ---------------------------------------------------------------------------
  // 2. ESIC (Employees' State Insurance Corporation)
  // ---------------------------------------------------------------------------
  {
    domain: "ESIC_MONTHLY",
    obligationType: "MONTHLY_CONTRIBUTION_AND_RETURN",
    jurisdiction: "IN",
    title: "ESIC Monthly Contribution & Return",
    description: "Monthly ESI contribution payment and employee monthly contribution filing via ESIC Portal.",
    frequency: "MONTHLY",
    legalBasis: "Employees' State Insurance (General) Regulations, 1950, Regulation 31 (amended May 2017)",
    officialSourceUrl: "https://www.esic.gov.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) {
        throw new Error("ESIC calculation requires valid month (1-12)");
      }
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 15);
    },
  },

  // ---------------------------------------------------------------------------
  // 3. TDS (Tax Deducted at Source - Income Tax Act, 1961)
  // ---------------------------------------------------------------------------
  {
    domain: "TDS_24Q",
    obligationType: "MONTHLY_TDS_DEPOSIT",
    jurisdiction: "IN",
    title: "Monthly Salary TDS Deposit (Challan ITNS 281)",
    description: "Deposit of tax deducted at source under Section 192 from employee salaries into Central Government account.",
    frequency: "MONTHLY",
    legalBasis: "Income-tax Rules, 1962, Rule 30(2) read with Section 200(1) of Income Tax Act, 1961",
    officialSourceUrl: "https://incometaxindia.gov.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) {
        throw new Error("Monthly TDS deposit requires valid month (1-12)");
      }
      // March deduction (Month 3) is due on April 30 under Rule 30(2)(a)(ii)
      if (month === 3) {
        return createUtcDate(year, 4, 30);
      }
      // Months 1, 2, and 4 through 12 are due on the 7th of the succeeding month
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 7);
    },
  },
  {
    domain: "TDS_24Q",
    obligationType: "QUARTERLY_STATEMENT_24Q",
    jurisdiction: "IN",
    title: "Quarterly TDS Statement (Form 24Q / Form 138)",
    description: "Quarterly statutory statement of tax deducted from salaries submitted via TIN-NSDL / e-Filing portal.",
    frequency: "QUARTERLY",
    legalBasis: "Income-tax Rules, 1962, Rule 31A(2) read with Section 200(3) of Income Tax Act, 1961",
    officialSourceUrl: "https://incometaxindia.gov.in",
    calculateDueDate: ({ year, quarter }) => {
      if (!quarter) {
        throw new Error("Quarterly TDS statement requires quarter (Q1, Q2, Q3, Q4)");
      }
      switch (quarter.toUpperCase()) {
        case "Q1": // April to June -> Due July 31
          return createUtcDate(year, 7, 31);
        case "Q2": // July to September -> Due October 31
          return createUtcDate(year, 10, 31);
        case "Q3": // October to December -> Due January 31 of following calendar year
          return createUtcDate(year + 1, 1, 31);
        case "Q4": // January to March -> Due May 31 of same calendar year
          return createUtcDate(year, 5, 31);
        default:
          throw new Error(`Invalid quarter: ${quarter}`);
      }
    },
  },

  // ---------------------------------------------------------------------------
  // 4. Professional Tax — Supported States
  // ---------------------------------------------------------------------------
  {
    domain: "PROFESSIONAL_TAX",
    obligationType: "MONTHLY_PT_RETURN_AND_PAYMENT",
    jurisdiction: "KA",
    title: "Karnataka Professional Tax Return (Form 5A)",
    description: "Monthly PT statement in Form 5A and e-Payment via Karnataka Commercial Taxes portal.",
    frequency: "MONTHLY",
    legalBasis: "Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976, Section 6A",
    officialSourceUrl: "https://ctax.kar.nic.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) throw new Error("KA PT requires valid month");
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 20);
    },
  },
  {
    domain: "PROFESSIONAL_TAX",
    obligationType: "MONTHLY_PT_RETURN_AND_PAYMENT",
    jurisdiction: "MH",
    title: "Maharashtra Professional Tax Return (Form III-B)",
    description: "Monthly PT return in Form III-B and tax payment via Mahagst / GRAS portal.",
    frequency: "MONTHLY",
    legalBasis: "Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975, Rule 11 & Rule 12",
    officialSourceUrl: "https://www.mahagst.gov.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) throw new Error("MH PT requires valid month");
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      const lastDay = getLastDayOfMonth(nextYear, nextMonth);
      return createUtcDate(nextYear, nextMonth, lastDay);
    },
  },
  {
    domain: "PROFESSIONAL_TAX",
    obligationType: "MONTHLY_PT_RETURN_AND_PAYMENT",
    jurisdiction: "TS",
    title: "Telangana Professional Tax Return (Form V)",
    description: "Monthly PT return in Form V and treasury payment via Telangana Commercial Taxes portal.",
    frequency: "MONTHLY",
    legalBasis: "Telangana Tax on Professions, Trades, Callings and Employments Act, 1987, Section 7 read with Rule 12",
    officialSourceUrl: "https://tgct.gov.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) throw new Error("TS PT requires valid month");
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 10);
    },
  },
  {
    domain: "PROFESSIONAL_TAX",
    obligationType: "MONTHLY_PT_RETURN_AND_PAYMENT",
    jurisdiction: "WB",
    title: "West Bengal Professional Tax Return & Deposit",
    description: "Monthly PT return and tax deposit via GRIPS (Government Receipt Portal System).",
    frequency: "MONTHLY",
    legalBasis: "West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979, Section 6 read with Rule 12",
    officialSourceUrl: "https://wbcomtax.nic.in",
    calculateDueDate: ({ year, month }) => {
      if (!month || month < 1 || month > 12) throw new Error("WB PT requires valid month");
      const { nextYear, nextMonth } = getSucceedingMonthYear(year, month);
      return createUtcDate(nextYear, nextMonth, 21);
    },
  },
];

/**
 * Finds statutory deadline definition for a specific domain, jurisdiction, and obligation type.
 */
export function getDeadlineDefinition(
  domain: string,
  obligationType: string,
  jurisdiction = "IN",
): StatutoryDeadlineDefinition | undefined {
  return STATUTORY_DEADLINE_DEFINITIONS.find(
    (d) =>
      d.domain === domain &&
      d.obligationType === obligationType &&
      (d.jurisdiction === jurisdiction || (jurisdiction !== "IN" && d.jurisdiction === "IN")),
  );
}

/**
 * Calculates statutory legal due date for a given definition and period.
 */
export function calculateLegalDueDate(
  def: StatutoryDeadlineDefinition,
  year: number,
  month?: number,
  quarter?: string,
): Date {
  return def.calculateDueDate({ year, month, quarter });
}

/**
 * Returns effective legal due date considering official extensions.
 */
export function resolveEffectiveDueDate(
  statutoryDueDate: Date,
  extendedDueDate?: Date | null,
): Date {
  return extendedDueDate || statutoryDueDate;
}

/**
 * Formats period key deterministically: e.g. "2026-09", "2026-Q2", "2026-09 (Q2)".
 */
export function formatPeriodKey(year: number, month?: number, quarter?: string): string {
  if (month && quarter) {
    return `${year}-${String(month).padStart(2, "0")} (${quarter.toUpperCase()})`;
  }
  if (month) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  if (quarter) {
    return `${year}-${quarter.toUpperCase()}`;
  }
  return String(year);
}

/**
 * Resolves all applicable statutory obligations for a given wage month.
 */
export function resolveAllApplicableObligationsForMonth(
  year: number,
  month: number,
  ptJurisdictions: string[] = ["KA", "MH", "TS", "WB"],
): Array<{
  definition: StatutoryDeadlineDefinition;
  jurisdiction: string;
  statutoryDueDate: Date;
  periodKey: string;
}> {
  const result: Array<{
    definition: StatutoryDeadlineDefinition;
    jurisdiction: string;
    statutoryDueDate: Date;
    periodKey: string;
  }> = [];

  // 1. EPF
  const epfDef = getDeadlineDefinition("EPF_ECR", "MONTHLY_ECR_AND_CONTRIBUTION", "IN");
  if (epfDef) {
    result.push({
      definition: epfDef,
      jurisdiction: "IN",
      statutoryDueDate: epfDef.calculateDueDate({ year, month }),
      periodKey: formatPeriodKey(year, month),
    });
  }

  // 2. ESIC
  const esicDef = getDeadlineDefinition("ESIC_MONTHLY", "MONTHLY_CONTRIBUTION_AND_RETURN", "IN");
  if (esicDef) {
    result.push({
      definition: esicDef,
      jurisdiction: "IN",
      statutoryDueDate: esicDef.calculateDueDate({ year, month }),
      periodKey: formatPeriodKey(year, month),
    });
  }

  // 3. TDS Monthly
  const tdsMonthlyDef = getDeadlineDefinition("TDS_24Q", "MONTHLY_TDS_DEPOSIT", "IN");
  if (tdsMonthlyDef) {
    result.push({
      definition: tdsMonthlyDef,
      jurisdiction: "IN",
      statutoryDueDate: tdsMonthlyDef.calculateDueDate({ year, month }),
      periodKey: formatPeriodKey(year, month),
    });
  }

  // 4. TDS Quarterly (if month corresponds to quarter-end: 6=Q1, 9=Q2, 12=Q3, 3=Q4)
  const quarterMap: Record<number, string> = { 6: "Q1", 9: "Q2", 12: "Q3", 3: "Q4" };
  const quarter = quarterMap[month];
  if (quarter) {
    const tdsQDef = getDeadlineDefinition("TDS_24Q", "QUARTERLY_STATEMENT_24Q", "IN");
    if (tdsQDef) {
      result.push({
        definition: tdsQDef,
        jurisdiction: "IN",
        statutoryDueDate: tdsQDef.calculateDueDate({ year, quarter }),
        periodKey: formatPeriodKey(year, month, quarter),
      });
    }
  }

  // 5. Professional Tax for supported states
  const ptJurisdictionMap: Record<string, string> = {
    KARNATAKA: "KA",
    MAHARASHTRA: "MH",
    TELANGANA: "TS",
    WEST_BENGAL: "WB",
    KA: "KA",
    MH: "MH",
    TS: "TS",
    WB: "WB",
  };

  const normalizedJurisdictions = ptJurisdictions
    .map((j) => ptJurisdictionMap[j.toUpperCase()])
    .filter(Boolean);

  for (const jCode of normalizedJurisdictions) {
    const ptDef = getDeadlineDefinition("PROFESSIONAL_TAX", "MONTHLY_PT_RETURN_AND_PAYMENT", jCode);
    if (ptDef) {
      result.push({
        definition: ptDef,
        jurisdiction: jCode,
        statutoryDueDate: ptDef.calculateDueDate({ year, month }),
        periodKey: formatPeriodKey(year, month),
      });
    }
  }

  return result;
}
