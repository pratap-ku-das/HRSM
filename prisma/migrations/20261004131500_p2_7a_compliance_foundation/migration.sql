-- CreateEnum
CREATE TYPE "StatutoryFilingDomain" AS ENUM ('EPF_ECR', 'ESIC_MONTHLY', 'TDS_24Q', 'PROFESSIONAL_TAX');

-- CreateEnum
CREATE TYPE "StatutoryFilingStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'EXPORTED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StatutoryFilingType" AS ENUM ('ORIGINAL', 'REVISED');

-- CreateTable EmployeeStatutoryProfile
CREATE TABLE "EmployeeStatutoryProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "uan" VARCHAR(12),
    "pfMemberId" VARCHAR(50),
    "esicIpNumber" VARCHAR(10),
    "panNumber" VARCHAR(10),
    "epsExempt" BOOLEAN NOT NULL DEFAULT false,
    "pfOptOut" BOOLEAN NOT NULL DEFAULT false,
    "ptState" VARCHAR(2),
    "effectiveFrom" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeStatutoryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable TdsChallan
CREATE TABLE "TdsChallan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "bsrCode" VARCHAR(7) NOT NULL,
    "challanDate" DATE NOT NULL,
    "challanSerialNo" VARCHAR(5) NOT NULL,
    "minorHead" TEXT NOT NULL DEFAULT '200',
    "tdsAmount" DOUBLE PRECISION NOT NULL,
    "surcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "chequeOrDdNo" TEXT,
    "statutoryFilingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable StatutoryFiling
CREATE TABLE "StatutoryFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" "StatutoryFilingDomain" NOT NULL,
    "filingType" "StatutoryFilingType" NOT NULL DEFAULT 'ORIGINAL',
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER,
    "quarter" TEXT,
    "stateCode" TEXT,
    "payrollRunId" TEXT NOT NULL,
    "status" "StatutoryFilingStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalGrossWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEpfWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEeShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalErShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTaxDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sha256Checksum" TEXT,
    "supersededFilingId" TEXT,
    "createdById" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatutoryFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable StatutoryFilingItem
CREATE TABLE "StatutoryFilingItem" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "snapshotEmployeeCode" TEXT NOT NULL,
    "snapshotEmployeeName" TEXT NOT NULL,
    "snapshotUan" TEXT,
    "snapshotPan" TEXT,
    "snapshotEsicIp" TEXT,
    "workingDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncpDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epfWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epsWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "edliWages" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eePfShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "erEpsShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "erEpfShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eeEsiShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "erEsiShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ptAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryFilingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeStatutoryProfile_companyId_employeeId_active_idx" ON "EmployeeStatutoryProfile"("companyId", "employeeId", "active");
CREATE INDEX "EmployeeStatutoryProfile_companyId_employeeId_effectiveFrom_idx" ON "EmployeeStatutoryProfile"("companyId", "employeeId", "effectiveFrom");
CREATE INDEX "EmployeeStatutoryProfile_companyId_uan_idx" ON "EmployeeStatutoryProfile"("companyId", "uan");
CREATE INDEX "EmployeeStatutoryProfile_companyId_panNumber_idx" ON "EmployeeStatutoryProfile"("companyId", "panNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TdsChallan_companyId_bsrCode_challanDate_challanSerialNo_key" ON "TdsChallan"("companyId", "bsrCode", "challanDate", "challanSerialNo");
CREATE INDEX "TdsChallan_companyId_financialYear_quarter_idx" ON "TdsChallan"("companyId", "financialYear", "quarter");
CREATE INDEX "TdsChallan_statutoryFilingId_idx" ON "TdsChallan"("statutoryFilingId");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryFiling_companyId_domain_periodYear_periodMonth_quarter_stateCode_filingType_key" ON "StatutoryFiling"("companyId", "domain", "periodYear", "periodMonth", "quarter", "stateCode", "filingType");
CREATE INDEX "StatutoryFiling_companyId_domain_periodYear_idx" ON "StatutoryFiling"("companyId", "domain", "periodYear");
CREATE INDEX "StatutoryFiling_payrollRunId_idx" ON "StatutoryFiling"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryFilingItem_filingId_employeeId_key" ON "StatutoryFilingItem"("filingId", "employeeId");
CREATE INDEX "StatutoryFilingItem_filingId_idx" ON "StatutoryFilingItem"("filingId");
CREATE INDEX "StatutoryFilingItem_employeeId_idx" ON "StatutoryFilingItem"("employeeId");

-- AddForeignKey
ALTER TABLE "EmployeeStatutoryProfile" ADD CONSTRAINT "EmployeeStatutoryProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeStatutoryProfile" ADD CONSTRAINT "EmployeeStatutoryProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TdsChallan" ADD CONSTRAINT "TdsChallan_statutoryFilingId_fkey" FOREIGN KEY ("statutoryFilingId") REFERENCES "StatutoryFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatutoryFiling" ADD CONSTRAINT "StatutoryFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatutoryFiling" ADD CONSTRAINT "StatutoryFiling_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatutoryFilingItem" ADD CONSTRAINT "StatutoryFilingItem_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "StatutoryFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatutoryFilingItem" ADD CONSTRAINT "StatutoryFilingItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
