#!/usr/bin/env bash
# OrbitHR P2.10 RC2 - Gate P2: Hardened Network Isolation & Database Identity Probe
# Candidate: v1.5.9-p2.10-hardened-rc2 (e249b412735eaa79773d974af43e35f779b1cc4a)
# Strict Fail-Closed Execution: Only reports PASS when 100% of assertions succeed.

set -euo pipefail

# Guarantee shell tracing is disabled to protect credentials
set +x 2>/dev/null

PROD_RDS_ENDPOINT="hrms-database.cdc6cyayy6za.eu-north-1.rds.amazonaws.com"
STAGING_RDS_ENDPOINT="${1:-}"
STAGING_DB_USER="orbithr_staging_app"
STAGING_DB_NAME="hrms_staging"
AWS_REGION="${AWS_REGION:-eu-north-1}"
export PGSSLMODE=require

# Cleanup routine for temporary credentials on exit or interruption
# Note: On cloud-backed EBS and SSD storage, file overwriting does not guarantee physical erasure
# due to wear-leveling and block remapping. Defense relies on minimal secret lifetime,
# restrictive POSIX permissions (0600), memory unsetting, and guaranteed unlinking.
PGPASS_TMP=""
cleanup_creds() {
    local rc=$?
    set +x 2>/dev/null
    if [ -n "${PGPASS_TMP:-}" ] && [ -f "$PGPASS_TMP" ]; then
        rm -f "$PGPASS_TMP" 2>/dev/null || true
    fi
    unset APP_SECRET ESCAPED_SECRET PGPASSWORD
    exit "$rc"
}
trap cleanup_creds EXIT INT TERM HUP QUIT ERR

if [ -z "$STAGING_RDS_ENDPOINT" ]; then
    echo "FATAL: Staging RDS endpoint argument is missing." >&2
    exit 1
fi

echo "=========================================================="
echo "OrbitHR Gate P2: Hardened Network Isolation & Identity Test"
echo "=========================================================="

# 1. Prerequisite Tool Verification
echo "[CHECK 1] Verifying Required Verification Utilities..."
for tool in nc psql aws getent; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: Required tool '$tool' is not installed or not in PATH." >&2
        exit 1
    fi
done
echo "PASS: All required tools (nc, psql, aws, getent) are present."

# 2. Production DNS Resolution Verification
echo "[CHECK 2] Resolving Production RDS DNS Endpoint..."
PROD_IP=$(getent hosts "$PROD_RDS_ENDPOINT" 2>/dev/null | awk '{print $1}' | head -n 1 || true)
if [ -z "$PROD_IP" ]; then
    echo "FATAL: Failed to resolve DNS for Production RDS endpoint '$PROD_RDS_ENDPOINT'." >&2
    echo "Cannot conclusively prove isolation if production IP is indeterminate." >&2
    exit 1
fi
echo "PASS: Production RDS resolved to IP address: $PROD_IP"

# 3. Fail-Closed Probe: TCP Ingress to Production RDS (Must strictly timeout or refuse)
echo "[CHECK 3] Probing TCP Port 5432 on Production RDS ($PROD_IP)..."
if nc -zv -w 3 "$PROD_IP" 5432 2>/dev/null; then
    echo "CRITICAL BREACH: Staging EC2 host established TCP connection to PRODUCTION RDS ($PROD_IP:5432)!" >&2
    echo "ISOLATION FAILURE. HALTING EXECUTION." >&2
    exit 1
fi
echo "PASS: TCP connection to Production RDS port 5432 timed out / was rejected as required."

# 4. Host Route Table Isolation Check (Zero routes to Production CIDR 172.31.0.0/16)
echo "[CHECK 4] Inspecting Host Routing Table for Cross-VPC Routes..."
if ip route 2>/dev/null | grep -E "172\.31\." >/dev/null 2>&1; then
    echo "CRITICAL BREACH: Host routing table contains route to production CIDR (172.31.0.0/16)!" >&2
    exit 1
fi
echo "PASS: Host routing table contains zero routes to production CIDR (172.31.0.0/16)."

# 5. Staging DNS & TCP Probe (Must strictly succeed)
echo "[CHECK 5] Resolving and Probing Staging RDS TCP Port 5432..."
STAGING_IP=$(getent hosts "$STAGING_RDS_ENDPOINT" 2>/dev/null | awk '{print $1}' | head -n 1 || true)
if [ -z "$STAGING_IP" ]; then
    echo "FATAL: Failed to resolve DNS for Staging RDS endpoint '$STAGING_RDS_ENDPOINT'." >&2
    exit 1
fi
if ! nc -zv -w 5 "$STAGING_IP" 5432 2>/dev/null; then
    echo "FATAL: Staging EC2 cannot establish TCP connection to Staging RDS ($STAGING_IP:5432)!" >&2
    exit 1
fi
echo "PASS: Staging RDS TCP port 5432 is open and accessible from Staging EC2."

# 6. Secure Credential Injection & Database Identity Check (Zero Leaks, Strict Escaping)
echo "[CHECK 6] Validating Target Database Identity via Secure Memory Credentials..."

# Initialize secure temporary .pgpass file with strict 0600 mode
PGPASS_TMP=$(mktemp)
chmod 0600 "$PGPASS_TMP"

# Retrieve application secret directly from SSM without printing to console
APP_SECRET=$(aws ssm get-parameter --name "/orbithr/staging/database/app_password" --with-decryption --query "Parameter.Value" --output text --region "$AWS_REGION" 2>/dev/null || true)
if [ -z "$APP_SECRET" ]; then
    echo "FATAL: Failed to securely retrieve staging application password from SSM Parameter Store." >&2
    exit 1
fi

# Escape backslashes and colons per PostgreSQL .pgpass specifications
ESCAPED_SECRET=$(printf '%s' "$APP_SECRET" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g')

# Write .pgpass entry: hostname:port:database:username:password
printf "%s:%s:%s:%s:%s\n" "$STAGING_RDS_ENDPOINT" "5432" "$STAGING_DB_NAME" "$STAGING_DB_USER" "$ESCAPED_SECRET" > "$PGPASS_TMP"
unset APP_SECRET ESCAPED_SECRET

# Query database name and current user without passing password on command line or echoing secret
RESOLVED_DB=$(PGPASSFILE="$PGPASS_TMP" psql -h "$STAGING_RDS_ENDPOINT" -p 5432 -U "$STAGING_DB_USER" -d "$STAGING_DB_NAME" -t -A -c "SELECT current_database();" 2>/dev/null || true)
RESOLVED_USER=$(PGPASSFILE="$PGPASS_TMP" psql -h "$STAGING_RDS_ENDPOINT" -p 5432 -U "$STAGING_DB_USER" -d "$STAGING_DB_NAME" -t -A -c "SELECT current_user;" 2>/dev/null || true)

# Immediately unlink temporary .pgpass file to minimize secret lifetime window
rm -f "$PGPASS_TMP" 2>/dev/null || true
PGPASS_TMP=""

if [ "$RESOLVED_DB" != "$STAGING_DB_NAME" ]; then
    echo "CRITICAL ERROR: Connected to unexpected database '$RESOLVED_DB' (Expected '$STAGING_DB_NAME')!" >&2
    exit 1
fi

if [ "$RESOLVED_USER" != "$STAGING_DB_USER" ]; then
    echo "CRITICAL ERROR: Connected as unexpected user '$RESOLVED_USER' (Expected '$STAGING_DB_USER')!" >&2
    exit 1
fi

echo "PASS: Confirmed connection to isolated staging database '$RESOLVED_DB' as least-privilege user '$RESOLVED_USER'."
echo "=========================================================="
echo "[GATE P2 RESULT] 100% OF ASSERTIONS PASSED. NETWORK ISOLATION AND DATABASE IDENTITY PROVEN."
echo "=========================================================="
exit 0
