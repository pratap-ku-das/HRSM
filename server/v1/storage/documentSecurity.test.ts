import { rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { createV1Router } from '../api.js';
import { createOperationsRouter } from '../operations.js';
import { createGovernanceRouter } from '../governance.js';
import { createOnboardingRouter } from '../onboarding.js';
import { getStorageService, resetStorageService } from './storageService.js';
import { LocalStorageProvider } from './localStorageProvider.js';

describe('Document Security, Tenant Isolation & Access Control', () => {
  const jwtSecret = 'test-secret-key-for-tenant-isolation-p2-audit';
  process.env.JWT_ACCESS_SECRET = jwtSecret;
  process.env.JWT_ISSUER = 'orbithr-api';

  const testStorageDir = path.resolve('.codex-tmp/sec-storage-' + crypto.randomUUID());
  process.env.DOCUMENT_STORAGE_DIR = testStorageDir;

  const tenantA = 'tenant-alpha-001';
  const tenantB = 'tenant-bravo-002';
  const userA = 'user-alpha-admin';
  const userB = 'user-bravo-admin';
  const employeeA = 'emp-alpha-1';

  beforeEach(() => {
    resetStorageService();
  });

  afterAll(async () => {
    await rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
  });

  const signToken = (payload: { id: string; companyId: string; role: string; employeeId?: string; permissions?: string[] }) => {
    return jwt.sign(
      {
        sub: payload.id,
        companyId: payload.companyId,
        role: payload.role,
        employeeId: payload.employeeId,
        permissions: payload.permissions || ['operations.manage', 'employee.manage', 'expense.submit', 'expense.review'],
        tokenVersion: 0,
      },
      jwtSecret,
      { issuer: 'orbithr-api', audience: 'orbithr-clients', expiresIn: '1h' }
    );
  };

  const authenticateMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, jwtSecret, { issuer: 'orbithr-api', audience: 'orbithr-clients' }) as any;
      req.auth = {
        id: decoded.sub,
        companyId: decoded.companyId,
        role: decoded.role,
        employeeId: decoded.employeeId,
        permissions: decoded.permissions || [],
      };
      next();
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
  };

  it('rejects unauthenticated document download requests', async () => {
    const app = express();
    const prismaMock: any = {};
    app.use('/api/v1', createOperationsRouter(prismaMock, authenticateMiddleware));

    const res = await request(app).get('/api/v1/operations/company-documents/doc-123/file');
    expect(res.status).toBe(401);
  });

  it('enforces tenant isolation: Tenant A cannot download Tenant B company document', async () => {
    const app = express();
    const prismaMock: any = {
      companyDocument: {
        findFirst: vi.fn(async ({ where }) => {
          // If query checks where.companyId === 'tenant-alpha-001', it will not find Tenant B's doc
          if (where.companyId === tenantB && where.id === 'doc-bravo-1') {
            return { id: 'doc-bravo-1', companyId: tenantB, objectKey: `${tenantB}/doc.pdf`, fileName: 'doc.pdf', mimeType: 'application/pdf' };
          }
          return null;
        }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    app.use('/api/v1', createOperationsRouter(prismaMock, authenticateMiddleware));

    const tokenA = signToken({ id: userA, companyId: tenantA, role: 'COMPANY_ADMIN' });
    const res = await request(app)
      .get('/api/v1/operations/company-documents/doc-bravo-1/file')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
    expect(prismaMock.companyDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'doc-bravo-1', companyId: tenantA }),
      })
    );
  });

  it('prevents cross-tenant object-key spoofing on company document download', async () => {
    const app = express();
    const prismaMock: any = {
      companyDocument: {
        findFirst: vi.fn(async () => ({
          id: 'doc-tampered',
          companyId: tenantA,
          // Attacker forged objectKey pointing to Tenant B's namespace
          objectKey: `${tenantB}/confidential-salaries.pdf`,
          fileName: 'salaries.pdf',
          mimeType: 'application/pdf',
        })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    app.use('/api/v1', createOperationsRouter(prismaMock, authenticateMiddleware));

    const tokenA = signToken({ id: userA, companyId: tenantA, role: 'COMPANY_ADMIN' });
    const res = await request(app)
      .get('/api/v1/operations/company-documents/doc-tampered/file')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DOCUMENT_KEY_INVALID');
  });

  it('rejects path traversal in document storage keys', async () => {
    const app = express();
    const prismaMock: any = {
      companyDocument: {
        findFirst: vi.fn(async () => ({
          id: 'doc-traversal',
          companyId: tenantA,
          objectKey: `${tenantA}/../../etc/passwd`,
          fileName: 'passwd',
          mimeType: 'text/plain',
        })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    app.use('/api/v1', createOperationsRouter(prismaMock, authenticateMiddleware));

    const tokenA = signToken({ id: userA, companyId: tenantA, role: 'COMPANY_ADMIN' });
    const res = await request(app)
      .get('/api/v1/operations/company-documents/doc-traversal/file')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DOCUMENT_KEY_INVALID');
  });

  it('stores uploaded document and retrieves it with correct Content-Type and Disposition', async () => {
    const storage = new LocalStorageProvider(testStorageDir);
    const key = `${tenantA}/company-docs/policies.pdf`;
    const pdfBytes = Buffer.from('%PDF-1.4 sample pdf content for orbit hr');

    await storage.putObject({
      key,
      buffer: pdfBytes,
      contentType: 'application/pdf',
      metadata: { originalName: 'policies.pdf' },
    });

    const app = express();
    const prismaMock: any = {
      companyDocument: {
        findFirst: vi.fn(async () => ({
          id: 'doc-valid-1',
          companyId: tenantA,
          objectKey: key,
          fileName: 'Company_Policies_2026.pdf',
          mimeType: 'application/pdf',
        })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    app.use('/api/v1', createOperationsRouter(prismaMock, authenticateMiddleware));

    const tokenA = signToken({ id: userA, companyId: tenantA, role: 'COMPANY_ADMIN' });
    const res = await request(app)
      .get('/api/v1/operations/company-documents/doc-valid-1/file')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('Company_Policies_2026.pdf');
    expect(Buffer.from(res.body).equals(pdfBytes)).toBe(true);
  });

  it('generates short-lived presigned URLs without exposing raw storage root paths', async () => {
    const storage = new LocalStorageProvider(testStorageDir);
    const url = await storage.createPresignedDownloadUrl({
      key: `${tenantA}/receipts/rec-123.pdf`,
      expiresInSeconds: 900,
      fileName: 'receipt.pdf',
    });

    expect(url).not.toContain(testStorageDir);
    expect(url).toContain('key=' + encodeURIComponent(`${tenantA}/receipts/rec-123.pdf`));
    expect(url).toContain('sig=');
    expect(url).toContain('expires=');
  });
});
