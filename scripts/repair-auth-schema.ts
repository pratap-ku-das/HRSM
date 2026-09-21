import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "LoginAttempt" (
      "id" TEXT NOT NULL,
      "companyId" TEXT,
      "email" TEXT NOT NULL,
      "userId" TEXT,
      "success" BOOLEAN NOT NULL,
      "reason" TEXT,
      "ipAddress" TEXT NOT NULL,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "LoginAttempt_email_createdAt_idx"
      ON "LoginAttempt"("email", "createdAt");
    CREATE INDEX IF NOT EXISTS "LoginAttempt_companyId_createdAt_idx"
      ON "LoginAttempt"("companyId", "createdAt");
    CREATE TABLE IF NOT EXISTS "MfaMethod" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "encryptedSecret" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "verifiedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "MfaMethod_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "MfaMethod_userId_key" ON "MfaMethod"("userId");
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoginAttempt_companyId_fkey') THEN
        ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MfaMethod_userId_fkey') THEN
        ALTER TABLE "MfaMethod" ADD CONSTRAINT "MfaMethod_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  await client.query('COMMIT');
  console.log('Authentication schema repair verified.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
