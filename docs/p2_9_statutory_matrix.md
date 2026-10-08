# OrbitHR HRMS — P2.9 Statutory Compliance Matrix
## Multi-State Professional Tax (PT) Statutory Reference

**Version:** 1.0.0-p2.9  
**Status:** Certified Calculation Engine (Internal Statutory Control)  
**Governing Baseline:** v1.5.7-p2.4-freeze (`3c7a496fefbe0b8c06e66e35ed98e267203fb23e`)

---

## 1. Supported States & Statutory Matrix

### A. Karnataka (KA)
- **Governing Legislation:** Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976 (amended by Karnataka Act No. 14 of 2023).
- **Effective Rule Version:** `2023-04-01` onwards.
- **Taxable Wage Definition:** Monthly Gross Salary / Wages earned in Karnataka.
- **Slab Schedule:**
  - Gross Monthly Salary < ₹25,000: ₹0 (Nil)
  - Gross Monthly Salary ≥ ₹25,000:
    - Normal Months (March to January): ₹200 / month
    - February (Correctional Month): ₹300 / month
    - Annualized Liability: ₹2,500 / year (₹200 × 11 + ₹300)
- **Gender Applicability:** Universal (no gender disparity; ₹25,000 threshold applies uniformly to all genders).
- **Registration Type:** PT-RC (Enrollment Certificate for Employers deducting tax from salary) / PT-EC (Self-employed / establishment certificate).
- **Filing Frequency:** Monthly (Form 5A return) due on or before the 20th of the succeeding month.
- **Payment & Challan:** Integrated e-Payment via Karnataka Commercial Taxes Department portal (e-Prerana / CTD Karnataka).
- **Portal Export Status:** `CALCULATION_CERTIFIED — UNVERIFIED_PORTAL_SCHEMA` (Official CSV schema requires portal testing; internal audit extract provided).

---

### B. Maharashtra (MH)
- **Governing Legislation:** Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975 (amended by Maharashtra Act No. VIII of 2023, effective 01-04-2023).
- **Effective Rule Version:** `2023-04-01` onwards.
- **Taxable Wage Definition:** Monthly Gross Salary / Emoluments earned in Maharashtra.
- **Gender Exemption & Slabs:**
  - **Females (Women Employees):**
    - Gross Monthly Salary ≤ ₹25,000: ₹0 (Nil exemption granted under 2023 amendment)
    - Gross Monthly Salary > ₹25,000:
      - Normal Months (March to January): ₹200 / month
      - February (Correctional Month): ₹300 / month
      - Annualized Liability: ₹2,500 / year
  - **Males (Men Employees):**
    - Gross Monthly Salary ≤ ₹7,500: ₹0 (Nil)
    - Gross Monthly Salary ₹7,501 to ₹10,000: ₹175 / month (every month)
    - Gross Monthly Salary > ₹10,000:
      - Normal Months (March to January): ₹200 / month
      - February (Correctional Month): ₹300 / month
      - Annualized Liability: ₹2,500 / year
- **Registration Type:** PT-RC (Form I/II) for tax deducted from employees; PT-EC (Form III) for employer corporate liability.
- **Filing Frequency:** Monthly / Annual based on liability scale (e-Mahagst portal). Monthly return due on or before the last day of the month.
- **Payment & Challan:** GRAS (Government Receipt Accounting System) / Mahagst PT-RC Challan Form MTR-6.
- **Portal Export Status:** `CALCULATION_CERTIFIED — UNVERIFIED_PORTAL_SCHEMA`.

---

### C. Telangana (TS)
- **Governing Legislation:** Telangana Tax on Professions, Trades, Callings and Employments Act, 1987 (adapted from AP Act 1987).
- **Effective Rule Version:** `2014-06-02` (adapted and ongoing).
- **Taxable Wage Definition:** Monthly Gross Salary earned in Telangana.
- **Slab Schedule:**
  - Gross Monthly Salary ≤ ₹15,000: ₹0 (Nil)
  - Gross Monthly Salary ₹15,001 to ₹20,000: ₹150 / month (Annual: ₹1,800)
  - Gross Monthly Salary > ₹20,000: ₹200 / month (Annual: ₹2,400)
- **February Adjustment:** None (standard ₹200 applies across all 12 calendar months).
- **Gender Applicability:** Universal (gender neutral).
- **Registration Type:** PT-RC (Commercial Taxes Department, Government of Telangana).
- **Filing Frequency:** Monthly (Form V return) due by 10th of succeeding month.
- **Payment & Challan:** TGCT (Telangana Commercial Taxes) online portal challan.
- **Portal Export Status:** `CALCULATION_CERTIFIED — UNVERIFIED_PORTAL_SCHEMA`.

---

### D. West Bengal (WB)
- **Governing Legislation:** West Bengal State Tax on Professions, Trades, Callings and Employments Act, 1979 (Schedule amended effective October 1, 2026).
- **Temporal Statutory Versions:**
  - **Version 1 (Pre-October 2026):**
    - Gross Monthly Salary ≤ ₹10,000: ₹0 (Nil)
    - Gross Monthly Salary ₹10,001 to ₹15,000: ₹110 / month
    - Gross Monthly Salary ₹15,001 to ₹25,000: ₹130 / month
    - Gross Monthly Salary ₹25,001 to ₹40,000: ₹150 / month
    - Gross Monthly Salary > ₹40,000: ₹200 / month
  - **Version 2 (Post-October 1, 2026 — Gazetted Amendment):**
    - Gross Monthly Salary ≤ ₹15,000: ₹0 (Nil, threshold raised)
    - Gross Monthly Salary ₹15,001 to ₹25,000: ₹130 / month
    - Gross Monthly Salary ₹25,001 to ₹40,000: ₹150 / month
    - Gross Monthly Salary > ₹40,000: ₹200 / month
- **February Adjustment:** None (fixed monthly slab deductions).
- **Gender Applicability:** Universal.
- **Registration Type:** PT-RC (Directorate of Commercial Taxes, West Bengal).
- **Payment & Challan:** GRIPS (Government Receipt Portal System) PT Challan.
- **Portal Export Status:** `CALCULATION_CERTIFIED — UNVERIFIED_PORTAL_SCHEMA`.

---

## 2. Explicitly Deferred States

### Tamil Nadu (TN)
- **Status:** DEFERRED.
- **Statutory Rationale:** In Tamil Nadu, Professional Tax is governed by Tamil Nadu Municipal Laws and levying/collection is decentralized at urban local body / municipal corporation level (e.g., Greater Chennai Corporation). Tax is semi-annual (half-yearly) based on 6-month aggregate gross salary, requiring half-yearly reconciliation rather than standard monthly payroll deductions. Preserved for Phase 2.10.

### Gujarat (GJ)
- **Status:** DEFERRED.
- **Statutory Rationale:** Gujarat Panchayats, Municipalities, Municipal Corporations and State Tax on Professions, Trades, Callings and Employments Act, 1976 features city/municipal-tier exemptions and decentralized collection across municipal limits vs panchayat areas. Slabs vary by localized notifications. Preserved for Phase 2.10.

---

## 3. Statutory Certification & Boundary Disclaimers

1. **Internal Statutory Control:** The OrbitHR Professional Tax engine executes deterministic, rule-based mathematical calculations verified against state gazette notifications.
2. **Disclaimer:** Calculations are labeled *"OrbitHR statutory calculation — Internal statutory control"*. OrbitHR does not claim direct unverified government server integrations. Export files are marked with `"X-OrbitHR-Statutory-Schema-Status: UNVERIFIED_PORTAL_SCHEMA"` until official portal ingestion APIs or certified batch file validators are contracted.
