import { describe, expect, it } from 'vitest';
import { calculatePayroll } from './payrollEngine.js';

const components = [
  { code: 'BASIC', name: 'Basic', kind: 'EARNING' as const, method: 'FIXED' as const, value: 30000, proratable: true, taxable: true },
  { code: 'HRA', name: 'HRA', kind: 'EARNING' as const, method: 'PERCENT_BASIC' as const, value: 40, proratable: true, taxable: true },
];

describe('payroll calculation', () => {
  it('prorates earnings once and produces an auditable statutory breakdown', () => {
    const result = calculatePayroll({ components, workingDays: 30, payableDays: 15, rules: [
      { type: 'PF', configuration: { baseCodes: ['BASIC'], wageCeiling: 15000, employeeRate: 12, employerRate: 12 } },
      { type: 'ESI', configuration: { grossCeiling: 25000, employeeRate: .75, employerRate: 3.25 } },
    ] });
    expect(result.breakdown.BASIC).toBe(15000); expect(result.breakdown.HRA).toBe(6000);
    expect(result.breakdown.PF_EMPLOYEE).toBe(1800); expect(result.breakdown.ESI_EMPLOYEE).toBe(157.5);
    expect(result.netPay).toBe(19042.5); expect(result.calculationTrace.length).toBeGreaterThan(3);
  });
  it('applies professional-tax slabs, adjustments, reimbursements and loans', () => {
    const result = calculatePayroll({ components, workingDays: 30, payableDays: 30, adjustments: [
      { code: 'BONUS', name: 'Bonus', kind: 'EARNING', amount: 5000 }, { code: 'TRAVEL_REIMB', name: 'Travel', kind: 'REIMBURSEMENT', amount: 1000 },
    ], rules: [{ type: 'PROFESSIONAL_TAX', configuration: { slabs: [{ min: 0, max: 39999, amount: 100 }, { min: 40000, amount: 200 }] } }], loanInstallment: 2000 });
    expect(result.grossEarnings).toBe(47000); expect(result.employeeDeductions).toBe(2200); expect(result.reimbursements).toBe(1000); expect(result.netPay).toBe(45800);
  });
  it('never produces negative take-home pay', () => {
    const result = calculatePayroll({ components: [{ ...components[0], value: 1000 }], workingDays: 30, payableDays: 30, loanInstallment: 5000 }); expect(result.netPay).toBe(0);
  });
});
