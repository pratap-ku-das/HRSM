import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { createV1Router } from './api.js';
import { runComplianceReminders } from './reminders.js';

/**
 * OrbitHR Deep Multi-Module Tenant Isolation Test Suite
 *
 * Verifies strict server-side tenant isolation between:
 * - Tenant A: OrbitHR Acceptance Tenant A (companyId: 'tenant-a')
 * - Tenant B: OrbitHR Acceptance Tenant B (companyId: 'tenant-b')
 *
 * Modules audited:
 * 1. Company & Identity Boundaries (Cross-tenant enumeration, spoofing, RBAC)
 * 2. Employee Records & Lifecycle (List, ID lookup, Update, Delete, Cross-tenant manager/dept assignment)
 * 3. Payroll Boundaries (Runs, Calculation, Approvals, Payment, Payslips, Bank Export)
 * 4. Documents & Evidence (Upload isolation, Path traversal prevention, Object key validation)
 * 5. Attendance & Tracking (Attendance records, GPS route tracking, Location batch)
 * 6. Leave Management (Admin requests, Leave encashment)
 */

const JWT_SECRET = 'D7qL9vN2xR5mK8sP4cT6wY3fH1jB0zEa';
process.env.JWT_ACCESS_SECRET = JWT_SECRET;
process.env.JWT_ISSUER = 'orbithr-api';

type SyntheticUser = {
  id: string;
  companyId: string;
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HR_MANAGER' | 'PAYROLL_ADMIN' | 'EMPLOYEE';
  employeeId?: string;
  tokenVersion?: number;
};

const userA: SyntheticUser = {
  id: '00000000-0000-4000-8000-000000000001',
  companyId: 'tenant-a',
  role: 'COMPANY_ADMIN',
  employeeId: '00000000-0000-4000-8000-000000000011',
  tokenVersion: 1,
};

const employeeA: SyntheticUser = {
  id: '00000000-0000-4000-8000-000000000003',
  companyId: 'tenant-a',
  role: 'EMPLOYEE',
  employeeId: '00000000-0000-4000-8000-000000000011',
  tokenVersion: 1,
};

const userB: SyntheticUser = {
  id: '00000000-0000-4000-8000-000000000002',
  companyId: 'tenant-b',
  role: 'COMPANY_ADMIN',
  employeeId: '00000000-0000-4000-8000-000000000022',
  tokenVersion: 1,
};

const signToken = (user: SyntheticUser) => {
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

const buildPrismaBase = (currentUser: SyntheticUser, customOverrides: Record<string, any> = {}) => {
  const basePrisma: any = {
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }) => {
        if (where.id === currentUser.id) {
          return {
            id: currentUser.id,
            companyId: currentUser.companyId,
            role: currentUser.role,
            tokenVersion: currentUser.tokenVersion ?? 1,
            employee: currentUser.employeeId ? { id: currentUser.employeeId } : null,
          };
        }
        return null;
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    userAccessGrant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-01' }),
    },
    $transaction: vi.fn().mockImplementation(async (arg) => {
      if (typeof arg === 'function') {
        return arg(basePrisma);
      }
      return Promise.all(arg);
    }),
    ...customOverrides,
  };
  return basePrisma;
};

const createTestApp = (prismaMock: any) => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createV1Router(prismaMock as never));
  return app;
};

describe('OrbitHR Deep Tenant Isolation Audit Across Modules', () => {
  // --------------------------------------------------------------------------
  // SECTION A: Company & Identity Boundaries
  // --------------------------------------------------------------------------
  describe('A. Company & Identity Boundaries', () => {
    it('Tenant A cannot create location linked to Tenant B branch', async () => {
      const branchIdB = '00000000-0000-4000-8000-000000000099';
      const prisma = buildPrismaBase(userA, {
        branch: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === branchIdB && where.companyId === 'tenant-b') {
              return { id: branchIdB, companyId: 'tenant-b', name: 'Tenant B Branch' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/organization/locations')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ name: 'Cross Location', code: 'XLOC', branchId: branchIdB });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BRANCH_INVALID');
      expect(prisma.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: branchIdB, companyId: 'tenant-a' } })
      );
    });

    it('Tenant A cannot assign RBAC role belonging to Tenant B to a user', async () => {
      const userIdA = '00000000-0000-4000-8000-000000000010';
      const roleIdB = '00000000-0000-4000-8000-000000000020';
      const prisma = buildPrismaBase(userA, {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === userA.id) {
              return { id: userA.id, companyId: userA.companyId, role: userA.role, tokenVersion: 1 };
            }
            return null;
          }),
          findFirst: vi.fn().mockResolvedValue({ id: userIdA, companyId: 'tenant-a' }),
        },
        accessRole: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === roleIdB && where.companyId === 'tenant-b') {
              return { id: roleIdB, companyId: 'tenant-b', name: 'Role B' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/rbac/grants')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ userId: userIdA, roleId: roleIdB, scope: 'ALL_COMPANY' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('GRANT_PRINCIPAL_INVALID');
      expect(prisma.accessRole.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: roleIdB, companyId: 'tenant-a' }) })
      );
    });

    it('Tenant A cannot grant roles to a Tenant B user', async () => {
      const userIdB = '00000000-0000-4000-8000-000000000030';
      const roleIdA = '00000000-0000-4000-8000-000000000040';
      const prisma = buildPrismaBase(userA, {
        user: {
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === userA.id) {
              return { id: userA.id, companyId: userA.companyId, role: userA.role, tokenVersion: 1 };
            }
            return null;
          }),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === userIdB && where.companyId === 'tenant-b') {
              return { id: userIdB, companyId: 'tenant-b' };
            }
            return null;
          }),
        },
        accessRole: { findFirst: vi.fn().mockResolvedValue({ id: roleIdA, companyId: 'tenant-a' }) },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/rbac/grants')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ userId: userIdB, roleId: roleIdA, scope: 'ALL_COMPANY' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('GRANT_PRINCIPAL_INVALID');
    });

    it('User cannot override tenant context by sending companyId in request payload or query', async () => {
      const branchIdA = '00000000-0000-4000-8000-000000000001';
      const prisma = buildPrismaBase(userA, {
        branch: { findFirst: vi.fn().mockResolvedValue({ id: branchIdA, companyId: 'tenant-a' }) },
        workLocation: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'loc-new', ...data })),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/organization/locations?companyId=tenant-b')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ name: 'Spoofed Location', code: 'SPOOF', branchId: branchIdA, companyId: 'tenant-b' });

      expect(res.status).toBe(201);
      expect(prisma.workLocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 'tenant-a' }),
        })
      );
      expect(prisma.workLocation.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 'tenant-b' }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION B: Employee Records & Lifecycle Isolation
  // --------------------------------------------------------------------------
  describe('B. Employee Records & Lifecycle Isolation', () => {
    it('GET /employees scopes query to authenticated tenant and does not leak Tenant B', async () => {
      const prisma = buildPrismaBase(userA, {
        employee: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            if (where.companyId === 'tenant-a') {
              return [
                { id: 'emp-a-01', companyId: 'tenant-a', employeeCode: 'EMP-A1', firstName: 'Alice', lastName: 'A' },
              ];
            }
            return [];
          }),
          count: vi.fn().mockResolvedValue(1),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].companyId).toBe('tenant-a');
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'tenant-a' }),
        })
      );
    });

    it('Tenant A cannot retrieve employee onboarding record belonging to Tenant B', async () => {
      const prisma = buildPrismaBase(userA, {
        employee: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'emp-b-01' && where.companyId === 'tenant-b') {
              return { id: 'emp-b-01', companyId: 'tenant-b' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/employees/emp-b-01/onboarding-record')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-b-01', companyId: 'tenant-a' } })
      );
    });

    it('Tenant A cannot update or edit Tenant B onboarding draft', async () => {
      const prisma = buildPrismaBase(userA, {
        employeeOnboarding: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'draft-b-01' && where.companyId === 'tenant-b') {
              return { id: 'draft-b-01', companyId: 'tenant-b', createdEmployeeId: null, progress: 20 };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .put('/api/v1/employees/onboarding/draft-b-01/personal')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({
          firstName: 'Hacked',
          lastName: 'Name',
          dateOfBirth: '1995-01-01',
          gender: 'FEMALE',
          maritalStatus: 'SINGLE',
          mobileNumber: '+919876543210',
          personalEmail: 'hacked@tenant-b.com',
          currentAddress: '123 Fake Street',
          permanentAddress: '123 Fake Street',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ONBOARDING_NOT_EDITABLE');
      expect(prisma.employeeOnboarding.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'draft-b-01', companyId: 'tenant-a', createdEmployeeId: null } })
      );
    });

    it('PATCH /employees/:id rejects cross-tenant modification attempts', async () => {
      const prisma = buildPrismaBase(userA, {
        employee: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'emp-b-01' && where.companyId === 'tenant-b') {
              return { id: 'emp-b-01', companyId: 'tenant-b' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .patch('/api/v1/employees/emp-b-01')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({
          employeeCode: 'EMP-B-HACK',
          firstName: 'Tampered',
          lastName: 'User',
          email: 'tampered@example.com',
          departmentId: '00000000-0000-4000-8000-000000000001',
          designationId: '00000000-0000-4000-8000-000000000002',
          dateOfJoining: '2026-01-01',
          employmentType: 'FULL_TIME',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('PATCH /employees/:id rejects cross-tenant department assignment', async () => {
      const deptIdB = '00000000-0000-4000-8000-000000000099';
      const desigIdB = '00000000-0000-4000-8000-000000000098';
      const empIdA = '00000000-0000-4000-8000-000000000011';

      const prisma = buildPrismaBase(userA, {
        employee: {
          findFirst: vi.fn().mockResolvedValue({ id: empIdA, companyId: 'tenant-a', employeeCode: 'EMP-A1' }),
        },
        department: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            // Department belongs to tenant-b
            if (where.id === deptIdB && where.companyId === 'tenant-b') {
              return { id: deptIdB, companyId: 'tenant-b' };
            }
            return null;
          }),
        },
        designation: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .patch(`/api/v1/employees/${empIdA}`)
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({
          employeeCode: 'EMP-A1',
          firstName: 'Alice',
          lastName: 'Smith',
          email: 'alice@tenant-a.com',
          departmentId: deptIdB,
          designationId: desigIdB,
          dateOfJoining: '2026-01-01',
          employmentType: 'FULL_TIME',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ORGANIZATION_REFERENCE_INVALID');
      expect(prisma.department.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: deptIdB, companyId: 'tenant-a' } })
      );
    });

    it('DELETE /employees/:id rejects deleting Tenant B employee', async () => {
      const prisma = buildPrismaBase(userA, {
        employee: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'emp-b-01' && where.companyId === 'tenant-b') {
              return { id: 'emp-b-01', companyId: 'tenant-b' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .delete('/api/v1/employees/emp-b-01')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it('DELETE /employees/:id prevents admin from deleting their own employee record', async () => {
      const empIdA = '00000000-0000-4000-8000-000000000011';
      const prisma = buildPrismaBase(userA, {
        employee: {
          findFirst: vi.fn().mockResolvedValue({
            id: empIdA,
            companyId: 'tenant-a',
            userId: userA.id, // Same user!
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .delete(`/api/v1/employees/${empIdA}`)
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SELF_DELETE_NOT_ALLOWED');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION C: Payroll Isolation
  // --------------------------------------------------------------------------
  describe('C. Payroll Isolation', () => {
    it('Tenant A cannot view attendance review of Tenant B payroll run', async () => {
      const prisma = buildPrismaBase(userA, {
        payrollRun: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'run-b-01' && where.companyId === 'tenant-b') {
              return { id: 'run-b-01', companyId: 'tenant-b', periodStart: new Date(), periodEnd: new Date() };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/payroll/runs/run-b-01/attendance')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYROLL_RUN_NOT_FOUND');
      expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'run-b-01', companyId: 'tenant-a' } })
      );
    });

    it('Tenant A cannot adjust attendance in Tenant B payroll run', async () => {
      const prisma = buildPrismaBase(userA, {
        payrollRun: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'run-b-01' && where.companyId === 'tenant-b') {
              return { id: 'run-b-01', companyId: 'tenant-b', status: 'ATTENDANCE_REVIEW' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .put('/api/v1/payroll/runs/run-b-01/attendance/emp-b-01')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ field: 'presentDays', value: 22, reason: 'Correcting punch error' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_ATTENDANCE_LOCKED');
    });

    it('Tenant A cannot submit Tenant B payroll run for approval', async () => {
      const prisma = buildPrismaBase(userA, {
        payrollRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/payroll/runs/run-b-01/submit')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_STATE_INVALID');
      expect(prisma.payrollRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'run-b-01', companyId: 'tenant-a' }),
        })
      );
    });

    it('Tenant A cannot approve Tenant B payroll run', async () => {
      const prisma = buildPrismaBase(userA, {
        payrollRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/payroll/runs/run-b-01/approve')
        .set('Authorization', `Bearer ${signToken(userA)}`)
        .send({ remarks: 'Approve' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_STATE_INVALID');
      expect(prisma.payrollRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'run-b-01', companyId: 'tenant-a' }),
        })
      );
    });

    it('Tenant A cannot generate payslips for Tenant B payroll run', async () => {
      const prisma = buildPrismaBase(userA, {
        payrollRun: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'run-b-01' && where.companyId === 'tenant-b') {
              return { id: 'run-b-01', companyId: 'tenant-b', status: 'APPROVED', lines: [] };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/payroll/runs/run-b-01/generate-payslips')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYROLL_STATE_INVALID');
      expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'run-b-01', companyId: 'tenant-a', status: 'APPROVED' } })
      );
    });

    it('Employee in Tenant A cannot stream payslip PDF belonging to Tenant B', async () => {
      const prisma = buildPrismaBase(employeeA, {
        payslip: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'payslip-b-01' && where.companyId === 'tenant-b') {
              return { id: 'payslip-b-01', companyId: 'tenant-b', employeeId: 'emp-b-01' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/me/payroll/payslips/payslip-b-01/pdf')
        .set('Authorization', `Bearer ${signToken(employeeA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYSLIP_NOT_FOUND');
      expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'payslip-b-01', companyId: 'tenant-a', employeeId: employeeA.employeeId },
        })
      );
    });

    it('Tenant A cannot download bank export batch belonging to Tenant B', async () => {
      const batchIdB = '00000000-0000-4000-8000-000000000999';
      const prisma = buildPrismaBase(userA, {
        reportExport: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === batchIdB && where.companyId === 'tenant-b') {
              return { id: batchIdB, companyId: 'tenant-b', status: 'COMPLETED', reportKey: 'BANK_TRANSFER_BATCH' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get(`/api/v1/payroll/bank-export/batch/${batchIdB}/download`)
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('BATCH_NOT_FOUND');
      expect(prisma.reportExport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: batchIdB, companyId: 'tenant-a' }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION D: Documents & Evidence Storage Isolation
  // --------------------------------------------------------------------------
  describe('D. Documents & Evidence Storage Isolation', () => {
    it('Tenant A cannot retrieve document file belonging to Tenant B', async () => {
      const prisma = buildPrismaBase(userA, {
        employeeDocument: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === 'doc-b-01' && where.companyId === 'tenant-b') {
              return {
                id: 'doc-b-01',
                companyId: 'tenant-b',
                employeeId: 'emp-b-01',
                objectKey: 'tenant-b/document-b.pdf',
                fileName: 'document-b.pdf',
                mimeType: 'application/pdf',
              };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/employees/emp-b-01/onboarding-documents/doc-b-01/file')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DOCUMENT_NOT_FOUND');
      expect(prisma.employeeDocument.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-b-01', employeeId: 'emp-b-01', companyId: 'tenant-a' },
        })
      );
    });

    it('Fails closed if stored document objectKey belongs to another tenant', async () => {
      const prisma = buildPrismaBase(userA, {
        employeeDocument: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'doc-a-corrupted',
            companyId: 'tenant-a',
            employeeId: 'emp-a-01',
            objectKey: 'tenant-b/confidential.pdf',
            fileName: 'confidential.pdf',
            mimeType: 'application/pdf',
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/employees/emp-a-01/onboarding-documents/doc-a-corrupted/file')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('DOCUMENT_KEY_INVALID');
    });

    it('Fails closed on missing or directory-traversing storage key', async () => {
      const prisma = buildPrismaBase(userA, {
        employeeDocument: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'doc-a-traversal',
            companyId: 'tenant-a',
            employeeId: 'emp-a-01',
            objectKey: 'tenant-a/../../tenant-b/secret.pdf',
            fileName: 'secret.pdf',
            mimeType: 'application/pdf',
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/employees/emp-a-01/onboarding-documents/doc-a-traversal/file')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect([400, 404]).toContain(res.status);
      expect(['DOCUMENT_KEY_INVALID', 'DOCUMENT_FILE_NOT_FOUND']).toContain(res.body.error.code);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION E: Attendance & Tracking Isolation
  // --------------------------------------------------------------------------
  describe('E. Attendance & Tracking Isolation', () => {
    it('GET /attendance/:recordId/route returns 404 when querying Tenant B record', async () => {
      const recIdB = '00000000-0000-4000-8000-000000000888';
      const prisma = buildPrismaBase(userA, {
        attendanceRecord: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === recIdB && where.companyId === 'tenant-b') {
              return { id: recIdB, companyId: 'tenant-b', employeeId: 'emp-b-01', locationPoints: [] };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get(`/api/v1/attendance/${recIdB}/route`)
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('ATTENDANCE_NOT_FOUND');
      expect(prisma.attendanceRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: recIdB, companyId: 'tenant-a' }),
        })
      );
    });

    it('POST /me/attendance/location-batch enforces authenticated companyId during point creation', async () => {
      const pointId = '00000000-0000-4000-8000-000000000777';
      const now = new Date();
      let createdData: any = null;

      const prisma = buildPrismaBase(employeeA, {
        employee: {
          findFirst: vi.fn().mockResolvedValue({ workdayGpsTrackingEnabled: true }),
        },
        attendanceRecord: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'att-rec-01',
            companyId: 'tenant-a',
            employeeId: employeeA.employeeId,
            clockInTime: new Date(now.getTime() - 60000),
            clockOutTime: null,
            deviceId: 'dev-1234567890123456',
          }),
        },
        attendanceLocationPoint: {
          createMany: vi.fn().mockImplementation(async ({ data }) => {
            createdData = data;
            return { count: data.length };
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post('/api/v1/me/attendance/location-batch')
        .set('Authorization', `Bearer ${signToken(employeeA)}`)
        .send({
          deviceId: 'dev-1234567890123456',
          points: [
            {
              id: pointId,
              latitude: 12.9716,
              longitude: 77.5946,
              accuracyMeters: 10,
              capturedAt: now.toISOString(),
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(createdData).not.toBeNull();
      expect(createdData[0].companyId).toBe('tenant-a');
      expect(createdData[0].employeeId).toBe(employeeA.employeeId);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION F: Leave & Encashment Isolation
  // --------------------------------------------------------------------------
  describe('F. Leave & Encashment Isolation', () => {
    it('Tenant A cannot retrieve leave requests of Tenant B in leave administration', async () => {
      const prisma = buildPrismaBase(userA, {
        employee: { findMany: vi.fn().mockResolvedValue([{ id: userA.employeeId }]) },
        leaveType: { findMany: vi.fn().mockResolvedValue([]) },
        leaveRequest: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            if (where.companyId === 'tenant-b') {
              return [{ id: 'leave-b-01', companyId: 'tenant-b' }];
            }
            return [];
          }),
        },
        workflowInstance: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockImplementation(async (promises) => Promise.all(promises)),
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .get('/api/v1/leave-administration')
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requests).toEqual([]);
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'tenant-a' }) })
      );
    });

    it('Tenant A cannot approve a leave encashment request from Tenant B', async () => {
      const requestIdB = '00000000-0000-4000-8000-000000000099';
      const prisma = buildPrismaBase(userA, {
        employeeServiceRequest: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.id === requestIdB && where.companyId === 'tenant-b') {
              return { id: requestIdB, companyId: 'tenant-b', type: 'LEAVE_ENCASHMENT', status: 'PENDING' };
            }
            return null;
          }),
        },
      });

      const app = createTestApp(prisma);
      const res = await request(app)
        .post(`/api/v1/leave-encashment/requests/${requestIdB}/approve`)
        .set('Authorization', `Bearer ${signToken(userA)}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('REQUEST_NOT_FOUND');
      expect(prisma.employeeServiceRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: requestIdB, companyId: 'tenant-a' }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION G: Compliance Calendar & Escalation Alerts Isolation (OBS-P2.10-04, AC-5)
  // --------------------------------------------------------------------------
  describe('G. Compliance Calendar & Escalation Alerts Isolation', () => {
    it('Tenant A unassigned obligation escalation strictly queries and notifies Tenant A admins, never Tenant B', async () => {
      const createdNotifications: any[] = [];
      const userFindManySpy = vi.fn().mockImplementation(async ({ where }) => {
        if (where.companyId === 'tenant-a') {
          return [{ id: userA.id, role: 'COMPANY_ADMIN' }];
        }
        if (where.companyId === 'tenant-b') {
          return [{ id: userB.id, role: 'COMPANY_ADMIN' }];
        }
        return [];
      });

      const prisma = buildPrismaBase(userA, {
        user: {
          findMany: userFindManySpy,
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where?.id === userA.id && where?.companyId === 'tenant-a') {
              return { id: userA.id, companyId: 'tenant-a' };
            }
            return null;
          }),
        },
        complianceCalendarObligation: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            if (where.companyId === 'tenant-a') {
              return [
                {
                  id: 'obl-tenant-a-01',
                  companyId: 'tenant-a',
                  domain: 'EPF_ECR',
                  obligationType: 'MONTHLY_ECR_AND_CONTRIBUTION',
                  status: 'DUE_SOON',
                  statutoryDueDate: new Date('2026-10-15T00:00:00Z'),
                  extendedDueDate: null,
                  assignedUserId: null,
                },
              ];
            }
            return [];
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        notification: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }) => {
            createdNotifications.push(data);
            return { id: `notif-${createdNotifications.length}`, ...data };
          }),
        },
        notificationDelivery: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        notificationPreference: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        employeeDocument: { findMany: vi.fn().mockResolvedValue([]) },
        employee: { findMany: vi.fn().mockResolvedValue([]) },
      });

      const res = await runComplianceReminders(prisma as any, 'tenant-a', new Date('2026-10-12T00:00:00Z'));
      expect(res.emitted).toBe(1);

      // Verify that user search was strictly scoped to tenant-a
      expect(userFindManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'tenant-a',
            role: { in: ['COMPANY_ADMIN', 'PAYROLL_ADMIN'] },
          }),
        })
      );

      // Verify that notification was strictly created for userA and tenant-a
      expect(createdNotifications.length).toBe(1);
      expect(createdNotifications[0].companyId).toBe('tenant-a');
      expect(createdNotifications[0].userId).toBe(userA.id);
      expect(createdNotifications[0].userId).not.toBe(userB.id);
      expect(createdNotifications[0].eventKey).toBe('STATUTORY_DEADLINE_UNASSIGNED_APPROACHING');
    });

    it('Tenant A unassigned overdue obligation escalation does not leak to Tenant B', async () => {
      const createdNotifications: any[] = [];
      const prisma = buildPrismaBase(userA, {
        user: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where?.companyId === 'tenant-a') {
              return { id: where.id, companyId: 'tenant-a' };
            }
            return null;
          }),
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            if (where.companyId === 'tenant-a') {
              return [
                { id: userA.id, role: 'COMPANY_ADMIN' },
                { id: 'payroll-admin-a', role: 'PAYROLL_ADMIN' },
              ];
            }
            return [{ id: userB.id, role: 'COMPANY_ADMIN' }];
          }),
        },
        complianceCalendarObligation: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            if (where.companyId === 'tenant-a') {
              return [
                {
                  id: 'obl-tenant-a-overdue',
                  companyId: 'tenant-a',
                  domain: 'TDS_24Q',
                  obligationType: 'MONTHLY_TDS_DEPOSIT',
                  status: 'OVERDUE',
                  statutoryDueDate: new Date('2026-10-07T00:00:00Z'),
                  extendedDueDate: null,
                  assignedUserId: null,
                },
              ];
            }
            return [];
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        notification: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(async ({ data }) => {
            createdNotifications.push(data);
            return { id: `notif-${createdNotifications.length}`, ...data };
          }),
        },
        notificationDelivery: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        notificationPreference: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        employeeDocument: { findMany: vi.fn().mockResolvedValue([]) },
        employee: { findMany: vi.fn().mockResolvedValue([]) },
      });

      const res = await runComplianceReminders(prisma as any, 'tenant-a', new Date('2026-10-10T00:00:00Z'));
      expect(res.emitted).toBe(2);

      // Verify all emitted notifications are for tenant-a and never tenant-b
      expect(createdNotifications.every((n) => n.companyId === 'tenant-a')).toBe(true);
      expect(createdNotifications.some((n) => n.userId === userB.id)).toBe(false);
      expect(createdNotifications[0].eventKey).toBe('STATUTORY_DEADLINE_UNASSIGNED_OVERDUE');
      expect(createdNotifications[1].eventKey).toBe('STATUTORY_DEADLINE_UNASSIGNED_OVERDUE');
    });
  });
});

