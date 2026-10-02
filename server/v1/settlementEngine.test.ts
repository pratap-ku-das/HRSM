import { describe, expect, it } from 'vitest';
import {
  calculateFinalMonthSalary,
  calculateFullAndFinalSettlement,
  calculateGratuity,
  calculateNoticePeriodShortfall,
  calculateSettlementLeaveEncashment,
} from './settlementEngine.js';

describe('P2.5 Statutory Full & Final (F&F) Settlement Engine', () => {
  describe('Payment of Gratuity Act, 1972 Calculations', () => {
    it('rejects gratuity for employee with less than 5 years of service', () => {
      const res = calculateGratuity({
        dateOfJoining: '2023-01-01',
        lastWorkingDay: '2026-01-01', // 3 years
        lastDrawnBasicSalary: 50000,
      });

      expect(res.isEligible).toBe(false);
      expect(res.completedYears).toBe(3);
      expect(res.payableGratuity).toBe(0);
      expect(res.ineligibilityReason).toContain('5 years of continuous service');
    });

    it('calculates gratuity accurately for exactly 5 years of service', () => {
      const basic = 52000;
      const res = calculateGratuity({
        dateOfJoining: '2021-03-01',
        lastWorkingDay: '2026-03-01', // 5 years
        lastDrawnBasicSalary: basic,
      });

      expect(res.isEligible).toBe(true);
      expect(res.effectiveServiceYears).toBe(5);
      // Formula: (15 * 52000 * 5) / 26 = 15 * 2000 * 5 = 150,000
      expect(res.payableGratuity).toBe(150000);
      expect(res.taxExemptGratuity).toBe(150000);
      expect(res.taxableGratuity).toBe(0);
    });

    it('rounds up service years if remaining service exceeds 6 months (> 180 days)', () => {
      // 5 years and 7 months
      const res = calculateGratuity({
        dateOfJoining: '2020-01-01',
        lastWorkingDay: '2025-08-15', // 5 years 7 months 14 days
        lastDrawnBasicSalary: 65000,
      });

      expect(res.isEligible).toBe(true);
      expect(res.completedYears).toBe(5);
      expect(res.remainingMonths).toBe(7);
      expect(res.effectiveServiceYears).toBe(6); // Rounded up to 6!
      // (15 * 65000 * 6) / 26 = (15 * 2500 * 6) = 225,000
      expect(res.payableGratuity).toBe(225000);
    });

    it('does not round up service years if remaining service is 6 months or less', () => {
      // 5 years and 3 months
      const res = calculateGratuity({
        dateOfJoining: '2020-01-01',
        lastWorkingDay: '2025-04-01', // 5 years 3 months
        lastDrawnBasicSalary: 52000,
      });

      expect(res.isEligible).toBe(true);
      expect(res.completedYears).toBe(5);
      expect(res.remainingMonths).toBe(3);
      expect(res.effectiveServiceYears).toBe(5); // Not rounded up
      expect(res.payableGratuity).toBe(150000);
    });

    it('waives 5-year requirement in case of death or permanent disablement', () => {
      const res = calculateGratuity({
        dateOfJoining: '2024-01-01',
        lastWorkingDay: '2026-01-01', // only 2 years
        lastDrawnBasicSalary: 52000,
        isDeathOrDisability: true,
      });

      expect(res.isEligible).toBe(true);
      expect(res.effectiveServiceYears).toBe(2);
      // (15 * 52000 * 2) / 26 = 60,000
      expect(res.payableGratuity).toBe(60000);
    });

    it('caps gratuity at the statutory ceiling of ₹20,00,000', () => {
      // High earner: Basic 4,00,000 / month, 30 years service
      // Raw: (15 * 400000 * 30) / 26 = 69,23,076.92
      const res = calculateGratuity({
        dateOfJoining: '1996-01-01',
        lastWorkingDay: '2026-01-01', // 30 years
        lastDrawnBasicSalary: 400000,
      });

      expect(res.isEligible).toBe(true);
      expect(res.rawGratuity).toBeGreaterThan(2000000);
      expect(res.payableGratuity).toBe(2000000); // Capped at ₹20 Lakhs!
      expect(res.taxExemptGratuity).toBe(2000000);
      expect(res.taxableGratuity).toBe(0);
    });

    it('throws error if dates are invalid or LWD is before DOJ', () => {
      expect(() =>
        calculateGratuity({
          dateOfJoining: '2026-01-01',
          lastWorkingDay: '2025-01-01',
          lastDrawnBasicSalary: 50000,
        })
      ).toThrow('Last working day cannot be prior to Date of Joining.');
    });
  });

  describe('Leave Encashment & Section 10(10AA) Exemption', () => {
    it('calculates leave encashment using monthly basic / 30 day divisor', () => {
      const res = calculateSettlementLeaveEncashment({
        monthlyBasicSalary: 45000,
        encashableDays: 20,
      });

      expect(res.divisor).toBe(30);
      expect(res.dailyRate).toBe(1500);
      expect(res.grossAmount).toBe(30000);
      expect(res.taxExemptAmount).toBe(30000);
      expect(res.taxableAmount).toBe(0);
    });

    it('caps tax exemption at ₹25,00,000 under revised Section 10(10AA)', () => {
      // Very high encashment: ₹30 Lakhs
      const res = calculateSettlementLeaveEncashment({
        monthlyBasicSalary: 300000,
        encashableDays: 300,
      });

      expect(res.grossAmount).toBe(3000000);
      expect(res.statutoryExemptionLimit).toBe(2500000);
      expect(res.taxExemptAmount).toBe(2500000);
      expect(res.taxableAmount).toBe(500000); // 5L is taxable
    });
  });

  describe('Notice Period Shortfall Recovery', () => {
    it('calculates notice shortfall recovery when served days are less than contractual', () => {
      const res = calculateNoticePeriodShortfall({
        monthlyGrossSalary: 90000,
        contractualNoticeDays: 60,
        noticeServedDays: 15,
      });

      expect(res.shortfallDays).toBe(45);
      expect(res.dailyRate).toBe(3000); // 90000 / 30
      expect(res.recoveryAmount).toBe(135000); // 45 * 3000
    });

    it('returns zero recovery when notice is fully served or exceeded', () => {
      const res = calculateNoticePeriodShortfall({
        monthlyGrossSalary: 90000,
        contractualNoticeDays: 30,
        noticeServedDays: 35,
      });

      expect(res.shortfallDays).toBe(0);
      expect(res.recoveryAmount).toBe(0);
    });
  });

  describe('Final Month Salary & Loss of Pay', () => {
    it('pro-rates monthly salary for exit month working days', () => {
      const res = calculateFinalMonthSalary({
        monthlyGrossSalary: 60000,
        monthlyBasicSalary: 30000,
        monthDays: 30,
        payableDays: 15,
        unpaidLopDays: 0,
      });

      expect(res.dailyRate).toBe(2000);
      expect(res.unpaidSalary).toBe(30000);
      expect(res.lopDeduction).toBe(0);
    });

    it('calculates loss-of-pay deductions for unexcused absences', () => {
      const res = calculateFinalMonthSalary({
        monthlyGrossSalary: 60000,
        monthlyBasicSalary: 30000,
        monthDays: 30,
        payableDays: 12,
        unpaidLopDays: 3,
      });

      expect(res.unpaidSalary).toBe(24000);
      expect(res.lopDeduction).toBe(6000);
    });
  });

  describe('Full & Final Settlement Synthesis', () => {
    it('computes master settlement with all additions, deductions, loan and asset recovery', () => {
      const res = calculateFullAndFinalSettlement({
        employeeId: 'emp-101',
        dateOfJoining: '2019-01-01',
        lastWorkingDay: '2025-01-01', // 6 years
        monthlyBasicSalary: 52000,
        monthlyGrossSalary: 100000,
        encashableLeaveDays: 15,
        contractualNoticeDays: 30,
        noticeServedDays: 30, // 0 shortfall
        finalMonthDays: 30,
        finalMonthPayableDays: 20, // 20 days salary
        bonus: 25000,
        loanOutstanding: 15000,
        unreturnedAssetDeduction: 5000, // damaged charger/hardware
        customTaxDeduction: 12000,
      });

      // Gratuity: (15 * 52000 * 6) / 26 = 180,000
      expect(res.gratuity.payableGratuity).toBe(180000);

      // Leave Encashment: daily rate 1733.33 * 15 = 25,999.95
      expect(res.leaveEncashment.grossAmount).toBe(25999.95);

      // Unpaid salary: daily rate 3333.33 * 20 = 66,666.6
      expect(res.finalMonthSalary.unpaidSalary).toBe(66666.6);

      // Total Gross: 66,666.6 + 25,999.95 + 180,000 + 25,000 = 297,666.55
      expect(res.additions.totalGrossEarnings).toBe(297666.55);

      // Total Deductions: Notice (0) + Loan (15,000) + Asset (5,000) + Tax (12,000) = 32,000
      expect(res.deductions.totalDeductions).toBe(32000);

      // Net: 297,666.55 - 32,000 = 265,666.55
      expect(res.netSettlement).toBe(265666.55);

      expect(res.calculationTrace.length).toBeGreaterThan(10);
    });

    it('ensures net settlement does not fall below zero if deductions exceed earnings', () => {
      const res = calculateFullAndFinalSettlement({
        employeeId: 'emp-102',
        dateOfJoining: '2024-01-01',
        lastWorkingDay: '2024-06-01', // not eligible for gratuity
        monthlyBasicSalary: 20000,
        monthlyGrossSalary: 30000,
        encashableLeaveDays: 0,
        contractualNoticeDays: 90,
        noticeServedDays: 0, // 90 days shortfall = 90,000
        finalMonthDays: 30,
        finalMonthPayableDays: 5, // 5000 salary
        loanOutstanding: 50000,
      });

      expect(res.additions.totalGrossEarnings).toBe(5000);
      expect(res.deductions.totalDeductions).toBe(140000); // 90k notice + 50k loan
      expect(res.netSettlement).toBe(0); // Clamped at 0
    });
  });
});
