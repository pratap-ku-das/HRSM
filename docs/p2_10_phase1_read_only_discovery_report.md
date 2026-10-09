# OrbitHR HRMS — P2.10 Phase 1 Read-Only Discovery & Architecture Gate Report
## Unified Statutory Compliance Calendar

**Date:** 2026-10-09  
**Stage:** Stage A — Read-Only Discovery & Architecture Gate  
**Auditor:** Principal Software Architect & Lead Statutory Compliance Engineer  
**Baseline Verified:** `v1.5.8-p2.9-freeze` (`7171ce104fa655f9a7cab5cdf217dda8f970eeac`)  

---

## 1. Verified Baseline & Git Lineage

- **Git HEAD SHA:** `7171ce104fa655f9a7cab5cdf217dda8f970eeac`
- **Release Tag:** `v1.5.8-p2.9-freeze` (annotated tag pointing to `7171ce104fa655f9a7cab5cdf217dda8f970eeac`)
- **Parent Commit:** `3c7a496fefbe0b8c06e66e35ed98e267203fb23e` (`v1.5.7-p2.4-freeze`)
- **Predecessor Releases Preserved:** P2.1 through P2.9 are fully frozen, valid, and immutable.
- **Migration History:** Exactly 31 migrations exist in `prisma/migrations/` (1 to 30 + #31 `20261008000000_p2_9_pt_compliance_foundation`). All historical migrations are untouched.
- **Untracked Operational Files:**
  - `docs/p2_9_post_freeze_verification.md`
  - `scripts/pre_migration_checks.ts`
  - `scripts/post_migration_checks.ts`
  *(All preserved outside the release as strictly required)*

---

## 2. Actual Statutory Model Architecture

The OrbitHR statutory filing foundation revolves around `StatutoryFiling` and domain-specific challan tables:

1. **`StatutoryFiling` (Core Filing Entity):**
   - **`domain`**: `StatutoryFilingDomain` (`EPF_ECR`, `ESIC_MONTHLY`, `TDS_24Q`, `PROFESSIONAL_TAX`).
   - **`filingType`**: `StatutoryFilingType` (`ORIGINAL`, `REVISED`).
   - **`status`**: `StatutoryFilingStatus` (`DRAFT` → `VALIDATED` → `PENDING_APPROVAL` → `APPROVED` → `LOCKED` → `EXPORTED` / `CANCELLED` / `SUPERSEDED`).
   - **Period fields**: `periodYear Int`, `periodMonth Int?`, `quarter String?`, `stateCode String?`.
   - **Key Relations**:
     - `epfChallans EpfChallan[]`
     - `esicChallans EsicChallan[]`
     - `challans TdsChallan[]` & `allocations TdsChallanAllocation[]`
     - `ptChallan PtChallan?`
   - **Uniqueness Constraint**: `@@unique([companyId, domain, periodYear, periodMonth, quarter, stateCode, filingType])`.

2. **Challan Models & Payment Tracking:**
   - **EPF (`EpfChallan`)**: Tracks `trrnNumber`, `challanAmount`, `status` (`CHALLAN_GENERATED`, `PAYMENT_INITIATED`, `PAID`, `RECONCILED`, `CANCELLED`).
   - **ESIC (`EsicChallan`)**: Tracks `cprnNumber`, `challanAmount`, `status` (`CHALLAN_GENERATED`, `PAYMENT_INITIATED`, `PAID`, `RECONCILED`, `CANCELLED`).
   - **TDS (`TdsChallan`)**: Tracks BSR code, challan date, challan serial, minor head (200), and item allocations via `TdsChallanAllocation`.
   - **Professional Tax (`PtChallan`)**: Tracks 1:1 linked challan, `cinNumber`, `paidDate`, `status` (`CHALLAN_GENERATED`, `PAID`, `RECONCILED`, `CANCELLED`).

---

## 3. Statutory Domain Integration Findings

### 3.1 EPF / ECR 2.0 Integration
- **Source Module:** `server/v1/compliance/epfEngine.ts` and `server/v1/compliance/routes.ts`.
- **Filing Domain:** `EPF_ECR`.
- **Periodicity:** Monthly (wage months 1 through 12).
- **Existing Fields:** `StatutoryFiling` contains total employees, EPF wages, EE share, ER share.
- **Challan:** 1:M relationship via `EpfChallan` with TRRN reference.
- **Legal Due Date:** 15th of the succeeding month (e.g. May wage month is due on June 15).

### 3.2 ESIC Monthly Integration
- **Source Module:** `server/v1/compliance/esicEngine.ts` and `server/v1/compliance/routes.ts`.
- **Filing Domain:** `ESIC_MONTHLY`.
- **Periodicity:** Monthly.
- **Existing Fields:** Total employees, gross wages, EE share (0.75%), ER share (3.25%).
- **Challan:** 1:M relationship via `EsicChallan` with CPRN reference.
- **Legal Due Date:** 15th of the succeeding month (Regulation 31).

### 3.3 TDS Quarterly & Monthly Integration
- **Source Module:** `server/v1/compliance/tdsRoutes.ts` and `server/v1/compliance/tds/`.
- **Filing Domain:** `TDS_24Q`.
- **Periodicity:**
  - **Quarterly Statement (Form 24Q)**: Q1 (April–June) due July 31; Q2 (July–Sept) due October 31; Q3 (Oct–Dec) due January 31; Q4 (Jan–March) due May 31.
  - **Monthly TDS Deposit (Section 200 / Rule 30)**: Due on 7th of the succeeding month (April to February) and April 30 for March deductions.
- **Existing Fields:** Quarterly Form 24Q statements are tracked in `StatutoryFiling`. Monthly challan deposits are stored in `TdsChallan`.

### 3.4 Professional Tax Integration
- **Source Module:** `server/v1/compliance/ptRoutes.ts` and `server/v1/compliance/professionalTax/`.
- **Filing Domain:** `PROFESSIONAL_TAX`.
- **Supported States:**
  - **Karnataka (`KA`)**: Due on or before **20th of succeeding month** (Section 6A).
  - **Maharashtra (`MH`)**: Due on or before **last day of succeeding month** (Form III-B, Rule 11).
  - **Telangana (`TS`)**: Due on or before **10th of succeeding month** (Form V, Rule 12).
  - **West Bengal (`WB`)**: Due on or before **21st of succeeding month** (Section 6, Rule 12).
- **Deferred States:** Tamil Nadu (`TN`) and Gujarat (`GJ`) remain deferred.

---

## 4. Existing Notification, Task & Audit Infrastructure

1. **Notifications (`server/v1/notifications.ts`):**
   - Core function: `emitNotification(prisma, { companyId, userId, eventKey, title, body, entityType, entityId, actionUrl })`.
   - Channels: `IN_APP`, `EMAIL`, `PUSH`.
   - Idempotency: Supported via `notificationDelivery.idempotencyKey` and user preference checks.
2. **Reminders (`server/v1/reminders.ts`):**
   - Existing compliance job endpoint: `POST /notifications/jobs/compliance-reminders`.
   - Idempotency pattern: Queries `notification` table for previous emission within time window before generating new notifications.
3. **Audit System:**
   - Model: `AuditLog` (`companyId`, `userId`, `action`, `category: 'COMPLIANCE'`, `details`, `ipAddress`).
   - Helper function `audit(req, action, details)` used throughout compliance routes.

---

## 5. Official Statutory Deadline Research & Evidence Matrix

All statutory deadlines verified against authoritative Indian Central and State Government legislation:

| Domain | Jurisdiction | Obligation Type | Frequency | Period Covered | Statutory Due Date | Governing Statute / Gazette Citation | Official Status |
|---|---|---|---|---|---|---|---|
| **EPF** | Central (All India) | Monthly PF Contribution & ECR Filing | Monthly | Preceding calendar month | **15th of succeeding month** | Employees' Provident Funds Scheme, 1952, Para 38(1); EPFO Circular WDU/7(1)2006/ECR | **VERIFIED** |
| **ESIC** | Central (All India) | Monthly ESI Contribution & Online Challan | Monthly | Preceding calendar month | **15th of succeeding month** | Employees' State Insurance (General) Regulations, 1950, Reg 31 (amended May 2017) | **VERIFIED** |
| **TDS** | Central (All India) | Monthly Tax Deposit (Challan ITNS 281) | Monthly | Months 1–11 (Apr–Feb) | **7th of succeeding month** | Income-tax Rules, 1962, Rule 30(2)(a)(i) read with Sec 200(1) | **VERIFIED** |
| **TDS** | Central (All India) | Monthly Tax Deposit for March | Monthly | Month 12 (March) | **April 30 of next FY** | Income-tax Rules, 1962, Rule 30(2)(a)(ii) | **VERIFIED** |
| **TDS** | Central (All India) | Quarterly Form 24Q Statement (Q1) | Quarterly | April 1 to June 30 | **July 31** | Income-tax Rules, 1962, Rule 31A(2) read with Sec 200(3) | **VERIFIED** |
| **TDS** | Central (All India) | Quarterly Form 24Q Statement (Q2) | Quarterly | July 1 to Sept 30 | **October 31** | Income-tax Rules, 1962, Rule 31A(2) read with Sec 200(3) | **VERIFIED** |
| **TDS** | Central (All India) | Quarterly Form 24Q Statement (Q3) | Quarterly | Oct 1 to Dec 31 | **January 31** | Income-tax Rules, 1962, Rule 31A(2) read with Sec 200(3) | **VERIFIED** |
| **TDS** | Central (All India) | Quarterly Form 24Q Statement (Q4) | Quarterly | Jan 1 to March 31 | **May 31** | Income-tax Rules, 1962, Rule 31A(2) read with Sec 200(3) | **VERIFIED** |
| **PT** | Karnataka (KA) | Monthly PT Return (Form 5A) & Payment | Monthly | Preceding calendar month | **20th of succeeding month** | Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976, Sec 6A | **VERIFIED** |
| **PT** | Maharashtra (MH) | Monthly PT Return (Form III-B) & Payment | Monthly | Preceding calendar month | **Last day of succeeding month** | Maharashtra State Tax on Professions Act, 1975, Rule 11 & Rule 12 | **VERIFIED** |
| **PT** | Telangana (TS) | Monthly PT Return (Form V) & Payment | Monthly | Preceding calendar month | **10th of succeeding month** | Telangana Tax on Professions Act, 1987, Sec 7 read with Rule 12 | **VERIFIED** |
| **PT** | West Bengal (WB) | Monthly PT Return & Treasury Deposit | Monthly | Preceding calendar month | **21st of succeeding month** | West Bengal State Tax on Professions Act, 1979, Sec 6 read with Rule 12 | **VERIFIED** |

---

## 6. Distinction: Statutory Deadline vs. Internal Target Date vs. Reminders

- **Statutory Due Date (`statutoryDueDate`):** The immutable, legally binding deadline established by official gazetted statute. Ordinary administrators cannot modify legal deadlines.
- **Officially Extended Due Date (`extendedDueDate`):** Preserved separately with official gazette/circular provenance and reason when a government extension is notified.
- **Internal Target Date (`internalTargetDate`):** Configurable operational target date set by the company (e.g. 3 days before statutory due date) to ensure pre-submission reviews and Maker/Checker approvals finish early.
- **Reminder Offsets:** Configurable alerts at `T-7`, `T-3`, `T-1`, `Due Day`, and `Overdue`.

---

## 7. Proposed Unified Calendar Architecture & Source of Truth

```
[Statutory Deadline Engine] ─── (Official Due Date Rules: EPF, ESIC, TDS, PT)
          │
          ▼
[ComplianceCalendarObligation] ◄─── Synced with ───► [StatutoryFiling]
    ├── Domain                                              ├── EpfChallan
    ├── ObligationType                                      ├── EsicChallan
    ├── Period & Jurisdiction                               ├── TdsChallan
    ├── Statutory Due Date                                  └── PtChallan
    ├── Internal Target Date
    ├── Operational Status (UPCOMING, DUE_SOON, OVERDUE, FILED, PAID, COMPLETED)
    ├── Assigned Owner (User)
    └── Reminder History
          │
          ▼
[Compliance Calendar Web UI & Notification Engine]
```

### Source-of-Truth Contract
1. **Financial Amounts & Filings:** The existing modules (`StatutoryFiling`, `EpfChallan`, `EsicChallan`, `TdsChallan`, `PtChallan`) remain the **exclusive, immutable source of truth** for financial data, validation, Maker/Checker approval, locking, and challan payments.
2. **Calendar Orchestration:** The calendar model (`ComplianceCalendarObligation`) maintains deadline management, assignment, internal target dates, reminders, and synchronization pointers.
3. **Synchronization Lifecycle:** When a `StatutoryFiling` or challan transitions (e.g. to `APPROVED`, `LOCKED`, `PAID`, `RECONCILED`), the calendar reflects the status dynamically.

---

## 8. Schema & Migration Impact Assessment

### Proposed Migration #32: Additive Foundation
- **Table:** `ComplianceCalendarObligation`
- **Fields:**
  - `id`: UUID Primary Key
  - `companyId`: Foreign key to `Company(id)` with `ON DELETE CASCADE`
  - `domain`: `StatutoryFilingDomain` enum
  - `obligationType`: VARCHAR(50) (e.g. `CONTRIBUTION_AND_RETURN`, `MONTHLY_DEPOSIT`, `QUARTERLY_STATEMENT`)
  - `jurisdiction`: VARCHAR(10) (e.g. `IN`, `KA`, `MH`, `TS`, `WB`)
  - `periodYear`: INTEGER
  - `periodMonth`: INTEGER? (1 to 12)
  - `quarter`: VARCHAR(5)? (`Q1`, `Q2`, `Q3`, `Q4`)
  - `statutoryDueDate`: DATE
  - `extendedDueDate`: DATE?
  - `internalTargetDate`: DATE?
  - `status`: Enum `ComplianceObligationStatus` (`UPCOMING`, `DUE_SOON`, `DUE_TODAY`, `OVERDUE`, `FILED`, `PAID`, `COMPLETED`, `EXEMPT`)
  - `assignedUserId`: Foreign key to `User(id)` with `ON DELETE SET NULL`
  - `statutoryFilingId`: Optional Foreign key to `StatutoryFiling(id)` with `ON DELETE SET NULL`
  - `lastSyncedAt`: TIMESTAMP?
  - `notes`: TEXT?
  - `createdAt`, `updatedAt`: TIMESTAMPS
- **Unique Constraint (Idempotency Guarantee):**
  `@@unique([companyId, domain, obligationType, periodYear, periodMonth, quarter, jurisdiction])`
- **Zero Impact on Historical Tables:** No existing tables or columns modified. Migrations 1–31 preserved completely.

---

## 9. Security & Tenant Isolation Analysis

1. **Tenant Isolation:** Every calendar query and mutation strictly enforces `where: { companyId }`.
2. **RBAC Permissions:**
   - `compliance.calendar.view`: View calendar entries, deadlines, and metrics.
   - `compliance.calendar.manage`: Update internal target dates, assign owners, trigger synchronization.
3. **Segregation of Duties:** Managing calendar reminders does NOT confer statutory approval rights. Statutory filings remain governed by `compliance.approve`, `compliance.pt.approve`, etc.
4. **IDOR Protection:** Linked filings and assigned users are validated against tenant `companyId`.

---

## 10. Implementation Plan & Workflows

1. **Database Migration #32:** Add `ComplianceCalendarObligation` and `ComplianceObligationStatus` enum additively.
2. **Statutory Deadline Engine (`server/v1/compliance/calendar/deadlineEngine.ts`):** Deterministic legal due date calculators for EPF, ESIC, TDS, and PT (KA, MH, TS, WB).
3. **Calendar Synchronization Service (`server/v1/compliance/calendar/syncService.ts`):** Syncs calendar obligations from company settings, active PT registrations, and existing `StatutoryFiling` records.
4. **Calendar API Routes (`server/v1/compliance/calendar/calendarRoutes.ts`):** Mounted in `server/v1/compliance/routes.ts` under `/compliance/calendar/`.
5. **Reminders & Scheduler Extension:** Background check in `server/v1/reminders.ts` emitting notifications for due/overdue statutory obligations.
6. **Unified Web UI (`src/pages/payroll/ComplianceCalendarTab.tsx`):**
   - Monthly calendar grid view & list view.
   - Domain, jurisdiction, status, and assignment filters.
   - Metric cards: Total upcoming, due soon, due today, overdue, completed.
   - Detail drawer linking directly to EPF, ESIC, TDS, and PT workspaces.
7. **Comprehensive Automated Test Suites:** Unit tests, deadline engine tests, sync tests, tenant isolation, and API integration tests.

---

## 11. Final Architecture Verdict

### **PASS — READY FOR CONTROLLED IMPLEMENTATION**

**Justification:**
1. Predecessor release `v1.5.8-p2.9-freeze` is verified intact and frozen.
2. Official Central & State Government statutory deadlines are verified and documented.
3. Architecture respects the existing statutory engines as authoritative financial sources of truth.
4. Proposed Migration #32 is strictly additive and non-destructive.
5. All security, tenant isolation, and Maker/Checker boundaries are preserved.

Authorization is granted to proceed with Stage B Controlled Implementation.
