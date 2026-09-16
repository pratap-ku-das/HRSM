import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createWorkflowRouter } from './workflows.js';

const appFor = (permissions: string[], prisma: unknown) => { const app = express(); app.use(express.json()); const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => { Object.assign(req, { auth: { id: 'user-a', companyId: 'tenant-a', role: 'EMPLOYEE', employeeId: 'employee-a', permissions }, requestId: 'test' }); next(); }; app.use('/api/v1', createWorkflowRouter(prisma as never, authenticate)); app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: { code: 'VALIDATION_ERROR' } })); return app; };

describe('workflow engine', () => {
  it('denies definition management without workflow.manage', async () => { const response = await request(appFor([], {})).post('/api/v1/workflows/definitions').send({}); expect(response.status).toBe(403); expect(response.body.error.code).toBe('FORBIDDEN'); });
  it('always tenant- and requester-scopes My Requests', async () => { const findMany = vi.fn().mockResolvedValue([]); const response = await request(appFor([], { workflowInstance: { findMany } })).get('/api/v1/workflows/my-requests'); expect(response.status).toBe(200); expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'tenant-a', requesterUserId: 'user-a' } })); });
  it('rejects a delegate from another tenant', async () => { const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null) } }; const response = await request(appFor(['workflow.review'], prisma)).post('/api/v1/workflows/delegations').send({ delegateUserId: '00000000-0000-4000-8000-000000000099', startsAt: '2026-09-14T00:00:00Z', endsAt: '2026-09-15T00:00:00Z' }); expect(response.status).toBe(400); expect(response.body.error.code).toBe('DELEGATE_INVALID'); });
});
