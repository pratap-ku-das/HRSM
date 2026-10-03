-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'INGESTED';

-- AlterTable ExpenseClaim
ALTER TABLE "ExpenseClaim" ADD COLUMN "reimbursedAt" TIMESTAMP(3);

-- AlterTable PayrollAdjustment
ALTER TABLE "PayrollAdjustment" ADD COLUMN "expenseClaimId" TEXT;
ALTER TABLE "PayrollAdjustment" ADD COLUMN "payrollRunId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAdjustment_expenseClaimId_key" ON "PayrollAdjustment"("expenseClaimId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_payrollRunId_idx" ON "PayrollAdjustment"("payrollRunId");

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_expenseClaimId_fkey" FOREIGN KEY ("expenseClaimId") REFERENCES "ExpenseClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints for REIMBURSEMENT
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "chk_reimbursement_requires_claim" CHECK ("kind" != 'REIMBURSEMENT' OR "expenseClaimId" IS NOT NULL);
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "chk_claim_implies_reimbursement" CHECK ("expenseClaimId" IS NULL OR "kind" = 'REIMBURSEMENT');
