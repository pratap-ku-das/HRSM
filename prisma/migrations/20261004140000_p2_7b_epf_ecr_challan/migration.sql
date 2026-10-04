-- CreateEnum
CREATE TYPE "EpfChallanStatus" AS ENUM ('CHALLAN_GENERATED', 'PAYMENT_INITIATED', 'PAID', 'RECONCILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EpfChallan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statutoryFilingId" TEXT NOT NULL,
    "establishmentCode" VARCHAR(50) NOT NULL,
    "wageMonth" INTEGER NOT NULL,
    "wageYear" INTEGER NOT NULL,
    "trrnNumber" VARCHAR(20),
    "account1Amount" DOUBLE PRECISION NOT NULL,
    "account2Amount" DOUBLE PRECISION NOT NULL,
    "account10Amount" DOUBLE PRECISION NOT NULL,
    "account21Amount" DOUBLE PRECISION NOT NULL,
    "account22Amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "challanDate" DATE NOT NULL,
    "paidDate" DATE,
    "challanSerialNo" VARCHAR(20),
    "crnNumber" VARCHAR(50),
    "bankReference" VARCHAR(100),
    "status" "EpfChallanStatus" NOT NULL DEFAULT 'CHALLAN_GENERATED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "paidRecordedById" TEXT,
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpfChallan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EpfChallan_trrnNumber_key" ON "EpfChallan"("trrnNumber");

-- CreateIndex
CREATE INDEX "EpfChallan_companyId_wageYear_wageMonth_idx" ON "EpfChallan"("companyId", "wageYear", "wageMonth");

-- CreateIndex
CREATE INDEX "EpfChallan_statutoryFilingId_idx" ON "EpfChallan"("statutoryFilingId");

-- CreateIndex
CREATE INDEX "EpfChallan_trrnNumber_idx" ON "EpfChallan"("trrnNumber");

-- AddForeignKey
ALTER TABLE "EpfChallan" ADD CONSTRAINT "EpfChallan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpfChallan" ADD CONSTRAINT "EpfChallan_statutoryFilingId_fkey" FOREIGN KEY ("statutoryFilingId") REFERENCES "StatutoryFiling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
