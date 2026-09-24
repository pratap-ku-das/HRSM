ALTER TABLE "PayrollRun"
  ADD COLUMN "paymentDate" DATE,
  ADD COLUMN "paymentReference" TEXT,
  ADD COLUMN "paymentRecordedById" TEXT,
  ADD COLUMN "paymentRecordedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);
