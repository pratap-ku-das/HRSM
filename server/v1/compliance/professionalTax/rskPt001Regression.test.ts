import { describe, it, expect } from "vitest";
import { calculatePayroll, type SalaryComponentInput } from "../../payrollEngine.js";

describe("P2.9 RSK-PT-001 Multi-Rule Isolation Regression Suite", () => {
  const components: SalaryComponentInput[] = [
    {
      code: "BASIC",
      name: "Basic Salary",
      kind: "EARNING",
      method: "FIXED",
      value: 50000,
      taxable: true,
      proratable: true,
    },
    {
      code: "HRA",
      name: "HRA",
      kind: "EARNING",
      method: "FIXED",
      value: 20000,
      taxable: true,
      proratable: true,
    },
  ];

  it("verifies single state PT calculation: Karnataka ₹200", () => {
    const res = calculatePayroll({
      components,
      workingDays: 30,
      payableDays: 30,
      ptState: "KA",
      payrollMonth: 5,
      payrollYear: 2026,
      rules: [
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "KA",
          configuration: { stateCode: "KA" },
        },
      ],
    });

    expect(res.breakdown.PROFESSIONAL_TAX).toBe(200);
    expect(res.employeeDeductions).toBe(200);
    expect(res.netPay).toBe(70000 - 200);
  });

  it("RSK-PT-001 Invariant: Multiple PT rules in input never accumulate multiple state deductions", () => {
    // Simulating a company with multiple active state PT rules (KA, MH, TS, WB)
    const res = calculatePayroll({
      components,
      workingDays: 30,
      payableDays: 30,
      ptState: "KA", // Employee belongs to Karnataka
      payrollMonth: 5,
      payrollYear: 2026,
      gender: "MALE",
      rules: [
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "KA",
          configuration: { stateCode: "KA" },
        },
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "MH",
          configuration: { stateCode: "MH" },
        },
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "TS",
          configuration: { stateCode: "TS" },
        },
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "WB",
          configuration: { stateCode: "WB" },
        },
      ],
    });

    // In the old buggy implementation, this would have deducted 200 + 200 + 200 + 150 = 750!
    // With RSK-PT-001 resolved, exactly ONE rule is applied: ₹200 for Karnataka!
    expect(res.breakdown.PROFESSIONAL_TAX).toBe(200);
    expect(res.employeeDeductions).toBe(200);
    expect(res.netPay).toBe(70000 - 200);
  });

  it("verifies Maharashtra female exemption prevents deduction in payroll calculation", () => {
    const res = calculatePayroll({
      components: [
        {
          code: "BASIC",
          name: "Basic Salary",
          kind: "EARNING",
          method: "FIXED",
          value: 20000,
          taxable: true,
          proratable: true,
        },
      ],
      workingDays: 30,
      payableDays: 30,
      ptState: "MH",
      gender: "FEMALE",
      payrollMonth: 6,
      payrollYear: 2026,
      rules: [
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "MH",
          configuration: { stateCode: "MH" },
        },
      ],
    });

    expect(res.breakdown.PROFESSIONAL_TAX).toBe(0);
    expect(res.employeeDeductions).toBe(0);
    expect(res.netPay).toBe(20000);
  });

  it("verifies February statutory adjustment ₹300 is applied in February payroll", () => {
    const res = calculatePayroll({
      components,
      workingDays: 28,
      payableDays: 28,
      ptState: "KA",
      payrollMonth: 2, // February
      payrollYear: 2026,
      rules: [
        {
          type: "PROFESSIONAL_TAX",
          stateCode: "KA",
          configuration: { stateCode: "KA" },
        },
      ],
    });

    expect(res.breakdown.PROFESSIONAL_TAX).toBe(300);
    expect(res.employeeDeductions).toBe(300);
    expect(res.netPay).toBe(70000 - 300);
  });
});
