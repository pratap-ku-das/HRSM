-- AlterTable
ALTER TABLE "StatutoryFilingItem" ADD COLUMN "snapshotLastWorkingDay" DATE;

-- CreateEnum
CREATE TYPE "EsicChallanStatus" AS ENUM ('CHALLAN_GENERATED', 'PAYMENT_INITIATED', 'PAID', 'RECONCILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EsicChallan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statutoryFilingId" TEXT NOT NULL,
    "cprnNumber" VARCHAR(14),
    "challanPeriodYear" INTEGER NOT NULL,
    "challanPeriodMonth" INTEGER NOT NULL,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employeeShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employerShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "challanDate" DATE NOT NULL,
    "paidDate" DATE,
    "transactionReference" VARCHAR(100),
    "bankReference" VARCHAR(100),
    "status" "EsicChallanStatus" NOT NULL DEFAULT 'CHALLAN_GENERATED',
    "notes" TEXT,
    "reconciliationChecksum" VARCHAR(64),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "paidRecordedById" TEXT,
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsicChallan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EsicChallan_cprnNumber_key" ON "EsicChallan"("cprnNumber");

-- CreateIndex
CREATE INDEX "EsicChallan_companyId_challanPeriodYear_challanPeriodMonth_idx" ON "EsicChallan"("companyId", "challanPeriodYear", "challanPeriodMonth");

-- CreateIndex
CREATE INDEX "EsicChallan_statutoryFilingId_idx" ON "EsicChallan"("statutoryFilingId");

-- CreateIndex
CREATE INDEX "EsicChallan_cprnNumber_idx" ON "EsicChallan"("cprnNumber");

-- AddForeignKey
ALTER TABLE "EsicChallan" ADD CONSTRAINT "EsicChallan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsicChallan" ADD CONSTRAINT "EsicChallan_statutoryFilingId_fkey" FOREIGN KEY ("statutoryFilingId") REFERENCES "StatutoryFiling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
