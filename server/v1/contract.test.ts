import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('v1 contract', () => {
  const contract = fs.readFileSync('openapi/orbithr-v1.yaml', 'utf8');
  it.each(['/auth/login:', '/auth/refresh:', '/me:', '/me/face/challenge:', '/me/face/verify:', '/me/attendance/punch:', '/employees/onboard:', '/employees/{id}/face-enrollment:'])('documents %s', path => expect(contract).toContain(path));
  it('requires bearer auth by default and idempotency for onboarding', () => { expect(contract).toContain('bearerAuth: []'); expect(contract).toContain('Idempotency-Key'); });
  it('requires a single-use server face token for attendance', () => { expect(contract).toContain('faceVerificationToken'); expect(contract).not.toContain('biometricVerified'); });
});
