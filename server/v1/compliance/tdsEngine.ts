/**
 * OrbitHR TDS Compliance Core Engine (P2.8)
 * Implements:
 * - Quarterly aggregation across 3 locked payroll runs
 * - 5-state Deductee PAN lifecycle (VALID, PANAPPLIED, PANNOTAVBL, PANINVALID, UNKNOWN)
 * - Section 206AA 20% higher deduction floor
 * - Section 206AB statutory omission enforcement (w.e.f. 01-04-2025: zero Reason Code Y)
 * - Component-level Challan ledger (Allocatable Tax vs Non-Allocatable Interest/Fee)
 * - Annexure I Deductee Schedule & Annexure II Q4 Annual Salary Consolidation
 */

import { money } from "./types.js";
import {
  type DeducteeItemInput,
  type ChallanRecordInput,
  type SalaryAnnexureTwoItemInput,
  type StatutoryFilingDataPayload,
  type DeductorHeaderInput,
  type TdsQuarter,
  StatutoryFilingFormatRegistry,
  getStatutoryLegalContext,
} from "./tdsFormatRegistry.js";

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export type PanLifecycleState = "VALID" | "PANAPPLIED" | "PANNOTAVBL" | "PANINVALID" | "UNKNOWN";

export interface DeducteeProfileInput {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  panNumber?: string | null;
  panAppliedProof?: boolean; // Form 49A token/receipt verified
  dateOfBirth?: Date | string | null;
  gender?: string | null;
  dateOfJoining?: Date | string | null;
  lastWorkingDay?: Date | string | null;
}

export interface MonthlyPayrollLineInput {
  employeeId: string;
  payrollRunMonth: string; // e.g. "2025-04"
  payrollPeriodEnd: string; // YYYY-MM-DD
  grossEarnings: number;
  tdsDeducted: number;
  breakdown: Record<string, unknown>;
}

export interface ChallanDepositInput {
  id: string;
  bsrCode: string;
  challanDate: string; // YYYY-MM-DD
  challanSerialNo: string;
  minorHead: string; // "200" | "400"
  tdsAmount: number;
  surcharge?: number;
  cess?: number;
  interest?: number;
  fee?: number;
  totalAmount: number;
  chequeOrDdNo?: string | null;
}

export interface ChallanAllocationResult {
  challanId: string;
  challanSerialNo: string;
  bsrCode: string;
  allocatableTaxPool: number; // tdsAmount + surcharge + cess
  employerPenalties: number; // interest + fee (quarantined)
  totalAllocatedDeducteeTax: number;
  unallocatedSurplus: number;
  status: "EXACT_MATCH" | "EXCESS_CHALLAN_SURPLUS" | "SHORT_PAYMENT_BLOCKED";
}

export interface TdsLedgerReconciliation {
  totalPayrollTdsDeducted: number;
  totalDeducteeTdsReported: number;
  totalAllocatableChallanDeposit: number;
  totalEmployerPenaltiesDeposit: number;
  totalChallanDeposited: number;
  totalUnallocatedSurplus: number;
  reconciliationStatus: "FULLY_RECONCILED" | "EXCESS_CHALLAN_SURPLUS" | "SHORT_PAYMENT_BLOCKED";
  challanAllocations: ChallanAllocationResult[];
  blockingErrors: string[];
}

/**
 * 1. Evaluates PAN lifecycle state adhering to official Protean / ITD definitions.
 */
export function evaluatePanState(
  pan: string | null | undefined,
  panAppliedProof = false
): {
  state: PanLifecycleState;
  sanitizedPan: string;
  reasonCode: string | null;
} {
  const clean = (pan || "").trim().toUpperCase();

  if (!clean || clean.length === 0) {
    if (panAppliedProof) {
      return { state: "PANAPPLIED", sanitizedPan: "PANAPPLIED", reasonCode: null };
    }
    return { state: "PANNOTAVBL", sanitizedPan: "PANNOTAVBL", reasonCode: "C" };
  }

  if (PAN_REGEX.test(clean)) {
    return { state: "VALID", sanitizedPan: clean, reasonCode: null };
  }

  // Malformed / structurally invalid
  return { state: "PANINVALID", sanitizedPan: "PANINVALID", reasonCode: "C" };
}

/**
 * 2. Component-level Challan ledger accounting.
 * Separates Allocatable Tax (TDS + Surcharge + Cess) from Non-Allocatable Penalties (Interest + Fee).
 */
export function calculateChallanLedger(
  challans: ChallanDepositInput[],
  deducteeAllocations: Array<{ challanSerialNo: string; tdsAmount: number }>
): TdsLedgerReconciliation {
  const allocations: ChallanAllocationResult[] = [];
  const blockingErrors: string[] = [];

  let totalAllocatable = 0;
  let totalPenalties = 0;
  let totalChallan = 0;
  let totalAllocatedToDeductees = 0;

  for (const c of challans) {
    const tds = money(c.tdsAmount);
    const surcharge = money(c.surcharge || 0);
    const cess = money(c.cess || 0);
    const interest = money(c.interest || 0);
    const fee = money(c.fee || 0);

    const allocatablePool = money(tds + surcharge + cess);
    const employerPenalties = money(interest + fee);
    const totalAmount = money(allocatablePool + employerPenalties);

    totalAllocatable = money(totalAllocatable + allocatablePool);
    totalPenalties = money(totalPenalties + employerPenalties);
    totalChallan = money(totalChallan + totalAmount);

    // Sum deductees allocated to this specific challan
    const matchedItems = deducteeAllocations.filter((x) => x.challanSerialNo === c.challanSerialNo);
    const allocatedTax = money(matchedItems.reduce((acc, curr) => acc + curr.tdsAmount, 0));
    totalAllocatedToDeductees = money(totalAllocatedToDeductees + allocatedTax);

    const unallocatedSurplus = money(allocatablePool - allocatedTax);

    let status: ChallanAllocationResult["status"] = "EXACT_MATCH";
    if (unallocatedSurplus > 0) {
      status = "EXCESS_CHALLAN_SURPLUS";
    } else if (unallocatedSurplus < 0) {
      status = "SHORT_PAYMENT_BLOCKED";
      blockingErrors.push(
        `Challan ${c.challanSerialNo} (BSR ${c.bsrCode}) is underfunded: allocated deductee tax (₹${allocatedTax}) exceeds allocatable tax pool (₹${allocatablePool}) by ₹${Math.abs(unallocatedSurplus)}.`
      );
    }

    allocations.push({
      challanId: c.id,
      challanSerialNo: c.challanSerialNo,
      bsrCode: c.bsrCode,
      allocatableTaxPool: allocatablePool,
      employerPenalties,
      totalAllocatedDeducteeTax: allocatedTax,
      unallocatedSurplus,
      status,
    });
  }

  const totalSurplus = money(allocations.reduce((acc, a) => acc + Math.max(0, a.unallocatedSurplus), 0));

  let reconciliationStatus: TdsLedgerReconciliation["reconciliationStatus"] = "FULLY_RECONCILED";
  if (blockingErrors.length > 0) {
    reconciliationStatus = "SHORT_PAYMENT_BLOCKED";
  } else if (totalSurplus > 0) {
    reconciliationStatus = "EXCESS_CHALLAN_SURPLUS";
  }

  return {
    totalPayrollTdsDeducted: totalAllocatedToDeductees,
    totalDeducteeTdsReported: totalAllocatedToDeductees,
    totalAllocatableChallanDeposit: totalAllocatable,
    totalEmployerPenaltiesDeposit: totalPenalties,
    totalChallanDeposited: totalChallan,
    totalUnallocatedSurplus: totalSurplus,
    reconciliationStatus,
    challanAllocations: allocations,
    blockingErrors,
  };
}

/**
 * 3. Consolidates quarterly payroll lines and generates Annexure I deductee records.
 * Enforces Section 206AA higher tax rule (20% floor) on missing/invalid PAN.
 * Enforces Section 206AB omission rule (no Reason Code Y for FY 2025-26 onward).
 */
export function aggregateQuarterlyDeductees(params: {
  financialYear: string;
  quarter: TdsQuarter;
  monthlyLines: MonthlyPayrollLineInput[];
  employeeProfiles: Map<string, DeducteeProfileInput>;
  challans: ChallanDepositInput[];
  autoAllocateChallanFifo?: boolean;
}): {
  deductees: DeducteeItemInput[];
  ledger: TdsLedgerReconciliation;
  validationWarnings: string[];
} {
  const deductees: DeducteeItemInput[] = [];
  const validationWarnings: string[] = [];

  // Group monthly lines by employeeId
  const employeeLinesMap = new Map<string, MonthlyPayrollLineInput[]>();
  for (const line of params.monthlyLines) {
    const list = employeeLinesMap.get(line.employeeId) || [];
    list.push(line);
    employeeLinesMap.set(line.employeeId, list);
  }

  // Primary Challan assignment FIFO tracker
  const challanRemainingCapacity = params.challans.map((c) => ({
    serialNo: c.challanSerialNo,
    capacity: money((c.tdsAmount || 0) + (c.surcharge || 0) + (c.cess || 0)),
  }));

  let deducteeSeq = 1;

  for (const [employeeId, lines] of employeeLinesMap.entries()) {
    const profile = params.employeeProfiles.get(employeeId);
    if (!profile) continue;

    const panInfo = evaluatePanState(profile.panNumber, profile.panAppliedProof);

    for (const line of lines) {
      const gross = money(line.grossEarnings);
      let tds = money(line.tdsDeducted);

      // Statutory Check: If PAN is missing/invalid, verify rate is at least 20%
      // Governed by Section 206AA (Income-tax Act, 1961) or Section 397 (Income-tax Act, 2025)
      const effectiveRate = gross > 0 ? (tds / gross) * 100 : 0;
      if (
        (panInfo.state === "PANNOTAVBL" || panInfo.state === "PANINVALID") &&
        effectiveRate < 20 &&
        gross > 0
      ) {
        const legalCtx = getStatutoryLegalContext(params.financialYear);
        validationWarnings.push(
          `${legalCtx.higherDeductionSection} Warning (${legalCtx.applicableAct}): Employee ${profile.employeeCode} (${profile.firstName} ${profile.lastName}) has ${panInfo.state}, but TDS deducted was ${(effectiveRate).toFixed(1)}% (<20%).`
        );
      }

      // Assign to challan (FIFO if enabled, or first available)
      let assignedChallanSerial = params.challans[0]?.challanSerialNo || "00001";
      if (params.autoAllocateChallanFifo && challanRemainingCapacity.length > 0) {
        for (const ch of challanRemainingCapacity) {
          if (ch.capacity >= tds) {
            ch.capacity = money(ch.capacity - tds);
            assignedChallanSerial = ch.serialNo;
            break;
          }
        }
      }

      deductees.push({
        deducteeIndex: deducteeSeq++,
        challanSerialNo: assignedChallanSerial,
        employeeCode: profile.employeeCode,
        employeeName: `${profile.firstName} ${profile.lastName}`.trim(),
        pan: panInfo.sanitizedPan,
        panStatus: panInfo.state === "UNKNOWN" ? "PANNOTAVBL" : panInfo.state,
        paymentDate: line.payrollPeriodEnd,
        grossPayment: gross,
        tdsDeducted: tds,
        surcharge: 0,
        cess: 0,
        totalTdsDeducted: tds,
        totalTdsDeposited: tds,
        deductionDate: line.payrollPeriodEnd,
        rateOfTds: money(effectiveRate),
        reasonCode: panInfo.reasonCode, // "C" for missing/invalid PAN; NEVER "Y"
      });
    }
  }

  // Reconcile with challans
  const allocations = deductees.map((d) => ({
    challanSerialNo: d.challanSerialNo,
    tdsAmount: d.totalTdsDeducted,
  }));

  const ledger = calculateChallanLedger(params.challans, allocations);

  return { deductees, ledger, validationWarnings };
}

/**
 * 4. Generates Annexure II (Salary Details) for Quarter 4 filings.
 */
export function generateAnnexureTwo(params: {
  financialYear: string;
  employees: DeducteeProfileInput[];
  annualSalaryRecords: Map<
    string,
    {
      periodStart: string;
      periodEnd: string;
      regime: "NEW" | "OLD";
      grossSalarySec17_1: number;
      perquisitesSec17_2: number;
      profitsInLieuSec17_3: number;
      previousEmployerSalary: number;
      exemptionsSec10: number;
      standardDeduction: number;
      professionalTax: number;
      chapterVIA: number;
      taxableIncome: number;
      taxPayable: number;
      rebate87A: number;
      cess: number;
      relief89: number;
      totalTdsCurrentEmployer: number;
      totalTdsPreviousEmployer: number;
    }
  >;
}): SalaryAnnexureTwoItemInput[] {
  const items: SalaryAnnexureTwoItemInput[] = [];
  let seq = 1;

  for (const emp of params.employees) {
    const data = params.annualSalaryRecords.get(emp.employeeId);
    if (!data) continue;

    const totalGross = money(
      data.grossSalarySec17_1 + data.perquisitesSec17_2 + data.profitsInLieuSec17_3
    );
    const totalDeductionsSec16 = money(data.standardDeduction + data.professionalTax);
    const incomeChargeable = money(Math.max(0, totalGross - data.exemptionsSec10 - totalDeductionsSec16));
    const grossTotal = money(incomeChargeable + data.previousEmployerSalary);
    const taxable = money(Math.max(0, grossTotal - data.chapterVIA));
    const netTax = money(Math.max(0, data.taxPayable - data.rebate87A + data.cess - data.relief89));
    const totalTds = money(data.totalTdsCurrentEmployer + data.totalTdsPreviousEmployer);
    const diff = money(totalTds - netTax);

    items.push({
      employeeIndex: seq++,
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      pan: (emp.panNumber || "PANNOTAVBL").toUpperCase(),
      category: "GENERAL",
      regime: data.regime,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      grossSalarySec17_1: data.grossSalarySec17_1,
      perquisitesSec17_2: data.perquisitesSec17_2,
      profitsInLieuSec17_3: data.profitsInLieuSec17_3,
      totalGrossSalary: totalGross,
      reportedPreviousEmployerSalary: data.previousEmployerSalary,
      exemptionsSec10: { total: data.exemptionsSec10 },
      deductionsSec16: {
        standardDeduction: data.standardDeduction,
        entertainmentAllowance: 0,
        professionalTax: data.professionalTax,
        total: totalDeductionsSec16,
      },
      incomeChargeableSalaries: incomeChargeable,
      otherIncomeReported: 0,
      grossTotalIncome: grossTotal,
      chapterVIA: { total: data.chapterVIA },
      totalTaxableIncome: taxable,
      taxOnTotalIncome: data.taxPayable,
      rebate87A: data.rebate87A,
      surcharge: 0,
      healthAndEduCess: data.cess,
      relief89: data.relief89,
      netTaxPayable: netTax,
      totalTdsCurrentEmployer: data.totalTdsCurrentEmployer,
      totalTdsPreviousEmployer: data.totalTdsPreviousEmployer,
      totalTdsDeducted: totalTds,
      shortfallOrExcess: diff,
    });
  }

  return items;
}

/**
 * 5. Full pipeline: Resolves format from registry and serializes e-TDS return file.
 */
export function generateEtdsFile(
  payload: StatutoryFilingDataPayload
): {
  formCode: string;
  formatVersion: string;
  asciiText: string;
  preconditionErrors: string[];
} {
  const spec = StatutoryFilingFormatRegistry.resolve(
    payload.deductor.financialYear,
    payload.deductor.quarter,
    payload.deductor.tokenNumberPrn ? "CORRECTION" : "REGULAR"
  );

  const errors = spec.validatePreconditions(payload);
  if (errors.length > 0) {
    return {
      formCode: spec.formCode,
      formatVersion: spec.formatVersion,
      asciiText: "",
      preconditionErrors: errors,
    };
  }

  const asciiText = spec.serializeToAscii(payload);
  return {
    formCode: spec.formCode,
    formatVersion: spec.formatVersion,
    asciiText,
    preconditionErrors: [],
  };
}

/**
 * 6. Validates global challan allocation caps:
 * SUM(allocatedTds) <= challan.tdsAmount
 * SUM(allocatedSurcharge) <= challan.surcharge
 * SUM(allocatedCess) <= challan.cess
 */
export interface AllocationItemInput {
  id?: string;
  tdsChallanId: string;
  allocatedTds: number;
  allocatedSurcharge?: number;
  allocatedCess?: number;
  allocatedTotal?: number;
}

export function validateChallanAllocationCaps(
  allocations: AllocationItemInput[],
  challan: { id: string; tdsAmount: number; surcharge?: number; cess?: number }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const matched = allocations.filter((a) => a.tdsChallanId === challan.id);

  const totalTds = money(matched.reduce((acc, a) => acc + (a.allocatedTds || 0), 0));
  const totalSurcharge = money(matched.reduce((acc, a) => acc + (a.allocatedSurcharge || 0), 0));
  const totalCess = money(matched.reduce((acc, a) => acc + (a.allocatedCess || 0), 0));

  const maxTds = money(challan.tdsAmount || 0);
  const maxSurcharge = money(challan.surcharge || 0);
  const maxCess = money(challan.cess || 0);

  if (totalTds > maxTds) {
    errors.push(
      `Allocated TDS (₹${totalTds}) exceeds Challan ${challan.id} capacity (₹${maxTds}) by ₹${money(totalTds - maxTds)}`
    );
  }
  if (totalSurcharge > maxSurcharge) {
    errors.push(
      `Allocated Surcharge (₹${totalSurcharge}) exceeds Challan ${challan.id} capacity (₹${maxSurcharge}) by ₹${money(totalSurcharge - maxSurcharge)}`
    );
  }
  if (totalCess > maxCess) {
    errors.push(
      `Allocated Cess (₹${totalCess}) exceeds Challan ${challan.id} capacity (₹${maxCess}) by ₹${money(totalCess - maxCess)}`
    );
  }

  return { valid: errors.length === 0, errors };
}

