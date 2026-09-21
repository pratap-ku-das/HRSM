import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

const constraint = async (name: string, sql: string) => {
  const found = await client.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [name]);
  if (!found.rowCount) await client.query(sql);
};

try {
  await client.query('BEGIN');
  await client.query(`
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowModule') THEN CREATE TYPE "WorkflowModule" AS ENUM ('LEAVE','EXPENSE','ATTENDANCE_CORRECTION','WFH','ON_DUTY','BUSINESS_TRAVEL','OVERTIME','SALARY_REVISION','PAYROLL','DOCUMENT','ADVANCE','GENERIC'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowDefinitionStatus') THEN CREATE TYPE "WorkflowDefinitionStatus" AS ENUM ('DRAFT','ACTIVE','RETIRED'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowInstanceStatus') THEN CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED','WITHDRAWN'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowStepStatus') THEN CREATE TYPE "WorkflowStepStatus" AS ENUM ('WAITING','PENDING','APPROVED','REJECTED','SKIPPED'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowApproverType') THEN CREATE TYPE "WorkflowApproverType" AS ENUM ('USER','ROLE','REPORTING_MANAGER','DEPARTMENT_HEAD','FINANCE'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='WorkflowActionType') THEN CREATE TYPE "WorkflowActionType" AS ENUM ('SUBMIT','APPROVE','REJECT','COMMENT','DELEGATE','CANCEL','WITHDRAW'); END IF; END $$;
    ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
    ALTER TABLE "ExpenseClaim" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
    ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
    ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
    CREATE TABLE IF NOT EXISTS "WorkflowDefinition" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"module" "WorkflowModule" NOT NULL,"name" TEXT NOT NULL,"code" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"status" "WorkflowDefinitionStatus" NOT NULL DEFAULT 'DRAFT',"criteria" JSONB,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "WorkflowStep" ("id" TEXT NOT NULL,"definitionId" TEXT NOT NULL,"sequence" INTEGER NOT NULL,"name" TEXT NOT NULL,"approverType" "WorkflowApproverType" NOT NULL,"approverReference" TEXT,"minimumApprovals" INTEGER NOT NULL DEFAULT 1,"slaHours" INTEGER,"allowDelegation" BOOLEAN NOT NULL DEFAULT true,"conditions" JSONB,CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "WorkflowInstance" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"definitionId" TEXT NOT NULL,"module" "WorkflowModule" NOT NULL,"subjectType" TEXT NOT NULL,"subjectId" TEXT NOT NULL,"requesterUserId" TEXT NOT NULL,"status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'PENDING',"currentSequence" INTEGER NOT NULL DEFAULT 1,"title" TEXT NOT NULL,"summary" TEXT,"payload" JSONB,"submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"completedAt" TIMESTAMP(3),"cancelledAt" TIMESTAMP(3),CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "WorkflowStepInstance" ("id" TEXT NOT NULL,"instanceId" TEXT NOT NULL,"stepId" TEXT NOT NULL,"sequence" INTEGER NOT NULL,"status" "WorkflowStepStatus" NOT NULL DEFAULT 'WAITING',"approverUserIds" TEXT[],"approvals" INTEGER NOT NULL DEFAULT 0,"minimumApprovals" INTEGER NOT NULL DEFAULT 1,"dueAt" TIMESTAMP(3),"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),CONSTRAINT "WorkflowStepInstance_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "WorkflowAction" ("id" TEXT NOT NULL,"instanceId" TEXT NOT NULL,"stepInstanceId" TEXT,"actorUserId" TEXT NOT NULL,"actingForUserId" TEXT,"action" "WorkflowActionType" NOT NULL,"comment" TEXT,"metadata" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "WorkflowDelegation" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"delegatorUserId" TEXT NOT NULL,"delegateUserId" TEXT NOT NULL,"module" "WorkflowModule","startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,"reason" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "WorkflowDelegation_pkey" PRIMARY KEY("id"));
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowDefinition_companyId_code_version_key" ON "WorkflowDefinition"("companyId","code","version");
    CREATE INDEX IF NOT EXISTS "WorkflowDefinition_companyId_module_status_idx" ON "WorkflowDefinition"("companyId","module","status");
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowStep_definitionId_sequence_key" ON "WorkflowStep"("definitionId","sequence");
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowInstance_companyId_subjectType_subjectId_key" ON "WorkflowInstance"("companyId","subjectType","subjectId");
    CREATE INDEX IF NOT EXISTS "WorkflowInstance_companyId_status_submittedAt_idx" ON "WorkflowInstance"("companyId","status","submittedAt");
    CREATE INDEX IF NOT EXISTS "WorkflowInstance_requesterUserId_status_idx" ON "WorkflowInstance"("requesterUserId","status");
    CREATE UNIQUE INDEX IF NOT EXISTS "WorkflowStepInstance_instanceId_sequence_key" ON "WorkflowStepInstance"("instanceId","sequence");
    CREATE INDEX IF NOT EXISTS "WorkflowStepInstance_status_dueAt_idx" ON "WorkflowStepInstance"("status","dueAt");
    CREATE INDEX IF NOT EXISTS "WorkflowAction_instanceId_createdAt_idx" ON "WorkflowAction"("instanceId","createdAt");
    CREATE INDEX IF NOT EXISTS "WorkflowAction_actorUserId_createdAt_idx" ON "WorkflowAction"("actorUserId","createdAt");
    CREATE INDEX IF NOT EXISTS "WorkflowDelegation_companyId_delegatorUserId_startsAt_endsAt_idx" ON "WorkflowDelegation"("companyId","delegatorUserId","startsAt","endsAt");
    CREATE INDEX IF NOT EXISTS "WorkflowDelegation_companyId_delegateUserId_startsAt_endsAt_idx" ON "WorkflowDelegation"("companyId","delegateUserId","startsAt","endsAt");
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationChannel') THEN CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL','PUSH'); END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='NotificationDeliveryStatus') THEN CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING','SENT','FAILED','SKIPPED'); END IF; END $$;
    CREATE TABLE IF NOT EXISTS "NotificationTemplate" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"eventKey" TEXT NOT NULL,"channel" "NotificationChannel" NOT NULL,"subject" TEXT,"body" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "NotificationPreference" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"eventKey" TEXT NOT NULL,"channel" "NotificationChannel" NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT true,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "Notification" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"eventKey" TEXT NOT NULL,"title" TEXT NOT NULL,"body" TEXT NOT NULL,"entityType" TEXT,"entityId" TEXT,"actionUrl" TEXT,"readAt" TIMESTAMP(3),"expiresAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Notification_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "NotificationDelivery" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"notificationId" TEXT NOT NULL,"channel" "NotificationChannel" NOT NULL,"status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',"idempotencyKey" TEXT NOT NULL,"attemptCount" INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3),"providerId" TEXT,"lastError" TEXT,"sentAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY("id"));
    CREATE TABLE IF NOT EXISTS "PushDevice" ("id" TEXT NOT NULL,"companyId" TEXT NOT NULL,"userId" TEXT NOT NULL,"tokenHash" TEXT NOT NULL,"token" TEXT NOT NULL,"platform" TEXT NOT NULL DEFAULT 'ANDROID',"deviceName" TEXT,"active" BOOLEAN NOT NULL DEFAULT true,"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PushDevice_pkey" PRIMARY KEY("id"));
    CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_companyId_eventKey_channel_key" ON "NotificationTemplate"("companyId","eventKey","channel");
    CREATE INDEX IF NOT EXISTS "NotificationTemplate_companyId_active_idx" ON "NotificationTemplate"("companyId","active");
    CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_eventKey_channel_key" ON "NotificationPreference"("userId","eventKey","channel");
    CREATE INDEX IF NOT EXISTS "Notification_companyId_userId_readAt_createdAt_idx" ON "Notification"("companyId","userId","readAt","createdAt");
    CREATE INDEX IF NOT EXISTS "Notification_expiresAt_idx" ON "Notification"("expiresAt");
    CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");
    CREATE INDEX IF NOT EXISTS "NotificationDelivery_companyId_status_nextAttemptAt_idx" ON "NotificationDelivery"("companyId","status","nextAttemptAt");
    CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_tokenHash_key" ON "PushDevice"("tokenHash");
    CREATE INDEX IF NOT EXISTS "PushDevice_companyId_userId_active_idx" ON "PushDevice"("companyId","userId","active");
  `);
  await constraint('WorkflowDefinition_companyId_fkey','ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('WorkflowStep_definitionId_fkey','ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_definitionId_fkey" FOREIGN KEY("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('WorkflowInstance_companyId_fkey','ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('WorkflowInstance_definitionId_fkey','ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE');
  await constraint('WorkflowStepInstance_instanceId_fkey','ALTER TABLE "WorkflowStepInstance" ADD CONSTRAINT "WorkflowStepInstance_instanceId_fkey" FOREIGN KEY("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('WorkflowStepInstance_stepId_fkey','ALTER TABLE "WorkflowStepInstance" ADD CONSTRAINT "WorkflowStepInstance_stepId_fkey" FOREIGN KEY("stepId") REFERENCES "WorkflowStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE');
  await constraint('WorkflowAction_instanceId_fkey','ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_instanceId_fkey" FOREIGN KEY("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('WorkflowAction_stepInstanceId_fkey','ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_stepInstanceId_fkey" FOREIGN KEY("stepInstanceId") REFERENCES "WorkflowStepInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await constraint('WorkflowDelegation_companyId_fkey','ALTER TABLE "WorkflowDelegation" ADD CONSTRAINT "WorkflowDelegation_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('NotificationTemplate_companyId_fkey','ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('NotificationPreference_userId_fkey','ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('Notification_companyId_fkey','ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('Notification_userId_fkey','ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('NotificationDelivery_companyId_fkey','ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_companyId_fkey" FOREIGN KEY("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('NotificationDelivery_notificationId_fkey','ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await constraint('PushDevice_userId_fkey','ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  await client.query('COMMIT');
  console.log('Workspace schema repair verified.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
