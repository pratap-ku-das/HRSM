import { describe, expect, it } from 'vitest';
import { createOpaqueToken, createTemporaryPassword, onboardingEmail } from './email.js';

describe('onboarding email', () => {
  it('contains activation, Android download, fallback, expiry and escaped employee data', () => {
    const message = onboardingEmail({ employeeName: '<Admin>', companyName: 'Orbit & Co', email: 'person@example.com', temporaryPassword: 'Temp!Pass123', activationUrl: 'https://web.test/activate?t=secret', androidUrl: 'https://download.test/app', supportEmail: 'hr@example.com', expiresHours: 24 });
    expect(message.html).toContain('&lt;Admin&gt;');
    expect(message.html).toContain('Activate Your Account');
    expect(message.html).toContain('Download OrbitHR Android App');
    expect(message.text).toContain('https://download.test/app');
    expect(message.text).toContain('expires in 24 hours');
    expect(message.text).toContain('Username: person@example.com');
    expect(message.text).toContain('Temporary password: Temp!Pass123');
  });
  it('creates only a hash for persistence', () => {
    const first = createOpaqueToken(); const second = createOpaqueToken();
    expect(first.token).not.toBe(first.hash); expect(first.hash).toHaveLength(64); expect(first.token).not.toBe(second.token);
  });
  it('creates a strong random temporary password', () => {
    const first = createTemporaryPassword(); const second = createTemporaryPassword();
    expect(first).toHaveLength(16); expect(first).not.toBe(second);
  });
});
