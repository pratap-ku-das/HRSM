-- Migration #31: 20261008000000_p2_9_pt_compliance_foundation

-- CreateEnum
CREATE TYPE "PtRegistrationType" AS ENUM ('PT_RC', 'PT_EC');

-- CreateEnum
CREATE TYPE "PtRegistrationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PtChallanStatus" AS ENUM ('CHALLAN_GENERATED', 'PAID', 'RECONCILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProfessionalTaxRegistration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stateCode" VARCHAR(10) NOT NULL,
    "registrationType" "PtRegistrationType" NOT NULL DEFAULT 'PT_RC',
    "certificateNumber" VARCHAR(50) NOT NULL,
    "issuingAuthority" VARCHAR(100),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "PtRegistrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "workLocationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalTaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PtChallan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "statutoryFilingId" TEXT NOT NULL,
    "stateCode" VARCHAR(10) NOT NULL,
    "challanNumber" VARCHAR(50) NOT NULL,
    "challanPeriodYear" INTEGER NOT NULL,
    "challanPeriodMonth" INTEGER NOT NULL,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "challanDate" DATE NOT NULL,
    "paidDate" DATE,
    "cinNumber" VARCHAR(50),
    "bankReference" VARCHAR(100),
    "status" "PtChallanStatus" NOT NULL DEFAULT 'CHALLAN_GENERATED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PtChallan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalTaxRegistration_companyId_stateCode_registrationType_certificateNumber_key" 
ON "ProfessionalTaxRegistration"("companyId", "stateCode", "registrationType", "certificateNumber");

-- CreateIndex
CREATE INDEX "ProfessionalTaxRegistration_companyId_stateCode_status_idx" 
ON "ProfessionalTaxRegistration"("companyId", "stateCode", "status");

-- CreateIndex
CREATE INDEX "ProfessionalTaxRegistration_workLocationId_idx" 
ON "ProfessionalTaxRegistration"("workLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "PtChallan_statutoryFilingId_key" 
ON "PtChallan"("statutoryFilingId");

-- CreateIndex
CREATE INDEX "PtChallan_companyId_stateCode_challanPeriodYear_challanPeriodMonth_idx" 
ON "PtChallan"("companyId", "stateCode", "challanPeriodYear", "challanPeriodMonth");

-- CreateIndex
CREATE INDEX "PtChallan_statutoryFilingId_idx" 
ON "PtChallan"("statutoryFilingId");

-- CreateIndex
CREATE INDEX "PtChallan_challanNumber_idx" 
ON "PtChallan"("challanNumber");

-- AddForeignKey
ALTER TABLE "ProfessionalTaxRegistration" ADD CONSTRAINT "ProfessionalTaxRegistration_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalTaxRegistration" ADD CONSTRAINT "ProfessionalTaxRegistration_workLocationId_fkey" 
FOREIGN KEY ("workLocationId") REFERENCES "WorkLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtChallan" ADD CONSTRAINT "PtChallan_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtChallan" ADD CONSTRAINT "PtChallan_statutoryFilingId_fkey" 
FOREIGN KEY ("statutoryFilingId") REFERENCES "StatutoryFiling"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
