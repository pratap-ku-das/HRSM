import crypto from "node:crypto";
import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z, ZodError } from "zod";
import {
  createOpaqueToken,
  deliverOnboardingEmail,
  deliverPasswordResetEmail,
} from "./email.js";
import {
  deleteEmployeeFace,
  enrollEmployeeFace,
  FaceRecognitionError,
  verifyEmployeeFace,
} from "./faceRecognition.js";
import { createFoundationRouter } from "./foundation.js";
import { employeeScopeFilters, type AccessScope } from "./accessScope.js";
import { createWorkflowRouter, startConfiguredWorkflow } from "./workflows.js";
import { createAttendancePolicyRouter, reconcileMidnightAbsentMissingClockOut } from "./attendancePolicies.js";
import { createPayrollRouter } from "./payroll.js";
import { createPayrollComplianceRouter } from "./payrollCompliance.js";
import { createWorkspaceRouter } from "./workspace.js";
import { createNotificationRouter, emitNotification } from "./notifications.js";
import { createGovernanceRouter } from "./governance.js";
import { createReportRouter } from "./reports.js";
import { createPerformanceRouter } from "./performance.js";
import { createSelfServiceRouter } from "./selfService.js";
import { createReminderRouter } from "./reminders.js";
import { createAiAssistantRouter } from "./aiAssistant.js";
import { createRecruitmentRouter } from "./recruitment.js";
import { createOperationsRouter } from "./operations.js";
import { createLeaveAdminRouter } from "./leaveAdmin.js";
import { createLeaveEncashmentRouter } from "./leaveEncashment.js";
import { createBankExportRouter } from "./bankExport.js";
import { createTaxSimulatorRouter } from "./taxSimulator.js";
import { createSettingsRouter } from "./settings.js";
import { verifyMfaCode } from "./mfa.js";
import { createMobileReleaseRouter } from "./mobileRelease.js";
import { createOnboardingRouter } from "./onboarding.js";
import { createPayrollWorkflowRouter } from "./payrollWorkflow.js";

type AuthUser = {
  id: string;
  companyId: string;
  role: UserRole;
  employeeId?: string;
  permissions: string[];
  accessScopes: AccessScope[];
  tokenVersion: number;
};
type AuthedRequest = Request & { auth?: AuthUser; requestId?: string };

const rolePermissions: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    "company.manage",
    "performance.manage",
    "performance.review",
    "organization.read",
    "organization.manage",
    "rbac.manage",
    "workflow.manage",
    "workflow.review",
    "notification.manage",
    "employee.read.all",
    "employee.manage",
    "face.enroll",
    "attendance.read.team",
    "attendance.route.read",
    "attendance.manage",
    "leave.review",
    "leave.policy.manage",
    "expense.review",
    "payroll.manage",
    "payroll.approve",
    "recruitment.manage",
    "audit.read",
  ],
  COMPANY_ADMIN: [
    "company.manage",
    "performance.manage",
    "performance.review",
    "organization.read",
    "organization.manage",
    "rbac.manage",
    "workflow.manage",
    "workflow.review",
    "notification.manage",
    "employee.read.all",
    "employee.manage",
    "face.enroll",
    "attendance.read.team",
    "attendance.route.read",
    "attendance.manage",
    "leave.review",
    "leave.policy.manage",
    "expense.review",
    "payroll.manage",
    "payroll.approve",
    "recruitment.manage",
    "audit.read",
  ],
  HR_MANAGER: [
    "performance.manage",
    "performance.review",
    "organization.read",
    "organization.manage",
    "workflow.manage",
    "workflow.review",
    "employee.read.all",
    "employee.manage",
    "face.enroll",
    "attendance.read.team",
    "attendance.route.read",
    "attendance.manage",
    "leave.review",
    "expense.review",
    "recruitment.manage",
  ],
  PAYROLL_ADMIN: [
    "organization.read",
    "workflow.review",
    "employee.read.all",
    "attendance.read.team",
    "payroll.manage",
    "payroll.approve",
  ],
  MANAGER: [
    "performance.review",
    "organization.read",
    "workflow.review",
    "employee.read.team",
    "attendance.read.team",
    "leave.review",
    "expense.review",
    "goal.manage.team",
  ],
  DEPT_HEAD: [
    "performance.review",
    "workflow.review",
    "employee.read.team",
    "attendance.read.team",
    "leave.review",
    "expense.review",
    "goal.manage.team",
  ],
  EMPLOYEE: [
    "employee.read.self",
    "attendance.read.self",
    "attendance.punch",
    "leave.apply",
    "expense.submit",
    "payslip.read.self",
  ],
};
const employeePermissions = [
  "employee.read.self",
  "attendance.read.self",
  "attendance.punch",
  "leave.apply",
  "expense.submit",
  "payslip.read.self",
];
for (const role of ["SUPER_ADMIN", "COMPANY_ADMIN", "HR_MANAGER"] as UserRole[])
  rolePermissions[role].push("operations.manage");
for (const role of ["COMPANY_ADMIN", "HR_MANAGER", "DEPT_HEAD"] as UserRole[])
  rolePermissions[role] = [
    ...new Set([...rolePermissions[role], ...employeePermissions]),
  ];
for (const role of ["SUPER_ADMIN", "PAYROLL_ADMIN", "MANAGER"] as UserRole[])
  rolePermissions[role] = [
    ...new Set([...rolePermissions[role], ...employeePermissions]),
  ];

async function resolvedAccess(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  legacyRole: UserRole,
) {
  const grants = await prisma.userAccessGrant.findMany({
    where: {
      userId,
      companyId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      role: { active: true },
    },
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });
  const accessScopes = grants.map((grant) => ({
    scope: grant.scope,
    scopeEntityId: grant.scopeEntityId,
    permissions: grant.role.rolePermissions.map(
      (value) => value.permission.key,
    ),
  }));
  const custom = accessScopes.flatMap((grant) => grant.permissions);
  return {
    permissions: [...new Set([...rolePermissions[legacyRole], ...custom])],
    accessScopes,
  };
}

const accessMinutes = Number(process.env.ACCESS_TOKEN_MINUTES || 15);
const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const issuer = process.env.JWT_ISSUER || "orbithr-api";
const secret = () => {
  const value = process.env.JWT_ACCESS_SECRET;
  if (!value || value.length < 32)
    throw new Error("JWT_ACCESS_SECRET must contain at least 32 characters");
  return value;
};
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
const indiaDate = (instant = new Date()) => {
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return new Date(`${value}T00:00:00.000Z`);
};
const indiaDateKey = (instant: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
const distanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const clientIp = (req: Request) => {
  const cloudflareIp = req.header("cf-connecting-ip")?.split(",")[0]?.trim();
  const value = cloudflareIp || req.ip || req.socket.remoteAddress || "unknown";
  return value.replace(/^::ffff:/, "");
};
const ok = (
  res: Response,
  data: unknown,
  status = 200,
  meta: Record<string, unknown> = {},
) =>
  res
    .status(status)
    .json({
      data,
      meta: { requestId: (res.req as AuthedRequest).requestId, ...meta },
    });
const fail = (
  res: Response,
  status: number,
  code: string,
  message: string,
  fieldErrors?: unknown,
) =>
  res
    .status(status)
    .json({
      error: { code, message, fieldErrors },
      meta: { requestId: (res.req as AuthedRequest).requestId },
    });

function signAccess(user: AuthUser) {
  return jwt.sign(
    {
      companyId: user.companyId,
      role: user.role,
      employeeId: user.employeeId,
      permissions: user.permissions,
      tokenVersion: user.tokenVersion,
    },
    secret(),
    {
      subject: user.id,
      issuer,
      audience: "orbithr-clients",
      expiresIn: `${accessMinutes}m`,
      jwtid: crypto.randomUUID(),
    },
  );
}

async function issueSession(
  prisma: PrismaClient,
  user: {
    id: string;
    companyId: string;
    role: UserRole;
    tokenVersion: number;
    employee?: { id: string } | null;
  },
  deviceName?: string,
  familyId: string = crypto.randomUUID(),
  metadata?: { ipAddress?: string; userAgent?: string },
) {
  const opaque = createOpaqueToken();
  const [, grants] = await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: opaque.hash,
        familyId,
        deviceName,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
      },
    }),
    prisma.userAccessGrant.findMany({
      where: {
        userId: user.id,
        companyId: user.companyId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        role: { active: true },
      },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    }),
  ]);
  const accessScopes = grants.map((grant) => ({
    scope: grant.scope,
    scopeEntityId: grant.scopeEntityId,
    permissions: grant.role.rolePermissions.map(
      (value) => value.permission.key,
    ),
  }));
  const access = {
    permissions: [
      ...new Set([
        ...rolePermissions[user.role],
        ...accessScopes.flatMap((grant) => grant.permissions),
      ]),
    ],
    accessScopes,
  };
  const auth: AuthUser = {
    id: user.id,
    companyId: user.companyId,
    role: user.role,
    employeeId: user.employee?.id,
    ...access,
    tokenVersion: user.tokenVersion,
  };
  return {
    accessToken: signAccess(auth),
    refreshToken: opaque.token,
    expiresInSeconds: accessMinutes * 60,
  };
}

export function createV1Router(prisma: PrismaClient) {
  const router = Router();
  const faceUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 },
    fileFilter: (_req, file, callback) =>
      callback(null, ["image/jpeg", "image/png"].includes(file.mimetype)),
  });
  router.use((req: AuthedRequest, res, next) => {
    req.requestId = String(req.header("x-request-id") || crypto.randomUUID());
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  router.use(createMobileReleaseRouter());
  const deleteEmployeeSafely=async(req:AuthedRequest)=>{
    const companyId=req.auth!.companyId,e=await prisma.employee.findFirst({where:{id:String(req.params.id),companyId}});
    if(!e)throw Object.assign(new Error("Employee was not found."),{status:404,code:"EMPLOYEE_NOT_FOUND"});
    if(e.userId===req.auth!.id)throw Object.assign(new Error("You cannot delete your own employee profile."),{status:409,code:"SELF_DELETE_NOT_ALLOWED"});
    const counts=await Promise.all([
      prisma.attendanceRecord.count({where:{employeeId:e.id}}),
      prisma.leaveRequest.count({where:{employeeId:e.id}}),
      prisma.payslip.count({where:{employeeId:e.id}}),
      prisma.expenseClaim.count({where:{employeeId:e.id}}),
      prisma.payrollLine.count({where:{employeeId:e.id}}),
    ]);
    if(counts.some(Boolean))throw Object.assign(new Error("This employee has operational history. Mark them resigned or terminated instead."),{status:409,code:"EMPLOYEE_HAS_HISTORY"});
    await prisma.employee.updateMany({where:{reportingManagerId:e.id,companyId},data:{reportingManagerId:null}});
    await prisma.employeeOnboarding.deleteMany({where:{createdEmployeeId:e.id,companyId}});
    await prisma.employee.delete({where:{id:e.id}});
    if(e.userId){await prisma.user.delete({where:{id:e.userId}})}
    await prisma.auditLog.create({data:{
      companyId,userId:req.auth!.id,userName:req.auth!.id,userRole:req.auth!.role,
      action:"DELETE_EMPLOYEE",category:"EMPLOYEE",
      details:"Employee "+e.employeeCode+" permanently deleted before history was created.",
      ipAddress:req.ip||"unknown"
    }});
    return{deleted:true};
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const recoveryLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authenticate = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const raw = req.header("authorization");
      if (!raw?.startsWith("Bearer "))
        return fail(
          res,
          401,
          "AUTH_REQUIRED",
          "A valid access token is required.",
        );
      const payload = jwt.verify(raw.slice(7), secret(), {
        issuer,
        audience: "orbithr-clients",
      }) as jwt.JwtPayload;
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { employee: true },
      });
      if (!user || user.tokenVersion !== payload.tokenVersion)
        return fail(
          res,
          401,
          "TOKEN_REVOKED",
          "The session is no longer valid.",
        );
      const access = await resolvedAccess(
        prisma,
        user.id,
        user.companyId,
        user.role,
      );
      req.auth = {
        id: user.id,
        companyId: user.companyId,
        role: user.role,
        employeeId: user.employee?.id,
        ...access,
        tokenVersion: user.tokenVersion,
      };
      next();
    } catch {
      return fail(
        res,
        401,
        "TOKEN_INVALID",
        "The access token is invalid or expired.",
      );
    }
  };
  const requirePermission =
    (permission: string) =>
    (req: AuthedRequest, res: Response, next: NextFunction) =>
      req.auth?.permissions.includes(permission)
        ? next()
        : fail(
            res,
            403,
            "FORBIDDEN",
            "You do not have permission to perform this action.",
          );
  const requireAnyPermission =
    (permissions: string[]) =>
    (req: AuthedRequest, res: Response, next: NextFunction) =>
      req.auth?.permissions.some(permission => permissions.includes(permission))
        ? next()
        : fail(res, 403, "FORBIDDEN", "You do not have permission to view attendance routes.");

  router.post("/auth/login", loginLimiter, async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(8),
          deviceName: z.string().max(120).optional(),
          mfaCode: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(req.body);
      const normalizedEmail = body.email.toLowerCase();
      const [user, recentFailures] = await prisma.$transaction([
        prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { employee: true, mfaMethod: true },
        }),
        prisma.loginAttempt.count({
          where: {
            email: normalizedEmail,
            success: false,
            createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
          },
        }),
      ]);
      if (recentFailures >= 10)
        return fail(
          res,
          423,
          "ACCOUNT_TEMPORARILY_LOCKED",
          "Too many failed attempts. Try again after 15 minutes.",
        );
      if (
        !user?.passwordHash ||
        !(await bcrypt.compare(body.password, user.passwordHash))
      ) {
        await prisma.loginAttempt.create({
          data: {
            companyId: user?.companyId,
            userId: user?.id,
            email: body.email.toLowerCase(),
            success: false,
            reason: "INVALID_CREDENTIALS",
            ipAddress: clientIp(req),
            userAgent: req.header("user-agent"),
          },
        });
        return fail(
          res,
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect.",
        );
      }
      if (
        user.mfaMethod?.enabled &&
        (!body.mfaCode ||
          !verifyMfaCode(user.mfaMethod.encryptedSecret, body.mfaCode))
      ) {
        await prisma.loginAttempt.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            email: user.email,
            success: false,
            reason: "MFA_REQUIRED_OR_INVALID",
            ipAddress: clientIp(req),
            userAgent: req.header("user-agent"),
          },
        });
        return fail(
          res,
          401,
          "MFA_REQUIRED",
          "A valid 6-digit authenticator code is required.",
        );
      }
      const session = await issueSession(
        prisma,
        user,
        body.deviceName,
        undefined,
        { ipAddress: clientIp(req), userAgent: req.header("user-agent") },
      );
      await prisma.$transaction([
        prisma.loginAttempt.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            email: user.email,
            success: true,
            ipAddress: clientIp(req),
            userAgent: req.header("user-agent"),
          },
        }),
        prisma.auditLog.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            userName: user.fullName,
            userRole: user.role,
            action: "USER_LOGIN_V1",
            category: "AUTH",
            details: "Authenticated session created.",
            ipAddress: req.ip || "unknown",
          },
        }),
      ]);
      return ok(res, session);
    } catch (e) {
      next(e);
    }
  });

  router.post("/auth/refresh", refreshLimiter, async (req, res, next) => {
    try {
      const body = z
        .object({
          refreshToken: z.string().min(32),
          deviceName: z.string().max(120).optional(),
        })
        .parse(req.body);
      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(body.refreshToken) },
        include: { user: { include: { employee: true } } },
      });
      if (!stored || stored.expiresAt <= new Date())
        return fail(
          res,
          401,
          "REFRESH_INVALID",
          "Refresh token is invalid or expired.",
        );
      if (stored.revokedAt) {
        if (stored.lastUsedAt && Date.now() - stored.lastUsedAt.getTime() < 60_000)
          return fail(
            res,
            401,
            'REFRESH_ALREADY_ROTATED',
            'Refresh token was already rotated by another browser tab.',
          );
        await prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await prisma.user.update({
          where: { id: stored.userId },
          data: { tokenVersion: { increment: 1 } },
        });
        return fail(
          res,
          401,
          "REFRESH_REUSE_DETECTED",
          "This token family has been revoked.",
        );
      }
      const session = await issueSession(
        prisma,
        stored.user,
        body.deviceName || stored.deviceName || undefined,
        stored.familyId,
        { ipAddress: clientIp(req), userAgent: req.header("user-agent") },
      );
      const replacementHash = hashToken(session.refreshToken);
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: {
          revokedAt: new Date(),
          replacedBy: replacementHash,
          lastUsedAt: new Date(),
        },
      });
      return ok(res, session);
    } catch (e) {
      next(e);
    }
  });

  router.post(
    "/auth/web-session",
    authenticate,
    async (req: AuthedRequest, res, next) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: req.auth!.id },
          include: { employee: true },
        });
        if (!user)
          return fail(res, 401, "AUTH_REQUIRED", "The authenticated user was not found.");
        const session = await issueSession(
          prisma,
          user,
          "OrbitHR Android complete workspace",
          crypto.randomUUID(),
          { ipAddress: clientIp(req), userAgent: req.header("user-agent") },
        );
        await prisma.auditLog.create({
          data: {
            companyId: user.companyId,
            userId: user.id,
            userName: user.fullName,
            userRole: user.role,
            action: "ANDROID_WEB_SESSION_CREATED",
            category: "AUTH",
            details: "A separate web workspace session was created inside the Android app.",
            ipAddress: clientIp(req),
          },
        });
        return ok(res, session, 201);
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/auth/logout",
    authenticate,
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({ refreshToken: z.string().min(32) })
          .parse(req.body);
        await prisma.refreshToken.updateMany({
          where: {
            userId: req.auth!.id,
            tokenHash: hashToken(body.refreshToken),
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        return ok(res, { loggedOut: true });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/auth/logout-all",
    authenticate,
    async (req: AuthedRequest, res, next) => {
      try {
        await prisma.$transaction([
          prisma.refreshToken.updateMany({
            where: { userId: req.auth!.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: req.auth!.id },
            data: { tokenVersion: { increment: 1 } },
          }),
        ]);
        return ok(res, { loggedOutAllDevices: true });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post("/auth/activate", recoveryLimiter, async (req, res, next) => {
    try {
      const body = z
        .object({
          token: z.string().min(32),
          password: z.string().min(10).max(128),
        })
        .parse(req.body);
      const action = await prisma.actionToken.findUnique({
        where: { tokenHash: hashToken(body.token) },
      });
      if (
        !action ||
        action.type !== "ACCOUNT_ACTIVATION" ||
        action.usedAt ||
        action.expiresAt <= new Date()
      )
        return fail(
          res,
          400,
          "ACTIVATION_INVALID",
          "Activation link is invalid or expired.",
        );
      const activatingEmployee = await prisma.employee.findUnique({
        where: { userId: action.userId },
        select: { id: true },
      });
      await prisma.$transaction([
        prisma.user.update({
          where: { id: action.userId },
          data: {
            passwordHash: await bcrypt.hash(body.password, 12),
            emailVerifiedAt: new Date(),
            tokenVersion: { increment: 1 },
          },
        }),
        prisma.actionToken.update({
          where: { id: action.id },
          data: { usedAt: new Date() },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: action.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        ...(activatingEmployee ? [prisma.employeeOnboarding.updateMany({
          where: { createdEmployeeId: activatingEmployee.id },
          data: { status: "ACTIVE" },
        })] : []),
      ]);
      return ok(res, { activated: true });
    } catch (e) {
      next(e);
    }
  });

  router.post(
    "/auth/forgot-password",
    recoveryLimiter,
    async (req, res, next) => {
      try {
        const body = z.object({ email: z.string().email() }).parse(req.body);
        const user = await prisma.user.findUnique({
          where: { email: body.email.toLowerCase() },
        });
        if (user) {
          const token = createOpaqueToken();
          const [, , delivery] = await prisma.$transaction([
            prisma.actionToken.updateMany({
              where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
              data: { usedAt: new Date() },
            }),
            prisma.actionToken.create({
              data: {
                userId: user.id,
                type: "PASSWORD_RESET",
                tokenHash: token.hash,
                expiresAt: new Date(Date.now() + 60 * 60_000),
              },
            }),
            prisma.emailDelivery.create({
              data: {
                companyId: user.companyId,
                userId: user.id,
                idempotencyKey: `password-reset:${user.id}:${token.hash}`,
                messageType: "PASSWORD_RESET",
                recipient: user.email,
              },
            }),
          ]);
          void deliverPasswordResetEmail(prisma, delivery.id, token.token);
        }
        return ok(res, { accepted: true });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/auth/reset-password",
    recoveryLimiter,
    async (req, res, next) => {
      try {
        const body = z
          .object({
            token: z.string().min(32),
            password: z.string().min(10).max(128),
          })
          .parse(req.body);
        const action = await prisma.actionToken.findUnique({
          where: { tokenHash: hashToken(body.token) },
        });
        if (
          !action ||
          action.type !== "PASSWORD_RESET" ||
          action.usedAt ||
          action.expiresAt <= new Date()
        )
          return fail(
            res,
            400,
            "RESET_INVALID",
            "Reset link is invalid or expired.",
          );
        await prisma.$transaction([
          prisma.user.update({
            where: { id: action.userId },
            data: {
              passwordHash: await bcrypt.hash(body.password, 12),
              tokenVersion: { increment: 1 },
            },
          }),
          prisma.actionToken.update({
            where: { id: action.id },
            data: { usedAt: new Date() },
          }),
          prisma.refreshToken.updateMany({
            where: { userId: action.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
        return ok(res, { reset: true });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get("/me", authenticate, async (req: AuthedRequest, res, next) => {
    try {
      const user = await prisma.user.findFirst({
        where: { id: req.auth!.id, companyId: req.auth!.companyId },
        include: {
          company: true,
          employee: { include: { department: true, designation: true } },
        },
      });
      return ok(res, {
        user: {
          id: user!.id,
          email: user!.email,
          fullName: user!.fullName,
          role: user!.role,
          avatarUrl: user!.avatarUrl,
          permissions: req.auth!.permissions,
        },
        company: user!.company,
        employee: user!.employee,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get(
    "/dashboard",
    authenticate,
    async (req: AuthedRequest, res, next) => {
      try {
        const cid = req.auth!.companyId;
        const today = indiaDate();
        const [employees, attendance, pendingLeaves, announcements, holidays] =
          await prisma.$transaction([
            prisma.employee.count({
              where: {
                companyId: cid,
                status: { in: ["ACTIVE", "ON_PROBATION", "ON_LEAVE"] },
              },
            }),
            prisma.attendanceRecord.count({
              where: {
                companyId: cid,
                date: today,
                status: { in: ["PRESENT", "LATE", "HALF_DAY"] },
              },
            }),
            prisma.leaveRequest.count({
              where: { companyId: cid, status: "PENDING" },
            }),
            prisma.announcement.findMany({
              where: { companyId: cid },
              orderBy: { createdAt: "desc" },
              take: 5,
            }),
            prisma.holiday.findMany({
              where: { companyId: cid, date: { gte: today } },
              orderBy: { date: "asc" },
              take: 5,
            }),
          ]);
        return ok(res, {
          activeEmployees: employees,
          presentToday: attendance,
          pendingLeaves,
          announcements,
          holidays,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/attendance",
    authenticate,
    requireAnyPermission(["attendance.read.team", "attendance.route.read"]),
    async (req: AuthedRequest, res, next) => {
      try {
        const auth = req.auth!;
        const from = req.query.from
          ? new Date(String(req.query.from))
          : undefined;
        const routeOnly = auth.permissions.includes("attendance.route.read") && !auth.permissions.includes("attendance.read.team");
        const scopes = employeeScopeFilters(auth, rolePermissions, routeOnly ? "attendance.route.read" : "employee.read");
        if (!scopes.length)
          return fail(res, 403, "ATTENDANCE_SCOPE_FORBIDDEN", "Your attendance access has no valid employee scope.");
        await reconcileMidnightAbsentMissingClockOut(prisma, auth.companyId);
        const records = await prisma.attendanceRecord.findMany({
          where: {
            companyId: auth.companyId,
            employee: { is: { OR: scopes } },
            ...(from ? { date: { gte: from } } : {}),
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                department: { select: { name: true } },
              },
            },
          },
          orderBy: { date: "desc" },
        });
        const linkedEmployees = await prisma.employee.findMany({
          where: { companyId: auth.companyId, id: { in: records.map(record => record.employeeId) }, userId: { not: null } },
          select: { id: true, userId: true },
        });
        const employeeByUserId = new Map(
          linkedEmployees.flatMap((employee) =>
            employee.userId ? [[employee.userId, employee.id] as const] : [],
          ),
        );
        const punchLogs = linkedEmployees.length
          ? await prisma.auditLog.findMany({
              where: {
                companyId: auth.companyId,
                category: "ATTENDANCE",
                action: { in: ["CLOCK_IN", "CLOCK_OUT"] },
                userId: {
                  in: linkedEmployees.flatMap((employee) =>
                    employee.userId ? [employee.userId] : [],
                  ),
                },
                ...(from ? { timestamp: { gte: from } } : {}),
              },
              orderBy: { timestamp: "asc" },
            })
          : [];
        const punchEvidence = new Map<
          string,
          { ipAddress: string; locationAccuracyMeters?: number }
        >();
        for (const log of punchLogs) {
          const employeeId = employeeByUserId.get(log.userId);
          if (!employeeId) continue;
          const accuracyMatch = log.details.match(/accuracy\s+([\d.]+)m/i);
          punchEvidence.set(
            `${employeeId}:${indiaDateKey(log.timestamp)}:${log.action}`,
            {
              ipAddress: log.ipAddress,
              ...(accuracyMatch
                ? { locationAccuracyMeters: Number(accuracyMatch[1]) }
                : {}),
            },
          );
        }
        const detailedRecords = records.map((record) => {
          const dateKey = indiaDateKey(record.date);
          const clockIn = punchEvidence.get(
            `${record.employeeId}:${dateKey}:CLOCK_IN`,
          );
          const clockOut = punchEvidence.get(
            `${record.employeeId}:${dateKey}:CLOCK_OUT`,
          );
          return {
            ...record,
            clockInIpAddress: clockIn?.ipAddress,
            clockOutIpAddress: clockOut?.ipAddress,
            locationAccuracyMeters: clockIn?.locationAccuracyMeters,
          };
        });
        return ok(res, detailedRecords);
      } catch (e) {
        next(e);
      }
    },
  );

  router.get('/attendance/:recordId/route',authenticate,requirePermission('attendance.route.read'),async(req:AuthedRequest,res,next)=>{
    try{
      const auth=req.auth!;
      const record=await prisma.attendanceRecord.findFirst({where:{id:String(req.params.recordId),companyId:auth.companyId},include:{employee:{select:{id:true,employeeCode:true,firstName:true,lastName:true,workdayGpsTrackingEnabled:true}},locationPoints:{orderBy:{capturedAt:'asc'}}}});
      if(!record)return fail(res,404,'ATTENDANCE_NOT_FOUND','Attendance record was not found.');
      const scopes=employeeScopeFilters(auth,rolePermissions,'attendance.route.read');
      const allowed=scopes.length&&await prisma.employee.findFirst({where:{id:record.employeeId,companyId:auth.companyId,OR:scopes},select:{id:true}});
      if(!allowed)return fail(res,403,'ATTENDANCE_ROUTE_FORBIDDEN','This employee is outside your access scope.');
      let distanceMetersTravelled=0;
      for(let index=1;index<record.locationPoints.length;index++){
        const previous=record.locationPoints[index-1],current=record.locationPoints[index];
        distanceMetersTravelled+=distanceMeters(previous.latitude,previous.longitude,current.latitude,current.longitude);
      }
      return ok(res,{attendance:{id:record.id,date:record.date,clockInTime:record.clockInTime,clockOutTime:record.clockOutTime},employee:record.employee,trackingEnabled:record.employee.workdayGpsTrackingEnabled,active:Boolean(record.employee.workdayGpsTrackingEnabled&&record.clockInTime&&!record.clockOutTime),distanceMeters:Math.round(distanceMetersTravelled),points:record.locationPoints});
    }catch(e){next(e)}
  });

  router.get('/me/attendance/tracking-status',authenticate,requirePermission('attendance.punch'),async(req:AuthedRequest,res,next)=>{
    try{
      if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked to this account.');
      const employee=await prisma.employee.findFirst({where:{id:req.auth!.employeeId,companyId:req.auth!.companyId},select:{workdayGpsTrackingEnabled:true}});
      const today = indiaDate();
      const record=await prisma.attendanceRecord.findFirst({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,date:today,status:{not:"ABSENT"},clockInTime:{not:null},clockOutTime:null},orderBy:{clockInTime:'desc'},select:{id:true,clockInTime:true,clockOutTime:true,deviceId:true}});
      return ok(res,{enabled:employee?.workdayGpsTrackingEnabled===true,active:Boolean(employee?.workdayGpsTrackingEnabled&&record?.clockInTime&&!record.clockOutTime),attendanceRecordId:record?.id,deviceId:record?.deviceId});
    }catch(e){next(e)}
  });

  router.post('/me/attendance/location-batch',authenticate,requirePermission('attendance.punch'),async(req:AuthedRequest,res,next)=>{
    try{
      if(!req.auth!.employeeId)return fail(res,409,'EMPLOYEE_NOT_LINKED','No employee profile is linked to this account.');
      const body=z.object({deviceId:z.string().trim().min(16).max(200),points:z.array(z.object({id:z.string().uuid(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracyMeters:z.number().positive().max(200),speedMetersPerSecond:z.number().min(0).max(150).nullable().optional(),bearingDegrees:z.number().min(0).max(360).nullable().optional(),capturedAt:z.coerce.date()})).min(1).max(100)}).parse(req.body);
      const employee=await prisma.employee.findFirst({where:{id:req.auth!.employeeId,companyId:req.auth!.companyId},select:{workdayGpsTrackingEnabled:true}});
      if(!employee?.workdayGpsTrackingEnabled)return fail(res,403,'GPS_TRACKING_DISABLED','Workday GPS tracking is not enabled for this employee.');
      const today = indiaDate();
      const record=await prisma.attendanceRecord.findFirst({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId,date:today,status:{not:"ABSENT"},clockInTime:{not:null},clockOutTime:null},orderBy:{clockInTime:'desc'}});
      if(!record?.clockInTime||record.clockOutTime)return fail(res,409,'ATTENDANCE_SESSION_CLOSED','Location is accepted only between clock-in and clock-out.');
      if(record.deviceId&&record.deviceId!==body.deviceId)return fail(res,403,'ATTENDANCE_DEVICE_MISMATCH','Location must come from the device used to clock in.');
      const oldest=new Date(record.clockInTime.getTime()-120000),newest=new Date(Date.now()+120000);
      const points=body.points.filter(point=>point.capturedAt>=oldest&&point.capturedAt<=newest);
      if(!points.length)return ok(res,{accepted:0});
      const result=await prisma.attendanceLocationPoint.createMany({data:points.map(point=>({id:point.id,companyId:req.auth!.companyId,employeeId:req.auth!.employeeId!,attendanceRecordId:record.id,latitude:point.latitude,longitude:point.longitude,accuracyMeters:point.accuracyMeters,speedMetersPerSecond:point.speedMetersPerSecond,bearingDegrees:point.bearingDegrees,capturedAt:point.capturedAt})),skipDuplicates:true});
      return ok(res,{accepted:result.count});
    }catch(e){next(e)}
  });

  router.get(
    "/me/attendance",
    authenticate,
    requirePermission("attendance.read.self"),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked to this account.",
          );
        const from = req.query.from
          ? new Date(String(req.query.from))
          : new Date(Date.now() - 31 * 86_400_000);
        await reconcileMidnightAbsentMissingClockOut(prisma, req.auth!.companyId);
        const records = await prisma.attendanceRecord.findMany({
          where: {
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            date: { gte: from },
          },
          orderBy: { date: "desc" },
        });
        return ok(res, records);
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/face/challenge",
    authenticate,
    requirePermission("attendance.punch"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            action: z.enum(["CLOCK_IN", "CLOCK_OUT"]),
            deviceId: z.string().trim().min(16).max(200),
          })
          .parse(req.body);
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked to this account.",
          );
        const enrollment = await prisma.faceEnrollment.findFirst({
          where: {
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            status: "ACTIVE",
          },
        });
        if (!enrollment)
          return fail(
            res,
            428,
            "FACE_NOT_ENROLLED",
            "HR or an administrator must enroll your face before mobile attendance can be used.",
          );
        await prisma.faceVerificationSession.updateMany({
          where: {
            employeeId: req.auth!.employeeId,
            status: { in: ["CHALLENGE", "VERIFIED"] },
          },
          data: { status: "REJECTED" },
        });
        const session = await prisma.faceVerificationSession.create({
          data: {
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            action: body.action,
            deviceId: body.deviceId,
            expiresAt: new Date(Date.now() + 2 * 60_000),
            ipAddress: clientIp(req),
          },
        });
        return ok(res, { challengeId: session.id, expiresInSeconds: 120 }, 201);
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/face/verify",
    authenticate,
    requirePermission("attendance.punch"),
    faceUpload.single("selfie"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            challengeId: z.string().uuid(),
            deviceId: z.string().trim().min(16).max(200),
            livenessVerified: z.enum(["true"]),
          })
          .parse(req.body);
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked to this account.",
          );
        if (!req.file)
          return fail(
            res,
            400,
            "FACE_IMAGE_REQUIRED",
            "A fresh camera-captured JPEG or PNG face image is required.",
          );
        const now = new Date();
        const session = await prisma.faceVerificationSession.findFirst({
          where: {
            id: body.challengeId,
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            deviceId: body.deviceId,
            status: "CHALLENGE",
          },
        });
        if (!session || session.expiresAt <= now) {
          if (session)
            await prisma.faceVerificationSession.update({
              where: { id: session.id },
              data: { status: "EXPIRED" },
            });
          return fail(
            res,
            410,
            "FACE_CHALLENGE_EXPIRED",
            "Face verification expired. Start again.",
          );
        }
        const enrollment = await prisma.faceEnrollment.findFirst({
          where: {
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            status: "ACTIVE",
          },
        });
        if (!enrollment)
          return fail(
            res,
            428,
            "FACE_NOT_ENROLLED",
            "HR or an administrator must enroll your face first.",
          );
        const result = await verifyEmployeeFace(
          enrollment.providerFaceId,
          req.file.buffer,
        );
        if (!result.matched) {
          const attempts = session.attemptCount + 1;
          await prisma.faceVerificationSession.update({
            where: { id: session.id },
            data: {
              attemptCount: attempts,
              status: attempts >= 3 ? "REJECTED" : "CHALLENGE",
            },
          });
          await prisma.auditLog.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: "FACE_MISMATCH",
              category: "ATTENDANCE_SECURITY",
              details: `Employee-specific face verification rejected for ${session.action}.`,
              ipAddress: clientIp(req),
            },
          });
          return fail(
            res,
            401,
            "FACE_MISMATCH",
            attempts >= 3
              ? "Face does not match the enrolled employee. This verification has been locked."
              : "Face does not match the enrolled employee. Try again in good lighting.",
          );
        }
        const proof = createOpaqueToken();
        await prisma.faceVerificationSession.update({
          where: { id: session.id },
          data: {
            status: "VERIFIED",
            proofTokenHash: proof.hash,
            similarity: result.similarity,
            verifiedAt: now,
            expiresAt: new Date(Date.now() + 60_000),
            attemptCount: { increment: 1 },
          },
        });
        return ok(res, {
          faceVerificationToken: proof.token,
          similarity: result.similarity,
          expiresInSeconds: 60,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/attendance/punch",
    authenticate,
    requirePermission("attendance.punch"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            action: z.enum(["CLOCK_IN", "CLOCK_OUT"]),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            locationAccuracyMeters: z.number().positive().max(200),
            deviceId: z.string().trim().min(16).max(200),
            faceVerificationToken: z.string().min(32).max(500),
            recordedAt: z.string().datetime().optional(),
          })
          .parse(req.body);
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked to this account.",
          );
        const serverNow = new Date();
        const punchTime = body.recordedAt ? new Date(body.recordedAt) : serverNow;
        const effectivePunchTime =
          !isNaN(punchTime.getTime()) &&
          punchTime.getTime() <= serverNow.getTime() + 120_000 &&
          punchTime.getTime() >= serverNow.getTime() - 7 * 86400_000
            ? punchTime
            : serverNow;
        const date = indiaDate(effectivePunchTime);
        const proofHash = hashToken(body.faceVerificationToken);
        const result = await prisma.$transaction(async (tx) => {
          const verification = await tx.faceVerificationSession.findFirst({
            where: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId,
              action: body.action,
              deviceId: body.deviceId,
              proofTokenHash: proofHash,
              status: "VERIFIED",
              consumedAt: null,
              expiresAt: body.recordedAt ? { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } : { gt: serverNow },
            },
          });
          if (!verification) {
            // Idempotent check for offline retry: if already consumed for this device/token, return the record
            const alreadyConsumed = await tx.faceVerificationSession.findFirst({
              where: {
                companyId: req.auth!.companyId,
                employeeId: req.auth!.employeeId,
                action: body.action,
                deviceId: body.deviceId,
                proofTokenHash: proofHash,
                status: "CONSUMED",
              },
            });
            if (alreadyConsumed) {
              const existingRecord = await tx.attendanceRecord.findFirst({
                where: { companyId: req.auth!.companyId, employeeId: req.auth!.employeeId!, date },
              });
              if (existingRecord) {
                return { record: existingRecord, existed: true, trackingEnabled: false };
              }
            }
            throw Object.assign(
              new Error(
                "Complete a fresh employee face match before recording attendance.",
              ),
              { status: 401, code: "FACE_VERIFICATION_REQUIRED" },
            );
          }
          const employeeLocation = await tx.employee.findFirst({
            where: {
              id: req.auth!.employeeId!,
              companyId: req.auth!.companyId,
            },
            select: { location: true, workdayGpsTrackingEnabled: true },
          });
          if (
            employeeLocation?.location?.latitude != null &&
            employeeLocation.location.longitude != null &&
            employeeLocation.location.geofenceRadiusMeters != null &&
            !employeeLocation.location.remote
          ) {
            const distance = distanceMeters(
              body.latitude,
              body.longitude,
              employeeLocation.location.latitude,
              employeeLocation.location.longitude,
            );
            if (
              distance >
              employeeLocation.location.geofenceRadiusMeters +
                body.locationAccuracyMeters
            )
              throw Object.assign(
                new Error(
                  `You are outside the ${employeeLocation.location.name} attendance area.`,
                ),
                { status: 403, code: "OUTSIDE_GEOFENCE" },
              );
          }
          const consumed = await tx.faceVerificationSession.updateMany({
            where: {
              id: verification.id,
              status: "VERIFIED",
              consumedAt: null,
            },
            data: { status: "CONSUMED", consumedAt: serverNow },
          });
          if (consumed.count !== 1)
            throw Object.assign(
              new Error("Face verification was already used. Verify again."),
              { status: 409, code: "FACE_PROOF_ALREADY_USED" },
            );
          const existing = body.action === "CLOCK_OUT"
            ? await tx.attendanceRecord.findFirst({where:{companyId:req.auth!.companyId,employeeId:req.auth!.employeeId!,date,status:{not:"ABSENT"},clockInTime:{not:null},clockOutTime:null},orderBy:{clockInTime:"desc"}})
            : await tx.attendanceRecord.findUnique({where:{employeeId_date:{employeeId:req.auth!.employeeId!,date}}});
          const attendanceDate=existing?.date||date;
          const locked = await tx.attendancePeriodLock.findFirst({
            where: {
              companyId: req.auth!.companyId,
              periodStart: { lte: attendanceDate },
              periodEnd: { gte: attendanceDate },
            },
          });
          if (locked)
            throw Object.assign(
              new Error("Attendance is locked for payroll for this date."),
              { status: 423, code: "ATTENDANCE_PERIOD_LOCKED" },
            );
          if (body.action === "CLOCK_IN" && existing?.clockInTime && !existing?.clockOutTime)
            throw Object.assign(
              new Error("You are already clocked in. Clock out before clocking in again."),
              { status: 409, code: "ALREADY_CLOCKED_IN" },
            );
          if (body.action === "CLOCK_OUT" && !existing?.clockInTime)
            throw Object.assign(new Error("Clock in before clocking out."), {
              status: 409,
              code: "CLOCK_IN_REQUIRED",
            });
          if (body.action === "CLOCK_OUT" && existing?.clockOutTime)
            throw Object.assign(
              new Error("You have already clocked out."),
              { status: 409, code: "ALREADY_CLOCKED_OUT" },
            );
          let clockInStatus: "PRESENT" | "LATE" = "PRESENT";
          if (body.action === "CLOCK_IN") {
            const [companySettings, policy, shiftAssignment] = await Promise.all([
              tx.companySettings.findUnique({ where: { companyId: req.auth!.companyId } }),
              tx.attendancePolicy.findFirst({
                where: { companyId: req.auth!.companyId },
                orderBy: { effectiveFrom: "desc" },
              }),
              tx.shiftAssignment.findFirst({
                where: {
                  companyId: req.auth!.companyId,
                  employeeId: req.auth!.employeeId!,
                  startsOn: { lte: date },
                  OR: [{ endsOn: null }, { endsOn: { gte: date } }],
                },
                include: { shiftTemplate: true },
                orderBy: { startsOn: "desc" },
              }),
            ]);

            const rawTz = companySettings?.timezone || "Asia/Kolkata";
            const tz = rawTz.split(/[\s(]/)[0] || "Asia/Kolkata";
            const [startH, startM] = (companySettings?.businessHoursStart || "10:00").split(":").map(Number);
            const defaultStartMinute = (isNaN(startH) ? 10 : startH) * 60 + (isNaN(startM) ? 0 : startM);
            const startMinute = shiftAssignment?.shiftTemplate?.startMinute ?? defaultStartMinute;
            const grace = policy?.graceInMinutes ?? 60;
            const lateCutoffMinute = startMinute + grace;

            const parts = new Intl.DateTimeFormat("en-US", {
              timeZone: tz,
              hour: "numeric",
              minute: "numeric",
              hour12: false,
            }).formatToParts(effectivePunchTime);
            const inH = Number(parts.find((p) => p.type === "hour")?.value ?? effectivePunchTime.getHours());
            const inM = Number(parts.find((p) => p.type === "minute")?.value ?? effectivePunchTime.getMinutes());
            const punchMinuteOfDay = inH * 60 + inM;

            if (punchMinuteOfDay > lateCutoffMinute) {
              clockInStatus = "LATE";
            }
          }

          const data =
            body.action === "CLOCK_IN"
              ? {
                  clockInTime: effectivePunchTime,
                  clockOutTime: null,
                  status: clockInStatus,
                  locationLat: body.latitude,
                  locationLng: body.longitude,
                  deviceId: body.deviceId,
                  faceAuthVerified: true,
                  faceConfidenceScore: verification.similarity,
                  source: "MOBILE_FACE" as const,
                }
              : { clockOutTime: effectivePunchTime };
          const record = body.action === "CLOCK_OUT" ? await tx.attendanceRecord.update({where:{id:existing!.id},data}) : await tx.attendanceRecord.upsert({
            where: {
              employeeId_date: { employeeId: req.auth!.employeeId!, date },
            },
            update: data,
            create: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId!,
              date,
              status: clockInStatus,
              clockInTime: effectivePunchTime,
              locationLat: body.latitude,
              locationLng: body.longitude,
              deviceId: body.deviceId,
              faceAuthVerified: true,
              faceConfidenceScore: verification.similarity,
              source: "MOBILE_FACE",
            },
          });
          if(employeeLocation?.workdayGpsTrackingEnabled){
            await tx.attendanceLocationPoint.create({data:{id:crypto.randomUUID(),companyId:req.auth!.companyId,employeeId:req.auth!.employeeId!,attendanceRecordId:record.id,latitude:body.latitude,longitude:body.longitude,accuracyMeters:body.locationAccuracyMeters,capturedAt:effectivePunchTime}});
          }
          await tx.auditLog.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: body.action,
              category: "ATTENDANCE",
              details: `${body.action} recorded after server face match (${verification.similarity?.toFixed(2) || "verified"}%) at ${body.latitude}, ${body.longitude} (accuracy ${body.locationAccuracyMeters}m).`,
              ipAddress: clientIp(req),
            },
          });
          return { record, existed: Boolean(existing), trackingEnabled: employeeLocation?.workdayGpsTrackingEnabled===true };
        });
        await emitNotification(prisma, {
          companyId: req.auth!.companyId,
          userId: req.auth!.id,
          eventKey: body.action === "CLOCK_IN" ? "ATTENDANCE_CLOCK_IN" : "ATTENDANCE_CLOCK_OUT",
          title: body.action === "CLOCK_IN" ? "Clock-in recorded" : "Clock-out recorded",
          body: body.action === "CLOCK_IN"
            ? `Your workday started at ${effectivePunchTime.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}.`
            : `Your workday ended at ${effectivePunchTime.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}.`,
          entityType: "AttendanceRecord",
          entityId: result.record.id,
          actionUrl: "/attendance",
        });
        return ok(res, { ...result.record, workdayGpsTrackingEnabled: result.trackingEnabled }, result.existed ? 200 : 201);
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/me/leaves",
    authenticate,
    requirePermission("leave.apply"),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        const [requests, types, employee, encashments] = await prisma.$transaction([
          prisma.leaveRequest.findMany({
            where: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId,
            },
            include: { leaveType: true },
            orderBy: { appliedAt: "desc" },
          }),
          prisma.leaveType.findMany({
            where: { companyId: req.auth!.companyId },
          }),
          prisma.employee.findUnique({
            where: { id: req.auth!.employeeId! },
            select: { dateOfJoining: true },
          }),
          prisma.employeeServiceRequest.findMany({
            where: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId,
              type: "LEAVE_ENCASHMENT",
              status: { in: ["PENDING", "APPROVED"] },
            },
          }),
        ]);
        const year = new Date().getUTCFullYear();
        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd = new Date(Date.UTC(year, 11, 31));
        const balances = types.map((type) => {
          const joinedThisYear = employee!.dateOfJoining > yearStart;
          const serviceStart = joinedThisYear
            ? employee!.dateOfJoining
            : yearStart;
          const months = Math.max(0, 12 - serviceStart.getUTCMonth());
          const entitlement =
            type.accrualFrequency === "MONTHLY"
              ? (type.daysAllowedPerYear * months) / 12
              : type.daysAllowedPerYear;
          const used = requests
            .filter(
              (r) =>
                r.leaveTypeId === type.id &&
                ["PENDING", "APPROVED"].includes(r.status) &&
                r.startDate <= yearEnd &&
                r.endDate >= yearStart,
            )
            .reduce((sum, r) => sum + r.totalDays, 0);
          const encashed = (encashments || [])
            .filter((e) => {
              const p = e.payload as Record<string, unknown> | null;
              return p?.leaveTypeId === type.id;
            })
            .reduce((sum, e) => {
              const p = e.payload as Record<string, unknown> | null;
              return sum + (Number(p?.days) || 0);
            }, 0);
          const totalDeducted = used + encashed;
          const available = Math.max(
            type.allowNegative ? -Infinity : 0,
            Math.min(
              type.maximumBalance ?? Infinity,
              entitlement + type.carryForwardDays,
            ) - totalDeducted,
          );
          return { leaveTypeId: type.id, year, entitlement, used, encashed, available };
        });
        return ok(res, { requests, types, balances });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/leaves",
    authenticate,
    requirePermission("leave.apply"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            leaveTypeId: z.string().uuid(),
            startDate: z.coerce.date(),
            endDate: z.coerce.date(),
            reason: z.string().trim().min(3).max(1000),
          })
          .parse(req.body);
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        if (body.endDate < body.startDate)
          return fail(
            res,
            400,
            "DATE_RANGE_INVALID",
            "End date must not be before start date.",
          );
        const type = await prisma.leaveType.findFirst({
          where: { id: body.leaveTypeId, companyId: req.auth!.companyId },
        });
        if (!type)
          return fail(
            res,
            404,
            "LEAVE_TYPE_NOT_FOUND",
            "Leave type was not found.",
          );
        const noticeDays = Math.floor(
          (body.startDate.getTime() - indiaDate().getTime()) / 86_400_000,
        );
        if (noticeDays < type.minimumNoticeDays)
          return fail(
            res,
            400,
            "LEAVE_NOTICE_REQUIRED",
            `This leave requires ${type.minimumNoticeDays} days notice.`,
          );
        const overlap = await prisma.leaveRequest.findFirst({
          where: {
            employeeId: req.auth!.employeeId,
            status: { in: ["PENDING", "APPROVED"] },
            startDate: { lte: body.endDate },
            endDate: { gte: body.startDate },
          },
        });
        if (overlap)
          return fail(
            res,
            409,
            "LEAVE_OVERLAP",
            "A leave request already exists for these dates.",
          );
        const totalDays =
          Math.floor(
            (body.endDate.getTime() - body.startDate.getTime()) / 86_400_000,
          ) + 1;
        const yearStart = new Date(
            Date.UTC(body.startDate.getUTCFullYear(), 0, 1),
          ),
          yearEnd = new Date(Date.UTC(body.startDate.getUTCFullYear(), 11, 31));
        const employee = await prisma.employee.findUniqueOrThrow({
          where: { id: req.auth!.employeeId },
          select: { dateOfJoining: true },
        });
        const existingUsed = (
          await prisma.leaveRequest.findMany({
            where: {
              employeeId: req.auth!.employeeId,
              leaveTypeId: type.id,
              status: { in: ["PENDING", "APPROVED"] },
              startDate: { lte: yearEnd },
              endDate: { gte: yearStart },
            },
            select: { totalDays: true },
          })
        ).reduce((sum, item) => sum + item.totalDays, 0);
        const existingEncashed = (
          await prisma.employeeServiceRequest.findMany({
            where: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId,
              type: "LEAVE_ENCASHMENT",
              status: { in: ["PENDING", "APPROVED"] },
            },
          })
        )
          .filter((e) => {
            const p = e.payload as Record<string, unknown> | null;
            return p?.leaveTypeId === type.id;
          })
          .reduce((sum, e) => {
            const p = e.payload as Record<string, unknown> | null;
            return sum + (Number(p?.days) || 0);
          }, 0);
        const serviceStart =
            employee.dateOfJoining > yearStart
              ? employee.dateOfJoining
              : yearStart,
          months = Math.max(0, 12 - serviceStart.getUTCMonth()),
          entitlement =
            type.accrualFrequency === "MONTHLY"
              ? (type.daysAllowedPerYear * months) / 12
              : type.daysAllowedPerYear,
          available =
            Math.min(
              type.maximumBalance ?? Infinity,
              entitlement + type.carryForwardDays,
            ) - (existingUsed + existingEncashed);
        if (!type.allowNegative && totalDays > available)
          return fail(
            res,
            409,
            "LEAVE_BALANCE_INSUFFICIENT",
            `Only ${available.toFixed(1)} leave days are available.`,
          );
        const result = await prisma.$transaction(async (tx) => {
          const request = await tx.leaveRequest.create({
            data: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId!,
              leaveTypeId: type.id,
              startDate: body.startDate,
              endDate: body.endDate,
              totalDays,
              reason: body.reason,
            },
          });
          const workflow = await startConfiguredWorkflow(tx, {
            companyId: req.auth!.companyId,
            requesterUserId: req.auth!.id,
            module: "LEAVE",
            subjectType: "LeaveRequest",
            subjectId: request.id,
            title: `${type.name} leave request`,
            summary: body.reason,
            payload: {
              startDate: body.startDate.toISOString(),
              endDate: body.endDate.toISOString(),
              totalDays,
            },
          });
          return { request, workflowId: workflow?.id };
        });
        return ok(
          res,
          { ...result.request, workflowId: result.workflowId },
          201,
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/leaves/:id/cancel",
    authenticate,
    requirePermission("leave.apply"),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        const request = await prisma.leaveRequest.findFirst({
          where: {
            id: String(req.params.id),
            companyId: req.auth!.companyId,
            employeeId: req.auth!.employeeId,
            status: { in: ["PENDING", "APPROVED"] },
          },
        });
        if (!request)
          return fail(
            res,
            404,
            "LEAVE_NOT_CANCELLABLE",
            "Leave request was not found or cannot be cancelled.",
          );
        if (request.startDate <= indiaDate() && request.status === "APPROVED")
          return fail(
            res,
            409,
            "LEAVE_ALREADY_STARTED",
            "Approved leave cannot be self-cancelled after it starts.",
          );
        await prisma.leaveRequest.update({
          where: { id: request.id },
          data: { status: "CANCELLED" },
        });
        await prisma.auditLog.create({
          data: {
            companyId: req.auth!.companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: "CANCEL_LEAVE",
            category: "LEAVE",
            details: `Leave ${request.id} cancelled by employee.`,
            ipAddress: clientIp(req),
          },
        });
        return ok(res, { cancelled: true });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/me/payslips",
    authenticate,
    requirePermission("payslip.read.self"),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        const employeeId = req.auth!.employeeId;
        const [payslips, ytdLines, revisions, adjustments] = await prisma.$transaction([
          prisma.payslip.findMany({
            where: { companyId: req.auth!.companyId, employeeId },
            include: {
              employee: { include: { department: true, designation: true } },
              payrollRun: { include: { lines: { where: { employeeId } } } },
            },
            orderBy: { month: "desc" },
          }),
          prisma.payrollLine.findMany({
            where: { employeeId, payrollRun: { companyId: req.auth!.companyId, status: { in: ["PAYSLIPS_PUBLISHED", "PAID"] } } },
            include: { payrollRun: { select: { month: true } } },
          }),
          prisma.employeeSalaryRevision.findMany({
            where: { companyId: req.auth!.companyId, employeeId, status: { in: ["APPROVED", "SUPERSEDED"] } },
            include: { structure: { include: { components: true } } },
            orderBy: { effectiveFrom: "desc" },
          }),
          prisma.payrollAdjustment.findMany({ where: { companyId: req.auth!.companyId, employeeId } }),
        ]);
        return ok(res, payslips.map(item => {
          const line = item.payrollRun.lines[0];
          const [year, month] = item.month.split("-").map(Number);
          const financialYearStart = month >= 4 ? year : year - 1;
          const startMonth = `${financialYearStart}-04`, endMonth = `${financialYearStart + 1}-03`;
          const relevant = ytdLines.filter(value => value.payrollRun.month >= startMonth && value.payrollRun.month <= item.month && value.payrollRun.month <= endMonth);
          const ytdBreakdown = relevant.reduce<Record<string, number>>((total, value) => {
            for (const [code, amount] of Object.entries(value.breakdown as Record<string, number>)) total[code] = (total[code] || 0) + Number(amount || 0);
            return total;
          }, {});
          const employee = item.employee;
          const monthEnd = new Date(Date.UTC(year, month, 0));
          const revision = revisions.find(value => value.effectiveFrom <= monthEnd);
          const componentMeta: Record<string, { name: string; kind: "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION" | "REIMBURSEMENT" }> = {};
          for (const component of revision?.structure.components || []) componentMeta[component.code] = { name: component.name, kind: component.kind };
          for (const adjustment of adjustments.filter(value => value.month === item.month)) componentMeta[adjustment.code] = { name: adjustment.name, kind: adjustment.kind };
          Object.assign(componentMeta, {
            PF_EMPLOYEE: { name: "Employee Provident Fund", kind: "DEDUCTION" }, PF_EMPLOYER: { name: "Employer Provident Fund", kind: "EMPLOYER_CONTRIBUTION" },
            ESI_EMPLOYEE: { name: "Employee State Insurance", kind: "DEDUCTION" }, ESI_EMPLOYER: { name: "Employer State Insurance", kind: "EMPLOYER_CONTRIBUTION" },
            PROFESSIONAL_TAX: { name: "Professional Tax", kind: "DEDUCTION" }, TDS: { name: "Income Tax (TDS)", kind: "DEDUCTION" },
            LWF_EMPLOYEE: { name: "Labour Welfare Fund", kind: "DEDUCTION" }, LWF_EMPLOYER: { name: "Employer Labour Welfare Fund", kind: "EMPLOYER_CONTRIBUTION" },
            LOAN_REPAYMENT: { name: "Loan repayment", kind: "DEDUCTION" },
          });
          return {
            ...item,
            payrollRun: undefined,
            reimbursements: line?.reimbursements || 0,
            employerContributions: line?.employerContributions || 0,
            breakdown: (line?.breakdown || {}) as Record<string, number>,
            ytdBreakdown,
            ytdGross: relevant.reduce((sum, value) => sum + value.grossEarnings, 0),
            ytdDeductions: relevant.reduce((sum, value) => sum + value.employeeDeductions, 0),
            ytdNet: relevant.reduce((sum, value) => sum + value.netPay, 0),
            componentMeta,
            department: employee.department,
            designation: employee.designation,
            employee: {
              ...employee,
              phone: employee.phone || "",
              dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10) || "",
              dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
              workLocation: employee.workLocation || "",
              salary: { basic: employee.basicSalary, hra: employee.hra, allowances: employee.allowances, providentFund: employee.providentFund, taxDeduction: employee.taxDeduction, currency: employee.currency },
              bankDetails: { bankName: employee.bankName || "", accountNumber: employee.accountNumber || "", routingOrIfsc: employee.routingOrIfsc || "", taxIdentifier: employee.taxIdentifier || "" },
              emergencyContact: { name: employee.emergencyName || "", relationship: employee.emergencyRelation || "", phone: employee.emergencyPhone || "" },
            },
          };
        }));
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/me/expenses",
    authenticate,
    requirePermission("expense.submit"),
    async (req: AuthedRequest, res, next) => {
      try {
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        return ok(
          res,
          await prisma.expenseClaim.findMany({
            where: {
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId,
            },
            orderBy: { submittedAt: "desc" },
          }),
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/me/expenses",
    authenticate,
    requirePermission("expense.submit"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            title: z.string().trim().min(3).max(150),
            category: z.enum([
              "TRAVEL",
              "MEALS",
              "HARDWARE",
              "CERTIFICATION",
              "MISC",
            ]),
            amount: z.number().positive().max(10_000_000),
            expenseDate: z.coerce.date(),
            notes: z.string().max(1000).optional(),
          })
          .parse(req.body);
        if (!req.auth!.employeeId)
          return fail(
            res,
            409,
            "EMPLOYEE_NOT_LINKED",
            "No employee profile is linked.",
          );
        const result = await prisma.$transaction(async (tx) => {
          const expense = await tx.expenseClaim.create({
            data: {
              ...body,
              companyId: req.auth!.companyId,
              employeeId: req.auth!.employeeId!,
              currency: "INR",
            },
          });
          const workflow = await startConfiguredWorkflow(tx, {
            companyId: req.auth!.companyId,
            requesterUserId: req.auth!.id,
            module: "EXPENSE",
            subjectType: "ExpenseClaim",
            subjectId: expense.id,
            title: expense.title,
            summary: expense.notes || undefined,
            payload: {
              category: expense.category,
              amount: expense.amount,
              currency: expense.currency,
              expenseDate: expense.expenseDate.toISOString(),
            },
          });
          return { expense, workflowId: workflow?.id };
        });
        return ok(
          res,
          { ...result.expense, workflowId: result.workflowId },
          201,
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/employees",
    authenticate,
    async (req: AuthedRequest, res, next) => {
      try {
        const auth = req.auth!;
        const canRead = auth.permissions.some((permission) =>
          [
            "employee.read.all",
            "employee.read.team",
            "employee.read.self",
          ].includes(permission),
        );
        if (!canRead)
          return fail(
            res,
            403,
            "FORBIDDEN",
            "You do not have permission to read employees.",
          );
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(
          100,
          Math.max(1, Number(req.query.pageSize || 25)),
        );
        const scopedFilters = employeeScopeFilters(auth, rolePermissions);
        if (!scopedFilters.length)
          return ok(res, [], 200, { page, pageSize, total: 0, totalPages: 0 });
        const search = String(req.query.search || "").trim();
        const where = {
          companyId: auth.companyId,
          OR: scopedFilters,
          ...(search
            ? {
                AND: [
                  {
                    OR: [
                      {
                        firstName: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        lastName: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        employeeCode: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  },
                ],
              }
            : {}),
        };
        const [items, total] = await prisma.$transaction([
          prisma.employee.findMany({
            where,
            include: { department: true, designation: true },
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          prisma.employee.count({ where }),
        ]);
        return ok(res, items, 200, {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/employees/:id/face-enrollment",
    authenticate,
    requirePermission("face.enroll"),
    async (req: AuthedRequest, res, next) => {
      try {
        const employee = await prisma.employee.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
        });
        if (!employee)
          return fail(
            res,
            404,
            "EMPLOYEE_NOT_FOUND",
            "Employee was not found in this company.",
          );
        const enrollment = await prisma.faceEnrollment.findFirst({
          where: {
            employeeId: employee.id,
            companyId: req.auth!.companyId,
            status: "ACTIVE",
          },
          include: { enrolledBy: { select: { fullName: true, role: true } } },
        });
        return ok(
          res,
          enrollment
            ? {
                enrolled: true,
                enrolledAt: enrollment.enrolledAt,
                enrolledBy: enrollment.enrolledBy.fullName,
                enrolledByRole: enrollment.enrolledBy.role,
                provider: enrollment.provider,
              }
            : { enrolled: false },
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/employees/:id/face-enrollment",
    authenticate,
    requirePermission("face.enroll"),
    faceUpload.single("face"),
    async (req: AuthedRequest, res, next) => {
      try {
        const consent = z
          .object({ consentAcknowledged: z.enum(["true"]) })
          .parse(req.body);
        if (!consent.consentAcknowledged || !req.file)
          return fail(
            res,
            400,
            "FACE_IMAGE_REQUIRED",
            "Select one clear employee face photo and confirm consent.",
          );
        const employee = await prisma.employee.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
        });
        if (!employee)
          return fail(
            res,
            404,
            "EMPLOYEE_NOT_FOUND",
            "Employee was not found in this company.",
          );
        const previous = await prisma.faceEnrollment.findUnique({
          where: { employeeId: employee.id },
        });
        const newFaceId = await enrollEmployeeFace(
          employee.id,
          req.file.buffer,
        );
        try {
          const enrollment = await prisma.$transaction(async (tx) => {
            const saved = await tx.faceEnrollment.upsert({
              where: { employeeId: employee.id },
              create: {
                companyId: req.auth!.companyId,
                employeeId: employee.id,
                providerFaceId: newFaceId,
                enrolledById: req.auth!.id,
              },
              update: {
                providerFaceId: newFaceId,
                provider: "AWS_REKOGNITION",
                status: "ACTIVE",
                enrolledById: req.auth!.id,
                enrolledAt: new Date(),
              },
            });
            await tx.faceVerificationSession.updateMany({
              where: {
                employeeId: employee.id,
                status: { in: ["CHALLENGE", "VERIFIED"] },
              },
              data: { status: "REJECTED" },
            });
            await tx.auditLog.create({
              data: {
                companyId: req.auth!.companyId,
                userId: req.auth!.id,
                userName: req.auth!.id,
                userRole: req.auth!.role,
                action: previous
                  ? "REPLACE_EMPLOYEE_FACE"
                  : "ENROLL_EMPLOYEE_FACE",
                category: "BIOMETRIC_SECURITY",
                details: `${employee.employeeCode} face template ${previous ? "replaced" : "enrolled"} by authorized ${req.auth!.role}. Raw photo was not retained.`,
                ipAddress: clientIp(req),
              },
            });
            return saved;
          });
          if (previous?.providerFaceId && previous.providerFaceId !== newFaceId)
            void deleteEmployeeFace(previous.providerFaceId).catch((error) =>
              console.error("Old face cleanup failed:", error),
            );
          return ok(
            res,
            { enrolled: true, enrolledAt: enrollment.enrolledAt },
            previous ? 200 : 201,
          );
        } catch (error) {
          void deleteEmployeeFace(newFaceId).catch((cleanupError) =>
            console.error("New face cleanup failed:", cleanupError),
          );
          throw error;
        }
      } catch (e) {
        next(e);
      }
    },
  );

  router.delete(
    "/employees/:id/face-enrollment",
    authenticate,
    requirePermission("face.enroll"),
    async (req: AuthedRequest, res, next) => {
      try {
        const employee = await prisma.employee.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
        });
        if (!employee)
          return fail(
            res,
            404,
            "EMPLOYEE_NOT_FOUND",
            "Employee was not found in this company.",
          );
        const enrollment = await prisma.faceEnrollment.findUnique({
          where: { employeeId: employee.id },
        });
        if (!enrollment || enrollment.status !== "ACTIVE")
          return ok(res, { enrolled: false });
        await deleteEmployeeFace(enrollment.providerFaceId);
        await prisma.$transaction([
          prisma.faceEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "REVOKED" },
          }),
          prisma.faceVerificationSession.updateMany({
            where: {
              employeeId: employee.id,
              status: { in: ["CHALLENGE", "VERIFIED"] },
            },
            data: { status: "REJECTED" },
          }),
          prisma.auditLog.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: "REVOKE_EMPLOYEE_FACE",
              category: "BIOMETRIC_SECURITY",
              details: `${employee.employeeCode} face enrollment revoked by authorized ${req.auth!.role}.`,
              ipAddress: clientIp(req),
            },
          }),
        ]);
        return ok(res, { enrolled: false });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/departments",
    authenticate,
    requirePermission("employee.read.all"),
    async (req: AuthedRequest, res, next) => {
      try {
        return ok(
          res,
          await prisma.department.findMany({
            where: { companyId: req.auth!.companyId },
            orderBy: { name: "asc" },
          }),
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/designations",
    authenticate,
    requirePermission("employee.read.all"),
    async (req: AuthedRequest, res, next) => {
      try {
        return ok(
          res,
          await prisma.designation.findMany({
            where: { companyId: req.auth!.companyId },
            orderBy: { title: "asc" },
          }),
        );
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/employees/onboard",
    authenticate,
    requirePermission("employee.manage"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            employeeCode: z.string().trim().min(2).max(30),
            firstName: z.string().trim().min(1).max(80),
            lastName: z.string().trim().min(1).max(80),
            email: z.string().email(),
            departmentId: z.string().uuid(),
            designationId: z.string().uuid(),
            reportingManagerId: z.string().uuid().optional(),
            branchId: z.string().uuid().optional(),
            workLocationId: z.string().uuid().optional(),
            teamId: z.string().uuid().optional(),
            costCenterId: z.string().uuid().optional(),
            employeeGradeId: z.string().uuid().optional(),
            dateOfJoining: z.coerce.date(),
            confirmationDate: z.coerce.date().optional(),
            probationEndDate: z.coerce.date().optional(),
            employmentType: z
              .enum([
                "FULL_TIME",
                "PART_TIME",
                "CONTRACT",
                "INTERN",
                "CONSULTANT",
              ])
              .default("FULL_TIME"),
            workLocation: z.string().max(120).optional(),
            phone: z.string().max(30).optional(),
            workdayGpsTrackingEnabled: z.boolean().default(false),
          })
          .parse(req.body);
        const idempotencyKey = req.header("idempotency-key");
        if (!idempotencyKey)
          return fail(
            res,
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Idempotency-Key header is required.",
          );
        const old = await prisma.idempotencyRecord.findUnique({
          where: {
            companyId_userId_key_operation: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              key: idempotencyKey,
              operation: "EMPLOYEE_ONBOARD",
            },
          },
        });
        if (old) return ok(res, old.responseJson, old.statusCode);
        const companyId = req.auth!.companyId;
        const [
          department,
          designation,
          branch,
          location,
          team,
          costCenter,
          grade,
          manager,
        ] = await Promise.all([
          prisma.department.findFirst({
            where: { id: body.departmentId, companyId },
          }),
          prisma.designation.findFirst({
            where: {
              id: body.designationId,
              companyId,
              departmentId: body.departmentId,
            },
          }),
          body.branchId
            ? prisma.branch.findFirst({
                where: { id: body.branchId, companyId },
              })
            : true,
          body.workLocationId
            ? prisma.workLocation.findFirst({
                where: { id: body.workLocationId, companyId },
              })
            : true,
          body.teamId
            ? prisma.team.findFirst({ where: { id: body.teamId, companyId } })
            : true,
          body.costCenterId
            ? prisma.costCenter.findFirst({
                where: { id: body.costCenterId, companyId },
              })
            : true,
          body.employeeGradeId
            ? prisma.employeeGrade.findFirst({
                where: { id: body.employeeGradeId, companyId },
              })
            : true,
          body.reportingManagerId
            ? prisma.employee.findFirst({
                where: { id: body.reportingManagerId, companyId },
              })
            : true,
        ]);
        if (!department || !designation)
          return fail(
            res,
            400,
            "ORGANIZATION_INVALID",
            "Department or designation is invalid for this company.",
          );
        if (!branch || !location || !team || !costCenter || !grade || !manager)
          return fail(
            res,
            400,
            "ORGANIZATION_INVALID",
            "One or more organization assignments are invalid for this company.",
          );
        const email = body.email.toLowerCase();
        const activation = createOpaqueToken();
        const response = await prisma.$transaction(async (tx) => {
          const duplicate = await tx.user.findUnique({ where: { email } });
          if (duplicate)
            throw Object.assign(
              new Error("A user with this email already exists."),
              { status: 409, code: "EMAIL_EXISTS" },
            );
          const user = await tx.user.create({
            data: {
              companyId: req.auth!.companyId,
              email,
              fullName: `${body.firstName} ${body.lastName}`,
              role: "EMPLOYEE",
              passwordHash: null,
            },
          });
          const employee = await tx.employee.create({
            data: {
              companyId,
              userId: user.id,
              employeeCode: body.employeeCode,
              firstName: body.firstName,
              lastName: body.lastName,
              email,
              departmentId: body.departmentId,
              designationId: body.designationId,
              reportingManagerId: body.reportingManagerId,
              branchId: body.branchId,
              workLocationId: body.workLocationId,
              teamId: body.teamId,
              costCenterId: body.costCenterId,
              employeeGradeId: body.employeeGradeId,
              dateOfJoining: body.dateOfJoining,
              confirmationDate: body.confirmationDate,
              probationEndDate: body.probationEndDate,
              employmentType: body.employmentType,
              status: "ON_PROBATION",
              workLocation: body.workLocation,
              workdayGpsTrackingEnabled: body.workdayGpsTrackingEnabled,
              phone: body.phone,
              skills: [],
            },
          });
          await tx.actionToken.create({
            data: {
              userId: user.id,
              type: "ACCOUNT_ACTIVATION",
              tokenHash: activation.hash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          });
          const delivery = await tx.emailDelivery.create({
            data: {
              companyId: req.auth!.companyId,
              userId: user.id,
              employeeId: employee.id,
              idempotencyKey: `onboard:${idempotencyKey}`,
              messageType: "EMPLOYEE_ONBOARDING",
              recipient: email,
            },
          });
          const result = {
            employee,
            emailDelivery: { id: delivery.id, status: delivery.status },
          };
          await tx.idempotencyRecord.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              key: idempotencyKey,
              operation: "EMPLOYEE_ONBOARD",
              responseJson: result,
              statusCode: 201,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          });
          await tx.auditLog.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: "ONBOARD_EMPLOYEE",
              category: "EMPLOYEE",
              details: `Employee ${employee.employeeCode} onboarded.`,
              ipAddress: req.ip || "unknown",
            },
          });
          return result;
        });
        void deliverOnboardingEmail(
          prisma,
          response.emailDelivery.id,
          activation.token,
        );
        return ok(res, response, 201);
      } catch (e) {
        next(e);
      }
    },
  );

  router.post(
    "/employees/:id/resend-onboarding",
    authenticate,
    requirePermission("employee.manage"),
    async (req: AuthedRequest, res, next) => {
      try {
        const employee = await prisma.employee.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
          include: { user: true },
        });
        if (!employee?.user)
          return fail(
            res,
            404,
            "EMPLOYEE_NOT_FOUND",
            "Employee portal account was not found.",
          );
        if (employee.user.emailVerifiedAt)
          return fail(
            res,
            409,
            "ACCOUNT_ALREADY_ACTIVE",
            "This employee has already activated the portal account. Use password reset if access needs to be recovered.",
          );
        const token = createOpaqueToken();
        const key = `resend:${employee.id}:${req.header("idempotency-key") || crypto.randomUUID()}`;
        const existing = await prisma.emailDelivery.findUnique({
          where: { idempotencyKey: key },
        });
        if (existing)
          return ok(res, { id: existing.id, status: existing.status });
        const [delivery] = await prisma.$transaction([
          prisma.emailDelivery.create({
            data: {
              companyId: req.auth!.companyId,
              userId: employee.user.id,
              employeeId: employee.id,
              idempotencyKey: key,
              messageType: "EMPLOYEE_ONBOARDING",
              recipient: employee.email,
            },
          }),
          prisma.actionToken.create({
            data: {
              userId: employee.user.id,
              type: "ACCOUNT_ACTIVATION",
              tokenHash: token.hash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            },
          }),
          prisma.actionToken.updateMany({
            where: {
              userId: employee.user.id,
              type: "ACCOUNT_ACTIVATION",
              usedAt: null,
              tokenHash: { not: token.hash },
            },
            data: { usedAt: new Date() },
          }),
          prisma.user.update({
            where: { id: employee.user.id },
            data: { passwordHash: null, tokenVersion: { increment: 1 } },
          }),
        ]);
        void deliverOnboardingEmail(
          prisma,
          delivery.id,
          token.token,
        );
        return ok(res, { id: delivery.id, status: delivery.status }, 202);
      } catch (e) {
        next(e);
      }
    },
  );

  router.patch("/employees/:id",authenticate,requirePermission("employee.manage"),async(req:AuthedRequest,res,next)=>{
    try{
        const body=z.object({employeeCode:z.string().trim().min(2).max(30),firstName:z.string().trim().min(1).max(80),lastName:z.string().trim().min(1).max(80),email:z.string().email(),phone:z.string().trim().max(30).nullable().optional(),departmentId:z.string().uuid(),designationId:z.string().uuid(),reportingManagerId:z.string().uuid().nullable().optional(),dateOfJoining:z.coerce.date(),employmentType:z.enum(["FULL_TIME","PART_TIME","CONTRACT","INTERN","CONSULTANT"]),workLocation:z.string().trim().max(120).nullable().optional(),workdayGpsTrackingEnabled:z.boolean().optional()}).parse(req.body),companyId=req.auth!.companyId;
      const employee=await prisma.employee.findFirst({where:{id:String(req.params.id),companyId}});
      if(!employee)return fail(res,404,"EMPLOYEE_NOT_FOUND","Employee was not found.");
      if(body.reportingManagerId===employee.id)return fail(res,400,"INVALID_REPORTING_MANAGER","An employee cannot report to themselves.");
      const [department,designation,manager,duplicateCode,duplicateEmail]=await Promise.all([prisma.department.findFirst({where:{id:body.departmentId,companyId}}),prisma.designation.findFirst({where:{id:body.designationId,departmentId:body.departmentId,companyId}}),body.reportingManagerId?prisma.employee.findFirst({where:{id:body.reportingManagerId,companyId}}):Promise.resolve(null),prisma.employee.findFirst({where:{companyId,employeeCode:body.employeeCode,id:{not:employee.id}}}),prisma.user.findFirst({where:{email:body.email.toLowerCase(),id:employee.userId?{not:employee.userId}:undefined}})]);
      if(!department||!designation)return fail(res,400,"ORGANIZATION_REFERENCE_INVALID","Department or designation is invalid.");
      if(body.reportingManagerId&&!manager)return fail(res,400,"REPORTING_MANAGER_INVALID","Reporting manager is invalid.");
      if(duplicateCode)return fail(res,409,"EMPLOYEE_CODE_EXISTS","Employee ID is already in use.");
      if(duplicateEmail)return fail(res,409,"EMAIL_EXISTS","Email is already in use.");
      const email=body.email.toLowerCase(),updated=await prisma.$transaction(async tx=>{const value=await tx.employee.update({where:{id:employee.id},data:{...body,email,phone:body.phone||null,reportingManagerId:body.reportingManagerId||null,workLocation:body.workLocation||null}});if(employee.userId)await tx.user.update({where:{id:employee.userId},data:{email,fullName:body.firstName+" "+body.lastName}});await tx.employeeOnboarding.updateMany({where:{createdEmployeeId:employee.id},data:{employeeCode:body.employeeCode,workEmail:email}});await tx.auditLog.create({data:{companyId,userId:req.auth!.id,userName:req.auth!.id,userRole:req.auth!.role,action:"UPDATE_EMPLOYEE_PROFILE",category:"EMPLOYEE",details:"Employee "+employee.employeeCode+" profile updated.",ipAddress:req.ip||"unknown"}});return value});
      return ok(res,updated);
    }catch(e){next(e)}
  });

  router.delete("/employees/:id", authenticate, requirePermission("employee.manage"), async (req: AuthedRequest, res, next) => {
    try { return ok(res, await deleteEmployeeSafely(req)); } catch (e) { next(e); }
  });

  router.patch(
    "/employees/:id/lifecycle",
    authenticate,
    requirePermission("employee.manage"),
    async (req: AuthedRequest, res, next) => {
      try {
        const body = z
          .object({
            status: z.enum([
              "ACTIVE",
              "ON_PROBATION",
              "ON_LEAVE",
              "RESIGNED",
              "TERMINATED",
            ]),
            confirmationDate: z.coerce.date().nullable().optional(),
            probationEndDate: z.coerce.date().nullable().optional(),
            resignationDate: z.coerce.date().nullable().optional(),
            lastWorkingDay: z.coerce.date().nullable().optional(),
          })
          .superRefine((value, context) => {
            if (
              ["RESIGNED", "TERMINATED"].includes(value.status) &&
              !value.lastWorkingDay
            )
              context.addIssue({
                code: "custom",
                path: ["lastWorkingDay"],
                message: "Last working day is required for an exit.",
              });
            if (
              value.resignationDate &&
              value.lastWorkingDay &&
              value.lastWorkingDay < value.resignationDate
            )
              context.addIssue({
                code: "custom",
                path: ["lastWorkingDay"],
                message: "Last working day cannot precede resignation date.",
              });
          })
          .parse(req.body);
        const employee = await prisma.employee.findFirst({
          where: { id: String(req.params.id), companyId: req.auth!.companyId },
        });
        if (!employee)
          return fail(
            res,
            404,
            "EMPLOYEE_NOT_FOUND",
            "Employee was not found.",
          );
        const updated = await prisma.$transaction(async (tx) => {
          const value = await tx.employee.update({
            where: { id: employee.id },
            data: body,
          });
          await tx.auditLog.create({
            data: {
              companyId: req.auth!.companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: "UPDATE_EMPLOYMENT_LIFECYCLE",
              category: "EMPLOYEE",
              details: `Employee ${employee.employeeCode} changed from ${employee.status} to ${body.status}; last working day ${body.lastWorkingDay?.toISOString().slice(0, 10) || "not set"}.`,
              ipAddress: req.ip || "unknown",
            },
          });
          return value;
        });
        return ok(res, updated);
      } catch (e) {
        next(e);
      }
    },
  );

  router.use(createFoundationRouter(prisma, authenticate));
  router.use(createWorkflowRouter(prisma, authenticate));
  router.use(createAttendancePolicyRouter(prisma, authenticate));
  router.use(createPayrollRouter(prisma, authenticate));
  router.use(createPayrollWorkflowRouter(prisma, authenticate));
  router.use(createPayrollComplianceRouter(prisma, authenticate));
  router.use(createWorkspaceRouter(prisma, authenticate));
  router.use(createNotificationRouter(prisma, authenticate));
  router.use(createReportRouter(prisma, authenticate));
  router.use(createPerformanceRouter(prisma, authenticate));
  router.use(createSelfServiceRouter(prisma, authenticate));
  router.use(createReminderRouter(prisma, authenticate));
  router.use(createAiAssistantRouter(prisma, authenticate));
  router.use(createRecruitmentRouter(prisma, authenticate));
  router.use(createOperationsRouter(prisma, authenticate));
  router.use(createLeaveAdminRouter(prisma, authenticate));
  router.use(createLeaveEncashmentRouter(prisma, authenticate));
  router.use(createBankExportRouter(prisma, authenticate));
  router.use(createTaxSimulatorRouter(prisma, authenticate));
  router.use(createOnboardingRouter(prisma, authenticate));
  router.use(createSettingsRouter(prisma, authenticate));
  router.use(createGovernanceRouter(prisma, authenticate));

  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError)
        return fail(
          res,
          400,
          "VALIDATION_ERROR",
          "Request validation failed.",
          error.flatten().fieldErrors,
        );
      if (error instanceof FaceRecognitionError)
        return fail(res, error.status, error.code, error.message);
      if (error instanceof multer.MulterError)
        return fail(
          res,
          400,
          "FILE_UPLOAD_INVALID",
          error.code === "LIMIT_FILE_SIZE"
            ? "The uploaded file exceeds the permitted size."
            : "The file upload is invalid.",
        );
      const typed = error as {
        status?: number;
        code?: string;
        message?: string;
      };
      console.error(
        `[${(res.req as AuthedRequest).requestId}]`,
        typed.message || error,
      );
      return fail(
        res,
        typed.status || 500,
        typed.code || "INTERNAL_ERROR",
        typed.status
          ? typed.message || "Request failed."
          : "An unexpected error occurred.",
      );
    },
  );
  return router;
}
