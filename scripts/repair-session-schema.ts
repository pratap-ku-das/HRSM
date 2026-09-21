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
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionScope') THEN
        CREATE TYPE "PermissionScope" AS ENUM ('ALL_COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF');
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS "Permission" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"key" TEXT NOT NULL,"description" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Permission_pkey" PRIMARY KEY ("id"));
    CREATE TABLE IF NOT EXISTS "AccessRole" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"name" TEXT NOT NULL,"code" TEXT NOT NULL,"description" TEXT,"system" BOOLEAN NOT NULL DEFAULT false,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id"));
    CREATE TABLE IF NOT EXISTS "AccessRolePermission" ("roleId" TEXT NOT NULL,"permissionId" TEXT NOT NULL,CONSTRAINT "AccessRolePermission_pkey" PRIMARY KEY ("roleId","permissionId"));
    CREATE TABLE IF NOT EXISTS "UserAccessGrant" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"roleId" TEXT NOT NULL,"scope" "PermissionScope" NOT NULL DEFAULT 'SELF',"scopeEntityId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3),CONSTRAINT "UserAccessGrant_pkey" PRIMARY KEY ("id"));
    CREATE UNIQUE INDEX IF NOT EXISTS "Permission_companyId_key_key" ON "Permission"("companyId","key");
    CREATE UNIQUE INDEX IF NOT EXISTS "AccessRole_companyId_code_key" ON "AccessRole"("companyId","code");
    CREATE INDEX IF NOT EXISTS "UserAccessGrant_companyId_userId_idx" ON "UserAccessGrant"("companyId","userId");
    CREATE UNIQUE INDEX IF NOT EXISTS "UserAccessGrant_userId_roleId_scope_scopeEntityId_key" ON "UserAccessGrant"("userId","roleId","scope","scopeEntityId");
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Permission_companyId_fkey') THEN ALTER TABLE "Permission" ADD CONSTRAINT "Permission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AccessRole_companyId_fkey') THEN ALTER TABLE "AccessRole" ADD CONSTRAINT "AccessRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AccessRolePermission_roleId_fkey') THEN ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='AccessRolePermission_permissionId_fkey') THEN ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserAccessGrant_companyId_fkey') THEN ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserAccessGrant_userId_fkey') THEN ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='UserAccessGrant_roleId_fkey') THEN ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF;
    END $$;
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
