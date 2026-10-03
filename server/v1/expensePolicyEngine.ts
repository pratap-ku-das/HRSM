import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

export interface ExpensePolicy {
  maxAmount: number;
  requiresReceiptAbove: number;
  allowedCategories: string[];
  categoryLimits?: Record<string, number>;
}

export interface ExpenseClaimInput {
  title: string;
  category: string;
  amount: number;
  currency?: string;
  expenseDate: Date | string;
  notes?: string | null;
  hasReceipt: boolean;
  receiptFileName?: string | null;
  receiptMimeType?: string | null;
  receiptSizeBytes?: number | null;
}

export interface PolicyViolation {
  code: string;
  message: string;
}

export interface ExpenseValidationResult {
  valid: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
}

export const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const ALLOWED_RECEIPT_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
]);

export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const RECEIPT_STORAGE_ROOT = path.resolve(
  process.env.DOCUMENT_STORAGE_DIR
    ? path.join(process.env.DOCUMENT_STORAGE_DIR, '..', 'receipts')
    : 'storage/receipts',
);

export const DEFAULT_EXPENSE_POLICY: ExpensePolicy = {
  maxAmount: 100000,
  requiresReceiptAbove: 500,
  allowedCategories: [
    'TRAVEL',
    'MEALS',
    'HARDWARE',
    'CERTIFICATION',
    'OFFICE_SUPPLIES',
    'INTERNET',
    'CLIENT_ENTERTAINMENT',
    'MISC',
  ],
  categoryLimits: {
    MEALS: 3000,
    INTERNET: 3000,
    MISC: 5000,
  },
};

/**
 * Validates an expense claim against the active or default enterprise policy.
 * Deterministic and side-effect-free.
 */
export function validateExpenseClaim(
  input: ExpenseClaimInput,
  policy: ExpensePolicy = DEFAULT_EXPENSE_POLICY,
): ExpenseValidationResult {
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];

  const categoryNorm = (input.category || '').trim().toUpperCase();
  const allowedNorm = policy.allowedCategories.map(c => c.toUpperCase());

  // 1. Category Allow-List Validation
  if (!allowedNorm.includes(categoryNorm)) {
    violations.push({
      code: 'EXPENSE_CATEGORY_NOT_ALLOWED',
      message: `The expense category '${input.category}' is not allowed by company policy. Permitted categories: ${policy.allowedCategories.join(', ')}.`,
    });
  }

  // 2. Global Max Claim Amount Limit
  if (input.amount <= 0) {
    violations.push({
      code: 'EXPENSE_AMOUNT_INVALID',
      message: 'Claim amount must be a positive number greater than 0.',
    });
  } else if (input.amount > policy.maxAmount) {
    violations.push({
      code: 'EXPENSE_AMOUNT_LIMIT_EXCEEDED',
      message: `Claim amount of ₹${input.amount.toLocaleString('en-IN')} exceeds the maximum allowed limit of ₹${policy.maxAmount.toLocaleString('en-IN')}.`,
    });
  }

  // 3. Category-Specific Cap Validation
  if (policy.categoryLimits && categoryNorm in policy.categoryLimits) {
    const limit = policy.categoryLimits[categoryNorm];
    if (input.amount > limit) {
      violations.push({
        code: 'EXPENSE_CATEGORY_LIMIT_EXCEEDED',
        message: `Claim amount of ₹${input.amount.toLocaleString('en-IN')} exceeds the ${input.category} category limit of ₹${limit.toLocaleString('en-IN')}.`,
      });
    }
  }

  // 4. Mandatory Receipt Requirement Check
  if (input.amount > policy.requiresReceiptAbove && !input.hasReceipt) {
    violations.push({
      code: 'EXPENSE_RECEIPT_REQUIRED',
      message: `A valid receipt is required for expense claims exceeding ₹${policy.requiresReceiptAbove.toLocaleString('en-IN')}.`,
    });
  }

  // 5. Receipt MIME Validation (if receipt provided)
  if (input.hasReceipt && input.receiptMimeType) {
    if (!ALLOWED_RECEIPT_MIME_TYPES.has(input.receiptMimeType)) {
      violations.push({
        code: 'EXPENSE_RECEIPT_INVALID_FORMAT',
        message: `Receipt format '${input.receiptMimeType}' is unsupported. Only PDF, JPEG, and PNG files are allowed.`,
      });
    }
  }

  // 6. Receipt File Size Validation
  if (input.hasReceipt && input.receiptSizeBytes && input.receiptSizeBytes > MAX_RECEIPT_SIZE_BYTES) {
    violations.push({
      code: 'EXPENSE_RECEIPT_TOO_LARGE',
      message: `Receipt file size (${(input.receiptSizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB maximum allowed limit.`,
    });
  }

  // 7. Future Date Check (with 24h grace window for server/client TZ offset)
  const expenseTime = new Date(input.expenseDate).getTime();
  const maxAllowedTime = Date.now() + 86400000;
  if (!Number.isNaN(expenseTime) && expenseTime > maxAllowedTime) {
    violations.push({
      code: 'EXPENSE_FUTURE_DATE',
      message: 'Expense date cannot be in the future.',
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Resolves the active company expense policy from the active WorkflowDefinition criteria.
 * Zero database migration requirement: leverages WorkflowDefinition.criteria Json.
 */
export async function resolveCompanyExpensePolicy(
  prisma: PrismaClient,
  companyId: string,
): Promise<ExpensePolicy> {
  try {
    const workflow = await prisma.workflowDefinition.findFirst({
      where: {
        companyId,
        module: 'EXPENSE',
        status: 'ACTIVE',
      },
      select: { criteria: true },
    });

    if (workflow?.criteria && typeof workflow.criteria === 'object') {
      const criteriaObj = workflow.criteria as Record<string, unknown>;
      if (criteriaObj.policy && typeof criteriaObj.policy === 'object') {
        const customPolicy = criteriaObj.policy as Partial<ExpensePolicy>;
        return {
          maxAmount: typeof customPolicy.maxAmount === 'number' ? customPolicy.maxAmount : DEFAULT_EXPENSE_POLICY.maxAmount,
          requiresReceiptAbove: typeof customPolicy.requiresReceiptAbove === 'number' ? customPolicy.requiresReceiptAbove : DEFAULT_EXPENSE_POLICY.requiresReceiptAbove,
          allowedCategories: Array.isArray(customPolicy.allowedCategories) ? customPolicy.allowedCategories.map(String) : DEFAULT_EXPENSE_POLICY.allowedCategories,
          categoryLimits: customPolicy.categoryLimits && typeof customPolicy.categoryLimits === 'object'
            ? customPolicy.categoryLimits as Record<string, number>
            : DEFAULT_EXPENSE_POLICY.categoryLimits,
        };
      }
    }
  } catch (err) {
    console.error('Failed to resolve company expense policy, using default:', err);
  }

  return DEFAULT_EXPENSE_POLICY;
}

export interface ReceiptMetadata {
  docId: string;
  fileName: string;
  mime: string;
  size: number;
}

export function parseReceiptFromNotes(notes: string | null | undefined): ReceiptMetadata | null {
  if (!notes) return null;
  const match = notes.match(/\[RECEIPT:docId=([a-zA-Z0-9_-]+):fileName=([^:]+):mime=([^:]+):size=(\d+)\]/);
  if (!match) return null;
  try {
    return {
      docId: match[1],
      fileName: decodeURIComponent(match[2]),
      mime: match[3],
      size: Number(match[4]),
    };
  } catch {
    return {
      docId: match[1],
      fileName: match[2],
      mime: match[3],
      size: Number(match[4]),
    };
  }
}

export function attachReceiptToNotes(
  existingNotes: string | null | undefined,
  receipt: ReceiptMetadata,
): string {
  const cleanNotes = detachReceiptFromNotes(existingNotes);
  const tag = `[RECEIPT:docId=${receipt.docId}:fileName=${encodeURIComponent(receipt.fileName)}:mime=${receipt.mime}:size=${receipt.size}]`;
  return cleanNotes ? `${tag} ${cleanNotes}` : tag;
}

export function detachReceiptFromNotes(existingNotes: string | null | undefined): string {
  if (!existingNotes) return '';
  return existingNotes
    .replace(/\[RECEIPT:docId=[a-zA-Z0-9_-]+:fileName=[^:]+:mime=[^:]+:size=\d+\]\s*/g, '')
    .trim();
}
