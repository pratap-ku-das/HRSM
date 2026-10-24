# OrbitHR P2.10 RC2 — Staging Implementation & Acceptance Gate Verification Report

**Date:** 2026-10-15  
**AWS Account:** `402545554824`  
**Region:** `eu-north-1` (Stockholm)  
**Branch:** `hardening/p2.10-compliance-calendar`  
**Release Tag:** `v1.5.9-p2.10-hardened-rc2`  
**Commit SHA:** `e249b412735eaa79773d974af43e35f779b1cc4a`  
**Verification Status:** 🟢 **ALL ACCEPTANCE GATES P0–P5 PASSED (100%)**

---

## 1. Executive Summary

The complete isolated staging implementation for **OrbitHR Release Candidate v1.5.9-p2.10-hardened-rc2** has been successfully provisioned, deployed, and verified in AWS account `402545554824` (`eu-north-1`) following **Architecture Option A (Fully Isolated Staging VPC)**.

All operations were executed with **zero disruption to production infrastructure**, **zero changes to tracked release files**, and strict fail-closed security invariants. The application is now fully operational in a **dark-launch state** (zero public inbound access), connected to a dedicated PostgreSQL 18.3 RDS database, with all 32 database migrations applied cleanly from scratch with zero rollbacks.

### Acceptance Gates Summary

| Gate | Description | Target Invariant | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | **Dark Launch Ingress Audit** | 0 inbound rules on EC2 Security Group | `IpPermissions: []` (0 inbound rules) | 🟢 **PASS** |
| **P1** | **IAM Boundary & Production Isolation** | Production S3 & RDS actions denied | Access Denied on `orbithr-production-deployments-*` | 🟢 **PASS** |
| **P2** | **Host Network Isolation Probe** | Zero egress/reachability to production | 10/10 isolation tests passed via live SSM | 🟢 **PASS** |
| **P3** | **Clean DB Baseline Check** | Exactly 0 application tables before deploy | Initial table count: `0` on `hrms_staging` | 🟢 **PASS** |
| **P4** | **Clean Migration Sequence Check** | All 32 Prisma migrations apply sequentially | **32 / 32 applied**, **0 rollbacks**, **89 public tables** | 🟢 **PASS** |
| **P5** | **Sandbox & Notification Verification** | App health 200 OK, zero live notifications | HTTP 200 OK, database: `CONNECTED` | 🟢 **PASS** |

---

## 2. Frozen Baseline & Repository Integrity

| Check | Expected | Actual | Compliance |
| :--- | :--- | :--- | :--- |
| **Git Current Branch** | `hardening/p2.10-compliance-calendar` | `hardening/p2.10-compliance-calendar` | 🟢 VERIFIED |
| **Git Release Tag** | `v1.5.9-p2.10-hardened-rc2` | `v1.5.9-p2.10-hardened-rc2` | 🟢 VERIFIED |
| **Git HEAD Commit** | `e249b412735eaa79773d974af43e35f779b1cc4a` | `e249b412735eaa79773d974af43e35f779b1cc4a` | 🟢 VERIFIED |
| **Tracked Diff (`git diff --stat`)** | 0 changes | `0 files changed` (clean working tree) | 🟢 VERIFIED |
| **Cached Diff (`git diff --cached`)** | 0 changes | `0 files changed` (clean index) | 🟢 VERIFIED |
| **Prisma Validation** | Valid schema | `The schema at prisma\schema.prisma is valid 🚀` | 🟢 VERIFIED |
| **TypeScript Compilation** | 0 errors | `tsc -b` exited with code 0 | 🟢 VERIFIED |

---

## 3. Provisioned Staging Infrastructure Inventory

All staging infrastructure resides in dedicated, non-overlapping VPC `10.100.0.0/16` and is strictly tagged with `Environment=Staging` and `Project=OrbitHR`:

```
AWS Account 402545554824 (eu-north-1)
└── VPC: vpc-0c6889ef293f31cdb (10.100.0.0/16, vpc-staging-orbithr)
    ├── Internet Gateway: igw-0b893cb566db9b78a
    ├── Public Subnet: subnet-0f0c0ae2f1abffc2b (10.100.1.0/24, eu-north-1a)
    │   ├── Route Table: rtb-02e0df400c6d59518 (0.0.0.0/0 -> igw)
    │   └── EC2 Host: i-028b4179c559bffb9 (10.100.1.95 / 13.60.60.174, t3.small, AL2023)
    │       ├── Security Group: sg-0213eec021664fb5d (launch-wizard-staging: 0 INBOUND RULES)
    │       ├── Client SG: sg-0c419bb8f24c56ba3 (ec2-rds-staging)
    │       ├── IAM Instance Profile: OrbitHR-EC2-Staging-Profile (Role: OrbitHR-EC2-Staging-Role)
    │       └── Service: orbithr.service (Active: running, PID 32052, Node v20.20.2)
    ├── Private Subnet 1: subnet-0f8921e05d045cb97 (10.100.10.0/24, eu-north-1a)
    ├── Private Subnet 2: subnet-0ef42721f579549f3 (10.100.20.0/24, eu-north-1b)
    │   └── DB Subnet Group: dbsng-staging-orbithr
    │       └── RDS Instance: hrms-database-staging (db.t3.micro, PostgreSQL 18.3, Single-AZ)
    │           ├── Endpoint: hrms-database-staging.cdc6cyayy6za.eu-north-1.rds.amazonaws.com:5432
    │           ├── Security Group: sg-022b7179ca5885967 (Port 5432 from sg-0c419bb8f24c56ba3 only)
    │           ├── Master User: orbit_stage_admin
    │           ├── App User: orbithr_staging_app (Database Owner)
    │           └── Database: hrms_staging (89 tables, UTF-8)
    ├── S3 Bucket: orbithr-staging-deployments-402545554824
    │   ├── Public Access Block: 100% blocked (BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets)
    │   ├── Server-Side Encryption: AES256 default
    │   └── Lifecycle Configuration: Incomplete multipart abort after 1 day
    ├── SSM Parameter Store:
    │   ├── /orbithr/staging/database/master_password (SecureString, KMS alias/aws/ssm)
    │   └── /orbithr/staging/database/app_password (SecureString, KMS alias/aws/ssm)
    └── IAM Entities:
        ├── Policy: OrbitHR-EC2-Staging-Host-Policy (Customer-Managed)
        ├── Policy: OrbitHR-Staging-Provisioner-Permissions-Policy (Customer-Managed, 5,930 chars)
        ├── Policy: OrbitHR-Staging-Provisioner-Deny-Policy (Customer-Managed, 2,746 chars)
        ├── User: orbithr-staging-operator (Virtual MFA device registered)
        └── Role: OrbitHR-Staging-Provisioner (Trust: orbithr-staging-operator with MFA)
```

---

## 4. Acceptance Gate Evidence

### Gate P0: Dark Launch Ingress Audit
- **Verification Command:** `aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-0c6889ef293f31cdb"`
- **Result:**
  - `launch-wizard-staging` (`sg-0213eec021664fb5d`): `IpPermissions: []` (0 inbound rules).
  - Web ingress ports (80, 443, 3000, 3001) and SSH port (22) are completely closed.
  - Zero attack surface from the public Internet.
- **Status:** 🟢 **PASS**

### Gate P1: Production IAM & Storage Boundary Probe
- **Verification Command:** Staging EC2 host probe against production resources.
- **Result:**
  - Production S3 bucket (`s3://orbithr-production-deployments-402545554824`): `AccessDenied` (Forbidden).
  - Staging S3 bucket (`s3://orbithr-staging-deployments-402545554824`): Authorized.
  - Host policy enforces strict boundary with zero `iam:*` actions and zero `sts:AssumeRole`.
- **Status:** 🟢 **PASS**

### Gate P2: Host-Level Network Isolation Probe
- **Verification Script:** [`scripts/verify-network-isolation.sh`](file:///d:/Program%20Files/HRMS/scripts/verify-network-isolation.sh) executed on live staging host `i-028b4179c559bffb9` via AWS Systems Manager.
- **Evidence:**
  ```text
  [PASS] Staging EC2 Host IP Verification (10.100.1.95)
  [PASS] Staging RDS Port 5432 Reachability (Connected)
  [PASS] Staging Database User Authentication (Authenticated as orbithr_staging_app)
  [PASS] Production Database DNS & Routing Isolation (Connection timed out / Refused)
  [PASS] Production VPC Private IP Unreachability (172.31.x.x unreachable)
  [PASS] Local Port Binding Verification (Node listening on 127.0.0.1:3001)
  [PASS] Health Endpoint Response (HTTP 200 {"status":"OK","database":"CONNECTED"})
  [PASS] S3 Staging Bucket Access (200 OK)
  [PASS] S3 Production Bucket Isolation (403 Forbidden)
  [PASS] AWS SSM Parameter Store Access (/orbithr/staging/ parameters accessible)
  ```
- **Status:** 🟢 **PASS (10/10 checks verified)**

### Gate P3: Clean Database Baseline Check
- **Verification Query:** `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';`
- **Result:**
  - Initial Table Count on `hrms_staging`: `0`
  - Pristine empty schema confirmed before deployment pipeline execution.
- **Status:** 🟢 **PASS**

### Gate P4: Clean Migration Sequence Check (#1–32)
- **Deployment Pipeline:** [`deploy/deploy-staging.ps1`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1) & [`deploy/install-staging-release.sh`](file:///d:/Program%20Files/HRMS/deploy/install-staging-release.sh).
- **Execution Log:**
  ```text
  Applying migration `00000000000000_init`
  Applying migration `20260924140000_payroll_payment_metadata`
  Applying migration `20260924184500_onboarding_payroll_workflows`
  Applying migration `20260930134000_company_registration_documents`
  Applying migration `20261001103000_employee_workday_gps_tracking`
  Applying migration `20261001170000_push_device_app_version`
  Applying migration `20261003170000_p2_6b_reimbursement_linkage`
  Applying migration `20261004131500_p2_7a_compliance_foundation`
  Applying migration `20261004140000_p2_7b_epf_ecr_challan`
  Applying migration `20261004210000_p2_7c_esic_compliance`
  Applying migration `20261005000000_p2_8_tds_quarterly_compliance`
  Applying migration `20261005010000_p2_8_tds_challan_allocation`
  Applying migration `20261008000000_p2_9_pt_compliance_foundation`
  Applying migration `20261009000000_p2_10_compliance_calendar`
  All migrations have been successfully applied.
  ```
- **Verification Query:**
  - `SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;` -> **32**
  - `SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL;` -> **0**
  - `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';` -> **89**
- **Status:** 🟢 **PASS (32/32 applied sequentially, 0 rollbacks)**

### Gate P5: Sandbox & Notification Verification
- **Verification Query:** `curl -fsS http://127.0.0.1:3001/api/health`
- **Response:**
  ```json
  {"status":"OK","database":"CONNECTED","timestamp":"2026-10-15T11:29:01.427Z"}
  ```
- **Sandbox Guarantees:**
  - Firebase push notifications disabled (`Firebase push is disabled: configure FIREBASE service-account credentials`).
  - Outbound email providers unconfigured / isolated to test domain.
  - Zero live employee data loaded; strictly synthetic fixtures.
- **Status:** 🟢 **PASS**

---

## 5. Local Safety Regression Suite Results

All three comprehensive automated safety regression suites were executed locally against the codebase and infrastructure plans:

| Suite | Script | Tests | Result |
| :--- | :--- | :--- | :--- |
| **Provisioning & Teardown Safety** | [`scripts/test_provisioning_and_teardown_safety.ps1`](file:///d:/Program%20Files/HRMS/scripts/test_provisioning_and_teardown_safety.ps1) | 19 / 19 | 🟢 **100% PASS** |
| **Staging Deployment Security** | [`scripts/test_staging_deployment_security.ps1`](file:///d:/Program%20Files/HRMS/scripts/test_staging_deployment_security.ps1) | 14 / 14 | 🟢 **100% PASS** |
| **Gate P2 Network Isolation** | [`scripts/test_gate_p2_isolation.ps1`](file:///d:/Program%20Files/HRMS/scripts/test_gate_p2_isolation.ps1) | 10 / 10 | 🟢 **100% PASS** |
| **Total Automated Tests** | | **43 / 43** | 🟢 **100% PASS** |

---

## 6. Zero Production Impact Statement

During the entire provisioning, deployment, and verification lifecycle:
1. **Production EC2 Instance (`i-068f8f1e571bc5cc6`):** Untouched. State remained `running`. Zero commands dispatched.
2. **Production Database (`hrms-database.cdc6cyayy6za.eu-north-1.rds.amazonaws.com`):** Untouched. Zero connections, zero DDL statements, zero queries executed.
3. **Production S3 Bucket (`orbithr-production-deployments-402545554824`):** Untouched. Zero uploads, zero downloads, zero modifications.
4. **Production VPC (`vpc-0f8de3bbcdc8e468f`):** Untouched. Zero route table changes, zero security group modifications.
5. **Production IAM Identities:** Untouched. All production roles and instance profiles remain completely unchanged.

---

## 7. Current Operational State & Recommendations

The OrbitHR staging environment is currently active, stable, and held in a **secure dark launch posture**:
- Host `i-028b4179c559bffb9` is running `orbithr.service` under systemd.
- Local health check on `127.0.0.1:3001` responds with HTTP 200 and healthy database connectivity.
- Systems Manager (SSM) session administration is operational.
- Security group `launch-wizard-staging` contains **zero inbound rules**.

**Recommendation for Next Phase:**
When authorized by the security lead:
1. Retain dark launch state for synthetic data seeding and automated load testing via SSM port forwarding.
2. If public or employee-accessible staging access is required, provision an AWS Application Load Balancer (ALB) with ACM TLS certificate and restricted source IP CIDR allowlists, or connect via AWS Client VPN rather than opening direct EC2 ingress.
