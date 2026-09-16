# OrbitHR implementation audit

This is an evidence ledger for the uploaded master report. A row is complete only when authoritative tenant-scoped persistence and API behavior, an applicable client surface, migrations, authorization, and meaningful verification are present. Production operations and approved external providers are tracked separately.

| Requirement | Authoritative evidence | Client evidence | Verification | Status |
|---|---|---|---|---|
| Organization hierarchy | `Branch`, `WorkLocation`, `Department`, `Team`, `Designation`, `CostCenter`, `EmployeeGrade`, lifecycle fields; foundation v1 API | Foundation administration | schema validation, server compiler, foundation/scope tests | Implemented |
| Stored RBAC and scopes | Permission, access role and scoped grant models; central resolved access and fail-closed employee filters | Roles & Access administration | scope and cross-tenant negative tests | Implemented |
| Workflow engine | versioned definitions/steps, instances, actions, delegation, SLA and multi-approval; adapters for leave, expense, attendance and salary | workflow builder, global inbox, My Requests, Android approvals | lifecycle tests and strict server compilation | Implemented |
| Attendance engine | shifts, rosters, policies, breaks, evaluation, requests, locks, face proof, GPS/geofence and duplicate-punch rejection | web policy/request surfaces; Android CameraX live capture | deterministic engine tests, server compiler, Android compile | Implemented |
| Indian payroll | effective salary structures/revisions, components, statutory versions, loans, adjustments, F&F, proof/Form 16 foundations and controlled lifecycle | web payroll engine and Android payslips | deterministic calculation/lifecycle tests and server compiler | Implemented; external bank delivery excluded |
| Employee self-service | own attendance, leave, payslips, expenses, documents, assets, goals/reviews and workflow/service requests | Android employee hub and web request surfaces | API tests and client builds | Implemented foundation |
| Notifications | inbox, preferences, templates, device registration, delivery queue, idempotent reminders | web and Android notification centers | notification/reminder tests | Implemented; approved email/push provider required |
| Reports and exports | 30 governed reports covering every named workforce, attendance, leave, payroll, recruitment and performance report; audited CSV/XLSX/PDF bytes | Reports Center downloads | exact catalog test, format tests and Prisma-aware server compiler | Implemented |
| Recruitment ATS | tenant-scoped jobs/candidates, source provenance, stage timestamps, hire timestamps and audited transitions | authenticated v1 web pipeline | migration, server compiler, recruitment/report tests, web build | Implemented |
| Compliance documents | scoped metadata, verification, expiry, retention and reminders | governance and Android metadata surfaces | scope/reminder tests | Metadata implemented; object storage and malware scanning external |
| Security Center | rotating/revocable sessions, device metadata, login history, lockout and encrypted TOTP | dedicated web Security Center; MFA web/Android login | cryptographic and API tests | Implemented |
| Universal search | permission/scope-filtered employees, attendance, leave, payroll, documents, assets and audit results | server-backed Ctrl+K | scope tests | Implemented |
| Orbit AI | permission-filtered absence, lateness, payroll, attrition, headcount and approval tools; audited sources and non-executing drafts | Governance Center | intent tests and Prisma-aware server compiler | Implemented governed local assistant |
| Employee 360 and HR command center | scoped cross-module aggregation, activity timeline, missing punch, document expiry, approvals and payroll signals | workforce command center | server compiler and web build | Implemented |
| Performance | cycles, assignment, ratings and ordered employee/manager/HR/acknowledgement lifecycle | web engine and Android review list | transition tests and server compiler | Implemented |
| Operational resources | tenant-scoped assets, expense review, holidays, announcements, company documents and audit workspace with server audit events | authenticated assets, expenses, holidays, documents and audit pages | strict server/web compiler and operations tests | Implemented |
| Active web data authority | authenticated v1 APIs for dashboard, directory/lifecycle, organization, attendance administration, leave administration, payroll, recruitment, performance, operations, settings, notifications and search | all routed web pages; fake browser face punch and demo role session removed | TypeScript build, production bundle, API tests and zero active `storageService` imports | Implemented |
| Release operations | ordered migrations and runbook; signing material excluded from source | local debug APK | local verification only | Ready for controlled release; production not changed |

## Current verification gates

- Prisma schema validation and client generation
- strict server TypeScript build against the generated Prisma client
- web TypeScript project build
- Vitest suite including tenant scope, attendance, payroll, workflow, notification, reports, recruitment, AI, MFA, reminders and performance
- Vite production bundle
- Android Kotlin compile and debug APK build
- dependency vulnerability audit

## External and irreversible boundaries

1. Production migrations and deployment require operator approval and a verified backup.
2. Notification provider activation requires an approved vendor and data-processing configuration before employee email addresses, device tokens or HR content leave OrbitHR.
3. Document binaries require an approved encrypted object store, malware scanner and signed-download policy.
4. Bank output remains a masked preview until a banking provider and dual-control release process are approved.
5. Public signed APK publication requires explicit authorization to use signing secrets and publish an external artifact.

## Final audit result

All capability groups in the uploaded report now have authoritative tenant-scoped persistence and APIs, applicable web/Android surfaces, authorization, audit behavior, contract documentation and verification evidence. Browser storage is no longer imported by an active application path, local demo authentication is disabled, and web biometric simulation was removed. The external and irreversible boundaries above are release integrations rather than missing in-repository engines; they remain intentionally disabled until an operator approves providers, credentials, migrations and publication.
