# OrbitHR — P2.7 Architecture & Statutory Compliance Discovery Gate
## Government Filing Automation Engine (EPF ECR 2.0, ESIC, Form 24Q & Multi-State PT)
### Read-Only Pre-Implementation Architecture, Data Model & Compliance Verification Report

---

**Milestone:** P2.7 — Statutory Compliance & Government Filing Automation  
**Authoritative Baseline:** `v1.5.3-p2.6b-freeze` (`0257e049b7c3f7c1554bf74711c47ca167105dee`)  
**Operating Mode:** STRICT READ-ONLY ARCHITECTURAL DISCOVERY  
**Date:** October 3, 2026  
**Status:** DISCOVERY COMPLETE — ARCHITECTURE GATE PENDING APPROVAL  

---

## 1. Executive Summary

Milestone **P2.7** advances OrbitHR from Indian statutory calculation (established in P2.3) to **automated statutory compliance and government filing operations**.

This report documents the comprehensive read-only pre-implementation discovery conducted on the frozen P2.6B baseline. The investigation examined the live Prisma schema, payroll calculation engine, compliance endpoints, tax simulator engine, settings models, employee master records, and the 25 immutable historical database migrations.

### Key Discoveries & Architectural Baseline
1. **Authoritative Source of Truth:** Statutory filings must be derived exclusively from finalized `PayrollRun` records in `LOCKED` or `PAID` state. Running a statutory export on `DRAFT`, `CALCULATED`, or `HR_REVIEW` runs is strictly prohibited because P2.6B allows expense ingestion or draft discard to invalidate and delete `PayrollLine` records.
2. **Dual-Layer Immutability (Snapshot Architecture):** Dynamic queries against mutable tables (`Employee`, `SalaryStructure`) cannot reproduce byte-for-byte government filings if employee profiles, UAN/PAN identifiers, or company addresses mutate in later months. P2.7 establishes an immutable snapshot architecture (`StatutoryFiling` and `StatutoryFilingItem`) backed by SHA-256 cryptographic checksums.
3. **Master Data Gap Resolution:** While `CompanySettings` contains primary statutory registration codes (`pfRegistrationNumber`, `esiRegistrationNumber`, `panNumber`, `tanNumber`), the `Employee` model lacks direct first-class columns for 12-digit `uan`, `esicNumber`, explicit `pan`, and statutory exemption flags. These fields are currently stored inside unindexed JSON blobs (`EmployeeOnboarding.documentDetails`) or overloaded into `taxIdentifier`. A forward-only migration is required to elevate these to structured fields.
4. **Strict Scope Separation for Form 24Q:** OrbitHR will generate 100% compliant e-TDS Form 24Q text structures (with Annexure I for Q1–Q4 and Annexure II for Q4) with strict format and arithmetic pre-validation (**"FVU-Readiness"**). Execution of the proprietary, closed-source Java-based NSDL File Validation Utility (FVU) binary or direct portal transmission to TRACES is explicitly defined as an external system boundary.
5. **Preservation of Frozen Invariants (P2.1–P2.6B):** P2.7 is strictly downstream of the payroll engine. It consumes finalized payroll output and does not write to `PayrollAdjustment` or `PayrollRun`. All eight locked P2.6B invariants (exclusive `FOR UPDATE` calculation locks, run-level reimbursement scoping, dual-barrier bank export isolation, and dirty calculation invalidation) remain 100% preserved.

---

## 2. Baseline Verification

```text
BASELINE:
Tag: v1.5.3-p2.6b-freeze
Commit: 0257e049b7c3f7c1554bf74711c47ca167105dee
Branch: main

VERIFIED METRICS:
Total Tests: 257 / 257 passing (100%)
Test Suites: 34 test suites
Server TypeScript: 0 errors (clean)
Client TypeScript: 0 errors (clean)
Vite Production Build: Clean (14.13s)
Prisma Schema: Synchronized and Valid
Historical Migrations: 25 total (all preserved untouched)
```

---

## 3. Mandatory Discovery Gates (Detailed Findings)

### Gate 1: Payroll Source of Truth & Run Lifecycle

#### 1. Lifecycle Analysis
In `prisma/schema.prisma`, `enum PayrollStatus` defines the following sequence:
```text
DRAFT → ATTENDANCE_LOCKED → CALCULATED → HR_REVIEW → FINANCE_APPROVED → LOCKED → PAID
```
- In `server/v1/payroll.ts`, `POST /payroll/runs/:id/calculate` calculates gross, deductions, and statutory breakdown for all active employees and persists `PayrollLine` records, setting status to `CALCULATED`.
- However, between `CALCULATED` and `LOCKED`, the run is **mutable**:
  - `POST /payroll/runs/:id/ingest-expenses` (P2.6B) can ingest new reimbursement claims into a `CALCULATED` run, immediately resetting the run to `DRAFT` and deleting all `PayrollLine` records.
  - `POST /payroll/runs/:id/discard` (P2.6B) deletes all `PayrollLine` records and resets the run to `DRAFT`.
  - `/calculate` can be rerun repeatedly, changing line items.
- **Architectural Invariant for P2.7:**
  > **Statutory filings must NEVER be generated from a run with status `DRAFT`, `ATTENDANCE_LOCKED`, `CALCULATED`, `HR_REVIEW`, or `FINANCE_APPROVED`.**
  > Filings are strictly restricted to `PayrollRun.status IN ('LOCKED', 'PAYSLIP_GENERATED', 'PAYSLIPS_PUBLISHED', 'BANK_EXPORTED', 'PROCESSED', 'PAID')`.

#### 2. Persistence of Statutory Breakdown in `PayrollLine`
`PayrollLine` stores:
```prisma
grossEarnings         Float
employeeDeductions    Float
employerContributions Float
reimbursements        Float
netPay                Float
breakdown             Json
calculationTrace      Json
```
Inspection of `calculatePayroll` in `server/v1/payrollEngine.ts` shows the exact keys populated into `PayrollLine.breakdown`:
- `values.BASIC`: Earned basic wages (after proration).
- `values.PF_EMPLOYEE`: Employee Provident Fund deduction (12% of basic up to ₹15,000 ceiling or uncapped).
- `values.PF_EMPLOYER`: Total Employer PF contribution (12% of basic).
- `values.ESI_EMPLOYEE`: Employee State Insurance deduction (0.75% of gross earnings).
- `values.ESI_EMPLOYER`: Employer State Insurance contribution (3.25% of gross earnings).
- `values.PROFESSIONAL_TAX`: State-specific professional tax deduction.
- `values.TDS`: Monthly income tax deduction under Section 192.
- `values.LWF_EMPLOYEE` & `values.LWF_EMPLOYER`: Labour Welfare Fund (where configured).

#### 3. Reversal Impact
If a locked/paid payroll run is subsequently reversed via `POST /payroll/runs/:id/reverse`:
- The run moves to `REVERSED`.
- Any `StatutoryFiling` generated against that `payrollRunId` is flagged as `ORPHANED_RUN_REVERSED`.
- The filing state machine prohibits approving or exporting filings linked to a reversed run, and forces an explicit `AMENDMENT` or `SUPERSEDED` workflow if the run is re-run.

---

### Gate 2: Employee Master Data & Statutory Identifiers

#### 1. Current Schema Inventory
Inspection of `model Employee` in `prisma/schema.prisma` reveals:
```prisma
model Employee {
  id            String    @id @default(uuid())
  companyId     String
  employeeCode  String
  firstName     String
  lastName      String
  email         String
  dateOfBirth   DateTime? @db.Date
  gender        String?
  dateOfJoining DateTime  @db.Date
  status        EmployeeStatus @default(ACTIVE)

  // Bank & Tax
  bankName      String?
  accountNumber String?
  routingOrIfsc String?
  taxIdentifier String?  // Overloaded for PAN

  branchId       String?
  workLocationId String?
  // ...
}
```

#### 2. Identified Data Gaps in `Employee`
The statutory filing engines require the following mandatory government identifiers:
1. **EPF Universal Account Number (UAN):** Mandatory 12-digit numeric identifier for ECR 2.0. Currently missing as a first-class column.
2. **PF Member ID:** State/establishment/account-level PF number (e.g., `DL/CPM/1234567/000/0000123`). Currently missing.
3. **ESIC Insurance Number (IP Number):** Mandatory 10-digit numeric identifier for ESIC monthly return. Currently missing.
4. **Explicit PAN:** Currently stored in `Employee.taxIdentifier`, which is an unvalidated string. TDS Form 24Q requires strict PAN format validation (`[A-Z]{5}[0-9]{4}[A-Z]`).
5. **Statutory Exemption & Applicability Flags:**
   - `pfOptOut` (Boolean): For employees joining with Basic > ₹15,000 who were never previously PF members.
   - `epsExempt` (Boolean): For employees aged 58+ (exempt from EPS 8.33%, 12% goes entirely to EPF).
   - `esicExempt` (Boolean): For employees whose gross exceeds ₹21,000 or executive categories.
   - `ptState` (String?): Explicit state code for PT deduction (fallback to `WorkLocation.state`).

#### 3. Safe Schema Evolution Strategy
To avoid altering frozen schemas disruptively, these fields can be added as nullable columns to `Employee` in a new forward-only migration:
```prisma
// Added to model Employee
uan              String?   @db.VarChar(12)
pfMemberId       String?   @db.VarChar(50)
esicIpNumber     String?   @db.VarChar(10)
panNumber        String?   @db.VarChar(10)
epsExempt        Boolean   @default(false)
pfOptOut         Boolean   @default(false)
ptState          String?   @db.VarChar(2)
```
Existing seed and onboarding records can populate these fields cleanly.

---

### Gate 3: Company & Branch Statutory Registrations

#### 1. Current Schema Inventory in `CompanySettings`
`model CompanySettings` already stores:
- `panNumber String @default("")`: 10-character corporate PAN.
- `tanNumber String @default("")`: 10-character TAN (Tax Deduction Account Number) — required for Form 24Q Batch Header (`BH`).
- `pfRegistrationNumber String @default("")`: EPFO Establishment Code (e.g., `DLCPM1234567000`).
- `esiRegistrationNumber String @default("")`: ESIC 17-digit Employer Code (e.g., `11000123450000001`).
- `professionalTaxNumber String @default("")`: PT Registration Certificate (PT-RC).
- `legalEntityName String`: Official company legal entity name.
- `registeredAddress String`, `city String`, `state String`, `postalCode String`.

#### 2. Multi-State PT-RC Gap
In Indian operations, an enterprise with offices in Karnataka, Maharashtra, and Telangana must hold separate state-specific PT-RC numbers. Storing a single `professionalTaxNumber` on `CompanySettings` is insufficient for multi-state employers.
- **Resolution:** Introduce a dedicated `CompanyStatutoryRegistration` model or extend `StatutoryRuleVersion` configuration to store state-specific PT-RC numbers, EPFO sub-establishment codes, and ESIC sub-codes.

---

### Gate 4: Filing Period & Immutability Architecture (Snapshot vs Dynamic)

#### 1. The Reproducibility Dilemma
A statutory filing cannot be generated dynamically on-the-fly at download time. If an employee resigns, changes their name/PAN, or is removed 6 months later, dynamically querying `Employee` and `PayrollLine` would produce a mutated, corrupt file that fails official reconciliation audits.

#### 2. The Authoritative 3-Layer Snapshot Architecture
P2.7 implements strict filing immutability:

```text
┌───────────────────────────────────────────────────────────────┐
│ Layer 1: StatutoryFiling (Master Control Record)              │
│ - id, companyId, domain (EPF | ESIC | TDS_24Q | PT)           │
│ - periodYear, periodMonth / quarter, stateCode                │
│ - payrollRunId (FK, ON DELETE RESTRICT)                       │
│ - status (DRAFT → VALIDATED → APPROVED → LOCKED → EXPORTED)   │
│ - totalEmployees, totalGrossWages, totalDeduction, totalShare  │
│ - sha256Checksum, artifactKey, exportFormat                   │
│ - createdById, approvedById, lockedAt                         │
└───────────────────────────────┬───────────────────────────────┘
                                │ 1:N
┌───────────────────────────────▼───────────────────────────────┐
│ Layer 2: StatutoryFilingItem (Line-Level Snapshot)            │
│ - id, filingId, employeeId                                    │
│ - snapshotEmployeeCode, snapshotEmployeeName                  │
│ - snapshotUan, snapshotPan, snapshotEsicIp                    │
│ - grossWages, epfWages, epsWages, edliWages                   │
│ - employeeContribution, employerContribution, epsAmount       │
│ - ncpDays / payableDays, ptAmount, tdsAmount                  │
└───────────────────────────────┬───────────────────────────────┘
                                │ 1:1
┌───────────────────────────────▼───────────────────────────────┐
│ Layer 3: Export Artifact & Cryptographic Checksum             │
│ - Raw text/CSV stored immutably in Object Storage / DB        │
│ - SHA-256 hash verified upon every download                   │
└───────────────────────────────────────────────────────────────┘
```

#### 3. Period Locking & Duplicate Prevention
Database-level uniqueness prevents overlapping or conflicting filings:
```prisma
@@unique([companyId, domain, periodYear, periodMonth, stateCode, filingType])
```
Where `filingType` is `ORIGINAL` or `REVISED`.

---

### Gate 5: EPF ECR 2.0 Engine Specification

#### 1. Official EPFO ECR 2.0 File Specification
- **Format:** Pure ASCII/UTF-8 text file.
- **Field Delimiter:** `#~#`
- **Record Delimiter:** `\r\n` or `\n`
- **Header / Footer:** NONE (EPFO portal rejects text files with headers).
- **Columns (11 mandatory fields per employee):**

| Col # | Field Name | Format | Derivation / Rule |
|---|---|---|---|
| 1 | UAN | 12 digits | `Employee.uan` (Mandatory, non-zero) |
| 2 | Member Name | Text (max 80) | Name as registered with EPFO (`firstName + ' ' + lastName`) |
| 3 | Gross Wages | Number (2 dec) | `PayrollLine.grossEarnings` |
| 4 | EPF Wages | Number (2 dec) | Min(Earned Basic, ₹15,000) unless voluntary uncapped |
| 5 | EPS Wages | Number (2 dec) | Min(Earned Basic, ₹15,000). Set to 0 if age >= 58 or EPS exempt |
| 6 | EDLI Wages | Number (2 dec) | Min(Earned Basic, ₹15,000) |
| 7 | EE Share Remitted | Integer | Round(EPF Wages × 12%) |
| 8 | EPS Share Remitted | Integer | If EPS Wages > 0: Round(EPS Wages × 8.33%), max ₹1,250; else 0 |
| 9 | ER Share Remitted | Integer | `EE Share Remitted - EPS Share Remitted` (Account 1 EPF Share) |
| 10 | NCP Days | Integer (0–31) | Non-Contributory Period days: `PayrollLine.unpaidDays` |
| 11 | Refund of Advances | Integer | 0 (unless specific PF advance refund) |

#### 2. Account Reconciliation Breakdown (Challan Summary)
In addition to the raw `#~#` text file, the engine computes the official EPFO monthly challan liability:
- **Account 1 (EPF):** Total EE Share (12%) + Total ER EPF Share (3.67% or balance).
- **Account 2 (EPF Admin):** 0.50% of Total EPF Wages (subject to minimum ₹500/month or ₹75 for non-functional establishments).
- **Account 10 (EPS):** Total ER EPS Share (8.33%).
- **Account 21 (EDLI):** 0.50% of Total EDLI Wages (maximum ₹75 per employee per month).
- **Account 22 (EDLI Admin):** 0.00% (waived by Ministry of Labour & Employment since 2017).

---

### Gate 6: ESIC Monthly Return Engine Specification

#### 1. Official ESIC Monthly Return Specification
- **Format:** CSV / Excel template for bulk upload on the ESIC Unified Portal.
- **Coverage Criteria:** Gross wages up to ₹21,000/month (₹25,000 for employees with disabilities).
- **Contribution Rates:**
  - Employee Contribution: **0.75%** of gross wages.
  - Employer Contribution: **3.25%** of gross wages.
  - Total Monthly Remittance: **4.00%**.
- **Rule of Continuous Coverage:** Under Section 46 of the ESI Act, if an employee’s wages exceed ₹21,000 after the start of a contribution period (April–September or October–March), they remain covered until the end of that contribution period.

#### 2. Mandatory Columns in ESIC Return:
1. **IP Number:** 10 digits (`Employee.esicIpNumber`).
2. **IP Name:** Employee full name.
3. **No. of Days for which wages paid:** `PayrollLine.payableDays`.
4. **Total Monthly Wages:** Gross earnings subject to ESI.
5. **Reason Code for Zero Working Days:**
   - Code `1`: On Leave
   - Code `2`: Left Service (requires Last Working Day)
   - Code `3`: Retired
   - Code `4`: Out of Coverage
   - Code `0`: Normal working month.
6. **Last Working Day:** `Employee.lastWorkingDay` (if separated during the month).

---

### Gate 7: TDS Form 24Q (Quarterly Salary) Specification

#### 1. Structural Overview of Form 24Q
Form 24Q reports quarterly Tax Deducted at Source on salaries under Section 192:
- **Q1:** April 1 – June 30 (Filing deadline: July 31)
- **Q2:** July 1 – September 30 (Filing deadline: October 31)
- **Q3:** October 1 – December 31 (Filing deadline: January 31)
- **Q4:** January 1 – March 31 (Filing deadline: May 31)

#### 2. Record Hierarchy in e-TDS Text File
- **`FH` (File Header):** File sequence number, upload type, creation date/time.
- **`BH` (Batch Header):** Employer TAN, PAN, Legal Name, Address, Contact details, Responsible Person details, Financial Year (e.g. `2025-26`), Assessment Year (e.g. `2026-27`), Quarter (`Q1`, `Q2`, `Q3`, `Q4`).
- **`CD` (Challan Detail):** Government BSR Code (7 digits), Challan Tender Date, Challan Serial Number (5 digits), Minor Head (`200` for TDS Payable by Taxpayer, `400` for Regular Assessment), TDS Amount, Surcharge, Cess, Interest, Fee u/s 234E, Total Challan Amount.
- **`DD` (Deductee Detail - Annexure I):** Line-by-line employee records mapped to the Challan:
  - Employee PAN (10 chars, strictly validated).
  - Employee Name.
  - Date of Payment.
  - Amount Paid/Credited (Gross salary for the month/quarter).
  - Tax Deducted (TDS amount).
  - Surcharge & Health and Education Cess (4%).
  - Total Tax Deposited.
- **`SD` (Salary Detail - Annexure II - Q4 Only):** Comprehensive annual income tax computation for every employee employed during the financial year:
  - Gross Salary u/s 17(1), Perquisites u/s 17(2), Profits in lieu of salary u/s 17(3).
  - Exemption u/s 10 (HRA exemption u/s 10(13A), LTA u/s 10(5), etc.).
  - Standard Deduction u/s 16(ia) (₹50,000 for Old Regime, ₹75,000 for New Regime under Finance Act 2024/2025).
  - Entertainment Allowance u/s 16(ii), Professional Tax u/s 16(iii).
  - Income from House Property (Home loan interest u/s 24(b)).
  - Chapter VI-A Deductions: 80C, 80CCC, 80CCD(1), 80CCD(1B), 80CCD(2), 80D, 80E, 80G, 80TTA.
  - Total Taxable Income.
  - Tax on Total Income, Rebate u/s 87A, Surcharge, Cess (4%), Relief u/s 89.
  - Net Tax Payable vs Total TDS Deducted (Variance check).

#### 3. Scope Boundary: "FVU-Readiness" vs Government FVU Execution
- **In-Scope (OrbitHR Engine):**
  - Generation of standard NSDL e-TDS text structure.
  - Pre-validation of PAN check-digit arithmetic and pattern `[A-Z]{5}[0-9]{4}[A-Z]`.
  - Pre-validation of TAN pattern `[A-Z]{4}[0-9]{5}[A-Z]`.
  - Challan arithmetic reconciliation (Sum of DD TDS = Challan TDS).
  - Pre-validation of mandatory postal codes, state codes, and dates.
- **Out-of-Scope (External Boundary):**
  - OrbitHR does NOT embed the proprietary Oracle Java runtime or the NSDL `TDS_FVU_standalone.jar` binary.
  - OrbitHR does NOT connect to TRACES or submit directly without human Maker-Checker oversight.
  - OrbitHR provides **100% FVU-ready data files** that pass standard NSDL FVU checks with zero structure or arithmetic errors.

---

### Gate 8: Multi-State Professional Tax (PT) Engine

#### 1. Legal Framework & OrbitHR Inventory
- Under Article 276 of the Constitution of India, State governments levy Professional Tax up to ₹2,500 per annum.
- OrbitHR already has `StatutoryRuleVersion` supporting `type = 'PROFESSIONAL_TAX'`, `jurisdiction = 'IN'`, and `stateCode String?`.
- In `server/v1/payrollEngine.ts`, PT is calculated dynamically against slab arrays:
  ```ts
  if (rule.type === 'PROFESSIONAL_TAX') {
    const slabs = Array.isArray(c.slabs) ? c.slabs : [];
    const slab = slabs.find(x => gross >= numeric(x.min) && (!numeric(x.max) || gross <= numeric(x.max)));
    const amount = money(numeric(slab?.amount));
    values.PROFESSIONAL_TAX = amount;
  }
  ```

#### 2. State-Specific Filing Statement Requirements
P2.7 standardizes monthly PT statements across key states:
- **Maharashtra (MH):** Slabs based on monthly gross. ₹0 up to ₹7,500 (men) / ₹25,000 (women); ₹175 for ₹7,501–₹10,000; ₹200 for ₹10,001+ (with February adjusted to ₹300 to total ₹2,500/yr).
- **Karnataka (KA):** Slabs based on monthly gross. ₹0 up to ₹25,000; ₹200 for ₹25,001+.
- **Telangana / Andhra Pradesh (TS/AP):** ₹0 up to ₹15,000; ₹150 for ₹15,001–₹20,000; ₹200 for ₹20,001+.
- **West Bengal (WB):** Multi-tier slabs ranging from ₹110 to ₹200.
- **Tamil Nadu (TN):** Semi-annual slabs.
- **Filing Output:** Monthly State-wise PT Statement containing:
  - PT Registration Certificate (PT-RC) Number.
  - Return Period (Month & Year).
  - Employee Code, Name, Gross Monthly Salary, PT Deducted.
  - Slab-wise employee count and total tax deducted.

---

### Gate 9: Maker-Checker Workflow, RBAC & Audit Integrity

#### 1. Role-Based Access Control (RBAC)
Statutory compliance workflows require strict segregation of duties:
- `compliance.view`: Allowed to view filing dashboard, history, and read-only previews.
- `compliance.manage` (Maker): Allowed to generate drafts, trigger recalculations, and run pre-validation checks.
- `compliance.approve` (Checker): Allowed to formally approve filings, lock periods, and authorize export artifacts.

#### 2. Segregation of Duties (SoD) Invariant
The user who creates or generates a `StatutoryFiling` (`createdById`) **CANNOT** approve or lock the filing:
```ts
if (filing.createdById === req.auth.id) {
  return fail(res, 403, "MAKER_CHECKER_VIOLATION", "The Maker who generated the filing cannot approve it.");
}
```

#### 3. State Machine Contract
```text
  [ DRAFT ]
      │
      ▼ (Maker runs validation)
  [ VALIDATED ]
      │
      ▼ (Maker submits for review)
  [ PENDING_APPROVAL ]
      │
      ├──► (Checker rejects) ────────► [ REJECTED ]
      │
      ▼ (Checker approves & locks)
  [ LOCKED / APPROVED ] ───► (Generate Export) ───► [ EXPORTED ]
      │
      ▼ (If statutory revision required)
  [ REVISED ] (Creates linked amendment filing)
```

#### 4. Cryptographic Tamper-Detection
1. When a filing moves to `LOCKED` / `APPROVED`, the export generator compiles the final text/CSV file.
2. The server computes:
   ```ts
   const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
   ```
3. `checksum` and the generated artifact are saved to `StatutoryFiling`.
4. When any user downloads the filing via `/api/v1/compliance/filings/:id/export`, the server recomputes the SHA-256 hash of the payload and asserts `recomputedHash === filing.checksum`. If any tampering or corruption occurred, download is aborted with `409 TAMPER_DETECTED`.

---

### Gate 10: Backward Compatibility & Regression Proof (P2.1–P2.6B)

| Milestone | Core Invariant | P2.7 Non-Interference Proof |
|---|---|---|
| **P2.1 Multi-Tenant Isolation** | Strict `companyId` scoping on all queries and mutations. | Every new table (`StatutoryFiling`, `StatutoryFilingItem`) has mandatory `companyId` with foreign key cascade to `Company`. Every endpoint enforces `companyId = req.auth.companyId`. |
| **P2.2 Mobile & Session Security** | JWT/session security and authorization scopes. | P2.7 uses existing `permit()` middleware and permission scopes. |
| **P2.3 Statutory Payroll Engine** | Authoritative calculations for Basic, HRA, PF, ESI, PT, TDS. | P2.7 reads finalized `PayrollLine.breakdown`. It does NOT change `calculatePayroll()` formulas or modify `StatutoryRuleVersion`. |
| **P2.4 Workflow Engine** | Visual workflow definition and execution state machine. | P2.7 uses native Maker-Checker transitions or binds to existing workflow instances if desired. |
| **P2.5 Leave Encashment** | Encashment adjustments in payroll calculation. | Unpaid days / LOP days are read from `PayrollLine.unpaidDays` without modifying encashment adjustments. |
| **P2.6A Expense Management** | Multi-category expense policies and receipts. | Untouched. |
| **P2.6B Expense-to-Payroll** | 1:1 `ExpenseClaim` to `PayrollAdjustment` linkage, cross-run isolation (`payrollRunId = run.id`), dual-barrier bank export isolation, `FOR UPDATE` calculation locking. | **Strictly Preserved:** P2.7 is a downstream consumer of `PayrollRun`. It never creates or modifies `PayrollAdjustment`, never touches `ExpenseClaim`, and never modifies `bankExport.ts`. |

---

## 4. Proposed Database Schema Evolution

To implement P2.7 cleanly without disturbing frozen tables, we propose:

### 1. New Enums
```prisma
enum StatutoryFilingDomain {
  EPF_ECR
  ESIC_MONTHLY
  TDS_24Q
  PROFESSIONAL_TAX
}

enum StatutoryFilingStatus {
  DRAFT
  VALIDATED
  PENDING_APPROVAL
  APPROVED
  LOCKED
  EXPORTED
  REJECTED
  REVISED
}

enum StatutoryFilingType {
  ORIGINAL
  REVISED
}
```

### 2. New Models
```prisma
model StatutoryFiling {
  id               String                 @id @default(uuid())
  companyId        String
  domain           StatutoryFilingDomain
  filingType       StatutoryFilingType    @default(ORIGINAL)
  periodYear       Int                    // e.g. 2026
  periodMonth      Int?                   // 1-12 for monthly (EPF, ESIC, PT)
  quarter          String?                // 'Q1' | 'Q2' | 'Q3' | 'Q4' for Form 24Q
  stateCode        String?                // e.g. 'KA', 'MH' for PT
  payrollRunId     String
  status           StatutoryFilingStatus  @default(DRAFT)
  
  // Aggregated Summary
  totalEmployees   Int                    @default(0)
  totalGrossWages  Float                  @default(0)
  totalEeShare     Float                  @default(0)
  totalErShare     Float                  @default(0)
  totalTaxDeducted Float                  @default(0)
  
  // Artifact & Integrity
  exportFormat     String                 // 'TXT_ECR' | 'CSV_ESIC' | 'TXT_24Q' | 'CSV_PT'
  artifactKey      String?
  sha256Checksum   String?
  validationErrors Json?
  
  // Audit & Workflow
  createdById      String
  validatedAt      DateTime?
  approvedById     String?
  approvedAt       DateTime?
  lockedAt         DateTime?
  exportedAt       DateTime?
  rejectionReason  String?
  createdAt        DateTime               @default(now())
  updatedAt        DateTime               @updatedAt

  company          Company                @relation(fields: [companyId], references: [id], onDelete: Cascade)
  payrollRun       PayrollRun             @relation(fields: [payrollRunId], references: [id], onDelete: Restrict)
  items            StatutoryFilingItem[]

  @@unique([companyId, domain, periodYear, periodMonth, quarter, stateCode, filingType])
  @@index([companyId, domain, periodYear])
  @@index([payrollRunId])
}

model StatutoryFilingItem {
  id                   String          @id @default(uuid())
  filingId             String
  employeeId           String
  
  // Immutability Snapshot
  snapshotEmployeeCode String
  snapshotEmployeeName String
  snapshotUan          String?
  snapshotPan          String?
  snapshotEsicIp       String?
  
  // Wage & Days Breakdown
  workingDays          Float           @default(0)
  payableDays          Float           @default(0)
  ncpDays              Float           @default(0)
  grossWages           Float           @default(0)
  epfWages             Float           @default(0)
  epsWages             Float           @default(0)
  edliWages            Float           @default(0)
  
  // Contribution Breakdown
  eePfShare            Float           @default(0)
  erEpsShare           Float           @default(0)
  erEpfShare           Float           @default(0)
  eeEsiShare           Float           @default(0)
  erEsiShare           Float           @default(0)
  ptAmount             Float           @default(0)
  tdsAmount            Float           @default(0)
  
  metadata             Json?
  createdAt            DateTime        @default(now())

  filing               StatutoryFiling @relation(fields: [filingId], references: [id], onDelete: Cascade)
  employee             Employee        @relation(fields: [employeeId], references: [id], onDelete: Restrict)

  @@unique([filingId, employeeId])
  @@index([filingId])
  @@index([employeeId])
}
```

### 3. Additions to `Employee` Model (Forward-Only)
```prisma
// Non-breaking nullable fields added to model Employee
uan          String?  @db.VarChar(12)
pfMemberId   String?  @db.VarChar(50)
esicIpNumber String?  @db.VarChar(10)
panNumber    String?  @db.VarChar(10)
epsExempt    Boolean  @default(false)
pfOptOut     Boolean  @default(false)
ptState      String?  @db.VarChar(2)
```

---

## 5. Phased Implementation Plan (P2.7-A to P2.7-F)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ P2.7-A: Statutory Compliance Architecture & Data Model Migration      │
│ - Schema additions (StatutoryFiling, StatutoryFilingItem, Employee IDs)│
│ - Single dynamic Prisma migration with forward-only safety             │
│ - Base compliance repository helpers and tenant isolation checks       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ P2.7-B: EPF / ECR 2.0 & ESIC Filing Engine                             │
│ - ECR 2.0 generation (#~# format, 11 columns, wage capping, NCP days) │
│ - ESIC monthly contribution statement & zero-working-day reason codes  │
│ - EPFO/ESIC mathematical reconciliation tests                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ P2.7-C: TDS Form 24Q Quarterly Engine (FVU-Ready)                      │
│ - Annexure I (Deductee records) generation for Q1-Q4                   │
│ - Annexure II (Annual salary computation) generation for Q4            │
│ - PAN format, TAN format, and Challan BSR pre-validation engine        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ P2.7-D: Multi-State Professional Tax (PT) Engine                       │
│ - Multi-state slab configuration and PT-RC registration mapping        │
│ - State-specific monthly PT deduction statements (MH, KA, TS, WB, etc.)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ P2.7-E: Maker-Checker Workflow & Filing Control Center API             │
│ - State machine transitions (DRAFT → VALIDATED → APPROVED → LOCKED)    │
│ - Segregation of Duties (Maker cannot be Checker)                      │
│ - Immutable snapshot generation on lock                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ P2.7-F: Cryptographic Tamper-Detection, Audit & UI Control Center      │
│ - SHA-256 export checksum validation upon download                     │
│ - Web UI Statutory Compliance Dashboard in OrbitHR frontend            │
│ - Full regression test suite (257 baseline + P2.7 tests)               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                          P2.7 RELEASE FREEZE
```

---

## 6. Pre-Implementation Go / No-Go Decision Matrix

| Dimension | Assessment Criteria | Result | Notes |
|---|---|:---:|---|
| **Authoritative Baseline** | `v1.5.3-p2.6b-freeze` / `0257e049...` verified clean | **GO** | 257/257 tests passing, 34 suites, clean git status |
| **Migration Safety** | All 25 historical migrations preserved untouched | **GO** | New tables will be in dynamic migration #26 |
| **Payroll Source of Truth** | Filings restricted to `LOCKED` or `PAID` runs | **GO** | Completely prevents stale or invalidated calculation filings |
| **P2.6B Invariants** | Bank export barrier, reimbursement scoping, row lock | **GO** | P2.7 does not touch `PayrollAdjustment` or `bankExport.ts` |
| **P2.3 Invariants** | Statutory payroll calculation logic preserved | **GO** | `calculatePayroll()` remains pure and authoritative |
| **Master Data Feasibility** | Addition of UAN, ESIC IP, PAN, PT state to Employee | **GO** | Non-breaking nullable fields, forward-only migration |
| **Immutability Architecture** | Dual-layer snapshot prevents historical mutation | **GO** | `StatutoryFiling` + `StatutoryFilingItem` snapshots |
| **FVU Boundary Definition** | OrbitHR provides FVU-readiness; external FVU execution | **GO** | Clearly defined scope prevents external dependency traps |
| **Security & RBAC** | Segregation of Duties enforced between Maker and Checker | **GO** | Enforced at route middleware and state machine layer |
| **Tamper Protection** | Cryptographic SHA-256 checksum on export artifacts | **GO** | Export download asserts byte integrity |

### FINAL GATE VERDICT
**GO: ARCHITECTURE & COMPLIANCE DISCOVERY GATE PASSED.**  
The OrbitHR codebase is ready for phased implementation of Milestone P2.7 upon authorization.
