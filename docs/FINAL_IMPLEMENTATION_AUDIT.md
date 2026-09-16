# OrbitHR implementation audit

This audit maps the uploaded master report to authoritative repository evidence. “Implemented” means a tenant-scoped schema/API implementation, applicable web/Android surface, migration, and automated verification exist. Provider-dependent operations are explicitly separated from code completion.

| Requirement | Database/API evidence | Web/Android evidence | Verification | Result |
|---|---|---|---|---|
| Organization hierarchy | `Branch`, `WorkLocation`, `Team`, `CostCenter`, `EmployeeGrade`; `foundation.ts` | Foundation admin | foundation/access-scope tests | Implemented |
| Stored RBAC and scopes | Permission, role, grant models; fail-closed employee filters | Organization & Access | tenant/scope negative tests | Implemented |
| Indian payroll depth | Effective salary structures, revisions, statutory versions, loans, adjustments, F&F, tax proofs, Form 16 and lifecycle endpoints | Payroll engine and Android payslips | deterministic payroll tests | Implemented; bank transmission remains external |
| Attendance engine | shifts, assignments, breaks, policies, evaluations, requests and period locks | web policy/request screens; Android CameraX/live face, breaks and requests | engine/policy tests and Android compile | Implemented |
| Duplicate punches | server rejects second clock-in and clock-out; web local shortcut removed | Android buttons disable after authoritative punch | API logic and compile | Implemented |
| Employee self service | leave, attendance, expenses, payslips, service requests, documents, assets, goals and reviews | web request/inbox surfaces; Android employee hub | API tests/builds | Implemented |
| Generic workflow | versioned definitions, steps, instances, actions, delegation, SLA and multi-approval | builder and global inbox on web/Android | workflow lifecycle tests | Implemented |
| Notifications | inbox, preferences, templates, device registration, channel delivery queue and compliance reminders | web and Android inbox | notification/reminder tests | Implemented; external email/push transmission requires approved provider |
| Reports and exports | 20 governed reports and audited export records; real CSV/XLSX/PDF renderers | Reports Center downloads | format/family tests | Implemented |
| Compliance documents | employee document metadata, verification, expiry, retention and reminders | web governance and Android documents | scope/reminder tests | Implemented; binary object-store provider remains external |
| Security Center | rotating sessions, device metadata, revocation, login history, lockout and encrypted TOTP | dedicated web Security Center and MFA-capable web/Android login | MFA crypto tests | Implemented |
| Universal search | scoped employee, attendance, leave, payroll, document, asset and audit results | Ctrl+K server search | scope tests/build | Implemented |
| Orbit AI | permission-filtered absence, lateness, payroll, attrition, headcount and approval tools; audited citations and non-executing drafts | Governance Center assistant | intent tests | Implemented governed local assistant |
| Employee 360/timeline | scoped aggregation and activity timeline endpoint | workforce command center | TypeScript build | Implemented |
| Performance reviews | cycles, assignments, ordered review/HR/acknowledgement lifecycle | web Performance Engine; Android review list | transition tests | Implemented |
| Release operations | ordered migrations and release runbook | Android signing configuration | local builds | Ready; no production migration/deployment performed |

## Verification gates

- `prisma validate` and client generation
- TypeScript project build
- Vitest suite, including tenant scope, attendance, payroll, workflow, notification, report, AI, MFA, reminder and performance lifecycle tests
- Vite production build
- Android `compileDebugKotlin`
- npm audit at high severity

## Explicit external boundaries

1. Production migrations and deployment require operator approval and backup verification.
2. A notification provider must be approved before employee email addresses, device tokens or HR content leave OrbitHR.
3. Document binaries need an approved encrypted object store, malware scanner and signed-download policy.
4. Bank files are masked previews until a reviewed banking provider and dual-control release process are configured.
5. Public signed APK publication requires explicit approval to use signing secrets and publish an externally downloadable artifact.
