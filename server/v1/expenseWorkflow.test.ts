import { rm } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { createV1Router } from './api.js';
import { createOperationsRouter } from './operations.js';
import { createWorkflowRouter, ensureDefaultExpenseWorkflow } from './workflows.js';
import { RECEIPT_STORAGE_ROOT } from './expensePolicyEngine.js';

describe('P2.6A Enterprise Expense Management & Workflow', () => {
  const jwtSecret = '1234567890123456789012345678901234567890';
  process.env.JWT_ACCESS_SECRET = jwtSecret;

  const companyA = 'tenant-corp-a';
  const companyB = 'tenant-corp-b';
  const employeeA = 'emp-001';
  const userA = 'user-emp-a';
  const managerUserA = 'user-mgr-a';
  const financeUserA = 'user-fin-a';
  const intruderUser = 'intruder-user';
  const userB = 'user-b';

  let mockClaims: any[] = [];
  let mockDocuments: any[] = [];
  let mockAudits: any[] = [];
  let mockWorkflows: any[] = [];

  const mockUsers = [
    {
      id: userA,
      companyId: companyA,
      role: 'EMPLOYEE',
      tokenVersion: 0,
      employee: { id: employeeA, companyId: companyA },
    },
    {
      id: managerUserA,
      companyId: companyA,
      role: 'MANAGER',
      tokenVersion: 0,
      employee: { id: 'emp-mgr', companyId: companyA },
    },
    {
      id: financeUserA,
      companyId: companyA,
      role: 'COMPANY_ADMIN',
      tokenVersion: 0,
      employee: { id: 'emp-fin', companyId: companyA },
    },
    {
      id: intruderUser,
      companyId: companyA,
      role: 'EMPLOYEE',
      tokenVersion: 0,
      employee: { id: 'emp-other', companyId: companyA },
    },
    {
      id: userB,
      companyId: companyB,
      role: 'COMPANY_ADMIN',
      tokenVersion: 0,
      employee: { id: 'emp-b', companyId: companyB },
    },
  ];

  beforeEach(() => {
    mockClaims = [];
    mockDocuments = [];
    mockAudits = [];
    mockWorkflows = [];
  });

  afterAll(async () => {
    await rm(RECEIPT_STORAGE_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  const signToken = (userId: string) => {
    return jwt.sign({ sub: userId, tokenVersion: 0 }, jwtSecret, {
      issuer: 'orbithr-api',
      audience: 'orbithr-clients',
      expiresIn: '1h',
    });
  };

  const buildPrismaMock = () => {
    return {
      $transaction: vi.fn(async (cbOrArray) => {
        if (typeof cbOrArray === 'function') {
          return cbOrArray(buildPrismaMock());
        }
        return Promise.all(cbOrArray);
      }),
      expenseClaim: {
        findFirst: vi.fn(({ where }) => {
          return Promise.resolve(
            mockClaims.find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.companyId && c.companyId !== where.companyId) return false;
              if (where.status && c.status !== where.status) return false;
              return true;
            }) || null,
          );
        }),
        findMany: vi.fn(({ where }) => {
          return Promise.resolve(
            mockClaims.filter((c) => {
              if (where.companyId && c.companyId !== where.companyId) return false;
              if (where.employeeId && c.employeeId !== where.employeeId) return false;
              return true;
            }),
          );
        }),
        create: vi.fn(({ data }) => {
          const record = { id: crypto.randomUUID(), status: 'PENDING', submittedAt: new Date(), ...data };
          mockClaims.push(record);
          return Promise.resolve(record);
        }),
        update: vi.fn(({ where, data }) => {
          const record = mockClaims.find((c) => c.id === where.id);
          if (record) Object.assign(record, data);
          return Promise.resolve(record);
        }),
        updateMany: vi.fn(({ where, data }) => {
          let count = 0;
          for (const record of mockClaims) {
            if ((!where.id || record.id === where.id) && (!where.companyId || record.companyId === where.companyId)) {
              Object.assign(record, data);
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
        count: vi.fn().mockResolvedValue(0),
      },
      employeeDocument: {
        findFirst: vi.fn(({ where }) => {
          return Promise.resolve(
            mockDocuments.find((d) => {
              if (where.id && d.id !== where.id) return false;
              if (where.companyId && d.companyId !== where.companyId) return false;
              if (where.employeeId && d.employeeId !== where.employeeId) return false;
              if (where.documentType && d.documentType !== where.documentType) return false;
              return true;
            }) || null,
          );
        }),
        create: vi.fn(({ data }) => {
          const doc = { id: data.id || crypto.randomUUID(), createdAt: new Date(), ...data };
          mockDocuments.push(doc);
          return Promise.resolve(doc);
        }),
        deleteMany: vi.fn(({ where }) => {
          const initialLen = mockDocuments.length;
          mockDocuments = mockDocuments.filter((d) => {
            if (where.id && d.id === where.id) return false;
            if (where.companyId && d.companyId === where.companyId) return false;
            return true;
          });
          return Promise.resolve({ count: initialLen - mockDocuments.length });
        }),
      },
      auditLog: {
        create: vi.fn(({ data }) => {
          const log = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
          mockAudits.push(log);
          return Promise.resolve(log);
        }),
      },
      workflowDefinition: {
        findFirst: vi.fn(({ where }) => {
          return Promise.resolve(
            mockWorkflows.find((w) => {
              if (where.companyId && w.companyId !== where.companyId) return false;
              if (where.module && w.module !== where.module) return false;
              if (where.status && w.status !== where.status) return false;
              if (where.code && w.code !== where.code) return false;
              return true;
            }) || null,
          );
        }),
        create: vi.fn(({ data }) => {
          const steps = data.steps?.create
            ? Array.isArray(data.steps.create)
              ? data.steps.create.map((s: any, idx: number) => ({ id: `step-${idx + 1}`, ...s }))
              : [{ id: 'step-1', ...data.steps.create }]
            : [];
          const wf = { id: crypto.randomUUID(), ...data, steps };
          mockWorkflows.push(wf);
          return Promise.resolve(wf);
        }),
        update: vi.fn(({ where, data }) => {
          const wf = mockWorkflows.find((w) => w.id === where.id);
          if (wf) Object.assign(wf, data);
          return Promise.resolve(wf);
        }),
      },
      workflowInstance: {
        create: vi.fn(({ data }) => {
          const inst = { id: crypto.randomUUID(), status: 'PENDING', ...data };
          return Promise.resolve(inst);
        }),
      },
      workflowStepInstance: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      notificationPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: crypto.randomUUID() }),
      },
      notificationDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn(({ where }) => {
          const user = mockUsers.find((u) => u.id === where.id);
          return Promise.resolve(user || null);
        }),
        findMany: vi.fn(({ where }) => {
          const users: any[] = [];
          if (where.role?.in?.includes('PAYROLL_ADMIN') || where.role?.in?.includes('COMPANY_ADMIN')) {
            users.push({ id: financeUserA, role: 'COMPANY_ADMIN', companyId: companyA });
          }
          return Promise.resolve(users);
        }),
        findFirst: vi.fn().mockResolvedValue({ id: financeUserA }),
      },
      userAccessGrant: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      employee: {
        findFirst: vi.fn(({ where }) => {
          if (where.userId === userA) {
            return Promise.resolve({
              id: employeeA,
              reportingManager: { userId: managerUserA },
              department: { headEmployeeId: null },
            });
          }
          return Promise.resolve(null);
        }),
      },
    };
  };

  const createTestApp = (prismaMock: any) => {
    const app = express();
    app.use(express.json());

    // Bridge authenticate middleware for operations and workflow routers
    const operationsAuthenticate = (req: any, res: any, next: any) => {
      try {
        const raw = req.header('authorization');
        if (!raw?.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED' } });
        }
        const payload = jwt.verify(raw.slice(7), jwtSecret, {
          issuer: 'orbithr-api',
          audience: 'orbithr-clients',
        }) as jwt.JwtPayload;
        const user = mockUsers.find((u) => u.id === payload.sub);
        if (!user) {
          return res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID' } });
        }
        req.auth = {
          id: user.id,
          companyId: user.companyId,
          role: user.role,
          employeeId: user.employee?.id,
          permissions:
            user.role === 'COMPANY_ADMIN'
              ? ['expense.submit', 'expense.review', 'operations.manage', 'workflow.manage', 'audit.read']
              : user.role === 'MANAGER'
              ? ['expense.submit', 'expense.review']
              : ['expense.submit'],
        };
        next();
      } catch {
        return res.status(401).json({ success: false, error: { code: 'TOKEN_INVALID' } });
      }
    };

    app.use('/api/v1', createV1Router(prismaMock as never));
    app.use('/api/v1', createOperationsRouter(prismaMock as never, operationsAuthenticate as never));
    app.use('/api/v1', createWorkflowRouter(prismaMock as never, operationsAuthenticate as never));

    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err.status || 500).json({
        success: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message },
      });
    });

    return app;
  };

  describe('Expense Policy Engine Enforcement', () => {
    it('allows submission below receipt threshold without receipt', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Team Coffee',
          category: 'MEALS',
          amount: 350,
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(350);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('rejects claim above ₹500 when receipt is missing', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Airport Taxi',
          category: 'TRAVEL',
          amount: 1200,
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_RECEIPT_REQUIRED');
      expect(res.body.error.message).toContain('valid receipt is required');
    });

    it('rejects prohibited expense category', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Cryptocurrency purchase',
          category: 'CRYPTO_INVESTMENT',
          amount: 400,
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_CATEGORY_NOT_ALLOWED');
    });

    it('rejects claim exceeding global limit of ₹100,000', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Luxury Conference Package',
          category: 'TRAVEL',
          amount: 150000,
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_AMOUNT_LIMIT_EXCEEDED');
    });

    it('rejects claim exceeding category-specific limit (Meals > ₹3,000)', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Team Five-Star Lunch',
          category: 'MEALS',
          amount: 4500,
          expenseDate: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_CATEGORY_LIMIT_EXCEEDED');
      expect(res.body.error.message).toContain('category limit of ₹3,000');
    });

    it('accepts compliant claim with attached receipt file', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Client Dinner')
        .field('category', 'MEALS')
        .field('amount', '2200')
        .field('expenseDate', new Date().toISOString())
        .attach('receipt', Buffer.from('%PDF-1.4 test receipt content'), {
          filename: 'dinner_receipt.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(2200);
      expect(res.body.data.notes).toContain('[RECEIPT:docId=');
      expect(mockDocuments.length).toBe(1);
      expect(mockDocuments[0].mimeType).toBe('application/pdf');
    });
  });

  describe('Receipt Upload, Streaming, and Replacement Security', () => {
    it('rejects unsupported receipt MIME types (e.g. zip file)', async () => {
      const prisma = buildPrismaMock();
      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/me/expenses')
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Hotel stay')
        .field('category', 'TRAVEL')
        .field('amount', '3500')
        .field('expenseDate', new Date().toISOString())
        .attach('receipt', Buffer.from('fake zip archive data'), {
          filename: 'receipt.zip',
          contentType: 'application/zip',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_RECEIPT_INVALID_FORMAT');
    });

    it('attaches receipt to pending claim via /operations/expenses/:id/receipt', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-100',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Hardware Monitor',
        category: 'HARDWARE',
        amount: 8000,
        currency: 'INR',
        expenseDate: new Date(),
        status: 'PENDING',
        notes: null,
      });

      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/operations/expenses/claim-100/receipt')
        .set('Authorization', `Bearer ${token}`)
        .attach('receipt', Buffer.from('fake png image bytes'), {
          filename: 'monitor_bill.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.claim.notes).toContain('[RECEIPT:docId=');
      expect(mockDocuments.length).toBe(1);
      expect(mockDocuments[0].fileName).toBe('monitor_bill.png');
    });

    it('rejects receipt upload by unauthorized user', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-100',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Hardware Monitor',
        category: 'HARDWARE',
        amount: 8000,
        currency: 'INR',
        expenseDate: new Date(),
        status: 'PENDING',
      });

      // User from same company but different employee with no reviewer permissions
      const app = createTestApp(prisma);
      const token = signToken(intruderUser);

      const res = await request(app)
        .post('/api/v1/operations/expenses/claim-100/receipt')
        .set('Authorization', `Bearer ${token}`)
        .attach('receipt', Buffer.from('dummy'), {
          filename: 'test.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects receipt modification on already-approved claim', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-approved-1',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Approved Flight',
        category: 'TRAVEL',
        amount: 5000,
        status: 'APPROVED',
      });

      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .post('/api/v1/operations/expenses/claim-approved-1/receipt')
        .set('Authorization', `Bearer ${token}`)
        .attach('receipt', Buffer.from('dummy'), {
          filename: 'ticket.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPENSE_NOT_PENDING');
    });

    it('rejects deleting receipt if claim amount requires mandatory receipt', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-large-1',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Expensive Travel',
        category: 'TRAVEL',
        amount: 15000, // > 500
        status: 'PENDING',
        notes: '[RECEIPT:docId=doc-1:fileName=bill.pdf:mime=application/pdf:size=1024]',
      });

      const app = createTestApp(prisma);
      const token = signToken(userA);

      const res = await request(app)
        .delete('/api/v1/operations/expenses/claim-large-1/receipt')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPENSE_RECEIPT_REQUIRED');
    });
  });

  describe('Tenant Isolation Verification', () => {
    it('prevents Company B user from viewing Company A expense claim or receipt', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-secret-a',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Confidential R&D Hardware',
        category: 'HARDWARE',
        amount: 25000,
        status: 'PENDING',
      });

      // Tenant B user
      const app = createTestApp(prisma);
      const token = signToken(userB);

      const res = await request(app)
        .get('/api/v1/operations/expenses/claim-secret-a/receipt')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EXPENSE_NOT_FOUND');
    });

    it('prevents Company B user from reviewing Company A expense claim', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-secret-a',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Confidential Claim',
        category: 'MISC',
        amount: 200,
        status: 'PENDING',
      });

      const app = createTestApp(prisma);
      const token = signToken(userB);

      const res = await request(app)
        .patch('/api/v1/operations/expenses/claim-secret-a/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EXPENSE_NOT_FOUND');
      // Assert status was not altered
      expect(mockClaims[0].status).toBe('PENDING');
    });
  });

  describe('Lifecycle and Review Invariants', () => {
    it('approves a pending claim and records audit trail', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-to-approve',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Books & Materials',
        category: 'CERTIFICATION',
        amount: 450,
        status: 'PENDING',
      });

      const app = createTestApp(prisma);
      const token = signToken(financeUserA);

      const res = await request(app)
        .patch('/api/v1/operations/expenses/claim-to-approve/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.approvedById).toBe(financeUserA);

      // Verify audit record was created
      expect(mockAudits.some((a) => a.action === 'REVIEW_EXPENSE' && a.category === 'EXPENSE')).toBe(true);
    });

    it('rejects an invalid review status transition (e.g. attempting to mark REIMBURSED)', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-pending',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Trip expenses',
        category: 'TRAVEL',
        amount: 400,
        status: 'PENDING',
      });

      const app = createTestApp(prisma);
      const token = signToken(financeUserA);

      const res = await request(app)
        .patch('/api/v1/operations/expenses/claim-pending/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REIMBURSED' });

      // Zod validation rejects REIMBURSED in P2.6A
      expect(res.status).toBe(400);
      expect(mockClaims[0].status).toBe('PENDING');
    });

    it('rejects review on an already processed claim', async () => {
      const prisma = buildPrismaMock();
      mockClaims.push({
        id: 'claim-already-approved',
        companyId: companyA,
        employeeId: employeeA,
        title: 'Conference Pass',
        category: 'CERTIFICATION',
        amount: 450,
        status: 'APPROVED',
      });

      const app = createTestApp(prisma);
      const token = signToken(financeUserA);

      const res = await request(app)
        .patch('/api/v1/operations/expenses/claim-already-approved/review')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'REJECTED' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EXPENSE_ALREADY_REVIEWED');
    });
  });

  describe('Sequential Multi-Tier Workflow Approval', () => {
    it('ensures default expense workflow with active definition', async () => {
      const prisma = buildPrismaMock();
      const wf = await ensureDefaultExpenseWorkflow(prisma as never, companyA, 'admin-1');
      expect(wf).toBeDefined();
      expect(wf.module).toBe('EXPENSE');
      expect(wf.status).toBe('ACTIVE');
      expect(wf.steps.length).toBeGreaterThanOrEqual(1);
    });
  });
});
