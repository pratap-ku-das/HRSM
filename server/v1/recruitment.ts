import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type Req = Request & { auth?: { id: string; companyId: string; role: string; permissions: string[] }; requestId?: string };
const stages = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const;
export function createRecruitmentRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  const permit: RequestHandler = (req: Req, res, next) => req.auth?.permissions.includes('recruitment.manage') ? next() : fail(res, 403, 'FORBIDDEN', 'Recruitment management permission is required.');
  const audit = (req: Req, action: string, details: string) => prisma.auditLog.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.id, userName: req.auth!.id, userRole: req.auth!.role, action, category: 'RECRUITMENT', details, ipAddress: req.ip || 'unknown' } });
  router.use('/recruitment', authenticate, permit);
  router.get('/recruitment', async (req: Req, res, next) => { try { const [jobs, applicants] = await prisma.$transaction([prisma.jobPosting.findMany({ where: { companyId: req.auth!.companyId }, include: { department: { select: { id: true, name: true } } }, orderBy: { postedAt: 'desc' } }), prisma.jobApplicant.findMany({ where: { companyId: req.auth!.companyId }, include: { jobPosting: { select: { id: true, title: true } } }, orderBy: { appliedAt: 'desc' } })]); return ok(res, { jobs, applicants }); } catch (error) { next(error); } });
  router.post('/recruitment/jobs', async (req: Req, res, next) => { try { const body = z.object({ title: z.string().trim().min(2).max(160), departmentId: z.string().uuid(), location: z.string().trim().min(2).max(160), employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']).default('FULL_TIME'), experienceLevel: z.string().trim().min(1).max(100), minSalary: z.number().min(0), maxSalary: z.number().min(0), currency: z.string().length(3).default('INR'), status: z.enum(['OPEN', 'CLOSED', 'DRAFT']).default('OPEN'), description: z.string().trim().min(3).max(20_000), requirements: z.array(z.string().trim().min(1).max(200)).max(100).default([]) }).refine(value => value.maxSalary >= value.minSalary, { path: ['maxSalary'], message: 'Maximum salary must not be below minimum salary.' }).parse(req.body); if (!await prisma.department.findFirst({ where: { id: body.departmentId, companyId: req.auth!.companyId } })) return fail(res, 400, 'DEPARTMENT_INVALID', 'Department is not part of this company.'); const job = await prisma.jobPosting.create({ data: { ...body, companyId: req.auth!.companyId } }); await audit(req, 'CREATE_JOB_POSTING', `Job ${job.id} (${job.title}) created.`); return ok(res, job, 201); } catch (error) { next(error); } });
  router.post('/recruitment/applicants', async (req: Req, res, next) => { try { const body = z.object({ jobPostingId: z.string().uuid(), fullName: z.string().trim().min(2).max(160), email: z.string().email(), phone: z.string().max(30).optional(), currentCompany: z.string().max(160).optional(), experienceYears: z.number().min(0).max(80).default(0), rating: z.number().int().min(1).max(5).default(3), notes: z.string().max(5000).optional(), source: z.string().trim().max(100).optional() }).parse(req.body); const job = await prisma.jobPosting.findFirst({ where: { id: body.jobPostingId, companyId: req.auth!.companyId } }); if (!job) return fail(res, 404, 'JOB_NOT_FOUND', 'Job posting was not found.'); const applicant = await prisma.$transaction(async tx => { const created = await tx.jobApplicant.create({ data: { ...body, companyId: req.auth!.companyId } }); await tx.jobPosting.update({ where: { id: job.id }, data: { applicantCount: { increment: 1 } } }); return created; }); await audit(req, 'CREATE_JOB_APPLICANT', `Candidate ${applicant.id} added to ${job.title}.`); return ok(res, applicant, 201); } catch (error) { next(error); } });
  router.patch('/recruitment/applicants/:id/stage', async (req: Req, res, next) => { try { const body = z.object({ stage: z.enum(stages), rating: z.number().int().min(1).max(5).optional(), notes: z.string().max(5000).optional() }).parse(req.body); const applicant = await prisma.jobApplicant.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId } }); if (!applicant) return fail(res, 404, 'APPLICANT_NOT_FOUND', 'Applicant was not found.'); const updated = await prisma.jobApplicant.update({ where: { id: applicant.id }, data: { stage: body.stage, rating: body.rating, notes: body.notes, stageUpdatedAt: new Date(), hiredAt: body.stage === 'HIRED' ? applicant.hiredAt || new Date() : body.stage === 'REJECTED' ? null : applicant.hiredAt } }); await audit(req, 'ADVANCE_CANDIDATE', `Candidate ${applicant.id} moved from ${applicant.stage} to ${body.stage}.`); return ok(res, updated); } catch (error) { next(error); } });

  router.post('/recruitment/applicants/:id/convert-to-employee', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const applicant = await prisma.jobApplicant.findFirst({
        where: { id: String(req.params.id), companyId },
        include: { jobPosting: { include: { department: true } } },
      });
      if (!applicant) return fail(res, 404, 'APPLICANT_NOT_FOUND', 'Candidate was not found.');

      if (applicant.notes?.includes('[Converted to employee:') || (applicant.stage === 'HIRED' && await prisma.employee.findFirst({ where: { companyId, email: applicant.email.toLowerCase() } }))) {
        return fail(res, 409, 'CANDIDATE_ALREADY_CONVERTED', 'This candidate has already been converted to an employee.');
      }

      const body = z.object({
        employeeCode: z.string().trim().min(2).max(40).optional(),
        departmentId: z.string().uuid().optional(),
        designationId: z.string().uuid(),
        dateOfJoining: z.coerce.date().default(() => new Date()),
        employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']).default('FULL_TIME'),
        workLocation: z.string().trim().max(160).optional(),
        reportingManagerId: z.string().uuid().optional(),
        structureId: z.string().uuid().optional(),
        annualCtc: z.number().min(0).default(0),
        phone: z.string().max(30).optional(),
      }).parse(req.body);

      const targetDeptId = body.departmentId || applicant.jobPosting.departmentId;
      const [department, designation] = await Promise.all([
        prisma.department.findFirst({ where: { id: targetDeptId, companyId } }),
        prisma.designation.findFirst({ where: { id: body.designationId, companyId } }),
      ]);
      if (!department) return fail(res, 400, 'DEPARTMENT_INVALID', 'Specified department was not found in this company.');
      if (!designation) return fail(res, 400, 'DESIGNATION_INVALID', 'Specified designation was not found in this company.');

      if (body.structureId) {
        const structure = await prisma.salaryStructure.findFirst({ where: { id: body.structureId, companyId } });
        if (!structure) return fail(res, 400, 'SALARY_STRUCTURE_INVALID', 'Specified salary structure is invalid.');
      }

      let code = body.employeeCode;
      if (!code) {
        const count = await prisma.employee.count({ where: { companyId } });
        code = `EMP-${String(count + 1).padStart(4, '0')}`;
      }

      const existingCode = await prisma.employee.findFirst({ where: { companyId, employeeCode: code } });
      if (existingCode) return fail(res, 409, 'EMPLOYEE_CODE_EXISTS', `Employee code ${code} is already in use.`);

      const existingEmpEmail = await prisma.employee.findFirst({ where: { companyId, email: applicant.email.toLowerCase() } });
      if (existingEmpEmail) return fail(res, 409, 'EMAIL_EXISTS', `An employee with email ${applicant.email} already exists.`);

      const parts = applicant.fullName.trim().split(/\s+/);
      const firstName = parts[0] || 'Employee';
      const lastName = parts.slice(1).join(' ') || 'Candidate';

      const result = await prisma.$transaction(async (tx) => {
        let user = await tx.user.findFirst({ where: { email: applicant.email.toLowerCase() } });
        if (user && user.companyId !== companyId) {
          throw new Error('EMAIL_EXISTS_OTHER_COMPANY');
        }
        if (!user) {
          user = await tx.user.create({
            data: {
              companyId,
              email: applicant.email.toLowerCase(),
              fullName: applicant.fullName,
              role: 'EMPLOYEE',
            },
          });
        }

        const employee = await tx.employee.create({
          data: {
            companyId,
            userId: user.id,
            employeeCode: code!,
            firstName,
            lastName,
            email: applicant.email.toLowerCase(),
            phone: body.phone || applicant.phone || null,
            departmentId: targetDeptId,
            designationId: body.designationId,
            reportingManagerId: body.reportingManagerId || null,
            dateOfJoining: body.dateOfJoining,
            employmentType: body.employmentType,
            status: 'ACTIVE',
            workLocation: body.workLocation || applicant.jobPosting.location || null,
          },
        });

        if (body.structureId && body.annualCtc > 0) {
          await tx.employeeSalaryRevision.create({
            data: {
              companyId,
              employeeId: employee.id,
              structureId: body.structureId,
              effectiveFrom: body.dateOfJoining,
              annualCtc: body.annualCtc,
              reason: 'Candidate conversion compensation structure',
              status: 'APPROVED',
              approvedById: req.auth!.id,
              approvedAt: new Date(),
            },
          });
        }

        const onboarding = await tx.employeeOnboarding.create({
          data: {
            companyId,
            createdById: req.auth!.id,
            createdEmployeeId: employee.id,
            employeeCode: employee.employeeCode,
            workEmail: employee.email,
            status: 'ACTIVE',
            progress: 100,
            completedAt: new Date(),
            personalDetails: {
              firstName,
              lastName,
              personalEmail: applicant.email,
              mobileNumber: body.phone || applicant.phone || '',
            },
            additionalDetails: {
              employeeCode: employee.employeeCode,
              workEmail: employee.email,
              departmentId: targetDeptId,
              designationId: body.designationId,
              employmentType: body.employmentType,
              dateOfJoining: body.dateOfJoining.toISOString().slice(0, 10),
            },
          },
        });

        await tx.jobApplicant.update({
          where: { id: applicant.id },
          data: {
            stage: 'HIRED',
            hiredAt: new Date(),
            stageUpdatedAt: new Date(),
            notes: applicant.notes
              ? `${applicant.notes}\n[Converted to employee: ${employee.employeeCode} (${employee.id})]`
              : `[Converted to employee: ${employee.employeeCode} (${employee.id})]`,
          },
        });

        await tx.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'CONVERT_CANDIDATE_TO_EMPLOYEE',
            category: 'RECRUITMENT',
            details: `Candidate ${applicant.fullName} (${applicant.id}) converted to employee ${employee.employeeCode} (${employee.id}).`,
            ipAddress: req.ip || 'unknown',
          },
        });

        return { employee, onboardingId: onboarding.id };
      });

      return ok(res, result, 201);
    } catch (error: any) {
      if (error?.message === 'EMAIL_EXISTS_OTHER_COMPANY') {
        return fail(res, 409, 'EMAIL_EXISTS_OTHER_COMPANY', 'This email is already associated with another organization.');
      }
      next(error);
    }
  });

  return router;
}
