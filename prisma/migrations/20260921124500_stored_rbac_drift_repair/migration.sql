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
