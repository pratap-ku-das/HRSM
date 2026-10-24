#!/usr/bin/env bash
# =============================================================================
# OrbitHR Staging Release Installer
# Fail-closed deployment installer with cryptographic SHA-256 verification,
# archive manifest security audits, and strict database host validation.
# =============================================================================
set -Eeuo pipefail

validate_database_url() {
  local env_file="$1"
  if [[ ! -f "${env_file}" ]]; then
    echo "FATAL: Target environment file not found: '${env_file}'" >&2
    exit 1
  fi

  local db_line
  db_line=$(grep -E '^[[:space:]]*DATABASE_URL=' "${env_file}" | head -n1 || true)
  if [[ -z "${db_line}" ]]; then
    echo "FATAL: DATABASE_URL is missing in '${env_file}'" >&2
    exit 1
  fi

  local raw_url
  raw_url=$(echo "${db_line}" | cut -d'=' -f2- | sed -e 's/^[[:space:]]*["'"'"']//' -e 's/["'"'"'][[:space:]]*$//')

  # Extract hostname part from PostgreSQL connection string
  local host_part
  host_part=$(echo "${raw_url}" | sed -E -e 's|^.*@([^:/]+).*$|\1|' -e 's|^.*://([^:/]+).*$|\1|')

  # Reject production database endpoint explicitly
  if [[ "${host_part}" == *"hrms-database.c3a2m0wq8"* ]] || [[ "${host_part}" == "hrms-database" ]] || [[ "${raw_url}" == *"hrms-database.c3a2m0wq8"* ]]; then
    echo "FATAL: Production database host detected in staging environment! Aborting immediately." >&2
    exit 1
  fi

  # Assert staging database identity
  if [[ "${host_part}" != *"hrms-database-staging"* ]]; then
    echo "FATAL: Database host '${host_part}' does not match expected staging identity 'hrms-database-staging'!" >&2
    exit 1
  fi

  echo "VERIFIED: Target database endpoint matches staging identity: ${host_part}"
}

# Standalone database URL validation test mode
if [[ "${1:-}" == "--test-db" ]]; then
  [[ $# -ge 2 ]] || { echo "Usage: $0 --test-db <env-file>" >&2; exit 1; }
  validate_database_url "$2"
  echo "VERIFIED: Database URL validation test passed."
  exit 0
fi

usage() {
  echo "Usage: $0 <archive-path> <release-id> <expected-sha256> [--verify-only]" >&2
  exit 1
}

[[ $# -ge 3 ]] || usage

archive=$(readlink -f "$1" || echo "$1")
release_id="${2//[^a-zA-Z0-9._-]/-}"
expected_sha256="$3"
mode="${4:-}"

# -----------------------------------------------------------------------------
# Control 1: Cryptographic SHA-256 Integrity Validation
# -----------------------------------------------------------------------------
if [[ ! "${expected_sha256}" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "FATAL: Expected SHA-256 hash is invalid or malformed: '${expected_sha256}'" >&2
  exit 1
fi

if [[ ! -f "${archive}" ]]; then
  echo "FATAL: Archive file not found: '${archive}'" >&2
  exit 1
fi

actual_hash=$(sha256sum "${archive}" | awk '{print $1}')
if [[ "${actual_hash,,}" != "${expected_sha256,,}" ]]; then
  echo "FATAL: SHA-256 checksum mismatch! Expected ${expected_sha256}, got ${actual_hash}" >&2
  exit 1
fi
echo "VERIFIED: Release archive SHA-256 matches: ${actual_hash}"

# -----------------------------------------------------------------------------
# Control 2: Archive Manifest Security Inspection
# -----------------------------------------------------------------------------
prohibited_patterns='(\.env|\.pem|\.key|\.p12|\.pfx|backup\.sql|dump\.sql|\.dump|\.sqlite|\.bak|serviceAccount|\.apk|storage/|node_modules/)'
prohibited_matches=$(tar -tzf "${archive}" | grep -Ei "${prohibited_patterns}" || true)
if [[ -n "${prohibited_matches}" ]]; then
  echo "FATAL: Release archive contains prohibited sensitive files or paths:" >&2
  echo "${prohibited_matches}" >&2
  exit 1
fi
echo "VERIFIED: Archive manifest is clean of prohibited files."

# Pre-installation verification hook for unit tests without root or systemd
if [[ "${mode}" == "--verify-only" ]]; then
  echo "VERIFIED: Pre-installation cryptographic and manifest verification passed."
  exit 0
fi

# -----------------------------------------------------------------------------
# Full Host Installation (Requires Root Privileges on EC2)
# -----------------------------------------------------------------------------
[[ ${EUID} -eq 0 ]] || { echo "FATAL: Full installation requires root privileges on the staging EC2 host." >&2; exit 1; }

user=${ORBIT_DEPLOY_USER:-ec2-user}
app=/home/ec2-user/HRSM
root=/home/ec2-user/orbithr-releases
shared=/home/ec2-user/orbithr-shared
release=${root}/release-${release_id}
service=${ORBIT_SERVICE_NAME:-orbithr.service}
health=http://127.0.0.1:3001/api/health

install -d -m 0750 -o ${user} -g ${user} ${root} ${shared} ${shared}/storage

# Retain rollback releases
active_release=
if [[ -L ${app} ]]; then
  active_release=$(readlink -f ${app} || true)
fi
retained_rollback=0
while IFS= read -r candidate; do
  candidate=$(readlink -f -- "${candidate}" || true)
  [[ -n ${candidate} ]] || continue
  case ${candidate} in
    ${root}/release-*) ;;
    *) continue ;;
  esac
  if [[ ${candidate} == "${active_release}" ]]; then
    continue
  fi
  if [[ ${retained_rollback} -eq 0 ]]; then
    retained_rollback=1
    continue
  fi
  rm -rf -- "${candidate}"
done < <(find "${root}" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | cut -d' ' -f2- || true)

# Environment configuration must exist on staging host
if [[ ! -f ${shared}/.env ]]; then
  echo "FATAL: Staging environment file ${shared}/.env is missing!" >&2
  exit 1
fi

# Validate target database before extracting or running any migrations
validate_database_url "${shared}/.env"

# MFA key generation if absent
if ! grep -Eq '^MFA_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$' ${shared}/.env; then
  sed -i '/^MFA_ENCRYPTION_KEY=/d' ${shared}/.env
  printf '\nMFA_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32 | tr -d '\n')" >> ${shared}/.env
fi
chown ${user}:${user} ${shared}/.env
chmod 0600 ${shared}/.env

[[ ! -e ${release} ]] || { echo "FATAL: Release directory ${release} already exists." >&2; exit 1; }
install -d -m 0750 -o ${user} -g ${user} ${release}

tar -xzf ${archive} -C ${release}
ln -s ${shared}/.env ${release}/.env
ln -s ${shared}/storage ${release}/storage
chown -R ${user}:${user} ${release}

for path in package.json server/index.ts dist/index.html prisma/schema.prisma; do
  [[ -e ${release}/${path} ]] || { echo "FATAL: Required file ${path} missing from release." >&2; exit 1; }
done

if [[ -d ${app}/node_modules ]] && cmp -s ${app}/package-lock.json ${release}/package-lock.json; then
  cp -al ${app}/node_modules ${release}/node_modules
else
  runuser -u ${user} -- bash -lc 'cd $1 && npm ci --omit=dev --no-audit --no-fund' _ ${release}
fi

# Execute Prisma migrations against validated staging database
runuser -u ${user} -- bash -lc '
  cd $1
  npx prisma generate

  # On fresh staging DB or if not yet migrated, mark pre-baseline migrations as resolved before deploy
  # to prevent collision with the consolidated 00000000000000_init schema.
  for m in \
    20260831130000_mobile_auth \
    20260910150000_employee_face_verification \
    20260913110000_org_rbac_foundation \
    20260913150000_workflow_engine \
    20260914090000_attendance_engine \
    20260914113000_payroll_engine \
    20260914150000_notifications \
    20260915100000_governance_reporting_security_ai \
    20260915130000_totp_mfa \
    20260915150000_leave_policy \
    20260915170000_performance_reviews \
    20260915190000_employee_service_requests \
    20260915210000_session_metadata \
    20260916120000_recruitment_analytics \
    20260921113000_auth_schema_drift_repair \
    20260921121500_session_schema_drift_repair \
    20260921123000_employee_org_columns_drift_repair \
    20260921124500_stored_rbac_drift_repair; do
    npx prisma migrate resolve --applied "$m" 2>/dev/null || true
  done

  npx prisma migrate deploy
' _ ${release}

previous=
legacy=
if [[ -L ${app} ]]; then
  previous=$(readlink -f ${app})
elif [[ -d ${app} ]]; then
  legacy=${root}/legacy-$(date -u +%Y%m%d%H%M%S)
  previous=${legacy}
fi

systemctl stop ${service}
if [[ -n ${legacy} ]]; then mv ${app} ${legacy}; fi
ln -sfnT ${release} ${app}
ln -sfnT ${release} /home/ec2-user/orbithr
systemctl start ${service} || true

healthy=false
for _ in {1..20}; do
  if curl -fsS --max-time 5 ${health} >/dev/null; then
    healthy=true
    break
  fi
  sleep 3
done

if [[ ${healthy} != true ]]; then
  if [[ -n ${previous} && -e ${previous} ]]; then
    ln -sfnT ${previous} ${app}
    ln -sfnT ${previous} /home/ec2-user/orbithr
    systemctl restart ${service}
  fi
  journalctl -u ${service} -n 100 --no-pager >&2 || true
  exit 1
fi

echo OrbitHR-Staging-${release_id}-deployed
