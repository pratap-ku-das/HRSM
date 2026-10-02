import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateHraExemption,
  calculateNewRegimeTax,
  calculateOldRegimeTax,
  simulateTaxComparison,
} from './taxSimulatorEngine.js';
import { createTaxSimulatorRouter } from './taxSimulator.js';

const appFor = (
  permissions: string[],
  prisma: unknown,
  role = 'EMPLOYEE',
  userId = 'user-emp-1',
  employeeId = 'emp-test-1',
  companyId = 'company-test-1',
) => {
  const app = express();
  app.use(express.json());
  const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, {
      auth: {
        id: userId,
        companyId,
        role,
        employeeId,
        permissions,
      },
      requestId: 'test-req-tax',
    });
    next();
  };
  app.use('/api/v1', createTaxSimulatorRouter(prisma as never, authenticate));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.status || 500).json({ error: { message: error?.message } });
  });
  return app;
};

describe('Income Tax & Salary Simulator Engine & API (P2.3)', () => {
  // ---------------------------------------------------------------------------
  // 1. Pure Engine: New Tax Regime (Section 115BAC)
  // ---------------------------------------------------------------------------
  describe('1. New Tax Regime Calculations (Union Budget 2025 / AY 2026-27 / FY 2025-26)', () => {
    it('applies ₹75,000 standard deduction and ₹0 tax under Section 87A rebate for income <= ₹12,00,000', () => {
      // Annual Gross ₹7,00,000 -> Taxable ₹6,25,000
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 350000,
          hra: 150000,
          specialAllowance: 200000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(700000);
      expect(breakdown.standardDeduction).toBe(75000);
      expect(breakdown.netTaxableIncome).toBe(625000); // 7,00,000 - 75,000

      // Budget 2025 Slabs: 0-4L 0%, 4-6.25L (2.25L @ 5% = 11,250)
      expect(breakdown.taxBeforeRebate).toBe(11250);
      // Because netTaxableIncome <= 12,00,000, Section 87A rebate covers entire tax
      expect(breakdown.section87ARebate).toBe(11250);
      expect(breakdown.totalAnnualTax).toBe(0);
      expect(breakdown.monthlyEstimatedTds).toBe(0);
    });

    it('calculates ₹0 tax for ₹12,00,000 gross salary under Budget 2025 (AY 2026-27) due to ₹12L 87A rebate threshold', () => {
      // Annual Gross ₹12,00,000 -> Taxable ₹11,25,000
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 600000,
          hra: 240000,
          specialAllowance: 360000,
          employeePf: 72000,
          professionalTax: 2500,
        },
        {},
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(1200000);
      expect(breakdown.standardDeduction).toBe(75000);
      expect(breakdown.netTaxableIncome).toBe(1125000); // 12,00,000 - 75,000

      // Slabs in AY 2026-27:
      // 0 - 4L: 0% = 0
      // 4L - 8L: 4L @ 5% = 20,000
      // 8L - 11.25L: 3.25L @ 10% = 32,500
      // Total tax before rebate = 20,000 + 32,500 = 52,500
      expect(breakdown.taxBeforeRebate).toBe(52500);
      // Because netTaxableIncome (11.25L) <= 12,00,000, Section 87A rebate covers entire tax up to 60k
      expect(breakdown.section87ARebate).toBe(52500);
      expect(breakdown.totalAnnualTax).toBe(0);
      expect(breakdown.monthlyEstimatedTds).toBe(0);
      expect(breakdown.monthlyNetTakeHome).toBeGreaterThan(0);
    });

    it('calculates progressive slab tax correctly for ₹20,00,000 gross salary under Budget 2025 (AY 2026-27)', () => {
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 1000000,
          hra: 400000,
          specialAllowance: 600000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(2000000);
      expect(breakdown.netTaxableIncome).toBe(1925000); // 20L - 75k

      // Slabs in AY 2026-27:
      // 0-4L: 0
      // 4-8L (4L @ 5% = 20k)
      // 8-12L (4L @ 10% = 40k)
      // 12-16L (4L @ 15% = 60k)
      // 16-19.25L (3.25L @ 20% = 65k)
      // Total tax = 20k + 40k + 60k + 65k = 185,000
      expect(breakdown.taxBeforeRebate).toBe(185000);
      expect(breakdown.cess).toBe(7400); // 4% of 185,000
      expect(breakdown.totalAnnualTax).toBe(192400);
    });

    it('calculates FY 2024-25 (AY 2025-26) correctly using Finance (No. 2) Act 2024 slabs (0-3-7-10-12-15L)', () => {
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 600000,
          hra: 240000,
          specialAllowance: 360000,
        },
        {},
        '2024-25',
      );

      expect(breakdown.grossSalary).toBe(1200000);
      expect(breakdown.netTaxableIncome).toBe(1125000); // 12L - 75k

      // FY 24-25 slabs: 0-3L 0, 3-7L (4L @ 5% = 20k), 7-10L (3L @ 10% = 30k), 10-11.25L (1.25L @ 15% = 18.75k)
      // Tax = 68,750 + 4% cess (2,750) = 71,500
      expect(breakdown.taxBeforeRebate).toBe(68750);
      expect(breakdown.section87ARebate).toBe(0); // In FY 24-25, threshold was 7L
      expect(breakdown.totalAnnualTax).toBe(71500);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Pure Engine: Old Tax Regime & Chapter VI-A Deductions
  // ---------------------------------------------------------------------------
  describe('2. Old Tax Regime Calculations & Exemptions', () => {
    it('applies ₹50,000 standard deduction and Section 87A rebate up to ₹5,00,000 taxable income', () => {
      const breakdown = calculateOldRegimeTax(
        {
          basicSalary: 300000,
          hra: 100000,
          specialAllowance: 100000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(500000);
      expect(breakdown.standardDeduction).toBe(50000);
      expect(breakdown.netTaxableIncome).toBe(450000);

      // Old regime slabs:
      // 0 - 2.5L: 0
      // 2.5L - 4.5L: 2L @ 5% = 10,000
      expect(breakdown.taxBeforeRebate).toBe(10000);
      // Section 87A rebate covers tax up to 12,500
      expect(breakdown.section87ARebate).toBe(10000);
      expect(breakdown.totalAnnualTax).toBe(0);
    });

    it('deducts 80C, 80D, 80CCD(1B), and Section 24(b) home loan interest up to statutory caps', () => {
      const breakdown = calculateOldRegimeTax(
        {
          basicSalary: 600000,
          hra: 240000,
          specialAllowance: 360000,
          employeePf: 72000,
          professionalTax: 2500,
        },
        {
          section80C: 100000, // Employee PF (72k) + 100k = 172k -> capped at 1.5L
          section80DSelf: 30000, // Capped at 25k
          section80DParents: 60000, // Capped at 50k
          section80CCD1B: 70000, // Capped at 50k
          section24bHomeLoanInterest: 250000, // Capped at 2L
        },
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(1200000);
      expect(breakdown.deductionsBreakdown['Standard Deduction (Sec 16ia)']).toBe(50000);
      expect(breakdown.deductionsBreakdown['Professional Tax (Sec 16iii)']).toBe(2500);
      expect(breakdown.deductionsBreakdown['Section 80C (Investments & PF)']).toBe(150000);
      expect(breakdown.deductionsBreakdown['Section 80D (Medical Insurance)']).toBe(75000); // 25k + 50k
      expect(breakdown.deductionsBreakdown['Section 80CCD(1B) (Voluntary NPS)']).toBe(50000);
      expect(breakdown.deductionsBreakdown['Section 24(b) (Home Loan Interest)']).toBe(200000);

      // Total deductions = 50,000 + 2,500 + 150,000 + 75,000 + 50,000 + 200,000 = 527,500
      expect(breakdown.totalExemptionsAndDeductions).toBe(527500);
      expect(breakdown.netTaxableIncome).toBe(1200000 - 527500); // 672,500
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Section 10(13A) HRA Exemption Formula (Least of 3)
  // ---------------------------------------------------------------------------
  describe('3. Section 10(13A) HRA Exemption Formula', () => {
    it('calculates least of 3 conditions correctly in a Metro city (50% Basic limit)', () => {
      // Basic: 50,000/mo = 600,000/yr
      // HRA: 20,000/mo = 240,000/yr
      // Rent: 25,000/mo = 300,000/yr
      // 1. Actual HRA = 240,000
      // 2. Rent - 10% Basic = 300,000 - 60,000 = 240,000
      // 3. 50% Basic (Metro) = 300,000
      // Least = 240,000
      const hra = calculateHraExemption({
        basicSalary: 600000,
        hraReceived: 240000,
        rentPaid: 300000,
        isMetro: true,
      });

      expect(hra.exemptHra).toBe(240000);
      expect(hra.taxableHra).toBe(0);
    });

    it('calculates least of 3 in a Non-Metro city (40% Basic limit)', () => {
      // Basic: 600,000, HRA: 240,000, Rent: 320,000
      // 1. Actual HRA = 240,000
      // 2. Rent - 10% Basic = 320,000 - 60,000 = 260,000
      // 3. 40% Basic (Non-Metro) = 240,000
      // Least = 240,000
      const hra = calculateHraExemption({
        basicSalary: 600000,
        hraReceived: 240000,
        rentPaid: 320000,
        isMetro: false,
      });

      expect(hra.exemptHra).toBe(240000);
    });

    it('returns ₹0 HRA exemption if rent paid is <= 10% of Basic salary', () => {
      const hra = calculateHraExemption({
        basicSalary: 600000,
        hraReceived: 240000,
        rentPaid: 50000, // Rent is less than 60,000 (10% of Basic)
        isMetro: true,
      });

      expect(hra.exemptHra).toBe(0);
      expect(hra.taxableHra).toBe(240000);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Comparison & Recommendation Logic
  // ---------------------------------------------------------------------------
  describe('4. Side-by-Side Comparison & Recommendation Logic', () => {
    it('recommends New Regime when employee has minimal deductions', () => {
      const result = simulateTaxComparison({
        financialYear: '2025-26',
        salary: {
          basicSalary: 600000,
          hra: 240000,
          specialAllowance: 360000,
        },
        declarations: {
          section80C: 20000,
        },
      });

      expect(result.comparison.recommendedRegime).toBe('NEW');
      expect(result.newRegime.totalAnnualTax).toBeLessThan(result.oldRegime.totalAnnualTax);
      expect(result.comparison.annualTaxDifference).toBeGreaterThan(0);
      expect(result.comparison.recommendationSummary).toContain('New Tax Regime saves');
    });

    it('recommends Old Regime when employee has high itemized deductions on higher income', () => {
      const result = simulateTaxComparison({
        financialYear: '2025-26',
        salary: {
          basicSalary: 900000,
          hra: 450000,
          specialAllowance: 450000,
        }, // Gross ₹18,00,000
        declarations: {
          rentPaidAnnual: 360000, // Metro HRA exemption
          isMetro: true,
          section80C: 150000,
          section80DSelf: 25000,
          section80CCD1B: 50000,
          section24bHomeLoanInterest: 200000,
        },
      });

      expect(result.comparison.recommendedRegime).toBe('OLD');
      expect(result.oldRegime.totalAnnualTax).toBeLessThan(result.newRegime.totalAnnualTax);
      expect(result.comparison.recommendationSummary).toContain('Old Tax Regime saves');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. API Endpoints, Auto-Population & Advisory Immutability
  // ---------------------------------------------------------------------------
  describe('5. API Endpoints, Auto-Population & Advisory Immutability', () => {
    it('GET /config returns versioned rules and slabs with AY mapping without hardcoded UI logic', async () => {
      const app = appFor([], {});
      const res = await request(app).get('/api/v1/payroll/tax-simulator/config/2025-26');

      expect(res.status).toBe(200);
      expect(res.body.data.financialYear).toBe('2025-26');
      expect(res.body.data.assessmentYear).toBe('2026-27');
      expect(res.body.data.newRegime.standardDeduction).toBe(75000);
      expect(res.body.data.newRegime.rebate87AThreshold).toBe(1200000);
      expect(res.body.data.newRegime.rebate87AMaxAmount).toBe(60000);
      expect(res.body.data.oldRegime.standardDeduction).toBe(50000);
      expect(res.body.data.cessRate).toBe(0.04);
    });

    it('POST /simulate auto-populates salary and declarations from employee active profile', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-test-1',
            firstName: 'Sunil',
            lastName: 'Sharma',
          }),
        },
        employeeSalaryRevision: {
          findFirst: vi.fn().mockResolvedValue({
            annualCtc: 900000,
            structure: {
              components: [
                { code: 'BASIC', method: 'PERCENT_BASIC', value: 50 },
                { code: 'HRA', method: 'PERCENT_BASIC', value: 40 },
                { code: 'SPECIAL', method: 'PERCENT_BASIC', value: 10 },
              ],
            },
          }),
        },
        taxDeclaration: {
          findFirst: vi.fn().mockResolvedValue({
            declarations: {
              '80C': 100000,
              '80D': 20000,
            },
          }),
        },
      };

      const app = appFor([], prisma, 'EMPLOYEE', 'user-emp-1', 'emp-test-1');
      const res = await request(app)
        .post('/api/v1/payroll/tax-simulator/simulate')
        .send({
          financialYear: '2025-26',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.grossSalary).toBeGreaterThan(0);
      expect(res.body.data.newRegime).toBeDefined();
      expect(res.body.data.oldRegime).toBeDefined();
      expect(res.body.data.comparison.recommendedRegime).toBeDefined();
    });

    it('enforces RBAC: regular employee cannot simulate for another employee ID', async () => {
      const app = appFor([], {}, 'EMPLOYEE', 'user-emp-1', 'emp-test-1');
      const res = await request(app)
        .post('/api/v1/payroll/tax-simulator/simulate')
        .send({
          employeeId: '00000000-0000-4000-8000-000000000099', // Different employee
          financialYear: '2025-26',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows HR / Admin to simulate for any employee in the company', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000099',
            firstName: 'Priya',
            lastName: 'Verma',
          }),
        },
        employeeSalaryRevision: { findFirst: vi.fn().mockResolvedValue(null) },
        taxDeclaration: { findFirst: vi.fn().mockResolvedValue(null) },
      };

      const app = appFor(['payroll.manage'], prisma, 'HR_MANAGER', 'user-hr-1', 'emp-hr-1');
      const res = await request(app)
        .post('/api/v1/payroll/tax-simulator/simulate')
        .send({
          employeeId: '00000000-0000-4000-8000-000000000099',
          financialYear: '2025-26',
          salary: {
            basicSalary: 600000,
            hra: 240000,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.grossSalary).toBe(840000);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Explicit Regime Confirmation & Audit Trail
  // ---------------------------------------------------------------------------
  describe('6. Explicit Regime Confirmation (POST /apply-regime)', () => {
    it('explicitly updates TaxDeclaration regime and records immutable AuditLog entry', async () => {
      const prisma = {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'emp-test-1',
            employeeCode: 'EMP001',
            firstName: 'Sunil',
            lastName: 'Sharma',
          }),
        },
        taxDeclaration: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'decl-uuid-1',
            declarations: {},
          }),
          upsert: vi.fn().mockResolvedValue({
            id: 'decl-uuid-1',
            employeeId: 'emp-test-1',
            regime: 'NEW',
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const app = appFor([], prisma, 'EMPLOYEE', 'user-emp-1', 'emp-test-1');
      const res = await request(app)
        .post('/api/v1/payroll/tax-simulator/apply-regime')
        .send({
          financialYear: '2025-26',
          regime: 'NEW',
          notes: 'Employee opted for New Regime after simulation comparison',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.regime).toBe('NEW');

      // Verify audit trail was recorded
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPLY_TAX_REGIME_DECISION',
          category: 'PAYROLL',
          details: expect.stringContaining('Confirmed and applied NEW Tax Regime'),
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Statutory Audit: Marginal Relief, Surcharges & Historical Reproducibility
  // ---------------------------------------------------------------------------
  describe('5. Statutory Audit: Marginal Relief, Surcharges, 288B Rounding & Historical Reproducibility', () => {
    it('applies Section 87A Marginal Relief under Budget 2025 (AY 2026-27) for income marginally exceeding ₹12,00,000', () => {
      // Gross ₹12,85,000 - ₹75,000 standard deduction = ₹12,10,000 net taxable income
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 600000,
          hra: 300000,
          specialAllowance: 385000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.grossSalary).toBe(1285000);
      expect(breakdown.netTaxableIncome).toBe(1210000);

      // Slabs in AY 2026-27: 0-4L 0, 4-8L 20k, 8-12L 40k, 12-12.1L (10k @ 15% = 1,500) -> 61,500
      expect(breakdown.taxBeforeRebate).toBe(61500);

      // Excess income over ₹12,00,000 = ₹10,000.
      // Proviso to Section 87A: Tax payable before cess cannot exceed excess income (₹10,000).
      // Marginal relief rebate = 61,500 - 10,000 = 51,500
      expect(breakdown.section87ARebate).toBe(51500);
      expect(breakdown.taxAfterRebate).toBe(10000);
      expect(breakdown.cess).toBe(400); // 4% of 10,000
      expect(breakdown.totalAnnualTax).toBe(10400); // 10,000 + 400 cess
    });

    it('calculates 10% surcharge for income of ₹75 Lakhs under New Regime', () => {
      // Annual Basic + allowances = ₹75,75,000 -> net taxable = ₹75,00,000
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 4000000,
          hra: 1575000,
          specialAllowance: 2000000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.netTaxableIncome).toBe(7500000);
      expect(breakdown.surcharge).toBeGreaterThan(0);
      expect(breakdown.totalAnnualTax % 10).toBe(0); // Section 288B multiple of 10
    });

    it('applies Surcharge Marginal Relief at ₹50 Lakhs threshold', () => {
      // Net taxable ₹51,00,000 (Gross ₹51,75,000)
      const breakdown = calculateNewRegimeTax(
        {
          basicSalary: 3000000,
          hra: 1175000,
          specialAllowance: 1000000,
        },
        {},
        '2025-26',
      );

      expect(breakdown.netTaxableIncome).toBe(5100000);
      // Surcharge marginal relief should have kicked in to prevent tax jump > ₹1L
      expect(breakdown.surchargeMarginalRelief).toBeGreaterThan(0);
      expect(breakdown.totalAnnualTax % 10).toBe(0);
    });

    it('enforces 25% surcharge cap on New Regime vs 37% on Old Regime for ultra-high earners (> ₹5 Crore)', () => {
      // Income ₹6 Crore
      const newRegime = calculateNewRegimeTax(
        {
          basicSalary: 35000000,
          hra: 15000000,
          specialAllowance: 10075000,
        },
        {},
        '2025-26',
      );

      const oldRegime = calculateOldRegimeTax(
        {
          basicSalary: 35000000,
          hra: 15000000,
          specialAllowance: 10050000,
        },
        {},
        '2025-26',
      );

      // Verify New Regime surcharge is lower due to the statutory 25% cap vs 37% in Old Regime
      expect(newRegime.surcharge).toBeLessThan(oldRegime.surcharge);
    });

    it('maintains historical reproducibility across FY 2023-24, FY 2024-25, and FY 2025-26', () => {
      // 1. ₹10 Lakhs gross: Demonstrates the Section 87A threshold increase to ₹12L in Budget 2025
      const salary10L = {
        basicSalary: 500000,
        hra: 200000,
        specialAllowance: 300000,
      }; // Gross ₹10,00,000

      const fy23_10L = calculateNewRegimeTax(salary10L, {}, '2023-24');
      const fy25_10L = calculateNewRegimeTax(salary10L, {}, '2025-26');

      // In FY 23-24: Standard deduction was 50k, net taxable = 950k (> 7L threshold) -> tax = 54,600
      expect(fy23_10L.standardDeduction).toBe(50000);
      expect(fy23_10L.netTaxableIncome).toBe(950000);
      expect(fy23_10L.totalAnnualTax).toBe(54600);

      // In FY 25-26 (AY 2026-27): Net taxable is 925k (<= 12L Budget 2025 threshold) -> tax is ₹0
      expect(fy25_10L.standardDeduction).toBe(75000);
      expect(fy25_10L.netTaxableIncome).toBe(925000);
      expect(fy25_10L.totalAnnualTax).toBe(0);

      // 2. ₹15 Lakhs gross: Demonstrates progressive slab evolution (Finance Act 2023 vs 2024 vs 2025)
      const salary15L = {
        basicSalary: 750000,
        hra: 350000,
        specialAllowance: 400000,
      }; // Gross ₹15,00,000

      const fy23_15L = calculateNewRegimeTax(salary15L, {}, '2023-24');
      const fy24_15L = calculateNewRegimeTax(salary15L, {}, '2024-25');
      const fy25_15L = calculateNewRegimeTax(salary15L, {}, '2025-26');

      // FY 23-24: Taxable 14.5L -> tax = 1,45,600
      expect(fy23_15L.totalAnnualTax).toBe(145600);

      // FY 24-25: Taxable 14.25L -> tax = 1,30,000
      expect(fy24_15L.totalAnnualTax).toBe(130000);

      // FY 25-26: Taxable 14.25L -> Budget 2025 slabs (0-4L, 4-8L @ 5%, 8-12L @ 10%, 12-14.25L @ 15%) -> tax = 97,500
      expect(fy25_15L.totalAnnualTax).toBe(97500);

      // Verify continuous statutory tax reduction over historical years
      expect(fy25_15L.totalAnnualTax).toBeLessThan(fy24_15L.totalAnnualTax);
      expect(fy24_15L.totalAnnualTax).toBeLessThan(fy23_15L.totalAnnualTax);
    });
  });
});
