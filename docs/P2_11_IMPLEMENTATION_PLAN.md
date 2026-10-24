# OrbitHR Milestone P2.11 — Implementation Plan
## Statutory Filing Lifecycle Realism, Escalation Infrastructure & Distributed Concurrency

**Document Reference:** `docs/P2_11_IMPLEMENTATION_PLAN.md`  
**Status:** DRAFT / PLANNING (UNSTARTED)  
**Target Milestone:** P2.11  
**Base Release Prerequisite:** `v1.5.9-p2.10-hardened-rc2` (Commit `e249b412735eaa79773d974af43e35f779b1cc4a`) deployed to production post-CAB approval  
**Release Boundary Rule:** P2.11 development is strictly decoupled from the frozen P2.10 release candidate. No code in P2.10 will be modified.

---

## 1. Executive Summary & Objectives

Milestone P2.11 addresses technical debt and operational observations documented during the P2.10 freeze audit (`OBS-P2.10-01` through `OBS-P2.10-04`). It enhances executive calendar accuracy, implements role-based alert escalations for unassigned obligations, and productionizes distributed background reminder workers.

---

## 2. Scope & Functional Requirements

### 2.1 Statutory Filing Status Derivation Refinement (`OBS-P2.10-01`, `OBS-P2.10-02`)
- **Problem:** Currently, `deriveObligationStatus` maps filings in `VALIDATED` or `PENDING_APPROVAL` to `FILED`, giving executives the false impression that government portal submission has taken place before Maker-Checker approval.
- **Requirement:**
  - Introduce intermediate status `IN_PROGRESS` or retain `UPCOMING`/`DUE_SOON` with an internal badge until filing reaches at least `APPROVED` or `EXPORTED`.
  - Map obligations to `PAID` when associated challans are verified paid prior to return export/filing.
  - Transition to `COMPLETED` strictly when returns are both filed and challans are reconciled.

### 2.2 Unassigned Obligation Escalation Alerts (`OBS-P2.10-04`)
- **Problem:** Reminders currently skip obligations where `assignedUserId == null`.
- **Requirement:**
  - Implement a tenant-level fallback notification mechanism targeting users with `COMPANY_ADMIN` and `PAYROLL_ADMIN` roles when obligations enter `DUE_SOON` (7-day lead time) without an explicit assignee.
  - Guarantee multi-tenant scoping so admin alerts never cross company boundaries.

### 2.3 Distributed Worker Concurrency & Productionization (`OBS-P2.10-03`)
- **Problem:** The P2.10 concurrency suite proved row-level locking (`FOR UPDATE SKIP LOCKED`) in test isolation, but worker execution in production requires a scheduled daemon runner.
- **Requirement:**
  - Integrate the PostgreSQL-backed atomic claim pattern into a persistent background scheduler daemon.
  - Ensure graceful handling of worker crashes, lock timeouts, and exponential backoff.

---

## 3. Dependencies & Prerequisites

1. **Production P2.10 Baseline:** Successful execution of CAB-approved production release of `v1.5.9-p2.10-hardened-rc2` with Migrations #31 and #32 active.
2. **Database Schema:**
   - Evaluated as additive DDL. If `ComplianceObligationStatus` enum requires additions (`IN_PROGRESS`), Migration #33 will be created with backward-compatible defaults.
3. **IAM & Services:** No new AWS IAM roles or external third-party services required; utilizes existing PostgreSQL and SES pipelines.

---

## 4. Modules & Files Affected

| Subsystem / Layer | File Path | Nature of Change |
| :--- | :--- | :--- |
| **Status Engine** | `server/v1/compliance/calendar/calendarSync.ts` | Refactor `deriveObligationStatus` logic |
| **Reminder Worker** | `server/v1/compliance/calendar/reminderService.ts` | Add admin escalation fallback for unassigned obligations |
| **Scheduler Daemon** | `server/v1/compliance/calendar/workerDaemon.ts` | Production runner implementing `claimPendingObligations` |
| **Prisma Schema** | `prisma/schema.prisma` | Add Migration #33 (if status enum additions are needed) |
| **Frontend Calendar UI** | `src/pages/ComplianceCalendarPage.tsx` | Add badge renderers for `IN_PROGRESS` and `PAID` states |
| **Obligation Modal** | `src/components/compliance/ObligationDetailModal.tsx` | Display Maker-Checker stage and payment reconciliation state |

---

## 5. Testing & Validation Strategy

1. **Unit Test Matrix:**
   - Exhaustive tests for `deriveObligationStatus` covering all statutory filing state permutations (`DRAFT`, `VALIDATED`, `PENDING_APPROVAL`, `APPROVED`, `EXPORTED`, `REJECTED`).
2. **Tenant Isolation Verification:**
   - Extend `server/v1/tenantIsolation.test.ts` to assert that fallback escalation notifications are strictly contained within `companyId`.
3. **Distributed Worker Stress Tests:**
   - Extend `reminderPostgresConcurrency.test.ts` to simulate worker process termination during lock hold, verifying that orphaned locks are reclaimed after expiry.
4. **End-to-End Workflow Tests:**
   - Full lifecycle test: Statutory filing creation -> Checker approval -> Challan payment -> Calendar status auto-progression.

---

## 6. Acceptance Criteria

- [ ] **AC-1 (Filing Fidelity):** Filings in `VALIDATED` or `PENDING_APPROVAL` never display as `FILED` on any calendar view.
- [ ] **AC-2 (Challan Visibility):** Obligations with cleared challans display as `PAID` prior to export.
- [ ] **AC-3 (Escalation Delivery):** Unassigned obligations generate alert deliveries to all active tenant admins within the 7-day window.
- [ ] **AC-4 (Zero Duplicate Alerts):** Concurrency tests verify zero duplicate email/in-app notifications under 20 concurrent worker processes.
- [ ] **AC-5 (Strict Tenant Isolation):** 100% of escalation events resolve to the correct `companyId`.
- [ ] **AC-6 (Additive Schema):** Migration #33 is strictly additive and passes previous-release rollback compatibility testing.

---

## 7. Rollback Boundaries & Safety Isolation

- **Branching Invariant:** P2.11 development will occur on a new branch `feature/p2.11-statutory-lifecycle` branched from `main` **only after** P2.10 production release is verified and tagged.
- **Candidate Immutability:** Candidate `v1.5.9-p2.10-hardened-rc2` at `e249b412735eaa79773d974af43e35f779b1cc4a` remains permanently frozen and will not receive any further commits.
- **Schema Safety:** Additive migrations ensure that rolling back the P2.11 application binary to P2.10 leaves the database intact and fully operational.
