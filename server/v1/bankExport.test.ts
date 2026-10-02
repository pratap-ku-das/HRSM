import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import {
  createBankExportRouter,
  detectDuplicatePayments,
  generateBankFileContent,
  validateBankTransferEntry,
} from './bankExport.js';

const appFor = (
  permissions: string[],
  prisma: unknown,
  role = 'PAYROLL_ADMIN',
  userId = 'maker-user-1',
  companyId = 'company-test-1',
) => {
  const app = express();
  app.use(express.json());
  const authenticate = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, {
      auth: {
        id: userId,
        companyId,
        role,
        employeeId: 'emp-admin-1',
        permissions,
      },
      requestId: 'test-req-bank',
    });
    next();
  };
  app.use('/api/v1', createBankExportRouter(prisma as never, authenticate));
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.status || 500).json({ error: { message: error?.message, stack: error?.stack } });
  });
  return app;
};

describe('Bulk NEFT/RTGS Export & Maker/Checker Production Acceptance Audit (P2.2)', () => {
  // ---------------------------------------------------------------------------
  // 1. NEFT/RTGS Classification Boundary Conditions & Validation
  // ---------------------------------------------------------------------------
  describe('1. NEFT / RTGS Threshold Boundaries & Bank Account Validation', () => {
    it('classifies ₹199,999.99 as NEFT', () => {
      const entry = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        amount: 199999.99,
      });

      expect(entry.isValid).toBe(true);
      expect(entry.paymentType).toBe('NEFT');
      expect(entry.amount).toBe(199999.99);
    });

    it('classifies ₹200,000.00 as RTGS (exact boundary)', () => {
      const entry = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        amount: 200000.0,
      });

      expect(entry.isValid).toBe(true);
      expect(entry.paymentType).toBe('RTGS');
      expect(entry.amount).toBe(200000);
    });

    it('classifies ₹200,000.01 as RTGS', () => {
      const entry = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        amount: 200000.01,
      });

      expect(entry.isValid).toBe(true);
      expect(entry.paymentType).toBe('RTGS');
    });

    it('rejects invalid IFSC formats (missing 0, incorrect length, invalid chars)', () => {
      const badIfsc1 = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC1001234', // 5th character is '1', not '0'
        amount: 50000,
      });
      expect(badIfsc1.isValid).toBe(false);
      expect(badIfsc1.validationErrors).toContain(
        'Invalid IFSC code format (must be 11 characters: 4 letters, 0, 6 alphanumeric).',
      );

      const badIfsc2 = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        accountNumber: '50100234567890',
        ifscCode: 'SBIN000', // too short
        amount: 50000,
      });
      expect(badIfsc2.isValid).toBe(false);
    });

    it('rejects invalid account numbers (under 9 digits, over 18 digits, non-numeric)', () => {
      const shortAcc = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        accountNumber: '12345678', // 8 digits
        ifscCode: 'HDFC0001234',
        amount: 50000,
      });
      expect(shortAcc.isValid).toBe(false);
      expect(shortAcc.validationErrors).toContain(
        'Invalid account number format (must be 9 to 18 numeric digits).',
      );

      const nonNumAcc = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        accountNumber: '12345ABCD6789',
        ifscCode: 'HDFC0001234',
        amount: 50000,
      });
      expect(nonNumAcc.isValid).toBe(false);
    });

    it('rejects zero, negative, or missing amounts and missing bank details', () => {
      const zeroAmount = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        amount: 0,
      });
      expect(zeroAmount.isValid).toBe(false);
      expect(zeroAmount.validationErrors).toContain('Payment amount must be greater than zero.');

      const missingBank = validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav Patel',
        amount: 50000,
      });
      expect(missingBank.isValid).toBe(false);
      expect(missingBank.validationErrors).toContain('Bank account number is missing.');
      expect(missingBank.validationErrors).toContain('IFSC code is missing.');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Payments & Shared Accounts Detection
  // ---------------------------------------------------------------------------
  describe('2. Duplicate Payments & Shared Account Detection', () => {
    it('detects distinct employees sharing the same bank account', () => {
      const entries = [
        validateBankTransferEntry({
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          beneficiaryName: 'Rahul Sen',
          accountNumber: '998877665544',
          ifscCode: 'ICIC0000001',
          amount: 50000,
        }),
        validateBankTransferEntry({
          employeeId: 'emp-2',
          employeeCode: 'EMP002',
          beneficiaryName: 'Riya Sen',
          accountNumber: '998877665544', // Shared account!
          ifscCode: 'ICIC0000001',
          amount: 50000,
        }),
      ];

      const duplicates = detectDuplicatePayments(entries);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].accountNumber).toBe('998877665544');
      expect(duplicates[0].employeeCodes).toEqual(['EMP001', 'EMP002']);
      expect(duplicates[0].warning).toContain('shared across multiple employees');
    });

    it('detects the same employee appearing multiple times in the batch', () => {
      const entries = [
        validateBankTransferEntry({
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          beneficiaryName: 'Rahul Sen',
          accountNumber: '998877665544',
          ifscCode: 'ICIC0000001',
          amount: 50000,
        }),
        validateBankTransferEntry({
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          beneficiaryName: 'Rahul Sen',
          accountNumber: '998877665544',
          ifscCode: 'ICIC0000001',
          amount: 15000,
        }),
      ];

      const duplicates = detectDuplicatePayments(entries);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].warning).toContain('appears 2 times in this batch');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Bank-Format Correctness & CSV Escaping
  // ---------------------------------------------------------------------------
  describe('3. Bank Format Correctness & CSV Escaping', () => {
    const sampleEntries = [
      validateBankTransferEntry({
        employeeId: 'emp-1',
        employeeCode: 'EMP001',
        beneficiaryName: 'Aarav "Ace" Patel, Jr.',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        amount: 250000,
        email: 'aarav@example.com',
        remarks: 'Salary payout, Oct 2026',
      }),
    ];

    it('generates Standard RBI NEFT/RTGS with proper quotes and escaping', () => {
      const csv = generateBankFileContent(sampleEntries, 'STANDARD_RBI');
      expect(csv).toContain('RecordType,BeneficiaryName,AccountNumber,IFSCCode,Amount,PaymentType');
      expect(csv).toContain('"Aarav Ace Patel Jr.",50100234567890,HDFC0001234,250000.00,RTGS');
      expect(csv).toContain('"Salary payout, Oct 2026"');
    });

    it('generates HDFC CMS format with 10 columns and CRLF endings', () => {
      const csv = generateBankFileContent(sampleEntries, 'HDFC_CMS');
      expect(csv).toContain('TransactionType,BeneficiaryCode,BeneficiaryAccountNumber,Amount');
      expect(csv).toContain('RTGS,EMP001,50100234567890,250000.00,"Aarav Ace Patel Jr."');
      expect(csv.endsWith('\r\n') || csv.includes('\r\n')).toBe(true);
    });

    it('generates ICICI CIB format with debit account and product code PA_PA', () => {
      const csv = generateBankFileContent(sampleEntries, 'ICICI_CIB', {
        debitAccountNumber: 'CORP_DEBIT_999',
      });
      expect(csv).toContain('PYMT_PROD_TYP_CODE,PYMT_MODE,DEBIT_ACC_NO,BENE_NAME');
      expect(csv).toContain('PA_PA,RTGS,CORP_DEBIT_999,"Aarav Ace Patel Jr.",50100234567890');
    });

    it('generates SBI CMP format with 7 required columns', () => {
      const csv = generateBankFileContent(sampleEntries, 'SBI_CMP', {
        debitAccountNumber: 'SBI_MAIN_ACC',
      });
      expect(csv).toContain('PaymentType,DebitAccount,BeneficiaryAccount,BeneficiaryName,IFSC,Amount,Remarks');
      expect(csv).toContain('RTGS,SBI_MAIN_ACC,50100234567890,"Aarav Ace Patel Jr.",HDFC0001234,250000.00,"Salary payout, Oct 2026"');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Payroll Source Integrity & State Transitions
  // ---------------------------------------------------------------------------
  describe('4. Payroll Source Integrity & Idempotency', () => {
    it('rejects unapproved or draft payroll runs from entering export', async () => {
      const prisma = {
        payrollRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000011',
            status: 'DRAFT', // Unapproved draft!
            lines: [],
          }),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/initiate')
        .send({
          sourceType: 'PAYROLL',
          payrollRunId: '00000000-0000-4000-8000-000000000011',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYROLL_NOT_FINALIZED');
    });

    it('rejects already exported payroll runs (BANK_EXPORTED)', async () => {
      const prisma = {
        payrollRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000011',
            status: 'BANK_EXPORTED', // Already exported!
            lines: [],
          }),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/initiate')
        .send({
          sourceType: 'PAYROLL',
          payrollRunId: '00000000-0000-4000-8000-000000000011',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYROLL_ALREADY_EXPORTED');
    });

    it('rejects already paid payroll runs (PAID)', async () => {
      const prisma = {
        payrollRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000011',
            status: 'PAID', // Already disbursed!
            lines: [],
          }),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/initiate')
        .send({
          sourceType: 'PAYROLL',
          payrollRunId: '00000000-0000-4000-8000-000000000011',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYROLL_ALREADY_PAID');
    });

    it('prevents double-initiation of pending batches for the same payroll run', async () => {
      const prisma = {
        payrollRun: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000011',
            status: 'APPROVED',
            lines: [{ employeeId: 'emp-1', netPay: 50000 }],
          }),
        },
        reportExport: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'existing-batch-1',
              status: 'PENDING',
              filters: { payrollRunId: '00000000-0000-4000-8000-000000000011' },
            },
          ]),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/initiate')
        .send({
          sourceType: 'PAYROLL',
          payrollRunId: '00000000-0000-4000-8000-000000000011',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BATCH_ALREADY_EXISTS');
    });

    it('returns existing batch on idempotent retry using x-idempotency-key', async () => {
      const prisma = {
        reportExport: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'batch-replay-uuid',
              status: 'PENDING',
              rowCount: 5,
              filters: {
                idempotencyKey: 'idemp-key-xyz-123',
                totalAmount: 125000,
                sha256Checksum: 'abcdef1234567890',
              },
            },
          ]),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/initiate')
        .set('x-idempotency-key', 'idemp-key-xyz-123')
        .send({
          sourceType: 'PAYROLL',
          payrollRunId: '00000000-0000-4000-8000-000000000011',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.batchId).toBe('batch-replay-uuid');
      expect(res.body.data.isIdempotentReplay).toBe(true);
      expect(res.body.data.totalAmount).toBe(125000);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Maker / Checker Segregation, Sole-Admin Override & Concurrency
  // ---------------------------------------------------------------------------
  describe('5. Maker / Checker Segregation & Sole-Admin Security Policy', () => {
    it('strictly forbids Maker from approving their own batch when other admins exist', async () => {
      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000022',
            companyId: 'company-test-1',
            reportKey: 'BANK_TRANSFER_BATCH',
            userId: 'maker-user-1', // Same as caller
            status: 'PENDING',
            filters: {},
          }),
        },
        user: {
          count: vi.fn().mockResolvedValue(2), // 2 administrators exist
        },
      };

      const app = appFor(['payroll.approve'], prisma, 'COMPANY_ADMIN', 'maker-user-1');
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000022/approve')
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MAKER_CHECKER_VIOLATION');
    });

    it('requires explicit confirmation for sole-administrator self-approval', async () => {
      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000022',
            companyId: 'company-test-1',
            reportKey: 'BANK_TRANSFER_BATCH',
            userId: 'maker-user-1',
            status: 'PENDING',
            filters: {},
          }),
        },
        user: {
          count: vi.fn().mockResolvedValue(1), // Verified sole administrator
        },
      };

      const app = appFor(['payroll.approve'], prisma, 'COMPANY_ADMIN', 'maker-user-1');
      // Request WITHOUT explicit confirmation
      const resWithoutConfirm = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000022/approve')
        .send({});

      expect(resWithoutConfirm.status).toBe(403);
      expect(resWithoutConfirm.body.error.code).toBe('MAKER_CHECKER_CONFIRMATION_REQUIRED');
    });

    it('allows sole-administrator self-approval with explicit confirmation and logs security alert', async () => {
      const txMock = {
        reportExport: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        payrollRun: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000022',
            companyId: 'company-test-1',
            reportKey: 'BANK_TRANSFER_BATCH',
            userId: 'maker-user-1',
            status: 'PENDING',
            filters: {},
          }),
        },
        user: {
          count: vi.fn().mockResolvedValue(1), // Verified sole administrator
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
        notification: { create: vi.fn().mockResolvedValue({}) },
      };

      const app = appFor(['payroll.approve'], prisma, 'COMPANY_ADMIN', 'maker-user-1');
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000022/approve')
        .send({ soleAdminBypassConfirmation: true });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');

      // Verify security alert was logged in AuditLog
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SOLE_ADMIN_BANK_EXPORT_APPROVAL',
          category: 'SECURITY',
        }),
      });
    });

    it('prevents duplicate approvals on already approved batch (idempotent / 409 rejection)', async () => {
      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000022',
            companyId: 'company-test-1',
            status: 'COMPLETED', // Already approved!
            filters: {},
          }),
        },
      };

      const app = appFor(['payroll.approve'], prisma, 'COMPANY_ADMIN', 'checker-user-2');
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000022/approve')
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BATCH_ALREADY_APPROVED');
    });

    it('atomic CAS update prevents race condition when two Checkers approve simultaneously', async () => {
      // Simulate CAS failure on the second concurrent transaction
      const txMock = {
        reportExport: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, // 0 rows updated because status already changed to COMPLETED
        payrollRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000022',
            companyId: 'company-test-1',
            userId: 'maker-user-1',
            status: 'PENDING',
            filters: {},
          }),
        },
        user: { count: vi.fn().mockResolvedValue(2) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
      };

      const app = appFor(['payroll.approve'], prisma, 'COMPANY_ADMIN', 'checker-user-2');
      const res = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000022/approve')
        .send();

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BATCH_ALREADY_APPROVED');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Checksum Integrity, Tamper Detection & Export Lock
  // ---------------------------------------------------------------------------
  describe('6. Checksum Integrity & Tamper Detection on Download', () => {
    it('blocks download of an unapproved batch (PENDING status)', async () => {
      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000033',
            companyId: 'company-test-1',
            status: 'PENDING',
          }),
        },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app).get(
        '/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000033/download',
      );

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BATCH_NOT_APPROVED');
    });

    it('aborts download and logs security alert if file content is tampered with (checksum mismatch)', async () => {
      const entries = [
        validateBankTransferEntry({
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          beneficiaryName: 'Pooja Nair',
          accountNumber: '112233445566',
          ifscCode: 'HDFC0000001',
          amount: 65000,
        }),
      ];

      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000055',
            companyId: 'company-test-1',
            status: 'COMPLETED',
            format: 'STANDARD_RBI',
            filters: {
              entries,
              sha256Checksum: 'corrupted-tampered-checksum-12345', // Corrupted checksum!
            },
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app).get(
        '/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000055/download',
      );

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CHECKSUM_MISMATCH');

      // Verify security alert log
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'SECURITY_ALERT_CHECKSUM_MISMATCH',
          category: 'SECURITY',
        }),
      });
    });

    it('downloads successfully and logs audit trail when checksum matches perfectly', async () => {
      const entries = [
        validateBankTransferEntry({
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          beneficiaryName: 'Pooja Nair',
          accountNumber: '112233445566',
          ifscCode: 'HDFC0000001',
          amount: 65000,
        }),
      ];

      const content = generateBankFileContent(entries, 'STANDARD_RBI');
      const validChecksum = crypto.createHash('sha256').update(content).digest('hex');

      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockResolvedValue({
            id: '00000000-0000-4000-8000-000000000066',
            companyId: 'company-test-1',
            status: 'COMPLETED',
            format: 'STANDARD_RBI',
            filters: {
              entries,
              sha256Checksum: validChecksum,
            },
          }),
        },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const app = appFor(['payroll.manage'], prisma);
      const res = await request(app).get(
        '/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000066/download',
      );

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toBe(content);

      // Verify audit log for download
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DOWNLOAD_BANK_EXPORT',
          category: 'PAYROLL',
        }),
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('7. Multi-Tenant Isolation Verification', () => {
    it('Company A cannot access, approve, or download Company B export batch', async () => {
      const prisma = {
        reportExport: {
          findFirst: vi.fn().mockImplementation(({ where }) => {
            // Batch belongs to company-B
            if (where.companyId === 'company-B' && where.id === '00000000-0000-4000-8000-000000000099') {
              return Promise.resolve({ id: '00000000-0000-4000-8000-000000000099', companyId: 'company-B' });
            }
            return Promise.resolve(null);
          }),
        },
      };

      // User belongs to company-A
      const app = appFor(['payroll.manage', 'payroll.approve'], prisma, 'COMPANY_ADMIN', 'user-A', 'company-A');
      const downloadRes = await request(app).get(
        '/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000099/download',
      );

      expect(downloadRes.status).toBe(404);
      expect(downloadRes.body.error.code).toBe('BATCH_NOT_FOUND');

      const approveRes = await request(app)
        .post('/api/v1/payroll/bank-export/batch/00000000-0000-4000-8000-000000000099/approve')
        .send();

      expect(approveRes.status).toBe(404);
      expect(approveRes.body.error.code).toBe('BATCH_NOT_FOUND');
    });
  });
});
