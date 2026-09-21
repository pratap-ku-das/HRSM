import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "RefreshToken" (
      "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
      "familyId" TEXT NOT NULL, "deviceName" TEXT, "ipAddress" TEXT, "userAgent" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "replacedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3),
      CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
    );
    ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
    ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
    CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
    CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
    CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_userId_fkey') THEN
        ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "confirmationDate" DATE;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "costCenterId" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "employeeGradeId" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "lastWorkingDay" DATE;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "probationEndDate" DATE;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "resignationDate" DATE;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
    ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "workLocationId" TEXT;
    CREATE INDEX IF NOT EXISTS "Employee_branchId_idx" ON "Employee"("branchId");
    CREATE INDEX IF NOT EXISTS "Employee_workLocationId_idx" ON "Employee"("workLocationId");
    CREATE INDEX IF NOT EXISTS "Employee_teamId_idx" ON "Employee"("teamId");
    CREATE INDEX IF NOT EXISTS "Employee_costCenterId_idx" ON "Employee"("costCenterId");
    CREATE INDEX IF NOT EXISTS "Employee_employeeGradeId_idx" ON "Employee"("employeeGradeId");
  `);
  await client.query('COMMIT');
  console.log('Session schema repair verified.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
