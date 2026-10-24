# OrbitHR P2.10 RC2 — Gate B Environment Forensic Audit Report
## Strict Read-Only Investigation, Environment Classification & Authorization Evidence

**Document Location:** `docs/P2_10_RC2_GATE_B_ENVIRONMENT_FORENSIC_AUDIT.md`  
**Candidate Release:** `v1.5.9-p2.10-hardened-rc2`  
**Candidate Commit:** `e249b412735eaa79773d974af43e35f779b1cc4a`  
**Investigation Timestamp:** 2026-10-10T18:20:00Z  
**Investigation Mode:** Strict Read-Only Independent Forensic Investigation  
**Primary Question:** *“Can the OrbitHR P2.10 RC2 candidate be deployed to this target with demonstrable assurance that production will remain untouched?”*  
**Final Determination:** **NO — GATE B REMAINS BLOCKED.**  

---

## 1. Executive Summary

This forensic audit was commissioned to resolve the operational ambiguity surrounding the target AWS environment (`i-068f8f1e571bc5cc6` / `hrms-database`) under AWS Account `402545554824` in `eu-north-1`. While prior release discussions informally referred to this infrastructure as the "staging environment", deployment artifacts, scripts, and bucket names designate it as "production".

Through 21 independent, verifiable, strictly read-only forensic checks spanning AWS APIs, DNS queries, network inspection, database catalog examination, web server reverse proxy configuration, and IAM trust policies, this audit establishes conclusive evidence:

1. **The target instance is live Production:** EC2 instance `i-068f8f1e571bc5cc6` is the authoritative host serving the live public production domain **`https://hr.balajione.dev`**. Its active Nginx reverse proxy terminates public TLS using an active Let's Encrypt certificate valid through December 2026 and proxies traffic directly to the local OrbitHR Node.js service on port 3001.
2. **The database is live Production:** The PostgreSQL database `hrms` on `hrms-database` contains active business records: company registration, user sessions, employee biometric face enrollment, GPS workday tracking, and locked payroll runs with published payslips dating from September 23 to October 2, 2026.
3. **No separate staging environment exists in AWS:** Across all evaluated AWS services and regions in account `402545554824`, there is exactly **one** EC2 instance, **one** RDS database, **one** S3 bucket, and **one** VPC. No staging subdomains (`staging.hr.balajione.dev`), staging IAM roles, or staging databases exist.
4. **Deploying here modifies Production:** Any execution of `deploy-production.ps1` or `prisma migrate deploy` directly modifies the live production server and database for `hr.balajione.dev`.

**Verdict:** Gate B is classified as **`BLOCKED — PRODUCTION OR SHARED TARGET`**. Deployment to this target cannot proceed under the premise of "staging verification".

---

## 2. Final Environment Classification

| Evaluated Dimension | Forensic Classification | Justification |
| :--- | :---: | :--- |
| **EC2 Host `i-068f8f1e571bc5cc6`** | **`PRODUCTION`** | Serves public traffic for `https://hr.balajione.dev`. Valid Let's Encrypt TLS certificate active. Nginx proxies to port 3001. |
| **RDS Instance `hrms-database`** | **`PRODUCTION`** | Houses real business records, biometric enrollments, locked payroll runs, and published salary slips. |
| **S3 Bucket `orbithr-production-deployments-...`** | **`PRODUCTION`** | Sole deployment bucket in account; scoped to production deploy role. |
| **DNS Domain `hr.balajione.dev`** | **`PRODUCTION`** | Public DNS A record resolves directly to `13.62.170.45` (Public IP of `i-068f8f1e571bc5cc6`). |
| **Overall Infrastructure Purpose** | **`PRODUCTION`** | **Single-tenant production deployment host.** Staging does not exist as an isolated environment. |

---

## 3. Evidence Inventory

| Evidence ID | Timestamp (UTC) | Source / Inspection Command | Target Resource | Output / Finding Summary | Classification |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **EVID-01** | 2026-10-10 18:09:44 | `aws sts get-caller-identity` | Root Principal | Account `402545554824`, ARN `arn:aws:iam::402545554824:root`. | `VERIFIED` |
| **EVID-02** | 2026-10-10 18:09:52 | `aws organizations describe-organization` | Account Scope | `AWSOrganizationsNotInUseException`. Standalone AWS account; no multi-account org. | `VERIFIED` |
| **EVID-03** | 2026-10-10 18:10:03 | `aws s3api list-buckets` | S3 Global | Exactly 1 bucket in account: `orbithr-production-deployments-402545554824`. | `VERIFIED` |
| **EVID-04** | 2026-10-10 18:10:17 | `aws route53 list-hosted-zones` | Route 53 | `HostedZones: []`. Zero Route 53 hosted zones in account. | `VERIFIED` |
| **EVID-05** | 2026-10-10 18:10:30 | `aws cloudfront list-distributions` | CloudFront | Output empty. Zero CloudFront distributions in account. | `VERIFIED` |
| **EVID-06** | 2026-10-10 18:10:40 | `aws ec2 describe-vpcs` / `elbv2` | VPC / ALB | Exactly 1 VPC (`vpc-0f8de3bbcdc8e468f`). Zero ALBs/NLBs in `eu-north-1`. | `VERIFIED` |
| **EVID-07** | 2026-10-10 18:10:48 | `aws elb describe-load-balancers` | Classic ELB | `LoadBalancerDescriptions: []`. Zero classic ELBs. | `VERIFIED` |
| **EVID-08** | 2026-10-10 18:11:02 | Multi-region EC2 describe | Multi-region | `us-east-1`, `ap-south-1`, `eu-west-1`, `us-west-2` have zero EC2 instances. | `VERIFIED` |
| **EVID-09** | 2026-10-10 18:11:16 | Multi-region RDS describe | Multi-region | `us-east-1`, `ap-south-1`, `eu-west-1`, `us-west-2` have zero RDS instances. | `VERIFIED` |
| **EVID-10** | 2026-10-10 18:11:27 | `aws ec2 describe-instances` | `i-068f8f1e571bc5cc6` | Public IP: `13.62.170.45`, Private: `172.31.37.124`, Tag: `Name = HRSM`. | `VERIFIED` |
| **EVID-11** | 2026-10-10 18:11:53 | `aws ec2 describe-security-groups` | `sg-09250862226390a1d` | Ports 80 and 443 open to `0.0.0.0/0` (public Internet). Port 22 restricted. | `VERIFIED` |
| **EVID-12** | 2026-10-10 18:12:13 | SSM inspection of Nginx & Certbot | `i-068f8f1e571bc5cc6` | Nginx `server_name hr.balajione.dev`; proxy to `127.0.0.1:3001`; Let's Encrypt TLS cert active (valid to 2026-12-22). | `VERIFIED` |
| **EVID-13** | 2026-10-10 18:12:24 | `Resolve-DnsName hr.balajione.dev` | Public DNS | `hr.balajione.dev` A record resolves to `13.62.170.45` (matches EC2 public IP). | `VERIFIED` |
| **EVID-14** | 2026-10-10 18:13:26 | `Resolve-DnsName staging.*` | Public DNS | `staging.hr.balajione.dev` does not exist (resolution failed). | `VERIFIED` |
| **EVID-15** | 2026-10-10 18:14:31 | Read-only SQL query via SSM | `hrms-database` | 1 Company, 2 Users, 1 Employee, 3 AttendanceRecords, 62 AuditLogs. | `VERIFIED` |
| **EVID-16** | 2026-10-10 18:14:50 | Read-only SQL audit inspection | `hrms-database` | Live business actions: `REGISTER_COMPANY`, `ENROLL_EMPLOYEE_FACE`, `CALCULATE_PAYROLL`, `PUBLISH_PAYSLIPS`. | `VERIFIED` |
| **EVID-17** | 2026-10-10 18:15:22 | `aws s3api get-public-access-block` | S3 Bucket | Public access fully blocked; SSE AES256 default encryption. Bucket is empty between deploys. | `VERIFIED` |
| **EVID-18** | 2026-10-10 18:15:28 | Read `.github/workflows/` | Local repo | Exactly 1 workflow: `deploy-production.yml`, environment: `production`. | `VERIFIED` |
| **EVID-19** | 2026-10-10 18:15:46 | SSM read of persistent `.env` | `i-068f8f1e571bc5cc6` | `WEB_APP_URL="https://hr.balajione.dev"`, `REKOGNITION_COLLECTION_ID="orbithr-production"`, `EMAIL_FROM="...mail.balajione.dev"`. | `VERIFIED` |
| **EVID-20** | 2026-10-10 18:16:14 | `aws iam get-role-policy` | `OrbitHR-EC2-Role` | Inline policy grants `s3:GetObject` on `orbithr-production-deployments-402545554824/deployments/*`. | `VERIFIED` |
| **EVID-21** | 2026-10-10 18:16:34 | `aws iam get-role` | `OrbitHR-GitHub-Deploy` | Trust policy strictly restricted to `repo:pratap-ku-das/HRSM:environment:production`. | `VERIFIED` |

---

## 4. AWS Account and Resource Inventory (Gate B1)

- **Account ID:** `402545554824`
- **Account Type:** Standalone AWS Account (`AWSOrganizationsNotInUseException` confirmed).
- **Caller Identity:** `arn:aws:iam::402545554824:root` via profile `orbithr-local`.
- **Region Scope:** Primary region `eu-north-1` (Stockholm). Secondary regions (`us-east-1`, `ap-south-1`, `eu-west-1`, `us-west-2`) were audited and contain zero compute or database resources.
- **VPC Topology:**
  - Single Default VPC: `vpc-0f8de3bbcdc8e468f` (`172.31.0.0/16`)
  - Subnets: 3 default subnets (`subnet-04a75597ba2f7df9c`, `subnet-088f346b96b3491f2`, `subnet-066cb5bf7ba88a381`)
- **Inventory Visibility Limits:** All core compute, database, storage, networking, DNS, and IAM services were queried successfully with exit code 0 under root credentials. Zero permission gaps.

---

## 5. EC2 Workload and RDS Database Findings (Gates B2 & B3)

### A. EC2 Host Classification
- **Instance ID:** `i-068f8f1e571bc5cc6` (Amazon Linux 2023, launched 2026-09-29)
- **Public IP:** `13.62.170.45`
- **Workload Role:** Production Web & Application Server.
- **Service Configuration:**
  - Systemd service `orbithr.service` runs `/usr/bin/npm run start` on port 3001.
  - Active release: `/home/ec2-user/orbithr-releases/release-944cea9-20261002203630`.
  - Nginx listens on ports 80 and 443 with `server_name hr.balajione.dev`.
  - Active Let's Encrypt certificate `hr.balajione.dev` installed in `/etc/letsencrypt/live/hr.balajione.dev/`.
  - Nginx reverse-proxies all incoming requests to `http://127.0.0.1:3001`.

### B. RDS Database Classification
- **Instance Identifier:** `hrms-database` (PostgreSQL 18.3, `hrms-database.cdc6cyayy6za.eu-north-1.rds.amazonaws.com:5432`).
- **Database Name:** `hrms`
- **Workload Role:** Live Production Database.
- **Catalog Inspection Evidence:**
  - `Company`: 1 live registered corporate entity.
  - `User`: 2 active users with authentication history (including Android biometric login).
  - `Employee`: 1 onboarded employee with enrolled biometric facial vector in AWS Rekognition collection `orbithr-production`.
  - `Payroll`: Completed monthly payroll calculation, approval, and published employee salary slips.
  - `AuditLog`: 62 operational logs documenting administrative, payroll, and biometric actions.
- **Migration State:** Migrations #1 through #30 applied; migrations #31 and #32 pending.

---

## 6. S3 Artifact and Backup Findings (Gate B4)

- **Bucket Identifier:** `orbithr-production-deployments-402545554824`
- **Classification:** **Production Release Pipeline Storage.**
- **Access Policies:**
  - Block Public Access: All 4 settings active (`true`).
  - Server-Side Encryption: AWS KMS / AES-256 enabled by default.
  - Access restricted to EC2 role `OrbitHR-EC2-Role` (`s3:GetObject`) and deployment principals (`s3:PutObject`).
- **Object Retention:** Ephemeral. Artifacts (`orbithr-<releaseId>.tgz`) are uploaded during deployment and removed in the `finally` block of `deploy-production.ps1` or line 94 of `deploy-production.yml`.

---

## 7. Deployment Pipeline Risk Analysis (Gate B5)

Execution chain traced across `deploy/deploy-production.ps1` and `deploy/install-ec2-release.sh`:

```text
Local Command (deploy-production.ps1)
  │
  ├── Hardcoded Account ID: 402545554824 (line 9)
  ├── Hardcoded Region: eu-north-1 (line 8)
  ├── Hardcoded Bucket: orbithr-production-deployments-402545554824 (line 10)
  ├── Hardcoded Target Instance: i-068f8f1e571bc5cc6 (line 11)
  │
  ▼
S3 Upload (s3://orbithr-production-deployments-402545554824/deployments/local/orbithr-*.tgz)
  │
  ▼
SSM SendCommand (AWS-RunShellScript targeting i-068f8f1e571bc5cc6)
  │
  ▼
EC2 Execution (/tmp/orbithr-install-*.sh)
  │
  ├── Extract release to /home/ec2-user/orbithr-releases/release-<commit>-<timestamp>
  ├── Symlink persistent env: ln -s /home/ec2-user/orbithr-shared/.env .env
  ├── Run dependencies: npm ci --omit=dev
  ├── Execute migrations: npx prisma migrate deploy  <-- DIRECT PRODUCTION DDL!
  ├── Switch active symlink: ln -sfnT ${release} /home/ec2-user/HRSM
  ├── Restart service: systemctl restart orbithr.service
  └── Verify health: curl http://127.0.0.1:3001/api/health
```

### Risk Findings:
1. **No Environment Flag:** `deploy-production.ps1` does not accept `-Environment`. It hardcodes production instance `i-068f8f1e571bc5cc6`.
2. **Implicit Production Migration:** Line 66 runs `npx prisma migrate deploy` using `/home/ec2-user/orbithr-shared/.env`, which directly migrates `hrms-database`.
3. **Irreversible Database DDL on Health-Check Failure:** If application startup fails after line 66, lines 88–91 revert the code symlink to previous release, but database migrations #31 and #32 **remain committed on the production database**.

---

## 8. Redacted Environment Configuration Comparison (Gate B6)

| Configuration Item | Configured Destination in Persistent `.env` | Staging Match? | Isolation Status |
| :--- | :--- | :---: | :---: |
| `DB_HOST` | `hrms-database.cdc6cyayy6za.eu-north-1.rds.amazonaws.com` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `DB_NAME` | `hrms` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `WEB_APP_URL` | `https://hr.balajione.dev` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `APP_URL` | `https://hr.balajione.dev` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `ANDROID_APP_DOWNLOAD_URL` | `https://hr.balajione.dev/downloads/orbithr-android.apk` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `EMAIL_FROM` | `OrbitHR <onboarding@mail.balajione.dev>` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `REKOGNITION_COLLECTION_ID` | `orbithr-production` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `FIREBASE_PROJECT_ID` | `com-orbithr-app` | **SAME** | ❌ **SHARED / PRODUCTION** |
| `JWT_ISSUER` | `orbithr-api` | **SAME** | ❌ **SHARED / PRODUCTION** |

**Conclusion:** Staging does not possess a distinct set of credentials, endpoints, or collections. The configured environment is 100% production.

---

## 9. DNS, Domains, and External Routing (Gate B7)

- **Domain:** `hr.balajione.dev`
- **DNS Provider:** Cloudflare (Authoritative nameservers resolved externally).
- **A Record:** Resolves to `13.62.170.45` with TTL 300s.
- **Public Mapping:** `13.62.170.45` is the Elastic/Public IP assigned to EC2 instance `i-068f8f1e571bc5cc6`.
- **Staging Domains:** DNS resolution queries for `staging.hr.balajione.dev`, `staging-hr.balajione.dev`, and `staging.balajione.dev` returned `Non-Existent Domain` (NXDOMAIN).
- **Finding:** Any downtime or service disruption on `i-068f8f1e571bc5cc6` immediately takes down `https://hr.balajione.dev` for all real users.

---

## 10. IAM and Blast-Radius Audit (Gate B8)

1. **Deployment Identity:** The active local identity is the AWS root account (`arn:aws:iam::402545554824:root`). It possesses unbounded administrative authority over the entire account.
2. **CI/CD Role:** `arn:aws:iam::402545554824:role/OrbitHR-GitHub-Deploy` trust policy requires:
   `"token.actions.githubusercontent.com:sub": "repo:pratap-ku-das/HRSM:environment:production"`
   No GitHub Actions role exists for a staging environment.
3. **EC2 Role:** `arn:aws:iam::402545554824:role/OrbitHR-EC2-Role` attaches `AmazonSSMManagedInstanceCore` and inline policy `OrbitHR-Deployment-Bucket-Read` scoped strictly to `orbithr-production-deployments-402545554824`.

---

## 11. Cross-Environment Comparison Matrix

| Component | Current Target Resource | Proven Environment | Separate Staging Resource? | Production Isolation? | Forensic Evidence ID |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **AWS Account** | `402545554824` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-01, EVID-02 |
| **EC2 Host** | `i-068f8f1e571bc5cc6` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-10, EVID-12 |
| **RDS Instance** | `hrms-database` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-09, EVID-15 |
| **Database/Schema** | `hrms` / `public` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-15, EVID-16 |
| **S3 Release Bucket** | `orbithr-production-deployments-402545554824` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-03, EVID-17 |
| **Backup Storage** | Automated RDS snapshots | `PRODUCTION` | **NO** | ❌ **NO** | EVID-15 |
| **Deployment Identity** | Root (`402545554824`) | `PRODUCTION` | **NO** | ❌ **NO** | EVID-01 |
| **Application Secrets** | `/home/ec2-user/orbithr-shared/.env` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-19 |
| **DNS Public Hostname** | `hr.balajione.dev` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-13, EVID-14 |
| **Integrations** | `orbithr-production` (Rekognition) | `PRODUCTION` | **NO** | ❌ **NO** | EVID-19 |
| **CI/CD Workflow** | `deploy-production.yml` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-18, EVID-21 |
| **Monitoring & Logs** | `systemd` / `/var/log/nginx/` | `PRODUCTION` | **NO** | ❌ **NO** | EVID-12 |

---

## 12. Confirmed Risks and Root Cause of Ambiguity

1. **Root Cause:** The project has only one deployment environment in AWS. In previous turn cycles, the operator requested testing against "staging", and agents treated `i-068f8f1e571bc5cc6` as staging without auditing its live production status.
2. **Blast Radius:** Applying migrations #31 and #32 to `hrms-database` applies DDL directly to the production database serving `hr.balajione.dev`.
3. **Notification Risk:** Running test compliance reminders on this instance would dispatch push notifications to real mobile devices registered under Firebase project `com-orbithr-app` and queue emails to the live outbox.
4. **No Side-by-Side Isolation:** There is no mechanism in the current cloud configuration to test a release candidate without affecting the live corporate instance.

---

## 13. Final Gate B Decision

# 🛑 BLOCKED — PRODUCTION OR SHARED TARGET

**Rationale:** The target infrastructure `i-068f8f1e571bc5cc6` and `hrms-database` is conclusively proven to be **PRODUCTION**. It is actively serving `https://hr.balajione.dev` with live business records and public TLS endpoints. No isolated staging environment exists in AWS account `402545554824`. 

Deploying the OrbitHR P2.10 RC2 release candidate here **cannot guarantee that production remains untouched**, because this target **is** production.

---

## 14. Safest Recommended Path

Because the target is production, **do not deploy to it under the guise of staging testing**.

### Option 1: Direct Production Release Authorization (If intended by operator)
If the operator's actual intent was to deploy P2.10 RC2 directly to Production (since technical verification gates passed 100% locally with 438/438 tests and PostgreSQL concurrency verification):
1. Formally reclassify the deployment operation as a **Production Deployment**.
2. Re-verify the pre-migration snapshot `orbithr-pre-p2-10-rc2-snapshot` (confirmed `available`).
3. Schedule an approved maintenance window.
4. Execute `deploy-production.ps1` with explicit operator authorization for Production.

### Option 2: Provision a Genuinely Isolated Staging Environment (Recommended for true staging)
If pre-production staging verification is strictly mandated:
1. Provision a distinct EC2 instance (e.g. `i-staging-orbithr`, t3.small) and a distinct RDS PostgreSQL instance (e.g. `hrms-database-staging`, db.t4g.micro) in `eu-north-1`.
2. Configure a distinct staging domain (e.g. `staging.hr.balajione.dev`).
3. Isolate Firebase and email configurations to test credentials.
4. Deploy the RC2 candidate to the isolated staging instance.

---

## 15. Required Authorization Evidence Checklist

| Checklist Item | Status | Forensic Evidence ID |
| :--- | :---: | :--- |
| Correct AWS account and region confirmed | 🟢 **PASS** | EVID-01 |
| Explicitly identified staging EC2 instance | 🔴 **FAIL** | EVID-10, EVID-12 (Target is Production) |
| Explicitly identified staging RDS instance | 🔴 **FAIL** | EVID-09, EVID-15 (Target is Production) |
| Verified snapshot of target database in `available` state | 🟢 **PASS** | `orbithr-pre-p2-10-rc2-snapshot` available |
| Verified environment-specific artifact bucket | 🔴 **FAIL** | EVID-03 (Bucket is `orbithr-production-...`) |
| Verified deployment identity & bounded permissions | 🟡 **UNKNOWN** | EVID-01 (Using Root credentials) |
| Staging-only `DATABASE_URL` destination | 🔴 **FAIL** | EVID-19 (Points to production database) |
| Production database cannot be selected accidentally | 🔴 **FAIL** | EVID-19 (Hardcoded production database) |
| Production domains & integrations cannot be affected | 🔴 **FAIL** | EVID-12, EVID-13 (Points to `hr.balajione.dev`) |
| Migrations #31 & #32 match approved candidate | 🟢 **PASS** | Gate A audit (Bit-for-bit identical) |
| Migration prechecks are read-only and target DB | 🟢 **PASS** | 10/10 prechecks passed |
| Rollback behavior verified | 🟢 **PASS** | Gate D audit |
| Application rollback forward compatibility | 🟢 **PASS** | Schema is 100% additive |
| Post-deployment smoke-test plan verified | 🟢 **PASS** | Gate E audit |
| Notification tests will not contact real customers | 🔴 **FAIL** | EVID-19 (Connected to real Firebase/Resend) |
| Pending email outbox records understood | 🟢 **PASS** | 11 pending email records audited |
| Written deployment plan reviewed by operator | 🟢 **PASS** | Documented in Gate report |
| Explicit authorization recorded separately from audit | 🔴 **FAIL** | Awaiting operator instruction |

---

## 16. Final Stop Condition Compliance

- All work has been halted.
- No migrations have been deployed.
- No deployment scripts have been executed.
- No S3 artifacts have been uploaded.
- No tags or commits have been pushed.
- Candidate `v1.5.9-p2.10-hardened-rc2` at `e249b412735eaa79773d974af43e35f779b1cc4a` remains strictly local.
- No changes to AWS infrastructure or configuration have been made.
