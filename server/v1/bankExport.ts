import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { emitNotification } from './notifications.js';

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

export type BankFormat = 'STANDARD_RBI' | 'HDFC_CMS' | 'ICICI_CIB' | 'SBI_CMP';

export interface BankTransferEntry {
  employeeId: string;
  employeeCode: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  amount: number;
  paymentType: 'NEFT' | 'RTGS';
  email?: string;
  remarks: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface BankBatchSummary {
  bankName: string;
  recordCount: number;
  totalAmount: number;
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^\d{9,18}$/;

export function validateBankTransferEntry(params: {
  employeeId: string;
  employeeCode: string;
  beneficiaryName: string;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  amount: number;
  email?: string | null;
  remarks?: string;
}): BankTransferEntry {
  const errors: string[] = [];
  const cleanName = (params.beneficiaryName || '').trim().replace(/[^a-zA-Z0-9\s.-]/g, '');
  const cleanAccount = (params.accountNumber || '').trim().replace(/[\s-]/g, '');
  const cleanIfsc = (params.ifscCode || '').trim().toUpperCase();
  const cleanBankName = (params.bankName || 'Unknown Bank').trim();

  if (!cleanName || cleanName.length < 2) {
    errors.push('Beneficiary name is required (minimum 2 characters).');
  }

  if (!cleanAccount) {
    errors.push('Bank account number is missing.');
  } else if (!ACCOUNT_REGEX.test(cleanAccount)) {
    errors.push('Invalid account number format (must be 9 to 18 numeric digits).');
  }

  if (!cleanIfsc) {
    errors.push('IFSC code is missing.');
  } else if (!IFSC_REGEX.test(cleanIfsc)) {
    errors.push('Invalid IFSC code format (must be 11 characters: 4 letters, 0, 6 alphanumeric).');
  }

  if (params.amount <= 0) {
    errors.push('Payment amount must be greater than zero.');
  }

  // RBI standard: RTGS is used for 200,000 INR and above, NEFT for below
  const paymentType: 'NEFT' | 'RTGS' = params.amount >= 200000 ? 'RTGS' : 'NEFT';

  return {
    employeeId: params.employeeId,
    employeeCode: params.employeeCode,
    beneficiaryName: cleanName || 'BENEFICIARY',
    bankName: cleanBankName,
    accountNumber: cleanAccount,
    ifscCode: cleanIfsc,
    amount: Math.round(params.amount * 100) / 100,
    paymentType,
    email: params.email || undefined,
    remarks: params.remarks || `Salary payout ${params.employeeCode}`,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

export function detectDuplicatePayments(entries: BankTransferEntry[]): Array<{
  accountNumber: string;
  count: number;
  employeeCodes: string[];
  warning: string;
}> {
  const accountMap = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.accountNumber) continue;
    const existing = accountMap.get(entry.accountNumber) || [];
    existing.push(entry.employeeCode);
    accountMap.set(entry.accountNumber, existing);
  }

  const duplicates: Array<{
    accountNumber: string;
    count: number;
    employeeCodes: string[];
    warning: string;
  }> = [];

  for (const [accountNumber, codes] of accountMap.entries()) {
    if (codes.length > 1) {
      const uniqueCodes = Array.from(new Set(codes));
      if (uniqueCodes.length > 1) {
        duplicates.push({
          accountNumber,
          count: codes.length,
          employeeCodes: uniqueCodes,
          warning: `Account ${accountNumber} is shared across multiple employees (${uniqueCodes.join(', ')}). Verify before disbursement.`,
        });
      } else {
        duplicates.push({
          accountNumber,
          count: codes.length,
          employeeCodes: uniqueCodes,
          warning: `Employee ${uniqueCodes[0]} appears ${codes.length} times in this batch for account ${accountNumber}. Check for duplicate disbursement.`,
        });
      }
    }
  }

  return duplicates;
}

const escapeCsv = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

export function generateBankFileContent(
  entries: BankTransferEntry[],
  format: BankFormat,
  options: { companyName?: string; debitAccountNumber?: string; batchReference?: string } = {},
): string {
  const validEntries = entries.filter((e) => e.isValid);
  const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  switch (format) {
    case 'HDFC_CMS': {
      // HDFC Corporate CMS / ENet Format
      const headers = [
        'TransactionType',
        'BeneficiaryCode',
        'BeneficiaryAccountNumber',
        'Amount',
        'BeneficiaryName',
        'DraweeLocation',
        'PrintLocation',
        'BeneficiaryEmail',
        'PaymentRef',
        'CustomerRef',
      ];
      const rows = validEntries.map((e, idx) => [
        e.paymentType,
        e.employeeCode,
        e.accountNumber,
        e.amount.toFixed(2),
        escapeCsv(e.beneficiaryName),
        e.ifscCode.slice(0, 4),
        e.ifscCode,
        e.email || '',
        `PAY-${nowStr}-${idx + 1}`,
        `HDFC-${e.employeeCode}`,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    case 'ICICI_CIB': {
      // ICICI Corporate Internet Banking (CIB) format
      const headers = [
        'PYMT_PROD_TYP_CODE',
        'PYMT_MODE',
        'DEBIT_ACC_NO',
        'BENE_NAME',
        'BENE_ACC_NO',
        'BENE_IFSC',
        'AMOUNT',
        'TXN_DATE',
        'REMARKS',
      ];
      const rows = validEntries.map((e) => [
        'PA_PA',
        e.paymentType,
        options.debitAccountNumber || 'CORP_DEBIT_ACC',
        escapeCsv(e.beneficiaryName),
        e.accountNumber,
        e.ifscCode,
        e.amount.toFixed(2),
        nowStr,
        escapeCsv(e.remarks),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    case 'SBI_CMP': {
      // SBI Cash Management Product format
      const headers = [
        'PaymentType',
        'DebitAccount',
        'BeneficiaryAccount',
        'BeneficiaryName',
        'IFSC',
        'Amount',
        'Remarks',
      ];
      const rows = validEntries.map((e) => [
        e.paymentType,
        options.debitAccountNumber || 'SBI_CORP_MAIN',
        e.accountNumber,
        escapeCsv(e.beneficiaryName),
        e.ifscCode,
        e.amount.toFixed(2),
        escapeCsv(e.remarks),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }

    case 'STANDARD_RBI':
    default: {
      // Standard RBI Bulk NEFT/RTGS CSV format
      const headers = [
        'RecordType',
        'BeneficiaryName',
        'AccountNumber',
        'IFSCCode',
        'Amount',
        'PaymentType',
        'PaymentReference',
        'Narration',
        'BeneficiaryEmail',
      ];
      const rows = validEntries.map((e, idx) => [
        'NEFT_RTGS_TXN',
        escapeCsv(e.beneficiaryName),
        e.accountNumber,
        e.ifscCode,
        e.amount.toFixed(2),
        e.paymentType,
        `TXN${nowStr}${String(idx + 1).padStart(4, '0')}`,
        escapeCsv(e.remarks),
        e.email || '',
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    }
  }
}

export function createBankExportRouter(prisma: PrismaClient, authenticate: RequestHandler) {
  const router = Router();
  const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ data, meta: { requestId: (res.req as Req).requestId } });
  const fail = (res: Response, status: number, code: string, message: string) =>
    res.status(status).json({ error: { code, message } });

  router.use('/payroll/bank-export', authenticate);

  /**
   * GET /payroll/bank-export/sources
   * Lists approved payroll runs and approved reimbursement claims eligible for export.
   */
  router.get('/payroll/bank-export/sources', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const canManage =
        req.auth!.permissions.includes('payroll.manage') ||
        req.auth!.permissions.includes('payroll.approve') ||
        req.auth!.role === 'COMPANY_ADMIN' ||
        req.auth!.role === 'HR_MANAGER';

      if (!canManage) {
        return fail(res, 403, 'FORBIDDEN', 'Payroll management permission is required.');
      }

      const [payrollRuns, pendingClaims] = await prisma.$transaction([
        prisma.payrollRun.findMany({
          where: {
            companyId,
            status: { in: ['APPROVED', 'LOCKED', 'PAYSLIP_GENERATED', 'PAYSLIPS_PUBLISHED', 'BANK_EXPORTED'] },
          },
          orderBy: { month: 'desc' },
          take: 24,
        }),
        prisma.expenseClaim.findMany({
          where: {
            companyId,
            status: 'APPROVED',
            payrollAdjustment: null,
            reimbursedAt: null,
          },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
                bankName: true,
                accountNumber: true,
                routingOrIfsc: true,
              },
            },
          },
        }),
      ]);

      return ok(res, {
        payrollRuns,
        reimbursements: {
          count: pendingClaims.length,
          totalAmount: pendingClaims.reduce((sum, c) => sum + c.amount, 0),
          claims: pendingClaims,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /payroll/bank-export/preview
   * Validates accounts, detects duplicates, and groups by bank.
   */
  router.post('/payroll/bank-export/preview', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const body = z
        .object({
          sourceType: z.enum(['PAYROLL', 'REIMBURSEMENT', 'COMBINED']),
          payrollRunId: uuid.optional(),
          expenseClaimIds: z.array(uuid).optional(),
          bankFormat: z.enum(['STANDARD_RBI', 'HDFC_CMS', 'ICICI_CIB', 'SBI_CMP']).default('STANDARD_RBI'),
        })
        .parse(req.body);

      const entries: BankTransferEntry[] = [];

      // 1. Process Payroll Run
      if (['PAYROLL', 'COMBINED'].includes(body.sourceType)) {
        if (!body.payrollRunId) {
          return fail(res, 400, 'PAYROLL_RUN_REQUIRED', 'A payrollRunId must be specified for payroll exports.');
        }

        const run = await prisma.payrollRun.findFirst({
          where: { id: body.payrollRunId, companyId },
          include: {
            lines: true,
          },
        });

        if (!run) {
          return fail(res, 404, 'PAYROLL_RUN_NOT_FOUND', 'Specified payroll run not found.');
        }

        if (run.status === 'BANK_EXPORTED') {
          return fail(res, 400, 'PAYROLL_ALREADY_EXPORTED', 'This payroll run has already been exported for bank transfer.');
        }
        if (run.status === 'PAID') {
          return fail(res, 400, 'PAYROLL_ALREADY_PAID', 'This payroll run has already been marked as paid.');
        }
        if (!['APPROVED', 'LOCKED', 'PAYSLIP_GENERATED', 'PAYSLIPS_PUBLISHED'].includes(run.status)) {
          return fail(res, 400, 'PAYROLL_NOT_FINALIZED', `Payroll run in status ${run.status} cannot be exported. Only approved or published payroll runs can enter bank export.`);
        }

        const employeeIds = run.lines.map((l) => l.employeeId);
        const employees = await prisma.employee.findMany({
          where: { id: { in: employeeIds }, companyId },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            bankName: true,
            accountNumber: true,
            routingOrIfsc: true,
            email: true,
          },
        });
        const empMap = new Map(employees.map((e) => [e.id, e]));

        for (const line of run.lines) {
          const emp = empMap.get(line.employeeId);
          if (!emp) continue;

          entries.push(
            validateBankTransferEntry({
              employeeId: emp.id,
              employeeCode: emp.employeeCode,
              beneficiaryName: `${emp.firstName} ${emp.lastName}`,
              bankName: emp.bankName,
              accountNumber: emp.accountNumber,
              ifscCode: emp.routingOrIfsc,
              amount: line.netPay,
              email: emp.email,
              remarks: `Salary ${run.month} ${emp.employeeCode}`,
            }),
          );
        }
      }

      // 2. Process Reimbursements
      if (['REIMBURSEMENT', 'COMBINED'].includes(body.sourceType)) {
        const claimWhere: Record<string, unknown> = {
          companyId,
          status: 'APPROVED',
          payrollAdjustment: null,
          reimbursedAt: null,
        };
        if (body.expenseClaimIds && body.expenseClaimIds.length > 0) {
          claimWhere.id = { in: body.expenseClaimIds };
        }

        const claims = await prisma.expenseClaim.findMany({
          where: claimWhere as never,
          include: {
            employee: true,
          },
        });

        for (const claim of claims) {
          if (!claim.employee) continue;
          entries.push(
            validateBankTransferEntry({
              employeeId: claim.employee.id,
              employeeCode: claim.employee.employeeCode,
              beneficiaryName: `${claim.employee.firstName} ${claim.employee.lastName}`,
              bankName: claim.employee.bankName,
              accountNumber: claim.employee.accountNumber,
              ifscCode: claim.employee.routingOrIfsc,
              amount: claim.amount,
              remarks: `Reimbursement ${claim.title.slice(0, 30)}`,
            }),
          );
        }
      }

      // Duplicate check
      const duplicateWarnings = detectDuplicatePayments(entries);

      // Bank grouping
      const bankMap = new Map<string, { count: number; total: number }>();
      for (const e of entries) {
        if (!e.isValid) continue;
        const b = e.bankName || 'Other Banks';
        const cur = bankMap.get(b) || { count: 0, total: 0 };
        cur.count++;
        cur.total += e.amount;
        bankMap.set(b, cur);
      }

      const bankBatches: BankBatchSummary[] = Array.from(bankMap.entries()).map(([bankName, val]) => ({
        bankName,
        recordCount: val.count,
        totalAmount: Math.round(val.total * 100) / 100,
      }));

      const validEntries = entries.filter((e) => e.isValid);
      const invalidEntries = entries.filter((e) => !e.isValid);

      const summary = {
        totalRecords: entries.length,
        validRecords: validEntries.length,
        invalidRecords: invalidEntries.length,
        totalAmount: Math.round(validEntries.reduce((s, e) => s + e.amount, 0) * 100) / 100,
        neftCount: validEntries.filter((e) => e.paymentType === 'NEFT').length,
        neftAmount: Math.round(validEntries.filter((e) => e.paymentType === 'NEFT').reduce((s, e) => s + e.amount, 0) * 100) / 100,
        rtgsCount: validEntries.filter((e) => e.paymentType === 'RTGS').length,
        rtgsAmount: Math.round(validEntries.filter((e) => e.paymentType === 'RTGS').reduce((s, e) => s + e.amount, 0) * 100) / 100,
      };

      return ok(res, {
        summary,
        bankBatches,
        validEntries,
        invalidEntries,
        duplicateWarnings,
        bankFormat: body.bankFormat,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /payroll/bank-export/batch/initiate
   * Maker action: Creates a pending export batch for Checker approval.
   */
  router.post('/payroll/bank-export/batch/initiate', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const body = z
        .object({
          sourceType: z.enum(['PAYROLL', 'REIMBURSEMENT', 'COMBINED']),
          payrollRunId: uuid.optional(),
          expenseClaimIds: z.array(uuid).optional(),
          bankFormat: z.enum(['STANDARD_RBI', 'HDFC_CMS', 'ICICI_CIB', 'SBI_CMP']).default('STANDARD_RBI'),
          notes: z.string().trim().max(300).optional(),
        })
        .parse(req.body);

      const idempotencyKey = (req.headers['x-idempotency-key'] as string | undefined)?.trim();
      if (idempotencyKey) {
        const existingBatches = await prisma.reportExport.findMany({
          where: { companyId, reportKey: 'BANK_TRANSFER_BATCH' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        const matched = existingBatches.find((b) => {
          const f = (b.filters || {}) as Record<string, unknown>;
          return f.idempotencyKey === idempotencyKey;
        });
        if (matched) {
          const f = (matched.filters || {}) as Record<string, unknown>;
          return ok(
            res,
            {
              batchId: matched.id,
              status: matched.status === 'COMPLETED' ? 'APPROVED' : 'PENDING_APPROVAL',
              rowCount: matched.rowCount,
              totalAmount: f.totalAmount,
              sha256Checksum: f.sha256Checksum,
              isIdempotentReplay: true,
            },
            200,
          );
        }
      }

      // Collect valid entries (as in preview)
      const entries: BankTransferEntry[] = [];
      let payrollRunMonth = '';

      if (['PAYROLL', 'COMBINED'].includes(body.sourceType)) {
        if (!body.payrollRunId) {
          return fail(res, 400, 'PAYROLL_RUN_REQUIRED', 'payrollRunId is required.');
        }
        const run = await prisma.payrollRun.findFirst({
          where: { id: body.payrollRunId, companyId },
          include: { lines: true },
        });
        if (!run) return fail(res, 404, 'PAYROLL_RUN_NOT_FOUND', 'Payroll run not found.');

        if (run.status === 'BANK_EXPORTED') {
          return fail(res, 400, 'PAYROLL_ALREADY_EXPORTED', 'This payroll run has already been exported for bank transfer.');
        }
        if (run.status === 'PAID') {
          return fail(res, 400, 'PAYROLL_ALREADY_PAID', 'This payroll run has already been marked as paid.');
        }
        if (!['APPROVED', 'LOCKED', 'PAYSLIP_GENERATED', 'PAYSLIPS_PUBLISHED'].includes(run.status)) {
          return fail(res, 400, 'PAYROLL_NOT_FINALIZED', `Payroll run in status ${run.status} cannot be exported. Only approved or published payroll runs can enter bank export.`);
        }

        const allPending = await prisma.reportExport.findMany({
          where: {
            companyId,
            reportKey: 'BANK_TRANSFER_BATCH',
            status: 'PENDING',
          },
        });
        const duplicatePending = allPending.find((b) => {
          const f = (b.filters || {}) as Record<string, unknown>;
          return f.payrollRunId === body.payrollRunId;
        });
        if (duplicatePending) {
          return fail(
            res,
            409,
            'BATCH_ALREADY_EXISTS',
            `An export batch is already pending checker approval for this payroll run (Batch ID: ${duplicatePending.id}).`,
          );
        }

        payrollRunMonth = run.month;

        const employees = await prisma.employee.findMany({
          where: { id: { in: run.lines.map((l) => l.employeeId) }, companyId },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            bankName: true,
            accountNumber: true,
            routingOrIfsc: true,
            email: true,
          },
        });
        const empMap = new Map(employees.map((e) => [e.id, e]));

        for (const line of run.lines) {
          const emp = empMap.get(line.employeeId);
          if (!emp) continue;
          const e = validateBankTransferEntry({
            employeeId: emp.id,
            employeeCode: emp.employeeCode,
            beneficiaryName: `${emp.firstName} ${emp.lastName}`,
            bankName: emp.bankName,
            accountNumber: emp.accountNumber,
            ifscCode: emp.routingOrIfsc,
            amount: line.netPay,
            email: emp.email,
            remarks: `Salary ${run.month} ${emp.employeeCode}`,
          });
          if (e.isValid) entries.push(e);
        }
      }

      if (['REIMBURSEMENT', 'COMBINED'].includes(body.sourceType)) {
        const claims = await prisma.expenseClaim.findMany({
          where: {
            companyId,
            status: 'APPROVED',
            payrollAdjustment: null,
            reimbursedAt: null,
            ...(body.expenseClaimIds?.length ? { id: { in: body.expenseClaimIds } } : {}),
          },
          include: { employee: true },
        });

        for (const claim of claims) {
          if (!claim.employee) continue;
          const e = validateBankTransferEntry({
            employeeId: claim.employee.id,
            employeeCode: claim.employee.employeeCode,
            beneficiaryName: `${claim.employee.firstName} ${claim.employee.lastName}`,
            bankName: claim.employee.bankName,
            accountNumber: claim.employee.accountNumber,
            ifscCode: claim.employee.routingOrIfsc,
            amount: claim.amount,
            remarks: `Reimbursement ${claim.title.slice(0, 30)}`,
          });
          if (e.isValid) entries.push(e);
        }
      }

      if (entries.length === 0) {
        return fail(res, 400, 'NO_VALID_RECORDS', 'No valid bank transfer entries to export.');
      }

      const totalAmount = Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
      const fileData = generateBankFileContent(entries, body.bankFormat);
      const sha256Checksum = crypto.createHash('sha256').update(fileData).digest('hex');

      const filterPayload = {
        sourceType: body.sourceType,
        payrollRunId: body.payrollRunId,
        payrollRunMonth,
        bankFormat: body.bankFormat,
        totalAmount,
        recordCount: entries.length,
        sha256Checksum,
        notes: body.notes,
        idempotencyKey: idempotencyKey || undefined,
        makerUserId: req.auth!.id,
        makerUserRole: req.auth!.role,
        initiatedAt: new Date().toISOString(),
        entries,
      };

      const exportBatch = await prisma.reportExport.create({
        data: {
          companyId,
          userId: req.auth!.id,
          reportKey: 'BANK_TRANSFER_BATCH',
          format: body.bankFormat,
          filters: filterPayload as unknown as import('@prisma/client').Prisma.InputJsonValue,
          rowCount: entries.length,
          status: 'PENDING',
        },
      });

      await prisma.auditLog.create({
        data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'INITIATE_BANK_EXPORT',
          category: 'PAYROLL',
          details: `Initiated bulk bank export batch ${exportBatch.id} (${entries.length} transfers, ₹${totalAmount.toLocaleString('en-IN')}) using ${body.bankFormat}.`,
          ipAddress: req.ip || '127.0.0.1',
        },
      });

      // Notify checkers (Company Admin / HR Managers)
      const checkers = await prisma.user.findMany({
        where: {
          companyId,
          role: { in: ['COMPANY_ADMIN', 'HR_MANAGER'] },
          id: { not: req.auth!.id },
        },
        select: { id: true },
      });

      for (const checker of checkers) {
        await emitNotification(prisma, {
          companyId,
          userId: checker.id,
          eventKey: 'BANK_EXPORT_PENDING_APPROVAL',
          title: 'Bank Export Batch Pending Approval',
          body: `A bank export batch for ₹${totalAmount.toLocaleString('en-IN')} (${entries.length} employees) is awaiting Checker verification.`,
          entityType: 'ReportExport',
          entityId: exportBatch.id,
          actionUrl: '/payroll',
        }).catch(() => {});
      }

      return ok(
        res,
        {
          batchId: exportBatch.id,
          status: 'PENDING_APPROVAL',
          rowCount: entries.length,
          totalAmount,
          sha256Checksum,
        },
        201,
      );
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /payroll/bank-export/batches
   * Lists previous and pending export batches.
   */
  router.get('/payroll/bank-export/batches', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const batches = await prisma.reportExport.findMany({
        where: {
          companyId,
          reportKey: 'BANK_TRANSFER_BATCH',
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return ok(res, batches);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /payroll/bank-export/batch/:id/approve
   * Checker action: Approves and locks the export batch, unlocking the file download.
   */
  router.post('/payroll/bank-export/batch/:id/approve', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const canApprove =
        req.auth!.permissions.includes('payroll.approve') ||
        req.auth!.role === 'COMPANY_ADMIN' ||
        req.auth!.role === 'HR_MANAGER';

      if (!canApprove) {
        return fail(res, 403, 'FORBIDDEN', 'Payroll approval permission is required to act as Checker.');
      }

      const id = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          soleAdminBypassConfirmation: z.boolean().optional(),
        })
        .optional()
        .parse(req.body);

      const batch = await prisma.reportExport.findFirst({
        where: { id, companyId, reportKey: 'BANK_TRANSFER_BATCH' },
      });

      if (!batch) {
        return fail(res, 404, 'BATCH_NOT_FOUND', 'Bank export batch not found.');
      }

      if (batch.status === 'COMPLETED') {
        return fail(res, 409, 'BATCH_ALREADY_APPROVED', 'This batch has already been approved and locked.');
      }

      const filters = (batch.filters || {}) as Record<string, unknown>;

      // Enforce Maker/Checker segregation: Maker cannot approve their own batch
      if (batch.userId === req.auth!.id) {
        const adminCount = await prisma.user.count({
          where: {
            companyId,
            role: { in: ['COMPANY_ADMIN', 'HR_MANAGER'] },
          },
        });

        if (adminCount > 1) {
          return fail(
            res,
            403,
            'MAKER_CHECKER_VIOLATION',
            'Segregation of duties violation: Dual control policy mandates that a distinct Checker must approve this bank export batch. Maker cannot approve their own batch.',
          );
        }

        if (!body?.soleAdminBypassConfirmation) {
          return fail(
            res,
            403,
            'MAKER_CHECKER_CONFIRMATION_REQUIRED',
            'Segregation of duties warning: You are the maker of this batch. As the sole administrator of this company, you must provide explicit confirmation (soleAdminBypassConfirmation: true) to authorize self-approval.',
          );
        }

        // Record high-priority security audit log for sole administrator self-approval
        await prisma.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'SOLE_ADMIN_BANK_EXPORT_APPROVAL',
            category: 'SECURITY',
            details: `Security Alert: Sole administrator self-approval authorized for bank export batch ${batch.id}. Verified organization has only 1 active administrator.`,
            ipAddress: req.ip || '127.0.0.1',
          },
        });
      }

      const updatedFilters = {
        ...filters,
        checkerUserId: req.auth!.id,
        checkerUserRole: req.auth!.role,
        approvedAt: new Date().toISOString(),
        isLocked: true,
        singleAdminSelfApproval: batch.userId === req.auth!.id,
      };

      let updateCount = 0;
      await prisma.$transaction(async (tx) => {
        const updateResult = await tx.reportExport.updateMany({
          where: { id: batch.id, companyId, status: 'PENDING' },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            filters: updatedFilters,
          },
        });
        updateCount = updateResult.count;

        if (updateCount > 0 && filters.payrollRunId) {
          await tx.payrollRun.updateMany({
            where: { id: String(filters.payrollRunId), companyId },
            data: {
              status: 'BANK_EXPORTED',
              bankExportedAt: new Date(),
            },
          });
        }

        if (updateCount > 0) {
          await tx.auditLog.create({
            data: {
              companyId,
              userId: req.auth!.id,
              userName: req.auth!.id,
              userRole: req.auth!.role,
              action: 'APPROVE_BANK_EXPORT',
              category: 'PAYROLL',
              details: `Checker approved bank export batch ${batch.id} (Rows: ${batch.rowCount}, Format: ${batch.format}). Export locked.`,
              ipAddress: req.ip || '127.0.0.1',
            },
          });
        }
      });

      if (updateCount === 0) {
        return fail(res, 409, 'BATCH_ALREADY_APPROVED', 'This batch has already been approved or processed.');
      }

      // Notify Maker
      await emitNotification(prisma, {
        companyId,
        userId: batch.userId,
        eventKey: 'BANK_EXPORT_APPROVED',
        title: 'Bank Export Batch Approved',
        body: `Bank export batch ${batch.id} has been approved by the Checker and is ready for bank upload.`,
        entityType: 'ReportExport',
        entityId: batch.id,
        actionUrl: '/payroll',
      }).catch(() => {});

      return ok(res, { status: 'COMPLETED', isLocked: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /payroll/bank-export/batch/:id/download
   * Generates and downloads the locked NEFT/RTGS bank file.
   */
  router.get('/payroll/bank-export/batch/:id/download', async (req: Req, res, next) => {
    try {
      const companyId = req.auth!.companyId;
      const id = z.string().uuid().parse(req.params.id);

      const batch = await prisma.reportExport.findFirst({
        where: { id, companyId, reportKey: 'BANK_TRANSFER_BATCH' },
      });

      if (!batch) {
        return fail(res, 404, 'BATCH_NOT_FOUND', 'Bank export batch not found.');
      }

      if (batch.status !== 'COMPLETED') {
        return fail(
          res,
          403,
          'BATCH_NOT_APPROVED',
          'This bank export batch must be approved by a Checker before it can be downloaded.',
        );
      }

      const filters = (batch.filters || {}) as Record<string, unknown>;
      const entries = (filters.entries || []) as BankTransferEntry[];
      const bankFormat = (batch.format as BankFormat) || 'STANDARD_RBI';

      const fileContent = generateBankFileContent(entries, bankFormat);
      const calculatedChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');

      if (filters.sha256Checksum && calculatedChecksum !== filters.sha256Checksum) {
        await prisma.auditLog.create({
          data: {
            companyId,
            userId: req.auth!.id,
            userName: req.auth!.id,
            userRole: req.auth!.role,
            action: 'SECURITY_ALERT_CHECKSUM_MISMATCH',
            category: 'SECURITY',
            details: `Tamper Detected: Checksum mismatch on downloading batch ${batch.id}. Expected ${filters.sha256Checksum}, got ${calculatedChecksum}. Download aborted.`,
            ipAddress: req.ip || '127.0.0.1',
          },
        });
        return fail(res, 409, 'CHECKSUM_MISMATCH', 'Tamper detected: Export file checksum does not match the approved batch digest.');
      }

      await prisma.auditLog.create({
        data: {
          companyId,
          userId: req.auth!.id,
          userName: req.auth!.id,
          userRole: req.auth!.role,
          action: 'DOWNLOAD_BANK_EXPORT',
          category: 'PAYROLL',
          details: `Downloaded bank file for batch ${batch.id} (${entries.length} rows, format: ${bankFormat}, checksum: ${calculatedChecksum.slice(0, 8)}...).`,
          ipAddress: req.ip || '127.0.0.1',
        },
      });

      const filename = `NEFT_RTGS_${bankFormat}_${batch.id.slice(0, 8)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(fileContent);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
