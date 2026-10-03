import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import crypto from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { emitNotification } from "./notifications.js";
import {
  resolveCompanyExpensePolicy,
  attachReceiptToNotes,
  detachReceiptFromNotes,
  parseReceiptFromNotes,
  ALLOWED_RECEIPT_MIME_TYPES,
  ALLOWED_RECEIPT_EXTENSIONS,
  MAX_RECEIPT_SIZE_BYTES,
  RECEIPT_STORAGE_ROOT,
} from "./expensePolicyEngine.js";

type Req = Request & {
  auth?: {
    id: string;
    companyId: string;
    role: string;
    employeeId?: string;
    permissions: string[];
  };
  requestId?: string;
};

export async function notifyAnnouncementAudience(
  prisma: PrismaClient,
  announcement: { id: string; companyId: string; title: string; content: string },
) {
  const recipients = await prisma.user.findMany({
    where: { companyId: announcement.companyId },
    select: { id: true },
  });
  let queued = 0;
  for (let offset = 0; offset < recipients.length; offset += 50) {
    const batch = await Promise.allSettled(
      recipients.slice(offset, offset + 50).map((recipient) =>
        emitNotification(prisma, {
          companyId: announcement.companyId,
          userId: recipient.id,
          eventKey: "ANNOUNCEMENT_PUBLISHED",
          title: announcement.title,
          body: announcement.content.slice(0, 500),
          entityType: "Announcement",
          entityId: announcement.id,
          actionUrl: "/notifications",
        }),
      ),
    );
    queued += batch.filter((result) => result.status === "fulfilled" && result.value).length;
  }
  return { recipients: recipients.length, queued };
}

export function createOperationsRouter(
  prisma: PrismaClient,
  authenticate: RequestHandler,
) {
  const router = Router(),
    ok = (res: Response, data: unknown, status = 200) =>
      res
        .status(status)
        .json({ data, meta: { requestId: (res.req as Req).requestId } }),
    fail = (res: Response, status: number, code: string, message: string) =>
      res.status(status).json({ error: { code, message } }),
    permit =
      (permission: string): RequestHandler =>
      (req: Req, res, next) =>
        req.auth?.permissions.includes(permission)
          ? next()
          : fail(
              res,
              403,
              "FORBIDDEN",
              "You do not have permission to perform this action.",
            ),
    audit = (req: Req, action: string, category: string, details: string) =>
      prisma.auditLog.create({
        data: {
          companyId: req.auth!.companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action,
          category,
          details,
          ipAddress: req.ip || "unknown",
        },
      });
  const companyDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8 },
  });
  const companyDocumentStorage = path.resolve(
    process.env.DOCUMENT_STORAGE_DIR
      ? path.join(process.env.DOCUMENT_STORAGE_DIR, "..", "company-documents")
      : "storage/company-documents",
  );
  const allowedDocumentTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  router.use("/operations", authenticate);
  router.get("/operations/workspace", async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId,
        admin = req.auth!.permissions.includes("operations.manage"),
        auditReader = req.auth!.permissions.includes("audit.read");
      const [assets, expenses, holidays, announcements, documents, auditLogs] =
        await prisma.$transaction([
          prisma.asset.findMany({
            where: admin
              ? { companyId }
              : req.auth!.employeeId
                ? { companyId, assignedToEmployeeId: req.auth!.employeeId }
                : { companyId, id: "__none__" },
            include: {
              assignedTo: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { purchaseDate: "desc" },
          }),
          prisma.expenseClaim.findMany({
            where: admin
              ? { companyId }
              : req.auth!.employeeId
                ? { companyId, employeeId: req.auth!.employeeId }
                : { companyId, id: "__none__" },
            include: {
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: { submittedAt: "desc" },
          }),
          prisma.holiday.findMany({
            where: { companyId },
            orderBy: { date: "asc" },
          }),
          prisma.announcement.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
            take: 200,
          }),
          prisma.companyDocument.findMany({
            where: { companyId },
            orderBy: { uploadedAt: "desc" },
          }),
          auditReader
            ? prisma.auditLog.findMany({
                where: { companyId },
                orderBy: { timestamp: "desc" },
                take: 500,
              })
            : prisma.auditLog.findMany({
                where: { companyId, userId: req.auth!.id },
                orderBy: { timestamp: "desc" },
                take: 100,
              }),
        ]);
      return ok(res, {
        assets,
        expenses,
        holidays,
        announcements,
        documents,
        auditLogs,
        canManage: admin,
        canReadAllAudit: auditReader,
      });
    } catch (error) {
      next(error);
    }
  });
  router.post(
    "/operations/assets",
    permit("operations.manage"),
    async (req: Req, res, next) => {
      try {
        const body = z
          .object({
            name: z.string().trim().min(2).max(160),
            category: z.string().trim().min(2).max(100),
            serialNumber: z.string().trim().min(2).max(160),
            assignedToEmployeeId: z.string().uuid().nullable().optional(),
            purchaseDate: z.coerce.date(),
            purchaseCost: z.number().min(0),
            currency: z.string().length(3).default("INR"),
            status: z
              .enum(["AVAILABLE", "ASSIGNED", "MAINTENANCE", "RETIRED"])
              .default("AVAILABLE"),
            condition: z.string().trim().min(2).max(80).default("NEW"),
          })
          .parse(req.body);
        if (
          body.assignedToEmployeeId &&
          !(await prisma.employee.findFirst({
            where: {
              id: body.assignedToEmployeeId,
              companyId: req.auth!.companyId,
            },
          }))
        )
          return fail(
            res,
            400,
            "EMPLOYEE_INVALID",
            "Assigned employee is not part of this company.",
          );
        const asset = await prisma.asset.create({
          data: {
            ...body,
            companyId: req.auth!.companyId,
            assignedDate: body.assignedToEmployeeId ? new Date() : null,
            status: body.assignedToEmployeeId ? "ASSIGNED" : body.status,
          },
        });
        await audit(
          req,
          "CREATE_ASSET",
          "ASSET",
          `Asset ${asset.serialNumber} created.`,
        );
        return ok(res, asset, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.patch(
    "/operations/assets/:id/assignment",
    permit("operations.manage"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({ employeeId: z.string().uuid().nullable() })
            .parse(req.body),
          companyId = req.auth!.companyId,
          asset = await prisma.asset.findFirst({
            where: { id: String(req.params.id), companyId },
          });
        if (!asset)
          return fail(res, 404, "ASSET_NOT_FOUND", "Asset was not found.");
        if (
          body.employeeId &&
          !(await prisma.employee.findFirst({
            where: { id: body.employeeId, companyId },
          }))
        )
          return fail(
            res,
            400,
            "EMPLOYEE_INVALID",
            "Assigned employee is not part of this company.",
          );
        const updated = await prisma.asset.update({
          where: { id: asset.id },
          data: {
            assignedToEmployeeId: body.employeeId,
            assignedDate: body.employeeId ? new Date() : null,
            status: body.employeeId ? "ASSIGNED" : "AVAILABLE",
          },
        });
        await audit(
          req,
          "ASSIGN_ASSET",
          "ASSET",
          `Asset ${asset.serialNumber} ${body.employeeId ? `assigned to ${body.employeeId}` : "returned"}.`,
        );
        return ok(res, updated);
      } catch (error) {
        next(error);
      }
    },
  );
  const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_RECEIPT_SIZE_BYTES, files: 1 },
  });

  router.get(
    "/operations/expenses/policy",
    async (req: Req, res, next) => {
      try {
        const policy = await resolveCompanyExpensePolicy(prisma, req.auth!.companyId);
        return ok(res, policy);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/operations/expenses/:id/receipt",
    receiptUpload.single("receipt"),
    async (req: Req, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const claim = await prisma.expenseClaim.findFirst({
          where: { id: String(req.params.id), companyId },
        });
        if (!claim) {
          return fail(res, 404, "EXPENSE_NOT_FOUND", "Expense claim was not found.");
        }
        if (claim.status !== "PENDING") {
          return fail(
            res,
            409,
            "EXPENSE_NOT_PENDING",
            "Cannot attach or modify receipt for an expense claim that is not pending.",
          );
        }

        const isOwner = req.auth!.employeeId && req.auth!.employeeId === claim.employeeId;
        const canReview =
          req.auth!.permissions.includes("expense.review") ||
          req.auth!.permissions.includes("operations.manage");
        if (!isOwner && !canReview) {
          return fail(
            res,
            403,
            "FORBIDDEN",
            "You are not authorized to upload a receipt for this claim.",
          );
        }

        if (!req.file) {
          return fail(res, 400, "RECEIPT_REQUIRED", "Choose a receipt file to upload.");
        }

        if (!ALLOWED_RECEIPT_MIME_TYPES.has(req.file.mimetype)) {
          return fail(
            res,
            415,
            "RECEIPT_TYPE_INVALID",
            "Unsupported receipt format. Allowed formats: PDF, JPEG, PNG.",
          );
        }

        const ext = path
          .extname(req.file.originalname)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, "");
        if (!ALLOWED_RECEIPT_EXTENSIONS.has(ext)) {
          return fail(res, 415, "RECEIPT_TYPE_INVALID", "Invalid receipt file extension.");
        }

        if (req.file.size > MAX_RECEIPT_SIZE_BYTES) {
          return fail(res, 413, "RECEIPT_TOO_LARGE", "Receipt file size exceeds 10 MB limit.");
        }

        const id = crypto.randomUUID();
        const storageName = `${id}${ext}`;
        const companyReceiptDir = path.join(RECEIPT_STORAGE_ROOT, companyId);
        await mkdir(companyReceiptDir, { recursive: true });
        await writeFile(path.join(companyReceiptDir, storageName), req.file.buffer, { flag: "wx" });

        // Clean up previous receipt if one was attached
        const oldReceipt = parseReceiptFromNotes(claim.notes);
        if (oldReceipt) {
          try {
            const oldDoc = await prisma.employeeDocument.findFirst({
              where: { id: oldReceipt.docId, companyId },
            });
            if (oldDoc) {
              await prisma.employeeDocument.deleteMany({ where: { id: oldDoc.id, companyId } });
              const [cId, oldStorageName] = oldDoc.objectKey.split("/");
              if (cId === companyId && oldStorageName) {
                await unlink(path.join(RECEIPT_STORAGE_ROOT, companyId, oldStorageName)).catch(() => {});
              }
            }
          } catch {
            // non-fatal cleanup
          }
        }

        const objectKey = `${companyId}/${storageName}`;
        const doc = await prisma.employeeDocument.create({
          data: {
            id,
            companyId,
            employeeId: claim.employeeId,
            documentType: "EXPENSE_RECEIPT",
            title: `Receipt for ${claim.title}`.slice(0, 160),
            objectKey,
            fileName: req.file.originalname.slice(0, 200),
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
            issueDate: claim.expenseDate,
            verificationStatus: "VERIFIED",
            verifiedById: req.auth!.id,
            verifiedAt: new Date(),
          },
        });

        const updatedNotes = attachReceiptToNotes(claim.notes, {
          docId: doc.id,
          fileName: req.file.originalname.slice(0, 200),
          mime: req.file.mimetype,
          size: req.file.size,
        });

        const updatedClaim = await prisma.expenseClaim.update({
          where: { id: claim.id },
          data: { notes: updatedNotes },
        });

        await audit(
          req,
          "UPLOAD_EXPENSE_RECEIPT",
          "EXPENSE",
          `Receipt attached to expense claim ${claim.id}.`,
        );

        return ok(res, { claim: updatedClaim, document: doc }, 201);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/operations/expenses/:id/receipt",
    async (req: Req, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const claim = await prisma.expenseClaim.findFirst({
          where: { id: String(req.params.id), companyId },
        });
        if (!claim) {
          return fail(res, 404, "EXPENSE_NOT_FOUND", "Expense claim was not found.");
        }

        const isOwner = req.auth!.employeeId && req.auth!.employeeId === claim.employeeId;
        const canView = req.auth!.permissions.some((p) =>
          ["expense.review", "operations.manage", "audit.read"].includes(p),
        );
        if (!isOwner && !canView) {
          return fail(res, 403, "FORBIDDEN", "You are not authorized to view this receipt.");
        }

        let doc: { objectKey: string; fileName: string; mimeType: string } | null = null;
        const receiptMeta = parseReceiptFromNotes(claim.notes);
        if (receiptMeta) {
          doc = await prisma.employeeDocument.findFirst({
            where: { id: receiptMeta.docId, companyId },
          });
        }
        if (!doc) {
          doc = await prisma.employeeDocument.findFirst({
            where: {
              companyId,
              employeeId: claim.employeeId,
              documentType: "EXPENSE_RECEIPT",
              issueDate: claim.expenseDate,
            },
            orderBy: { createdAt: "desc" },
          });
        }

        if (!doc) {
          return fail(res, 404, "RECEIPT_NOT_FOUND", "Receipt not found for this claim.");
        }

        const [cId, storageName] = doc.objectKey.split("/");
        if (cId !== companyId || !storageName || storageName !== path.basename(storageName)) {
          return fail(res, 400, "RECEIPT_KEY_INVALID", "Receipt storage key is invalid.");
        }

        const filePath = path.join(RECEIPT_STORAGE_ROOT, companyId, storageName);
        const contents = await readFile(filePath);
        res.setHeader("Content-Type", doc.mimeType);
        res.setHeader(
          "Content-Disposition",
          `inline; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
        );
        return res.send(contents);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return fail(
            res,
            404,
            "RECEIPT_FILE_NOT_FOUND",
            "The stored receipt file was not found on disk.",
          );
        }
        next(error);
      }
    },
  );

  router.delete(
    "/operations/expenses/:id/receipt",
    async (req: Req, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const claim = await prisma.expenseClaim.findFirst({
          where: { id: String(req.params.id), companyId },
        });
        if (!claim) {
          return fail(res, 404, "EXPENSE_NOT_FOUND", "Expense claim was not found.");
        }
        if (claim.status !== "PENDING") {
          return fail(
            res,
            409,
            "EXPENSE_NOT_PENDING",
            "Cannot remove receipt from an expense claim that is not pending.",
          );
        }

        const isOwner = req.auth!.employeeId && req.auth!.employeeId === claim.employeeId;
        const canManage =
          req.auth!.permissions.includes("operations.manage") ||
          req.auth!.permissions.includes("expense.review");
        if (!isOwner && !canManage) {
          return fail(res, 403, "FORBIDDEN", "You are not authorized to delete this receipt.");
        }

        const policy = await resolveCompanyExpensePolicy(prisma, companyId);
        if (claim.amount > policy.requiresReceiptAbove) {
          return fail(
            res,
            400,
            "EXPENSE_RECEIPT_REQUIRED",
            `Receipt is required for claims above ₹${policy.requiresReceiptAbove.toLocaleString("en-IN")}. Cannot remove receipt.`,
          );
        }

        const receiptMeta = parseReceiptFromNotes(claim.notes);
        if (receiptMeta) {
          const doc = await prisma.employeeDocument.findFirst({
            where: { id: receiptMeta.docId, companyId },
          });
          if (doc) {
            await prisma.employeeDocument.deleteMany({ where: { id: doc.id, companyId } });
            const [cId, storageName] = doc.objectKey.split("/");
            if (cId === companyId && storageName) {
              await unlink(path.join(RECEIPT_STORAGE_ROOT, companyId, storageName)).catch(() => {});
            }
          }
        }

        const updatedNotes = detachReceiptFromNotes(claim.notes);
        const updatedClaim = await prisma.expenseClaim.update({
          where: { id: claim.id },
          data: { notes: updatedNotes || null },
        });

        await audit(
          req,
          "DELETE_EXPENSE_RECEIPT",
          "EXPENSE",
          `Receipt removed from expense claim ${claim.id}.`,
        );

        return ok(res, { claim: updatedClaim });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/operations/expenses/:id/review",
    permit("expense.review"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({ status: z.enum(["APPROVED", "REJECTED"]) })
            .parse(req.body);
        const existingClaim = await prisma.expenseClaim.findFirst({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
          },
        });
        if (!existingClaim)
          return fail(
            res,
            404,
            "EXPENSE_NOT_FOUND",
            "Expense claim was not found.",
          );
        if (existingClaim.status !== "PENDING")
          return fail(
            res,
            409,
            "EXPENSE_ALREADY_REVIEWED",
            `Expense claim has already been ${existingClaim.status.toLowerCase()}. Cannot review again.`,
          );
        const updated = await prisma.expenseClaim.update({
          where: { id: existingClaim.id },
          data: {
            status: body.status,
            approvedById: req.auth!.id,
            approvedAt: new Date(),
          },
        });
        await audit(
          req,
          "REVIEW_EXPENSE",
          "EXPENSE",
          `Expense ${existingClaim.id} ${body.status.toLowerCase()}.`,
        );
        return ok(res, updated);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/operations/holidays",
    permit("operations.manage"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({
              name: z.string().trim().min(2).max(160),
              date: z.coerce.date(),
              type: z.string().trim().min(2).max(80).default("NATIONAL"),
            })
            .parse(req.body),
          item = await prisma.holiday.create({
            data: { ...body, companyId: req.auth!.companyId },
          });
        await audit(
          req,
          "CREATE_HOLIDAY",
          "HOLIDAY",
          `Holiday ${item.name} created.`,
        );
        return ok(res, item, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/operations/announcements",
    permit("operations.manage"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({
              title: z.string().trim().min(2).max(200),
              content: z.string().trim().min(2).max(20_000),
              priority: z
                .enum(["LOW", "NORMAL", "HIGH", "URGENT"])
                .default("NORMAL"),
            })
            .parse(req.body),
          item = await prisma.announcement.create({
            data: {
              ...body,
              companyId: req.auth!.companyId,
              authorName: req.auth!.id,
              authorRole: req.auth!.role,
            },
          });
        await audit(
          req,
          "CREATE_ANNOUNCEMENT",
          "ANNOUNCEMENT",
          `Announcement ${item.id} created.`,
        );
        const notificationResult = await notifyAnnouncementAudience(prisma, item);
        if (notificationResult.queued < notificationResult.recipients) {
          console.warn(
            `Announcement ${item.id}: queued notifications for ${notificationResult.queued}/${notificationResult.recipients} users.`,
          );
        }
        return ok(res, item, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/operations/company-documents/upload",
    permit("operations.manage"),
    companyDocumentUpload.single("document"),
    async (req: Req, res, next) => {
      try {
        if (!req.file)
          return fail(res, 400, "DOCUMENT_REQUIRED", "Choose a company document to upload.");
        if (!allowedDocumentTypes.has(req.file.mimetype))
          return fail(res, 415, "DOCUMENT_TYPE_INVALID", "Upload a PDF, JPG, PNG, DOC, or DOCX file.");
        const body = z.object({
          category: z.string().trim().min(2).max(100),
          title: z.string().trim().min(2).max(200),
        }).parse(req.body);
        const id = crypto.randomUUID();
        const extension = path.extname(req.file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
        const storageName = `${id}${extension}`;
        const companyDirectory = path.join(companyDocumentStorage, req.auth!.companyId);
        await mkdir(companyDirectory, { recursive: true });
        await writeFile(path.join(companyDirectory, storageName), req.file.buffer, { flag: "wx" });
        const objectKey = `${req.auth!.companyId}/${storageName}`;
        const item = await prisma.companyDocument.create({
          data: {
            id,
            companyId: req.auth!.companyId,
            title: body.title,
            category: body.category,
            fileSize: `${req.file.size}`,
            fileType: req.file.mimetype,
            downloadUrl: `/api/v1/operations/company-documents/${id}/file`,
            objectKey,
            fileName: req.file.originalname.slice(0, 255),
            mimeType: req.file.mimetype,
            sizeBytes: req.file.size,
          },
        });
        await audit(req, "UPLOAD_COMPANY_DOCUMENT", "DOCUMENT", `Company document ${item.id} uploaded.`);
        return ok(res, item, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/operations/company-documents/:id/file",
    async (req: Req, res, next) => {
      try {
        const document = await prisma.companyDocument.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
        });
        if (!document)
          return fail(res, 404, "DOCUMENT_NOT_FOUND", "Company document was not found.");
        if (!document.objectKey || !document.fileName || !document.mimeType)
          return fail(res, 409, "DOCUMENT_FILE_UNAVAILABLE", "This legacy record contains a URL only and has no uploaded file.");
        const [companyId, storageName] = document.objectKey.split("/");
        if (companyId !== req.auth!.companyId || !storageName || storageName !== path.basename(storageName))
          return fail(res, 400, "DOCUMENT_KEY_INVALID", "Document storage reference is invalid.");
        const contents = await readFile(path.join(companyDocumentStorage, companyId, storageName));
        res.setHeader("Content-Type", document.mimeType);
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
        return res.send(contents);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return fail(res, 404, "DOCUMENT_FILE_NOT_FOUND", "The stored company document file was not found.");
        next(error);
      }
    },
  );
  router.post(
    "/operations/company-documents",
    permit("operations.manage"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({
              title: z.string().trim().min(2).max(200),
              category: z.string().trim().min(2).max(100),
              fileSize: z.string().trim().min(1).max(30),
              fileType: z.string().trim().min(1).max(30),
              downloadUrl: z.string().url().max(2000),
            })
            .parse(req.body),
          item = await prisma.companyDocument.create({
            data: { ...body, companyId: req.auth!.companyId },
          });
        await audit(
          req,
          "CREATE_COMPANY_DOCUMENT",
          "DOCUMENT",
          `Company document ${item.id} registered.`,
        );
        return ok(res, item, 201);
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
