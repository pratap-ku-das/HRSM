import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSelfServiceRouter } from './selfService.js';

describe('Employee Assets Self Service API', () => {
  const companyId = 'company-tenant-100';
  const employeeId = 'emp-self-100';
  const otherEmployeeId = 'emp-other-200';

  const mockAsset = {
    id: 'asset-mac-01',
    companyId,
    name: 'MacBook Pro M3',
    category: 'LAPTOP',
    serialNumber: 'C02G1234MD6R',
    assignedToEmployeeId: employeeId,
    assignedDate: new Date('2026-01-15'),
    purchaseDate: new Date('2026-01-10'),
    status: 'ASSIGNED',
    condition: 'NEW',
  };

  const prismaMock = {
    asset: {
      findMany: vi.fn(async ({ where }) => {
        if (where.companyId === companyId && where.assignedToEmployeeId === employeeId) {
          return [mockAsset];
        }
        return [];
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (where.id === mockAsset.id && where.companyId === companyId && where.assignedToEmployeeId === employeeId) {
          return mockAsset;
        }
        return null;
      }),
    },
    employeeServiceRequest: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: 'req-new-001', ...data, createdAt: new Date() })),
      update: vi.fn(async ({ data }) => ({ id: 'req-new-001', ...data })),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => ({ id: 'audit-001', ...data })),
    },
    workflowDefinition: {
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
  };

  const app = express();
  app.use(express.json());
  const authenticate = (req: any, _res: any, next: any) => {
    req.auth = {
      id: 'usr-employee-1',
      companyId,
      employeeId,
      role: 'EMPLOYEE',
      permissions: ['employee.read.self'],
    };
    next();
  };
  app.use('/api/v1', createSelfServiceRouter(prismaMock as any, authenticate));
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('EXPRESS ERROR:', err);
    res.status(err.status || 500).json({ error: { message: err.message, stack: err.stack } });
  });

  it('lists employee assigned assets and acknowledgement status', async () => {
    const res = await request(app).get('/api/v1/me/assets');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('MacBook Pro M3');
    expect(res.body.data[0].serialNumber).toBe('C02G1234MD6R');
    expect(res.body.data[0].isAcknowledged).toBe(false);
  });

  it('acknowledges receipt of an asset with audit record', async () => {
    const res = await request(app)
      .post('/api/v1/me/assets/asset-mac-01/acknowledge')
      .send({ notes: 'Received in sealed box with charger', deviceInfo: 'Pixel 8 Android 15' });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.assetId).toBe('asset-mac-01');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ACKNOWLEDGE_ASSET',
          companyId,
        }),
      })
    );
  });

  it('submits return request for an asset with reason', async () => {
    const res = await request(app)
      .post('/api/v1/me/assets/asset-mac-01/return-request')
      .send({ reason: 'Project completed, returning company equipment', condition: 'GOOD' });

    expect(res.status).toBe(201);
    expect(res.body.data.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REQUEST_ASSET_RETURN',
          companyId,
        }),
      })
    );
  });

  it('submits issue / damage report for an asset', async () => {
    const res = await request(app)
      .post('/api/v1/me/assets/asset-mac-01/report-issue')
      .send({ issueDescription: 'Keyboard spacebar is unresponsive', severity: 'HIGH' });

    expect(res.status).toBe(201);
    expect(res.body.data.success).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REPORT_ASSET_ISSUE',
          companyId,
        }),
      })
    );
  });

  it('enforces tenant and employee isolation: prevents operating on other employee asset', async () => {
    const res = await request(app)
      .post('/api/v1/me/assets/asset-unknown-999/acknowledge')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSET_NOT_FOUND');
  });
});
