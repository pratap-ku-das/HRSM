$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail
cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015164750

# Source DATABASE_URL from .env
eval $(grep '^DATABASE_URL=' .env)
export DATABASE_URL

echo "--- 1. Resetting schema public to empty ---"
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO orbithr_staging_app;"

echo "--- 2. Verifying initial table count is 0 ---"
COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "TABLE_COUNT_BEFORE=$COUNT"

echo "--- 3. Running npx prisma migrate deploy ---"
runuser -u ec2-user -- bash -lc 'cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015164750 && npx prisma migrate deploy'

echo "--- 4. Checking migration results ---"
MIG_COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
ROLLED_BACK=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL;")
FINAL_TABLES=$(psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")

echo "MIGRATIONS_APPLIED=$MIG_COUNT"
echo "ROLLED_BACK=$ROLLED_BACK"
echo "FINAL_TABLE_COUNT=$FINAL_TABLES"
'@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
$paramJson = @{ commands = @("echo '$b64' | base64 -d | bash") } | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\clean_migrate_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids i-028b4179c559bffb9 `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile orbithr-local `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched clean and migrate command: $cmdId. Waiting for execution..."
Start-Sleep -Seconds 20

$inv = (aws ssm get-command-invocation `
    --command-id $cmdId `
    --instance-id i-028b4179c559bffb9 `
    --profile orbithr-local `
    --output json) | ConvertFrom-Json

Write-Host "Status: $($inv.Status)"
Write-Host "StdOut:"
Write-Host $inv.StandardOutputContent
Write-Host "StdErr:"
Write-Host $inv.StandardErrorContent
