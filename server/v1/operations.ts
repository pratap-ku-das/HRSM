import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

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
  router.patch(
    "/operations/expenses/:id/review",
    permit("expense.review"),
    async (req: Req, res, next) => {
      try {
        const body = z
            .object({ status: z.enum(["APPROVED", "REJECTED"]) })
            .parse(req.body),
          claim = await prisma.expenseClaim.findFirst({
            where: {
              id: String(req.params.id),
              companyId: req.auth!.companyId,
              status: "PENDING",
            },
          });
        if (!claim)
          return fail(
            res,
            404,
            "EXPENSE_NOT_PENDING",
            "Pending expense claim was not found.",
          );
        const updated = await prisma.expenseClaim.update({
          where: { id: claim.id },
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
          `Expense ${claim.id} ${body.status.toLowerCase()}.`,
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
        return ok(res, item, 201);
      } catch (error) {
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
