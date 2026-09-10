-- Employee-specific biometric enrollment and single-use face verification.
CREATE TYPE "FaceEnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "FaceVerificationStatus" AS ENUM ('CHALLENGE', 'VERIFIED', 'CONSUMED', 'REJECTED', 'EXPIRED');

CREATE TABLE "FaceEnrollment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'AWS_REKOGNITION',
    "providerFaceId" TEXT NOT NULL,
    "status" "FaceEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledById" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FaceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceVerificationSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "FaceVerificationStatus" NOT NULL DEFAULT 'CHALLENGE',
    "deviceId" TEXT NOT NULL,
    "proofTokenHash" TEXT,
    "similarity" DOUBLE PRECISION,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    CONSTRAINT "FaceVerificationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaceEnrollment_employeeId_key" ON "FaceEnrollment"("employeeId");
CREATE INDEX "FaceEnrollment_companyId_status_idx" ON "FaceEnrollment"("companyId", "status");
CREATE UNIQUE INDEX "FaceVerificationSession_proofTokenHash_key" ON "FaceVerificationSession"("proofTokenHash");
CREATE INDEX "FaceVerificationSession_employeeId_status_expiresAt_idx" ON "FaceVerificationSession"("employeeId", "status", "expiresAt");
CREATE INDEX "FaceVerificationSession_companyId_createdAt_idx" ON "FaceVerificationSession"("companyId", "createdAt");

ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaceEnrollment" ADD CONSTRAINT "FaceEnrollment_enrolledById_fkey" FOREIGN KEY ("enrolledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FaceVerificationSession" ADD CONSTRAINT "FaceVerificationSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FaceVerificationSession" ADD CONSTRAINT "FaceVerificationSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

