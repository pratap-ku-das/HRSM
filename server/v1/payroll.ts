import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  calculatePayroll,
  type SalaryComponentInput,
  type StatutoryRuleInput,
} from "./payrollEngine.js";
import { startConfiguredWorkflow } from "./workflows.js";
import { emitNotification } from "./notifications.js";

type PayrollRequest = Request & {
  auth?: { id: string; companyId: string; role: string; permissions: string[] };
  requestId?: string;
};
const uuid = z.string().uuid();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthRange = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, value - 1, 1)),
    end: new Date(Date.UTC(year, value, 0)),
  };
};
const countWorkingDays = (start: Date, end: Date) => {
  let count = 0;
  for (
    let date = new Date(start);
    date <= end;
    date = new Date(date.getTime() + 86_400_000)
  )
    if (![0, 6].includes(date.getUTCDay())) count++;
  return count;
};
const getPeriodEndCutoff = (periodEnd: Date): Date => {
  const d = new Date(periodEnd);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
};

export function createPayrollRouter(
  prisma: PrismaClient,
  authenticate: RequestHandler,
) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) =>
    res
      .status(status)
      .json({
        data,
        meta: { requestId: (res.req as PayrollRequest).requestId },
      });
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });
  const permit =
    (permission: string): RequestHandler =>
    (req: PayrollRequest, res, next) =>
      req.auth?.permissions.includes(permission)
        ? next()
        : fail(
            res,
            403,
            "FORBIDDEN",
            "You do not have permission to perform this action.",
          );
  const audit = (req: PayrollRequest, action: string, details: string) =>
    prisma.auditLog.create({
      data: {
        companyId: req.auth!.companyId,
        userId: req.auth!.id,
        userName: req.auth!.id,
        userRole: req.auth!.role,
        action,
        category: "PAYROLL",
        details,
        ipAddress: req.ip || "unknown",
      },
    });
  router.use("/payroll", authenticate, permit("payroll.manage"));

  router.get("/payroll/config", async (req: PayrollRequest, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const [structures, revisions, rules, loans, runs] =
        await prisma.$transaction([
          prisma.salaryStructure.findMany({
            where: { companyId },
            include: {
              components: { orderBy: { sequence: "asc" } },
              revisions: false,
            },
            orderBy: { name: "asc" },
          }),
          prisma.employeeSalaryRevision.findMany({
            where: { companyId },
            include: {
              employee: {
                select: {
                  id: true,
                  employeeCode: true,
                  firstName: true,
                  lastName: true,
                },
              },
              structure: true,
            },
            orderBy: { effectiveFrom: "desc" },
          }),
          prisma.statutoryRuleVersion.findMany({
            where: { companyId },
            orderBy: [{ type: "asc" }, { effectiveFrom: "desc" }],
          }),
          prisma.employeeLoan.findMany({
            where: { companyId },
            include: {
              employee: {
                select: { employeeCode: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: "desc" },
          }),
          prisma.payrollRun.findMany({
            where: { companyId },
            include: { lines: true },
            orderBy: { month: "desc" },
          }),
        ]);
      return ok(res, { structures, revisions, rules, loans, runs });
    } catch (error) {
      next(error);
    }
  });

  router.post("/payroll/structures", async (req: PayrollRequest, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          code: z
            .string()
            .trim()
            .min(2)
            .max(40)
            .transform((v) => v.toUpperCase()),
          description: z.string().max(300).optional(),
          components: z
            .array(
              z.object({
                code: z
                  .string()
                  .trim()
                  .min(2)
                  .max(40)
                  .transform((v) => v.toUpperCase()),
                name: z.string().trim().min(2).max(100),
                kind: z.enum([
                  "EARNING",
                  "DEDUCTION",
                  "EMPLOYER_CONTRIBUTION",
                  "REIMBURSEMENT",
                ]),
                method: z
                  .enum(["FIXED", "PERCENT_BASIC", "PERCENT_GROSS"])
                  .default("FIXED"),
                value: z.number().min(0),
                taxable: z.boolean().default(true),
                proratable: z.boolean().default(true),
                statutoryType: z
                  .enum(["PF", "ESI", "PROFESSIONAL_TAX", "TDS", "LWF"])
                  .optional(),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(req.body);
      const value = await prisma.salaryStructure.create({
        data: {
          companyId: req.auth!.companyId,
          name: body.name,
          code: body.code,
          description: body.description,
          components: {
            create: body.components.map((item, sequence) => ({
              ...item,
              sequence: sequence + 1,
            })),
          },
        },
        include: { components: true },
      });
      await audit(req, "CREATE_SALARY_STRUCTURE", `${value.code} created.`);
      return ok(res, value, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post("/payroll/revisions", async (req: PayrollRequest, res, next) => {
    try {
      const body = z
        .object({
          employeeId: uuid,
          structureId: uuid,
          effectiveFrom: z.coerce.date(),
          annualCtc: z.number().positive(),
          componentValues: z.record(z.string(), z.number()).optional(),
          reason: z.string().max(500).optional(),
        })
        .parse(req.body);
      const companyId = req.auth!.companyId;
      const [employee, structure] = await Promise.all([
        prisma.employee.findFirst({
          where: { id: body.employeeId, companyId },
        }),
        prisma.salaryStructure.findFirst({
          where: { id: body.structureId, companyId, active: true },
        }),
      ]);
      if (!employee || !structure)
        return fail(
          res,
          400,
          "SALARY_ASSIGNMENT_INVALID",
          "Employee or structure is not part of this company.",
        );
      const result = await prisma.$transaction(async (tx) => {
        const revision = await tx.employeeSalaryRevision.create({
          data: {
            ...body,
            companyId,
            status: "PENDING",
            componentValues: body.componentValues,
          },
        });
        const workflow = await startConfiguredWorkflow(tx, {
          companyId,
          requesterUserId: req.auth!.id,
          module: "SALARY_REVISION",
          subjectType: "EmployeeSalaryRevision",
          subjectId: revision.id,
          title: `Salary revision for ${employee.employeeCode}`,
          summary: body.reason,
          payload: {
            employeeId: employee.id,
            effectiveFrom: body.effectiveFrom.toISOString(),
            annualCtc: body.annualCtc,
          },
        });
        if (workflow)
          await tx.employeeSalaryRevision.update({
            where: { id: revision.id },
            data: { workflowInstanceId: workflow.id },
          });
        return { ...revision, workflowInstanceId: workflow?.id };
      });
      return ok(res, result, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/payroll/revisions/:id/approve",
    permit("payroll.approve"),
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const revision = await prisma.employeeSalaryRevision.findFirst({
          where: { id: String(req.params.id), companyId, status: "PENDING" },
        });
        if (!revision)
          return fail(
            res,
            409,
            "REVISION_STATE_INVALID",
            "Pending salary revision was not found.",
          );
        await prisma.$transaction([
          prisma.employeeSalaryRevision.updateMany({
            where: {
              companyId,
              employeeId: revision.employeeId,
              status: "APPROVED",
              effectiveFrom: { lte: revision.effectiveFrom },
            },
            data: { status: "SUPERSEDED" },
          }),
          prisma.employeeSalaryRevision.update({
            where: { id: revision.id },
            data: {
              status: "APPROVED",
              approvedById: req.auth!.id,
              approvedAt: new Date(),
            },
          }),
          audit(
            req,
            "APPROVE_SALARY_REVISION",
            `Salary revision ${revision.id} approved.`,
          ),
        ]);
        return ok(res, { status: "APPROVED" });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/payroll/statutory-rules",
    async (req: PayrollRequest, res, next) => {
      try {
        const body = z
          .object({
            type: z.enum(["PF", "ESI", "PROFESSIONAL_TAX", "TDS", "LWF"]),
            jurisdiction: z.string().trim().min(2).max(30).default("IN"),
            stateCode: z.string().trim().max(10).optional(),
            effectiveFrom: z.coerce.date(),
            effectiveTo: z.coerce.date().optional(),
            configuration: z.record(z.string(), z.unknown()),
            sourceNote: z.string().trim().max(500).optional(),
          })
          .parse(req.body);
        const value = await prisma.statutoryRuleVersion.create({
          data: {
            ...body,
            companyId: req.auth!.companyId,
            configuration: body.configuration as Prisma.InputJsonValue,
          },
        });
        await audit(
          req,
          "CREATE_STATUTORY_RULE",
          `${value.type} rule version created.`,
        );
        return ok(res, value, 201);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/payroll/loans", async (req: PayrollRequest, res, next) => {
    try {
      const body = z
        .object({
          employeeId: uuid,
          type: z.string().trim().min(2).max(80),
          principal: z.number().positive(),
          installment: z.number().positive(),
          interestRate: z.number().min(0).max(100).default(0),
          startsOn: z.coerce.date(),
        })
        .parse(req.body);
      if (
        !(await prisma.employee.findFirst({
          where: { id: body.employeeId, companyId: req.auth!.companyId },
        }))
      )
        return fail(
          res,
          400,
          "EMPLOYEE_INVALID",
          "Employee is not part of this company.",
        );
      return ok(
        res,
        await prisma.employeeLoan.create({
          data: {
            ...body,
            outstanding: body.principal,
            status: "ACTIVE",
            companyId: req.auth!.companyId,
          },
        }),
        201,
      );
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/payroll/adjustments",
    async (req: PayrollRequest, res, next) => {
      try {
        const body = z
          .object({
            employeeId: uuid,
            month: z.string().regex(monthPattern),
            code: z
              .string()
              .trim()
              .min(2)
              .max(40)
              .transform((v) => v.toUpperCase()),
            name: z.string().trim().min(2).max(100),
            kind: z.enum([
              "EARNING",
              "DEDUCTION",
              "EMPLOYER_CONTRIBUTION",
              "REIMBURSEMENT",
            ]),
            amount: z.number(),
            reason: z.string().trim().min(3).max(500),
          })
          .parse(req.body);
        if (body.kind === "REIMBURSEMENT") {
          return fail(
            res,
            400,
            "REIMBURSEMENT_NOT_ALLOWED",
            "Manual reimbursement adjustments are not permitted. Reimbursements must be ingested from approved Expense Claims.",
          );
        }
        if (
          !(await prisma.employee.findFirst({
            where: { id: body.employeeId, companyId: req.auth!.companyId },
          }))
        )
          return fail(
            res,
            400,
            "EMPLOYEE_INVALID",
            "Employee is not part of this company.",
          );
        return ok(
          res,
          await prisma.payrollAdjustment.create({
            data: {
              ...body,
              companyId: req.auth!.companyId,
              createdById: req.auth!.id,
            },
          }),
          201,
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/payroll/runs", async (req: PayrollRequest, res, next) => {
    try {
      const body = z
        .object({ month: z.string().regex(monthPattern) })
        .parse(req.body);
      const range = monthRange(body.month);
      const value = await prisma.payrollRun.create({
        data: {
          companyId: req.auth!.companyId,
          month: body.month,
          status: "DRAFT",
          periodStart: range.start,
          periodEnd: range.end,
          totalEmployees: 0,
          totalGrossSalary: 0,
          totalDeductions: 0,
          totalNetPayout: 0,
        },
      });
      await audit(req, "CREATE_PAYROLL_RUN", `Payroll ${body.month} created.`);
      return ok(res, value, 201);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/payroll/runs/:id/lock-attendance",
    async (req: PayrollRequest, res, next) => {
      try {
        const run = await prisma.payrollRun.findFirst({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
            status: "DRAFT",
          },
        });
        if (!run?.periodStart || !run.periodEnd)
          return fail(
            res,
            409,
            "PAYROLL_STATE_INVALID",
            "Only a draft payroll run can lock attendance.",
          );
        const result = await prisma.$transaction(async (tx) => {
          const lock = await tx.attendancePeriodLock.create({
            data: {
              companyId: run.companyId,
              periodStart: run.periodStart!,
              periodEnd: run.periodEnd!,
              lockedById: req.auth!.id,
              reason: `Payroll ${run.month}`,
            },
          });
          return tx.payrollRun.update({
            where: { id: run.id },
            data: { status: "ATTENDANCE_LOCKED", attendanceLockId: lock.id },
          });
        });
        await audit(
          req,
          "LOCK_PAYROLL_ATTENDANCE",
          `Attendance locked for ${run.month}.`,
        );
        return ok(res, result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/payroll/runs/:id/eligible-expenses",
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const run = await prisma.payrollRun.findFirst({
          where: { id: String(req.params.id), companyId },
        });
        if (!run) {
          return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
        }
        if (!run.periodEnd) {
          return fail(res, 409, "PAYROLL_STATE_INVALID", "Payroll run has no period end date.");
        }

        const cutoff = getPeriodEndCutoff(run.periodEnd);

        const eligible = await prisma.expenseClaim.findMany({
          where: {
            companyId,
            status: "APPROVED",
            approvedAt: { lte: cutoff },
            payrollAdjustment: null,
            reimbursedAt: null,
            employee: {
              companyId,
              status: { in: ["ACTIVE", "ON_PROBATION", "ON_LEAVE"] },
            },
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
              },
            },
          },
          orderBy: { approvedAt: "asc" },
        });

        const totalAmount = Math.round(eligible.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

        return ok(res, {
          payrollRunId: run.id,
          month: run.month,
          periodEnd: run.periodEnd,
          cutoff,
          count: eligible.length,
          totalAmount,
          claims: eligible,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/payroll/runs/:id/ingest-expenses",
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const runId = String(req.params.id);
        const idempotencyKey = (
          req.header("idempotency-key") ||
          (req.headers["x-idempotency-key"] as string | undefined)
        )?.trim();

        if (idempotencyKey) {
          const oldRecord = await prisma.idempotencyRecord.findUnique({
            where: {
              companyId_userId_key_operation: {
                companyId,
                userId: req.auth!.id,
                key: idempotencyKey,
                operation: `INGEST_EXPENSES_${runId}`,
              },
            },
          });
          if (oldRecord) {
            return ok(res, oldRecord.responseJson, oldRecord.statusCode);
          }
        }

        const body = z
          .object({
            expenseClaimIds: z.array(uuid).optional(),
          })
          .parse(req.body || {});

        const requestedIds = body.expenseClaimIds && body.expenseClaimIds.length > 0 ? body.expenseClaimIds : null;

        const result = await prisma.$transaction(async (tx) => {
          // 1. Lock target PayrollRun row FOR UPDATE
          const [run] = await tx.$queryRaw<Array<{
            id: string;
            companyId: string;
            month: string;
            status: string;
            periodEnd: Date | null;
          }>>`
            SELECT id, "companyId", month, status, "periodEnd"
            FROM "PayrollRun"
            WHERE id = ${runId} AND "companyId" = ${companyId}
            FOR UPDATE
          `;

          if (!run) {
            throw new Error("PAYROLL_RUN_NOT_FOUND");
          }

          if (
            !["DRAFT", "ATTENDANCE_REVIEW", "ATTENDANCE_LOCKED", "ATTENDANCE_FINALIZED", "CALCULATED"].includes(
              run.status,
            )
          ) {
            throw new Error(`PAYROLL_STATE_INVALID:${run.status}`);
          }

          if (!run.periodEnd) {
            throw new Error("PAYROLL_PERIOD_END_MISSING");
          }

          const cutoff = getPeriodEndCutoff(run.periodEnd);

          // 2. Query eligible claims inside locked transaction
          const eligibleClaims = await tx.expenseClaim.findMany({
            where: {
              companyId,
              status: "APPROVED",
              approvedAt: { lte: cutoff },
              payrollAdjustment: null,
              reimbursedAt: null,
              employee: {
                companyId,
                status: { in: ["ACTIVE", "ON_PROBATION", "ON_LEAVE"] },
              },
              ...(requestedIds ? { id: { in: requestedIds } } : {}),
            },
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeCode: true,
                },
              },
            },
          });

          // If specific claim IDs were requested, all of them must be eligible
          if (requestedIds && eligibleClaims.length !== requestedIds.length) {
            const foundIds = new Set(eligibleClaims.map((c) => c.id));
            const missing = requestedIds.filter((id) => !foundIds.has(id));
            throw new Error(`CLAIMS_NOT_ELIGIBLE:${missing.join(",")}`);
          }

          if (eligibleClaims.length === 0) {
            return {
              count: 0,
              totalAmount: 0,
              adjustments: [],
              claims: [],
              invalidatedCalculation: false,
            };
          }

          const adjustments: Array<import("@prisma/client").PayrollAdjustment> = [];
          for (const claim of eligibleClaims) {
            const adj = await tx.payrollAdjustment.create({
              data: {
                companyId,
                employeeId: claim.employeeId,
                month: run.month,
                code: "EXPENSE_REIMBURSEMENT",
                name: `Reimbursement: ${claim.title}`,
                kind: "REIMBURSEMENT",
                amount: claim.amount,
                reason: `Expense claim ${claim.id} (${claim.title}) ingested into payroll run ${run.month}`,
                createdById: req.auth!.id,
                expenseClaimId: claim.id,
                payrollRunId: run.id,
              },
            });

            await tx.expenseClaim.update({
              where: { id: claim.id },
              data: { status: "INGESTED" },
            });

            adjustments.push(adj);
          }

          let invalidatedCalculation = false;
          // Invalidate stale calculated payroll if run was already CALCULATED
          if (run.status === "CALCULATED") {
            await tx.payrollLine.deleteMany({
              where: { payrollRunId: run.id },
            });
            await tx.payrollRun.update({
              where: { id: run.id },
              data: {
                status: "ATTENDANCE_FINALIZED",
                calculatedAt: null,
                totalGrossSalary: 0,
                totalDeductions: 0,
                totalNetPayout: 0,
                totalEmployees: 0,
              },
            });
            invalidatedCalculation = true;
          }

          const totalAmount = Math.round(eligibleClaims.reduce((s, c) => s + c.amount, 0) * 100) / 100;

          return {
            count: eligibleClaims.length,
            totalAmount,
            adjustments,
            claims: eligibleClaims,
            invalidatedCalculation,
          };
        });

        if (idempotencyKey) {
          await prisma.idempotencyRecord.create({
            data: {
              companyId,
              userId: req.auth!.id,
              key: idempotencyKey,
              operation: `INGEST_EXPENSES_${runId}`,
              statusCode: 200,
              responseJson: result as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          });
        }

        await audit(
          req,
          "INGEST_PAYROLL_EXPENSES",
          `Ingested ${result.count} expense claims (₹${result.totalAmount}) into payroll run ${runId}.`,
        );

        return ok(res, result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "PAYROLL_RUN_NOT_FOUND") {
            return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
          }
          if (error.message.startsWith("PAYROLL_STATE_INVALID")) {
            return fail(
              res,
              409,
              "PAYROLL_STATE_INVALID",
              `Cannot ingest expenses into payroll in state: ${error.message.split(":")[1]}.`,
            );
          }
          if (error.message === "PAYROLL_PERIOD_END_MISSING") {
            return fail(res, 409, "PAYROLL_STATE_INVALID", "Payroll run has no period end date.");
          }
          if (error.message.startsWith("CLAIMS_NOT_ELIGIBLE")) {
            return fail(
              res,
              400,
              "EXPENSE_CLAIM_NOT_ELIGIBLE",
              `One or more requested expense claims are not eligible for ingestion: ${error.message.split(":")[1]}`,
            );
          }
        }
        next(error);
      }
    },
  );

  router.post(
    "/payroll/runs/:id/calculate",
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const runId = String(req.params.id);

        const result = await prisma.$transaction(async (tx) => {
          // 1. Lock PayrollRun row exclusively
          const [run] = await tx.$queryRaw<Array<{
            id: string;
            companyId: string;
            month: string;
            status: string;
            periodStart: Date | null;
            periodEnd: Date | null;
          }>>`
            SELECT id, "companyId", month, status, "periodStart", "periodEnd"
            FROM "PayrollRun"
            WHERE id = ${runId} AND "companyId" = ${companyId}
            FOR UPDATE
          `;

          if (!run) {
            throw new Error("PAYROLL_RUN_NOT_FOUND");
          }

          if (!["ATTENDANCE_LOCKED", "ATTENDANCE_FINALIZED", "CALCULATED"].includes(run.status)) {
            throw new Error("PAYROLL_STATE_INVALID");
          }

          if (!run.periodStart || !run.periodEnd) {
            throw new Error("ATTENDANCE_NOT_LOCKED");
          }

          const employees = await tx.employee.findMany({
            where: {
              companyId,
              status: { in: ["ACTIVE", "ON_PROBATION", "ON_LEAVE"] },
            },
            select: { id: true },
          });

          const days = countWorkingDays(run.periodStart, run.periodEnd);

          const rules = await tx.statutoryRuleVersion.findMany({
            where: {
              companyId,
              active: true,
              effectiveFrom: { lte: run.periodEnd },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: run.periodStart } },
              ],
            },
          });

          // Section 15: CRITICAL DATA-SCOPE RULE
          const adjustments = await tx.payrollAdjustment.findMany({
            where: {
              companyId,
              month: run.month,
              OR: [
                { kind: { not: "REIMBURSEMENT" } },
                { kind: "REIMBURSEMENT", payrollRunId: run.id },
              ],
            },
          });

          const lines: Array<{ employeeId: string } & ReturnType<typeof calculatePayroll>> = [];

          for (const employee of employees) {
            const revision = await tx.employeeSalaryRevision.findFirst({
              where: {
                companyId,
                employeeId: employee.id,
                status: "APPROVED",
                effectiveFrom: { lte: run.periodEnd },
              },
              include: {
                structure: {
                  include: { components: { orderBy: { sequence: "asc" } } },
                },
              },
              orderBy: { effectiveFrom: "desc" },
            });
            if (!revision) continue;

            const snapshot = await tx.payrollAttendanceReview.findUnique({
              where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: employee.id } },
            });

            const attendance = snapshot ? [] : await tx.attendanceRecord.findMany({
              where: { companyId, employeeId: employee.id, date: { gte: run.periodStart, lte: run.periodEnd } },
            });

            const payableDays = snapshot
              ? snapshot.presentDays + snapshot.lateDays + snapshot.halfDays * 0.5 + snapshot.paidLeaveDays
              : attendance.reduce((sum, item) => sum + (["PRESENT", "LATE"].includes(item.status) ? 1 : item.status === "HALF_DAY" ? 0.5 : 0), 0);

            const loan = await tx.employeeLoan.findFirst({
              where: {
                companyId,
                employeeId: employee.id,
                status: "ACTIVE",
                startsOn: { lte: run.periodEnd },
              },
              orderBy: { startsOn: "asc" },
            });

            const calculated = calculatePayroll({
              components: revision.structure.components as SalaryComponentInput[],
              overrides: (revision.componentValues || undefined) as
                | Record<string, number>
                | undefined,
              adjustments: adjustments.filter(
                (item) => item.employeeId === employee.id,
              ),
              rules: rules.map((item) => ({
                type: item.type,
                configuration: item.configuration as Record<string, unknown>,
              })) as StatutoryRuleInput[],
              workingDays: days,
              payableDays,
              loanInstallment: loan
                ? Math.min(loan.installment, loan.outstanding)
                : 0,
            });
            lines.push({ employeeId: employee.id, ...calculated });
          }

          const totals = lines.reduce(
            (value, line) => ({
              gross: value.gross + line.grossEarnings,
              deductions: value.deductions + line.employeeDeductions,
              net: value.net + line.netPay,
            }),
            { gross: 0, deductions: 0, net: 0 },
          );

          await tx.payrollLine.deleteMany({ where: { payrollRunId: run.id } });
          for (const line of lines) {
            await tx.payrollLine.create({
              data: {
                ...line,
                payrollRunId: run.id,
                breakdown: line.breakdown as Prisma.InputJsonValue,
                calculationTrace: line.calculationTrace as Prisma.InputJsonValue,
              },
            });
          }

          return tx.payrollRun.update({
            where: { id: run.id },
            data: {
              status: "CALCULATED",
              calculatedAt: new Date(),
              totalEmployees: lines.length,
              totalGrossSalary: totals.gross,
              totalDeductions: totals.deductions,
              totalNetPayout: totals.net,
            },
          });
        });

        await audit(
          req,
          "CALCULATE_PAYROLL",
          `${result.month} calculated for ${result.totalEmployees} employees.`,
        );
        return ok(res, result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "PAYROLL_RUN_NOT_FOUND") {
            return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
          }
          if (error.message === "PAYROLL_STATE_INVALID" || error.message === "ATTENDANCE_NOT_LOCKED") {
            return fail(res, 409, "PAYROLL_STATE_INVALID", "Attendance must be locked before calculation.");
          }
        }
        next(error);
      }
    },
  );

  router.post(
    "/payroll/runs/:id/discard",
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const runId = String(req.params.id);

        const result = await prisma.$transaction(async (tx) => {
          const [run] = await tx.$queryRaw<Array<{
            id: string;
            companyId: string;
            month: string;
            status: string;
          }>>`
            SELECT id, "companyId", month, status
            FROM "PayrollRun"
            WHERE id = ${runId} AND "companyId" = ${companyId}
            FOR UPDATE
          `;

          if (!run) {
            throw new Error("PAYROLL_RUN_NOT_FOUND");
          }

          if (
            !["DRAFT", "ATTENDANCE_REVIEW", "ATTENDANCE_LOCKED", "ATTENDANCE_FINALIZED", "CALCULATED"].includes(
              run.status,
            )
          ) {
            throw new Error("PAYROLL_STATE_INVALID");
          }

          // Find all ingested reimbursement adjustments in this run
          const reimbursements = await tx.payrollAdjustment.findMany({
            where: {
              payrollRunId: run.id,
              kind: "REIMBURSEMENT",
              expenseClaimId: { not: null },
            },
            select: { id: true, expenseClaimId: true },
          });

          // Restore claims to APPROVED
          const claimIds = reimbursements.map((r) => r.expenseClaimId!).filter(Boolean);
          if (claimIds.length > 0) {
            await tx.expenseClaim.updateMany({
              where: { id: { in: claimIds } },
              data: { status: "APPROVED", reimbursedAt: null },
            });
          }

          // Remove the adjustments
          await tx.payrollAdjustment.deleteMany({
            where: {
              payrollRunId: run.id,
              kind: "REIMBURSEMENT",
            },
          });

          // Delete payroll lines
          await tx.payrollLine.deleteMany({
            where: { payrollRunId: run.id },
          });

          return tx.payrollRun.update({
            where: { id: run.id },
            data: {
              status: "DRAFT",
              calculatedAt: null,
              totalGrossSalary: 0,
              totalDeductions: 0,
              totalNetPayout: 0,
              totalEmployees: 0,
            },
          });
        });

        await audit(
          req,
          "DISCARD_PAYROLL_DRAFT",
          `Payroll draft ${runId} discarded and ${result.month} reimbursement adjustments rolled back.`,
        );

        return ok(res, { discarded: true, run: result });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "PAYROLL_RUN_NOT_FOUND") {
            return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
          }
          if (error.message === "PAYROLL_STATE_INVALID") {
            return fail(res, 409, "PAYROLL_STATE_INVALID", "Cannot discard an approved or locked payroll run.");
          }
        }
        next(error);
      }
    },
  );

  router.get(
    "/payroll/runs/:id/review",
    async (req: PayrollRequest, res, next) => {
      try {
        const companyId = req.auth!.companyId;
        const run = await prisma.payrollRun.findFirst({
          where: { id: String(req.params.id), companyId },
          include: { lines: true },
        });
        if (!run) return fail(res, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run was not found.");
        const [employees, previousRun] = await Promise.all([
          prisma.employee.findMany({
            where: { companyId, id: { in: run.lines.map(line => line.employeeId) } },
            select: { id: true, employeeCode: true, firstName: true, lastName: true, accountNumber: true, routingOrIfsc: true },
          }),
          prisma.payrollRun.findFirst({
            where: { companyId, month: { lt: run.month }, status: { not: "REVERSED" } },
            include: { lines: true },
            orderBy: { month: "desc" },
          }),
        ]);
        const previousByEmployee = new Map(previousRun?.lines.map(line => [line.employeeId, line.netPay]) || []);
        const lines = run.lines.map(line => {
          const employee = employees.find(item => item.id === line.employeeId);
          const previousNetPay = previousByEmployee.get(line.employeeId);
          const variancePercent = previousNetPay && previousNetPay > 0 ? ((line.netPay - previousNetPay) / previousNetPay) * 100 : undefined;
          const exceptions: string[] = [];
          if (!employee?.accountNumber || !employee.routingOrIfsc) exceptions.push("Bank details incomplete");
          if (line.netPay <= 0) exceptions.push("Net pay is zero");
          if (line.payableDays <= 0) exceptions.push("No payable attendance days");
          if (variancePercent !== undefined && Math.abs(variancePercent) >= 20) exceptions.push(`Net pay changed ${Math.abs(variancePercent).toFixed(1)}% from the previous run`);
          return {
            ...line,
            employee: employee ? { id: employee.id, employeeCode: employee.employeeCode, firstName: employee.firstName, lastName: employee.lastName, bankReady: Boolean(employee.accountNumber && employee.routingOrIfsc) } : undefined,
            previousNetPay,
            variancePercent,
            exceptions,
          };
        });
        return ok(res, {
          run,
          lines,
          exceptions: lines.filter(line => line.exceptions.length).map(line => ({ employeeId: line.employeeId, employeeName: line.employee ? `${line.employee.firstName} ${line.employee.lastName}` : line.employeeId, messages: line.exceptions })),
        });
      } catch (error) { next(error); }
    },
  );

  const transition = (
    path: string,
    permission: string,
    from: string[],
    to: "HR_REVIEW" | "FINANCE_APPROVED" | "LOCKED",
    auditAction: string,
  ) =>
    router.post(
      path,
      permit(permission),
      async (req: PayrollRequest, res, next) => {
        try {
          const now = new Date();
          const data =
            to === "HR_REVIEW"
              ? { status: to, hrReviewedById: req.auth!.id, hrReviewedAt: now }
              : to === "FINANCE_APPROVED"
                ? {
                    status: to,
                    financeApprovedById: req.auth!.id,
                    financeApprovedAt: now,
                  }
                : { status: to, lockedById: req.auth!.id, lockedAt: now };
          const updated = await prisma.payrollRun.updateMany({
            where: {
              id: String(req.params.id),
              companyId: req.auth!.companyId,
              status: { in: from as never },
            },
            data,
          });
          if (!updated.count)
            return fail(
              res,
              409,
              "PAYROLL_STATE_INVALID",
              `Payroll is not ready for ${to}.`,
            );
          await audit(
            req,
            auditAction,
            `Payroll ${req.params.id} moved to ${to}.`,
          );
          return ok(res, { status: to });
        } catch (error) {
          next(error);
        }
      },
    );
  transition(
    "/payroll/runs/:id/hr-review",
    "payroll.manage",
    ["CALCULATED"],
    "HR_REVIEW",
    "HR_REVIEW_PAYROLL",
  );
  transition(
    "/payroll/runs/:id/finance-approve",
    "payroll.approve",
    ["HR_REVIEW"],
    "FINANCE_APPROVED",
    "FINANCE_APPROVE_PAYROLL",
  );
  transition(
    "/payroll/runs/:id/lock",
    "payroll.approve",
    ["FINANCE_APPROVED"],
    "LOCKED",
    "LOCK_PAYROLL",
  );

  router.post(
    "/payroll/runs/:id/record-payment",
    permit("payroll.approve"),
    async (req: PayrollRequest, res, next) => {
      try {
        const body = z
          .object({
            paymentDate: z.coerce.date(),
            paymentReference: z.string().trim().min(3).max(120),
          })
          .parse(req.body);

        const updated = await prisma.payrollRun.updateMany({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
            status: "LOCKED",
          },
          data: {
            paymentDate: body.paymentDate,
            paymentReference: body.paymentReference,
            paymentRecordedById: req.auth!.id,
            paymentRecordedAt: new Date(),
          },
        });

        if (!updated.count)
          return fail(
            res,
            409,
            "PAYROLL_STATE_INVALID",
            "Only a locked payroll can record payment.",
          );

        // Mark ingested claims as REIMBURSED
        if (prisma.payrollAdjustment?.findMany && prisma.expenseClaim?.updateMany) {
          const adjustments = await prisma.payrollAdjustment.findMany({
            where: {
              payrollRunId: String(req.params.id),
              kind: "REIMBURSEMENT",
              expenseClaimId: { not: null },
            },
            select: { expenseClaimId: true },
          });

          const claimIds = adjustments.map((a) => a.expenseClaimId!).filter(Boolean);
          if (claimIds.length > 0) {
            await prisma.expenseClaim.updateMany({
              where: { id: { in: claimIds } },
              data: {
                status: "REIMBURSED",
                reimbursedAt: body.paymentDate,
              },
            });
          }
        }

        await audit(
          req,
          "RECORD_PAYROLL_PAYMENT",
          `Payment ${body.paymentReference} recorded for payroll ${req.params.id}.`,
        );

        return ok(res, {
          recorded: true,
          paymentDate: body.paymentDate,
          paymentReference: body.paymentReference,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/payroll/runs/:id/publish",
    permit("payroll.approve"),
    async (req: PayrollRequest, res, next) => {
      try {
        const run = await prisma.payrollRun.findFirst({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
            status: { in: ["LOCKED", "PAYSLIP_GENERATED"] },
          },
          include: { lines: true },
        });
        if (!run)
          return fail(
            res,
            409,
            "PAYROLL_STATE_INVALID",
            "Locked payroll was not found.",
          );
        if (run.status === "LOCKED" && (!run.paymentDate || !run.paymentReference))
          return fail(res, 409, "PAYMENT_NOT_RECORDED", "Record the payroll payment before publishing payslips.");
        await prisma.$transaction(async (tx) => {
          for (const [index, line] of run.lines.entries()) {
            const breakdown = line.breakdown as Record<string, number>;
            const payslipNumber = `PS-${run.month}-${String(index + 1).padStart(6, "0")}`;
            await tx.payslip.upsert({
              where: {
                payrollRunId_employeeId: {
                  payrollRunId: run.id,
                  employeeId: line.employeeId,
                },
              },
              create: {
                companyId: run.companyId,
                payrollRunId: run.id,
                employeeId: line.employeeId,
                month: run.month,
                basicSalary: breakdown.BASIC || 0,
                hra: breakdown.HRA || 0,
                allowances: Math.max(
                  0,
                  line.grossEarnings -
                    (breakdown.BASIC || 0) -
                    (breakdown.HRA || 0),
                ),
                grossSalary: line.grossEarnings,
                providentFund: breakdown.PF_EMPLOYEE || 0,
                taxDeductions:
                  (breakdown.TDS || 0) + (breakdown.PROFESSIONAL_TAX || 0),
                otherDeductions: Math.max(
                  0,
                  line.employeeDeductions -
                    (breakdown.PF_EMPLOYEE || 0) -
                    (breakdown.TDS || 0) -
                    (breakdown.PROFESSIONAL_TAX || 0),
                ),
                totalDeductions: line.employeeDeductions,
                netSalary: line.netPay,
                workingDays: Math.round(line.workingDays),
                presentDays: Math.round(line.payableDays),
                paidLeaveDays: 0,
                unpaidDays: Math.round(line.unpaidDays),
                status: "PAID",
                paymentDate: run.paymentDate,
                payslipNumber,
                breakdown: line.breakdown as Prisma.InputJsonValue,
                calculationTrace: line.calculationTrace as Prisma.InputJsonValue,
                netPayInWords: `INR ${line.netPay.toFixed(2)} Only`,
                generatedAt: new Date(),
                publishedAt: new Date(),
              },
              update: {
                grossSalary: line.grossEarnings,
                totalDeductions: line.employeeDeductions,
                netSalary: line.netPay,
                basicSalary: breakdown.BASIC || 0,
                hra: breakdown.HRA || 0,
                allowances: Math.max(0, line.grossEarnings - (breakdown.BASIC || 0) - (breakdown.HRA || 0)),
                providentFund: breakdown.PF_EMPLOYEE || 0,
                taxDeductions: (breakdown.TDS || 0) + (breakdown.PROFESSIONAL_TAX || 0),
                otherDeductions: Math.max(0, line.employeeDeductions - (breakdown.PF_EMPLOYEE || 0) - (breakdown.TDS || 0) - (breakdown.PROFESSIONAL_TAX || 0)),
                workingDays: Math.round(line.workingDays),
                presentDays: Math.round(line.payableDays),
                unpaidDays: Math.round(line.unpaidDays),
                status: "PUBLISHED",
                paymentDate: run.paymentDate,
                breakdown: line.breakdown as Prisma.InputJsonValue,
                calculationTrace: line.calculationTrace as Prisma.InputJsonValue,
                publishedAt: new Date(),
              },
            });
            const repayment = breakdown.LOAN_REPAYMENT || 0;
            if (repayment > 0) {
              const loan = await tx.employeeLoan.findFirst({
                where: {
                  companyId: run.companyId,
                  employeeId: line.employeeId,
                  status: "ACTIVE",
                },
                orderBy: { startsOn: "asc" },
              });
              if (loan) {
                const amount = Math.min(repayment, loan.outstanding);
                await tx.loanRepayment.create({
                  data: { loanId: loan.id, payrollRunId: run.id, amount },
                });
                await tx.employeeLoan.update({
                  where: { id: loan.id },
                  data: {
                    outstanding: Math.max(0, loan.outstanding - amount),
                    status:
                      loan.outstanding - amount <= 0 ? "CLOSED" : "ACTIVE",
                  },
                });
              }
            }
          }
          await tx.payrollRun.update({
            where: { id: run.id },
            data: { status: "PAYSLIPS_PUBLISHED", processedDate: new Date(), publishedAt: new Date() },
          });
        });
        await audit(
          req,
          "PUBLISH_PAYSLIPS",
          `${run.month} payslips published.`,
        );
        const recipients = await prisma.employee.findMany({
          where: { companyId: run.companyId, id: { in: run.lines.map(line => line.employeeId) }, userId: { not: null } },
          select: { userId: true },
        });
        await Promise.allSettled(recipients.flatMap(employee => employee.userId ? [
          emitNotification(prisma, {
            companyId: run.companyId,
            userId: employee.userId,
            eventKey: "PAYROLL_PUBLISHED",
            title: "Payroll published",
            body: `Your ${run.month} payslip is now available.`,
            entityType: "PayrollRun",
            entityId: run.id,
            actionUrl: "/self-service?tab=pay",
          }),
        ] : []));
        return ok(res, {
          status: "PAYSLIPS_PUBLISHED",
          count: run.lines.length,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/payroll/runs/:id/bank-export-preview",
    permit("payroll.approve"),
    async (req: PayrollRequest, res, next) => {
      try {
        const run = await prisma.payrollRun.findFirst({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
            status: { in: ["LOCKED", "PAYSLIPS_PUBLISHED", "BANK_EXPORTED"] },
          },
          include: { lines: true },
        });
        if (!run)
          return fail(
            res,
            409,
            "PAYROLL_STATE_INVALID",
            "Locked payroll was not found.",
          );
        const employees = await prisma.employee.findMany({
          where: {
            companyId: run.companyId,
            id: { in: run.lines.map((item) => item.employeeId) },
          },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            accountNumber: true,
          },
        });
        const rows = run.lines.map((line) => {
          const employee = employees.find(
            (item) => item.id === line.employeeId,
          )!;
          const last4 = employee.accountNumber?.slice(-4);
          return {
            employeeCode: employee.employeeCode,
            beneficiary: `${employee.firstName} ${employee.lastName}`,
            maskedAccount: last4 ? `••••${last4}` : null,
            amount: line.netPay,
          };
        });
        await audit(
          req,
          "PREVIEW_PAYROLL_BANK_EXPORT",
          `${run.month} masked bank preview viewed for ${rows.length} employees.`,
        );
        return ok(res, { month: run.month, deliveryRequired: true, rows });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/payroll/runs/:id/reverse",
    permit("payroll.approve"),
    async (req: PayrollRequest, res, next) => {
      try {
        const body = z
          .object({ reason: z.string().trim().min(5).max(500) })
          .parse(req.body);

        const runId = String(req.params.id);
        const companyId = req.auth!.companyId;

        // Statutory Compliance Guard (P2.7-A): Cannot reverse run if approved/locked filing exists
        if (prisma.statutoryFiling?.findFirst) {
          const activeFiling = await prisma.statutoryFiling.findFirst({
            where: {
              payrollRunId: runId,
              companyId,
              status: { in: ["APPROVED", "LOCKED", "EXPORTED"] },
            },
          });
          if (activeFiling) {
            return fail(
              res,
              409,
              "STATUTORY_FILING_EXISTS",
              `Cannot reverse payroll run ${runId} because an approved or locked statutory filing (${activeFiling.domain}) exists.`,
            );
          }
        }

        const updated = await prisma.payrollRun.updateMany({
          where: {
            id: runId,
            companyId,
            status: {
              in: [
                "LOCKED",
                "PAYSLIPS_PUBLISHED",
                "BANK_EXPORTED",
                "PROCESSED",
                "PAID",
              ],
            },
          },
          data: { status: "REVERSED" },
        });

        if (!updated.count)
          return fail(
            res,
            409,
            "PAYROLL_STATE_INVALID",
            "A locked or published payroll run was not found.",
          );

        // Revert ingested claims back to APPROVED
        if (prisma.payrollAdjustment?.findMany && prisma.expenseClaim?.updateMany) {
          const adjustments = await prisma.payrollAdjustment.findMany({
            where: {
              payrollRunId: String(req.params.id),
              kind: "REIMBURSEMENT",
              expenseClaimId: { not: null },
            },
            select: { expenseClaimId: true },
          });

          const claimIds = adjustments.map((a) => a.expenseClaimId!).filter(Boolean);
          if (claimIds.length > 0) {
            await prisma.expenseClaim.updateMany({
              where: { id: { in: claimIds } },
              data: { status: "APPROVED", reimbursedAt: null },
            });
          }

          await prisma.payrollAdjustment.deleteMany({
            where: {
              payrollRunId: String(req.params.id),
              kind: "REIMBURSEMENT",
            },
          });
        }

        await audit(
          req,
          "REVERSE_PAYROLL",
          `Payroll ${req.params.id} reversed: ${body.reason}`,
        );
        return ok(res, { status: "REVERSED" });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
