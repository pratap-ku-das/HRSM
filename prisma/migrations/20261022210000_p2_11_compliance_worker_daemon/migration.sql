-- CreateEnum
CREATE TYPE "ComplianceJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "ComplianceReminderJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "obligationId" TEXT,
    "jobType" VARCHAR(50) NOT NULL DEFAULT 'COMPLIANCE_REMINDER',
    "status" "ComplianceJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" VARCHAR(100),
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceReminderJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceReminderJob_companyId_status_nextAttemptAt_idx" ON "ComplianceReminderJob"("companyId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ComplianceReminderJob_status_leaseExpiresAt_idx" ON "ComplianceReminderJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "ComplianceReminderJob_obligationId_idx" ON "ComplianceReminderJob"("obligationId");

-- AddForeignKey
ALTER TABLE "ComplianceReminderJob" ADD CONSTRAINT "ComplianceReminderJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReminderJob" ADD CONSTRAINT "ComplianceReminderJob_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "ComplianceCalendarObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
