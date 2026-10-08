import type { PtCalculationInput, PtCalculationResult, PtStateCode } from "./types.js";
import { UnsupportedPtStateException } from "./types.js";
import { calculateKarnatakaPt } from "./adapters/karnataka.js";
import { calculateMaharashtraPt } from "./adapters/maharashtra.js";
import { calculateTelanganaPt } from "./adapters/telangana.js";
import { calculateWestBengalPt } from "./adapters/westBengal.js";

export const SUPPORTED_PT_STATES: readonly PtStateCode[] = ["KA", "MH", "TS", "WB"] as const;

export function isSupportedPtState(state: string): state is PtStateCode {
  return (SUPPORTED_PT_STATES as readonly string[]).includes(state.toUpperCase());
}

/**
 * Authoritative Multi-State Professional Tax Calculation Engine
 * Invariant: For each employee, payroll period, and resolved state, produces
 * deterministic, reproducible, auditable statutory PT deduction.
 */
export function calculateProfessionalTax(input: PtCalculationInput): PtCalculationResult {
  const normalizedState = input.stateCode ? input.stateCode.trim().toUpperCase() : "";

  switch (normalizedState) {
    case "KA":
      return calculateKarnatakaPt({ ...input, stateCode: "KA" });
    case "MH":
      return calculateMaharashtraPt({ ...input, stateCode: "MH" });
    case "TS":
      return calculateTelanganaPt({ ...input, stateCode: "TS" });
    case "WB":
      return calculateWestBengalPt({ ...input, stateCode: "WB" });
    default:
      throw new UnsupportedPtStateException(
        `State '${input.stateCode}' is not supported for automatic PT calculation. Supported states: ${SUPPORTED_PT_STATES.join(", ")}`,
        { stateCode: input.stateCode, supportedStates: SUPPORTED_PT_STATES },
      );
  }
}
