ALTER TABLE "Employee"
ADD COLUMN "workdayGpsTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AttendanceLocationPoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "speedMetersPerSecond" DOUBLE PRECISION,
    "bearingDegrees" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceLocationPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceLocationPoint_companyId_capturedAt_idx" ON "AttendanceLocationPoint"("companyId", "capturedAt");
CREATE INDEX "AttendanceLocationPoint_employeeId_capturedAt_idx" ON "AttendanceLocationPoint"("employeeId", "capturedAt");
CREATE INDEX "AttendanceLocationPoint_attendanceRecordId_capturedAt_idx" ON "AttendanceLocationPoint"("attendanceRecordId", "capturedAt");

ALTER TABLE "AttendanceLocationPoint" ADD CONSTRAINT "AttendanceLocationPoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceLocationPoint" ADD CONSTRAINT "AttendanceLocationPoint_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceLocationPoint" ADD CONSTRAINT "AttendanceLocationPoint_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
