# OrbitHR P2.7-B Release Verification & Audit Report
**Milestone:** P2.7-B — EPF ECR 2.0 Automation Engine & Monthly Challan Reconciliation  
**Date:** 2026-10-04  
**Release Tag:** `v1.5.5-p2.7b-freeze`  
**Baseline Commit:** `5aabd917ee66c829dc015ceb53988486416cd7ee` (`v1.5.4-p2.7a-freeze`)  

---

## 1. Executive Summary & Verification Matrix

| Area | Contract Mandate | Verification Result | Status |
|---|---|---|:---:|
| **Baseline Release** | `v1.5.4-p2.7a-freeze` (`5aabd917...`) | Verified frozen baseline intact | ✅ PASS |
| **Migration Sequence** | Migration #27 (`20261004140000_p2_7b_epf_ecr_challan`) | Exactly 1 additive migration, 27 total | ✅ PASS |
| **Historical Migrations** | Byte-for-byte unchanged (Migrations 1–26) | `git diff 5aabd917... prisma/migrations/` empty | ✅ PASS |
| **Prisma Engine** | Validate & Generate | Passed with exit code 0 | ✅ PASS |
| **Server TypeScript** | Clean compile (`tsconfig.server.json`) | 0 errors, exit code 0 | ✅ PASS |
| **Client Production Build** | Clean build (`prisma generate && tsc -b && vite build`) | Built in 14.05s, 0 errors | ✅ PASS |
| **Test Suites** | 36 suites (35 baseline + 1 new) | 36 / 36 passed | ✅ PASS |
| **Test Regression Count** | 267 baseline tests passing | 267 / 267 baseline tests intact | ✅ PASS |
| **New P2.7-B Tests** | Comprehensive test coverage (Rules A–AI) | 17 / 17 tests passed | ✅ PASS |
| **Total Test Count** | 284 tests passing | 284 / 284 passing | ✅ PASS |

---

## 2. Master Filing Architecture & Schema Changes

### Single Master Statutory Authority
- Confirmed: **No** `EpfEcrFiling` model created.
- Confirmed: **No** `EpfFilingStatus` enum created.
- `StatutoryFiling` (with `domain: EPF_ECR`) remains the sole authority with deterministic lifecycle:
  `DRAFT` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `LOCKED` → `EXPORTED`.

### EpfChallan Model & Relations
- Created `EpfChallanStatus` enum: `CHALLAN_GENERATED`, `PAYMENT_INITIATED`, `PAID`, `RECONCILED`, `CANCELLED`.
- Created `EpfChallan` model with:
  - `id: String @id @default(cuid())`
  - `companyId: String` (tenant-scoped)
  - `statutoryFilingId: String` (**mandatory**, non-nullable)
  - `statutoryFiling: StatutoryFiling` relation with `onDelete: Restrict` (prevents orphan records)
  - `trrnNumber: String? @unique` (nullable pre-portal, unique across system)
  - Exact monetary representation preserved using Float/whole-rupee financial rounding according to Indian statutory rules:
    - `ac1EeShare`, `ac1ErShare`, `ac2AdminCharges`, `ac10EpsShare`, `ac21EdliShare`, `ac22AdminCharges`, `totalAmount`
  - Lifecycle timestamps & tracking fields: `status`, `paymentMethod`, `paymentReference`, `paymentDate`, `paidAt`, `reconciledAt`, `cancelledAt`, `cancellationReason`, `metadata`.

---

## 3. Statutory Rule Verification & Mathematical Invariants

### 1. Age-58 EPS Attainment Rule
- **Pre-month (age 58 on or before 1st of month):**
  - Member reaches 58 prior to wage month.
  - EPS Contribution ($A/c 10$) = ₹0.
  - Full employer contribution (12% of EPF wages) remitted to $A/c 1$.
- **Mid-month attainment:**
  - Proration calculated using exact contributory days up to the date of turning 58:
    $$\text{Contributory Days} = \min(D_{58} - 1, \text{Days in Month} - \text{NCP})$$
    $$\text{Prorated EPS Wages} = \text{round}\left(\frac{\min(\text{EPF Wages}, 15000) \times \text{Contributory Days}}{\text{Days in Month}}\right)$$
    $$A/c 10 = \text{round}(\text{Prorated EPS Wages} \times 8.33\%)$$
    $$A/c 1 = \text{round}(\text{EPF Wages} \times 12\%) - A/c 10$$
  - Invariant strictly maintained: $A/c 1 + A/c 10 \equiv \text{Employer PF (12\%)}$.
- **Post-month attainment:**
  - Normal EPS calculation applied ($8.33\%$ up to ₹1,250 cap).

### 2. Non-Contributory Period (NCP) Calculation
- Formula enforced:
  $$\text{ncpDays} = \min(\text{daysInMonth}, \max(0, \lfloor\text{unpaidDays}\rfloor))$$
- Never uses `Math.round` or `Math.ceil`.
- If employee has zero payable days (`payableDays <= 0`), $\text{ncpDays} = \text{daysInMonth}$.

### 3. SBI Challan 5-Account Reconciliation
- **Account 1 (EPF Contribution):** $\sum (\text{EE PF Share} + \text{ER EPF Share})$
- **Account 2 (EPF Admin Charges):** $\max(₹500, \text{round}(\sum \text{EPF Wages} \times 0.5\%))$
- **Account 10 (EPS Contribution):** $\sum \text{ER EPS Share}$
- **Account 21 (EDLI Contribution):** $\text{round}(\sum \text{EDLI Wages} \times 0.5\%)$
- **Account 22 (EDLI Admin Charges):** Configured value, default ₹0.
- **Total Challan Amount:** $A/c 1 + A/c 2 + A/c 10 + A/c 21 + A/c 22$.

---

## 4. ECR 2.0 11-Column Flat-File Export

- Delimiter: `#~#`.
- Header: None (clean, deterministic flat text).
- Newline: `\r\n` (CRLF) deterministic serialization.
- Columns (Strict 11-column order):
  1. UAN (12 digits)
  2. Member Name (Sanitized: uppercase, `[A-Z. ]` only, max 80 chars)
  3. Gross Wages (Integer)
  4. EPF Wages (Integer)
  5. EPS Wages (Integer)
  6. EDLI Wages (Integer)
  7. EE Share Remitted (Integer)
  8. EPS Remitted (Integer)
  9. ER EPF Share Remitted (Integer)
  10. NCP Days (Integer)
  11. Refund of Advances (Always 0)
- Immutability: Generated exclusively from locked `StatutoryFilingItem` snapshots. Live salary or attendance records are never re-queried during export.
- Checksum: SHA-256 computed and persisted on export, returned in `X-ECR-Checksum` and `X-ECR-Filename` headers.

---

## 5. Pre-Upload Statutory Diagnostics

Deterministic pre-upload validation implemented via `runEpfDiagnostics`:
- **ECR-DIAG-00:** Missing PF Establishment Code on company profile.
- **ECR-DIAG-01:** Missing UAN (Un-assigned employee in EPF filing).
- **ECR-DIAG-02:** Invalid UAN (Not 12 digits or starts with 0).
- **ECR-DIAG-03:** Invalid Member Name (Symbols, non-alphabetic characters).
- **ECR-DIAG-04:** Gross Wages < EPF Wages.
- **ECR-DIAG-05:** EPS Wage Cap Violation (> ₹15,000 statutory ceiling).
- **ECR-DIAG-06:** EPS Remittance Exceeds Cap (> ₹1,250 monthly cap).
- **ECR-DIAG-07:** Age-58 EPS Attainment Violation ($A/c 10 > 0$ when member reached 58 prior to wage month).
- **ECR-DIAG-08:** Invalid NCP Days ($< 0$ or $> \text{daysInMonth}$).
- **ECR-DIAG-09:** EE / ER Mathematical Reconciliation Failure ($A/c 1 + A/c 10 \ne \text{EE Share}$).
- **ECR-DIAG-10:** Fractional Statutory Remittance (Non-integer monetary values).

---

## 6. Security, RBAC & Maker-Checker

- **Tenant Isolation:**
  - All challan and filing queries enforce `companyId` matching via transactions.
  - Cross-company challan generation or filing linking rejected with `404 Not Found` or `400 Bad Request`.
  - Cross-domain filings (e.g., trying to generate an EPF challan from a `TDS_24Q` or `ESIC` filing) rejected with `400 Bad Request`.
- **Maker-Checker Enforcement:**
  - The maker (`createdBy`) who created the filing is strictly forbidden from approving it (`403 Forbidden: Maker cannot approve their own filing`).
  - Approval requires distinct user with `compliance.approve` permission.
- **Challan State Machine:**
  - Disallows skipping states: `CHALLAN_GENERATED` cannot jump straight to `RECONCILED` without being `PAID`.
  - Disallows illegal rollbacks: `PAID` cannot regress to `PAYMENT_INITIATED`.
  - Disallows duplicate active challans for the same `statutoryFilingId`.
  - TRRN numbers are validated against official format (`[0-9]{13,16}`) and guaranteed unique across system.

---

## 7. Automated Test Suite Breakdown

All 36 test suites and 284 tests passed:
- `server/v1/epfCompliance.test.ts` (17 tests):
  1. `[A, B, C] Maker-checker: maker cannot approve their own filing`
  2. `[B] Permissions: user without compliance.approve cannot approve`
  3. `[D] Full filing lifecycle: DRAFT -> VALIDATED -> PENDING_APPROVAL -> APPROVED -> LOCKED`
  4. `[D, AE] Cannot export unless LOCKED; export transitions to EXPORTED and produces reproducible SHA-256`
  5. `[F, G] ECR 2.0 flat file output adheres to 11 columns separated by #~# with CRLF line endings`
  6. `[H, I] Member name sanitization and UAN validation diagnostics`
  7. `[J] Age-58 rule: turning 58 before wage month has zero EPS share`
  8. `[K] Age-58 rule: turning 58 mid-month prorates EPS by contributory days`
  9. `[L] Age-58 rule: turning 58 after wage month has normal EPS`
  10. `[M] EPS cap: wages over 15000 capped at 15000 and remittance capped at 1250`
  11. `[N, O] NCP days: floor behavior and zero-payable day handling`
  12. `[P, Q, R, S, T, U] 5-Account Challan calculation and reconciliation`
  13. `[Q] Account 2 admin charges respect minimum threshold of 500 INR`
  14. `[Z] Cross-domain rejection: EpfChallan cannot reference a non-EPF filing`
  15. `[AA] Cross-company rejection: EpfChallan cannot reference filing of another tenant`
  16. `[V, W] TRRN handling: nullable initially, valid and unique when supplied`
  17. `[AF, AG, AH] Payment state machine: disallows illegal state transitions`

---

## 8. Rollback Procedure
If rollback of P2.7-B is ever required:
1. Revert Git tag `v1.5.5-p2.7b-freeze` and reset HEAD to `5aabd917ee66c829dc015ceb53988486416cd7ee`.
2. Drop table `EpfChallan` and enum `EpfChallanStatus`:
   ```sql
   DROP TABLE IF EXISTS "EpfChallan";
   DROP TYPE IF EXISTS "EpfChallanStatus";
   ```
3. Remove migration record `20261004140000_p2_7b_epf_ecr_challan` from `_prisma_migrations`.
4. Re-generate Prisma Client (`npx prisma generate`).

---

## 9. Known Limitations & Explicit Exclusions
- **ESIC / TDS 24Q / PT:** Reserved for milestones P2.7-C, P2.7-D, P2.7-E.
- **EPFO Portal Automation:** No browser automation, direct government scraping, or CAPTCHA bypassing is implemented; workflow exports official ECR 2.0 flat text files for authenticated manual upload by compliance officers.
