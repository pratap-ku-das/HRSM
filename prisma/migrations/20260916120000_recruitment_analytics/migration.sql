ALTER TABLE "JobApplicant"
  ADD COLUMN "source" TEXT,
  ADD COLUMN "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "hiredAt" TIMESTAMP(3);

CREATE INDEX "JobApplicant_companyId_source_idx" ON "JobApplicant"("companyId", "source");
CREATE INDEX "JobApplicant_companyId_hiredAt_idx" ON "JobApplicant"("companyId", "hiredAt");
