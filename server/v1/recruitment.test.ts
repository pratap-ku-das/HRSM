import { describe, expect, it } from 'vitest';
import { reportDefinitions } from './reports.js';

describe('recruitment analytics coverage', () => {
  it('includes funnel, time-to-hire, source effectiveness, and open positions', () => {
    const keys = new Set(reportDefinitions.map(item => item[0]));
    for (const key of ['RECRUITMENT_FUNNEL', 'RECRUITMENT_TIME_TO_HIRE', 'RECRUITMENT_SOURCE_EFFECTIVENESS', 'RECRUITMENT_OPEN_POSITIONS']) expect(keys.has(key)).toBe(true);
  });
});
