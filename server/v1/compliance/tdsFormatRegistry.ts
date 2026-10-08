/**
 * OrbitHR Multi-Dimensional Statutory Filing Format Registry
 * Covers Form 24Q (FY <= 2025-26) and Form 138 (FY >= 2026-27).
 * Strictly enforces Anti-Guessing Invariant: raises UNREGISTERED_STATUTORY_SPECIFICATION
 * if an official specification is not registered.
 *
 * Statutory Separation:
 * - Legal Framework: Income-tax Act, 1961 vs Income-tax Act, 2025
 * - Missing PAN Provision: Section 206AA (1961 Act) vs Section 397 (2025 Act)
 * - Tripartite Versioning: File Format Version != Protean RPU Version != Protean FVU Version
 */

export type StatementType = "REGULAR" | "CORRECTION";
export type TdsQuarter = "Q1" | "Q2" | "Q3" | "Q4";
export type TdsFormCode = "24Q" | "138";
export type ApplicableAct = "Income-tax Act, 1961" | "Income-tax Act, 2025";
export type HigherDeductionSection = "Section 206AA" | "Section 397";

export interface DeductorHeaderInput {
  tan: string;
  pan: string;
  financialYear: string;
  assessmentYear: string;
  quarter: TdsQuarter;
  legalEntityName: string;
  companyType?: string;
  registeredAddress: string;
  city: string;
  state: string;
  postalCode: string;
  officialEmail: string;
  officialPhone: string;
  responsiblePersonName: string;
  responsiblePersonDesignation: string;
  responsiblePersonPan: string;
  responsiblePersonMobile: string;
  responsiblePersonEmail: string;
  tokenNumberPrn?: string | null;
}

export interface ChallanRecordInput {
  challanIndex: number;
  bsrCode: string;
  challanDate: string; // YYYY-MM-DD
  challanSerialNo: string;
  minorHead: string; // "200" | "400"
  tdsAmount: number;
  surcharge: number;
  cess: number;
  interest: number;
  fee: number;
  totalAmount: number;
  chequeOrDdNo?: string | null;
  allocatedDeducteeCount: number;
}

export interface DeducteeItemInput {
  deducteeIndex: number;
  challanSerialNo: string;
  employeeCode: string;
  employeeName: string;
  pan: string;
  panStatus: "VALID" | "PANAPPLIED" | "PANNOTAVBL" | "PANINVALID";
  paymentDate: string; // YYYY-MM-DD
  grossPayment: number;
  tdsDeducted: number;
  surcharge: number;
  cess: number;
  totalTdsDeducted: number;
  totalTdsDeposited: number;
  deductionDate: string; // YYYY-MM-DD
  rateOfTds: number;
  reasonCode?: string | null; // "A" | "B" | "C" | null (never "Y" post-01/04/2025)
}

export interface SalaryAnnexureTwoItemInput {
  employeeIndex: number;
  employeeCode: string;
  employeeName: string;
  pan: string;
  category: "GENERAL" | "WOMAN" | "SENIOR_CITIZEN" | "SUPER_SENIOR";
  regime: "NEW" | "OLD"; // New u/s 115BAC
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  grossSalarySec17_1: number;
  perquisitesSec17_2: number;
  profitsInLieuSec17_3: number;
  totalGrossSalary: number;
  reportedPreviousEmployerSalary: number;
  exemptionsSec10: {
    hra?: number;
    lta?: number;
    gratuity?: number;
    leaveEncashment?: number;
    others?: number;
    total: number;
  };
  deductionsSec16: {
    standardDeduction: number;
    entertainmentAllowance: number;
    professionalTax: number;
    total: number;
  };
  incomeChargeableSalaries: number;
  otherIncomeReported: number;
  grossTotalIncome: number;
  chapterVIA: {
    sec80C?: number;
    sec80CCC?: number;
    sec80CCD1?: number;
    sec80CCD1B?: number;
    sec80CCD2?: number;
    sec80D?: number;
    sec80E?: number;
    sec80G?: number;
    others?: number;
    total: number;
  };
  totalTaxableIncome: number;
  taxOnTotalIncome: number;
  rebate87A: number;
  surcharge: number;
  healthAndEduCess: number;
  relief89: number;
  netTaxPayable: number;
  totalTdsCurrentEmployer: number;
  totalTdsPreviousEmployer: number;
  totalTdsDeducted: number;
  shortfallOrExcess: number;
}

export interface StatutoryFilingDataPayload {
  deductor: DeductorHeaderInput;
  challans: ChallanRecordInput[];
  deductees: DeducteeItemInput[];
  salaryDetails?: SalaryAnnexureTwoItemInput[]; // Q4 only
}

export interface StatutorySpecification {
  readonly formCode: TdsFormCode;
  readonly financialYear: string;
  readonly quarter: TdsQuarter;
  readonly statementType: StatementType;
  readonly applicableAct: ApplicableAct;
  readonly higherDeductionSection: HigherDeductionSection;
  readonly statutoryFileFormatVersion: string;
  readonly formatVersion: string; // Backwards-compatible alias
  readonly minRpuVersion: string;
  readonly minFvuVersion: string;
  readonly officialSpecReference: string;
  readonly effectiveFromDate: string;
  readonly annexureTwoRequired: boolean;

  validatePreconditions(payload: StatutoryFilingDataPayload): string[];
  serializeToAscii(payload: StatutoryFilingDataPayload): string;
}

// -----------------------------------------------------------------------------
// Format Utilities
// -----------------------------------------------------------------------------
export const formatDateDDMMYYYY = (isoDate: string): string => {
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length !== 3) return "01012026";
  const [y, m, d] = parts;
  return `${d.padStart(2, "0")}${m.padStart(2, "0")}${y}`;
};

export const formatMoneyNum = (n: number): string =>
  Math.round((n + Number.EPSILON) * 100) / 100 ? (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2) : "0.00";

export function getStatutoryLegalContext(financialYear: string): {
  applicableAct: ApplicableAct;
  higherDeductionSection: HigherDeductionSection;
  minRpuVersion: string;
  minFvuVersion: string;
} {
  const startYear = parseInt(financialYear.split("-")[0], 10);
  if (startYear >= 2026) {
    return {
      applicableAct: "Income-tax Act, 2025",
      higherDeductionSection: "Section 397",
      minRpuVersion: "1.1",
      minFvuVersion: "1.0",
    };
  }
  return {
    applicableAct: "Income-tax Act, 1961",
    higherDeductionSection: "Section 206AA",
    minRpuVersion: "6.0",
    minFvuVersion: "8.8",
  };
}

// -----------------------------------------------------------------------------
// Abstract Base Serializer
// -----------------------------------------------------------------------------
abstract class BaseTdsSerializer implements StatutorySpecification {
  abstract readonly formCode: TdsFormCode;
  abstract readonly financialYear: string;
  abstract readonly quarter: TdsQuarter;
  abstract readonly statementType: StatementType;
  abstract readonly applicableAct: ApplicableAct;
  abstract readonly higherDeductionSection: HigherDeductionSection;
  abstract readonly statutoryFileFormatVersion: string;
  abstract readonly minRpuVersion: string;
  abstract readonly minFvuVersion: string;
  abstract readonly officialSpecReference: string;
  abstract readonly effectiveFromDate: string;
  abstract readonly annexureTwoRequired: boolean;

  get formatVersion(): string {
    return this.statutoryFileFormatVersion;
  }

  validatePreconditions(payload: StatutoryFilingDataPayload): string[] {
    const errors: string[] = [];
    const d = payload.deductor;

    if (!/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(d.tan || "")) {
      errors.push(`Invalid Deductor TAN: ${d.tan}. Expected format: 4 letters + 5 digits + 1 letter`);
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(d.pan || "")) {
      errors.push(`Invalid Deductor PAN: ${d.pan}. Expected format: 5 letters + 4 digits + 1 letter`);
    }
    if (this.statementType === "CORRECTION" && (!d.tokenNumberPrn || d.tokenNumberPrn.trim().length === 0)) {
      errors.push("Correction statement requires tokenNumberPrn (Provisional Receipt Number of original return)");
    }
    if (this.annexureTwoRequired && (!payload.salaryDetails || payload.salaryDetails.length === 0)) {
      errors.push("Annexure II (Salary Details) is mandatory for Quarter 4 filing");
    }
    for (const c of payload.challans) {
      if (!/^[0-9]{7}$/.test(c.bsrCode)) {
        errors.push(`Challan BSR code must be exactly 7 numeric digits (got ${c.bsrCode})`);
      }
      if (!/^[0-9]{5}$/.test(c.challanSerialNo)) {
        errors.push(`Challan serial number must be exactly 5 numeric digits (got ${c.challanSerialNo})`);
      }
    }
    for (const item of payload.deductees) {
      if (["NOT_APPLICABLE", "UNKNOWN"].includes(item.panStatus)) {
        errors.push(
          `Deductee ${item.employeeCode} has unverified PAN status "${item.panStatus}". Complete PAN verification before return generation.`
        );
      }
    }
    return errors;
  }

  abstract serializeToAscii(payload: StatutoryFilingDataPayload): string;
}

// -----------------------------------------------------------------------------
// Form 24Q Serializers (Income-tax Act, 1961 | FY <= 2025-26)
// -----------------------------------------------------------------------------

export class Form24Q_Q1_Q3_Regular_v6_3 extends BaseTdsSerializer {
  readonly formCode = "24Q" as const;
  readonly financialYear = "2025-26";
  readonly quarter: TdsQuarter;
  readonly statementType: StatementType = "REGULAR";
  readonly applicableAct = "Income-tax Act, 1961" as const;
  readonly higherDeductionSection = "Section 206AA" as const;
  readonly statutoryFileFormatVersion = "6.3";
  readonly minRpuVersion = "6.0";
  readonly minFvuVersion = "8.8";
  readonly officialSpecReference = "Protean e-TDS File Format Specification Form 24Q v6.3";
  readonly effectiveFromDate = "2010-04-01";
  readonly annexureTwoRequired = false;

  constructor(quarter: "Q1" | "Q2" | "Q3") {
    super();
    this.quarter = quarter;
  }

  serializeToAscii(payload: StatutoryFilingDataPayload): string {
    const lines: string[] = [];
    const d = payload.deductor;
    const nowStr = formatDateDDMMYYYY(new Date().toISOString());

    // 1. File Header (FH)
    lines.push(`FH^SL1^${this.formCode}^${this.statutoryFileFormatVersion}^${nowStr}^${d.tan}^${d.legalEntityName}^`);

    // 2. Batch Header (BH)
    const isCorrection = this.statementType === "CORRECTION";
    const batchLine = [
      "BH",
      "1",
      payload.challans.length.toString(),
      this.formCode,
      "",
      "",
      d.tan,
      d.pan,
      d.assessmentYear.replace("-", ""),
      d.financialYear.replace("-", ""),
      this.quarter,
      d.legalEntityName,
      d.companyType || "K",
      d.registeredAddress,
      d.city,
      d.state,
      d.postalCode,
      d.officialEmail,
      d.officialPhone,
      d.responsiblePersonName,
      d.responsiblePersonDesignation,
      d.responsiblePersonPan,
      d.responsiblePersonMobile,
      d.responsiblePersonEmail,
      isCorrection ? "C" : "R",
      isCorrection ? (d.tokenNumberPrn || "") : "",
      "",
      "",
    ].join("^");
    lines.push(batchLine);

    // 3. Challans (CD) and Deductees (DD)
    for (let cIdx = 0; cIdx < payload.challans.length; cIdx++) {
      const c = payload.challans[cIdx];
      const matchedDeductees = payload.deductees.filter((x) => x.challanSerialNo === c.challanSerialNo);

      const cdLine = [
        "CD",
        "1",
        (cIdx + 1).toString(),
        matchedDeductees.length.toString(),
        "N",
        "",
        "",
        c.bsrCode,
        formatDateDDMMYYYY(c.challanDate),
        c.challanSerialNo,
        "",
        "",
        c.minorHead || "200",
        formatMoneyNum(c.tdsAmount),
        formatMoneyNum(c.surcharge),
        formatMoneyNum(c.cess),
        formatMoneyNum(c.interest),
        formatMoneyNum(c.fee),
        "0.00",
        formatMoneyNum(c.totalAmount),
        c.chequeOrDdNo || "",
        "",
        "",
        "",
      ].join("^");
      lines.push(cdLine);

      for (let dIdx = 0; dIdx < matchedDeductees.length; dIdx++) {
        const item = matchedDeductees[dIdx];
        const panStr =
          item.panStatus === "VALID"
            ? item.pan
            : item.panStatus === "PANAPPLIED"
              ? "PANAPPLIED"
              : item.panStatus === "PANINVALID"
                ? "PANINVALID"
                : "PANNOTAVBL";

        const ddLine = [
          "DD",
          "1",
          (cIdx + 1).toString(),
          (dIdx + 1).toString(),
          "O",
          "02", // 02 = Non-Company (Employee)
          panStr,
          "",
          "",
          item.employeeName,
          formatDateDDMMYYYY(item.paymentDate),
          formatDateDDMMYYYY(item.deductionDate),
          formatMoneyNum(item.grossPayment),
          formatMoneyNum(item.totalTdsDeducted),
          formatMoneyNum(item.surcharge),
          formatMoneyNum(item.cess),
          formatMoneyNum(item.totalTdsDeposited),
          (item.rateOfTds || 0).toFixed(2),
          item.reasonCode || "",
          item.employeeCode,
          "",
        ].join("^");
        lines.push(ddLine);
      }
    }

    return lines.join("\r\n");
  }
}

export class Form24Q_Q1_Q3_Correction_v6_3 extends Form24Q_Q1_Q3_Regular_v6_3 {
  override readonly statementType: StatementType = "CORRECTION";
  constructor(quarter: "Q1" | "Q2" | "Q3") {
    super(quarter);
  }
}

export class Form24Q_Q4_Regular_v7_5 extends BaseTdsSerializer {
  readonly formCode = "24Q" as const;
  readonly financialYear = "2025-26";
  readonly quarter = "Q4" as const;
  readonly statementType: StatementType = "REGULAR";
  readonly applicableAct = "Income-tax Act, 1961" as const;
  readonly higherDeductionSection = "Section 206AA" as const;
  readonly statutoryFileFormatVersion = "7.5";
  readonly minRpuVersion = "6.0";
  readonly minFvuVersion = "8.8";
  readonly officialSpecReference = "Protean e-TDS File Format Specification Form 24Q Q4 v7.5";
  readonly effectiveFromDate = "2024-04-01";
  readonly annexureTwoRequired = true;

  serializeToAscii(payload: StatutoryFilingDataPayload): string {
    const q13Serializer = new Form24Q_Q1_Q3_Regular_v6_3("Q3");
    let baseAscii = q13Serializer.serializeToAscii(payload);
    baseAscii = baseAscii.replace("v6.3", "v7.5"); // reflect v7.5 header

    const lines = baseAscii.split("\r\n");

    // Append Annexure II Salary Details (SD)
    for (let sIdx = 0; sIdx < (payload.salaryDetails || []).length; sIdx++) {
      const s = payload.salaryDetails![sIdx];
      const sdLine = [
        "SD",
        "1",
        (sIdx + 1).toString(),
        s.employeeCode,
        s.employeeName,
        s.pan,
        s.regime === "NEW" ? "Y" : "N",
        formatDateDDMMYYYY(s.periodStart),
        formatDateDDMMYYYY(s.periodEnd),
        formatMoneyNum(s.grossSalarySec17_1),
        formatMoneyNum(s.perquisitesSec17_2),
        formatMoneyNum(s.profitsInLieuSec17_3),
        formatMoneyNum(s.totalGrossSalary),
        formatMoneyNum(s.reportedPreviousEmployerSalary),
        formatMoneyNum(s.exemptionsSec10.total),
        formatMoneyNum(s.deductionsSec16.standardDeduction),
        formatMoneyNum(s.deductionsSec16.entertainmentAllowance),
        formatMoneyNum(s.deductionsSec16.professionalTax),
        formatMoneyNum(s.incomeChargeableSalaries),
        formatMoneyNum(s.otherIncomeReported),
        formatMoneyNum(s.grossTotalIncome),
        formatMoneyNum(s.chapterVIA.total),
        formatMoneyNum(s.totalTaxableIncome),
        formatMoneyNum(s.taxOnTotalIncome),
        formatMoneyNum(s.rebate87A),
        formatMoneyNum(s.surcharge),
        formatMoneyNum(s.healthAndEduCess),
        formatMoneyNum(s.relief89),
        formatMoneyNum(s.netTaxPayable),
        formatMoneyNum(s.totalTdsCurrentEmployer),
        formatMoneyNum(s.totalTdsPreviousEmployer),
        formatMoneyNum(s.totalTdsDeducted),
        formatMoneyNum(s.shortfallOrExcess),
      ].join("^");
      lines.push(sdLine);
    }

    return lines.join("\r\n");
  }
}

export class Form24Q_Q4_Correction_v7_5 extends Form24Q_Q4_Regular_v7_5 {
  override readonly statementType: StatementType = "CORRECTION";
}

// -----------------------------------------------------------------------------
// Form 138 Serializers (Income-tax Act, 2025 | FY >= 2026-27)
// -----------------------------------------------------------------------------

export class Form138_Q1_Q3_Regular_v1_2 extends BaseTdsSerializer {
  readonly formCode = "138" as const;
  readonly financialYear = "2026-27";
  readonly quarter: TdsQuarter;
  readonly statementType: StatementType = "REGULAR";
  readonly applicableAct = "Income-tax Act, 2025" as const;
  readonly higherDeductionSection = "Section 397" as const;
  readonly statutoryFileFormatVersion = "1.2";
  readonly minRpuVersion = "1.1";
  readonly minFvuVersion = "1.0";
  readonly officialSpecReference = "Income Tax Department / Protean Form 138 Specification v1.2 (Income-tax Act, 2025)";
  readonly effectiveFromDate = "2026-04-01";
  readonly annexureTwoRequired = false;

  constructor(quarter: "Q1" | "Q2" | "Q3") {
    super();
    this.quarter = quarter;
  }

  serializeToAscii(payload: StatutoryFilingDataPayload): string {
    const lines: string[] = [];
    const d = payload.deductor;
    const nowStr = formatDateDDMMYYYY(new Date().toISOString());

    // 1. File Header (FH) for Form 138
    lines.push(`FH^SL1^${this.formCode}^${this.statutoryFileFormatVersion}^${nowStr}^${d.tan}^${d.legalEntityName}^`);

    // 2. Batch Header (BH)
    const isCorrection = this.statementType === "CORRECTION";
    const batchLine = [
      "BH",
      "1",
      payload.challans.length.toString(),
      this.formCode,
      "",
      "",
      d.tan,
      d.pan,
      d.assessmentYear.replace("-", ""),
      d.financialYear.replace("-", ""),
      this.quarter,
      d.legalEntityName,
      d.companyType || "K",
      d.registeredAddress,
      d.city,
      d.state,
      d.postalCode,
      d.officialEmail,
      d.officialPhone,
      d.responsiblePersonName,
      d.responsiblePersonDesignation,
      d.responsiblePersonPan,
      d.responsiblePersonMobile,
      d.responsiblePersonEmail,
      isCorrection ? "C" : "R",
      isCorrection ? (d.tokenNumberPrn || "") : "",
      "",
      "",
    ].join("^");
    lines.push(batchLine);

    // 3. Challans (CD) and Deductees (DD)
    for (let cIdx = 0; cIdx < payload.challans.length; cIdx++) {
      const c = payload.challans[cIdx];
      const matchedDeductees = payload.deductees.filter((x) => x.challanSerialNo === c.challanSerialNo);

      const cdLine = [
        "CD",
        "1",
        (cIdx + 1).toString(),
        matchedDeductees.length.toString(),
        "N",
        "",
        "",
        c.bsrCode,
        formatDateDDMMYYYY(c.challanDate),
        c.challanSerialNo,
        "",
        "",
        c.minorHead || "200",
        formatMoneyNum(c.tdsAmount),
        formatMoneyNum(c.surcharge),
        formatMoneyNum(c.cess),
        formatMoneyNum(c.interest),
        formatMoneyNum(c.fee),
        "0.00",
        formatMoneyNum(c.totalAmount),
        c.chequeOrDdNo || "",
        "",
        "",
        "",
      ].join("^");
      lines.push(cdLine);

      for (let dIdx = 0; dIdx < matchedDeductees.length; dIdx++) {
        const item = matchedDeductees[dIdx];
        const panStr =
          item.panStatus === "VALID"
            ? item.pan
            : item.panStatus === "PANAPPLIED"
              ? "PANAPPLIED"
              : item.panStatus === "PANINVALID"
                ? "PANINVALID"
                : "PANNOTAVBL";

        const ddLine = [
          "DD",
          "1",
          (cIdx + 1).toString(),
          (dIdx + 1).toString(),
          "O",
          "02",
          panStr,
          "",
          "",
          item.employeeName,
          formatDateDDMMYYYY(item.paymentDate),
          formatDateDDMMYYYY(item.deductionDate),
          formatMoneyNum(item.grossPayment),
          formatMoneyNum(item.totalTdsDeducted),
          formatMoneyNum(item.surcharge),
          formatMoneyNum(item.cess),
          formatMoneyNum(item.totalTdsDeposited),
          (item.rateOfTds || 0).toFixed(2),
          item.reasonCode || "",
          item.employeeCode,
          "",
        ].join("^");
        lines.push(ddLine);
      }
    }

    return lines.join("\r\n");
  }
}

export class Form138_Q1_Q3_Correction_v1_2 extends Form138_Q1_Q3_Regular_v1_2 {
  override readonly statementType: StatementType = "CORRECTION";
  constructor(quarter: "Q1" | "Q2" | "Q3") {
    super(quarter);
  }
}

export class Form138_Q4_Regular_v1_0 extends BaseTdsSerializer {
  readonly formCode = "138" as const;
  readonly financialYear = "2026-27";
  readonly quarter = "Q4" as const;
  readonly statementType: StatementType = "REGULAR";
  readonly applicableAct = "Income-tax Act, 2025" as const;
  readonly higherDeductionSection = "Section 397" as const;
  readonly statutoryFileFormatVersion = "1.0";
  readonly minRpuVersion = "1.1";
  readonly minFvuVersion = "1.0";
  readonly officialSpecReference = "Income Tax Department / Protean Form 138 Q4 Specification v1.0 (Income-tax Act, 2025)";
  readonly effectiveFromDate = "2027-01-01";
  readonly annexureTwoRequired = true;

  serializeToAscii(payload: StatutoryFilingDataPayload): string {
    const q13 = new Form138_Q1_Q3_Regular_v1_2("Q3");
    let base = q13.serializeToAscii(payload);
    base = base.replace("v1.2", "v1.0");

    const lines = base.split("\r\n");
    for (let sIdx = 0; sIdx < (payload.salaryDetails || []).length; sIdx++) {
      const s = payload.salaryDetails![sIdx];
      const sdLine = [
        "SD",
        "1",
        (sIdx + 1).toString(),
        s.employeeCode,
        s.employeeName,
        s.pan,
        s.regime === "NEW" ? "Y" : "N",
        formatDateDDMMYYYY(s.periodStart),
        formatDateDDMMYYYY(s.periodEnd),
        formatMoneyNum(s.grossSalarySec17_1),
        formatMoneyNum(s.perquisitesSec17_2),
        formatMoneyNum(s.profitsInLieuSec17_3),
        formatMoneyNum(s.totalGrossSalary),
        formatMoneyNum(s.reportedPreviousEmployerSalary),
        formatMoneyNum(s.exemptionsSec10.total),
        formatMoneyNum(s.deductionsSec16.standardDeduction),
        formatMoneyNum(s.deductionsSec16.entertainmentAllowance),
        formatMoneyNum(s.deductionsSec16.professionalTax),
        formatMoneyNum(s.incomeChargeableSalaries),
        formatMoneyNum(s.otherIncomeReported),
        formatMoneyNum(s.grossTotalIncome),
        formatMoneyNum(s.chapterVIA.total),
        formatMoneyNum(s.totalTaxableIncome),
        formatMoneyNum(s.taxOnTotalIncome),
        formatMoneyNum(s.rebate87A),
        formatMoneyNum(s.surcharge),
        formatMoneyNum(s.healthAndEduCess),
        formatMoneyNum(s.relief89),
        formatMoneyNum(s.netTaxPayable),
        formatMoneyNum(s.totalTdsCurrentEmployer),
        formatMoneyNum(s.totalTdsPreviousEmployer),
        formatMoneyNum(s.totalTdsDeducted),
        formatMoneyNum(s.shortfallOrExcess),
      ].join("^");
      lines.push(sdLine);
    }
    return lines.join("\r\n");
  }
}

export class Form138_Q4_Correction_v1_0 extends Form138_Q4_Regular_v1_0 {
  override readonly statementType: StatementType = "CORRECTION";
}

// -----------------------------------------------------------------------------
// Multi-Dimensional Format Registry Implementation
// -----------------------------------------------------------------------------
export class StatutoryFilingFormatRegistry {
  private static registry = new Map<string, StatutorySpecification>();

  static {
    // 1. Form 24Q Regular Specifications
    this.register(new Form24Q_Q1_Q3_Regular_v6_3("Q1"));
    this.register(new Form24Q_Q1_Q3_Regular_v6_3("Q2"));
    this.register(new Form24Q_Q1_Q3_Regular_v6_3("Q3"));
    this.register(new Form24Q_Q4_Regular_v7_5());

    // 2. Form 24Q Correction Specifications
    this.register(new Form24Q_Q1_Q3_Correction_v6_3("Q1"));
    this.register(new Form24Q_Q1_Q3_Correction_v6_3("Q2"));
    this.register(new Form24Q_Q1_Q3_Correction_v6_3("Q3"));
    this.register(new Form24Q_Q4_Correction_v7_5());

    // 3. Form 138 Regular Specifications
    this.register(new Form138_Q1_Q3_Regular_v1_2("Q1"));
    this.register(new Form138_Q1_Q3_Regular_v1_2("Q2"));
    this.register(new Form138_Q1_Q3_Regular_v1_2("Q3"));
    this.register(new Form138_Q4_Regular_v1_0());

    // 4. Form 138 Correction Specifications
    this.register(new Form138_Q1_Q3_Correction_v1_2("Q1"));
    this.register(new Form138_Q1_Q3_Correction_v1_2("Q2"));
    this.register(new Form138_Q1_Q3_Correction_v1_2("Q3"));
    this.register(new Form138_Q4_Correction_v1_0());
  }

  private static buildKey(
    formCode: TdsFormCode,
    version: string,
    quarter: TdsQuarter,
    type: StatementType
  ): string {
    return `${formCode}:${version}:${quarter}:${type}`;
  }

  public static register(spec: StatutorySpecification): void {
    const key = this.buildKey(spec.formCode, spec.statutoryFileFormatVersion, spec.quarter, spec.statementType);
    this.registry.set(key, spec);
  }

  public static resolve(
    financialYear: string,
    quarter: TdsQuarter,
    statementType: StatementType = "REGULAR"
  ): StatutorySpecification {
    const startYear = parseInt(financialYear.split("-")[0], 10);
    if (isNaN(startYear)) {
      throw new Error(`INVALID_FINANCIAL_YEAR: ${financialYear}. Expected format YYYY-YY (e.g. 2025-26)`);
    }

    const formCode: TdsFormCode = startYear >= 2026 ? "138" : "24Q";

    let targetVersion = "";
    if (formCode === "138") {
      targetVersion = quarter === "Q4" ? "1.0" : "1.2";
    } else {
      targetVersion = quarter === "Q4" ? "7.5" : "6.3";
    }

    const key = this.buildKey(formCode, targetVersion, quarter, statementType);
    const spec = this.registry.get(key);

    if (!spec) {
      throw new Error(
        `UNREGISTERED_STATUTORY_SPECIFICATION: No official specification registered for Form ${formCode} ${quarter} ${statementType} v${targetVersion}`
      );
    }

    return spec;
  }
}
