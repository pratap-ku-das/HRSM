# OrbitHR P2.7-C Release Verification & Audit Report
**Milestone:** P2.7-C — ESIC Monthly Compliance Filing + Challan Reconciliation  
**Date:** 2026-10-04  
**Release Tag:** `v1.5.6-p2.7c-freeze`  
**Baseline Release:** `v1.5.5-p2.7b-freeze` (`9db602eff150f9b0ac01eb846ec5d7a7f580b589`)  

---

## 1. Executive Summary & Verification Matrix

| Area | Contract Mandate | Verification Result | Status |
|---|---|---|:---:|
| **Baseline Release** | `v1.5.5-p2.7b-freeze` (`9db602e...`) | Verified frozen baseline intact | ✅ PASS |
| **Migration Sequence** | Migration #28 (`20261004210000_p2_7c_esic_compliance`) | Exactly 1 additive migration, 28 total | ✅ PASS |
| **Historical Migrations** | Byte-for-byte unchanged (Migrations 1–27) | `git diff 9db602e... prisma/migrations/` empty for 1–27 | ✅ PASS |
| **Prisma Engine** | Validate & Generate | Passed with exit code 0 | ✅ PASS |
| **Server TypeScript** | Clean compile (`tsconfig.server.json`) | 0 errors, exit code 0 | ✅ PASS |
| **Client Production Build** | Clean build (`prisma generate && tsc -b && vite build`) | Built in 14.30s, 0 errors | ✅ PASS |
| **Test Suites** | 37 suites (36 baseline + 1 new) | 37 / 37 passed | ✅ PASS |
| **Test Regression Count** | 284 baseline tests passing | 284 / 284 baseline tests intact | ✅ PASS |
| **New P2.7-C Tests** | Comprehensive test coverage (Vectors 1–35) | 29 / 29 tests passed | ✅ PASS |
| **Total Test Count** | 313 tests passing | 313 / 313 passing | ✅ PASS |

---

## 2. Files Changed

### Modified Files (6)
1. `prisma/schema.prisma` — Added `snapshotLastWorkingDay` on `StatutoryFilingItem`, `EsicChallanStatus` enum, and `EsicChallan` model with relations.
2. `server/v1/compliance/types.ts` — Added `CPRN_REGEX`, `CreateEsicChallanSchema`, `UpdateEsicChallanSchema`, `EsicBulkItem`, and `EsicDiagnostic` types.
3. `server/v1/compliance/snapshotEngine.ts` — Captured `snapshotLastWorkingDay` from Employee record into immutable snapshot and included in canonical checksum.
4. `server/v1/compliance/routes.ts` — Added ESIC diagnostics route, 6-column bulk file export, and 4 ESIC challan lifecycle endpoints with Segregation of Duties.
5. `src/services/api.ts` — Added `downloadEsicFile`, `getEsicChallans`, `getEsicChallan`, `createEsicChallan`, `updateEsicChallan`.
6. `src/pages/payroll/PayrollEnginePage.tsx` — Added `'esicCompliance'` tab navigation and rendered `EsicComplianceTab`.

### Newly Added Files (4)
1. `prisma/migrations/20261004210000_p2_7c_esic_compliance/migration.sql` — Additive schema migration #28.
2. `server/v1/compliance/esicEngine.ts` — 16-row wage classification matrix, Rule 52 average daily wage calculation, event-first hierarchical reason code determination, pre-upload diagnostics (`ESI-DIAG-00` to `ESI-DIAG-08`), 6-column bulk return generator with CRLF & SHA-256 hash, and challan totals calculation.
3. `server/v1/esicCompliance.test.ts` — 29 automated tests verifying all statutory rules, edge cases, lifecycle transitions, and reconciliation invariants.
4. `src/pages/payroll/EsicComplianceTab.tsx` — Enterprise UI tab for ESIC return review, diagnostics panel, maker submission, checker approval, export, and challan reconciliation.

---

## 3. Database Implementation & Migration #28

- **Consolidated Additive Migration:** `20261004210000_p2_7c_esic_compliance`
- **Additive Table:** `EsicChallan` with `statutoryFilingId` referencing `StatutoryFiling(id)` (`ON DELETE RESTRICT`) and `companyId` referencing `Company(id)` (`ON DELETE RESTRICT`).
- **Nullable Unique CPRN:** `cprnNumber VARCHAR(14) UNIQUE` — nullable until assigned, unique across system once entered.
- **Derived Period:** `challanPeriodYear` and `challanPeriodMonth` derived directly from authoritative statutory filing.
- **Immutable Snapshot Column:** `snapshotLastWorkingDay DATE` on `StatutoryFilingItem` preserves separation date immutably upon filing creation.

---

## 4. Statutory Rule Verification & Mathematical Invariants

### 1. 16-Row Wage Classification Matrix (Section 2(22))
- **INCLUDED Components:** `BASIC`, `DA`, `SPECIAL_ALLOWANCE`, `OVERTIME`, `INCENTIVE`, `COMMISSION`, `ARREARS`.
- **EXCLUDED Components:** `HRA`, `CONVEYANCE`, `BONUS` (statutory annual/festive paid at intervals > 2 months), `EX_GRATIA`, `REIMBURSEMENT`, `MEDICAL_REIMBURSEMENT`, `LEAVE_ENCASHMENT` (separation/retirement), `GRATUITY`, `NOTICE_PAY`.
- **MANUAL_REVIEW / Block:** Any unmapped custom salary component triggers `ESI-DIAG-06` blocking statutory export until explicitly resolved.

### 2. Rule 52: Daily Average Wage ₹176 Exemption
- **Formula:** $\text{averageDailyWage} = \frac{\text{grossWages}}{\text{payableDays}}$ when $\text{payableDays} > 0$.
- **Zero-Day Invariant:** If $\text{payableDays} \le 0$, $\text{averageDailyWage} = \text{NOT\_APPLICABLE}$ (never 0, preventing accidental exemption).
- **Exemption Rule:**
  - If $\text{averageDailyWage} \le 176$: Employee ESIC Share $= 0$, Employer Share $= 3.25\%$.
  - If $\text{averageDailyWage} > 176$: Employee ESIC Share $= 0.75\%$, Employer Share $= 3.25\%$.

### 3. Contribution-Period Continuation & Section 40(2) Accounting Invariant
- **Rule:** If employee's wages exceed ₹21,000 after start of contribution period (April 1 to September 30 or October 1 to March 31), coverage continues through the end of the contribution period.
- **Accounting Invariant:**
  $$\text{Statutory ESIC Liability} \equiv \text{Payroll EE Deduction} + \text{Payroll ER Contribution} + \text{Employer-Borne EE Share}$$
- Preserved without altering frozen payroll calculation engines.

### 4. Event-First Hierarchical Reason Code Determination
- **Hierarchy:**
  1. Deceased $\rightarrow$ Reason Code **5**, LWD: formatted `DD/MM/YYYY`.
  2. Retired $\rightarrow$ Reason Code **3**, LWD: formatted `DD/MM/YYYY`.
  3. Left Service / Resigned / Terminated with separation date in period $\rightarrow$ Reason Code **2**, LWD: formatted `DD/MM/YYYY` (takes precedence even if employee earned wages in wage month).
  4. Active employee with positive days/wages $\rightarrow$ Reason Code **0**, LWD: empty `""`.
  5. Unpaid leave / Absent (0 days, 0 wages) $\rightarrow$ Reason Code **1**, LWD: empty `""`.
  6. Ambiguous / Missing LWD snapshot $\rightarrow$ `reasonCode: null` (triggers `ESI-DIAG-08`, blocks export).

### 5. PwD Boundary Handling
- Standard certified ceiling strictly bounded at ₹21,000.
- Employees with gross wages between ₹21,001 and ₹25,000 flagged with `ESI-DIAG-05` requiring manual review and verification of disability certificate.

---

## 5. ESIC Bulk Upload 6-Column Export

- **File Format:** CSV (`.csv`) with standard CRLF (`\r\n`) line endings.
- **Columns (Deterministic 6-Column Specification):**
  1. IP Number (10 numeric digits)
  2. IP Name (Sanitized: uppercase, `[A-Z. ]` only, max 50 chars)
  3. No. of Days for which wages paid (Integer, 0–31)
  4. Total Monthly Wages (Integer, rounded to nearest rupee)
  5. Reason Code (Integer: 0–5)
  6. Last Working Day (`DD/MM/YYYY` if Reason Code 2, 3, or 5; empty otherwise)
- **Source of Truth:** Generated exclusively from locked `StatutoryFilingItem` snapshots. Post-lock modifications to `Employee.lastWorkingDay` do not mutate exported files.
- **Integrity Checksum:** SHA-256 computed across canonical payload and returned in `X-ESIC-Checksum` header.

---

## 6. Pre-Upload Statutory Diagnostics Suite

Deterministic pre-upload validation implemented via `runEsicDiagnostics`:
- **ESI-DIAG-00:** Missing 17-digit ESI Registration Number on CompanySettings.
- **ESI-DIAG-01:** Covered employee missing mandatory 10-digit ESIC IP number.
- **ESI-DIAG-02:** Invalid ESIC IP number format (not 10 numeric digits).
- **ESI-DIAG-03:** Invalid IP Name (contains disallowed special characters).
- **ESI-DIAG-04:** Invalid Payable Days ($< 0$ or $> 31$).
- **ESI-DIAG-05:** Potential PwD / Special ceiling manual review (₹21,001–₹25,000).
- **ESI-DIAG-06:** Unmapped custom salary component in gross wages (export blocking).
- **ESI-DIAG-07:** Rule 52 exemption violation (employee share deducted when average daily wage $\le ₹176$).
- **ESI-DIAG-08:** Ambiguous reason code or missing Last Working Day snapshot.

---

## 7. Security, RBAC & Maker-Checker

- **Tenant Isolation:** Enforced on every database query via authenticated `companyId`. Cross-tenant access returns `404 Not Found`.
- **Maker-Checker Segregation of Duties:**
  - Maker who created the filing cannot approve it (`403 FORBIDDEN: MAKER_CANNOT_APPROVE`).
  - Maker who created the challan cannot reconcile it (`403 FORBIDDEN: MAKER_CANNOT_RECONCILE`).
- **Challan State Machine:**
  `CHALLAN_GENERATED` $\rightarrow$ `PAYMENT_INITIATED` $\rightarrow$ `PAID` $\rightarrow$ `RECONCILED` / `CANCELLED`.
  - Disallows skipping states.
  - Disallows cancelling a challan that is already `PAID` or `RECONCILED`.
  - Enforces 14-digit CPRN format (`/^[0-9]{14}$/`) and system-wide uniqueness.

---

## 8. Rollback Procedure

If rollback of P2.7-C is ever required:
1. Revert Git tag `v1.5.6-p2.7c-freeze` and reset HEAD to `9db602eff150f9b0ac01eb846ec5d7a7f580b589`.
2. Drop table `EsicChallan` and enum `EsicChallanStatus`, and remove `snapshotLastWorkingDay` column from `StatutoryFilingItem`:
   ```sql
   DROP TABLE IF EXISTS "EsicChallan";
   DROP TYPE IF EXISTS "EsicChallanStatus";
   ALTER TABLE "StatutoryFilingItem" DROP COLUMN IF EXISTS "snapshotLastWorkingDay";
   ```
3. Remove migration record `20261004210000_p2_7c_esic_compliance` from `_prisma_migrations`.
4. Re-generate Prisma Client (`npx prisma generate`).

---

## 9. Known Limitations & Explicit Exclusions

- **TDS 24Q / PT / LWF:** Reserved for upcoming compliance milestones.
- **Direct Portal Submission:** No web scraping, automated CAPTCHA bypassing, or uncertified direct portal gateway submission. Compliant 6-column return files are generated for authorized upload by compliance officers on the official ESIC portal.
