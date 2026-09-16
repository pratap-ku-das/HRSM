# OrbitHR Master Platform Build

## Delivery principles

This document is the implementation ledger for the production HRMS described in the product report. A capability is complete only when its tenant-scoped database model, authorization rules, API contract, web experience, applicable Android experience, audit events, validation, migrations, and automated tests are present. Presentation-only screens and client-supplied security assertions do not count as complete.

Production database migrations, signing-key changes, external provider activation, and deployment remain explicit release operations.

## Baseline audit

| System | Existing baseline | Material gaps | Status |
|---|---|---|---|
| Authentication | Password login, activation/reset, rotating refresh tokens, logout, tenant identity | Recovery codes and enterprise SSO are optional future extensions | Implemented |
| RBAC | Static role-to-permission map in API | Legacy role defaults remain for backward compatibility | Implemented |
| Organization | Company, department, designation, reporting manager field | — | Implemented |
| Attendance | Mobile face verification, GPS, clock-in/out, history, admin records | Play Integrity provider activation remains a release decision | Implemented |
| Leave | Types, requests and review | Half-day UI and attachment object provider remain | Implemented foundation |
| Payroll | Basic runs and payslips | Bank provider delivery remains deliberately external | Implemented |
| Workflow | Module-specific approvals | — | Implemented |
| Self-service | Profile, attendance, leave, payslips, expenses | Secure file binary provider activation remains | Implemented foundation |
| Notifications | Announcements and email delivery records | External provider worker activation and scheduled retry runner remain release operations | Implemented foundation |
| Reports | Dashboard metrics and a few exports | Background file renderer/provider activation remains | Implemented foundation |
| Compliance/documents | Company document metadata | Object-store upload/download provider activation remains | Implemented foundation |
| Security centre | Audit log and token revocation | Recovery-code UX may be added | Implemented foundation |
| Search | Navigation command palette | Broader non-employee entity indexing can be added | Implemented |
| AI assistant | None | External model provider is optional; current assistant is deterministic and read-only | Implemented safe foundation |
| Employee 360 | Profile drawer | Fine-grained masking policy can be expanded | Implemented foundation |
| Android | Core employee workflows and live attendance | Offline mutation queue remains intentionally disabled | Implemented online parity |

## Ordered implementation

### Phase 1 — Organization and authorization foundation

- Company → branch → work location → department → team → designation → employee
- Cost centres and employee grades/bands
- Employment lifecycle dates and extended employment types
- Stored permissions, company-defined roles, scoped user assignments
- Scope types: company, branch, department, team, self
- Central authorization context shared by every module
- Tenant-isolation and permission tests

### Phase 2 — Workflow and approval engine

- Versioned workflow definitions and ordered steps
- Role, user, manager, department-head and finance approvers
- Workflow instances, actions, comments, delegation and immutable history
- Global approval inbox with SLA/due-state filtering
- Integration adapters for leave, expense, attendance correction and salary revision

### Phase 3 — Attendance engine

- Shift templates, flexible/night/rotational shifts and employee rosters
- Grace, late, early-exit, half-day, overtime and missing-punch policies
- Break sessions, weekly off and holiday resolution
- WFH, on-duty, business-travel and attendance-regularization requests
- Deterministic daily evaluation with explainable rule results
- Locked attendance periods consumed by payroll

### Phase 4 — Payroll engine

- Effective-dated salary structures and revisions
- Earnings, deductions, employer contributions, arrears, bonus, incentive and overtime
- Loans, advances, repayments and reimbursements
- PF, ESI, professional-tax and TDS rule versioning
- Draft → attendance locked → calculated → HR review → finance approval → locked → payslips → bank export
- Reversal/correction, full-and-final settlement, Form 16 and proof/declaration foundations

### Phase 5 — Employee self-service and premium workspace

- Universal My Requests and request state history
- Attendance correction, WFH, overtime, document/certificate and advance requests
- Employee 360 tabs and cross-module activity timeline
- HR command centre and global approval inbox
- Applicable Android parity and manager actions

### Phase 6 — Notifications, compliance and security

- In-app notification inbox and per-event/channel preferences
- Email/push dispatch, idempotency, retries and delivery history
- Employee documents, authorization, verification, expiry and retention
- Session/device management, MFA, lockout, login and sensitive-access history
- Export and permission-change audit events

### Phase 7 — Reporting, search and AI

- Workforce, attendance, leave, payroll, recruitment and performance reports
- Governed CSV/XLSX/PDF exports and export history
- Tenant-scoped universal search
- Permission-filtered Orbit AI tools with source references and audited proposed actions

## Definition of done

Every phase must pass schema validation, migration review, server tests, TypeScript build, lint, Android compilation for affected code, tenant-crossing negative tests, permission negative tests, and documentation/OpenAPI checks. External services must fail closed and expose operational diagnostics without leaking biometric, payroll, tax, identity or credential data.

## Source basis

1. Uploaded product report, `pasted-text.txt`, sections 1–10, premium features, prioritization table, and core-engine architecture (private attachment supplied for this build).
2. OrbitHR repository schemas, REST API, web client, Android client, migrations, OpenAPI contract and deployment documentation at the baseline commit recorded in Git history.
