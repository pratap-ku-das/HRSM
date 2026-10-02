import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { reportDefinitions } from './reports.js';
import { createRecruitmentRouter } from './recruitment.js';

const appFor = (permissions: string[], prisma: unknown) => {
  const app = express();
  app.use(express.json());
  const auth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { auth: { id: 'user-hr', companyId: 'tenant-a', role: 'HR_MANAGER', permissions } });
    next();
  };
  app.use('/api/v1', createRecruitmentRouter(prisma as never, auth));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('TEST ERROR:', error);
    return res.status(400).json({ error: { code: error?.code || 'VALIDATION_ERROR', message: error?.message, issues: error?.issues } });
  });
  return app;
};

describe('recruitment analytics coverage', () => {
  it('includes funnel, time-to-hire, source effectiveness, and open positions', () => {
    const keys = new Set(reportDefinitions.map(item => item[0]));
    for (const key of ['RECRUITMENT_FUNNEL', 'RECRUITMENT_TIME_TO_HIRE', 'RECRUITMENT_SOURCE_EFFECTIVENESS', 'RECRUITMENT_OPEN_POSITIONS']) expect(keys.has(key)).toBe(true);
  });
});

describe('candidate to employee conversion', () => {
  it('denies conversion without recruitment.manage permission', async () => {
    const app = appFor([], {});
    const res = await request(app)
      .post('/api/v1/recruitment/applicants/00000000-0000-4000-8000-000000000001/convert-to-employee')
      .send({ designationId: '00000000-0000-4000-8000-000000000002' });
    expect(res.status).toBe(403);
  });

  it('rejects conversion if applicant does not exist', async () => {
    const prisma = {
      jobApplicant: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const app = appFor(['recruitment.manage'], prisma);
    const res = await request(app)
      .post('/api/v1/recruitment/applicants/00000000-0000-4000-8000-000000000001/convert-to-employee')
      .send({ designationId: '00000000-0000-4000-8000-000000000002' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('APPLICANT_NOT_FOUND');
  });

  it('rejects duplicate conversion when candidate is already converted', async () => {
    const prisma = {
      jobApplicant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cand-1',
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          stage: 'HIRED',
          notes: '[Converted to employee: EMP-0001 (emp-1)]',
          jobPosting: { departmentId: 'dept-1' },
        }),
      },
    };
    const app = appFor(['recruitment.manage'], prisma);
    const res = await request(app)
      .post('/api/v1/recruitment/applicants/cand-1/convert-to-employee')
      .send({ designationId: '00000000-0000-4000-8000-000000000002' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANDIDATE_ALREADY_CONVERTED');
  });

  it('transactionally converts candidate to employee and creates onboarding record', async () => {
    const applicant = {
      id: 'cand-1',
      companyId: 'tenant-a',
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543210',
      stage: 'OFFER',
      notes: null,
      jobPosting: { departmentId: '00000000-0000-4000-8000-000000000001', location: 'Bengaluru' },
    };
    const employee = {
      id: 'emp-101',
      employeeCode: 'EMP-0042',
      firstName: 'Rahul',
      lastName: 'Sharma',
      email: 'rahul.sharma@example.com',
      status: 'ACTIVE',
    };
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-new', email: 'rahul.sharma@example.com' }),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(employee),
      },
      employeeOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboard-1', status: 'ACTIVE' }),
      },
      jobApplicant: {
        update: vi.fn().mockResolvedValue({ ...applicant, stage: 'HIRED' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      jobApplicant: { findFirst: vi.fn().mockResolvedValue(applicant) },
      department: { findFirst: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' }) },
      designation: { findFirst: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000002' }) },
      employee: {
        count: vi.fn().mockResolvedValue(41),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn().mockImplementation(async cb => cb(tx)),
    };

    const app = appFor(['recruitment.manage'], prisma);
    const res = await request(app)
      .post('/api/v1/recruitment/applicants/cand-1/convert-to-employee')
      .send({
        designationId: '00000000-0000-4000-8000-000000000002',
        workLocation: 'Bengaluru HQ',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.employee.id).toBe('emp-101');
    expect(res.body.data.onboardingId).toBe('onboard-1');
    expect(tx.jobApplicant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cand-1' },
        data: expect.objectContaining({ stage: 'HIRED' }),
      })
    );
  });
});
