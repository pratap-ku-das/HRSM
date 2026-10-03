import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXPENSE_POLICY,
  resolveCompanyExpensePolicy,
  validateExpenseClaim,
  attachReceiptToNotes,
  detachReceiptFromNotes,
  parseReceiptFromNotes,
  type ExpenseClaimInput,
  type ExpensePolicy,
} from './expensePolicyEngine.js';

describe('expensePolicyEngine', () => {
  const baseInput: ExpenseClaimInput = {
    title: 'Client Lunch in Mumbai',
    category: 'MEALS',
    amount: 1500,
    currency: 'INR',
    expenseDate: new Date().toISOString().slice(0, 10),
    hasReceipt: true,
    receiptFileName: 'lunch_receipt.pdf',
    receiptMimeType: 'application/pdf',
    receiptSizeBytes: 245 * 1024,
  };

  it('validates a compliant claim with receipt successfully', () => {
    const result = validateExpenseClaim(baseInput);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('allows small claims below threshold without receipt', () => {
    const smallClaim: ExpenseClaimInput = {
      ...baseInput,
      amount: 350,
      hasReceipt: false,
      receiptFileName: null,
      receiptMimeType: null,
      receiptSizeBytes: null,
    };
    const result = validateExpenseClaim(smallClaim);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects claim exceeding receipt threshold without receipt', () => {
    const claimWithoutReceipt: ExpenseClaimInput = {
      ...baseInput,
      amount: 1200,
      hasReceipt: false,
    };
    const result = validateExpenseClaim(claimWithoutReceipt);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_RECEIPT_REQUIRED' }),
      ]),
    );
  });

  it('rejects prohibited or unknown expense category', () => {
    const invalidCategory: ExpenseClaimInput = {
      ...baseInput,
      category: 'GAMBLING_OR_CRYPTO',
    };
    const result = validateExpenseClaim(invalidCategory);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_CATEGORY_NOT_ALLOWED' }),
      ]),
    );
  });

  it('rejects claim exceeding global maxAmount limit', () => {
    const excessiveClaim: ExpenseClaimInput = {
      ...baseInput,
      category: 'TRAVEL',
      amount: 150000, // exceeds 100,000
    };
    const result = validateExpenseClaim(excessiveClaim);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_AMOUNT_LIMIT_EXCEEDED' }),
      ]),
    );
  });

  it('rejects claim exceeding category-specific limit', () => {
    const excessiveMeal: ExpenseClaimInput = {
      ...baseInput,
      category: 'MEALS',
      amount: 4500, // exceeds 3,000 category limit
    };
    const result = validateExpenseClaim(excessiveMeal);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_CATEGORY_LIMIT_EXCEEDED' }),
      ]),
    );
  });

  it('rejects unsupported receipt MIME types', () => {
    const badMimeClaim: ExpenseClaimInput = {
      ...baseInput,
      receiptMimeType: 'application/x-zip-compressed',
    };
    const result = validateExpenseClaim(badMimeClaim);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_RECEIPT_INVALID_FORMAT' }),
      ]),
    );
  });

  it('rejects oversized receipt files', () => {
    const oversizedClaim: ExpenseClaimInput = {
      ...baseInput,
      receiptSizeBytes: 15 * 1024 * 1024, // 15 MB > 10 MB
    };
    const result = validateExpenseClaim(oversizedClaim);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_RECEIPT_TOO_LARGE' }),
      ]),
    );
  });

  it('rejects future expense dates', () => {
    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const futureClaim: ExpenseClaimInput = {
      ...baseInput,
      expenseDate: futureDate,
    };
    const result = validateExpenseClaim(futureClaim);
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EXPENSE_FUTURE_DATE' }),
      ]),
    );
  });

  it('accumulates multiple simultaneous violations cleanly', () => {
    const multiViolation: ExpenseClaimInput = {
      title: 'Bad claim',
      category: 'PROHIBITED_CAT',
      amount: 250000,
      expenseDate: '2099-01-01',
      hasReceipt: false,
    };
    const result = validateExpenseClaim(multiViolation);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(4);
    const codes = result.violations.map(v => v.code);
    expect(codes).toContain('EXPENSE_CATEGORY_NOT_ALLOWED');
    expect(codes).toContain('EXPENSE_AMOUNT_LIMIT_EXCEEDED');
    expect(codes).toContain('EXPENSE_RECEIPT_REQUIRED');
    expect(codes).toContain('EXPENSE_FUTURE_DATE');
  });

  it('resolves default policy when company has no custom workflow criteria', async () => {
    const prismaMock = {
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const policy = await resolveCompanyExpensePolicy(prismaMock as never, 'comp-1');
    expect(policy).toEqual(DEFAULT_EXPENSE_POLICY);
  });

  it('resolves custom company policy from active WorkflowDefinition criteria', async () => {
    const customPolicy: Partial<ExpensePolicy> = {
      maxAmount: 25000,
      requiresReceiptAbove: 200,
      allowedCategories: ['TRAVEL', 'MEALS'],
      categoryLimits: { MEALS: 1000 },
    };
    const prismaMock = {
      workflowDefinition: {
        findFirst: vi.fn().mockResolvedValue({
          criteria: {
            policy: customPolicy,
          },
        }),
      },
    };
    const policy = await resolveCompanyExpensePolicy(prismaMock as never, 'comp-1');
    expect(policy.maxAmount).toBe(25000);
    expect(policy.requiresReceiptAbove).toBe(200);
    expect(policy.allowedCategories).toEqual(['TRAVEL', 'MEALS']);
    expect(policy.categoryLimits?.MEALS).toBe(1000);
  });

  describe('Receipt Notes Metadata Helpers', () => {
    it('serializes and parses receipt metadata in claim notes cleanly', () => {
      const receipt = {
        docId: 'doc-123',
        fileName: 'hotel receipt (march).pdf',
        mime: 'application/pdf',
        size: 1048576,
      };
      const formatted = attachReceiptToNotes('Attended Q1 sales summit in Mumbai', receipt);
      expect(formatted).toContain('[RECEIPT:docId=doc-123:');
      expect(formatted).toContain('Attended Q1 sales summit in Mumbai');

      const parsed = parseReceiptFromNotes(formatted);
      expect(parsed).toEqual(receipt);

      const detached = detachReceiptFromNotes(formatted);
      expect(detached).toBe('Attended Q1 sales summit in Mumbai');
      expect(parseReceiptFromNotes(detached)).toBeNull();
    });

    it('handles null, undefined, or notes without receipt tags', () => {
      expect(parseReceiptFromNotes(null)).toBeNull();
      expect(parseReceiptFromNotes(undefined)).toBeNull();
      expect(parseReceiptFromNotes('Ordinary notes without receipt')).toBeNull();
      expect(detachReceiptFromNotes(null)).toBe('');
      expect(detachReceiptFromNotes('Plain notes')).toBe('Plain notes');
    });
  });
});
