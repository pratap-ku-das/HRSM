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
install -d -m 0750 -o ${user} -g ${user} ${root} ${shared}
if [[ ! -f ${shared}/.env ]]; then
  install -m 0600 -o ${user} -g ${user} ${app}/.env ${shared}/.env
fi
[[ ! -e ${release} ]] || exit 1
install -d -m 0750 -o ${user} -g ${user} ${release}
tar -xzf ${archive} -C ${release}
ln -s ${shared}/.env ${release}/.env
chown -R ${user}:${user} ${release}
for path in package.json server/index.ts dist/index.html prisma/schema.prisma; do
  [[ -e ${release}/${path} ]] || exit 1
done
runuser -u ${user} -- bash -lc 'cd $1 && npm ci --omit=dev --no-audit --no-fund' _ ${release}
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
