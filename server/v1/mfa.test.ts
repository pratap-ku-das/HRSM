import { beforeEach, describe, expect, it } from 'vitest';
import { decryptMfaSecret, encryptMfaSecret, newMfaSecret } from './mfa.js';
describe('MFA secret protection',()=>{beforeEach(()=>{process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64')});it('encrypts secrets with authenticated encryption',()=>{const secret=newMfaSecret(),encrypted=encryptMfaSecret(secret);expect(encrypted).not.toContain(secret);expect(decryptMfaSecret(encrypted)).toBe(secret)});it('generates base32 authenticator secrets',()=>expect(newMfaSecret()).toMatch(/^[A-Z2-7]{32}$/))});
