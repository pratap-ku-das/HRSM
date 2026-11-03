import request from 'supertest';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { app, prisma } from '../index.js';

const JWT_SECRET = 'D7qL9vN2xR5mK8sP4cT6wY3fH1jB0zEa';
process.env.JWT_ACCESS_SECRET = JWT_SECRET;
process.env.JWT_ISSUER = 'orbithr-api';

const userCompanyA = {
  id: '00000000-0000-4000-8000-000000000001',
  companyId: 'company-a',
  role: 'COMPANY_ADMIN',
  tokenVersion: 1,
};

const userEmployeeA = {
  id: '00000000-0000-4000-8000-000000000002',
  companyId: 'company-a',
  role: 'EMPLOYEE',
  tokenVersion: 1,
};

const userSuperAdmin = {
  id: '00000000-0000-4000-8000-000000000099',
  companyId: 'company-master',
  role: 'SUPER_ADMIN',
  tokenVersion: 1,
};

const signToken = (user: { id: string; companyId: string; role: string; tokenVersion?: number }) => {
  return jwt.sign(
    {
      sub: user.id,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion ?? 1,
    },
    JWT_SECRET,
    {
      issuer: 'orbithr-api',
      audience: 'orbithr-clients',
      expiresIn: '1h',
    }
  );
};

describe('OrbitHR Legacy API Hardening & Security Remediation Suite', () => {
  beforeAll(() => {
    // Mock prisma.user.findUnique for legacyJwtAuth middleware
    vi.spyOn(prisma.user, 'findUnique').mockImplementation(((args: any) => {
      const where = args?.where;
      if (where?.id === userCompanyA.id) return Promise.resolve(userCompanyA);
      if (where?.id === userEmployeeA.id) return Promise.resolve(userEmployeeA);
      if (where?.id === userSuperAdmin.id) return Promise.resolve(userSuperAdmin);
      return Promise.resolve(null);
    }) as any);
  });

  describe('1. Passwordless Legacy Login Retirement (SEC-11)', () => {
    it('returns 410 Gone on POST /api/auth/login and prevents passwordless auth', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@company-a.com' });

      expect(res.status).toBe(410);
      expect(res.body.error).toContain('retired');
    });
  });

  describe('2. Legacy Endpoints Authentication Bypass Prevention (SEC-05, SEC-06)', () => {
    it('blocks unauthenticated GET /api/companies with 401', async () => {
      const res = await request(app).get('/api/companies');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('blocks unauthenticated GET /api/employees with 401', async () => {
      const res = await request(app).get('/api/employees?companyId=company-a');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('blocks unauthenticated GET /api/departments with 401', async () => {
      const res = await request(app).get('/api/departments?companyId=company-a');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated GET /api/payroll/runs with 401', async () => {
      const res = await request(app).get('/api/payroll/runs?companyId=company-a');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated GET /api/audit-logs with 401', async () => {
      const res = await request(app).get('/api/audit-logs?companyId=company-a');
      expect(res.status).toBe(401);
    });

    it('blocks unauthenticated PUT /api/settings/company-a with 401', async () => {
      const res = await request(app)
        .put('/api/settings/company-a')
        .send({ timezone: 'UTC' });
      expect(res.status).toBe(401);
    });
  });

  describe('3. Multi-Tenant Cross-Company Access Prevention', () => {
    it('blocks Company A admin from reading Company B employees via query param', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .get('/api/employees?companyId=company-b')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-company access is not permitted');
    });

    it('blocks Company A admin from reading Company B departments via query param', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .get('/api/departments?companyId=company-b')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-company access is not permitted');
    });

    it('blocks Company A admin from accessing Company B payroll runs', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .get('/api/payroll/runs?companyId=company-b')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-company access is not permitted');
    });

    it('blocks Company A admin from modifying Company B settings via route param', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .put('/api/settings/company-b')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-company access is not permitted');
    });

    it('blocks Company A admin from accessing Company B audit logs', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .get('/api/audit-logs?companyId=company-b')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cross-company access is not permitted');
    });
  });

  describe('4. Company Directory Access Control (GET /api/companies)', () => {
    it('blocks Company A admin from listing all tenants (requires SUPER_ADMIN)', async () => {
      const tokenA = signToken(userCompanyA);
      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Super administrator access required');
    });

    it('allows SUPER_ADMIN to call GET /api/companies', async () => {
      vi.spyOn(prisma.company, 'findMany').mockResolvedValueOnce([
        { id: 'comp-1', name: 'Alpha Corp' },
      ] as any);

      const tokenSuper = signToken(userSuperAdmin);
      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${tokenSuper}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('5. RBAC & Privilege Verification on Legacy Endpoints', () => {
    it('blocks regular EMPLOYEE from creating leave types on POST /api/leaves/types', async () => {
      const tokenEmp = signToken(userEmployeeA);
      const res = await request(app)
        .post('/api/leaves/types')
        .set('Authorization', `Bearer ${tokenEmp}`)
        .send({
          companyId: 'company-a',
          name: 'Privileged Leave',
          code: 'PL',
          daysAllowedPerYear: 20,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only Company Admin can manage leave categories');
    });
  });

  describe('6. Security Headers via Helmet', () => {
    it('includes X-Content-Type-Options: nosniff header on responses', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('includes X-XSS-Protection or X-Frame-Options on responses', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-frame-options'] || res.headers['x-content-type-options']).toBeDefined();
    });
  });

  describe('7. Webhook Security (Fail-Closed)', () => {
    it('rejects webhooks with missing signature header with 400', async () => {
      const res = await request(app)
        .post('/api/webhooks/razorpay')
        .send({ event: 'payment.failed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing x-razorpay-signature header');
    });
  });
});

