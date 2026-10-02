import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type AuthRequest = Request & { auth?: { id: string; companyId: string; role: string; permissions: string[] }; requestId?: string };

const baseWorkspaceSettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  legalEntityName: z.string().trim().min(2).max(200),
  taxRegistrationNumber: z.string().trim().max(200),
  companyType: z.enum(['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'TRUST', 'SOCIETY', 'OTHER']).default('PRIVATE_LIMITED'),
  registrationNumber: z.string().trim().max(80).default(''),
  incorporationDate: z.preprocess(value => value === '' || value == null ? undefined : value, z.coerce.date().optional()),
  panNumber: z.string().trim().max(20).default(''),
  tanNumber: z.string().trim().max(20).default(''),
  udyamRegistrationNumber: z.string().trim().max(40).default(''),
  pfRegistrationNumber: z.string().trim().max(40).default(''),
  esiRegistrationNumber: z.string().trim().max(40).default(''),
  professionalTaxNumber: z.string().trim().max(40).default(''),
  labourLicenseNumber: z.string().trim().max(60).default(''),
  officialEmail: z.union([z.literal(''), z.string().email()]).default(''),
  officialPhone: z.string().trim().max(30).default(''),
  website: z.union([z.literal(''), z.string().url()]).default(''),
  registeredAddress: z.string().trim().max(1000).default(''),
  city: z.string().trim().max(100).default(''),
  state: z.string().trim().max(100).default(''),
  country: z.string().trim().max(100).default('India'),
  postalCode: z.string().trim().max(20).default(''),
  industry: z.string().trim().max(120).default(''),
  companySize: z.string().trim().max(40).default(''),
  financialYearStartMonth: z.number().int().min(1).max(12).default(4),
  currency: z.string().length(3).default('INR'),
  currencySymbol: z.string().min(1).max(10).default('₹'),
  timezone: z.string().trim().min(2).max(100).default('Asia/Kolkata'),
  workDays: z.array(z.number().int().min(0).max(6)).min(1),
  businessHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  businessHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enableAutomaticOvertime: z.boolean(),
  enableAuditLogging: z.boolean(),
  defaultProbationPeriodMonths: z.number().int().min(0).max(36),
});

export const workspaceSettingsSchema = baseWorkspaceSettingsSchema.refine(value => value.businessHoursEnd > value.businessHoursStart, {
  path: ['businessHoursEnd'], message: 'Business end time must be after start time.',
});

export const statutoryDraftSchema = baseWorkspaceSettingsSchema.partial();

export function createSettingsRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown) => res.json({ data, meta: { requestId: (res.req as AuthRequest).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
  router.use('/workspace-settings', authenticate);
  router.get('/workspace-settings/statutory-status', async (req: AuthRequest, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const [settings, documents] = await Promise.all([
        prisma.companySettings.findUnique({ where: { companyId } }),
        prisma.companyDocument.findMany({ where: { companyId, category: 'STATUTORY' }, orderBy: { uploadedAt: 'desc' } }),
      ]);

      const basicRequired = ['companyName', 'legalEntityName', 'companyType', 'registeredAddress', 'city', 'state', 'postalCode'] as const;
      const statutoryRequired = ['panNumber', 'taxRegistrationNumber'] as const; // PAN and GSTIN/Tax ID are core statutory
      const optionalStatutory = ['tanNumber', 'registrationNumber', 'pfRegistrationNumber', 'esiRegistrationNumber', 'professionalTaxNumber', 'labourLicenseNumber', 'udyamRegistrationNumber'] as const;

      const missingBasic = settings ? basicRequired.filter(field => !settings[field]) : [...basicRequired];
      const missingStatutory = settings ? statutoryRequired.filter(field => !settings[field]) : [...statutoryRequired];

      const parsedDocs = documents.map(doc => {
        const match = doc.title.match(/^\[([A-Z_]+):([A-Z_]+)\]\s*(.*)$/);
        return {
          id: doc.id,
          docType: match ? match[1] : 'OTHER',
          status: match ? match[2] : 'PENDING',
          title: match ? match[3] : doc.title,
          fileName: doc.fileName || doc.title,
          sizeBytes: doc.sizeBytes || Number(doc.fileSize) || 0,
          mimeType: doc.mimeType || doc.fileType,
          downloadUrl: doc.downloadUrl,
          uploadedAt: doc.uploadedAt,
        };
      });

      // Calculate progress
      let score = 0;
      const totalPoints = 10;
      // Basic info (up to 4 points)
      score += Math.max(0, 4 - missingBasic.length);
      // Core statutory (up to 3 points)
      if (settings?.panNumber) score += 1.5;
      if (settings?.taxRegistrationNumber) score += 1.5;
      // Documents uploaded and verified (up to 3 points)
      const verifiedDocs = parsedDocs.filter(d => d.status === 'VERIFIED');
      if (parsedDocs.length > 0) score += 1;
      if (verifiedDocs.length > 0) score += 2;

      const completionPercentage = Math.min(100, Math.round((score / totalPoints) * 100));
      const isComplete = completionPercentage >= 80 && missingBasic.length === 0 && missingStatutory.length === 0;

      return ok(res, {
        completionPercentage,
        isComplete,
        missingFields: [...missingBasic, ...missingStatutory],
        missingBasic,
        missingStatutory,
        configuredFields: settings || {},
        documents: parsedDocs,
      });
    } catch (error) { next(error); }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  });
  const statutoryStorage = path.resolve(
    process.env.DOCUMENT_STORAGE_DIR
      ? path.join(process.env.DOCUMENT_STORAGE_DIR, '..', 'company-documents')
      : 'storage/company-documents'
  );

  router.post(
    '/workspace-settings/statutory-documents/upload',
    upload.single('document'),
    async (req: AuthRequest, res, next) => {
      try {
        if (!req.file) return fail(res, 400, 'DOCUMENT_REQUIRED', 'Choose a statutory document to upload.');
        const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
        if (!allowedTypes.has(req.file.mimetype)) {
          return fail(res, 415, 'DOCUMENT_TYPE_INVALID', 'Upload a PDF, JPG, or PNG document.');
        }

        const body = z.object({
          docType: z.enum(['PAN_CARD', 'GST_CERTIFICATE', 'COI_CERTIFICATE', 'PF_REGISTRATION', 'ESIC_REGISTRATION', 'PT_REGISTRATION', 'SHOPS_ESTABLISHMENT', 'UDYAM_CERTIFICATE', 'OTHER']),
          title: z.string().trim().min(2).max(160),
        }).parse(req.body);

        const companyId = req.auth!.companyId;
        const id = crypto.randomUUID();
        const extension = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
        const storageName = `${id}${extension}`;
        const dir = path.join(statutoryStorage, companyId);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, storageName), req.file.buffer, { flag: 'wx' });

        const objectKey = `${companyId}/${storageName}`;
        const titleWithTag = `[${body.docType}:PENDING] ${body.title}`;
        const item = await prisma.companyDocument.create({
          data: {
            id,
            companyId,
            title: titleWithTag,
            category: 'STATUTORY',
            fileSize: `${req.file.size}`,
            fileType: req.file.mimetype,
            downloadUrl: `/api/v1/operations/company-documents/${id}/file`,
            objectKey,
            fileName: req.file.originalname.slice(0, 255),
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
          },
        });

        await prisma.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'UPLOAD_STATUTORY_DOCUMENT',
            category: 'COMPLIANCE',
            details: `Statutory document ${body.docType} (${item.id}) uploaded.`,
            ipAddress: req.ip || 'unknown',
          },
        });

        res.status(201);
        return ok(res, {
          id: item.id,
          docType: body.docType,
          status: 'PENDING',
          title: body.title,
          fileName: item.fileName,
          downloadUrl: item.downloadUrl,
          uploadedAt: item.uploadedAt,
        });
      } catch (error) { next(error); }
    }
  );

  router.post(
    '/workspace-settings/statutory-documents/:id/verify',
    async (req: AuthRequest, res, next) => {
      try {
        if (!req.auth?.permissions.includes('company.manage') && !['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER'].includes(req.auth!.role)) {
          return fail(res, 403, 'FORBIDDEN', 'Administrative permission is required to verify statutory documents.');
        }

        const body = z.object({
          status: z.enum(['VERIFIED', 'REJECTED']),
          remarks: z.string().trim().max(500).optional(),
        }).parse(req.body);

        const companyId = req.auth!.companyId;
        const doc = await prisma.companyDocument.findFirst({
          where: { id: String(req.params.id), companyId, category: 'STATUTORY' },
        });
        if (!doc) return fail(res, 404, 'DOCUMENT_NOT_FOUND', 'Statutory document was not found.');

        const match = doc.title.match(/^\[([A-Z_]+):([A-Z_]+)\]\s*(.*)$/);
        const docType = match ? match[1] : 'OTHER';
        const cleanTitle = match ? match[3] : doc.title;
        const newTitle = `[${docType}:${body.status}] ${cleanTitle}${body.remarks ? ` (Remarks: ${body.remarks})` : ''}`;

        const updated = await prisma.companyDocument.update({
          where: { id: doc.id },
          data: { title: newTitle },
        });

        await prisma.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: body.status === 'VERIFIED' ? 'VERIFY_STATUTORY_DOCUMENT' : 'REJECT_STATUTORY_DOCUMENT',
            category: 'COMPLIANCE',
            details: `Statutory document ${doc.id} ${body.status.toLowerCase()}.${body.remarks ? ` Reason: ${body.remarks}` : ''}`,
            ipAddress: req.ip || 'unknown',
          },
        });

        return ok(res, {
          id: updated.id,
          docType,
          status: body.status,
          title: cleanTitle,
          remarks: body.remarks,
        });
      } catch (error) { next(error); }
    }
  );

  router.put('/workspace-settings/statutory-draft', async (req: AuthRequest, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const body = statutoryDraftSchema.parse(req.body);

      const existing = await prisma.companySettings.findUnique({ where: { companyId } });
      const merged = {
        companyName: body.companyName || existing?.companyName || 'Company',
        legalEntityName: body.legalEntityName || existing?.legalEntityName || 'Company',
        taxRegistrationNumber: body.taxRegistrationNumber ?? existing?.taxRegistrationNumber ?? '',
        companyType: body.companyType || existing?.companyType || 'PRIVATE_LIMITED',
        registrationNumber: body.registrationNumber ?? existing?.registrationNumber ?? '',
        incorporationDate: body.incorporationDate ?? existing?.incorporationDate ?? null,
        panNumber: body.panNumber ?? existing?.panNumber ?? '',
        tanNumber: body.tanNumber ?? existing?.tanNumber ?? '',
        udyamRegistrationNumber: body.udyamRegistrationNumber ?? existing?.udyamRegistrationNumber ?? '',
        pfRegistrationNumber: body.pfRegistrationNumber ?? existing?.pfRegistrationNumber ?? '',
        esiRegistrationNumber: body.esiRegistrationNumber ?? existing?.esiRegistrationNumber ?? '',
        professionalTaxNumber: body.professionalTaxNumber ?? existing?.professionalTaxNumber ?? '',
        labourLicenseNumber: body.labourLicenseNumber ?? existing?.labourLicenseNumber ?? '',
        officialEmail: body.officialEmail ?? existing?.officialEmail ?? '',
        officialPhone: body.officialPhone ?? existing?.officialPhone ?? '',
        website: body.website ?? existing?.website ?? '',
        registeredAddress: body.registeredAddress ?? existing?.registeredAddress ?? '',
        city: body.city ?? existing?.city ?? '',
        state: body.state ?? existing?.state ?? '',
        country: body.country ?? existing?.country ?? 'India',
        postalCode: body.postalCode ?? existing?.postalCode ?? '',
        industry: body.industry ?? existing?.industry ?? '',
        companySize: body.companySize ?? existing?.companySize ?? '',
        financialYearStartMonth: body.financialYearStartMonth ?? existing?.financialYearStartMonth ?? 4,
        currency: body.currency || existing?.currency || 'INR',
        currencySymbol: body.currencySymbol || existing?.currencySymbol || '₹',
        timezone: body.timezone || existing?.timezone || 'Asia/Kolkata',
        workDays: body.workDays || existing?.workDays || [1, 2, 3, 4, 5],
        businessHoursStart: body.businessHoursStart || existing?.businessHoursStart || '09:30',
        businessHoursEnd: body.businessHoursEnd || existing?.businessHoursEnd || '18:30',
        enableAutomaticOvertime: body.enableAutomaticOvertime ?? existing?.enableAutomaticOvertime ?? true,
        enableAuditLogging: body.enableAuditLogging ?? existing?.enableAuditLogging ?? true,
        defaultProbationPeriodMonths: body.defaultProbationPeriodMonths ?? existing?.defaultProbationPeriodMonths ?? 3,
      };

      const settings = await prisma.companySettings.upsert({
        where: { companyId },
        create: { ...merged, companyId },
        update: merged,
      });

      return ok(res, settings);
    } catch (error) { next(error); }
  });

  return router;
}
