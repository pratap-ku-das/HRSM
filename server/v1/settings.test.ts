import { describe, expect, it } from 'vitest';
import { workspaceSettingsSchema } from './settings.js';

const valid = {
  companyName: 'OrbitHR', legalEntityName: 'OrbitHR Private Limited', taxRegistrationNumber: '',
  currency: 'INR', currencySymbol: '₹', timezone: 'Asia/Kolkata', workDays: [1, 2, 3, 4, 5],
  businessHoursStart: '09:30', businessHoursEnd: '18:30', enableAutomaticOvertime: true,
  enableAuditLogging: true, defaultProbationPeriodMonths: 3,
};

describe('workspaceSettingsSchema', () => {
  it('accepts a valid governed workspace policy', () => expect(workspaceSettingsSchema.parse(valid)).toMatchObject(valid));
  it('rejects an empty work week', () => expect(() => workspaceSettingsSchema.parse({ ...valid, workDays: [] })).toThrow());
  it('rejects business hours ending before they start', () => expect(() => workspaceSettingsSchema.parse({ ...valid, businessHoursEnd: '08:30' })).toThrow());
});
