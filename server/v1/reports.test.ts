import { describe, expect, it } from 'vitest';
import { renderReport, reportDefinitions } from './reports.js';

describe('governed reports', () => {
  it('covers every report explicitly named in the master specification', () => {
    const expected = ['WORKFORCE_HEADCOUNT','WORKFORCE_ATTRITION','WORKFORCE_NEW_HIRES','WORKFORCE_EXITS','WORKFORCE_DEPARTMENTS','WORKFORCE_DEMOGRAPHICS','WORKFORCE_EMPLOYMENT_TYPES','ATTENDANCE_SUMMARY','ATTENDANCE_LATE','ATTENDANCE_ABSENCE','ATTENDANCE_OVERTIME','ATTENDANCE_SHIFTS','LEAVE_UTILIZATION','LEAVE_DEPARTMENTS','LEAVE_TRENDS','LEAVE_BALANCES','PAYROLL_SUMMARY','PAYROLL_DEPARTMENT_COST','PAYROLL_EMPLOYER_CONTRIBUTION','PAYROLL_TAX','PAYROLL_PF','PAYROLL_ESI','PAYROLL_TREND','RECRUITMENT_FUNNEL','RECRUITMENT_TIME_TO_HIRE','RECRUITMENT_SOURCE_EFFECTIVENESS','RECRUITMENT_OPEN_POSITIONS','PERFORMANCE_GOALS','PERFORMANCE_DISTRIBUTION','PERFORMANCE_DEPARTMENTS'];
    expect(reportDefinitions.map(item => item[0])).toEqual(expected);
  });
  it.each(['CSV','XLSX','PDF'] as const)('renders real %s bytes', format => {
    const output = renderReport([{name:'A & B',count:2}],format);
    expect(output.bytes.length).toBeGreaterThan(20);
    expect(output.extension.toUpperCase()).toBe(format);
  });
});
