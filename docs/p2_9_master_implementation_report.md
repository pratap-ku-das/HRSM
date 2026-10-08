# OrbitHR HRMS — P2.9 Master Implementation & Release Report
## Multi-State Professional Tax (PT) Compliance Engine

**Release Target:** v1.5.8-p2.9-freeze  
**Predecessor Baseline:** v1.5.7-p2.4-freeze (`3c7a496fefbe0b8c06e66e35ed98e267203fb23e`)  
**Architecture Contract:** `docs/p2_9_phase2_architecture_gate_report.md`  
**Execution Timestamp:** 2026-10-09  

---

## EXECUTIVE SUMMARY

OrbitHR HRMS Phase 2.9 (P2.9) successfully completes the **Multi-State Professional Tax (PT) Compliance Engine**, transitioning the platform from an un-scoped single-rule state to a robust, enterprise-grade multi-state statutory compliance architecture.

### Scope & Delivered Features
- **Supported States:** Karnataka (`KA`), Maharashtra (`MH`), Telangana (`TS`), and West Bengal (`WB`).
- **Deferred States Preserved:** Tamil Nadu (`TN`) and Gujarat (`GJ`) remain deferred per Phase 2 architecture decisions due to municipal/semi-annual variances.
- **Android Impact:** `ANDROID IMPACT = NONE` (zero modifications to Android native modules).
- **Core Engine:** Pluggable, state-specific adapters implementing statutory slabs, February adjustments, temporal statutory versioning, and gender-aware exemptions.
- **Resolution Boundary:** 3-tier deterministic state resolution with strict typed exceptions preventing silent wrong calculations.
- **RSK-PT-001 Elimination:** Eliminated rule accumulation across multi-state statutory rules. Guarantee: 1 employee + 1 payroll period = 1 resolved PT state + 1 rule version + 1 calculation.
- **Database Architecture:** Additive Migration #31 creating `ProfessionalTaxRegistration` and `PtChallan` with strict tenant isolation, unique constraints, and check constraints.
- **Statutory Lifecycle & Maker/Checker:** DRAFT → VALIDATED → PENDING_APPROVAL → APPROVED → LOCKED → EXPORTED with Segregation of Duties and SHA-256 seal.
- **Challan & Reconciliation:** Strict 1:1 cardinality linking `StatutoryFiling` with `PtChallan`, with zero-variance financial verification.
- **Web UI:** Dedicated Professional Tax compliance workspace within the OrbitHR payroll suite.

---

## BASELINE

- **Frozen Predecessor Baseline:** `v1.5.7-p2.4-freeze`
- **Baseline Git SHA:** `3c7a496fefbe0b8c06e66e35ed98e267203fb23e`
- **Frozen Previous Phases Intact:** P2.1, P2.2, P2.3, P2.4, P2.5, P2.6A, P2.6B, P2.7A, P2.7B, P2.7C, P2.8.
- **Prisma Migrations 1–30:** 100% untouched.

---

## P2.9 ARCHITECTURE

The architecture cleanly decouples state resolution, statutory rule interpretation, payroll calculation, and return filing:

```
[Employee Payroll Context]
          │
          ▼
[3-Tier State Resolver] ───► (Employee Override -> WorkLocation -> Company Default)
          │
          ▼
[RSK-PT-001 Filter Boundary] ───► Pre-filters to exactly ONE state rule version
          │
          ▼
[Professional Tax Engine]
          ├── KarnatakaAdapter (₹25k exemption, Feb ₹300 adjustment)
          ├── MaharashtraAdapter (Female ₹25k exemption, Male slabs, Feb ₹300)
          ├── TelanganaAdapter (3-tier slabs, universal)
          └── WestBengalAdapter (Pre-Oct 2026 vs Post-Oct 1, 2026 temporal engine)
          │
          ▼
[Finalized Payroll Run]
          │
          ▼
[Statutory Filing Lifecycle] (DRAFT ──► VALIDATED ──► PENDING_APPROVAL ──► APPROVED ──► LOCKED)
          │
          ▼
[1:1 PtChallan & Zero-Variance Reconciliation]
```

---

## RSK-PT-001 RESOLUTION

### Problem
Previously, `calculatePayroll` accumulated all deductions matching `PROFESSIONAL_TAX`. If multiple active company statutory rules existed for different states (e.g., KA and MH), an employee could be deducted PT for multiple states simultaneously or sequentially.

### Solution & Invariant
1. In `server/v1/payroll.ts`, the payroll engine queries the employee's resolved state (`resolveEmployeePtState`) and filters the company's active rule versions down to **exactly one** applicable state rule before calling `calculatePayroll`.
2. In `server/v1/payrollEngine.ts`, `hasAppliedPt` invariant guard ensures that even if multiple PT component definitions are mistakenly encountered in a salary structure, at most **one** PT deduction can ever be registered per employee per pay period.
3. Tests in `server/v1/compliance/professionalTax/rskPt001Regression.test.ts` formally prove that an employee in an organization with active KA, MH, TS, and WB rules only receives the single resolved state deduction.

---

## STATE RESOLUTION

### 3-Tier Priority Hierarchy
1. **Tier 1 (Explicit Profile Override):** `EmployeeStatutoryProfile.ptState`
2. **Tier 2 (Work Location Establishment):** `WorkLocation.state` via `Employee.workLocationId`
3. **Tier 3 (Company Headquarter Default):** `CompanySettings.state`

### Failure & Auditability
- If no state is resolved, `UnresolvedPtStateException` is raised.
- If state is resolved to an unsupported code, `UnsupportedPtStateException` is raised.
- State resolution outputs audit metadata (`resolutionSource`: `EMPLOYEE_PROFILE` | `WORK_LOCATION` | `COMPANY_DEFAULT`).
- **NEVER** silently falls back to arbitrary defaults like `MH` or `KA`.

---

## STATUTORY MATRIX

Full details cataloged in `docs/p2_9_statutory_matrix.md`:

| State | Act / Notification | Effective | Monthly Gross Threshold | Monthly Slabs | February Special | Gender Specificity |
|---|---|---|---|---|---|---|
| **KA** | Karnataka Act 14 of 2023 | 2023-04-01 | < ₹25,000: ₹0<br>≥ ₹25,000: ₹200 | ₹0, ₹200 | ₹300 (Annual: ₹2,500) | Universal |
| **MH** | Maharashtra Act VIII of 2023 | 2023-04-01 | Female: ≤ ₹25,000: ₹0<br>Male: ≤ ₹7,500: ₹0 | Male: ₹175 (7.5k-10k)<br>Male/Fem: ₹200 (>10k/>25k) | ₹300 (Annual: ₹2,500) | Yes (Female ₹25k exemption; missing gender fails) |
| **TS** | Telangana Act 1987 | 2014-06-02 | ≤ ₹15,000: ₹0 | ₹150 (15k-20k)<br>₹200 (>20k) | No (Annual: ₹2,400) | Universal |
| **WB** | WB Act 1979 (Pre-Oct 2026) | Historical | ≤ ₹10,000: ₹0 | ₹110, ₹130, ₹150, ₹200 | No (Annual: ₹2,400) | Universal |
| **WB** | WB Act 1979 (Post-Oct 1, 2026) | 2026-10-01 | ≤ ₹15,000: ₹0 | ₹130, ₹150, ₹200 | No | Universal |

---

## REGISTRATION

- Model: `ProfessionalTaxRegistration`
- Registration Types: `PT_RC` (Tax Deduction / Enrollment for Employees) and `PT_EC` (Employer Establishment Certificate).
- Strict tenant isolation: `companyId` composite unique constraint `[companyId, stateCode, registrationType, certificateNumber]`.
- Validity enforcement: Validates registration is active and within `effectiveFrom` and `effectiveTo` during filing validation.

---

## CHALLAN & RECONCILIATION

- Cardinality: Strict `1:1` relationship between `StatutoryFiling` and `PtChallan` via unique index `[statutoryFilingId]`.
- Zero-Variance Rule: Challan total amount must match filing tax deducted down to the exact rupee (`variance = 0`). Over-allocation and under-allocation are rejected.
- Bank Payment Recording: Capture of CIN, BSR, and payment timestamp transitions status to `RECONCILED`.

---

## FILING LIFECYCLE

- Statuses: `DRAFT` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `LOCKED` → `EXPORTED`.
- Maker/Checker SoD: The user who created (`createdById`) or submitted the filing cannot approve it (`approvedById !== createdById`).
- Immutability on Lock: Locked filings receive a SHA-256 cryptographic checksum and reject all mutations.
- Export Boundary: Exports include audit headers and are explicitly tagged with `UNVERIFIED_PORTAL_SCHEMA` status.

---

## DATABASE MIGRATION #31

- File: `prisma/migrations/20261008000000_p2_9_pt_compliance_foundation/migration.sql`
- Additive schema updates:
  - Enums: `PtRegistrationType`, `PtRegistrationStatus`, `PtChallanStatus`.
  - Tables: `ProfessionalTaxRegistration`, `PtChallan`.
  - Relations on `Company`, `WorkLocation`, and `StatutoryFiling`.
- Constraints & Indexes:
  - Foreign key cascades tenant-isolated.
  - Unique index `[companyId, stateCode, registrationType, certificateNumber]` on registration.
  - Unique index `[statutoryFilingId]` on `PtChallan`.
  - Check constraints for non-negative financial values.

---

## PAYROLL INTEGRATION & HISTORICAL IMMUTABILITY

- Zero recalculation of past finalized payroll runs: Historical runs maintain their stored payslip lines and snapshot values.
- New payroll runs invoke the enhanced `calculatePayroll` with employee state and gender context.

---

## WEB UI

- Location: Dedicated Professional Tax tab within the Payroll Engine (`src/pages/payroll/PtComplianceTab.tsx`).
- Views:
  - Overview cards: Active registrations, monthly liabilities, pending approvals, locked filings.
  - State Registrations Management: Create, edit, suspend, and view certificates by state.
  - Filings & Returns: Generate drafts from finalized runs, trigger validation, submit, Maker/Checker approval, lock, and export.
  - Challan & Reconciliation: Record challans, capture payment reference, and verify zero variance.
- Security: Role-based action controls and server-enforced permissions (`compliance.pt.view`, `compliance.pt.manage`, `compliance.pt.approve`, `compliance.pt.export`).

---

## SECURITY & TENANT ISOLATION

- Tenant Isolation: All database queries and operations enforce `where: { companyId }`.
- Permission Enforcement: Routes check authenticated session role and specific compliance permissions.
- IDOR Protection: Foreign keys and entity IDs are verified against tenant scope.

---

## TEST METRICS

- **P2.9 Test Suites:**
  - `server/v1/compliance/professionalTax/professionalTax.test.ts` (17 tests)
  - `server/v1/compliance/professionalTax/stateResolution.test.ts` (5 tests)
  - `server/v1/compliance/professionalTax/rskPt001Regression.test.ts` (4 tests)
  - `server/v1/compliance/ptCompliance.test.ts` (11 tests)
  - **Total P2.9 Tests:** 37 tests (37/37 passing).
- **Total Project Tests:** 410 tests (410/410 passing across 43 test files).
- **TypeScript:** PASS (0 errors).
- **ESLint:** PASS (0 errors).
- **Production Build:** PASS (`vite build` succeeded cleanly).
- **Prisma Generate:** PASS.

---

## LIMITATIONS & DEFERRED SCOPE

1. **Unverified Portal Schemas:** Government online upload schemas (CTD Karnataka e-Prerana, Mahagst, GRAS, GRIPS, TGCT) lack public schema validation APIs. OrbitHR exports certified internal audit spreadsheets and CSV structures marked `UNVERIFIED_PORTAL_SCHEMA`.
2. **Deferred States:** Tamil Nadu (`TN`) and Gujarat (`GJ`) are deferred to P2.10 due to municipal/semi-annual assessment complexity.

---

## RELEASE DETAILS

- **Commit Message:** `release(p2.9): freeze multi-state professional tax compliance`
- **Release Tag:** `v1.5.8-p2.9-freeze`
- **Final Verdict:** `PASS — P2.9 COMPLETE / RELEASE FROZEN`
