CREATE TYPE "WorkflowModule" AS ENUM ('LEAVE', 'EXPENSE', 'ATTENDANCE_CORRECTION', 'WFH', 'ON_DUTY', 'BUSINESS_TRAVEL', 'OVERTIME', 'SALARY_REVISION', 'PAYROLL', 'DOCUMENT', 'ADVANCE', 'GENERIC');
CREATE TYPE "WorkflowDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');
CREATE TYPE "WorkflowStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
CREATE TYPE "WorkflowApproverType" AS ENUM ('USER', 'ROLE', 'REPORTING_MANAGER', 'DEPARTMENT_HEAD', 'FINANCE');
CREATE TYPE "WorkflowActionType" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT', 'COMMENT', 'DELEGATE', 'CANCEL', 'WITHDRAW');

ALTER TABLE "LeaveRequest" ADD COLUMN "approvedById" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "ExpenseClaim" ADD COLUMN "approvedById" TEXT, ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE TABLE "WorkflowDefinition" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "module" "WorkflowModule" NOT NULL,
  "name" TEXT NOT NULL, "code" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "status" "WorkflowDefinitionStatus" NOT NULL DEFAULT 'DRAFT', "criteria" JSONB,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "approverType" "WorkflowApproverType" NOT NULL, "approverReference" TEXT, "minimumApprovals" INTEGER NOT NULL DEFAULT 1,
  "slaHours" INTEGER, "allowDelegation" BOOLEAN NOT NULL DEFAULT true, "conditions" JSONB,
  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkflowInstance" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "module" "WorkflowModule" NOT NULL,
  "subjectType" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "requesterUserId" TEXT NOT NULL,
  "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'PENDING', "currentSequence" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL, "summary" TEXT, "payload" JSONB, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkflowStepInstance" (
  "id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "stepId" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "status" "WorkflowStepStatus" NOT NULL DEFAULT 'WAITING', "approverUserIds" TEXT[], "approvals" INTEGER NOT NULL DEFAULT 0,
  "minimumApprovals" INTEGER NOT NULL DEFAULT 1, "dueAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  CONSTRAINT "WorkflowStepInstance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkflowAction" (
  "id" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "stepInstanceId" TEXT, "actorUserId" TEXT NOT NULL,
  "actingForUserId" TEXT, "action" "WorkflowActionType" NOT NULL, "comment" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkflowAction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WorkflowDelegation" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "delegatorUserId" TEXT NOT NULL, "delegateUserId" TEXT NOT NULL,
  "module" "WorkflowModule", "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowDelegation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowDefinition_companyId_code_version_key" ON "WorkflowDefinition"("companyId", "code", "version");
CREATE INDEX "WorkflowDefinition_companyId_module_status_idx" ON "WorkflowDefinition"("companyId", "module", "status");
CREATE UNIQUE INDEX "WorkflowStep_definitionId_sequence_key" ON "WorkflowStep"("definitionId", "sequence");
CREATE UNIQUE INDEX "WorkflowInstance_companyId_subjectType_subjectId_key" ON "WorkflowInstance"("companyId", "subjectType", "subjectId");
CREATE INDEX "WorkflowInstance_companyId_status_submittedAt_idx" ON "WorkflowInstance"("companyId", "status", "submittedAt");
CREATE INDEX "WorkflowInstance_requesterUserId_status_idx" ON "WorkflowInstance"("requesterUserId", "status");
CREATE UNIQUE INDEX "WorkflowStepInstance_instanceId_sequence_key" ON "WorkflowStepInstance"("instanceId", "sequence");
CREATE INDEX "WorkflowStepInstance_status_dueAt_idx" ON "WorkflowStepInstance"("status", "dueAt");
CREATE INDEX "WorkflowAction_instanceId_createdAt_idx" ON "WorkflowAction"("instanceId", "createdAt");
CREATE INDEX "WorkflowAction_actorUserId_createdAt_idx" ON "WorkflowAction"("actorUserId", "createdAt");
CREATE INDEX "WorkflowDelegation_companyId_delegatorUserId_startsAt_endsAt_idx" ON "WorkflowDelegation"("companyId", "delegatorUserId", "startsAt", "endsAt");
CREATE INDEX "WorkflowDelegation_companyId_delegateUserId_startsAt_endsAt_idx" ON "WorkflowDelegation"("companyId", "delegateUserId", "startsAt", "endsAt");

ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepInstance" ADD CONSTRAINT "WorkflowStepInstance_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStepInstance" ADD CONSTRAINT "WorkflowStepInstance_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAction" ADD CONSTRAINT "WorkflowAction_stepInstanceId_fkey" FOREIGN KEY ("stepInstanceId") REFERENCES "WorkflowStepInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowDelegation" ADD CONSTRAINT "WorkflowDelegation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
