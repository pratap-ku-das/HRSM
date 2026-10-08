-- AlterTable CompanySettings
ALTER TABLE "CompanySettings" ADD COLUMN "responsiblePersonName" TEXT,
ADD COLUMN "responsiblePersonDesignation" TEXT,
ADD COLUMN "responsiblePersonPan" VARCHAR(10),
ADD COLUMN "responsiblePersonMobile" TEXT,
ADD COLUMN "responsiblePersonEmail" TEXT;

-- AlterTable StatutoryFiling
ALTER TABLE "StatutoryFiling" ADD COLUMN "statutoryFormCode" TEXT NOT NULL DEFAULT '24Q',
ADD COLUMN "formatVersion" TEXT NOT NULL DEFAULT '6.3',
ADD COLUMN "tokenNumberPrn" VARCHAR(30),
ADD COLUMN "filingReceiptDate" DATE;

-- AlterTable StatutoryFilingItem
ALTER TABLE "StatutoryFilingItem" ADD COLUMN "tdsChallanId" TEXT,
ADD COLUMN "panStatus" TEXT NOT NULL DEFAULT 'VALID',
ADD COLUMN "deducteeReasonCode" VARCHAR(1);

-- CreateIndex
CREATE INDEX "StatutoryFilingItem_tdsChallanId_idx" ON "StatutoryFilingItem"("tdsChallanId");

-- AddForeignKey
ALTER TABLE "StatutoryFilingItem" ADD CONSTRAINT "StatutoryFilingItem_tdsChallanId_fkey" FOREIGN KEY ("tdsChallanId") REFERENCES "TdsChallan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
