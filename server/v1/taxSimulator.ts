import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  simulateTaxComparison,
  VERSIONED_TAX_RULES,
  type DeductionDeclarationInput,
  type SalaryBreakdownInput,
} from './taxSimulatorEngine.js';

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

const uuid = z.string().uuid();
const fySchema = z.string().regex(/^\d{4}-\d{2}$/);

export function createTaxSimulatorRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();

  const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });

  router.use('/payroll/tax-simulator', authenticate);

  /**
   * GET /payroll/tax-simulator/config/:financialYear
   * Exposes versioned rules, slabs, and limits for the frontend without hardcoding.
   */
  router.get('/payroll/tax-simulator/config/:financialYear', (req: Req, res) => {
    const fyParam = req.params.financialYear;
    const fy = (typeof fyParam === 'string' ? fyParam : (Array.isArray(fyParam) ? fyParam[0] : '2025-26')) || '2025-26';
    const config = VERSIONED_TAX_RULES[fy] || VERSIONED_TAX_RULES['2025-26'];
    return ok(res, config);
  });

  /**
   * POST /payroll/tax-simulator/simulate
   * Computes an advisory side-by-side comparison of Old vs New Tax Regime.
   * Does NOT alter payroll or locked data.
   */
  router.post('/payroll/tax-simulator/simulate', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const body = z
        .object({
          financialYear: fySchema.default('2025-26'),
          employeeId: uuid.optional(),
          salary: z
            .object({
              annualCtc: z.number().min(0).optional(),
              basicSalary: z.number().min(0),
              hra: z.number().min(0),
              specialAllowance: z.number().min(0).optional(),
              otherAllowances: z.number().min(0).optional(),
              bonusVariable: z.number().min(0).optional(),
              employerPf: z.number().min(0).optional(),
              employerNps: z.number().min(0).optional(),
              employeePf: z.number().min(0).optional(),
              professionalTax: z.number().min(0).optional(),
            })
            .optional(),
          declarations: z
            .object({
              rentPaidAnnual: z.number().min(0).optional(),
              isMetro: z.boolean().optional(),
              section80C: z.number().min(0).optional(),
              section80DSelf: z.number().min(0).optional(),
              section80DParents: z.number().min(0).optional(),
              section80CCD1B: z.number().min(0).optional(),
              section24bHomeLoanInterest: z.number().min(0).optional(),
              otherExemptions: z.number().min(0).optional(),
            })
            .optional(),
        })
        .parse(req.body);

      let computedSalary: SalaryBreakdownInput = body.salary || {
        basicSalary: 0,
        hra: 0,
      };

      let computedDeclarations: DeductionDeclarationInput = body.declarations || {};

      // If an employeeId is supplied, auto-fill from active employee salary revision and tax declarations
      const targetEmployeeId = body.employeeId || req.auth!.employeeId;

      if (targetEmployeeId) {
        // Enforce RBAC: Non-admin employees can only simulate for their own profile
        const isSelf = targetEmployeeId === req.auth!.employeeId;
        const canSimulateOthers =
          req.auth!.role === 'COMPANY_ADMIN' ||
          req.auth!.role === 'HR_MANAGER' ||
          req.auth!.permissions.includes('payroll.manage');

        if (!isSelf && !canSimulateOthers) {
          return fail(
            res,
            403,
            'FORBIDDEN',
            'You do not have permission to simulate tax calculations for other employees.',
          );
        }

        const employee = await prisma.employee.findFirst({
          where: { id: targetEmployeeId, companyId },
        });

        if (!employee) {
          return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Specified employee was not found.');
        }

        // 1. Fetch latest approved salary revision and structure if salary not explicitly overridden
        if (!body.salary) {
          const revision = await prisma.employeeSalaryRevision.findFirst({
            where: { employeeId: targetEmployeeId, companyId, status: 'APPROVED' },
            orderBy: { effectiveFrom: 'desc' },
            include: {
              structure: {
                include: { components: true },
              },
            },
          });

          if (revision && revision.structure) {
            const annualCtc = revision.annualCtc;
            const components = (revision.structure.components || []) as Array<{
              code: string;
              method: string;
              value: number;
            }>;

            let basicMonthly = 0;
            let hraMonthly = 0;
            let specialMonthly = 0;

            for (const c of components) {
              if (c.code === 'BASIC') {
                basicMonthly = c.method === 'PERCENT_BASIC' ? (annualCtc / 12) * (c.value / 100) : c.value;
              } else if (c.code === 'HRA') {
                hraMonthly = c.method === 'PERCENT_BASIC' ? basicMonthly * (c.value / 100) : c.value;
              } else {
                specialMonthly += c.method === 'PERCENT_BASIC' ? basicMonthly * (c.value / 100) : c.value;
              }
            }

            const basicAnnual = basicMonthly * 12;
            const hraAnnual = hraMonthly * 12;
            const specialAnnual = specialMonthly * 12;
            const employeePfAnnual = Math.round(Math.min(basicAnnual, 180000) * 0.12);

            computedSalary = {
              annualCtc,
              basicSalary: Math.round(basicAnnual),
              hra: Math.round(hraAnnual),
              specialAllowance: Math.round(specialAnnual),
              employeePf: employeePfAnnual,
              professionalTax: 2500, // Standard annual PT in most states
            };
          }
        }

        // 2. Fetch existing TaxDeclaration if declarations not explicitly overridden
        if (!body.declarations) {
          const existingDecl = await prisma.taxDeclaration.findFirst({
            where: { employeeId: targetEmployeeId, companyId, financialYear: body.financialYear },
          });

          if (existingDecl) {
            const rawDec = (existingDecl.declarations || {}) as Record<string, number>;
            computedDeclarations = {
              section80C: rawDec['80C'] || rawDec.section80C || 0,
              section80DSelf: rawDec['80D'] || rawDec.section80DSelf || 0,
              section80DParents: rawDec.section80DParents || 0,
              section80CCD1B: rawDec.section80CCD1B || 0,
              section24bHomeLoanInterest: rawDec['24B'] || rawDec.section24bHomeLoanInterest || 0,
              rentPaidAnnual: rawDec.rentPaidAnnual || 0,
              isMetro: Boolean(rawDec.isMetro),
            };
          }
        }
      }

      const result = simulateTaxComparison({
        financialYear: body.financialYear,
        salary: computedSalary,
        declarations: computedDeclarations,
      });

      return ok(res, result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /payroll/tax-simulator/apply-regime
   * Explicit confirmation action: Updates the employee's active TaxDeclaration regime
   * and saves a simulation audit snapshot.
   */
  router.post('/payroll/tax-simulator/apply-regime', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const body = z
        .object({
          employeeId: uuid.optional(),
          financialYear: fySchema.default('2025-26'),
          regime: z.enum(['NEW', 'OLD']),
          confirmedSalary: z.record(z.string(), z.number()).optional(),
          notes: z.string().trim().max(300).optional(),
        })
        .parse(req.body);

      const targetEmployeeId = body.employeeId || req.auth!.employeeId;
      if (!targetEmployeeId) {
        return fail(res, 400, 'EMPLOYEE_REQUIRED', 'employeeId is required.');
      }

      // Enforce RBAC
      const isSelf = targetEmployeeId === req.auth!.employeeId;
      const canManage =
        req.auth!.role === 'COMPANY_ADMIN' ||
        req.auth!.role === 'HR_MANAGER' ||
        req.auth!.permissions.includes('payroll.manage');

      if (!isSelf && !canManage) {
        return fail(
          res,
          403,
          'FORBIDDEN',
          'You do not have permission to update tax regime for other employees.',
        );
      }

      const employee = await prisma.employee.findFirst({
        where: { id: targetEmployeeId, companyId },
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      });

      if (!employee) {
        return fail(res, 404, 'EMPLOYEE_NOT_FOUND', 'Employee record not found.');
      }

      // Upsert the tax declaration with the selected regime
      const existing = await prisma.taxDeclaration.findFirst({
        where: { employeeId: targetEmployeeId, companyId, financialYear: body.financialYear },
      });

      const existingData = (existing?.declarations || {}) as Record<string, unknown>;
      const updatedDeclarations = {
        ...existingData,
        simulatorSnapshot: {
          confirmedAt: new Date().toISOString(),
          confirmedByUserId: req.auth!.id,
          regime: body.regime,
          notes: body.notes || 'Selected via OrbitHR Income Tax Simulator',
          salary: body.confirmedSalary,
        },
      };

      const updatedDeclaration = await prisma.taxDeclaration.upsert({
        where: {
          employeeId_financialYear: {
            employeeId: targetEmployeeId,
            financialYear: body.financialYear,
          },
        },
        create: {
          companyId,
          employeeId: targetEmployeeId,
          financialYear: body.financialYear,
          regime: body.regime,
          declarations: updatedDeclarations,
          status: 'DRAFT',
        },
        update: {
          regime: body.regime,
          declarations: updatedDeclarations,
        },
      });

      // Immutable Audit Trail
      await prisma.auditLog.create({
        data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'APPLY_TAX_REGIME_DECISION',
          category: 'PAYROLL',
          details: `Confirmed and applied ${body.regime} Tax Regime for ${employee.firstName} ${employee.lastName} (${employee.employeeCode}) for FY ${body.financialYear}.`,
          ipAddress: req.ip || '127.0.0.1',
        },
      });

      return ok(res, {
        declarationId: updatedDeclaration.id,
        employeeId: targetEmployeeId,
        financialYear: body.financialYear,
        regime: updatedDeclaration.regime,
        appliedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
