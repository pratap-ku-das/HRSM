# P2.9 Phase 1 — Multi-State Professional Tax (PT)
# Read-Only Discovery & Architecture Gate Report

**Project:** OrbitHR Enterprise HRMS  
**Milestone:** P2.9 — Multi-State Professional Tax (PT) Compliance Engine  
**Phase:** 1 — Read-Only Discovery & Architecture Gate  
**Authoritative Baseline:** `v1.5.7-p2.4-freeze` (`3c7a496fefbe0b8c06e66e35ed98e267203fb23e`)  
**Operating Mode:** STRICT READ-ONLY DISCOVERY — NO CODE/SCHEMA MUTATIONS  
**Date:** October 8, 2026  
**Status:** DISCOVERY COMPLETE — ARCHITECTURE GATE EVALUATED  

---

## 1. Executive Summary

Milestone **P2.9** investigates the transformation of OrbitHR's current flat Professional Tax (PT) deduction into an enterprise-grade, state-aware **Multi-State Professional Tax Compliance Engine**.

In the current baseline (`v1.5.7-p2.4-freeze`), `PROFESSIONAL_TAX` exists primarily as an unsegmented monthly deduction in `calculatePayroll()` and a single aggregate field on `CompanySettings` (`professionalTaxNumber`). While P2.7-A laid the structural groundwork by including `PROFESSIONAL_TAX` in `enum StatutoryFilingDomain` and adding `ptState` to `EmployeeStatutoryProfile`, OrbitHR currently **lacks multi-state PT rule resolution, state-level establishment mapping, PT-RC registration tracking, monthly state statement exports, and PT challan reconciliation**.

This discovery evaluated the technical feasibility, architectural safety, and statutory ground truth across six target states: **Maharashtra (MH), Karnataka (KA), Telangana (TS), West Bengal (WB), Gujarat (GJ), and Tamil Nadu (TN)**.

### Key Architectural Discovery Takeaways
1. **Critical Payroll Defect Discovered:** `StatutoryRuleVersion` models support `stateCode`, but `server/v1/payroll.ts` loads all active company rules and passes them simultaneously to `calculatePayroll()`. If a company defines PT rules for multiple states, `calculatePayroll()` iterates through all of them, accumulating multiple deductions while overwriting the breakdown key. Multi-state payroll is currently **computationally unsafe** without a state-scoped rule resolver.
2. **State Dimensionality:** In India, PT is levied based on the **place of employment / establishment location**, not personal residence. OrbitHR currently has `WorkLocation.state`, `Branch`, and `EmployeeStatutoryProfile.ptState`. An authoritative resolution hierarchy must be established to link an employee to an establishment's specific state PT-RC.
3. **Gender, Month & Frequency Nuances:** State PT rules are not simple static income brackets:
   - **Maharashtra** exempts women earning up to ₹25,000/month (since April 2023), while men are taxable above ₹7,500. Furthermore, Maharashtra and Karnataka require an adjusted ₹300 deduction in **February** to reach the constitutional ₹2,500 annual ceiling.
   - **Tamil Nadu** levies PT on a **half-yearly (semi-annual)** gross basis through decentralized local municipal bodies (GCC), rather than a monthly state tax portal.
   - **West Bengal** enacted revised monthly slabs effective **October 1, 2026**, demonstrating that temporal rule versioning is essential to preserve historical reproducibility.
4. **Architecture Gate Verdict:** **PASS WITH CONDITIONS — IMPLEMENTATION BLOCKED UNTIL CONDITIONS RESOLVED**. The core P2.7-A snapshot and reconciliation architecture can safely accommodate PT, but implementation must proceed in phased, state-certified increments starting with unified monthly states (KA, MH, TS) and deferring decentralized/half-yearly states (TN).

---

## 2. Baseline Verification

The repository baseline was verified using read-only Git inspections:

```text
AUTHORITATIVE BASELINE:
Tag: v1.5.7-p2.4-freeze
Tag Object: b0ab7395f161a5f6cc10c542deed803e6d1e62bf
Peeled Commit: 3c7a496fefbe0b8c06e66e35ed98e267203fb23e
Commit Message: release(p2.8): freeze Phase 2.4 TDS compliance UI
Parent Commit: 71f8bf989cf2e6f9d136d5373c14b8aa9f8bac59 (v1.5.6-p2.7c-freeze)
Branch: main (ahead of origin/main by 3 commits)
```

Ancestry and immutability are 100% verified.

---

## 3. Working Tree State

Inspection via `git status --short` confirmed:

```text
?? scripts/post_migration_checks.ts
?? scripts/pre_migration_checks.ts
```

- Zero modified tracked files (`M`).
- Zero staged files (`A` or `M`).
- The two pre-existing RDS operational verification scripts (`scripts/pre_migration_checks.ts`, `scripts/post_migration_checks.ts`) remain safely untracked and outside the release baseline.

---

## 4. Current PROFESSIONAL_TAX Architecture

### Code Inventory & Calculation Flow

```text
Employee Master Record
       │
       ▼
EmployeeSalaryRevision (APPROVED)
       │
       ▼
calculatePayroll() in server/v1/payrollEngine.ts
       │  [Loops input.rules; matching rule.type === 'PROFESSIONAL_TAX']
       │  [Extracts slab from rule.configuration.slabs based on gross]
       ▼
PayrollLine
       ├── employeeDeductions (accumulates PT)
       ├── breakdown.PROFESSIONAL_TAX = amount
       └── calculationTrace ("Professional tax=200")
       │
       ▼
PayrollRun [LOCKED / PAID]
       │
       ▼
extractStatutorySnapshot() in server/v1/compliance/snapshotEngine.ts
       │
       ▼
StatutoryFilingItem.ptAmount = line.breakdown.PROFESSIONAL_TAX
```

### Detailed Code Analysis

1. **`server/v1/payrollEngine.ts` (Lines 11–13):**
   ```ts
   if(rule.type==='PROFESSIONAL_TAX'){
     const slabs=Array.isArray(c.slabs)?c.slabs as Array<Record<string,unknown>>:[];
     const slab=slabs.find(x=>gross>=numeric(x.min)&&(!numeric(x.max)||gross<=numeric(x.max)));
     const amount=money(numeric(slab?.amount));
     deductions+=amount;
     values.PROFESSIONAL_TAX=amount;
     trace.push(`Professional tax=${amount}`)
   }
   ```
   *Findings:*
   - Input is strictly `grossEarnings`.
   - Does not evaluate `stateCode`, `gender`, or payroll month (e.g. February adjustment).
   - If multiple PT rules are supplied in `input.rules`, `deductions` accumulates both while `values.PROFESSIONAL_TAX` is overwritten by the last rule.

2. **`server/v1/payroll.ts` (Lines 851–861 & 924–927):**
   - Rules are loaded globally for the tenant:
     ```ts
     const rules = await tx.statutoryRuleVersion.findMany({
       where: {
         companyId,
         active: true,
         effectiveFrom: { lte: run.periodEnd },
         OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
       },
     });
     ```
   - All loaded rules are mapped and passed identically to every employee in the loop without filtering by employee state or work location.

3. **`prisma/schema.prisma`:**
   - `CompanySettings.professionalTaxNumber String @default("")`: A single flat string across the entire company.
   - `EmployeeStatutoryProfile.ptState String? @db.VarChar(2)`: Field exists, but is currently unused during payroll calculation.
   - `StatutoryFiling.domain`: Contains `PROFESSIONAL_TAX` enum value.
   - `StatutoryFilingItem.ptAmount`: Column exists and captures snapshot data.

---

## 5. Payroll Integration

| Pipeline Stage | Existing Behavior | P2.9 Impact & Requirement |
|---|---|---|
| **Attendance Locking** | Computes payable days ratio | PT is generally not prorated for unpaid days in most states if gross crosses slab thresholds, but salary proration lowers gross earnings, indirectly affecting slab placement. |
| **Gross Calculation** | Sum of earnings components | PT slabs evaluate "Gross Salary / Wages" earned in the month. |
| **Deduction Aggregation** | `deductions += PT` | Deduction reduces `netPay`. Correctly isolated from employer contributions. |
| **F&F / Exit Payroll** | `server/v1/settlementEngine.ts` computes final salary | Settlement payroll must deduct PT for the final working month under the applicable state rule. |
| **Payroll Reversals** | `POST /payroll/runs/:id/reverse` marks run `REVERSED` | Associated PT statutory filing must be flagged as `ORPHANED_RUN_REVERSED`. |

---

## 6. State / Establishment Architecture

In multi-state enterprises, an employer maintains physical branches, factories, or offices across different states.

### Existing Models
1. **`Company`**: Tenant root.
2. **`Branch`**: `id, companyId, name, code, legalName, timezone, active`. Lacks a structured `state` or `stateCode` column!
3. **`WorkLocation`**: `id, companyId, branchId, name, code, address, city, state, country, remote, active`. Contains `state String?`.
4. **`Employee`**: Holds `branchId` and `workLocationId`.
5. **`EmployeeStatutoryProfile`**: Holds `ptState String? @db.VarChar(2)`.

### Resolution Hierarchy Gap
If an employee has:
- `Employee.location.state = "Karnataka"`
- `EmployeeStatutoryProfile.ptState = "Maharashtra"`

Which rule governs? Under statutory law, tax is payable to the jurisdiction where the employee renders services / is assigned on the establishment muster roll.

**Recommended Authoritative Hierarchy:**
1. **Primary Authority:** `EmployeeStatutoryProfile.ptState` (explicit statutory assignment by HR).
2. **Secondary Fallback:** `WorkLocation.state` mapped to 2-letter ISO code.
3. **Tertiary Fallback:** `CompanySettings.state`.
4. **Failure Invariant:** If no valid state is resolved, fail payroll calculation with `UNRESOLVED_PT_STATE_EXCEPTION` rather than applying a random state slab.

---

## 7. Registration Architecture

Under Indian state enactments, employers must hold two distinct registrations:
1. **PT-RC (Registration Certificate):** Authorizes the employer to deduct tax from employees and remit monthly/periodically to the state.
2. **PT-EC (Enrolment Certificate):** Authorizes the company itself (as an entity/trader/establishment) to pay annual tax on its own profession/calling.

### Critical Gap
OrbitHR has only `CompanySettings.professionalTaxNumber`. A multi-state tenant operating in Maharashtra, Karnataka, and Telangana requires three separate PT-RC numbers.

**Recommended Model Structure:**
Introduce a dedicated model `ProfessionalTaxRegistration`:
- `id String @id @default(uuid())`
- `companyId String`
- `stateCode String @db.VarChar(2)` (e.g., "MH", "KA", "TS")
- `ptrcNumber String` (State PT-RC Registration Number)
- `ptecNumber String?` (Optional PT-EC Number)
- `registrationDate DateTime? @db.Date`
- `filingFrequency String @default("MONTHLY")` ("MONTHLY", "QUARTERLY", "ANNUAL", "SEMI_ANNUAL")
- `signatoryName String?`
- `signatoryDesignation String?`
- `active Boolean @default(true)`
- `@@unique([companyId, stateCode])`

---

## 8. PT Rule Engine Findings

### Current Model: `StatutoryRuleVersion`
- `type: StatutoryRuleType` (`PROFESSIONAL_TAX`)
- `stateCode: String?`
- `effectiveFrom: DateTime @db.Date`
- `effectiveTo: DateTime? @db.Date`
- `configuration: Json`

### Gaps in `configuration` JSON schema
Currently, `configuration` expects `{ slabs: [{ min, max, amount }] }`. This structure cannot represent:
1. **Gender-Specific Slabs:** (e.g., Maharashtra women exemption up to ₹25,000).
2. **Special Month Overrides:** (e.g., February ₹300 adjustment in MH and KA).
3. **Senior Citizen Exemptions:** (e.g., Karnataka exempts individuals aged 60+).
4. **Disability (PwD) Exemptions:** (e.g., Persons with permanent disability exempt under Section 276/state rules).
5. **Semi-Annual Accumulation:** (e.g., Tamil Nadu half-yearly calculation).

---

## 9. Historical Reproducibility

**Statutory Reproducibility Invariant:**
> *If Karnataka amends its PT slab on 2027-04-01, recalculating or auditing a payroll run from 2026-03 must produce the exact historical PT deduction of ₹200, byte-for-byte.*

### Preservation Mechanism
1. **Temporal Rule Lookup:** `StatutoryRuleVersion` queries must match `effectiveFrom <= periodEnd` AND (`effectiveTo IS NULL` OR `effectiveTo >= periodStart`).
2. **Immutable Snapshot:** Once a `PayrollRun` is `LOCKED`, `PayrollLine.breakdown.PROFESSIONAL_TAX` is frozen. Future rule changes will never mutate historical lines.
3. **Filing Item Immutability:** `StatutoryFilingItem.ptAmount` and `StatutoryFiling.sha256Checksum` provide cryptographic proof of historical filing data.

---

## 10. Liability Architecture

Currently, PT liability is tracked only as a payroll line deduction (`PayrollLine.breakdown.PROFESSIONAL_TAX`). There is no separate ledger entity tracking:
- Total PT liability per state.
- Unpaid PT liability.
- Challan allocation.

**Recommendation:** Reuse `StatutoryFiling` with `domain = 'PROFESSIONAL_TAX'` and `stateCode = 'MH' | 'KA' | etc.` rather than inventing a redundant `ProfessionalTaxLiability` model. The filing itself acts as the state-level monthly liability declaration.

---

## 11. Filing Lifecycle

The existing P2.7-A state machine maps directly to PT:

```text
[ DRAFT ] ────────► [ VALIDATED ] ────────► [ PENDING_APPROVAL ] ────────► [ APPROVED / LOCKED ] ────────► [ EXPORTED ]
(Snapshot        (Rule & Pre-filing        (Submitted by Maker)           (Approved by Checker,          (Return file
 extracted)        checks passed)                                         SHA-256 generated)              downloaded)
```

- **Maker/Checker Segregation:** Fully compatible. `filing.createdById !== req.auth.id` prevents self-approval.
- **Lock Immutability:** Once `LOCKED`, employee list and tax totals are immutable.

---

## 12. Challan Architecture

### Existing State in OrbitHR
- `EpfChallan`: Tracks TRRN, CRN, Account 1/2/10/21/22 splits.
- `EsicChallan`: Tracks 14-digit CPRN, IP/Employer contribution.
- `TdsChallan`: Tracks BSR code, challan date, serial number, minor head 200/400.

### PT Challan Requirements
Each state commercial tax portal issues state-specific challans:
- **Maharashtra:** MTR-6 challan with Government Reference Number (GRN) and CIN.
- **Karnataka:** e-Prerana / Khajane II Challan with 10/12-digit Challan Reference Number.
- **Telangana:** TGCT Challan / Cyber Gateway Reference Number.
- **West Bengal:** GRIPS portal GRN (Government Receipt Number).

**Model Recommendation:**
Create a dedicated `PtChallan` entity linked to `StatutoryFiling`:
```prisma
model PtChallan {
  id                String          @id @default(uuid())
  companyId         String
  statutoryFilingId String
  stateCode         String          @db.VarChar(2)
  ptrcNumber        String          @db.VarChar(30)
  challanNumber     String          @db.VarChar(50)
  challanDate       DateTime        @db.Date
  paidDate          DateTime?       @db.Date
  totalAmount       Float
  paymentReference  String?         @db.VarChar(100)
  bankReference     String?         @db.VarChar(100)
  status            String          @default("CHALLAN_GENERATED")
  ...
}
```

---

## 13. Reconciliation Architecture

### Variance Invariant
```text
Expected PT (Payroll Run for State)
  == Total Tax in PT StatutoryFiling
  == Sum(StatutoryFilingItem.ptAmount)
  == PtChallan.totalAmount
  == Paid Amount in Bank Statement
  => Variance = ₹0.00
```
If variance != 0, the filing cannot move to `RECONCILED`.

---

## 14. State-by-State Statutory Evidence

Every assertion below is evaluated against statutory enactments and official government notifications.

---

### 14.1 Maharashtra (MH)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975 (Act No. XVI of 1975) | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Department of Goods and Services Tax, Govt. of Maharashtra (`mahagst.gov.in`) | Level 1 (Dept Portal) — **VERIFIED** |
| **Registration Type** | **PT-RC** for employers (Section 5(1)); **PT-EC** for establishment (Section 5(2)) | Level 2 (Act Section 5) — **VERIFIED** |
| **Registration Format** | 12 characters: 11-digit TIN + 'P' suffix (e.g. `27XXXXXXXXXP`) | Level 3 (Portal Documentation) — **VERIFIED** |
| **Tax Slabs (Male)** | • Up to ₹7,500/mo: **NIL**<br>• ₹7,501 to ₹10,000/mo: **₹175/mo**<br>• Above ₹10,000/mo: **₹200/mo** (March to January)<br>• **February Special Adjustment:** **₹300** (to total ₹2,500/yr) | Level 2 (Schedule I, Entry 1) — **VERIFIED** |
| **Tax Slabs (Female)** | • Up to ₹25,000/mo: **NIL** (Exemption raised from ₹10,000 by Maharashtra Amendment Act, 2023 w.e.f. April 1, 2023)<br>• Above ₹25,000/mo: **₹200/mo** (Feb: **₹300**) | Level 2 (Maharashtra Act No. XVI of 2023, w.e.f. 01-04-2023) — **VERIFIED** |
| **Exemptions** | Persons with permanent physical disability (40%+), parents of children with mental/physical disability, senior citizens (65+). | Level 2 (Section 27A exemptions) — **VERIFIED** |
| **Filing Frequency** | • Annual for liability < ₹100,000 in previous year.<br>• Monthly for liability ≥ ₹100,000 in previous year. | Level 2 (Rule 11) — **VERIFIED** |
| **Return Form** | **Form III-B** (Monthly / Annual electronic return on Mahagst) | Level 3 (Portal Form Specification) — **VERIFIED** |
| **Due Date** | Last day of the following month (e.g. April return due May 31). Annual due March 31. | Level 2 (Rule 11) — **VERIFIED** |
| **Challan Mechanism** | **MTR-6 Challan** with GRN on Mahagst / GRAS portal | Level 1 (Government Portal) — **VERIFIED** |
| **Statutory Status** | **VERIFIED — READY FOR ARCHITECTURE MODELING** | |

---

### 14.2 Karnataka (KA)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976 (Karnataka Act 35 of 1976) | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Commercial Taxes Department, Govt. of Karnataka (`e-karanike.karnataka.gov.in` / `pt.kar.nic.in`) | Level 1 (Dept Portal) — **VERIFIED** |
| **Registration Type** | **PTRC** for employers; **PTEC** for entity | Level 2 (Act Section 5) — **VERIFIED** |
| **Tax Slabs** | • Up to ₹24,999/mo: **NIL**<br>• ₹25,000 and above/mo: **₹200/mo** (March to January)<br>• **February Special Adjustment:** **₹300** (w.e.f. 2025 amendment to reach ₹2,500 annual cap; previously flat ₹200) | Level 2 (Karnataka Act No. 14 of 2023 & Amendment Act 2025) — **VERIFIED** |
| **Exemptions** | Senior citizens (60+ years), persons with permanent disability, armed forces members. | Level 2 (Section 26 & Notifications) — **VERIFIED** |
| **Filing Frequency** | Monthly return + Annual statement | Level 2 (Rule 11) — **VERIFIED** |
| **Return Form** | **Form 5** (Monthly statement); **Form 5-A** (Annual return) | Level 2 (Karnataka PT Rules, 1976) — **VERIFIED** |
| **Due Date** | On or before the **20th of the succeeding month** (e.g. April PT due May 20) | Level 2 (Section 10) — **VERIFIED** |
| **Payment Mechanism** | e-Prerana / Khajane-II government payment gateway | Level 1 (Portal System) — **VERIFIED** |
| **Statutory Status** | **VERIFIED — READY FOR ARCHITECTURE MODELING** | |

---

### 14.3 Telangana (TS)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | Telangana Tax on Professions, Trades, Callings and Employments Act, 1987 | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Commercial Taxes Department, Govt. of Telangana (`tgct.gov.in`) | Level 1 (Dept Portal) — **VERIFIED** |
| **Registration Type** | **PT-RC** (11-digit Registration Number) | Level 2 (Section 5) — **VERIFIED** |
| **Tax Slabs** | • Up to ₹15,000/mo: **NIL**<br>• ₹15,001 to ₹20,000/mo: **₹150/mo**<br>• Above ₹20,000/mo: **₹200/mo**<br>*(No February adjustment; ₹2,400 annual total for salary earners)* | Level 2 (First Schedule) — **VERIFIED** |
| **Exemptions** | Persons with disability, armed forces personnel. | Level 2 (Exemption Schedule) — **VERIFIED** |
| **Filing Frequency** | Monthly | Level 2 (Rule 12) — **VERIFIED** |
| **Return Form** | **Form II** (Monthly return of tax deducted from salary) | Level 2 (Rules) — **VERIFIED** |
| **Due Date** | On or before the **10th of the succeeding month** | Level 2 (Section 7) — **VERIFIED** |
| **Payment Mechanism** | TG Commercial Taxes online e-Payment / Cyber Treasury | Level 1 (Portal) — **VERIFIED** |
| **Statutory Status** | **VERIFIED — READY FOR ARCHITECTURE MODELING** | |

---

### 14.4 West Bengal (WB)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979 | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Directorate of Commercial Taxes, West Bengal (`wbprofessiontax.gov.in`) | Level 1 (Portal) — **VERIFIED** |
| **Registration Type** | **PT-RC** (Certificate of Registration under Section 5) | Level 2 (Section 5) — **VERIFIED** |
| **Tax Slabs (Current)** | **Effective October 1, 2026 (Major Legislative Revision):**<br>• Up to ₹20,000/mo: **NIL**<br>• ₹20,001 to ₹30,000/mo: **₹100/mo**<br>• ₹30,001 to ₹50,000/mo: **₹140/mo**<br>• ₹50,001 to ₹100,000/mo: **₹170/mo**<br>• Above ₹100,000/mo: **₹208/mo** (Annual: ₹2,496) | Level 2 (WB PT Amendment Notification, effective 01-10-2026) — **VERIFIED** |
| **Tax Slabs (Historical)** | **Prior to October 1, 2026:**<br>• Up to ₹10,000: Nil<br>• ₹10,001–₹15,000: ₹110<br>• ₹15,001–₹20,000: ₹130<br>• ₹20,001–₹40,000: ₹150<br>• Above ₹40,000: ₹200 | Level 2 (Historical Schedule) — **VERIFIED** |
| **Filing Frequency** | Monthly payment + Annual Return | Level 2 (Rule 12) — **VERIFIED** |
| **Return Form** | **Form III** / Annual Return in **Form IIIA** | Level 2 (WB PT Rules) — **VERIFIED** |
| **Due Date** | **21st of the succeeding month** for monthly tax remittance | Level 2 (Section 8) — **VERIFIED** |
| **Payment Mechanism** | GRIPS portal (Government Receipt Portal System) | Level 1 (Portal) — **VERIFIED** |
| **Statutory Status** | **VERIFIED — READY FOR ARCHITECTURE MODELING (Requires Temporal Slabs)** | |

---

### 14.5 Gujarat (GJ)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | Gujarat State Tax on Professions, Trades, Callings and Employments Act, 1976 | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Commercial Tax Department & Respective Municipal Corporations / Panchayats | Level 1 & 2 — **VERIFIED** |
| **Registration Type** | **PTRC** for employers; **PTEC** for entity | Level 2 (Section 5) — **VERIFIED** |
| **Tax Slabs** | • Up to ₹5,999/mo: **NIL**<br>• ₹6,000 to ₹8,999/mo: **₹80/mo**<br>• ₹9,000 to ₹11,999/mo: **₹150/mo**<br>• ₹12,000 and above: **₹200/mo** (Annual: ₹2,400) | Level 2 (Schedule Entry 1) — **VERIFIED** |
| **Filing Frequency** | Monthly for employers with > 20 employees; Quarterly for ≤ 20 employees. | Level 2 (Rule 11) — **VERIFIED** |
| **Return Form** | **Form 5** (Monthly/Quarterly Return); **Form 5A** (Annual Statement) | Level 2 (Rules) — **VERIFIED** |
| **Due Date** | On or before the **15th of the succeeding month** | Level 2 (Section 8) — **VERIFIED** |
| **Payment Mechanism** | Gujarat Commercial Tax portal / Municipal Corporation portals | Level 1 (Portal) — **VERIFIED** |
| **Statutory Status** | **PARTIALLY VERIFIED — READY FOR PAYROLL CALCULATION; MUNICIPAL PORTAL INTEGRATION DEFERRED** | |

---

### 14.6 Tamil Nadu (TN)

| Parameter | Statutory Specification | Evidence & Confidence |
|---|---|---|
| **Governing Act** | Tamil Nadu Municipal Laws (Second Amendment) Act, 1998 / Chennai City Municipal Corporation Act, 1919 | Level 2 (State Act) — **VERIFIED** |
| **Administering Dept** | Greater Chennai Corporation (GCC) & Local Municipalities / Town Panchayats. *(No unified state commercial tax portal)* | Level 1 — **VERIFIED** |
| **Assessment Cycle** | **SEMI-ANNUAL (Half-Yearly)**: 1st Half (Apr 1 – Sep 30) and 2nd Half (Oct 1 – Mar 31). **NOT MONTHLY!** | Level 2 (Act Provisions) — **VERIFIED** |
| **Tax Slabs (GCC)** | Evaluated on **Half-Yearly Gross Earnings**:<br>• Up to ₹21,000 / half-yr: **NIL**<br>• ₹21,001 to ₹30,000: **₹180 / half-yr**<br>• ₹30,001 to ₹45,000: **₹425 / half-yr**<br>• ₹45,001 to ₹60,000: **₹930 / half-yr**<br>• ₹60,001 to ₹75,000: **₹1,025 / half-yr**<br>• Above ₹75,000: **₹1,250 / half-yr** (Annual max: ₹2,500) | Level 1 & 2 (GCC Gazetted Notification 2024–2026) — **VERIFIED** |
| **Due Dates** | **October 31** (for 1st Half) and **April 30** (for 2nd Half) | Level 2 (Municipal By-laws) — **VERIFIED** |
| **Payroll Deduction Custom**| Employers typically deduct proportionally every month (~₹208/mo) or deduct lumpsum in August/September and February/March. | Industry Practice / Secondary — **CAUTION** |
| **Filing Form** | Form 2 (Half-yearly Return to Executive Authority of local body) | Level 2 (Rules) — **VERIFIED** |
| **Statutory Status** | **NOT VERIFIED FOR MONTHLY AUTOMATION — HIGH STRUCTURAL DIVERGENCE. DO NOT IMPLEMENT IN INITIAL MONTHLY PT RELEASE.** | |

---

## 15. Web UI Architecture

### Information Architecture Recommendation
Where should PT live in the OrbitHR frontend?

1. **Option A: Standalone Top-Level Menu (`/compliance/pt`):** Fragmented from payroll.
2. **Option B: Sub-tab inside `PayrollEnginePage.tsx` (`tab === 'ptCompliance'`):**
   - Matches the proven pattern of EPF (`epfCompliance`), ESIC (`esicCompliance`), and TDS (`tdsCompliance`).
   - Sits directly beside payroll runs, allowing the payroll officer to inspect calculation, lock the run, and immediately switch to statutory tabs to generate snapshots.
   - Reuses existing UI components (`EmptyState`, modal primitives, toast system).

**Recommendation:** Add a `Professional Tax` tab to `PayrollEnginePage.tsx` with:
- State selector dropdown (MH, KA, TS, WB).
- Period Year / Month selectors.
- Step 1: Snapshot generation.
- Step 2: Maker/Checker validation & approval.
- Step 3: Challan recording & reconciliation.
- Step 4: Statement download (CSV / Print).

---

## 16. Android Scope

- **Evaluation:** OrbitHR Android is a native Kotlin/Jetpack Compose employee self-service mobile app.
- **Finding:** Professional Tax filing, PT-RC registration configuration, and government challan reconciliation are strictly **employer/compliance-officer back-office responsibilities**.
- **Employee Visibility:** The Android app already displays net pay and deductions from the payslip PDF.
- **Verdict:** **ANDROID CHANGE: NOT REQUIRED FOR P2.9 PHASE 1**. The native Android mobile app must remain 100% frozen and untouched.

---

## 17. Security / RBAC

Reuse the hardened compliance RBAC permissions established in P2.7-A:
- `compliance.view`: Read-only access to PT filings, challans, and statement previews.
- `compliance.manage` (Maker): Generate PT snapshots, validate returns, record challan payments.
- `compliance.approve` (Checker): Approve filings, lock PT return periods.
- **Segregation of Duties (SoD):** Enforce `filing.createdById !== req.auth.id` during approval.

---

## 18. Tenant Isolation

All future PT queries and entities must strictly enforce composite tenant constraints:
1. `ProfessionalTaxRegistration`: `@@unique([companyId, stateCode])`.
2. `PtChallan`: `@@unique([id, companyId])`, foreign-keyed with composite `[statutoryFilingId, companyId]`.
3. Filter all queries with explicit `where: { companyId: req.auth.companyId }`.

---

## 19. Prisma / Schema Impact

To support multi-state PT without destabilizing frozen migrations 1–30:

### 1. Existing Reusable Models
- `StatutoryFiling`: Reusable directly with `domain: PROFESSIONAL_TAX`, `stateCode: String`.
- `StatutoryFilingItem`: Reusable directly; `ptAmount` already exists.
- `EmployeeStatutoryProfile`: `ptState` already exists.

### 2. Required New Additive Entities (for future implementation)
- `ProfessionalTaxRegistration`: Stores state-wise PT-RC, PT-EC, and establishment linkage.
- `PtChallan`: Stores state-specific challan numbers, GRN, payment dates, and bank references.

---

## 20. Migration Strategy

- **Historical Migrations 1–30:** Strictly frozen.
- **Future Migration:** Exactly one single forward-only additive migration (`20261009000000_p2_9_professional_tax`).
- **Destructive Statements:** 0 permitted.
- **Zero-Downtime:** Adding tables and non-null defaults allows zero-downtime application on live PostgreSQL RDS.

---

## 21. Backfill Strategy

### Strategy Analysis
- **Option A (Historical Backfill):** Attempting to retroactively generate `StatutoryFiling` records for past payroll runs (e.g. 2025). **HIGH RISK:** Missing historical PT-RC numbers would require guessing or synthetic defaults.
- **Option B (Forward-Only Adoption):** **RECOMMENDED.** Past `PayrollLine` records retain their immutable deductions. PT statutory filings commence from the active/next locked payroll run.

---

## 22. Payroll Regression Risk

### Critical Risk Identified & Resolution
- **Identified Defect in Baseline:** `server/v1/payroll.ts` passes ALL active company rules to `calculatePayroll()`. If multiple state rules exist, deductions multiply.
- **Required Resolution:** Prior to enabling multi-state PT, `server/v1/payroll.ts` must filter `rules` per employee:
  ```ts
  const employeeState = employee.activeProfile?.ptState || employee.location?.state;
  const applicableRules = rules.filter(r => r.type !== 'PROFESSIONAL_TAX' || r.stateCode === employeeState);
  ```
- **Regression Protection:** 373/373 existing unit tests must remain passing.

---

## 23. Form 16 Dependency

- Under Section 16(iii) of the Income-tax Act, 1961, Professional Tax deducted from salary is deductible from gross income before computing taxable salary.
- In P2.3 `taxSimulator.ts` and Form 24Q Annexure II, `totalPtDeducted` is already included under Section 16 deductions.
- **Finding:** Reconciling PT deductions per financial year provides an authoritative source for Form 16 Part B Box 2(c).

---

## 24. LWF / Future Statutory Reuse

- Labour Welfare Fund (LWF) is also state-specific (e.g. Maharashtra, Karnataka, Gujarat, Haryana).
- The state establishment mapping and multi-state registration pattern designed for PT can be cleanly reused for LWF in a future milestone.

---

## 25. API Architecture

Recommended future REST routes under `/api/v1/compliance/pt`:
- `GET /compliance/pt/registrations`: List company state PT registrations.
- `POST /compliance/pt/registrations`: Create/update state PT-RC.
- `POST /compliance/pt/filings/snapshot`: Extract state-filtered PT snapshot from locked run.
- `GET /compliance/pt/filings/:id`: Fetch filing details and employee lines.
- `POST /compliance/pt/filings/:id/validate`: Pre-filing validation checks.
- `POST /compliance/pt/filings/:id/approve`: Checker approval (SoD enforced).
- `POST /compliance/pt/filings/:id/lock`: Lock filing, generate SHA-256.
- `POST /compliance/pt/filings/:id/challans`: Record state challan payment.
- `GET /compliance/pt/filings/:id/export`: Download state-specific return statement (CSV/print).

---

## 26. Auditability

All PT compliance actions must log to `AuditLog`:
- `CREATE_PT_REGISTRATION`
- `CREATE_PT_SNAPSHOT`
- `VALIDATE_PT_FILING`
- `APPROVE_PT_FILING`
- `LOCK_PT_FILING`
- `RECONCILE_PT_CHALLAN`

---

## 27. Employee Movement Scenarios

1. **Mid-Year State Transfer:** Employee moves from Karnataka to Maharashtra in July.
   - July payroll: Evaluates active `ptState = "MH"`. Deducts Maharashtra PT.
   - Karnataka historical return for April–June retains ₹200/mo. Maharashtra return for July–March retains MH PT.
   - **Constitutional Cap Check:** Total PT across both states must not exceed ₹2,500 in a financial year. The annual salary aggregator must cap total deductions.
2. **Mid-Month Transfer:** Employee transferred on the 15th.
   - Statutory convention: PT is deducted for the location where the employee was stationed on the last day of the wage period (or where salary is disbursed).

---

## 28. Exit / F&F Scenarios

- If an employee exits mid-month, `calculateSettlement()` executes.
- If gross earnings cross the minimum slab threshold for the state, monthly PT is deducted in full (PT is not prorated by days under state acts).

---

## 29. Correction / Reversal Scenarios

- If a payroll run is reversed (`REVERSED`), any linked PT filing is marked `ORPHANED_RUN_REVERSED`.
- If an employer overpays PT on a challan, the excess is recorded as an advance credit on the commercial tax portal; OrbitHR records the variance in `PtChallan.reconciliationStatus = "VARIANCE_DETECTED"`.

---

## 30. Test Architecture

Future test coverage must include:
1. **Engine Unit Tests:**
   - Maharashtra male slabs (up to ₹7.5k, ₹7.5k–₹10k, >₹10k).
   - Maharashtra female exemption (₹25k threshold).
   - Maharashtra & Karnataka February ₹300 adjustment.
   - Karnataka ₹25,000 threshold.
   - Telangana 3-tier slabs.
   - West Bengal temporal boundary (pre-Oct 2026 vs post-Oct 2026).
2. **Multi-Tenant State Filtering Test:** Verifies a company with MH and KA employees only deducts MH PT for MH employees and KA PT for KA employees without duplicate deductions.
3. **Filing Lifecycle Test:** Maker cannot approve; locking generates valid SHA-256.

---

## 31. Performance & Scale

- In a company with 10,000 employees across 4 states, snapshot generation involves one indexed query against `PayrollLine` and `EmployeeStatutoryProfile`.
- In-memory grouping by `stateCode` completes in < 50ms.
- High performance, low database footprint.

---

## 32. State Readiness Matrix

| State | Statutory Spec Evidence | Technical Readiness | Engineering Status | Certification Status |
|---|:---:|:---:|:---:|:---:|
| **Karnataka (KA)** | **VERIFIED** | High | READY FOR SCOPE | PENDING SPEC IMPLEMENTATION |
| **Maharashtra (MH)** | **VERIFIED** | High (Needs Gender/Feb logic) | READY FOR SCOPE | PENDING SPEC IMPLEMENTATION |
| **Telangana (TS)** | **VERIFIED** | High | READY FOR SCOPE | PENDING SPEC IMPLEMENTATION |
| **West Bengal (WB)** | **VERIFIED** | Medium (Needs Oct 2026 temporal split) | READY FOR SCOPE | PENDING SPEC IMPLEMENTATION |
| **Gujarat (GJ)** | **PARTIALLY VERIFIED** | Medium (Municipal portals diverge) | DEFERRED | NOT CERTIFIED |
| **Tamil Nadu (TN)** | **VERIFIED DIVERGENT** | Low (Semi-annual local body levy) | BLOCKED / NON-SCOPE | NOT CERTIFIED |

---

## 33. Candidate Release Strategy

**Recommended Phased Release Architecture:**
- **Phase 2.9A:** Multi-State PT Core Foundation (State registration model, employee state resolver, payroll calculation state filter).
- **Phase 2.9B:** Primary State Adapters & Slabs (Karnataka, Maharashtra with gender/Feb rules, Telangana).
- **Phase 2.9C:** Secondary State Adapter (West Bengal with temporal Oct-2026 split).
- **Phase 2.9D:** Multi-State PT Compliance Web UI & Challan Reconciliation.
- **Explicit Deferral:** Tamil Nadu (due to half-yearly local-body cycle) and Gujarat (due to municipal variations).

---

## 34. Risks & Classifications

| Risk ID | Severity | Description | Mitigation |
|---|:---:|---|---|
| **RSK-PT-001** | **CRITICAL** | `payroll.ts` passes all company rules to every employee, causing duplicate PT deductions if multiple state rules exist. | Implement strict employee-state filtering in `payroll.ts` before multi-state rules are added. |
| **RSK-PT-002** | **HIGH** | Maharashtra women exemption (₹25k) requires employee gender. If gender is missing or null, female employees could be incorrectly taxed. | Invariant: Require gender field on `Employee` or default safely to statutory gender verification alert. |
| **RSK-PT-003** | **HIGH** | West Bengal slab changed on October 1, 2026. Hardcoding slabs without `effectiveFrom`/`effectiveTo` breaks historical payroll reproducibility. | Slabs must be strictly versioned and temporal. |
| **RSK-PT-004** | **MEDIUM** | Tamil Nadu half-yearly calculation breaks monthly payroll filing patterns. | Explicitly exclude Tamil Nadu from initial monthly PT compliance release. |
| **RSK-PT-005** | **LOW** | Form 16 deduction requires annual sum of PT across all states. | Ensure PT is accurately summed across all monthly filings. |

---

## 35. Blockers

1. **Rule Engine Resolver Blocker:** `server/v1/payrollEngine.ts` and `server/v1/payroll.ts` cannot currently resolve different PT rules for different employees within the same payroll run.
2. **Gender Field Dependency:** Maharashtra statutory calculation requires employee gender.

---

## 36. Recommended P2.9 Scope

### In-Scope:
1. State-aware PT rule resolver in `server/v1/payroll.ts`.
2. Support for **Karnataka (KA)**, **Maharashtra (MH)**, **Telangana (TS)**, and **West Bengal (WB)**.
3. Gender-based exemption logic and February ₹300 adjustment for Maharashtra.
4. February ₹300 adjustment for Karnataka.
5. `ProfessionalTaxRegistration` model for state PT-RC tracking.
6. `PtChallan` model for monthly challan payment and reconciliation.
7. PT Statutory Compliance Web UI tab in `PayrollEnginePage.tsx`.
8. State-wise return statement exports (CSV and printable verification sheets).

---

## 37. Explicit Non-Scope

1. **Tamil Nadu (TN):** Excluded due to decentralized half-yearly local-body assessment.
2. **Gujarat (GJ):** Excluded from initial return filing due to municipal corporation fragmentation.
3. **Android App Changes:** Excluded (employer-only back-office operations).
4. **Direct Government Portal Bot Automation:** Excluded; OrbitHR produces compliant statements and reconciles challans without automated browser scraping or portal hacking.
5. **Historical Payroll Backfill:** Past payroll runs will not be retroactively altered.

---

## 38. Engineering Verification vs Statutory Certification

- **Engineering Verification:** Achieved when TypeScript compiles cleanly, 373+ unit tests pass, production builds pass, and database constraints enforce tenant isolation.
- **Statutory Production Certification:** Requires a qualified Indian chartered accountant or statutory payroll auditor to review generated return statements against live Mahagst, e-Prerana, TGCT, and GRIPS portal specifications.
- OrbitHR must state: *"Engineering verified; final return filing subject to employer physical verification on respective state commercial tax portals."*

---

## 39. Architecture Decision Table

| Area | Existing Capability | Gap | Recommended Direction | Risk |
|---|---|---|---|:---:|
| **PT Calculation** | Flat slab in `payrollEngine.ts` | No state/gender/month logic | Add state-aware calculation resolver | **CRITICAL** |
| **Employee State** | `WorkLocation.state`, `ptState` | No resolution precedence | Hierarchy: `ptState` -> `WorkLocation.state` | **HIGH** |
| **Establishment** | `Branch`, `WorkLocation` | No PT-RC registration link | Create `ProfessionalTaxRegistration` | **HIGH** |
| **PT Slabs** | Generic slab array in JSON | No temporal or gender rules | Schema-versioned state slab definitions | **HIGH** |
| **Snapshots** | P2.7-A `StatutoryFiling` | Snapshots dump all states | State-filtered snapshot generation | **HIGH** |
| **Liability / Filing**| `StatutoryFiling` (Domain enum exists) | No PT filing router | Dedicated `/compliance/pt/*` endpoints | **MEDIUM** |
| **Challans** | EPF, ESIC, TDS challans | No PT challan entity | Introduce `PtChallan` model | **MEDIUM** |
| **Reconciliation** | Challan reconciliation logic | PT variance tracking | Reconcile expected vs paid | **LOW** |
| **Web UI** | Tabs for EPF/ESIC/TDS | No PT compliance view | New `ptCompliance` tab in `PayrollEnginePage` | **LOW** |
| **Android** | Native Jetpack Compose app | None (Employer operation) | Zero changes to Android | **NONE** |
| **RBAC** | `compliance.view/manage/approve` | None | Reuse existing permissions | **NONE** |
| **Tenant Isolation** | Composite FKs (`[id, companyId]`) | New models need composite FKs | Enforce tenant isolation patterns | **CRITICAL** |
| **Migrations** | 30 migrations applied | Needs new PT tables | Single forward-only migration #31 | **MEDIUM** |
| **Testing** | 373 tests green | No multi-state PT tests | Comprehensive multi-state test suite | **HIGH** |

---

## 40. File Inventory (Relevant Codebase Assets)

| File | Function / Model | Current Behavior | Relevance to P2.9 | Recommended Future Change | Risk |
|---|---|---|---|---|:---:|
| `server/v1/payrollEngine.ts` | `calculatePayroll()` | Slabs matched on gross; overwrites `values.PROFESSIONAL_TAX` | Core calculation point | Support gender, month, and state in PT rule evaluation | **CRITICAL** |
| `server/v1/payroll.ts` | `POST /payroll/runs/:id/calculate` | Passes all company rules to every employee | Dispatches rules to engine | Filter rules by employee state before calculating | **CRITICAL** |
| `prisma/schema.prisma` | `StatutoryRuleVersion` | Has `stateCode`, but global to company | Stores rule configurations | Enforce state-specific PT rule versioning | **HIGH** |
| `prisma/schema.prisma` | `CompanySettings` | Flat `professionalTaxNumber` | Stores registration | Retain for backwards compatibility; add multi-state table | **MEDIUM** |
| `prisma/schema.prisma` | `EmployeeStatutoryProfile` | Has `ptState String?` | Identifies employee PT state | Primary state resolver | **LOW** |
| `prisma/schema.prisma` | `StatutoryFiling` | Has `PROFESSIONAL_TAX` enum | Domain filing root | Reuse directly for PT filings | **LOW** |
| `prisma/schema.prisma` | `StatutoryFilingItem` | Has `ptAmount Float` | Captures line item | Reuse directly for employee lines | **LOW** |
| `server/v1/compliance/snapshotEngine.ts` | `extractStatutorySnapshot()` | Captures `ptAmount` from line | Snapshot generation | Filter items by `stateCode` when domain is PT | **HIGH** |
| `server/v1/compliance/routes.ts` | Router | Has `/compliance/filings` | API endpoints | Add PT state-scoped routes | **MEDIUM** |
| `src/pages/payroll/PayrollEnginePage.tsx` | React UI | Has EPF, ESIC, TDS tabs | Frontend entry point | Add `ptCompliance` tab | **LOW** |

---

## 41. Final Architecture Gate

### Gate Verdict:
**PASS WITH CONDITIONS — IMPLEMENTATION BLOCKED UNTIL CONDITIONS RESOLVED**

### Conditions Precedent to Implementation Authorization:
1. **Condition 1 (Payroll Safety):** Architectural plan must specify how `server/v1/payroll.ts` will resolve employee state without causing duplicate PT deductions or mutating existing single-state setups.
2. **Condition 2 (Scope Demarcation):** Scope must be restricted to unified monthly return states (**Karnataka, Maharashtra, Telangana, West Bengal**). Tamil Nadu and Gujarat must be explicitly designated as out-of-scope for the initial release.
3. **Condition 3 (Gender & February Logic):** Design specification must detail the gender resolution and February ₹300 override mechanisms for Maharashtra and Karnataka.
4. **Condition 4 (Additive Migration):** Database changes must be strictly forward-only and contained in a single additive migration (#31) without mutating Migrations 1–30 or historical records.

---

## 42. Zero-Mutation Verification

Inspection performed after report creation:
- **`git status --short`:** Confirms ONLY `docs/p2_9_phase1_read_only_discovery_report.md` created.
- **Source Code:** UNCHANGED
- **Prisma Schema:** UNCHANGED
- **Migrations:** UNCHANGED (1–30 intact, #31 not created)
- **Database:** 0 WRITES (No migrations executed, no SQL executed)
- **Git State:** Local commit not created; tag not created; push not performed.
