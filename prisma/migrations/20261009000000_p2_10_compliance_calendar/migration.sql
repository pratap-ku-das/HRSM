-- Migration #32: 20261009000000_p2_10_compliance_calendar
-- Additive Unified Statutory Compliance Calendar Foundation

-- CreateEnum
CREATE TYPE "ComplianceObligationStatus" AS ENUM (
    'UPCOMING',
    'DUE_SOON',
    'DUE_TODAY',
    'OVERDUE',
    'FILED',
    'PAID',
    'COMPLETED',
    'EXEMPT',
    'NEEDS_REVIEW'
);

-- CreateTable
CREATE TABLE "ComplianceCalendarObligation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" "StatutoryFilingDomain" NOT NULL,
    "obligationType" VARCHAR(50) NOT NULL,
    "jurisdiction" VARCHAR(10) NOT NULL DEFAULT 'IN',
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER,
    "quarter" VARCHAR(5),
    "statutoryDueDate" DATE NOT NULL,
    "extendedDueDate" DATE,
    "extensionReason" TEXT,
    "internalTargetDate" DATE,
    "status" "ComplianceObligationStatus" NOT NULL DEFAULT 'UPCOMING',
    "statutoryFilingId" TEXT,
    "assignedUserId" TEXT,
    "remindedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCalendarObligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCalendarObligation_companyId_domain_obligationType_periodYear_periodMonth_quarter_jurisdiction_key" 
ON "ComplianceCalendarObligation"("companyId", "domain", "obligationType", "periodYear", "periodMonth", "quarter", "jurisdiction");

-- CreateIndex
CREATE INDEX "ComplianceCalendarObligation_companyId_status_idx" 
ON "ComplianceCalendarObligation"("companyId", "status");

-- CreateIndex
CREATE INDEX "ComplianceCalendarObligation_companyId_statutoryDueDate_idx" 
ON "ComplianceCalendarObligation"("companyId", "statutoryDueDate");

-- CreateIndex
CREATE INDEX "ComplianceCalendarObligation_statutoryFilingId_idx" 
ON "ComplianceCalendarObligation"("statutoryFilingId");

-- CreateIndex
CREATE INDEX "ComplianceCalendarObligation_assignedUserId_idx" 
ON "ComplianceCalendarObligation"("assignedUserId");

-- AddForeignKey
ALTER TABLE "ComplianceCalendarObligation" ADD CONSTRAINT "ComplianceCalendarObligation_companyId_fkey" 
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarObligation" ADD CONSTRAINT "ComplianceCalendarObligation_assignedUserId_fkey" 
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCalendarObligation" ADD CONSTRAINT "ComplianceCalendarObligation_statutoryFilingId_fkey" 
FOREIGN KEY ("statutoryFilingId") REFERENCES "StatutoryFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;
