CREATE TYPE "ShiftType" AS ENUM ('FIXED', 'FLEXIBLE', 'NIGHT', 'ROTATIONAL');
CREATE TYPE "AttendanceRequestType" AS ENUM ('REGULARIZATION', 'WFH', 'ON_DUTY', 'BUSINESS_TRAVEL', 'OVERTIME');
CREATE TYPE "AttendanceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ShiftTemplate" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL,
  "type" "ShiftType" NOT NULL DEFAULT 'FIXED', "startMinute" INTEGER NOT NULL, "endMinute" INTEGER NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0, "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
  "weeklyOffDays" INTEGER[], "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendancePolicy" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "shiftTemplateId" TEXT, "name" TEXT NOT NULL,
  "graceInMinutes" INTEGER NOT NULL DEFAULT 0, "graceOutMinutes" INTEGER NOT NULL DEFAULT 0,
  "halfDayAfterMinutes" INTEGER NOT NULL DEFAULT 240, "fullDayMinutes" INTEGER NOT NULL DEFAULT 480,
  "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480, "missingPunchAction" TEXT NOT NULL DEFAULT 'FLAG',
  "allowRemote" BOOLEAN NOT NULL DEFAULT false, "requireGeofence" BOOLEAN NOT NULL DEFAULT true,
  "requireFace" BOOLEAN NOT NULL DEFAULT true, "effectiveFrom" DATE NOT NULL, "effectiveTo" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShiftAssignment" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "shiftTemplateId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL, "endsOn" DATE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BreakSession" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "date" DATE NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BreakSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendanceEvaluation" (
  "id" TEXT NOT NULL, "attendanceRecordId" TEXT NOT NULL, "shiftTemplateId" TEXT, "policyId" TEXT,
  "scheduledMinutes" INTEGER NOT NULL, "workedMinutes" INTEGER NOT NULL, "breakMinutes" INTEGER NOT NULL,
  "lateMinutes" INTEGER NOT NULL, "earlyExitMinutes" INTEGER NOT NULL, "overtimeMinutes" INTEGER NOT NULL,
  "flags" TEXT[], "explanation" JSONB NOT NULL, "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendanceRequest" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "type" "AttendanceRequestType" NOT NULL,
  "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "requestedClockIn" TIMESTAMP(3), "requestedClockOut" TIMESTAMP(3),
  "reason" TEXT NOT NULL, "status" "AttendanceRequestStatus" NOT NULL DEFAULT 'PENDING', "workflowInstanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendancePeriodLock" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "periodStart" DATE NOT NULL, "periodEnd" DATE NOT NULL,
  "lockedById" TEXT NOT NULL, "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reason" TEXT,
  CONSTRAINT "AttendancePeriodLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftTemplate_companyId_code_key" ON "ShiftTemplate"("companyId", "code");
CREATE INDEX "ShiftTemplate_companyId_active_idx" ON "ShiftTemplate"("companyId", "active");
CREATE INDEX "AttendancePolicy_companyId_active_effectiveFrom_idx" ON "AttendancePolicy"("companyId", "active", "effectiveFrom");
CREATE INDEX "ShiftAssignment_companyId_startsOn_endsOn_idx" ON "ShiftAssignment"("companyId", "startsOn", "endsOn");
CREATE INDEX "ShiftAssignment_employeeId_startsOn_endsOn_idx" ON "ShiftAssignment"("employeeId", "startsOn", "endsOn");
CREATE INDEX "BreakSession_employeeId_date_idx" ON "BreakSession"("employeeId", "date");
CREATE UNIQUE INDEX "AttendanceEvaluation_attendanceRecordId_key" ON "AttendanceEvaluation"("attendanceRecordId");
CREATE INDEX "AttendanceRequest_companyId_status_createdAt_idx" ON "AttendanceRequest"("companyId", "status", "createdAt");
CREATE INDEX "AttendanceRequest_employeeId_startDate_idx" ON "AttendanceRequest"("employeeId", "startDate");
CREATE UNIQUE INDEX "AttendancePeriodLock_companyId_periodStart_periodEnd_key" ON "AttendancePeriodLock"("companyId", "periodStart", "periodEnd");
CREATE INDEX "AttendancePeriodLock_companyId_periodStart_periodEnd_idx" ON "AttendancePeriodLock"("companyId", "periodStart", "periodEnd");

ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BreakSession" ADD CONSTRAINT "BreakSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvaluation" ADD CONSTRAINT "AttendanceEvaluation_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePeriodLock" ADD CONSTRAINT "AttendancePeriodLock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
