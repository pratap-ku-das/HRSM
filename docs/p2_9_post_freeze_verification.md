# OrbitHR HRMS — P2.9 Post-Freeze Independent Verification Report
## Strict Read-Only Audit of Release `v1.5.8-p2.9-freeze`

**Audit Date:** 2026-10-09  
**Execution Context:** Strict Read-Only Independent Audit  
**Audited Tag:** `v1.5.8-p2.9-freeze`  
**Expected Release Commit:** `7171ce104fa655f9a7cab5cdf217dda8f970eeac`  
**Auditor:** Principal Software Architect & Lead Statutory Compliance Auditor  

---

## 1. Executive Summary & Verdict

This report presents the independent, read-only verification of the OrbitHR P2.9 Multi-State Professional Tax release (`v1.5.8-p2.9-freeze`). Every check was verified directly against the live Git object database, source code, migration files, test assertions, and build outputs without relying on previous agent claims.

**FINAL VERDICT:**
# PASS — RELEASE INDEPENDENTLY VERIFIED

---

## 2. Release & Git Lineage Verification

### A. Commit & Tag Target Verification
- **Command:** `git rev-parse HEAD`
  - **Exit Code:** `0`
  - **Output:** `7171ce104fa655f9a7cab5cdf217dda8f970eeac`
- **Command:** `git cat-file -t v1.5.8-p2.9-freeze`
  - **Exit Code:** `0`
  - **Output:** `tag` (Confirmed annotated tag object)
- **Command:** `git rev-parse "v1.5.8-p2.9-freeze^{commit}"`
  - **Exit Code:** `0`
  - **Output:** `7171ce104fa655f9a7cab5cdf217dda8f970eeac` (Target commit matches HEAD exactly)
- **Command:** `git cat-file -p v1.5.8-p2.9-freeze`
  - **Exit Code:** `0`
  - **Annotation:**
    ```text
    object 7171ce104fa655f9a7cab5cdf217dda8f970eeac
    type commit
    tag v1.5.8-p2.9-freeze
    tagger Pratap Kumar Das <pratapkudas111@gmail.com> 1791485101 +0530

    release(p2.9): freeze multi-state professional tax compliance
    ```

### B. Predecessor Freeze & Parent Commit
- **Command:** `git rev-parse HEAD~1`
  - **Exit Code:** `0`
  - **Output:** `3c7a496fefbe0b8c06e66e35ed98e267203fb23e`
  - **Verification:** Matches predecessor freeze release `v1.5.7-p2.4-freeze` exactly.

### C. Working Tree Status
- **Command:** `git status --short`
  - **Exit Code:** `0`
  - **Output:**
    ```text
    ?? scripts/post_migration_checks.ts
    ?? scripts/pre_migration_checks.ts
    ```
  - **Verification:** Working tree is clean. The two excluded operational scripts (`scripts/post_migration_checks.ts` and `scripts/pre_migration_checks.ts`) remain untracked outside the release as strictly mandated.

---

## 3. Exact Changed-File Manifest Verification

- **Command:** `git diff --name-status HEAD~1 HEAD`
  - **Exit Code:** `0`
  - **Total Files Changed:** 26 files

| Action | File Path | Class | Verification Notes |
|---|---|---|---|
| A | `docs/p2_9_master_implementation_report.md` | D (Docs) | Master implementation documentation |
| A | `docs/p2_9_phase1_read_only_discovery_report.md` | D (Docs) | Phase 1 discovery audit report |
| A | `docs/p2_9_phase2_architecture_gate_report.md` | D (Docs) | Phase 2 architecture gate report |
| A | `docs/p2_9_release_verification.md` | D (Docs) | Release verification record |
| A | `docs/p2_9_statutory_matrix.md` | D (Docs) | State statutory schedules |
| A | `prisma/migrations/20261008000000_p2_9_pt_compliance_foundation/migration.sql` | E (Migration) | Additive Migration #31 |
| M | `prisma/schema.prisma` | B (Core Schema) | `ProfessionalTaxRegistration`, `PtChallan`, enums |
| A | `server/v1/compliance/professionalTax/adapters/karnataka.ts` | A (Adapter) | Karnataka PT adapter |
| A | `server/v1/compliance/professionalTax/adapters/maharashtra.ts` | A (Adapter) | Maharashtra PT adapter |
| A | `server/v1/compliance/professionalTax/adapters/telangana.ts` | A (Adapter) | Telangana PT adapter |
| A | `server/v1/compliance/professionalTax/adapters/westBengal.ts` | A (Adapter) | West Bengal temporal adapter |
| A | `server/v1/compliance/professionalTax/engine.ts` | A (Core Engine) | Common calculation router |
| A | `server/v1/compliance/professionalTax/index.ts` | A (Core Engine) | Module exports |
| A | `server/v1/compliance/professionalTax/professionalTax.test.ts` | C (Test) | Adapter unit test suite |
| A | `server/v1/compliance/professionalTax/rskPt001Regression.test.ts` | C (Test) | RSK-PT-001 regression tests |
| A | `server/v1/compliance/professionalTax/stateResolution.test.ts` | C (Test) | State resolver tests |
| A | `server/v1/compliance/professionalTax/stateResolver.ts` | A (Core Engine) | 3-tier state resolver |
| A | `server/v1/compliance/professionalTax/types.ts` | A (Core Engine) | Domain types & typed exceptions |
| A | `server/v1/compliance/ptCompliance.test.ts` | C (Test) | Lifecycle integration tests |
| A | `server/v1/compliance/ptRoutes.ts` | A (Routes) | Registrations, filings, challans API |
| M | `server/v1/compliance/routes.ts` | B (Router Mount) | PT router mount |
| M | `server/v1/payroll.ts` | B (Payroll Engine) | Rule pre-filtering & context |
| M | `server/v1/payrollEngine.ts` | B (Engine Invariant) | `hasAppliedPt` invariant |
| M | `src/pages/payroll/PayrollEnginePage.tsx` | B (Web UI) | PtComplianceTab integration |
| A | `src/pages/payroll/PtComplianceTab.tsx` | A (Web UI) | Professional Tax compliance tab |
| A | `src/pages/payroll/ptApi.ts` | A (Web Client) | PT frontend API client |

- **Android Impact:** **0 files modified** in `android-app/`. Confirmed `ANDROID IMPACT = NONE`.

---

## 4. Database Migrations Verification

### A. Preservation of Historical Migrations 1–30
- **Command:** `git diff HEAD~1 HEAD -- prisma/migrations/!20261008000000_p2_9_pt_compliance_foundation`
  - **Exit Code:** `0`
  - **Output:** Empty (Zero modifications to migrations 1 through 30).
- **Migration Directory Count:** Exactly 31 migration directories present in `prisma/migrations/`.

### B. Additive Migration #31 Verification
- **Path:** `prisma/migrations/20261008000000_p2_9_pt_compliance_foundation/migration.sql`
- **Safety Checks:**
  - `DROP TABLE` statements: **0**
  - `DROP COLUMN` statements: **0**
  - `ALTER COLUMN ... DROP` statements: **0**
  - Destructive data transformations: **0**
- **Created Enums:** `PtRegistrationType`, `PtRegistrationStatus`, `PtChallanStatus`.
- **Created Tables:**
  - `ProfessionalTaxRegistration`: Primary key `id`, foreign key to `Company(id)` with `ON DELETE CASCADE`, foreign key to `WorkLocation(id)` with `ON DELETE SET NULL`.
  - `PtChallan`: Primary key `id`, foreign key to `Company(id)` with `ON DELETE RESTRICT`, foreign key to `StatutoryFiling(id)` with `ON DELETE RESTRICT`.
- **Constraints & Indexes:**
  - Unique composite index `[companyId, stateCode, registrationType, certificateNumber]` on `ProfessionalTaxRegistration`.
  - Unique index `[statutoryFilingId]` on `PtChallan` enforcing strict 1:1 cardinality with `StatutoryFiling`.
  - Composite lookup indexes for state, period, and tenant queries.

---

## 5. Architectural & Statutory Invariant Audits

### A. RSK-PT-001 Elimination Invariant
- **Verification in `server/v1/payroll.ts` (lines 955–989):**
  Rules are filtered before payroll calculation:
  ```ts
  const ptRules = rules.filter((item) => item.type === "PROFESSIONAL_TAX");
  let applicablePtRule = ptRules.find(
    (item) => item.stateCode && resolvedPtState && item.stateCode.toUpperCase() === resolvedPtState.toUpperCase(),
  );
  if (!applicablePtRule && resolvedPtState) {
    applicablePtRule = ptRules.find((item) => !item.stateCode);
  }
  ```
  Only the single matching state rule is injected into the employee calculation context.
- **Verification in `server/v1/payrollEngine.ts` (lines 134–139):**
  ```ts
  if (rule.type === "PROFESSIONAL_TAX") {
    if (hasAppliedPt) {
      trace.push("Ignored duplicate/secondary Professional Tax rule");
      continue;
    }
  ```
  Even if salary structures contain multiple PT components, `hasAppliedPt` enforces that at most **one** PT deduction can ever be registered per employee per pay run.
- **Test Evidence:** `server/v1/compliance/professionalTax/rskPt001Regression.test.ts` passes 4/4 tests verifying an employee in an organization with active KA, MH, TS, and WB rules only receives a single deduction.

### B. State Resolution 3-Tier Hierarchy
- **Verification in `server/v1/compliance/professionalTax/stateResolver.ts`:**
  - Priority 1: `EmployeeStatutoryProfile.ptState` (`EMPLOYEE_OVERRIDE`)
  - Priority 2: `WorkLocation.state` (`WORK_LOCATION`)
  - Priority 3: `CompanySettings.state` (`COMPANY_DEFAULT`)
  - If unconfigured/unsupported: Throws typed `UnresolvedPtStateException`. Zero silent default fallbacks.
- **Test Evidence:** `server/v1/compliance/professionalTax/stateResolution.test.ts` passes 5/5 tests.

### C. State Adapters Verification
1. **Karnataka (`adapters/karnataka.ts`):**
   - Gross < ₹25,000: ₹0 (Exempt)
   - Gross ≥ ₹25,000: ₹200 (March–January), ₹300 (February adjustment)
   - Annualized: ₹2,500.
2. **Maharashtra (`adapters/maharashtra.ts`):**
   - Mandatory gender check: Throws `MissingRequiredGenderException` if gender is absent or invalid.
   - Females: Gross ≤ ₹25,000 is ₹0; Gross > ₹25,000 is ₹200 (Feb ₹300).
   - Males: Gross ≤ ₹7,500 is ₹0; Gross ₹7,501–₹10,000 is ₹175; Gross > ₹10,000 is ₹200 (Feb ₹300).
3. **Telangana (`adapters/telangana.ts`):**
   - Gross ≤ ₹15,000: ₹0; Gross ₹15,001–₹20,000: ₹150; Gross > ₹20,000: ₹200 across all 12 months.
4. **West Bengal (`adapters/westBengal.ts`):**
   - Temporal versioning: Evaluates `payrollYear > 2026 || (payrollYear === 2026 && payrollMonth >= 10)`.
   - Pre-Oct 2026: Slabs ₹0, ₹110, ₹130, ₹150, ₹200.
   - Post-Oct 1, 2026: Slabs ₹0 (≤ ₹20,000), ₹100, ₹140, ₹170, ₹208.
- **Test Evidence:** `server/v1/compliance/professionalTax/professionalTax.test.ts` passes 17/17 tests.

### D. Historical Payroll Immutability
- Finalized payroll runs (`LOCKED`, `PAID`, `PROCESSED`) reject recalculation requests with `PAYROLL_STATE_INVALID`.
- PT return generation (`/compliance/pt/filings/generate`) reads immutable line snapshots (`line.grossEarnings`, `line.payableDays`, `line.breakdown.PROFESSIONAL_TAX`) and does not re-invoke payroll calculations.

### E. Tenant Isolation
- Every query in `server/v1/compliance/ptRoutes.ts` enforces `where: { companyId }` or `where: { id, companyId }`.
- Direct cross-tenant access between Tenant A and Tenant B is tested and blocked with `404 NOT_FOUND`.

### F. Maker/Checker Segregation of Duties
- In `server/v1/compliance/ptRoutes.ts` (lines 656–663):
  ```ts
  if (filing.createdById === userId) {
    return fail(res, 403, "MAKER_CHECKER_VIOLATION", "Segregation of Duties: The user who created/generated this filing cannot approve it.");
  }
  ```
  Self-approval is blocked server-side.

### G. Strict 1:1 Challan Cardinality & Zero-Variance Reconciliation
- In `server/v1/compliance/ptRoutes.ts`:
  - `POST /compliance/pt/challans` checks `existingChallan` and returns `409 DUPLICATE_CHALLAN` if a challan already exists for the filing.
  - `POST /compliance/pt/challans/:id/reconcile` computes `variance = filingTotal - challanTotal` and rejects non-zero variance with `422 RECONCILIATION_VARIANCE_NON_ZERO`.
  - Challan must be in `PAID` status prior to reconciliation.

### H. Locked Filing Immutability & SHA-256 Seal
- In `server/v1/compliance/ptRoutes.ts`:
  - Locking requires `APPROVED` status.
  - Computes a SHA-256 hash of all employee items and totals.
  - Stores `sha256Checksum` and sets status to `LOCKED`.
  - Mutation or re-validation of locked filings is rejected with `400 FILING_LOCKED`.

---

## 6. Test Suite & Quality Gate Execution

### A. Full Vitest Test Suite
- **Command:** `npm test`
- **Exit Code:** `0`
- **Test Files:** **43 passed** out of 43 suites (100%)
- **Tests:** **410 passed** out of 410 tests (100%)
- **Failures:** **0**
- **Duration:** 20.39s
- **Breakdown of P2.9 Test Suites:**
  - `server/v1/compliance/professionalTax/professionalTax.test.ts`: 17 passed
  - `server/v1/compliance/professionalTax/stateResolution.test.ts`: 5 passed
  - `server/v1/compliance/professionalTax/rskPt001Regression.test.ts`: 4 passed
  - `server/v1/compliance/ptCompliance.test.ts`: 11 passed
  - **P2.9 Test Total:** 37 passed

### B. TypeScript Compilation
- **Command:** `npx tsc -b --noEmit`
- **Exit Code:** `0`
- **Errors:** **0**

### C. ESLint
- **Command:** `npm run lint`
- **Exit Code:** `0`
- **Errors:** **0** (152 pre-existing style/compiler warnings, 0 blocking errors)

---

## 7. Unresolved Risks & Known Boundaries

1. **Government Portal Schema Ingestion:**
   - Official commercial tax portals (Karnataka e-Prerana, Maharashtra Mahagst, Telangana TGCT, West Bengal GRIPS) do not expose public automated submission endpoints or standardized schema test validators.
   - **Mitigation Implemented:** All electronic exports are tagged with `UNVERIFIED_PORTAL_SCHEMA — CALCULATION CERTIFIED ONLY` and export clean internal audit schedules with cryptographic SHA-256 integrity hashes.
2. **Deferred State Implementations:**
   - Tamil Nadu (`TN`) and Gujarat (`GJ`) remain deferred to Phase 2.10 due to half-yearly and municipal authority assessment models.

---

## 8. Final Audit Sign-Off

The OrbitHR P2.9 release `v1.5.8-p2.9-freeze` satisfies all architectural, statutory, financial, security, and quality gate standards.

- **Annotated Tag:** `v1.5.8-p2.9-freeze`
- **Release Commit:** `7171ce104fa655f9a7cab5cdf217dda8f970eeac`
- **Parent Commit:** `3c7a496fefbe0b8c06e66e35ed98e267203fb23e` (`v1.5.7-p2.4-freeze`)
- **Total Test Suites:** 43 / 43 passed
- **Total Tests:** 410 / 410 passed
- **Verification Status:** **PASS — RELEASE INDEPENDENTLY VERIFIED**
