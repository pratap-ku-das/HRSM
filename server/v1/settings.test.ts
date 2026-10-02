import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { workspaceSettingsSchema, createSettingsRouter } from './settings.js';

const valid = {
  companyName: 'OrbitHR', legalEntityName: 'OrbitHR Private Limited', taxRegistrationNumber: '',
  currency: 'INR', currencySymbol: '₹', timezone: 'Asia/Kolkata', workDays: [1, 2, 3, 4, 5],
  businessHoursStart: '09:30', businessHoursEnd: '18:30', enableAutomaticOvertime: true,
  enableAuditLogging: true, defaultProbationPeriodMonths: 3,
};

const appFor = (permissions: string[], role = 'COMPANY_ADMIN', prisma: unknown = {}) => {
  const app = express();
  app.use(express.json());
  const auth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { auth: { id: 'admin-1', companyId: 'tenant-a', role, permissions } });
    next();
  };
  app.use('/api/v1', createSettingsRouter(prisma as never, auth));
  return app;
};

describe('workspaceSettingsSchema', () => {
  it('accepts a valid governed workspace policy', () => expect(workspaceSettingsSchema.parse(valid)).toMatchObject(valid));
  it('rejects an empty work week', () => expect(() => workspaceSettingsSchema.parse({ ...valid, workDays: [] })).toThrow());
  it('rejects business hours ending before they start', () => expect(() => workspaceSettingsSchema.parse({ ...valid, businessHoursEnd: '08:30' })).toThrow());
});

describe('statutory setup API', () => {
  it('returns statutory completion percentage and missing fields', async () => {
    const prisma = {
      companySettings: {
        findUnique: vi.fn().mockResolvedValue({
          companyName: 'BalajiOne Tech',
          legalEntityName: 'BalajiOne Technologies Pvt Ltd',
          companyType: 'PRIVATE_LIMITED',
          registeredAddress: '123 Tech Park',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          panNumber: 'ABCDE1234F',
          taxRegistrationNumber: '', // missing GSTIN
        }),
      },
      companyDocument: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'doc-1', title: '[PAN_CARD:VERIFIED] Corporate PAN', category: 'STATUTORY', downloadUrl: '/file/1', uploadedAt: new Date() },
        ]),
      },
    };
    const app = appFor(['company.manage'], 'COMPANY_ADMIN', prisma);
    const res = await request(app).get('/api/v1/workspace-settings/statutory-status');
    expect(res.status).toBe(200);
    expect(res.body.data.completionPercentage).toBeGreaterThan(0);
    expect(res.body.data.missingStatutory).toContain('taxRegistrationNumber');
    expect(res.body.data.documents[0].status).toBe('VERIFIED');
  });

  it('allows saving statutory draft settings without requiring full schema', async () => {
    const prisma = {
      companySettings: {
        findUnique: vi.fn().mockResolvedValue({ companyName: 'BalajiOne' }),
        upsert: vi.fn().mockResolvedValue({
          companyId: 'tenant-a',
          companyName: 'BalajiOne',
          panNumber: 'ABCDE1234F',
          tanNumber: 'BLJE12345A',
        }),
      },
    };
    const app = appFor(['company.manage'], 'COMPANY_ADMIN', prisma);
    const res = await request(app)
      .put('/api/v1/workspace-settings/statutory-draft')
      .send({ panNumber: 'ABCDE1234F', tanNumber: 'BLJE12345A' });
    expect(res.status).toBe(200);
    expect(res.body.data.panNumber).toBe('ABCDE1234F');
  });

  it('allows authorized admin to verify statutory document', async () => {
    const prisma = {
      companyDocument: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'doc-1',
          companyId: 'tenant-a',
          category: 'STATUTORY',
          title: '[PAN_CARD:PENDING] PAN Document',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'doc-1',
          title: '[PAN_CARD:VERIFIED] PAN Document',
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const app = appFor(['company.manage'], 'COMPANY_ADMIN', prisma);
    const res = await request(app)
      .post('/api/v1/workspace-settings/statutory-documents/doc-1/verify')
      .send({ status: 'VERIFIED', remarks: 'Verified with ITD records' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VERIFIED');
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

