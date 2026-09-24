CREATE TYPE "EmployeeOnboardingStatus" AS ENUM (
  'DRAFT',
  'PERSONAL_DETAILS',
  'DOCUMENT_DETAILS',
  'SALARY_DETAILS',
  'FACE_AUTHENTICATION',
  'ADDITIONAL_DETAILS',
  'REVIEW',
  'COMPLETED',
  'INVITED',
  'ACTIVE',
  'REJECTED'
);

ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'ATTENDANCE_REVIEW';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'ATTENDANCE_FINALIZED';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'PAYSLIP_GENERATED';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PayrollStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TABLE "EmployeeOnboarding" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "employeeCode" TEXT,
  "workEmail" TEXT,
  "status" "EmployeeOnboardingStatus" NOT NULL DEFAULT 'DRAFT',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "personalDetails" JSONB,
  "documentDetails" JSONB,
  "salaryDetails" JSONB,
  "faceDetails" JSONB,
  "additionalDetails" JSONB,
  "createdEmployeeId" TEXT,
  "rejectionReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeOnboarding_createdEmployeeId_key" ON "EmployeeOnboarding"("createdEmployeeId");
CREATE INDEX "EmployeeOnboarding_companyId_status_updatedAt_idx" ON "EmployeeOnboarding"("companyId", "status", "updatedAt");
CREATE INDEX "EmployeeOnboarding_createdById_idx" ON "EmployeeOnboarding"("createdById");
ALTER TABLE "EmployeeOnboarding" ADD CONSTRAINT "EmployeeOnboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeOnboarding" ADD CONSTRAINT "EmployeeOnboarding_createdEmployeeId_fkey" FOREIGN KEY ("createdEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PayrollAttendanceReview" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workingDays" DOUBLE PRECISION NOT NULL,
  "presentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "absentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "unpaidLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "halfDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lateDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "earlyExitDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "holidays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "weeklyOffDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "missingAttendanceDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "exceptions" JSONB,
  "adjustedById" TEXT,
  "adjustedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollAttendanceReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollAttendanceReview_payrollRunId_employeeId_key" ON "PayrollAttendanceReview"("payrollRunId", "employeeId");
CREATE INDEX "PayrollAttendanceReview_companyId_payrollRunId_idx" ON "PayrollAttendanceReview"("companyId", "payrollRunId");
CREATE INDEX "PayrollAttendanceReview_employeeId_idx" ON "PayrollAttendanceReview"("employeeId");
ALTER TABLE "PayrollAttendanceReview" ADD CONSTRAINT "PayrollAttendanceReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAttendanceReview" ADD CONSTRAINT "PayrollAttendanceReview_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PayrollAttendanceChange" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "companyId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "oldValue" DOUBLE PRECISION NOT NULL,
  "newValue" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "changedById" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollAttendanceChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollAttendanceChange_companyId_changedAt_idx" ON "PayrollAttendanceChange"("companyId", "changedAt");
CREATE INDEX "PayrollAttendanceChange_reviewId_idx" ON "PayrollAttendanceChange"("reviewId");
ALTER TABLE "PayrollAttendanceChange" ADD CONSTRAINT "PayrollAttendanceChange_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAttendanceChange" ADD CONSTRAINT "PayrollAttendanceChange_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PayrollAttendanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payslip"
  ADD COLUMN "payslipNumber" TEXT,
  ADD COLUMN "breakdown" JSONB,
  ADD COLUMN "calculationTrace" JSONB,
  ADD COLUMN "netPayInWords" TEXT,
  ADD COLUMN "pdfObjectKey" TEXT,
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payslip_payslipNumber_key" ON "Payslip"("payslipNumber");
