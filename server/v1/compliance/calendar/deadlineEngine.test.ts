import { describe, it, expect } from 'vitest';
import {
  calculateLegalDueDate,
  resolveEffectiveDueDate,
  formatPeriodKey,
  resolveAllApplicableObligationsForMonth,
  STATUTORY_DEADLINE_DEFINITIONS,
  getDeadlineDefinition,
} from './deadlineEngine.js';

const toIso = (d: Date) => d.toISOString().slice(0, 10);

describe('P2.10 Compliance Calendar - Statutory Deadline Engine', () => {
  describe('EPF / ECR 2.0 Deadlines', () => {
    it('calculates EPF monthly contribution/ECR due date on 15th of following month', () => {
      const epfRule = STATUTORY_DEADLINE_DEFINITIONS.find(r => r.domain === 'EPF_ECR')!;
      expect(epfRule).toBeDefined();

      const dueDateSep2026 = calculateLegalDueDate(epfRule, 2026, 9);
      expect(toIso(dueDateSep2026)).toBe('2026-10-15');

      const dueDateDec2026 = calculateLegalDueDate(epfRule, 2026, 12);
      expect(toIso(dueDateDec2026)).toBe('2027-01-15');

      const dueDateFeb2026 = calculateLegalDueDate(epfRule, 2026, 2);
      expect(toIso(dueDateFeb2026)).toBe('2026-03-15');
    });
  });

  describe('ESIC Monthly Deadlines', () => {
    it('calculates ESIC monthly contribution due date on 15th of following month', () => {
      const esicRule = STATUTORY_DEADLINE_DEFINITIONS.find(r => r.domain === 'ESIC_MONTHLY')!;
      expect(esicRule).toBeDefined();

      const dueDateSep2026 = calculateLegalDueDate(esicRule, 2026, 9);
      expect(toIso(dueDateSep2026)).toBe('2026-10-15');

      const dueDateMar2026 = calculateLegalDueDate(esicRule, 2026, 3);
      expect(toIso(dueDateMar2026)).toBe('2026-04-15');
    });
  });

  describe('TDS Deadlines (Monthly Deposit & Quarterly Statements)', () => {
    it('calculates TDS monthly deposit due date on 7th of following month (Apr-Feb)', () => {
      const tdsMonthlyRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'TDS_24Q' && r.obligationType === 'MONTHLY_TDS_DEPOSIT'
      )!;
      expect(tdsMonthlyRule).toBeDefined();

      const dueSep = calculateLegalDueDate(tdsMonthlyRule, 2026, 9);
      expect(toIso(dueSep)).toBe('2026-10-07');

      const dueDec = calculateLegalDueDate(tdsMonthlyRule, 2026, 12);
      expect(toIso(dueDec)).toBe('2027-01-07');
    });

    it('calculates TDS monthly deposit due date on April 30 for March salary deductions', () => {
      const tdsMonthlyRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'TDS_24Q' && r.obligationType === 'MONTHLY_TDS_DEPOSIT'
      )!;

      const dueMar = calculateLegalDueDate(tdsMonthlyRule, 2026, 3);
      expect(toIso(dueMar)).toBe('2026-04-30');
    });

    it('calculates TDS Form 24Q quarterly statement deadlines correctly for all 4 quarters', () => {
      const qRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'TDS_24Q' && r.obligationType === 'QUARTERLY_STATEMENT_24Q'
      )!;
      expect(qRule).toBeDefined();

      // Q1: Apr-Jun -> July 31
      expect(toIso(calculateLegalDueDate(qRule, 2026, undefined, 'Q1'))).toBe('2026-07-31');

      // Q2: Jul-Sep -> Oct 31
      expect(toIso(calculateLegalDueDate(qRule, 2026, undefined, 'Q2'))).toBe('2026-10-31');

      // Q3: Oct-Dec -> Jan 31 of following calendar year
      expect(toIso(calculateLegalDueDate(qRule, 2026, undefined, 'Q3'))).toBe('2027-01-31');

      // Q4: Jan-Mar -> May 31
      expect(toIso(calculateLegalDueDate(qRule, 2027, undefined, 'Q4'))).toBe('2027-05-31');
    });
  });

  describe('Multi-State Professional Tax Deadlines (KA, MH, TS, WB)', () => {
    it('calculates Karnataka PT Form 5 due date on 20th of following month', () => {
      const kaRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'PROFESSIONAL_TAX' && r.jurisdiction === 'KA'
      )!;
      expect(kaRule).toBeDefined();

      expect(toIso(calculateLegalDueDate(kaRule, 2026, 9))).toBe('2026-10-20');
      expect(toIso(calculateLegalDueDate(kaRule, 2026, 12))).toBe('2027-01-20');
    });

    it('calculates Maharashtra PT Form III-B due date on last day of the wage month', () => {
      const mhRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'PROFESSIONAL_TAX' && r.jurisdiction === 'MH'
      )!;
      expect(mhRule).toBeDefined();

      // For wages paid in September (succeeding month is October, which has 31 days)
      expect(toIso(calculateLegalDueDate(mhRule, 2026, 9))).toBe('2026-10-31');
      // For wages in January (succeeding month is February 2026: 28 days)
      expect(toIso(calculateLegalDueDate(mhRule, 2026, 1))).toBe('2026-02-28');
      // For wages in January leap year 2024 (succeeding month is February 2024: 29 days)
      expect(toIso(calculateLegalDueDate(mhRule, 2024, 1))).toBe('2024-02-29');
    });

    it('calculates Telangana PT Form II due date on 10th of following month', () => {
      const tsRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'PROFESSIONAL_TAX' && r.jurisdiction === 'TS'
      )!;
      expect(tsRule).toBeDefined();

      expect(toIso(calculateLegalDueDate(tsRule, 2026, 9))).toBe('2026-10-10');
      expect(toIso(calculateLegalDueDate(tsRule, 2026, 12))).toBe('2027-01-10');
    });

    it('calculates West Bengal PT Form IX / challan due date on 21st of following month', () => {
      const wbRule = STATUTORY_DEADLINE_DEFINITIONS.find(
        r => r.domain === 'PROFESSIONAL_TAX' && r.jurisdiction === 'WB'
      )!;
      expect(wbRule).toBeDefined();

      expect(toIso(calculateLegalDueDate(wbRule, 2026, 9))).toBe('2026-10-21');
      expect(toIso(calculateLegalDueDate(wbRule, 2026, 12))).toBe('2027-01-21');
    });
  });

  describe('Official Extensions and Determinism', () => {
    it('uses officially extended due date when present without mutating legal due date', () => {
      const statutoryDate = new Date('2026-10-15T00:00:00.000Z');
      const extendedDate = new Date('2026-10-25T00:00:00.000Z');

      const effectiveWithoutExtension = resolveEffectiveDueDate(statutoryDate, null);
      expect(effectiveWithoutExtension).toEqual(statutoryDate);

      const effectiveWithExtension = resolveEffectiveDueDate(statutoryDate, extendedDate);
      expect(effectiveWithExtension).toEqual(extendedDate);
    });

    it('formats period key deterministically', () => {
      expect(formatPeriodKey(2026, 9)).toBe('2026-09');
      expect(formatPeriodKey(2026, 9, 'Q2')).toBe('2026-09 (Q2)');
      expect(formatPeriodKey(2026, undefined, 'Q2')).toBe('2026-Q2');
    });

    it('resolves all applicable obligations for a wage month with registered PT states', () => {
      const applicable = resolveAllApplicableObligationsForMonth(2026, 9, [
        'KARNATAKA',
        'MAHARASHTRA',
      ]);

      // Should include EPF, ESIC, TDS Monthly, TDS Quarterly (Q2 ending in Sep), PT KA, PT MH
      const domains = applicable.map(a => a.definition.domain);
      expect(domains).toContain('EPF_ECR');
      expect(domains).toContain('ESIC_MONTHLY');
      expect(domains).toContain('TDS_24Q');
      expect(domains).toContain('PROFESSIONAL_TAX');

      const ptJurisdictions = applicable
        .filter(a => a.definition.domain === 'PROFESSIONAL_TAX')
        .map(a => a.jurisdiction);
      expect(ptJurisdictions).toEqual(['KA', 'MH']);
      expect(ptJurisdictions).not.toContain('TS');
      expect(ptJurisdictions).not.toContain('WB');

      // Check due dates computed
      const epf = applicable.find(a => a.definition.domain === 'EPF_ECR')!;
      expect(toIso(epf.statutoryDueDate)).toBe('2026-10-15');

      const kaPt = applicable.find(
        a => a.definition.domain === 'PROFESSIONAL_TAX' && a.jurisdiction === 'KA'
      )!;
      expect(toIso(kaPt.statutoryDueDate)).toBe('2026-10-20');
    });
  });
});
