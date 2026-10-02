#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || exit 1
[[ $# -eq 2 ]] || exit 1
archive=$(readlink -f $1)
release_id=${2//[^a-zA-Z0-9._-]/-}
user=${ORBIT_DEPLOY_USER:-ec2-user}
app=/home/ec2-user/HRSM
root=/home/ec2-user/orbithr-releases
shared=/home/ec2-user/orbithr-shared
release=${root}/release-${release_id}
service=${ORBIT_SERVICE_NAME:-orbithr.service}
health=http://127.0.0.1:3001/api/health
[[ -f ${archive} ]] || exit 1
install -d -m 0750 -o ${user} -g ${user} ${root} ${shared} ${shared}/storage

# Keep disk usage bounded before extracting a new release. The active release
# and one additional release are retained so rollback remains available.
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
done < <(find "${root}" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)

if [[ ! -f ${shared}/.env ]]; then
  install -m 0600 -o ${user} -g ${user} ${app}/.env ${shared}/.env
fi
# MFA secrets must survive releases and must never be stored unencrypted. Create
# the AES-256 key once in the persistent environment when it is absent/invalid.
if ! grep -Eq '^MFA_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$' ${shared}/.env; then
  sed -i '/^MFA_ENCRYPTION_KEY=/d' ${shared}/.env
  printf '\nMFA_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32 | tr -d '\n')" >> ${shared}/.env
fi
chown ${user}:${user} ${shared}/.env
chmod 0600 ${shared}/.env
[[ ! -e ${release} ]] || exit 1
install -d -m 0750 -o ${user} -g ${user} ${release}
tar -xzf ${archive} -C ${release}
ln -s ${shared}/.env ${release}/.env
ln -s ${shared}/storage ${release}/storage
chown -R ${user}:${user} ${release}
for path in package.json server/index.ts dist/index.html prisma/schema.prisma; do
  [[ -e ${release}/${path} ]] || exit 1
done
if [[ -d ${app}/node_modules ]] && cmp -s ${app}/package-lock.json ${release}/package-lock.json; then
  cp -al ${app}/node_modules ${release}/node_modules
else
  runuser -u ${user} -- bash -lc 'cd $1 && npm ci --omit=dev --no-audit --no-fund' _ ${release}
fi
runuser -u ${user} -- bash -lc 'cd $1 && npx prisma generate && npx prisma migrate deploy' _ ${release}
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
    systemctl restart ${service}
  fi
  journalctl -u ${service} -n 100 --no-pager >&2 || true
  exit 1
fi
echo OrbitHR-${release_id}-deployed
