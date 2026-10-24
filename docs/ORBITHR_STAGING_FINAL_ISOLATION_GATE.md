# OrbitHR P2.10 RC2 — Final Isolation Gate & Deployment Security Audit
## Remediated Staging Deployment Security Review, Automated Test Results & Phase 1 Authorization Gate

**Document Location:** `docs/ORBITHR_STAGING_FINAL_ISOLATION_GATE.md`  
**Candidate Release:** `v1.5.9-p2.10-hardened-rc2`  
**Candidate Commit:** `e249b412735eaa79773d974af43e35f779b1cc4a`  
**Branch:** `hardening/p2.10-compliance-calendar`  
**AWS Region:** `eu-north-1`  
**AWS Account ID:** `402545554824`  
**Audit Timestamp:** 2026-10-10T19:05:00Z  
**Audit Mode:** Strict Read-Only Security Verification & Local Negative Testing Gate  

---

## 1. Executive Summary & Authorization Decision

### **FINAL DECISION: READY FOR EXPLICIT OPERATOR AUTHORIZATION (PHASE 1 PROVISIONING ONLY)**

Following the security review of the staging deployment pipeline, all identified packaging, manifest inspection, receiving-side integrity, database host validation, and cleanup blockers have been **fully remediated and proven locally** through automated negative and positive test suites.

* **Local Packaging & Security Controls:** 100% **`VERIFIED`** locally across 14 automated tests.
* **Production Rejection & Guardrails:** 100% **`VERIFIED`** (production instance IDs, buckets, database endpoints, and dirty working trees are rejected fail-closed).
* **AWS Staging Infrastructure:** **`PLANNED`** (zero AWS resources have been provisioned or altered).
* **Network & Database Isolation:** **`NOT VERIFIED (POST-PROVISIONING GATE)`** (can only be validated live against provisioned staging security groups).
* **Release Boundaries:** **`BLOCKED`** (deployment to staging, production deployment, remote tag pushes, and P2.11 remain strictly prohibited).

Phase 1 infrastructure provisioning (creating isolated IAM roles, S3 bucket, staging security groups, staging RDS, and staging EC2) is technically safe and ready for explicit operator authorization.

---

## 2. Security Control Classification & Remediation Matrix

| # | Security Control | Status | Code Location | Remediation & Forensic Verification |
| :-: | :--- | :---: | :--- | :--- |
| **1** | **Reproducible Packaging & Working-Tree Cleanliness** | 🟢 **VERIFIED** | [`deploy/deploy-staging.ps1:51-78`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1#L51-L78) | Enforces `git rev-parse HEAD == e249b412...`, checks `git diff-index --quiet HEAD --`, and asserts zero unexpected untracked files in payload paths before packaging. |
| **2** | **Sensitive File & Secret Exclusion** | 🟢 **VERIFIED** | [`deploy/deploy-staging.ps1:136-154`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1#L136-L154) | Comprehensive exclusion list: `.env*`, `.git*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.sql`, `*.dump`, `*.sqlite*`, `*.bak`, `*serviceAccount*.json`, `storage/*`, `*.log`, `node_modules`, `*.map`, and `*.apk`. Archive reduced from 67MB to 2.08MB. |
| **3** | **Archive Manifest Pre-Upload Inspection** | 🟢 **VERIFIED** | [`deploy/deploy-staging.ps1:166-189`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1#L166-L189) | Post-packaging inspection runs `tar -tzf $artifact` and asserts zero prohibited file patterns exist. Verifies presence of all required runtime files (`package.json`, `dist/index.html`, `server/index.ts`, `prisma/schema.prisma`, `deploy/install-staging-release.sh`). |
| **4** | **Receiving-Side Cryptographic SHA-256 Validation** | 🟢 **VERIFIED** | [`deploy/install-staging-release.sh:45-63`](file:///d:/Program%20Files/HRMS/deploy/install-staging-release.sh#L45-L63) | Safely passes calculated SHA-256 to EC2 via SSM. Receiving host validates hash format (`^[a-f0-9]{64}$`) and computes `sha256sum "${archive}"` before extraction. Fails closed on mismatch, malformed hash, or missing hash. |
| **5** | **Target Database Host Safety Validation** | 🟢 **VERIFIED** | [`deploy/install-staging-release.sh:10-43`](file:///d:/Program%20Files/HRMS/deploy/install-staging-release.sh#L10-L43) | Parses `DATABASE_URL` from `/home/ec2-user/orbithr-shared/.env`. Explicitly rejects production RDS endpoints (`hrms-database.c3a2m0wq8...` and `hrms-database`). Strictly asserts staging identity `hrms-database-staging` before running `prisma migrate deploy`. |
| **6** | **Multi-Factor Target Identity Assertion** | 🟢 **VERIFIED** | [`deploy/deploy-staging.ps1:223-255`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1#L223-L255) | Evaluates Account ID `402545554824`, instance state (`running`), tag (`Name=OrbitHR-Staging`), attached IAM instance profile (`OrbitHR-EC2-Staging-Role`), and explicitly rejects production instance ID and public IP (`16.170.241.109`). |
| **7** | **Production Isolation & Security Group Boundaries** | ⚪ **NOT VERIFIED** | Cloud Infrastructure (Post-Provisioning) | Application-level database checks are verified. However, physical network isolation (security group blocking TCP 5432 cross-environment) can only be verified live after staging VPC/security groups are provisioned. |
| **8** | **Safe Failure Cleanup (Local, S3 & Remote)** | 🟢 **VERIFIED** | [`deploy/deploy-staging.ps1:367-385`](file:///d:/Program%20Files/HRMS/deploy/deploy-staging.ps1#L367-L385) | Local temporary files cleaned up in `finally`. S3 uploaded object deleted via `aws s3 rm` if deployment fails before success. Remote SSM commands wrapped in bash exit trap (`trap 'rm -f ...' EXIT`) to prevent lingering artifacts in `/tmp`. |
| **9** | **Budget Ceiling & Monitoring Procedure** | 🟢 **VERIFIED** | Section 4 Documentation | $50.00/month is established as an operational budget target (not a hard AWS cap). Explicit notification thresholds (80% / $40, 100% / $50) and a post-teardown inventory check command list are defined. |
| **10**| **Repository, Candidate Tag & Production Integrity** | 🟢 **VERIFIED** | Local Git & AWS Environment | HEAD commit `e249b412735eaa79773d974af43e35f779b1cc4a` and tag `v1.5.9-p2.10-hardened-rc2` intact. Zero remote tags (`git ls-remote`). Zero tracked files modified. Zero production changes. |

---

## 3. Automated Local Security Test Results

The automated security test suite ([`scripts/test_staging_deployment_security.ps1`](file:///d:/Program%20Files/HRMS/scripts/test_staging_deployment_security.ps1)) executed 14 safe, strictly local negative and positive verification tests without contacting AWS or production:

| Test ID | Test Name | Result | Verified Security Behavior |
| :---: | :--- | :---: | :--- |
| **T01** | `deploy-staging.ps1 PowerShell Syntax` | 🟢 **PASS** | Validated PowerShell syntax with zero parser errors. |
| **T02** | `install-staging-release.sh Bash Syntax` | 🟢 **PASS** | Validated POSIX Bash syntax via `bash -n` with zero errors. |
| **T03** | `Unapproved Commit Rejection` | 🟢 **PASS** | Tested unapproved commit `00000000...`: script aborted immediately with `FAIL-CLOSED: Commit mismatch!`. |
| **T04** | `Production Instance ID Rejection` | 🟢 **PASS** | Targeted `i-068f8f1e571bc5cc6`: script aborted immediately with `FAIL-CLOSED: Production instance... was provided as staging target!`. |
| **T05** | `Production S3 Bucket Rejection` | 🟢 **PASS** | Targeted `orbithr-production-deployments-402545554824`: script aborted immediately with `FAIL-CLOSED: Production S3 bucket targeted!`. |
| **T06** | `Release Artifact Packaging` | 🟢 **PASS** | Successfully generated clean release archive `orbithr-staging-e249b41-...tgz` (2.08 MB) and computed SHA-256 hash. |
| **T07** | `Manifest Sensitive File Exclusion` | 🟢 **PASS** | Inspected archive manifest: confirmed zero `.apk`, `.env`, `.pem`, `.key`, `.sql`, or `storage/` files exist. |
| **T08** | `Manifest Required File Inclusion` | 🟢 **PASS** | Verified required files exist in archive: `deploy/install-staging-release.sh`, `server/index.ts`, `prisma/schema.prisma`, etc. |
| **T09** | `Receiving-Side Correct Hash Verification` | 🟢 **PASS** | Installer accepted archive when supplied with matching SHA-256 checksum (`VERIFIED: Release archive SHA-256 matches`). |
| **T10** | `Receiving-Side Wrong Hash Rejection` | 🟢 **PASS** | Supplied mismatched hash `ffffffff...`: installer aborted immediately with `FATAL: SHA-256 checksum mismatch!`. |
| **T11** | `Receiving-Side Malformed Hash Rejection` | 🟢 **PASS** | Supplied malformed hash `not_a_valid_hash`: installer aborted with `FATAL: Expected SHA-256 hash is invalid or malformed`. |
| **T12** | `Production RDS Endpoint Rejection` | 🟢 **PASS** | Tested `DATABASE_URL` pointing to `hrms-database.c3a2m0wq8...`: installer aborted immediately with `FATAL: Production database host detected in staging environment!`. |
| **T13** | `Non-Staging Database Host Rejection` | 🟢 **PASS** | Tested `DATABASE_URL` pointing to `some-arbitrary-db...`: installer aborted with `FATAL: Database host does not match expected staging identity`. |
| **T14** | `Valid Staging RDS Endpoint Acceptance` | 🟢 **PASS** | Tested `DATABASE_URL` pointing to `hrms-database-staging.c3a2m0wq8...`: installer confirmed identity `VERIFIED: Target database endpoint matches staging identity: hrms-database-staging`. |

**Overall Test Suite Result: 14 / 14 Tests Passed (100% Success Rate).**

---

## 4. Operational Budget Ceiling & Monitoring Plan

### A. Nature of the $50.00/Month Budget
* The **$50.00/month** figure is an **operational budget target and ceiling**, NOT an automated AWS hard spending limit. AWS does not terminate or suspend running EC2 or RDS instances when a monetary threshold is crossed unless custom AWS Budgets Actions are explicitly configured.
* Based on validated pricing for AWS region `eu-north-1`, the continuous 24/7 run-rate for staging (`t3.small` EC2 + `db.t3.micro` RDS + EBS/gp3 storage) is **~$40.34/month**. A 3-day test run is estimated at **~$4.00**.

### B. Notification Thresholds & Teardown Verification
1. **AWS Budget Alert Thresholds (Recommended Post-Provisioning):**
   * *Threshold 1 (80% / $40.00):* Warning alert dispatched to operator email upon reaching projected monthly spend.
   * *Threshold 2 (100% / $50.00):* Critical alert dispatched to operator email demanding immediate review or teardown.
2. **Mandatory Post-Teardown Verification Checklist:**
   To guarantee post-cleanup spend returns to $0.00/month, the operator must execute the following read-only inventory checks after teardown:
   ```bash
   # 1. Confirm zero running or stopped staging EC2 instances
   aws ec2 describe-instances --filters "Name=tag:Name,Values=OrbitHR-Staging" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query "Reservations[].Instances[].InstanceId" --output text
   # 2. Confirm zero staging RDS instances
   aws rds describe-db-instances --db-instance-identifier hrms-database-staging --query "DBInstances[].DBInstanceStatus" --output text 2>&1
   # 3. Confirm staging S3 bucket is purged and deleted
   aws s3 ls s3://orbithr-staging-deployments-402545554824 2>&1
   ```

---

## 5. Physical Inventory: Existing vs. Proposed Resources

| Resource Type | Existing Production Resource (Verified Active) | Proposed Staging Resource (PLANNED — Does Not Exist) |
| :--- | :--- | :--- |
| **AWS Account** | `402545554824` (`eu-north-1`) | Shared account `402545554824` (`eu-north-1`) |
| **EC2 Web/App Host** | `i-068f8f1e571bc5cc6` (Amazon Linux 2023, `x86_64`) | `i-staging-orbithr` (`t3.small`, Amazon Linux 2023, `x86_64`) |
| **RDS Database** | `hrms-database` (PostgreSQL, production data) | `hrms-database-staging` (`db.t3.micro`, PostgreSQL, clean/empty) |
| **S3 Deployment Bucket** | `orbithr-production-deployments-402545554824` | `orbithr-staging-deployments-402545554824` |
| **IAM Instance Role** | Production EC2 Role (attached to `i-068f8f1e571bc5cc6`) | `OrbitHR-EC2-Staging-Role` (scoped strictly to staging bucket/Rekognition) |
| **IAM Deployment Role** | `OrbitHR-GitHub-Production-Deploy` | `OrbitHR-GitHub-Staging-Deploy` |
| **Security Groups** | Production EC2 & RDS security groups | `launch-wizard-staging`, `rds-staging-sg`, `ec2-rds-staging` |
| **Rekognition Collection** | Production facial collection | `orbithr-staging` |
| **DNS / Web Domain** | `hr.balajione.dev` | `staging.hr.balajione.dev` |

---

## 6. Post-Provisioning Verification Gates (Required Prior to Release Execution)

Before any release artifact is uploaded or migrations are executed against the provisioned staging infrastructure, the following **Post-Provisioning Gates** must be verified live:

1. **Gate P1 (IAM Boundary Enforcement):** Execute AWS CLI from the staging EC2 host via SSM asserting `AccessDenied` when querying `s3://orbithr-production-deployments-402545554824`.
2. **Gate P2 (Network Security Group Isolation):** Confirm staging EC2 cannot connect to production RDS `hrms-database:5432`, and production EC2 cannot connect to `hrms-database-staging:5432`.
3. **Gate P3 (Empty Database Baseline):** Connect via SSM port-forwarding to `hrms-database-staging` and confirm `_prisma_migrations` table is initially non-existent.
4. **Gate P4 (Sequential Migration Verification):** Run `npx prisma migrate deploy` and verify all 32 migrations apply in order with zero errors.
5. **Gate P5 (Synthetic Seed & Notification Sink):** Verify test seed populates mock employees only, and outbound emails/push notifications are routed strictly to the Resend sandbox sink and isolated Firebase project.

---

## 7. Mandatory Final Statement

No staging infrastructure was provisioned. No production deployment or migration was executed. No remote commit or tag was pushed. P2.11 remains blocked.
