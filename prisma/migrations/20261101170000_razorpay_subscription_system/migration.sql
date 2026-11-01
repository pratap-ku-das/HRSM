-- AlterEnum PlanTier to add BUSINESS
ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'BUSINESS';

-- CreateEnum SubscriptionStatus
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'HALTED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'PENDING');

-- CreateEnum PaymentStatus
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateTable SubscriptionPlan
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "razorpayPlanId" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable CompanySubscription
CREATE TABLE "CompanySubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "razorpaySubscriptionId" TEXT,
    "razorpayCustomerId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable PaymentHistory
CREATE TABLE "PaymentHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayInvoiceId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "errorMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable RazorpayWebhookEvent
CREATE TABLE "RazorpayWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable SubscriptionAuditLog
CREATE TABLE "SubscriptionAuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "changedById" TEXT,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySubscription_companyId_key" ON "CompanySubscription"("companyId");
CREATE UNIQUE INDEX "CompanySubscription_razorpaySubscriptionId_key" ON "CompanySubscription"("razorpaySubscriptionId");
CREATE INDEX "CompanySubscription_companyId_idx" ON "CompanySubscription"("companyId");
CREATE INDEX "CompanySubscription_status_idx" ON "CompanySubscription"("status");
CREATE INDEX "CompanySubscription_razorpaySubscriptionId_idx" ON "CompanySubscription"("razorpaySubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentHistory_razorpayPaymentId_key" ON "PaymentHistory"("razorpayPaymentId");
CREATE INDEX "PaymentHistory_companyId_idx" ON "PaymentHistory"("companyId");
CREATE INDEX "PaymentHistory_subscriptionId_idx" ON "PaymentHistory"("subscriptionId");
CREATE INDEX "PaymentHistory_status_idx" ON "PaymentHistory"("status");
CREATE INDEX "PaymentHistory_razorpayPaymentId_idx" ON "PaymentHistory"("razorpayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "RazorpayWebhookEvent_eventId_key" ON "RazorpayWebhookEvent"("eventId");
CREATE INDEX "RazorpayWebhookEvent_eventId_idx" ON "RazorpayWebhookEvent"("eventId");
CREATE INDEX "RazorpayWebhookEvent_eventType_idx" ON "RazorpayWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "SubscriptionAuditLog_companyId_idx" ON "SubscriptionAuditLog"("companyId");
CREATE INDEX "SubscriptionAuditLog_subscriptionId_idx" ON "SubscriptionAuditLog"("subscriptionId");

-- AddForeignKey
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySubscription" ADD CONSTRAINT "CompanySubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentHistory" ADD CONSTRAINT "PaymentHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CompanySubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAuditLog" ADD CONSTRAINT "SubscriptionAuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditLog" ADD CONSTRAINT "SubscriptionAuditLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CompanySubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed exact plans
INSERT INTO "SubscriptionPlan" ("id", "code", "name", "description", "price", "currency", "billingCycle", "features", "isActive", "createdAt", "updatedAt")
VALUES 
  ('plan_starter_inr', 'STARTER', 'Starter', 'Ideal for early-stage companies and startups streamlining core people operations.', 299, 'INR', 'monthly', '["Up to 25 employees", "Employee Lifecycle & Directory", "Attendance & Leave Management", "Indian Statutory Payroll (EPF, ESI, TDS)", "Employee Self-Service Portal", "Standard Email Support"]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_growth_inr', 'GROWTH', 'Growth', 'Complete workforce administration, automation, and compliance for expanding teams.', 799, 'INR', 'monthly', '["Up to 100 employees", "Everything in Starter", "Face Recognition Attendance & Geofencing", "Multi-stage Approval Workflows", "Expense Reimbursements & Advances", "Recruitment & Applicant Tracking (ATS)", "Priority Email & Chat Support"]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_business_inr', 'BUSINESS', 'Business', 'Advanced governance, audit trails, and multi-branch management for enterprises.', 1199, 'INR', 'monthly', '["Unlimited employees", "Everything in Growth", "Full SOC-2 & Statutory Audit Logs", "Custom Multi-Level Approval Chains", "Branch & Multi-Location Cost Centers", "Performance & OKR Review Cycles", "Dedicated Account Manager & 24/7 SLA"]'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "price" = EXCLUDED."price",
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

