import { describe, it, expect } from "vitest";
import {
  resolveEmployeePtState,
  UnresolvedPtStateException,
  normalizeStateCode,
} from "./index.js";

describe("P2.9 Professional Tax State Resolution Hierarchy", () => {
  it("normalizes state representations cleanly", () => {
    expect(normalizeStateCode("karnataka")).toBe("KA");
    expect(normalizeStateCode("KA")).toBe("KA");
    expect(normalizeStateCode("Maharashtra")).toBe("MH");
    expect(normalizeStateCode("MH")).toBe("MH");
    expect(normalizeStateCode("Telangana")).toBe("TS");
    expect(normalizeStateCode("TG")).toBe("TS");
    expect(normalizeStateCode("TS")).toBe("TS");
    expect(normalizeStateCode("West Bengal")).toBe("WB");
    expect(normalizeStateCode("WB")).toBe("WB");
    expect(normalizeStateCode("Delhi")).toBe(null);
  });

  it("prioritizes Priority 1: EmployeeStatutoryProfile.ptState over location and company defaults", () => {
    const res = resolveEmployeePtState({
      employeeId: "emp-1",
      employeeCode: "E001",
      statutoryProfilePtState: "MH",
      workLocationState: "KA",
      companySettingsState: "TS",
    });
    expect(res.stateCode).toBe("MH");
    expect(res.source).toBe("EMPLOYEE_OVERRIDE");
  });

  it("falls back to Priority 2: WorkLocation.state when statutory profile is unconfigured", () => {
    const res = resolveEmployeePtState({
      employeeId: "emp-2",
      employeeCode: "E002",
      statutoryProfilePtState: null,
      workLocationState: "KA",
      companySettingsState: "TS",
    });
    expect(res.stateCode).toBe("KA");
    expect(res.source).toBe("WORK_LOCATION");
  });

  it("falls back to Priority 3: CompanySettings.state when work location is unconfigured", () => {
    const res = resolveEmployeePtState({
      employeeId: "emp-3",
      employeeCode: "E003",
      statutoryProfilePtState: null,
      workLocationState: null,
      companySettingsState: "TS",
    });
    expect(res.stateCode).toBe("TS");
    expect(res.source).toBe("COMPANY_DEFAULT");
  });

  it("throws UnresolvedPtStateException when no tier provides a supported state", () => {
    expect(() =>
      resolveEmployeePtState({
        employeeId: "emp-4",
        employeeCode: "E004",
        statutoryProfilePtState: null,
        workLocationState: null,
        companySettingsState: null,
      }),
    ).toThrow(UnresolvedPtStateException);

    expect(() =>
      resolveEmployeePtState({
        employeeId: "emp-5",
        employeeCode: "E005",
        statutoryProfilePtState: "DL", // Delhi has no PT
        workLocationState: "UP",
        companySettingsState: "HR",
      }),
    ).toThrow(UnresolvedPtStateException);
  });
});
