# OrbitHR Android native feature matrix

This matrix records Android coverage after removal of the embedded web workspace. Android is a separate Jetpack Compose client and communicates with the shared backend only through authenticated REST APIs.

| Platform capability | Native Android experience | Shared API | Current coverage |
|---|---|---|---|
| Login, refresh, logout, MFA login | Compose authentication | Auth APIs | Complete |
| Account activation and password recovery | Native dialogs | Auth recovery APIs | Complete |
| Dashboard, announcements, holidays | Mobile cards and lists | Dashboard API | Complete |
| Face and location attendance | CameraX, ML Kit and native location | Face challenge/verify and attendance APIs | Complete |
| Attendance history, breaks and corrections | Native timeline/forms | Self-service attendance APIs | Complete |
| Leave balances, application and history | Native cards/form | Leave APIs | Complete |
| Approval inbox and request history | Native lists/actions | Workflow APIs | Complete |
| Payslips and payroll detail | Native salary statement | Payroll APIs | Complete for published data; server PDF endpoint is not available |
| Expenses | Native create/history | Expense APIs | Complete for current backend fields |
| Employee directory | Native searchable list | Employee APIs | Complete |
| Employee onboarding | Native staged wizard and uploads | Onboarding APIs | Complete |
| Employee edit, lifecycle and deletion | Native guarded editor | Employee APIs | Complete |
| Employee documents | Native list and protected preview | Employee document APIs | Complete for existing files |
| Company documents | Native upload/list/preview | Operations APIs | Complete |
| Assets, holidays, announcements and audit | Native tabbed company workspace | Operations API | Complete for existing API actions exposed on mobile |
| Profile and company identity | Native account screens | Me API | Complete for current API fields |
| MFA, active sessions and login history | Native Security Center | Governance APIs | Complete |
| Notifications | Native inbox and backend device registration | Notification APIs | Complete except real-time delivery, which still requires Firebase project credentials |
| Offline dashboard and attendance | Room cache fallback | Shared APIs | Complete |
| Recruitment administration | Not yet exposed in Android | Recruitment APIs | Pending |
| Performance administration | Self goals/reviews are native; admin cycle management pending | Performance APIs | Partial |
| RBAC/workflow definition administration | Not yet exposed in Android | Governance/workflow APIs | Pending |
| Attendance policy administration | Not yet exposed in Android | Attendance policy APIs | Pending |
| Full company registration settings editor | Native legal, registration, address, locale, hours and policy form | Workspace settings API | Complete |
| Reports/export administration | Not yet exposed in Android | Report APIs | Pending |

Hard requirement checks:

- No Android WebView dependency or screen.
- No Android website URL loading.
- No embedded web dashboard or "Complete HR workspace" route.
- Native navigation remains Home, Time, Leave, Pay and More.
- Backend authorization remains authoritative for every request.
