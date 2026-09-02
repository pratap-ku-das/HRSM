# OrbitHR HRMS: Complete Project and Android App Handoff

## 1. Purpose

This document explains the current HRMS project one flow at a time and translates it into a practical Android application specification. It is based on the code in this repository, especially:

- `src/App.tsx`: web application navigation and screen registration
- `src/pages/**`: implemented web workflows
- `src/types/index.ts`: client-side domain contracts
- `src/services/api.ts`: client API wrapper
- `src/services/storageService.ts`: browser-local prototype data layer
- `server/index.ts`: Express REST API
- `prisma/schema.prisma`: PostgreSQL data model

The product is branded **OrbitHR**. It is a multi-company HR management system focused on Indian organizations, INR payroll, GST/PAN/IFSC-style data, and the Asia/Kolkata timezone.

## 2. Current Project Status

### 2.1 Technology stack

| Layer | Current implementation |
|---|---|
| Web client | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS plus application CSS |
| Icons/charts | Lucide React and Recharts |
| PDF | jsPDF for payslip generation |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma 6 |
| Database | PostgreSQL, described in code as Supabase PostgreSQL |
| Prototype cache | Browser `localStorage` |
| Development ports | Vite client, Express API default `3001` |

### 2.2 Important architecture reality

The repository contains both a real REST/PostgreSQL backend and a browser-local prototype data service. The web product is not yet consistently API-driven:

- Authentication, company registration, leave policy loading, and some leave operations call the REST API.
- Most other screens directly read and modify `localStorage` through `storageService`.
- `storageService` contains seeded/demo data and acts as an offline fallback.
- Therefore, the web UI can show changes that are not in PostgreSQL, and API data can differ from UI data.

The Android app should **not** reproduce this split. PostgreSQL through an authenticated API must be the source of truth. Room may cache server data for offline reading and queued actions.

### 2.3 What is implemented versus prototype-only

Implemented in some form:

- Company registration and initial workspace seeding
- Email lookup login
- Employee directory and 360-degree profile
- Departments and designations
- Attendance matrix, manual adjustment, bulk marking, CSV export
- Mobile attendance endpoint shape
- Leave policies, requests, balances display, and approvals
- Payroll runs, payslips, and PDF generation
- Recruitment jobs and applicant pipeline
- Performance goals
- Asset inventory and assignment
- Document metadata vault
- Holidays and announcements
- Expense claims and review
- Audit log viewing/export
- Company settings
- Multi-company/demo role switching in the web prototype

Prototype or incomplete:

- Password authentication is not enforced by the backend.
- There is no JWT/access token, refresh token, logout/revocation, or authenticated middleware.
- Most endpoints trust `companyId`, user IDs, role values, and object IDs supplied by the client.
- Role-based navigation and endpoint authorization are incomplete.
- Face recognition is not performed. The attendance endpoint trusts a confidence number sent by the client.
- No liveness detection, face enrollment, geofence validation, anti-spoofing, or device attestation exists.
- Document upload stores metadata with `downloadUrl: "#"`; no file is uploaded.
- Recruitment has no public application creation endpoint.
- Performance reviews exist only as a TypeScript type and UI placeholder, not a database model/API.
- Leave balances are calculated/displayed client-side; they are not persisted or enforced server-side.
- Payroll uses fixed attendance numbers (`22` working, `21` present, `1` paid leave) rather than actual attendance.
- Payroll immediately becomes `PAID`; there is no draft/review/approval/payment flow.
- Expense receipts are not uploaded.
- Notifications, push messaging, email, OTP, and password recovery are not implemented.
- There are no automated tests in the repository.

## 3. Product Roles and Access Model

The declared roles are:

| Role | Intended responsibility |
|---|---|
| `SUPER_ADMIN` | Platform-wide administration and company oversight |
| `COMPANY_ADMIN` | Full control of one company/workspace |
| `HR_MANAGER` | HR operations, employees, attendance, leave, payroll, recruitment |
| `DEPT_HEAD` | Department team visibility and approvals |
| `EMPLOYEE` | Self-service profile, attendance, leave, payslips, expenses, documents |

The Android app should use server-returned permissions, not hard-coded role checks alone. Recommended permission examples are `employee.read.self`, `employee.read.all`, `leave.apply`, `leave.review`, `payroll.process`, and `settings.manage`.

### Recommended Android experience by role

**Employee app:** Home, clock in/out, attendance history, leave, payslips, expenses, documents, holidays, announcements, goals, assigned assets, profile, and settings.

**Manager/HR app:** Employee features plus team attendance, leave/expense approvals, employee directory, team goals, recruitment pipeline, and announcements.

**Company admin app:** All modules, workspace configuration, department/designation management, payroll administration, audit logs, and role management.

`SUPER_ADMIN` is better implemented as a separate protected admin surface, not mixed into the normal employee mobile app.

## 4. End-to-End Business Flows

### Flow 1: Public entry and company registration

Current web flow:

1. User opens the landing page.
2. User chooses sign in or company registration.
3. Registration collects company details, administrator details, workspace slug, and plan (`STARTER`, `GROWTH`, or `ENTERPRISE`).
4. `POST /api/auth/register-company` creates the company and `COMPANY_ADMIN` user.
5. Backend creates default company settings.
6. Backend seeds Executive, Engineering, and HR departments.
7. Backend seeds PL, CL, and SL leave types.
8. Backend records a `REGISTER_COMPANY` audit event.
9. Web client stores an active session and opens the dashboard.

Android recommendation:

- Use a three-step Compose flow: Company -> Administrator -> Plan and confirmation.
- Add email/phone verification, password creation or enterprise SSO, terms acceptance, idempotency, and validation.
- Return authentication tokens only after verified registration.
- Do not accept a client-selected privileged role.

### Flow 2: Login and session restoration

Current behavior:

1. Login screen accepts email and password visually.
2. Only the email is sent to `POST /api/auth/login`.
3. Backend finds a user by email and returns user, company, and settings.
4. A login audit event is written.
5. The web session is stored in `localStorage` as user ID plus company ID.

Required Android/production behavior:

1. Send email and password, OTP, passkey, or SSO assertion over HTTPS.
2. Receive short-lived access token and rotating refresh token.
3. Store refresh token using Android Keystore-backed encrypted storage.
4. Keep access token in memory where possible.
5. Restore the session through token refresh and `GET /api/me`.
6. Clear credentials on logout or refresh failure.
7. Support biometric unlock only as local protection; it must not replace server authentication.

### Flow 3: Home dashboard

The existing dashboard aggregates:

- Active employee count
- Attendance status and trend
- Pending leave requests
- Payroll totals
- Open recruitment jobs
- Recent audit activity
- Department workforce distribution
- Upcoming holidays and announcements
- Pending expenses
- Quick actions for employees, attendance, and payroll

Android design:

- Employee home: today’s attendance action, leave balance, next holiday, announcements, pending expenses, recent payslip.
- HR/admin home: team attendance, approval inbox, headcount, open jobs, payroll status, alerts.
- Fetch one compact `GET /api/dashboard` response instead of making many list requests.

### Flow 4: Employee lifecycle

Current administrator workflow:

1. Open Employee Directory.
2. Search by person or code and filter by department/status.
3. Switch between grid and table views.
4. Open an employee profile drawer to see employment details, assets, and leave history.
5. Add or edit an employee through five form sections:
   - Basic: first name, last name, email, phone, avatar, birth date, gender.
   - Employment: employee code, department, designation, manager, joining date, type, status, location, skills.
   - Salary: basic, HRA, allowances, provident fund, tax deduction, currency.
   - Bank/tax: bank, account number, IFSC/routing number, tax identifier/PAN.
   - Emergency: name, relationship, phone.
6. Saving creates/updates the employee and creates a linked `EMPLOYEE` portal user by email on the backend.
7. Administrator can delete an employee.

Android screens:

- `EmployeeDirectoryScreen`
- `EmployeeProfileScreen`
- `EmployeeEditScreen` with stepper/tabs
- `MyProfileScreen` with restricted editable fields

Production rules to add:

- Validate unique employee code and email within tenant.
- Separate PII/payroll permissions.
- Mask bank account and tax identifiers.
- Prefer deactivate/offboard over hard delete.
- Add onboarding/offboarding status, documents, equipment return, final settlement, and account revocation.

### Flow 5: Departments and designations

Department fields: name, code, head employee, budget, location, and description.

Designation fields: title, department, grade level, minimum salary, maximum salary, and description.

Current UI allows listing, adding, editing, and local deletion. Backend supports list and create/update through POST upsert logic, but no delete endpoints exist.

Android admin flow: Organization -> Departments or Designations -> detail -> create/edit. Before deletion, show dependencies and require reassignment of employees/designations.

### Flow 6: Attendance administration

Current web workflow:

1. Select month.
2. View employee-by-day attendance matrix.
3. Statuses are `PRESENT`, `ABSENT`, `LATE`, `HALF_DAY`, `LEAVE`, `HOLIDAY`, and `WEEKEND`.
4. Select a past/current cell to adjust status and add a correction reason.
5. Bulk-mark a department or all employees for a date.
6. View adjustment audit entries.
7. Export the monthly matrix to CSV.
8. Open a “mobile blueprint” tab and simulate face-auth clock-in.

Attendance sources are `WEB_ADMIN`, `MOBILE_FACE`, `BIOMETRIC_DEVICE`, and `SYSTEM_AUTO`.

### Flow 7: Mobile clock-in/clock-out

The current endpoint is `POST /api/attendance/mobile-verify`. It creates or updates today’s record, marks it present, records clock-in time, device/location, and a claimed confidence score.

This endpoint is a contract prototype only. A secure flow should be:

1. Employee signs in on an enrolled device.
2. App requests camera and precise location permissions at action time.
3. App obtains a server challenge and attendance policy/geofence.
4. Capture a guided selfie using CameraX.
5. Perform liveness checks; do not use a gallery image.
6. Upload encrypted image/evidence plus challenge, GPS accuracy, device ID/attestation, and timestamp.
7. Server verifies challenge expiry, employee identity, liveness, face match, geofence, shift window, duplicate action, and device risk.
8. Server records clock-in or clock-out and returns the authoritative record.
9. App shows exact time, location result, and any policy warning.
10. Failed verification offers retry or a correction request, not a fabricated success.

Required additions: face enrollment/re-enrollment, consent, retention/deletion policy, signed object storage URLs, Play Integrity, clock-out support, GPS accuracy, timezone-safe dates, shift rules, offline queue policy, and manual exception review.

### Flow 8: Leave management

Tabs are Requests, Balances, and Policies.

Employee application:

1. Choose leave type.
2. Select start/end date.
3. Enter total days and reason.
4. Submit with `PENDING` status.
5. View the resulting request status.

Approval logic currently coded in the backend:

- Self-approval is blocked.
- A General Manager’s request requires Company Admin/Super Admin approval.
- Other employees’ requests require a reviewer whose designation title matches “General Manager.”
- A request can only be reviewed while `PENDING`.

Policy management:

- Only Company Admin/Super Admin may create, edit, or delete leave types.
- Fields are name, code, annual allowance, paid/unpaid flag, and color.
- A used leave type cannot be deleted.

Production improvements: calculate duration server-side, account for half days/weekends/holidays, persist annual balances and accruals, prevent overlap, attach medical proof, support cancellation, use configurable approval chains instead of designation-title matching, and notify reviewers/requesters.

### Flow 9: Payroll and payslips

Current workflow:

1. Select payroll month.
2. Process payroll for every company employee.
3. Gross = basic + HRA + allowances.
4. Deductions = provident fund + tax deduction.
5. Net = gross - deductions.
6. A payroll run and one payslip per employee are created.
7. Run and payslips are immediately marked paid.
8. User can open a payslip and generate a PDF.

The fixed working/present/leave values make this unsuitable for real payroll.

Required production flow: Draft -> input validation -> attendance/leave import -> variable earnings/deductions -> statutory calculation -> HR review -> finance approval -> bank payout -> paid/locked -> payslip publication. Add revisions, audit history, Indian payroll compliance, encrypted payroll access, and employee-only payslip filtering.

### Flow 10: Expenses

Current workflow:

1. Select employee.
2. Enter title, category (`TRAVEL`, `MEALS`, `HARDWARE`, `CERTIFICATION`, `MISC`), amount, and notes.
3. Submit as `PENDING` in INR.
4. Reviewer changes status to `APPROVED`, `REJECTED`, or `REIMBURSED`.
5. Actions are written to the local audit log.

Known API defect: the client calls `POST /api/expenses/submit`, while the server implements `POST /api/expenses`. Align this before Android integration.

Add receipt upload, expense date input, policy checks, reviewer comment, approval identity/time, duplicate detection, reimbursement batch/reference, and self-service filtering.

### Flow 11: Recruitment/ATS

Two tabs are Pipeline and Jobs.

Job creation fields: title, department, location, experience level, salary range, description, and requirements. Jobs use `OPEN`, `CLOSED`, or `DRAFT`.

Applicants move through `APPLIED`, `SCREENING`, `INTERVIEW`, `OFFER`, `HIRED`, and `REJECTED`. Applicant data includes contact details, current company, experience, rating, notes, and application date.

Current backend supports job listing/creation, applicant listing, and direct stage update. Add applicant creation, resume upload, interview scheduling, stage history, comments, assignment, offer documents, rejection reason, and conversion to employee.

### Flow 12: Performance

Current goals contain employee, title, description, category (`OKR`, `PROJECT`, `SKILL`, `LEADERSHIP`), target date, progress, and status (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `AT_RISK`). The UI creates goals and updates progress.

The Reviews tab is presentation-only. Although a `PerformanceReview` TypeScript interface exists, Prisma and REST endpoints do not. Android reviews must wait for a server model supporting cycles, reviewers, ratings, strengths, growth areas, next goals, draft/submitted/acknowledged states, and visibility rules.

### Flow 13: Assets

Asset fields: name, category, serial number, assigned employee, assignment date, purchase date/cost, currency, status, and condition. Categories include laptop, monitor, phone, access card, furniture, and other. Statuses are available, assigned, maintenance, and retired.

Current workflow creates an asset and optionally assigns it. Add edit, transfer, return, maintenance history, attachments/invoices, depreciation, and offboarding checks.

### Flow 14: Documents

Current vault shows document metadata by title/category and creates a placeholder PDF record. Categories are policy, handbook, template, compliance, and benefits.

Android should support server-authorized listing, streaming/download, offline encrypted cache, and upload for authorized users. Backend needs multipart or presigned upload, object storage, malware scanning, MIME/size checks, versioning, audience/department access, acknowledgements, and expiring signed downloads.

### Flow 15: Holidays and announcements

Announcements have title, content, priority (`NORMAL`, `HIGH`, `URGENT`), author, and role. The TypeScript contract also anticipates an optional target department, but Prisma does not store it.

Holidays have name, date, and type (`NATIONAL`, `REGIONAL`, `COMPANY`). Android home should show active announcements and upcoming holidays. Add department targeting, publish/expiry schedule, read receipts, push notifications, calendar integration, and delete/edit endpoints.

### Flow 16: Audit trail

The UI searches/filters logs and exports CSV. Audit fields include user, role, action, category, details, IP address, and timestamp. Server list is limited to the latest 200.

The database comment says immutable, but a generic public create endpoint currently lets a client submit arbitrary audit content. In production, audit events must be emitted by trusted server-side business operations, append-only, tamper-evident, permission-restricted, paginated, and retained by policy.

### Flow 17: Workspace settings

Settings include company/legal name, tax registration number, INR/currency symbol, timezone, work days, business hours, automatic overtime, audit logging, and probation months.

Android should expose these only to authorized admins. Server must whitelist editable fields, validate values, audit every change, and avoid allowing the client to disable mandatory security logs.

## 5. Domain Model Summary

Main relationships:

- Company owns users, employees, departments, designations, attendance, leave, payroll, recruitment, goals, assets, documents, holidays, announcements, expenses, audit logs, and settings.
- User belongs to one company and may link one-to-one to an Employee.
- Employee belongs to a department and designation and owns attendance, leave, payslips, goals, assets, and expenses.
- Department owns designations and job postings.
- PayrollRun owns Payslips.
- JobPosting owns JobApplicants.

Important unique constraints:

- Company slug globally unique
- User email globally unique
- Employee code unique within company
- One attendance record per employee/date
- Leave type code unique within company
- One payroll run per company/month
- One payslip per employee/run
- Asset serial number unique within company
- One settings record per company

Use UUID strings in Android models. Represent money with decimal minor units or a decimal type, not `Double`; current Prisma `Float` money fields should also be migrated to `Decimal` or integer paise.

## 6. REST API Inventory

The current API base is `/api`; Express defaults to port `3001`. Vite proxies `/api` during web development. Android must use a full HTTPS base URL such as `https://api.example.com/api/`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | API/database health |
| POST | `/auth/login` | Email-only prototype login |
| POST | `/auth/register-company` | Create company/admin/default data |
| GET | `/companies` | List all companies; must be restricted |
| GET | `/employees?companyId=` | List employees |
| POST | `/employees` | Create/update employee |
| DELETE | `/employees/:id` | Hard-delete employee |
| GET | `/departments?companyId=` | List departments |
| POST | `/departments` | Create/update department |
| GET | `/designations?companyId=` | List designations |
| POST | `/designations` | Create/update designation |
| GET | `/attendance?companyId=` | List all attendance |
| POST | `/attendance` | Manual upsert |
| POST | `/attendance/bulk` | Bulk upsert |
| POST | `/attendance/mobile-verify` | Prototype mobile clock-in |
| GET | `/leaves/types?companyId=` | List/seed leave types |
| POST | `/leaves/types` | Create/update leave type |
| DELETE | `/leaves/types/:id` | Delete unused leave type |
| GET | `/leaves/requests?companyId=` | List leave requests |
| POST | `/leaves/apply` | Apply for leave |
| POST | `/leaves/review` | Approve/reject request |
| GET | `/payroll/runs?companyId=` | List payroll runs |
| GET | `/payroll/payslips?companyId=` | List payslips |
| POST | `/payroll/generate` | Generate and mark payroll paid |
| GET | `/recruitment/jobs?companyId=` | List job postings |
| POST | `/recruitment/jobs` | Create job |
| GET | `/recruitment/applicants?companyId=` | List applicants |
| POST | `/recruitment/applicants/advance` | Change stage |
| GET | `/performance/goals?companyId=` | List goals |
| POST | `/performance/goals` | Create/update goal |
| GET | `/assets?companyId=` | List assets |
| POST | `/assets` | Create asset |
| GET | `/documents?companyId=` | List metadata |
| POST | `/documents` | Create placeholder metadata |
| GET | `/holidays?companyId=` | List holidays |
| POST | `/holidays` | Create holiday |
| GET | `/announcements?companyId=` | List announcements |
| POST | `/announcements` | Create announcement |
| GET | `/expenses?companyId=` | List expenses |
| POST | `/expenses` | Submit expense; client path currently differs |
| POST | `/expenses/review` | Change expense status |
| GET | `/audit-logs?companyId=` | Latest 200 logs |
| POST | `/audit-logs` | Client-created log; unsafe for production |
| GET | `/settings/:companyId` | Get settings, currently performs update too |
| PUT | `/settings/:companyId` | Upsert settings |

### API response and date conventions

- Most endpoints return a raw object or raw array, not an envelope.
- Errors generally use `{ "error": "message" }`.
- Client dates are mostly `YYYY-MM-DD`; timestamps are ISO-8601.
- Attendance/payroll endpoint responses sometimes expose raw Prisma `DateTime`, while `employeeToClient` normalizes Employee fields.
- No pagination, versioning, ETag, idempotency key, request ID, or formal OpenAPI definition exists.

Before mobile work, version the API as `/api/v1`, generate an OpenAPI contract, standardize envelopes/errors, add pagination and filters, and derive tenant/user identity from the token rather than request `companyId`.

## 7. Android Application Architecture

Recommended stack:

- Kotlin
- Jetpack Compose with Material 3
- Single-activity navigation using Navigation Compose
- MVVM or unidirectional data flow
- Hilt dependency injection
- Retrofit/OkHttp and Kotlin serialization
- Room for normalized offline cache
- DataStore for non-secret preferences
- Android Keystore-backed encrypted storage for tokens
- WorkManager for reliable sync/upload
- CameraX for attendance capture
- Credential Manager for sign-in/passkeys where supported
- Firebase Cloud Messaging for approvals and announcements
- Coil for images
- Paging 3 for employees, audit logs, applicants, and expenses

Suggested modules:

```text
app
core:model
core:network
core:database
core:designsystem
core:auth
core:common
feature:login
feature:home
feature:attendance
feature:leave
feature:employees
feature:payroll
feature:expenses
feature:recruitment
feature:performance
feature:assets
feature:documents
feature:organization
feature:settings
```

Data flow:

```text
Compose UI -> ViewModel -> Use case (when useful) -> Repository
Repository -> REST API + Room cache -> mapped domain models
```

Use `StateFlow<UiState>` for screen state and a separate event channel for one-time navigation/messages. Repositories should expose cached data immediately, refresh from server, and mark stale/offline content explicitly.

## 8. Android Navigation Map

Employee bottom navigation:

1. Home
2. Attendance
3. Leave
4. Payslips
5. More

More contains Expenses, Documents, Holidays, Goals, Assets, Profile, and Settings.

Manager/admin adaptive navigation adds Approvals, Employees, Recruitment, Organization, Payroll, Audit, and Workspace Settings. Use bottom navigation on phones and navigation rail/drawer on tablets.

Deep links should open leave approval, expense approval, announcement, payslip, applicant, and attendance exception details after authentication and permission checks.

## 9. Offline and Sync Rules

- Safe offline reads: profile, recent payslips, holidays, announcements, policies, assigned assets, and previously loaded history.
- Queueable writes: leave draft, expense draft, receipt upload, and profile draft.
- High-risk actions requiring online confirmation: clock-in/out, leave approval, expense approval, payroll processing, settings changes, employee deletion/offboarding, and recruitment stage transitions.
- Every queued action needs a client-generated UUID/idempotency key.
- Store server `updatedAt`/version and define conflict resolution; do not silently overwrite newer server data.
- Encrypt sensitive Room data or avoid caching bank/tax/payroll fields unnecessarily.

## 10. Security and Privacy Requirements Before Release

1. Replace email-only login with verified authentication and token rotation.
2. Add authenticated middleware to every protected endpoint.
3. Derive company/user/role from server session claims.
4. Enforce object-level authorization and tenant isolation on every query/update/delete.
5. Introduce explicit permissions and least privilege.
6. Hash passwords with Argon2id/bcrypt if passwords are used; never store plaintext.
7. Rate-limit login, registration, face verification, and recovery.
8. Validate requests with a schema library and return stable error codes.
9. Protect PII, bank, salary, PAN, location, and biometric data in transit and at rest.
10. Never log secrets, full bank details, tokens, face images, or precise location unnecessarily.
11. Use server-generated audit records for all sensitive operations.
12. Add consent, retention, deletion, and access policies for biometrics/location.
13. Use presigned object storage and malware scanning for files.
14. Add backup/restore, migrations, monitoring, alerting, and incident response.
15. Perform security testing for IDOR/BOLA, tenant escapes, broken role checks, replay, injection, and file-upload attacks.

## 11. Backend Work Required for Android

Highest priority backlog:

1. Authentication endpoints: login, refresh, logout, forgot/reset password, verification, and `GET /me`.
2. Authorization middleware and tenant-scoped repositories.
3. `/api/v1` plus OpenAPI schema and generated Kotlin client/models.
4. Correct expense route mismatch.
5. Convert all web operational flows from `localStorage` to API so web and Android share behavior.
6. Add employee self endpoints such as `/me/attendance`, `/me/leaves`, `/me/payslips`, and `/me/expenses`.
7. Add pagination, sorting, date ranges, status filters, and search.
8. Add dashboard aggregation endpoint.
9. Implement real attendance verification and clock-out.
10. Implement file/receipt upload and signed download.
11. Persist leave balances and server-side leave calculations.
12. Build real payroll states and attendance-based computation.
13. Add missing update/delete endpoints and optimistic concurrency.
14. Add notifications and device-token registration.
15. Add integration, authorization, and tenant-isolation tests.

Recommended API conventions:

```json
{
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

```json
{
  "error": {
    "code": "LEAVE_OVERLAP",
    "message": "A leave request already exists for these dates.",
    "fieldErrors": {}
  },
  "meta": { "requestId": "uuid" }
}
```

## 12. Recommended Delivery Plan

### Phase 0: Contract and backend hardening

- Finish authentication/authorization and tenant isolation.
- Publish OpenAPI v1.
- Fix endpoint mismatches and standardize errors/dates.
- Add core backend integration/security tests.

### Phase 1: Employee self-service MVP

- Login/session
- Employee home
- My profile
- Attendance clock-in/out and history
- Leave balance/apply/history/cancel
- Payslip list/detail/download
- Holidays and announcements
- Push notification foundation

### Phase 2: Employee operations

- Expenses with receipt upload
- Documents with secure download
- Goals and assigned assets
- Offline cache and queued drafts

### Phase 3: Manager and HR

- Approval inbox
- Team attendance and corrections
- Employee directory/profile
- Team goals
- Recruitment pipeline
- Announcements

### Phase 4: Administration

- Departments/designations
- Employee onboarding/offboarding
- Payroll review/approval
- Asset operations
- Audit search/export
- Workspace configuration

### Phase 5: Production readiness

- Accessibility, localization, tablet layouts
- Performance and battery testing
- Security/privacy review
- Crash/analytics monitoring with PII redaction
- Play Store data safety declaration and release process

## 13. Testing Strategy

- Unit tests: money/date calculations, leave duration, permissions, state reducers, model mapping.
- Repository tests: API success/errors, cache behavior, token refresh, conflict handling.
- Compose UI tests: login, clock-in, leave application, approval, expense submission, payslip download.
- Backend integration tests: every role and tenant boundary, duplicate/replay, state transitions.
- End-to-end tests: registration through employee onboarding; employee attendance/leave/payslip; manager approval.
- Device tests: low-memory devices, offline/poor network, camera denial, GPS denial, clock changes, timezone changes, process death.
- Security tests: OWASP MASVS/API Top 10, rooted-device risk decisions, certificate/network configuration, file uploads.

## 14. Android MVP Acceptance Checklist

- User cannot authenticate with email alone.
- Session refresh/logout works and tokens are not stored in plain preferences.
- Users can only access their company and permitted records.
- Employee can clock in and out with authoritative server confirmation.
- Duplicate/replayed attendance attempts are rejected safely.
- Employee can see balance, apply/cancel leave, and receive approval updates.
- Reviewer cannot self-approve and cannot review outside their scope.
- Employee sees only their own payslips and can securely download them.
- Expense submission includes expense date and receipt; status history is visible.
- Documents use expiring authorized downloads.
- All sensitive actions produce trusted server audit events.
- Offline/stale state is visible and high-risk writes require connectivity.
- Error, empty, loading, retry, permission-denied, and session-expired states exist on every feature.
- Accessibility labels, touch targets, contrast, and font scaling are verified.
- Automated tests cover critical workflows and tenant isolation.

## 15. Source-of-Truth Decision

For Android development, treat these as authoritative in this order:

1. A new versioned OpenAPI contract and backend authorization rules
2. PostgreSQL/Prisma domain constraints
3. This workflow document
4. Existing TypeScript types
5. Existing web UI behavior
6. `storageService` demo behavior only as a visual/product reference

Do not make `localStorage` data, hard-coded seeded IDs, fixed payroll values, simulated face confidence, placeholder URLs, or demo role switching part of the Android production design.
