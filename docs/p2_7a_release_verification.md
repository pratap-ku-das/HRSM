# OrbitHR — P2.7-A Release Verification Report
## Statutory Compliance Architecture: Master Data Profiles, TdsChallan & Payroll Snapshot Integrity Engine

---

**Project:** OrbitHR  
**Milestone:** P2.7-A  
**Date:** October 4, 2026  
**Status:** COMPLETE & RELEASE READY  
**Release Gate Decision:** `P2.7-A RELEASE READY`  

---

## 1. Executive Summary

Milestone **P2.7-A — Statutory Filing Data Model & Payroll Snapshot Integrity Engine** delivers the authoritative compliance foundation for OrbitHR. It establishes the temporal master data profiles, TDS challan management, and an immutable point-in-time snapshot extraction engine connecting finalized payroll runs to statutory filing records.

The implementation strictly preserves the frozen P2.1–P2.6B baseline, guarantees zero mutation of financial payroll records, introduces no premature statutory filing calculations, enforces strict Segregation of Duties (Maker-Checker), and anchors snapshot immutability with reproducible canonical SHA-256 integrity checksums.

All 257 pre-existing tests across 34 test suites pass with zero regressions, augmented by 10 comprehensive automated integration tests in `server/v1/complianceFoundation.test.ts`, totaling **267/267 passing tests across 35 test suites**. Server TypeScript compiles with 0 errors, client TypeScript passes clean, and the Vite production build succeeds.

---

## 2. Baseline Verification

| Metric | Required Baseline | Verified State | Status |
|---|---|---|:---:|
| **Base Commit** | `0257e049b7c3f7c1554bf74711c47ca167105dee` | `0257e049b7c3f7c1554bf74711c47ca167105dee` | **MATCH** |
| **Baseline Tag** | `v1.5.3-p2.6b-freeze` | `v1.5.3-p2.6b-freeze` | **MATCH** |
| **Historical Migrations** | 25 migrations (00000000000000 to 20261003170000) | 25 historical migrations untouched | **PASS** |
| **New Migration** | Dynamic Migration #26 | `20261004131500_p2_7a_compliance_foundation` | **PASS** |
| **Total Test Suites** | 34 baseline → 35 final | 35 passed | **PASS** |
| **Total Tests** | 257 baseline → 267 final | 267 passed | **PASS** |
| **Server TypeScript** | 0 errors | Clean (`tsconfig.server.json`) | **PASS** |
| **Client Build** | Vite production build clean | Clean (14.13s) | **PASS** |
| **Prisma Validation** | Valid schema | Validated (`prisma validate`) | **PASS** |

---

## 3. Scope Boundary Enforcement

Milestone P2.7-A strictly implemented the foundational data architecture without premature feature leakage:

| Domain / Capability | P2.7-A Scope Status | Target Phase |
|---|:---:|:---:|
| `EmployeeStatutoryProfile` (temporal history) | **IMPLEMENTED** | P2.7-A |
| PAN format validation & `taxIdentifier` sync | **IMPLEMENTED** | P2.7-A |
| `TdsChallan` model & format validations | **IMPLEMENTED** | P2.7-A |
| `StatutoryFiling` & `StatutoryFilingItem` models | **IMPLEMENTED** | P2.7-A |
| Point-in-time Snapshot Extraction Engine | **IMPLEMENTED** | P2.7-A |
| Deterministic 6-state machine | **IMPLEMENTED** | P2.7-A |
| Segregation of Duties (Maker-Checker) | **IMPLEMENTED** | P2.7-A |
| Deterministic Canonical SHA-256 Checksum | **IMPLEMENTED** | P2.7-A |
| Payroll Reversal Guard | **IMPLEMENTED** | P2.7-A |
| Raw EPFO ECR 2.0 text file generation | **EXCLUDED** | P2.7-B |
| ESIC monthly return CSV file generation | **EXCLUDED** | P2.7-B |
| Form 24Q e-TDS text file generation | **EXCLUDED** | P2.7-C |
| State-specific PT statement generation | **EXCLUDED** | P2.7-D |
| Government portal upload / FVU execution | **EXCLUDED** | External |

---

## 4. Architectural Invariants Verified

### Invariant 1: Temporal Master Data History
- Updates to `EmployeeStatutoryProfile` transactionally close the previous active profile's `effectiveTo` and set `active = false`.
- Exactly one active profile exists for an employee at any given time.
- Supported fields: `uan`, `pfMemberId`, `esicIpNumber`, `panNumber`, `epsExempt`, `pfOptOut`, `ptState`.

### Invariant 2: Bidirectional PAN Synchronization
- Format regex: `^[A-Z]{5}[0-9]{4}[A-Z]$`.
- Input is auto-uppercased and validated.
- `Employee.taxIdentifier` is atomically synchronized with `panNumber` to maintain 100% backward compatibility with legacy payslip and PDF rendering.

### Invariant 3: Zero-Mutation Boundary on Frozen Payroll
- P2.7-A creates and updates its own compliance records (`EmployeeStatutoryProfile`, `TdsChallan`, `StatutoryFiling`, `StatutoryFilingItem`).
- P2.7-A never mutates `PayrollRun` financial totals, `PayrollLine` items, `PayrollAdjustment`, `ExpenseClaim`, or attendance source records.

### Invariant 4: Source-of-Truth Snapshot Gate
- Snapshots are strictly restricted to `PayrollRun.status IN ('LOCKED', 'PAYSLIP_GENERATED', 'PAYSLIPS_PUBLISHED', 'BANK_EXPORTED', 'PROCESSED', 'PAID')`.
- Snapshots attempted on `CALCULATED`, `DRAFT`, or `HR_REVIEW` runs are rejected with `409 PAYROLL_NOT_LOCKED`.

### Invariant 5: Segregation of Duties (SoD)
- The Maker who generates a snapshot (`createdById`) is prohibited from approving it (`403 MAKER_CANNOT_APPROVE`).
- Approval requires a distinct Checker identity with `compliance.approve` permission.

### Invariant 6: Canonical Checksum & Permanent Locking
- Moving from `APPROVED` to `LOCKED` deterministically sorts items by `employeeId`, normalizes numbers to fixed 2-decimal string representation, formats canonical JSON, and computes SHA-256.
- The hash is permanently immutable once locked.

### Invariant 7: Payroll Reversal Guard
- Calling `POST /payroll/runs/:id/reverse` on a payroll run with an `APPROVED`, `LOCKED`, or `EXPORTED` statutory filing is blocked with `409 STATUTORY_FILING_EXISTS`.

---

## 5. Automated Test Suite Results

The new integration suite `server/v1/complianceFoundation.test.ts` passed 10/10 tests:
1. `enforces PAN format regex, uppercase normalization, and synchronizes to Employee.taxIdentifier` (PASS)
2. `prevents overlapping active profile history by closing previous active profile effectiveTo` (PASS)
3. `validates TDS challan BSR code, serial number, and computes totalAmount exactly` (PASS)
4. `strictly prohibits snapshot generation on runs in CALCULATED or DRAFT state` (PASS)
5. `snapshots point-in-time identifiers and authoritative P2.3 payroll figures from LOCKED run` (PASS)
6. `enforces deterministic progression: DRAFT -> VALIDATED -> PENDING_APPROVAL` (PASS)
7. `strictly rejects self-approval by Maker (SoD violation)` (PASS)
8. `locks approved filing and generates canonical SHA-256 checksum` (PASS)
9. `blocks payroll reversal if an approved or locked statutory filing exists` (PASS)
10. `enforces strict multi-company tenant isolation across compliance endpoints` (PASS)

---

## 6. Full Regression Audit

```text
============================================================
ORBITHR FULL REGRESSION TEST RUN (ALL 35 TEST SUITES)
============================================================
 ✓ server/v1/taxSimulator.test.ts (21 tests)
 ✓ server/v1/bankExport.test.ts (26 tests)
 ✓ server/v1/payrollCompliance.test.ts (8 tests)
 ✓ server/v1/payrollReimbursement.test.ts (16 tests)
 ✓ server/v1/expenseWorkflow.test.ts (17 tests)
 ✓ server/v1/workflowDesigner.test.ts (15 tests)
 ✓ server/v1/leaveEncashment.test.ts (10 tests)
 ✓ server/v1/recruitment.test.ts (5 tests)
 ✓ server/v1/payroll.test.ts (5 tests)
 ✓ server/v1/complianceFoundation.test.ts (10 tests) [NEW P2.7-A]
 ✓ server/v1/selfService.test.ts (5 tests)
 ✓ server/v1/settings.test.ts (6 tests)
 ✓ server/v1/workflows.test.ts (4 tests)
 ✓ server/v1/foundation.test.ts (3 tests)
 ✓ server/v1/notifications.test.ts (3 tests)
 ✓ server/v1/attendancePolicies.test.ts (3 tests)
 ✓ server/v1/mobileRelease.test.ts (1 test)
 ✓ server/v1/expensePolicyEngine.test.ts (14 tests)
 ✓ server/v1/operations.test.ts (2 tests)
 ✓ server/v1/reports.test.ts (4 tests)
 ✓ server/v1/settlementEngine.test.ts (15 tests)
 ✓ server/v1/contract.test.ts (35 tests)
 ✓ server/v1/mfa.test.ts (2 tests)
 ✓ server/v1/attendanceEngine.test.ts (4 tests)
 ✓ server/v1/pushNotifications.test.ts (1 test)
 ✓ server/v1/governance.test.ts (3 tests)
 ✓ server/v1/accessScope.test.ts (3 tests)
 ✓ server/v1/email.test.ts (4 tests)
 ✓ server/databaseUrl.test.ts (5 tests)
 ✓ server/v1/aiAssistant.test.ts (6 tests)
 ✓ src/config/workspaceAccess.test.ts (4 tests)
 ✓ server/v1/payrollEngine.test.ts (3 tests)
 ✓ server/v1/leaveAdmin.test.ts (1 test)
 ✓ server/v1/performance.test.ts (2 tests)
 ✓ server/v1/reminders.test.ts (1 test)

Total Test Suites: 35 passed (35)
Total Tests:       267 passed (267)
Regression Status: ZERO REGRESSIONS
============================================================
```

---

## 7. Migration & Rollback Runbook

### Migration Summary
- **Migration ID:** `20261004131500_p2_7a_compliance_foundation`
- **Location:** `prisma/migrations/20261004131500_p2_7a_compliance_foundation/migration.sql`
- **Target Tables Created:**
  - `EmployeeStatutoryProfile`
  - `TdsChallan`
  - `StatutoryFiling`
  - `StatutoryFilingItem`
- **Enums Created:**
  - `StatutoryFilingDomain`
  - `StatutoryFilingStatus`
  - `StatutoryFilingType`

### Rollback SQL
```sql
ALTER TABLE "StatutoryFilingItem" DROP CONSTRAINT IF EXISTS "StatutoryFilingItem_employeeId_fkey";
ALTER TABLE "StatutoryFilingItem" DROP CONSTRAINT IF EXISTS "StatutoryFilingItem_filingId_fkey";
ALTER TABLE "StatutoryFiling" DROP CONSTRAINT IF EXISTS "StatutoryFiling_payrollRunId_fkey";
ALTER TABLE "StatutoryFiling" DROP CONSTRAINT IF EXISTS "StatutoryFiling_companyId_fkey";
ALTER TABLE "TdsChallan" DROP CONSTRAINT IF EXISTS "TdsChallan_statutoryFilingId_fkey";
ALTER TABLE "TdsChallan" DROP CONSTRAINT IF EXISTS "TdsChallan_companyId_fkey";
ALTER TABLE "EmployeeStatutoryProfile" DROP CONSTRAINT IF EXISTS "EmployeeStatutoryProfile_employeeId_fkey";
ALTER TABLE "EmployeeStatutoryProfile" DROP CONSTRAINT IF EXISTS "EmployeeStatutoryProfile_companyId_fkey";

DROP TABLE IF EXISTS "StatutoryFilingItem";
DROP TABLE IF EXISTS "StatutoryFiling";
DROP TABLE IF EXISTS "TdsChallan";
DROP TABLE IF EXISTS "EmployeeStatutoryProfile";

DROP TYPE IF EXISTS "StatutoryFilingType";
DROP TYPE IF EXISTS "StatutoryFilingStatus";
DROP TYPE IF EXISTS "StatutoryFilingDomain";
```

---

## 8. Release Gate Decision

**DECISION: P2.7-A RELEASE READY**  
The foundational compliance models, temporal profiles, TDS challans, and point-in-time snapshot extraction engine have passed all migration, build, test, and security audits with zero defects.
