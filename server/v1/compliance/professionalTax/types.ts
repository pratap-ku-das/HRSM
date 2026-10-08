export type PtStateCode = "KA" | "MH" | "TS" | "WB";

export type Gender = "MALE" | "FEMALE" | "OTHER";

export type StateResolutionSource = "EMPLOYEE_OVERRIDE" | "WORK_LOCATION" | "COMPANY_DEFAULT";

export interface ResolvedPtState {
  stateCode: PtStateCode;
  source: StateResolutionSource;
  workLocationId?: string | null;
}

export interface PtSlabItem {
  min: number;
  max?: number | null;
  amount: number;
  note?: string;
}

export interface PtCalculationInput {
  grossApplicableWage: number;
  stateCode: PtStateCode;
  gender?: Gender | string | null;
  payrollMonth: number; // 1 - 12 (calendar month: 1=Jan, 2=Feb, etc.)
  payrollYear: number;
  ruleConfiguration?: Record<string, unknown> | null;
}

export interface PtCalculationResult {
  amount: number;
  stateCode: PtStateCode;
  grossApplicableWage: number;
  slabApplied: PtSlabItem;
  calculationTrace: string;
  isFebruaryAdjustmentApplied?: boolean;
  isExempt?: boolean;
  exemptionReason?: string;
}

export class UnresolvedPtStateException extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "UnresolvedPtStateException";
  }
}

export class MissingRequiredGenderException extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "MissingRequiredGenderException";
  }
}

export class UnsupportedPtStateException extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "UnsupportedPtStateException";
  }
}
