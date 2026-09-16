import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createFoundationRouter } from './foundation.js';

const appFor = (permissions: string[], prisma: unknown) => {
  const app = express(); app.use(express.json());
  const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => { Object.assign(req, { auth: { id: '00000000-0000-4000-8000-000000000001', companyId: 'tenant-a', role: 'COMPANY_ADMIN', permissions }, requestId: 'test' }); next(); };
  app.use('/api/v1', createFoundationRouter(prisma as never, authenticate));
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: { code: 'VALIDATION_ERROR' } }));
  return app;
};

describe('organization and RBAC foundation', () => {
  it('denies organization mutation without organization.manage', async () => {
    const response = await request(appFor(['organization.read'], {})).post('/api/v1/organization/branches').send({ name: 'HQ', code: 'HQ' });
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('FORBIDDEN');
  });
  it('rejects a location linked to a branch in another tenant', async () => {
    const prisma = { branch: { findFirst: vi.fn().mockResolvedValue(null) } };
    const response = await request(appFor(['organization.manage'], prisma)).post('/api/v1/organization/locations').send({ name: 'Bengaluru', code: 'BLR', branchId: '00000000-0000-4000-8000-000000000099' });
    expect(response.status).toBe(400); expect(response.body.error.code).toBe('BRANCH_INVALID');
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({ where: { id: '00000000-0000-4000-8000-000000000099', companyId: 'tenant-a' } });
  });
  it('rejects grants when the user or role belongs to another tenant', async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null) }, accessRole: { findFirst: vi.fn().mockResolvedValue(null) } };
    const response = await request(appFor(['rbac.manage'], prisma)).post('/api/v1/rbac/grants').send({ userId: '00000000-0000-4000-8000-000000000010', roleId: '00000000-0000-4000-8000-000000000020', scope: 'ALL_COMPANY' });
    expect(response.status).toBe(400); expect(response.body.error.code).toBe('GRANT_PRINCIPAL_INVALID');
  });
});
