import type { PtStateCode, ResolvedPtState } from "./types.js";
import { UnresolvedPtStateException } from "./types.js";

const STATE_NAME_MAP: Record<string, PtStateCode> = {
  KA: "KA",
  KARNATAKA: "KA",
  MH: "MH",
  MAHARASHTRA: "MH",
  TS: "TS",
  TG: "TS",
  TELANGANA: "TS",
  WB: "WB",
  "WEST BENGAL": "WB",
  WESTBENGAL: "WB",
};

export function normalizeStateCode(rawState?: string | null): PtStateCode | null {
  if (!rawState) return null;
  const clean = rawState.trim().toUpperCase();
  if (STATE_NAME_MAP[clean]) {
    return STATE_NAME_MAP[clean];
  }
  return null;
}

export interface StateResolutionContext {
  employeeId: string;
  employeeCode?: string;
  statutoryProfilePtState?: string | null;
  workLocationState?: string | null;
  workLocationId?: string | null;
  companySettingsState?: string | null;
}

/**
 * Resolves authoritative employee PT jurisdiction following the strict 3-tier hierarchy:
 * Priority 1: EmployeeStatutoryProfile.ptState (Explicit employee override)
 * Priority 2: WorkLocation.state (Assigned work location state)
 * Priority 3: CompanySettings.state (Default company establishment fallback)
 * 
 * If unresolved or unsupported: Throws UnresolvedPtStateException.
 */
export function resolveEmployeePtState(context: StateResolutionContext): ResolvedPtState {
  // Priority 1: Explicit statutory profile override
  const p1 = normalizeStateCode(context.statutoryProfilePtState);
  if (p1) {
    return {
      stateCode: p1,
      source: "EMPLOYEE_OVERRIDE",
      workLocationId: context.workLocationId,
    };
  }

  // Priority 2: Work location state
  const p2 = normalizeStateCode(context.workLocationState);
  if (p2) {
    return {
      stateCode: p2,
      source: "WORK_LOCATION",
      workLocationId: context.workLocationId,
    };
  }

  // Priority 3: Company default state
  const p3 = normalizeStateCode(context.companySettingsState);
  if (p3) {
    return {
      stateCode: p3,
      source: "COMPANY_DEFAULT",
      workLocationId: context.workLocationId,
    };
  }

  throw new UnresolvedPtStateException(
    `Cannot resolve Professional Tax state for employee ${context.employeeCode || context.employeeId}. Neither Employee Profile, Work Location, nor Company Default provided a supported state (KA, MH, TS, WB).`,
    {
      employeeId: context.employeeId,
      employeeCode: context.employeeCode,
      profileState: context.statutoryProfilePtState,
      locationState: context.workLocationState,
      companyState: context.companySettingsState,
    },
  );
}
