import crypto from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createOpaqueToken, deliverOnboardingEmail } from './email.js';

type Req = Request & {
  auth?: { id: string; companyId: string; role: string; permissions: string[] };
  requestId?: string;
};

const uuid = z.string().uuid();
const personalSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  gender: z.string().trim().min(1).max(30),
  dateOfBirth: z.coerce.date(),
  bloodGroup: z.string().trim().max(10).optional(),
  personalEmail: z.string().email(),
  mobileNumber: z.string().trim().min(7).max(30),
  alternateMobileNumber: z.string().trim().max(30).optional(),
  fatherName: z.string().trim().max(160).optional(),
  motherName: z.string().trim().max(160).optional(),
  maritalStatus: z.string().trim().max(40).optional(),
  nationality: z.string().trim().min(2).max(80),
  currentAddress: z.string().trim().min(5).max(1000),
  permanentAddress: z.string().trim().min(5).max(1000),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  pinCode: z.string().trim().min(3).max(20),
  emergencyContactName: z.string().trim().min(2).max(160),
  emergencyContactNumber: z.string().trim().min(7).max(30),
  emergencyContactRelationship: z.string().trim().min(2).max(80),
});

const documentSchema = z.object({
  documentType: z.enum(['AADHAAR','PAN','PASSPORT','DRIVING_LICENCE','VOTER_ID','ADDRESS_PROOF','EDUCATION_CERTIFICATE','EXPERIENCE_CERTIFICATE','BANK_DOCUMENT','JOINING_DOCUMENT','OTHER']),
  documentNumber: z.string().trim().max(120).optional(),
  title: z.string().trim().min(2).max(180),
  objectKey: z.string().trim().min(3).max(500),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  issueDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  verificationRemarks: z.string().trim().max(1000).optional(),
});

const salarySchema = z.object({
  structureId: uuid,
  annualCtc: z.number().positive(),
  effectiveFrom: z.coerce.date(),
  componentValues: z.record(z.string(), z.number().min(0)).optional(),
  reason: z.string().trim().max(500).optional(),
});

const faceSchema = z.object({
  required: z.boolean().default(false),
  status: z.enum(['NOT_REGISTERED','REGISTRATION_IN_PROGRESS','REGISTERED','VERIFICATION_FAILED']),
  enrollmentId: z.string().max(200).optional(),
});

const additionalSchema = z.object({
  employeeCode: z.string().trim().min(2).max(30),
  workEmail: z.string().email(),
  departmentId: uuid,
  designationId: uuid,
  reportingManagerId: uuid.optional(),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','INTERN','CONSULTANT']).default('FULL_TIME'),
  workLocation: z.string().trim().max(120).optional(),
  workLocationId: uuid.optional(),
  branchId: uuid.optional(),
  teamId: uuid.optional(),
  costCenterId: uuid.optional(),
  employeeGradeId: uuid.optional(),
  dateOfJoining: z.coerce.date(),
  probationPeriodMonths: z.number().int().min(0).max(36).default(3),
  shiftId: uuid.optional(),
  weeklyOff: z.array(z.number().int().min(0).max(6)).max(7).default([0, 6]),
  accountHolderName: z.string().trim().max(160).optional(),
  bankName: z.string().trim().max(160).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  ifsc: z.string().trim().max(30).optional(),
  bankBranch: z.string().trim().max(160).optional(),
  previousEmployer: z.string().trim().max(160).optional(),
  totalExperience: z.number().min(0).max(80).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  remarks: z.string().trim().max(2000).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const sectionConfig = {
  personal: { field: 'personalDetails', status: 'PERSONAL_DETAILS', progress: 17, schema: personalSchema },
  documents: { field: 'documentDetails', status: 'DOCUMENT_DETAILS', progress: 34, schema: z.object({ documents: z.array(documentSchema).max(30) }) },
  salary: { field: 'salaryDetails', status: 'SALARY_DETAILS', progress: 51, schema: salarySchema },
  face: { field: 'faceDetails', status: 'FACE_AUTHENTICATION', progress: 68, schema: faceSchema },
  additional: { field: 'additionalDetails', status: 'ADDITIONAL_DETAILS', progress: 85, schema: additionalSchema },
} as const;

export function createOnboardingRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message }, meta: { requestId: (res.req as Req).requestId } });
  const manage: RequestHandler = (req: Req, res, next) => req.auth?.permissions.includes('employee.manage') ? next() : fail(res, 403, 'FORBIDDEN', 'Employee management permission is required.');
  router.use('/employees/onboarding', authenticate, manage);

  router.get('/employees/onboarding', async (req: Req, res, next) => {
    try {
      return ok(res, await prisma.employeeOnboarding.findMany({
        where: { companyId: req.auth!.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      }));
    } catch (error) { next(error); }
  });

  router.post('/employees/onboarding', async (req: Req, res, next) => {
    try {
      const body = z.object({ employeeCode: z.string().trim().max(30).optional(), workEmail: z.string().email().optional() }).parse(req.body);
      return ok(res, await prisma.employeeOnboarding.create({ data: {
        companyId: req.auth!.companyId,
        createdById: req.auth!.id,
        employeeCode: body.employeeCode,
        workEmail: body.workEmail?.toLowerCase(),
      } }), 201);
    } catch (error) { next(error); }
  });

  router.get('/employees/onboarding/:id', async (req: Req, res, next) => {
    try {
      const value = await prisma.employeeOnboarding.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId } });
      return value ? ok(res, value) : fail(res, 404, 'ONBOARDING_NOT_FOUND', 'Onboarding draft was not found.');
    } catch (error) { next(error); }
  });

  router.put('/employees/onboarding/:id/:section', async (req: Req, res, next) => {
    try {
      const section = String(req.params.section) as keyof typeof sectionConfig;
      const config = sectionConfig[section];
      if (!config) return fail(res, 404, 'ONBOARDING_SECTION_NOT_FOUND', 'Onboarding section was not found.');
      const draft = await prisma.employeeOnboarding.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, createdEmployeeId: null } });
      if (!draft) return fail(res, 409, 'ONBOARDING_NOT_EDITABLE', 'This onboarding draft cannot be edited.');
      const value = config.schema.parse(req.body);
      const derived = section === 'additional' ? value as z.infer<typeof additionalSchema> : null;
      return ok(res, await prisma.employeeOnboarding.update({
        where: { id: draft.id },
        data: {
          [config.field]: value as Prisma.InputJsonValue,
          status: config.status,
          progress: Math.max(draft.progress, config.progress),
          ...(derived ? { employeeCode: derived.employeeCode, workEmail: derived.workEmail.toLowerCase() } : {}),
        },
      }));
    } catch (error) { next(error); }
  });

  router.post('/employees/onboarding/:id/review', async (req: Req, res, next) => {
    try {
      const draft = await prisma.employeeOnboarding.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, createdEmployeeId: null } });
      if (!draft) return fail(res, 404, 'ONBOARDING_NOT_FOUND', 'Onboarding draft was not found.');
      const missing = [
        !draft.personalDetails && 'Personal details',
        !draft.documentDetails && 'Documents',
        !draft.salaryDetails && 'Salary',
        !draft.faceDetails && 'Face authentication',
        !draft.additionalDetails && 'Additional details',
      ].filter(Boolean);
      if (missing.length) return fail(res, 409, 'ONBOARDING_INCOMPLETE', `Complete: ${missing.join(', ')}.`);
      return ok(res, await prisma.employeeOnboarding.update({ where: { id: draft.id }, data: { status: 'REVIEW', progress: 100 } }));
    } catch (error) { next(error); }
  });

  router.post('/employees/onboarding/:id/complete', async (req: Req, res, next) => {
    try {
      const draft = await prisma.employeeOnboarding.findFirst({ where: { id: String(req.params.id), companyId: req.auth!.companyId, status: 'REVIEW', createdEmployeeId: null } });
      if (!draft) return fail(res, 409, 'ONBOARDING_NOT_READY', 'Review the completed onboarding before creating the employee.');
      const personal = personalSchema.parse(draft.personalDetails);
      const documents = z.object({ documents: z.array(documentSchema) }).parse(draft.documentDetails).documents;
      const salary = salarySchema.parse(draft.salaryDetails);
      const face = faceSchema.parse(draft.faceDetails);
      const additional = additionalSchema.parse(draft.additionalDetails);
      if (face.required && face.status !== 'REGISTERED') return fail(res, 409, 'FACE_ENROLLMENT_REQUIRED', 'Face registration is mandatory before onboarding can be completed.');
      const companyId = req.auth!.companyId;
      const [department, designation, structure] = await Promise.all([
        prisma.department.findFirst({ where: { id: additional.departmentId, companyId } }),
        prisma.designation.findFirst({ where: { id: additional.designationId, companyId, departmentId: additional.departmentId } }),
        prisma.salaryStructure.findFirst({ where: { id: salary.structureId, companyId, active: true } }),
      ]);
      if (!department || !designation || !structure) return fail(res, 400, 'ONBOARDING_REFERENCE_INVALID', 'Department, designation, or salary structure is invalid for this company.');
      const activation = createOpaqueToken();
      const result = await prisma.$transaction(async tx => {
        if (await tx.user.findUnique({ where: { email: additional.workEmail.toLowerCase() } })) throw Object.assign(new Error('A user with this email already exists.'), { status: 409, code: 'EMAIL_EXISTS' });
        const user = await tx.user.create({ data: {
          companyId,
          email: additional.workEmail.toLowerCase(),
          fullName: [personal.firstName, personal.middleName, personal.lastName].filter(Boolean).join(' '),
          role: 'EMPLOYEE',
          passwordHash: null,
        } });
        const probationEndDate = new Date(additional.dateOfJoining);
        probationEndDate.setUTCMonth(probationEndDate.getUTCMonth() + additional.probationPeriodMonths);
        const employee = await tx.employee.create({ data: {
          companyId,
          userId: user.id,
          employeeCode: additional.employeeCode,
          firstName: personal.firstName,
          lastName: personal.lastName,
          email: additional.workEmail.toLowerCase(),
          phone: personal.mobileNumber,
          dateOfBirth: personal.dateOfBirth,
          gender: personal.gender,
          departmentId: additional.departmentId,
          designationId: additional.designationId,
          reportingManagerId: additional.reportingManagerId,
          branchId: additional.branchId,
          workLocationId: additional.workLocationId,
          teamId: additional.teamId,
          costCenterId: additional.costCenterId,
          employeeGradeId: additional.employeeGradeId,
          dateOfJoining: additional.dateOfJoining,
          probationEndDate,
          employmentType: additional.employmentType,
          status: additional.probationPeriodMonths > 0 ? 'ON_PROBATION' : 'ACTIVE',
          workLocation: additional.workLocation,
          bankName: additional.bankName,
          accountNumber: additional.accountNumber,
          routingOrIfsc: additional.ifsc,
          emergencyName: personal.emergencyContactName,
          emergencyRelation: personal.emergencyContactRelationship,
          emergencyPhone: personal.emergencyContactNumber,
          skills: additional.skills,
        } });
        await tx.employeeSalaryRevision.create({ data: {
          companyId,
          employeeId: employee.id,
          structureId: salary.structureId,
          effectiveFrom: salary.effectiveFrom,
          annualCtc: salary.annualCtc,
          componentValues: salary.componentValues,
          reason: salary.reason || 'Initial onboarding salary',
          status: 'APPROVED',
          approvedById: req.auth!.id,
          approvedAt: new Date(),
        } });
        if (documents.length) await tx.employeeDocument.createMany({ data: documents.map(document => ({
          companyId,
          employeeId: employee.id,
          documentType: document.documentType,
          title: document.title,
          objectKey: document.objectKey,
          fileName: document.fileName,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          issueDate: document.issueDate,
          expiryDate: document.expiryDate,
        })) });
        await tx.actionToken.create({ data: { userId: user.id, type: 'ACCOUNT_ACTIVATION', tokenHash: activation.hash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
        const delivery = await tx.emailDelivery.create({ data: {
          companyId,
          userId: user.id,
          employeeId: employee.id,
          idempotencyKey: `onboarding-draft:${draft.id}`,
          messageType: 'EMPLOYEE_ONBOARDING',
          recipient: user.email,
        } });
        await tx.employeeOnboarding.update({ where: { id: draft.id }, data: { status: 'INVITED', progress: 100, createdEmployeeId: employee.id, completedAt: new Date() } });
        await tx.auditLog.create({ data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'COMPLETE_EMPLOYEE_ONBOARDING',
          category: 'EMPLOYEE',
          details: `Employee ${employee.employeeCode} created from onboarding ${draft.id}.`,
          ipAddress: req.ip || 'unknown',
        } });
        return { employee, emailDelivery: { id: delivery.id, status: delivery.status }, onboardingStatus: 'INVITED' };
      });
      void deliverOnboardingEmail(prisma, result.emailDelivery.id, activation.token);
      return ok(res, result, 201);
    } catch (error) { next(error); }
  });

  return router;
}
