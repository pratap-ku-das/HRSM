# OrbitHR HRMS — Phase 6 Database Constraints & Outbox Migration Specification
> **STATUS: NOT APPLIED — FOR CAB REVIEW AND FUTURE MIGRATION PLANNING ONLY**
> **ENVIRONMENT SAFETY NOTICE**: Zero live database migrations were executed. Production and staging environments were strictly untouched.

---

## 1. Executive Summary

This document specifies the exact database schema evolutions, raw PostgreSQL migration scripts, and deployment runbooks required for:
1. **Financial Uniqueness Hardening on `LoanRepayment`**: Protecting against duplicate monthly loan deductions under concurrent payroll execution while preserving valid settlement and ad-hoc repayments.
2. **Transactional Notification Outbox Schema Enhancements**: Adding explicit worker lease ownership (`lockedBy`, `lockedAt`, `leaseExpiresAt`) and indexes to support high-throughput, non-blocking multi-worker dispatching (`FOR UPDATE SKIP LOCKED`).

All migrations in this document are **PROPOSED AND UNAPPLIED**. In Phase 6, code-level safeguards and non-blocking SQL queries (`FOR UPDATE SKIP LOCKED`) were successfully implemented and verified using the existing Prisma models (`Notification`, `NotificationDelivery`, `LoanRepayment`) on an isolated test database.

---

## 2. Financial Database Constraint Review: `LoanRepayment`

### 2.1 Creation Paths & Business Semantics

In the OrbitHR HRMS codebase, `LoanRepayment` records are created across two distinct financial workflows:

1. **Monthly Payroll Run Deduction** (`server/v1/payroll.ts` ~line 1580):
   ```typescript
   await tx.loanRepayment.create({
     data: {
       loanId: loan.id,
       payrollRunId: run.id, // Explicit Non-Null FK
       amount: deductionAmount,
       principalAmount: deductionAmount,
       interestAmount: 0,
       repaymentDate: run.periodEnd,
       status: 'COMPLETED',
       notes: `Payroll deduction for ${run.month}`,
     },
   });
   ```
   *Rule:* A specific loan must be deducted **at most once** per `payrollRunId`. If two payroll runs or racing publish calls execute simultaneously, duplicate deductions must be rejected at the database engine level.

2. **Full-and-Final Settlement Recovery** (`server/v1/payrollCompliance.ts` ~line 204):
   ```typescript
   await tx.loanRepayment.create({
     data: {
       loanId: loan.id,
       payrollRunId: null, // Legitimately NULL
       amount: balance,
       principalAmount: balance,
       interestAmount: 0,
       repaymentDate: settlementDate,
       status: 'COMPLETED',
       notes: `Settlement recovery: loan principal ${balance}`,
     },
   });
   ```
   *Rule:* Settlement recovery occurs outside the standard monthly payroll cycle. `payrollRunId` is legitimately `null`. Furthermore, an employee or company may perform multiple voluntary or off-cycle partial repayments over time where `payrollRunId` is also `null`.

---

### 2.2 Prisma `@@unique` vs PostgreSQL Partial Unique Index

A critical architectural pitfall in Prisma ORM is that Prisma's schema definition language does not support conditional / partial indexes (i.e. `WHERE ... IS NOT NULL`).

#### The Failure Modes of Naive Prisma `@@unique([loanId, payrollRunId])`:
1. **Prisma Schema Limitations**: Adding `@@unique([loanId, payrollRunId])` to `schema.prisma` causes Prisma to generate:
   ```sql
   CREATE UNIQUE INDEX "LoanRepayment_loanId_payrollRunId_key" ON "LoanRepayment"("loanId", "payrollRunId");
   ```
2. **PostgreSQL Standard SQL NULL Behavior**:
   - In standard PostgreSQL (with default `NULLS DISTINCT`), multiple rows with `payrollRunId = NULL` are permitted.
   - However, Prisma Client's query compiler struggles with nullable fields in composite unique constraints (e.g. `findUnique({ where: { loanId_payrollRunId: { loanId, payrollRunId: null } } })` generates invalid SQL or runtime errors).
3. **If `NULLS NOT DISTINCT` is Enforced (PG 15+)**:
   - If a unique index is created with `NULLS NOT DISTINCT`, PostgreSQL treats all `NULL` values as equal.
   - **Disaster scenario**: If an employee has two settlement repayments or voluntary off-cycle payments on the same loan, the second repayment would fail with a fatal database uniqueness violation (`23505`), breaking valid settlement processing.

#### The Architectural Solution: PostgreSQL Partial Unique Index
The correct database protection is a PostgreSQL partial unique index defined specifically with a predicate:
```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "LoanRepayment_loanId_payrollRunId_key"
ON "LoanRepayment"("loanId", "payrollRunId")
WHERE "payrollRunId" IS NOT NULL;
```
This guarantees:
- Any attempt to insert a duplicate deduction for `(loanId, payrollRunId)` fails immediately with `23505 (unique_violation)`.
- Records where `payrollRunId IS NULL` (settlements, ad-hoc repayments) are completely unconstrained by this index, allowing multiple valid off-cycle entries.

---

### 2.3 Settlement-Specific Uniqueness: The `settlementId` Proposal

To protect settlement repayments from duplicate recovery (for instance, if settlement payout is executed concurrently or recalculated), we propose adding a nullable `settlementId` foreign key / identifier to `LoanRepayment`:

```sql
ALTER TABLE "LoanRepayment" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;
```

With an accompanying partial unique index:
```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "LoanRepayment_loanId_settlementId_key"
ON "LoanRepayment"("loanId", "settlementId")
WHERE "settlementId" IS NOT NULL;
```

This prevents duplicate settlement deductions for the same settlement case while maintaining clean isolation between monthly payroll deductions and settlement recoveries.

---

### 2.4 Pre-Migration Duplicate Check Query (Synthetic / Verification)

Before creating any unique index, production and staging databases must be checked for existing duplicate rows:

```sql
-- Check for duplicate payroll loan repayments
SELECT "loanId", "payrollRunId", COUNT(*) as duplicate_count
FROM "LoanRepayment"
WHERE "payrollRunId" IS NOT NULL
GROUP BY "loanId", "payrollRunId"
HAVING COUNT(*) > 1;

-- Check for duplicate settlement repayments (if settlementId column exists)
-- SELECT "loanId", "settlementId", COUNT(*)
-- FROM "LoanRepayment"
-- WHERE "settlementId" IS NOT NULL
-- GROUP BY "loanId", "settlementId"
-- HAVING COUNT(*) > 1;
```
If duplicates exist in legacy data, a reconciliation script must resolve the duplicated amounts before applying the index.

---

### 2.5 Migration Scripts (NOT APPLIED)

#### File: `prisma/migrations/20261029000001_loan_repayment_partial_unique/migration.sql`

```sql
-- ============================================================================
-- MIGRATION: 20261029000001_loan_repayment_partial_unique
-- STATUS: NOT APPLIED — FOR CAB REVIEW ONLY
-- SAFETY: Zero-downtime, non-blocking index creation
-- ============================================================================

-- Step 1: Add optional settlementId for settlement deduction uniqueness
ALTER TABLE "LoanRepayment" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;

-- Step 2: Create Partial Unique Index for Payroll Run Deductions
-- Prevents double deductions of a loan within the same payroll run.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "LoanRepayment_loanId_payrollRunId_key"
ON "LoanRepayment"("loanId", "payrollRunId")
WHERE "payrollRunId" IS NOT NULL;

-- Step 3: Create Partial Unique Index for Settlement Deductions
-- Prevents double deductions of a loan within the same settlement case.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "LoanRepayment_loanId_settlementId_key"
ON "LoanRepayment"("loanId", "settlementId")
WHERE "settlementId" IS NOT NULL;
```

#### Rollback Script (Down Migration):
```sql
DROP INDEX CONCURRENTLY IF EXISTS "LoanRepayment_loanId_payrollRunId_key";
DROP INDEX CONCURRENTLY IF EXISTS "LoanRepayment_loanId_settlementId_key";
ALTER TABLE "LoanRepayment" DROP COLUMN IF EXISTS "settlementId";
```

---

## 3. Transactional Notification Outbox Specification

### 3.1 Dual-Write Vulnerability Audit

Prior to Phase 6, `server/v1/payroll.ts` performed:
1. `prisma.$transaction(async (tx) => { ... })` -> Updates `PayrollRun.status = 'PUBLISHED'`.
2. Post-commit notification dispatch -> Iterates active company employees and calls `pushService.sendPush(...)` directly.

**Dual-Write Flaw**:
- If the application crashes, network disconnects, or the Node process restarts immediately after step 1, the payroll is marked `PUBLISHED` in the database, but zero notifications are delivered.
- Conversely, if notifications were sent *before* commit, a database rollback would leave employees notified of a non-existent or failed payroll run.

### 3.2 Phase 6 Outbox Architecture

In Phase 6, we implemented `server/v1/notificationOutbox.ts`:
1. **Atomic Transactional Enqueue**:
   - Notifications (`Notification`) and outbox delivery records (`NotificationDelivery`) are written **inside the same database transaction** as the business event (`PayrollRun` status transition).
   - If the business transaction fails, both the financial records and the notification outbox records roll back atomically.
2. **Deterministic Idempotency Key**:
   - `idempotencyKey = ${channel}:${eventType}:${eventId}:${recipientId}` (e.g. `push:PAYROLL_PUBLISHED:run-123:emp-456`).
   - Backed by the database constraint `NotificationDelivery.idempotencyKey @unique`.
3. **Safe Non-Blocking Worker Claims (`FOR UPDATE SKIP LOCKED`)**:
   - Workers query pending/expired deliveries in batches using PostgreSQL row-level locks with `SKIP LOCKED`.
   - Competing worker processes claim strictly disjoint sets of deliveries with zero lock contention and zero duplicate dispatches.
4. **Processing Leases & Recovery**:
   - A claimed delivery has its `nextAttemptAt` advanced by `leaseDurationMs` (default: 60,000ms).
   - If a worker crashes mid-delivery, the lease expires (`nextAttemptAt <= now`), allowing any surviving worker to re-claim and retry the delivery.
5. **Bounded Exponential Backoff**:
   - Transient provider failures increment `attemptCount` and schedule `nextAttemptAt = now + min(baseDelay * 2^(attempt - 1), maxDelay)`.
   - Max attempts: 5. When exhausted, the delivery status is set to `SKIPPED` (dead-lettered) with `lastError` recorded.

---

### 3.3 Proposed Prisma Schema Enhancements (NOT APPLIED)

While the existing `Notification` and `NotificationDelivery` models in `prisma/schema.prisma` support Phase 6's operational requirements, the following additions are recommended for enhanced multi-worker observability:

```prisma
// Proposed additions to model NotificationDelivery
model NotificationDelivery {
  id             String    @id @default(uuid())
  notificationId String
  channel        String    // EMAIL, SMS, PUSH, IN_APP
  status         String    // PENDING, PROCESSING, SENT, FAILED, SKIPPED
  idempotencyKey String    @unique
  attemptCount   Int       @default(0)
  maxAttempts    Int       @default(5)
  nextAttemptAt  DateTime?
  leaseUntil     DateTime? // Explicit lease expiration
  lockedBy       String?   // Worker host/process ID claiming the lease
  lockedAt       DateTime? // Timestamp when lease was claimed
  providerId     String?
  lastError      String?
  sentAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  notification   Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@index([status, nextAttemptAt])
  @@index([notificationId])
  @@index([lockedBy, leaseUntil])
}
```

#### Migration Script: `prisma/migrations/20261029000002_outbox_worker_leases/migration.sql` (NOT APPLIED)
```sql
-- ============================================================================
-- MIGRATION: 20261029000002_outbox_worker_leases
-- STATUS: NOT APPLIED — FOR CAB REVIEW ONLY
-- ============================================================================

ALTER TABLE "NotificationDelivery"
  ADD COLUMN IF NOT EXISTS "leaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "NotificationDelivery_status_nextAttemptAt_idx"
  ON "NotificationDelivery"("status", "nextAttemptAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "NotificationDelivery_lockedBy_leaseUntil_idx"
  ON "NotificationDelivery"("lockedBy", "leaseUntil");
```

---

## 4. Production Deployment & Rollback Runbook

### Pre-Deployment Verification Gate
1. Verify database replica lag is under 1 second.
2. Confirm maintenance window or low-traffic window.
3. Run duplicate detection queries (Section 2.4).
4. Verify application pods are running image versions compatible with the new columns.

### Execution Order
1. Apply `migration 20261029000001` (Partial Unique Indexes on `LoanRepayment`).
   - Uses `CONCURRENTLY` to avoid blocking writes to `LoanRepayment`.
2. Apply `migration 20261029000002` (Outbox Worker Leases).
   - Column additions are non-blocking nullable columns.
   - Index additions use `CONCURRENTLY`.
3. Deploy new worker pods running `runOutboxWorkerCycle`.

### Rollback Plan
- Indexes can be dropped instantaneously using `DROP INDEX CONCURRENTLY`.
- Added columns (`settlementId`, `leaseUntil`, `lockedBy`, `lockedAt`) are purely additive and nullable; their presence does not break legacy application code.

---
**END OF SPECIFICATION — MIGRATIONS NOT APPLIED**
