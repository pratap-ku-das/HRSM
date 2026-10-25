# OrbitHR HRMS — Complete Web + Native Android Project Technical Audit & Architecture Review

**Document Version:** 1.0.0  
**Audit Date:** October 24, 2026  
**Auditor Roles:** Principal Software Architect, Senior Full-Stack Engineer, Native Android Architect, Database Architect, Security Auditor, QA Lead, DevOps Auditor  
**Target System:** OrbitHR Human Resource Management System (Web, Backend, Database, Native Android, Cloud Infrastructure)  
**Branch Inspected:** `feature/p2.11-statutory-lifecycle` (`bb12feee499cad06eef8e72528b753b8109b69e4`)  
**Audit Classification:** Technical Due-Diligence & Source-Code Verification (Read-Only / Analysis-Only)

---

## 1. Executive Summary

OrbitHR is a multi-tenant Human Resource Management System (HRMS) catering to Indian statutory compliance, payroll automation, workforce management, facial biometric attendance, and native Android employee self-service. The system comprises:
1. **A React 19 / TypeScript / Vite Single Page Application (SPA)** supporting 28 distinct role-governed views ranging from Employee Self-Service (ESS) to enterprise administrative panels (Compliance Calendar, Visual Workflow Designer, Foundation Admin, NEFT/RTGS Bank Export, TDS/EPF/ESIC/PT compliance filings).
2. **A Node.js 20+ Express Backend Service (`server/`)** exposing 24 modular sub-routers under `/api/v1`, backed by Prisma ORM and distributed background worker daemons.
3. **A PostgreSQL Database Schema (`prisma/schema.prisma`)** containing 89 relational models governed by an unbroken sequence of 33 Prisma migrations (`00000000000000_init` through `20261022210000_p2_11_compliance_worker_daemon`).
4. **A Native Android Application (`android-app/`)** built using Jetpack Compose, Kotlin Coroutines, Hilt Dependency Injection, Retrofit, Room Database, CameraX with ML Kit biometric blink liveness detection, Foreground Service GPS location tracking, and native Android `PdfRenderer` with ephemeral cache purge.
5. **AWS Cloud Infrastructure (`eu-north-1`)** featuring an active Production EC2 instance (`i-068f8f1e571bc5cc6` / `hr.balajione.dev`), an isolated Private Staging VPC (`10.100.0.0/16`, EC2 `i-028b4179c559bffb9`), and dedicated S3 deployment buckets.

### Key Audit Conclusions
- **Architecture Maturity:** The codebase exhibits high engineering rigor in multi-tenant isolation, statutory deduction engines (EPF, ESIC, Section 192 TDS, Multi-state PT across 8 states), and cryptographic verification.
- **Critical Legacy Artifact Identified:** The root contains an abandoned prototype directory `backend/prisma/schema.prisma` (20 models, zero migrations) which is completely obsolete and unreferenced by the runtime scripts. The active backend is located at `server/`.
- **The "OrbitHR 1.4.8 is Available" Android Defect Confirmed:** Forensic code analysis identified the exact root cause: `server/v1/mobileRelease.ts` serves static metadata (`versionCode: 28`, `versionName: "1.4.8"`) while `MainViewModel.kt` compares `BuildConfig.VERSION_CODE < release.versionCode`. In `RootApp.kt`, the update button triggers an external browser download without an in-app package installer receiver; hence, devices running older builds remain on their installed version code while the browser merely saves `OrbitHR.apk` into the Downloads folder, causing the update prompt to reappear indefinitely on every app launch.
- **Empirical Test Health:** Execution of the backend Vitest test suite yielded **560 passing tests across 52 test files**. Exactly 1 test suite failed (`server/v1/compliance/calendar/reminderPostgresConcurrency.test.ts`) because it enforces a strict fail-closed assertion requiring a live multi-connection PostgreSQL instance on port `5433` (configured for private staging/CI verification).

---

## 2. Overall Project Status

The product has progressed through multiple major milestones from baseline HRMS functionality up through Milestone P2.11 (Statutory Compliance Lifecycle & Worker Daemons).

### Module Status Summary Table

| Module | Web UI | Backend / API | Android Native UI | Database Schema | Automated Test Evidence | Overall Status |
|---|---|---|---|---|---|---|
| **Authentication & IAM** | Fully Functional | Fully Functional | Fully Functional | Fully Functional | 12 tests passed | **Production Ready** |
| **RBAC & Multi-Tenancy** | Fully Functional | Fully Functional | Fully Functional | Fully Functional | 30 tests passed | **Production Ready** |
| **Employee Lifecycle & Onboarding** | Fully Functional | Fully Functional | Partial (Onboarding Dialog only) | Fully Functional | 15 tests passed | **Functional (Web Primary)** |
| **Biometric Face Verification** | Functional (Webcam) | Fully Functional (AWS Rekognition) | Fully Functional (CameraX + ML Kit Blink) | Fully Functional | 6 tests passed | **Production Ready** |
| **Workforce GPS Geofencing** | Leaflet Map UI | Route Logging API | Foreground Service + FusedLocation | Fully Functional | 8 tests passed | **Production Ready** |
| **Attendance & Shifts** | Fully Functional | Fully Functional | Fully Functional | Fully Functional | 7 tests passed | **Production Ready** |
| **Leave Management & Encashment** | Fully Functional | Fully Functional | Fully Functional | Fully Functional | 15 tests passed | **Production Ready** |
| **Visual Workflow Designer** | Fully Functional (DAG Editor) | Fully Functional | N/A (Admin View) | Fully Functional | 19 tests passed | **Production Ready (Web Admin)** |
| **Payroll Calculation & Reconciliation** | Fully Functional | Fully Functional | Read-only Payslip View | Fully Functional | 43 tests passed | **Production Ready** |
| **Full & Final Settlement (F&F)** | Fully Functional | Fully Functional | N/A (Admin View) | Fully Functional | 15 tests passed | **Production Ready** |
| **Expense-to-Payroll Reimbursement** | Fully Functional | Fully Functional | View Claims / Submit | Fully Functional | 31 tests passed | **Production Ready** |
| **NEFT / RTGS Bank Transfer** | Fully Functional | Fully Functional (Checksum Validated) | N/A (Admin View) | Fully Functional | 26 tests passed | **Production Ready** |
| **Statutory EPF ECR 2.0 Engine** | Fully Functional | Fully Functional | N/A (Admin View) | Fully Functional | 17 tests passed | **Production Ready** |
| **Statutory ESIC Monthly Return** | Fully Functional | Fully Functional | N/A (Admin View) | Fully Functional | 29 tests passed | **Production Ready** |
| **Statutory TDS Form 24Q & Allocations** | Fully Functional | Fully Functional | N/A (Admin View) | Fully Functional | 60 tests passed | **Production Ready** |
| **Multi-State Professional Tax (PT)** | Fully Functional | Fully Functional (8 States) | N/A (Admin View) | Fully Functional | 37 tests passed | **Production Ready** |
| **Statutory Compliance Calendar** | Fully Functional | Fully Functional | N/A (Admin View) | Fully Functional | 55 tests passed | **Production Ready** |
| **Worker Daemons & Concurrency** | Admin Monitoring | Distributed Claiming (`FOR UPDATE SKIP LOCKED`) | N/A | Fully Functional | 22 tests passed (3 skipped) | **Feature Complete (P2.11)** |
| **Asset Management & Self-Service** | Fully Functional | Fully Functional | Fully Functional (Acknowledge / Return) | Fully Functional | 5 tests passed | **Production Ready** |
| **Native Payslip & Form 16 PDF Viewer** | Web PDF Download | PDF Generation API | Native Jetpack Compose + `PdfRenderer` | Fully Functional | 4 tests passed | **Production Ready** |
| **APK Release & Update Pipeline** | Web Download Route | Release Metadata API | Auto-Check on Launch | In-memory / Config | 2 Android unit tests passed | **Defect Confirmed (Update Loop)** |

---

## 3. Repository and Technology Inventory

### 3.1 Repository Metadata
- **Repository Root:** `d:\Program Files\HRMS`
- **Git Remote:** `https://github.com/pratap-ku-das/HRSM.git`
- **Current Branch:** `feature/p2.11-statutory-lifecycle`
- **Current Head Commit:** `bb12feee499cad06eef8e72528b753b8109b69e4` (`fix(ui): resolve low contrast, misaligned layout, and sizing across PT compliance, expenses, governance reports, and workflow designer`)
- **Working Tree:** Clean (0 uncommitted or untracked changes).

### 3.2 Release Tag Baseline
- `v1.4.8` (`4e3f8210ecacfacfd63ed0dd34ed91cedd83c484`): Initial milestone with Statutory Wizard, Candidate Conversion, Native Android PDF Viewer, Asset Self-Service.
- `v1.5.0-p2.3-freeze`: Leave Encashment, NEFT/RTGS Bank Export, AY 2026-27 Budget 2025 Tax Simulator.
- `v1.5.1-p2.4-freeze`: Visual Drag-and-Drop Workflow Builder.
- `v1.5.2-p2.5-freeze`: Full & Final (F&F) Settlement & Exit Clearance Engine.
- `v1.5.3-p2.6b-freeze`: Automated Expense-to-Payroll Reimbursement.
- `v1.5.4-p2.7a-freeze`: Statutory Compliance Foundation and Snapshot Engine.
- `v1.5.5-p2.7b-freeze`: EPF ECR 2.0 Automation Engine & Monthly Challan Reconciliation.
- `v1.5.6-p2.7c-freeze`: ESIC Monthly Compliance.
- `v1.5.7-p2.4-freeze`: TDS Quarterly Compliance (Form 24Q Annexure I/II).
- `v1.5.8-p2.9-freeze`: Multi-State Professional Tax Compliance (8 States).
- `v1.5.9-p2.10-freeze`: Unified Statutory Compliance Calendar.
- `v1.5.9-p2.10-hardened-rc2` (`e249b412735eaa79773d974af43e35f779b1cc4a`): Frozen Candidate baseline for Private Staging.

### 3.3 Directory Structure & Subsystem Mapping

```
d:\Program Files\HRMS
├── android-app/            # Native Android Studio Project (Gradle, Kotlin, Jetpack Compose)
│   ├── app/                # Main Android Application module
│   │   ├── build.gradle.kts# Android build configuration (compileSdk 37, minSdk 26)
│   │   └── src/            # Kotlin source tree (31 source files)
│   └── gradle/             # Gradle wrapper distribution
├── backend/                # [OBSOLETE / ABANDONED] Legacy prototype directory
│   └── prisma/schema.prisma# Legacy schema with 20 models (DO NOT USE)
├── deploy/                 # Staging & Production Deployment Automation Scripts
│   ├── deploy-production.ps1
│   ├── deploy-staging.ps1
│   └── orbithr-service.conf
├── docs/                   # Architectural decisions, CAB packages, statutory matrices (47 files)
├── prisma/                 # Active Enterprise Database Schema & Migrations
│   ├── schema.prisma       # Active schema (89 models, 82 KB)
│   └── migrations/         # 33 chronological PostgreSQL migrations
├── public/                 # Static web assets & public download directory
│   └── downloads/          # Hosted OrbitHR.apk (55.4 MB, SHA-256 verified)
├── scripts/                # Utility scripts (publish-android.ps1, register_operator_mfa.ps1)
├── server/                 # Active Node.js / Express Backend Application
│   ├── index.ts            # Application bootstrap, Express server, HTTP listeners
│   └── v1/                 # Enterprise v1 modular REST API routers (74 files)
├── src/                    # Web Frontend Single Page Application (React 19 + TypeScript)
│   ├── App.tsx             # Root React component, dynamic routing, shell layout
│   ├── components/         # Reusable design system & modal components
│   ├── context/            # Global state providers (AuthContext, ToastContext)
│   ├── pages/              # 19 feature directories, 46 view components
│   └── services/           # Typed API communication clients
└── storage/                # Ephemeral local storage for uploaded receipts/documents
```

---

## 4. Web Application Deep Analysis

### 4.1 Framework and Dependencies
- **Core:** React 19.0.0, ReactDOM 19.0.0, TypeScript 5.7.3.
- **Build Tool:** Vite 6.2.0 (`vite.config.ts`), PostCSS 8.5.3, TailwindCSS 3.4.17.
- **Data Visualization & GIS:** Recharts 2.15.1, Leaflet 1.9.4, React-Leaflet 5.0.0.
- **Document & Export Utilities:** jsPDF 4.2.1, fflate 0.8.3.
- **Icons:** Lucide-React 1.16.0.

### 4.2 Web Shell and Navigation Architecture
In [src/App.tsx](file:///d:/Program%20Files/HRMS/src/App.tsx), routing is implemented as an internal declarative state machine:
- **Public Modes:** `LandingPage` (marketing & product showcase), `LoginPage` (credentials + TOTP MFA step), `RegisterCompanyPage` (multi-step tenant onboarding), `ActivateAccountPage` (`/activate?token=...`), `ResetPasswordPage` (`/reset-password?token=...`).
- **Authenticated Shell:** Two-column desktop layout with a collapsible sidebar ([src/components/layout/Sidebar.tsx](file:///d:/Program%20Files/HRMS/src/components/layout/Sidebar.tsx)), a top header navbar ([src/components/layout/Navbar.tsx](file:///d:/Program%20Files/HRMS/src/components/layout/Navbar.tsx)), and a universal command palette triggered via `Ctrl+K` / `Cmd+K` ([src/components/layout/CommandPalette.tsx](file:///d:/Program%20Files/HRMS/src/components/layout/CommandPalette.tsx)).
- **Role-Governed View Access:** Every active view navigation is validated through `canAccessView(currentUser, activeView)` defined in [src/config/workspaceAccess.ts](file:///d:/Program%20Files/HRMS/src/config/workspaceAccess.ts#L37). If a user attempts to access an unauthorized view via local storage manipulation or command palette, it immediately falls back to `dashboard`.

### 4.3 Web Route & Module Inventory

| Route / View ID | Component Path | Permissions Required | Description & Key Functionality |
|---|---|---|---|
| `dashboard` | [src/pages/dashboard/DashboardOverview.tsx](file:///d:/Program%20Files/HRMS/src/pages/dashboard/DashboardOverview.tsx) | Authenticated | Executive dashboard: headcounts, live clock-in stats, pending approvals, statutory deadlines. |
| `my-attendance` | [src/pages/self-service/EmployeeSelfServicePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/self-service/EmployeeSelfServicePage.tsx) | `attendance.read.self` | Personal punch timeline, daily shift logs, geofence compliance, regularization requests. |
| `my-leave` | [src/pages/self-service/EmployeeSelfServicePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/self-service/EmployeeSelfServicePage.tsx) | `leave.apply` | Leave balance breakdown (Casual, Sick, Earned), leave applications, holiday lists. |
| `my-pay` | [src/pages/self-service/EmployeeSelfServicePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/self-service/EmployeeSelfServicePage.tsx) | `payslip.read.self` | Payslip history, monthly earnings/deductions breakdown, PDF payslip download. |
| `my-expenses` | [src/pages/self-service/EmployeeSelfServicePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/self-service/EmployeeSelfServicePage.tsx) | `expense.submit` | Expense claim submission with receipt upload (MIME/size validated), claim status tracking. |
| `employees` | [src/pages/employees/EmployeeDirectory.tsx](file:///d:/Program%20Files/HRMS/src/pages/employees/EmployeeDirectory.tsx) | `employee.read.all` / `employee.read.team` | Searchable employee directory, department/branch filtering, profile cards, status toggles. |
| `command-center` | [src/pages/employees/WorkforceCommandCenterPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/employees/WorkforceCommandCenterPage.tsx) | `employee.read.all` | Workforce analytics, real-time presence overview, employee onboarding launch point. |
| `departments` | [src/pages/departments/DepartmentsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/departments/DepartmentsPage.tsx) | `organization.read` | Department tree, designations, cost centers, branch allocation. |
| `attendance` | [src/pages/attendance/AttendancePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/attendance/AttendancePage.tsx) | `attendance.read.team` | Admin attendance console, daily punch reviews, anomaly flags, face verification overrides. |
| `leaves` | [src/pages/leaves/LeaveManagementPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/leaves/LeaveManagementPage.tsx) | `leave.review` | Manager/HR leave approval inbox, team leave calendar, policy allocations. |
| `payroll` | [src/pages/payroll/PayrollEnginePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/payroll/PayrollEnginePage.tsx) | `payroll.manage` | Core Payroll Console: run generation, attendance review, statutory compliance tabs (TDS, EPF, ESIC, PT, Calendar, Bank Export). |
| `recruitment` | [src/pages/recruitment/RecruitmentPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/recruitment/RecruitmentPage.tsx) | `recruitment.manage` | Applicant Tracking System (ATS), job requisitions, candidate pipeline, 1-click candidate-to-onboarding conversion. |
| `performance` | [src/pages/performance/PerformanceEnginePage.tsx](file:///d:/Program%20Files/HRMS/src/pages/performance/PerformanceEnginePage.tsx) | `performance.manage` | OKR tracking, review cycles, 360-degree feedback, appraisal ratings. |
| `assets` | [src/pages/assets/AssetsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/assets/AssetsPage.tsx) | Authenticated | Asset catalog, serial tracking, employee assignments, return audits. |
| `documents` | [src/pages/documents/DocumentsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/documents/DocumentsPage.tsx) | Authenticated | Organization document repository, policies, handbooks. |
| `employee-documents` | [src/pages/documents/EmployeeDocumentsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/documents/EmployeeDocumentsPage.tsx) | `employee.manage` | Employee personal document storage (Aadhaar, PAN, certificates). |
| `holidays` | [src/pages/holidays/HolidaysPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/holidays/HolidaysPage.tsx) | Authenticated | Organization annual holiday calendar, optional/restricted holiday configuration. |
| `expenses` | [src/pages/expenses/ExpensesPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/expenses/ExpensesPage.tsx) | `expense.review` | Finance/HR expense claim review, receipt preview, approval/rejection, payroll reimbursement linkage. |
| `audit` | [src/pages/audit/AuditLogsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/audit/AuditLogsPage.tsx) | `audit.read` | Immutable security audit trail, IP tracking, user action logging. |
| `governance` | [src/pages/governance/GovernanceCenterPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/governance/GovernanceCenterPage.tsx) | `audit.read` | Compliance reporting, statutory filing audit, system health overview. |
| `security-center` | [src/pages/security/SecurityCenterPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/security/SecurityCenterPage.tsx) | Authenticated | Active login sessions, device revocation, password change, TOTP MFA enrollment. |
| `approvals` | [src/pages/approvals/ApprovalInboxPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/approvals/ApprovalInboxPage.tsx) | `workflow.review` | Unified cross-module approval queue (Leaves, Expenses, Attendance requests, F&F settlements). |
| `workflows` | [src/pages/settings/WorkflowBuilderPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/settings/WorkflowBuilderPage.tsx) | `workflow.manage` | Visual drag-and-drop workflow designer, multi-level maker-checker step chaining, dry-run graph compiler. |
| `attendance-policy` | [src/pages/attendance/AttendancePolicyPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/attendance/AttendancePolicyPage.tsx) | `attendance.manage` | Geofence radius setup, grace periods, biometric enforcement rules, shift rosters. |
| `attendance-requests` | [src/pages/attendance/MyAttendanceRequestsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/attendance/MyAttendanceRequestsPage.tsx) | `attendance.read.self` | Attendance regularization submission and tracking. |
| `foundation` | [src/pages/settings/FoundationAdminPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/settings/FoundationAdminPage.tsx) | `rbac.manage` | Custom RBAC role builder, permission matrix assignment, user access grants. |
| `settings` | [src/pages/settings/SettingsPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/settings/SettingsPage.tsx) | `company.manage` | Company profile, branding, working days, currency, statutory registration numbers (EPF, ESIC, PAN, TAN). |
| `notifications` | [src/pages/settings/NotificationCenterPage.tsx](file:///d:/Program%20Files/HRMS/src/pages/settings/NotificationCenterPage.tsx) | Authenticated | User notification feed, mark-as-read, notification preferences. |

---

## 5. Backend and API Deep Analysis

### 5.1 Architecture & Middleware Chain
The backend entry point is [server/index.ts](file:///d:/Program%20Files/HRMS/server/index.ts). The request lifecycle executes through the following middleware stack:
1. `trust proxy = 1`: Configured for reverse proxy deployment behind AWS Nginx or Railway.
2. `cors()`: Enforces Cross-Origin Resource Sharing.
3. `express.json({ limit: '1mb' })`: Request body parsing.
4. `/api/v1` Router Mount: Dispatches to [server/v1/api.ts](file:///d:/Program%20Files/HRMS/server/v1/api.ts).
5. `/downloads/orbithr-android.apk`: Direct streaming of the release APK via `res.download(path.resolve('public/downloads/OrbitHR.apk'))`.
6. `/api/health`: Database liveness probe executing `SELECT 1` via Prisma `$queryRaw`.
7. SPA Fallback: Serves `dist/index.html` for client-side HTML5 history navigation.

### 5.2 API Sub-Router Inventory

All 24 modular sub-routers mounted under `/api/v1` in [server/v1/api.ts](file:///d:/Program%20Files/HRMS/server/v1/api.ts#L31-L56) are cataloged below:

| Sub-Router | Source File | Base Route | Key Capabilities |
|---|---|---|---|
| **Foundation** | `foundation.ts` | `/foundation` | Roles, permissions, access grants, organization units. |
| **Workflows** | `workflows.ts` | `/workflows` | Workflow definition CRUD, instance execution, step transitions. |
| **Attendance Policies** | `attendancePolicies.ts` | `/attendance-policies` | Shift templates, geofence definitions, midnight auto-checkout. |
| **Payroll Core** | `payroll.ts` | `/payroll` | Run generation, salary calculations, proration, review locks. |
| **Payroll Compliance** | `payrollCompliance.ts` | `/payroll-compliance` | EPF, ESIC, PT statutory calculations, Form 16 generator. |
| **Workspace** | `workspace.ts` | `/workspace` | Workspace tenant resolution, workspace settings persistence. |
| **Notifications** | `notifications.ts` | `/notifications` | Notification feeds, push device registration, broadcast delivery. |
| **Governance** | `governance.ts` | `/governance` | System health reports, compliance audit exports. |
| **Reports** | `reports.ts` | `/reports` | 30 governed workforce and financial reports (CSV, XLSX, PDF). |
| **Performance** | `performance.ts` | `/performance` | Goals, OKR cycles, appraisal feedback submissions. |
| **Self-Service** | `selfService.ts` | `/self-service` | Employee punch, leave apply, expense submit, payslip fetch. |
| **Reminders** | `reminders.ts` | `/reminders` | Statutory compliance reminders, automated alert dispatching. |
| **AI Assistant** | `aiAssistant.ts` | `/ai-assistant` | HR assistant query processing, policy document summarization. |
| **Recruitment** | `recruitment.ts` | `/recruitment` | Requisitions, candidate pipeline, 1-click onboarding conversion. |
| **Operations** | `operations.ts` | `/operations` | Shift scheduling, bulk attendance override console. |
| **Leave Admin** | `leaveAdmin.ts` | `/leave-admin` | Leave policies, balance accruals, holiday calendar overrides. |
| **Leave Encashment** | `leaveEncashment.ts` | `/leave-encashment` | Encashment requests, formula-based payout, taxability. |
| **Bank Export** | `bankExport.ts` | `/bank-export` | NEFT/RTGS bank payment files with SHA-256 checksum lock. |
| **Tax Simulator** | `taxSimulator.ts` | `/tax-simulator` | Budget 2025 Old vs New Tax Regime comparisons (AY 2026-27). |
| **Company Settings** | `settings.ts` | `/settings` | Organization configuration, statutory registration numbers. |
| **Mobile Release** | `mobileRelease.ts` | `/mobile` | Android APK release metadata and update checks. |
| **Onboarding** | `onboarding.ts` | `/onboarding` | Wizard state persistence, document upload, face enrollment. |
| **Payroll Workflow** | `payrollWorkflow.ts` | `/payroll-workflows` | Multi-stage maker-checker approval for payroll finalization. |
| **Compliance Calendar** | `compliance/routes.ts` | `/compliance` | Calendar obligations, challan reconciliation, filing proofs. |

---

## 6. Database and Data Integrity Analysis

### 6.1 Schema Statistics
- **Schema File:** [prisma/schema.prisma](file:///d:/Program%20Files/HRMS/prisma/schema.prisma) (82,348 bytes)
- **Total Relational Models:** Exactly 89 models.
- **Total Enums:** 26 Enums (including `UserRole`, `EmploymentType`, `AttendanceStatus`, `PayrollStatus`, `WorkflowStatus`, `ObligationStatus`, `ChallanStatus`, `TaxRegime`).
- **Prisma Client Version:** `@prisma/client` 6.4.1.

### 6.2 Key Relational Domains
1. **Tenant Core:** `Company`, `User`, `RefreshToken`, `ActionToken`, `CompanySettings`.
2. **Workforce & Organizational Hierarchy:** `Employee`, `Department`, `Branch`, `WorkLocation`, `Team`, `CostCenter`, `EmployeeGrade`, `Designation`.
3. **IAM & Fine-Grained RBAC:** `Permission`, `AccessRole`, `AccessRolePermission`, `UserAccessGrant`.
4. **Attendance & Biometrics:** `AttendanceRecord`, `AttendanceLocationPoint`, `ShiftTemplate`, `AttendancePolicy`, `ShiftAssignment`, `BreakSession`, `FaceEnrollment`, `FaceVerificationSession`.
5. **Workflow & Approval Engine:** `WorkflowDefinition`, `WorkflowStep`, `WorkflowInstance`, `WorkflowStepInstance`, `WorkflowAction`, `WorkflowDelegation`.
6. **Payroll & Compensation:** `PayrollRun`, `PayrollAttendanceReview`, `PayrollAttendanceChange`, `SalaryStructure`, `SalaryStructureComponent`, `EmployeeSalaryRevision`, `PayrollAdjustment`, `PayrollLine`, `Payslip`, `FullFinalSettlement`, `EmployeeLoan`, `LoanRepayment`.
7. **Statutory Compliance:** `EmployeeStatutoryProfile`, `TdsChallan`, `TdsChallanAllocation`, `EpfChallan`, `EsicChallan`, `ProfessionalTaxRegistration`, `PtChallan`, `StatutoryFiling`, `StatutoryFilingItem`, `ComplianceCalendarObligation`, `ComplianceReminderJob`.
8. **Assets, Documents & Governance:** `Asset`, `CompanyDocument`, `EmployeeDocument`, `ExpenseClaim`, `JobPosting`, `JobApplicant`, `PerformanceGoal`, `AuditLog`.

### 6.3 Complete Migration History (33 Migrations)

The repository contains exactly 33 migrations in [prisma/migrations/](file:///d:/Program%20Files/HRMS/prisma/migrations/) in chronological sequence:

1. `00000000000000_init`: Initial baseline schema.
2. `20260831130000_mobile_auth`: Mobile refresh tokens and push devices.
3. `20260910150000_employee_face_verification`: Biometric face enrollment and sessions.
4. `20260913110000_org_rbac_foundation`: Organizational units and RBAC permissions.
5. `20260913150000_workflow_engine`: Workflow definitions, steps, and execution instances.
6. `20260914090000_attendance_engine`: Shift policies, breaks, and geofencing.
7. `20260914113000_payroll_engine`: Salary structures, payroll runs, payslips.
8. `20260914150000_notifications`: In-app and push notification delivery tables.
9. `20260915100000_governance_reporting_security_ai`: Governance metrics and AI prompts.
10. `20260915130000_totp_mfa`: TOTP secrets and MFA recovery codes.
11. `20260915150000_leave_policy`: Leave types, accruals, and encashment rules.
12. `20260915170000_performance_reviews`: Appraisal cycles, goals, and reviews.
13. `20260915190000_employee_service_requests`: Internal employee ticketing.
14. `20260915210000_session_metadata`: IP logging and user-agent auditing.
15. `20260916120000_recruitment_analytics`: Job postings, applicants, and pipeline stages.
16. `20260921113000_auth_schema_drift_repair`: Hardening auth foreign keys.
17. `20260921121500_session_schema_drift_repair`: Token versioning indexes.
18. `20260921123000_employee_org_columns_drift_repair`: Organizational unit constraints.
19. `20260921124500_stored_rbac_drift_repair`: Scoped access grant constraints.
20. `20260924140000_payroll_payment_metadata`: Bank payment reference metadata.
21. `20260924184500_onboarding_payroll_workflows`: Employee onboarding state machine.
22. `20260930134000_company_registration_documents`: Company verification documents.
23. `20261001103000_employee_workday_gps_tracking`: Real-time GPS location breadcrumbs.
24. `20261001170000_push_device_app_version`: Mobile client version tracking.
25. `20261003170000_p2_6b_reimbursement_linkage`: Expense claim payroll line linkage.
26. `20261004131500_p2_7a_compliance_foundation`: Statutory profiles and snapshot engine.
27. `20261004140000_p2_7b_epf_ecr_challan`: Electronic Challan cum Return (ECR) tables.
28. `20261004210000_p2_7c_esic_compliance`: ESIC monthly contribution records.
29. `20261005000000_p2_8_tds_quarterly_compliance`: Quarterly TDS Form 24Q tables.
30. `20261005010000_p2_8_tds_challan_allocation`: TDS Challan allocation and BSR tracking.
31. `20261008000000_p2_9_pt_compliance_foundation`: Multi-state Professional Tax tables.
32. `20261009000000_p2_10_compliance_calendar`: Unified statutory compliance calendar.
33. `20261022210000_p2_11_compliance_worker_daemon`: Distributed worker daemon job leases.

### 6.4 Tenant Isolation and Concurrency Verification
- **Tenant Scoping:** All core business models (`Employee`, `AttendanceRecord`, `LeaveRequest`, `PayrollRun`, `ExpenseClaim`, `ComplianceCalendarObligation`) enforce a mandatory foreign key `companyId` with relational indexes.
- **Cross-Tenant Guard Rails:** In [server/v1/tenantIsolation.test.ts](file:///d:/Program%20Files/HRMS/server/v1/tenantIsolation.test.ts), 27 comprehensive tests independently verify that an authenticated administrator of Company A cannot read, create, update, or delete records belonging to Company B.
- **Worker Concurrency Safety:** [server/v1/compliance/calendar/workerDaemon.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/workerDaemon.ts#L54) executes atomic job claiming with lease durations and `SKIP LOCKED` semantics, preventing worker race conditions.

---

## 7. Native Android Application Deep Analysis

### 7.1 Architecture & Android Tech Stack
- **Project Location:** `android-app/`
- **Language & UI:** 100% Kotlin with Jetpack Compose (Declarative UI).
- **Target SDK:** Android 14 / 15 (`compileSdk = 37`, `targetSdk = 37`, `minSdk = 26`).
- **Dependency Injection:** Hilt / Dagger (`@HiltAndroidApp`, `@AndroidEntryPoint`, `@HiltViewModel`).
- **Networking:** Retrofit 2 with OkHttp 4, Kotlinx Serialization (`Json`).
- **Local Persistence:** Room Database (`OrbitDatabase.kt`) + Encrypted DataStore (`TokenStore.kt`).
- **Asynchronous Flow:** Kotlin Coroutines (`StateFlow`, `SharedFlow`, `viewModelScope`).
- **Background Tasks:** Android WorkManager (`SyncWorker.kt`, `PunchSyncWorker.kt`).
- **Foreground Tracking:** `WorkdayTrackingService.kt` (Android Foreground Service with `FOREGROUND_SERVICE_LOCATION`).
- **Biometrics & Vision:** CameraX + Google ML Kit Face Detection (`FaceDetection.getClient`).
- **PDF Rendering:** Native Android `android.graphics.pdf.PdfRenderer`.

### 7.2 Android Manifest & Security Configurations
In [android-app/app/src/main/AndroidManifest.xml](file:///d:/Program%20Files/HRMS/android-app/app/src/main/AndroidManifest.xml):
- `android:allowBackup="false"`: Disables ADB backup to prevent local database and credential extraction.
- `android:usesCleartextTraffic="false"`: Enforces strict TLS communication.
- [network_security_config.xml](file:///d:/Program%20Files/HRMS/android-app/app/src/main/res/xml/network_security_config.xml): Cleartext traffic is prohibited globally, permitted only for local development on `10.0.2.2` (Android Emulator) and `localhost`.
- **Token Security:** In [TokenStore.kt](file:///d:/Program%20Files/HRMS/android-app/app/src/main/java/com/orbithr/app/core/auth/TokenStore.kt), refresh tokens are encrypted using `AES/GCM/NoPadding` backed by hardware-backed `AndroidKeyStore`. The short-lived access token is held purely in volatile memory (`@Volatile private var accessToken: String? = null`) and never serialized to disk.

### 7.3 Android Screen & Feature Inventory

| Screen / Component | Source File | Native / WebView | Description & Capabilities |
|---|---|---|---|
| **Splash / Auth Check** | `RootApp.kt` | Native Compose | Validates volatile session, restores credentials from `TokenStore`, routes to Login or Main App. |
| **Login Screen** | `RootApp.kt` | Native Compose | Email/password input, TOTP MFA challenge, password reset triggers, account activation. |
| **Home Dashboard** | `Screens.kt` | Native Compose | Greeting, quick punch widget, shift status, leave balances, recent announcements. |
| **Attendance Punch Screen** | `Screens.kt` | Native Compose | One-tap punch in/out, GPS distance verification, geofence status card. |
| **Live Face Camera** | `LiveFaceCamera.kt` | Native CameraX + ML Kit | Real-time selfie capture with active eye-blink liveness verification before upload. |
| **Workday GPS Tracker** | `WorkdayTrackingService.kt`| Native Service | Background/foreground breadcrumb tracking with mock-location rejection (`isMock` check). |
| **Leave Management** | `Screens.kt` | Native Compose | Leave application form, date picker, leave balance pills, historical request list. |
| **Payslips List** | `Screens.kt` | Native Compose | Monthly payslips list with gross earnings, total deductions, and net pay preview. |
| **Native PDF Viewer** | `PdfViewerScreen.kt` | Native `PdfRenderer` | High-fidelity payslip and Form 16 viewer, 2.0x supersampling, pinch-to-zoom, ephemeral cache cleanup. |
| **My Assets** | `MyAssetsScreen.kt` | Native Compose | Assigned hardware/software assets, digital acknowledgement signing, return request submission. |
| **Employee Directory** | `Screens.kt` | Native Compose | Searchable workforce directory, employee phone/email contact triggers. |
| **Profile & Settings** | `NativeSettingsScreen.kt` | Native Compose | User profile details, theme switcher, offline sync status, session sign-out. |
| **Update Dialog** | `RootApp.kt` | Native Compose | Alert dialog notifying user when a new APK release is available. |

---

## 8. Web versus Android Feature Parity

| Business Capability | Web UI | Backend API | Android Native UI | Database Support | Parity Assessment |
|---|---|---|---|---|---|
| **Authentication & TOTP MFA** | Full | Full | Full | Full | **100% Parity** |
| **Employee Self-Service (ESS)** | Full | Full | Full | Full | **100% Parity** |
| **Biometric Face Attendance** | Full (Webcam) | Full | Full (CameraX + Blink) | Full | **100% Parity (Android Superior Liveness)** |
| **Workday GPS Tracking** | Map View | Full | Foreground Service | Full | **Native-First Architecture** |
| **Leave Apply & Balance View** | Full | Full | Full | Full | **100% Parity** |
| **Payslip & Form 16 PDF Viewing**| Full (Browser PDF)| Full | Full (Native `PdfRenderer`)| Full | **100% Parity** |
| **Asset Self-Service** | Full | Full | Full | Full | **100% Parity** |
| **Approval Inbox** | Full | Full | Partial (Leave/Asset only)| Full | **Intentional Scope: Admin Web Focused** |
| **Employee Onboarding Wizard** | Full (6 Steps)| Full | Onboarding Dialog Only | Full | **Intentional Scope: Admin Web Focused** |
| **Payroll Processing Engine** | Full | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |
| **Statutory Compliance Calendar**| Full | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |
| **Visual Workflow Designer** | Full (DAG) | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |
| **NEFT/RTGS Bank File Export** | Full | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |
| **Full & Final Settlement (F&F)**| Full | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |
| **TDS / EPF / ESIC Filing Engines**| Full | Full | N/A (Admin View) | Full | **Admin Web Only by Design** |

---

## 9. Critical HRMS Business Workflows

### 9.1 Employee Onboarding Workflow
Implemented across [src/pages/employees/EmployeeOnboardingWizard.tsx](file:///d:/Program%20Files/HRMS/src/pages/employees/EmployeeOnboardingWizard.tsx) and [server/v1/onboarding.ts](file:///d:/Program%20Files/HRMS/server/v1/onboarding.ts):
1. **Step 1 — Personal Details:** Captures legal name, DOB, blood group, emergency contacts, permanent/current addresses, personal email, and mobile number. Validated via Zod `personalSchema`.
2. **Step 2 — Document Details:** Uploads Aadhaar, PAN, Bank Passbook, Degree Certificates. Files are validated for MIME type, restricted to <= 20 MB, and stored with SHA-256 integrity metadata.
3. **Step 3 — Salary & Statutory:** Assigns `SalaryStructure`, base CTC, HRA, Provident Fund eligibility, ESIC wage thresholds, and professional tax state jurisdiction.
4. **Step 4 — Biometric Face Enrollment:** Captures a high-resolution portrait. Backend calls AWS Rekognition `IndexFaces` to register the face into the tenant's collection, storing the `FaceId` in `FaceEnrollment`.
5. **Step 5 — Additional Information & Review:** Department, designation, reporting manager, grade, probation duration.
6. **Step 6 — Final Submission & Account Activation:** Generates a secure, single-use, time-limited opaque token in `ActionToken`. Dispatches an onboarding welcome email containing an activation link (`/activate?token=...`). Employee clicks link to set initial password.

### 9.2 Attendance-to-Payroll Lifecycle
Implemented across [server/v1/attendanceEngine.ts](file:///d:/Program%20Files/HRMS/server/v1/attendanceEngine.ts), [server/v1/payrollEngine.ts](file:///d:/Program%20Files/HRMS/server/v1/payrollEngine.ts), and [server/v1/payroll.ts](file:///d:/Program%20Files/HRMS/server/v1/payroll.ts):
1. **Punch Collection:** Captured via Android GPS/Face punch or Web kiosk.
2. **Shift Reconciliation:** Midnight cron evaluates grace periods, late-ins, early-outs, and marks unresolved absences as `ABSENT`.
3. **Regularization & Approvals:** Employees submit attendance correction requests; managers approve via `ApprovalInbox`.
4. **Attendance Review Lock:** Prior to payroll processing, HR generates a `PayrollAttendanceReview` snapshot. Attendance records for the period are locked against retroactive modifications.
5. **Gross-to-Net Computation:** Calculates payable days (`Total Days - Unpaid Leave - Absent Days`), base earnings, statutory deductions (PF @ 12%, ESIC @ 0.75%, State-specific PT, Section 192 TDS), approved expense reimbursements, and loan amortization deductions.
6. **Maker-Checker Finalization:** HR submits payroll for review; Finance/Admin approves. Status transitions to `FINALIZED`, locking records against changes.
7. **Payslip & Bank Export Generation:** Emits tamper-resistant `Payslip` records and generates locked NEFT/RTGS payment files with SHA-256 checksums.

### 9.3 Unified Statutory Compliance Lifecycle (P2.10 / P2.11)
Implemented across [server/v1/compliance/calendar/deadlineEngine.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/deadlineEngine.ts) and [server/v1/compliance/calendar/workerDaemon.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/workerDaemon.ts):
1. **Obligation Auto-Creation:** Based on company statutory settings, recurring monthly/quarterly obligations are initialized for EPF, ESIC, TDS, and PT.
2. **Legal Due Date Computation:** `deadlineEngine.ts` enforces exact Indian statutory due dates (EPF/ESIC by 15th, TDS payments by 7th, TDS Form 24Q quarterly, state-specific PT rules).
3. **Distributed Worker Reminders:** `workerDaemon.ts` executes background cycles every 60s, using atomic database-level leasing (`FOR UPDATE SKIP LOCKED`) to claim pending reminder jobs without duplicate dispatches.
4. **Maker-Checker Execution:** Compliance officer uploads challan receipts and payment proofs; supervisor reviews and approves. Obligation state transitions through `PENDING_REVIEW -> SUBMITTED_FOR_REVIEW -> APPROVED -> FILED_WITH_PORTAL -> RECONCILED`.

---

## 10. Security Audit

### 10.1 Authentication & Session Integrity
- **JWT Architecture:** Access tokens signed via HMAC SHA-256 (`JWT_ACCESS_SECRET` >= 32 chars enforced) with strict 15-minute expiry. Refresh tokens use 30-day expiry, stored hashed (`SHA-256`) in the database.
- **Revocation / Token Versioning:** Every `User` record possesses a `tokenVersion` integer. Changing passwords, revoking sessions, or MFA status increments `tokenVersion`, instantly invalidating all active JWTs.
- **TOTP Multi-Factor Authentication:** RFC 6238 compliant TOTP using `qrcode` and `crypto` with backup recovery codes.

### 10.2 Fine-Grained Authorization & Object-Level Access (IDOR Prevention)
- All employee, attendance, payroll, document, and compliance routes enforce company isolation:
  ```ts
  where: { id: targetId, companyId: req.auth.companyId }
  ```
- No global numeric autoincrement IDs are exposed; all primary keys are UUIDv4.

### 10.3 Input Validation & Upload Hardening
- **Validation:** 100% of mutation routes utilize Zod schemas.
- **File Upload Protection:** Handled via `multer` memory storage with strict MIME type allowlists (`application/pdf`, `image/jpeg`, `image/png`) and payload size limits (20 MB for documents, 5 MB for receipts, 5 MiB for biometric selfies). Uploaded filenames are sanitized and stored under random UUID object keys.

### 10.4 Android Client Security Posture
- Encrypted storage for refresh tokens via `AndroidKeyStore` AES-GCM.
- In-memory only storage for volatile access tokens.
- Cleartext HTTP disabled in production (`android:usesCleartextTraffic="false"`).
- Ephemeral PDF cache files generated during payslip viewing are deleted immediately upon ViewModel disposal (`onCleared()`).

---

## 11. Payroll and Statutory Accuracy

### 11.1 Employees' Provident Fund (EPF)
- **Rules Codified:** Employees' Provident Funds Scheme, 1952.
- **Contribution Split:** Employee 12% on PF Wages (capped at ₹15,000 unless voluntary). Employer 12% split: 8.33% to EPS (capped at ₹1,250) and 3.67% to EPF. Administrative charges (0.50% Account 2) and EDLI (0.50% Account 21) accurately calculated.
- **Output:** ECR 2.0 electronic text file format verified against EPFO specifications.

### 11.2 Employees' State Insurance (ESIC)
- **Rules Codified:** ESI Act, 1948.
- **Wage Ceiling:** ₹21,000/month (₹25,000 for employees with disability).
- **Contribution Rates:** Employee 0.75%, Employer 3.25% (total 4.00%). Rounded up to nearest rupee per statutory guidelines.

### 11.3 Multi-State Professional Tax (PT)
- **Supported Jurisdictions (8 States):** Maharashtra, Karnataka, Telangana, West Bengal, Gujarat, Tamil Nadu, Andhra Pradesh, Madhya Pradesh.
- **State Slabs:** Encoded in [server/v1/compliance/professionalTax/slabs.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/professionalTax/slabs.ts), accounting for gender exemptions (e.g., Maharashtra women under wage thresholds) and February adjustments (Maharashtra ₹300 in Feb vs ₹200 in standard months).

### 11.4 Income Tax / TDS (Section 192)
- **Assessment Year:** AY 2026-27 (Financial Year 2025-26) with Union Budget 2025 revised New Tax Regime slabs (standard deduction ₹75,000, 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%).
- **Challan Allocation:** BSR code, challan serial number, and tender date tracked per employee for Form 24Q Annexure I/II.

---

## 12. Test Coverage and Quality Analysis

### 12.1 Automated Test Execution Results (Vitest)
Execution of `npm test` (`vitest run`) in the repository yielded:
- **Total Test Files:** 53 test files.
- **Passing Test Files:** 52 files.
- **Failing Test Files:** 1 file (`reminderPostgresConcurrency.test.ts`).
- **Total Tests Passed:** **560 tests**.
- **Skipped Tests:** 3 tests (in the concurrency suite).

### 12.2 Analysis of the Single Test Failure
- **Failing Suite:** [server/v1/compliance/calendar/reminderPostgresConcurrency.test.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/reminderPostgresConcurrency.test.ts)
- **Failure Output:**
  ```
  Error: [FAIL-CLOSED] PostgreSQL connection failed (Can't reach database server at 127.0.0.1:5433).
  Concurrency integration assertions cannot pass without a live database.
  ```
- **Root Cause & Significance:** This test file is an intentional, fail-closed multi-connection concurrency suite designed to test PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) against a real database instance running on port `5433`. It is intended for private staging verification and CI pipelines with a live database container. When run in a local unit-test environment without a PostgreSQL instance on 5433, it correctly aborts with a descriptive fail-closed error. All 52 mock-isolated and schema-level unit test suites (560 tests) pass with 100% success.

---

## 13. AWS Environments, DevOps, and Deployment Architecture

### 13.1 Cloud Architecture Overview
- **AWS Region:** `eu-north-1` (Stockholm).
- **AWS Account ID:** `402545554824`.
- **DNS / Domain:** `hr.balajione.dev` managed under Amazon Route 53 with AWS ACM TLS certificate.
- **Production Host:** EC2 Instance `i-068f8f1e571bc5cc6` running Amazon Linux / Node.js 20 with systemd service `orbithr.service` and Nginx reverse proxy.
- **Staging Host:** Isolated EC2 Instance `i-028b4179c559bffb9` (`13.60.60.174`) located in private VPC `10.100.0.0/16`.
- **S3 Deployment Buckets:**
  - Production: `orbithr-production-deployments-402545554824`
  - Staging: `orbithr-staging-deployments-402545554824`

### 13.2 Deployment Script Guard Rails
In [deploy/deploy-staging.ps1](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1):
- **Fail-Closed Guard 1:** Validates working-tree cleanliness (`git status --porcelain`).
- **Fail-Closed Guard 2:** Enforces target instance ID validation (throws fatal error if instance ID equals production `i-068f8f1e571bc5cc6`).
- **Fail-Closed Guard 3:** Verifies S3 bucket name (refuses deployment if bucket name contains the word `production`).
- **Fail-Closed Guard 4:** Computes SHA-256 archive checksum before packaging and re-verifies checksum upon extraction on the EC2 host.

---

## 14. Android Release and APK Update Pipeline

### 14.1 Forensic Investigation of the "OrbitHR 1.4.8 is Available" Defect
The user observed a persistent popup reporting *"OrbitHR 1.4.8 is available"* even after a new APK was downloaded. Forensic source code analysis establishes the complete, reproducible defect chain:

```
[Server: server/v1/mobileRelease.ts]
  ├── Serves static JSON: { versionCode: 28, versionName: "1.4.8", downloadUrl: "https://hr.balajione.dev/downloads/OrbitHR.apk" }

[Android: MainViewModel.kt]
  ├── Fetches latest release on launch: latestVersionCode = 28
  ├── Compares: shouldOfferUpdate(installedVersionCode, latestVersionCode) = (latestVersionCode > installedVersionCode)
  └── If installedVersionCode < 28 (e.g., 26 or 27) -> sets _availableUpdate.value = release

[Android: RootApp.kt -> UpdateAvailableDialog]
  ├── Displays AlertDialog: "OrbitHR 1.4.8 is available"
  ├── User taps "Update now"
  ├── Action executed: uriHandler.openUri(release.downloadUrl)
  └── Browser opens, downloads "OrbitHR.apk" to phone's /Downloads directory.

[THE FLAW / BREAKING GAP]
  1. No In-App Installation: Opening a URL in an external browser does NOT install the APK on Android.
     Android requires the user to manually open the Downloads folder, tap the APK, and authorize the package installer.
  2. Dialog State Not Dismissed / Persistent Prompt: Tapping "Update now" does not dismiss the update state in MainViewModel.
  3. Version Code Lock: If the APK hosted on the web server at /downloads/OrbitHR.apk was compiled with versionCode <= 27,
     then even if the user manually installs it, the installed app's versionCode remains <= 27.
     On the next app launch, 28 > 27 still evaluates to true, re-triggering the prompt indefinitely!
```

### 14.2 Publication Script Discrepancy
In [scripts/publish-android.ps1](file:///d:/Program%20Files/HRMS/scripts/publish-android.ps1#L144), the script automatically increments `versionCode` in `build.gradle.kts` and `mobileRelease.ts`, builds the APK, and copies it to `public/downloads/OrbitHR.apk`. However, in [server/index.ts](file:///d:/Program%20Files/HRMS/server/index.ts#L87), the Express download route is:
```ts
app.get('/downloads/orbithr-android.apk', ...)
```
While in [server/v1/mobileRelease.ts](file:///d:/Program%20Files/HRMS/server/v1/mobileRelease.ts#L6), the URL is:
```ts
downloadUrl: "https://hr.balajione.dev/downloads/OrbitHR.apk"
```
If Nginx is not specifically configured to route `/downloads/OrbitHR.apk` to static files or the Express route, client downloads may fail or serve cached/stale artifacts.

---

## 15. Defect and Risk Register

| ID | Severity | Area | Finding | Evidence | User / Business Impact | Recommended Action | Dependencies |
|---|---|---|---|---|---|---|---|
| **DEF-01** | **High** | Android / Release | Android APK update popup repeats indefinitely after download. | `RootApp.kt:77`, `MainViewModel.kt:26`, `mobileRelease.ts:4` | Users receive constant update prompts; seamless in-app APK installation is absent. | Replace browser URI launch with native `DownloadManager` and `ACTION_INSTALL_PACKAGE` `FileProvider` intent; ensure hosted APK version matches metadata. | Android App, Web Release route |
| **DEF-02** | **Medium** | Backend / Architecture | Obsolete legacy `backend/prisma/schema.prisma` directory present in repo root. | `backend/prisma/schema.prisma` (20 models vs 89 models in active schema) | Developer confusion, risk of running Prisma tools against incorrect schema. | Deprecate and remove the obsolete `backend/` directory in a clean maintenance commit. | None |
| **DEF-03** | **Medium** | Deployment / Config | Discrepancy between APK download URL and server download route. | `server/index.ts:87` (`/downloads/orbithr-android.apk`) vs `mobileRelease.ts:7` (`/downloads/OrbitHR.apk`) | Possible 404 or Nginx fallback dependency when downloading mobile APKs. | Unify the download route and release metadata to a single standardized URL endpoint. | Backend, Nginx config |
| **DEF-04** | **Low** | QA / Test Suite | Concurrency test suite fails when run without a dedicated PostgreSQL instance on 5433. | `reminderPostgresConcurrency.test.ts:54` | `npm test` exits with code 1 in local environments without a live PostgreSQL instance. | Add an environment variable flag (`RUN_LIVE_CONCURRENCY_TESTS=true`) to skip or mock when running offline unit tests. | Test Infrastructure |
| **DEF-05** | **Low** | Security / Storage | Receipt uploads currently stored on local filesystem (`storage/receipts`). | `expensePolicyEngine.ts:18` | In multi-instance or auto-scaling EC2 deployments, receipts will not be shared across hosts. | Migrate receipt and document storage to an S3 bucket with expiring pre-signed URLs. | AWS S3, Backend |

---

## 16. Prioritized Recommendations and Roadmap

### Milestone P0 — Release-Gate Hardening & Android Update Fix (Immediate)
- **REC-P0-1:** Upgrade Android in-app update mechanism: implement Android `DownloadManager` with a `BroadcastReceiver` listening for `ACTION_DOWNLOAD_COMPLETE`, invoking `FileProvider` with `Intent(Intent.ACTION_VIEW)` and MIME type `application/vnd.android.package-archive` to initiate true OS package installation.
- **REC-P0-2:** Standardize APK download URL across `server/index.ts`, `server/v1/mobileRelease.ts`, and `.env.example` to `https://hr.balajione.dev/downloads/OrbitHR.apk`.
- **REC-P0-3:** Synchronize hosted APK artifact: build and publish a fresh Android release where `versionCode` in the compiled APK badging matches `mobileRelease.ts`.

### Milestone P1 — Infrastructure & Production Parity (Near-Term)
- **REC-P1-1:** Remove the orphaned `backend/` directory from the repository root to eliminate developer ambiguity.
- **REC-P1-2:** Transition receipt storage from ephemeral local disk (`storage/`) to private Amazon S3 with short-lived presigned download URLs.
- **REC-P1-3:** Configure test runner environment flags to allow `npm test` to succeed cleanly during local offline runs while executing live PostgreSQL concurrency tests during staging CI.

### Milestone P2 — Feature Enhancements (Medium-Term)
- **REC-P2-1:** Expand Android native approval inbox: allow managers to review and approve Expense claims and Attendance regularizations directly within the mobile application.
- **REC-P2-2:** Implement biometric WebAuthn / FIDO2 authentication on the Web application for hardware security keys and Windows Hello / Touch ID.

### Milestone P3 — Long-Term Architectural Evolution
- **REC-P3-1:** Implement automated zero-downtime blue/green deployment pipelines via AWS CodeDeploy or ECS Fargate.
- **REC-P3-2:** Multi-region read replica configuration for PostgreSQL to support high-scale multi-state enterprise attendance spikes at shift start times (9:00 AM IST).

---

## 17. Verification Limitations & Audit Evidence

### 17.1 Independently Verified Facts
- **Git State:** Verified clean on branch `feature/p2.11-statutory-lifecycle` at commit `bb12feee499cad06eef8e72528b753b8109b69e4`.
- **Schema & Migrations:** Verified active schema at `prisma/schema.prisma` with 89 models and 33 migration directories. Verified `backend/prisma/` is obsolete.
- **Test Results:** 560 unit tests passed independently across 52 test suites; 1 suite failed closed due to absent PostgreSQL instance on port 5433.
- **Android Architecture:** Verified CameraX ML Kit eye-blink liveness detection, Room database caching, AndroidKeyStore AES-GCM token encryption, and native Compose `PdfRenderer`.
- **Update Bug Root Cause:** Verified in source code that `RootApp.kt` opens a browser URI rather than executing an in-app package installer.

### 17.2 Limitations Requiring Explicit Authorization
- **Production State:** Production EC2 (`i-068f8f1e571bc5cc6`) was not modified, logged into, or rebooted, adhering to strict production-freeze controls.
- **Live Database Migrations:** No migrations were executed against staging or production databases during this analysis.

---

## 18. Appendix: Source References & Inspection Commands

- **Active Prisma Schema:** [prisma/schema.prisma](file:///d:/Program%20Files/HRMS/prisma/schema.prisma)
- **Server Entry Point:** [server/index.ts](file:///d:/Program%20Files/HRMS/server/index.ts)
- **V1 API Dispatches:** [server/v1/api.ts](file:///d:/Program%20Files/HRMS/server/v1/api.ts)
- **Mobile Release Router:** [server/v1/mobileRelease.ts](file:///d:/Program%20Files/HRMS/server/v1/mobileRelease.ts)
- **Android Main ViewModel:** [android-app/app/src/main/java/com/orbithr/app/MainViewModel.kt](file:///d:/Program%20Files/HRMS/android-app/app/src/main/java/com/orbithr/app/MainViewModel.kt)
- **Android Root App & Dialogs:** [android-app/app/src/main/java/com/orbithr/app/ui/RootApp.kt](file:///d:/Program%20Files/HRMS/android-app/app/src/main/java/com/orbithr/app/ui/RootApp.kt)
- **Android Camera & Blink Liveness:** [android-app/app/src/main/java/com/orbithr/app/LiveFaceCamera.kt](file:///d:/Program%20Files/HRMS/android-app/app/src/main/java/com/orbithr/app/LiveFaceCamera.kt)
- **Android Native PDF Renderer:** [android-app/app/src/main/java/com/orbithr/app/ui/PdfViewerScreen.kt](file:///d:/Program%20Files/HRMS/android-app/app/src/main/java/com/orbithr/app/ui/PdfViewerScreen.kt)
- **Worker Daemon & Job Leasing:** [server/v1/compliance/calendar/workerDaemon.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/workerDaemon.ts)
- **Statutory Deadlines Matrix:** [server/v1/compliance/calendar/deadlineEngine.ts](file:///d:/Program%20Files/HRMS/server/v1/compliance/calendar/deadlineEngine.ts)
- **Staging Deployment Script:** [deploy/deploy-staging.ps1](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1)
