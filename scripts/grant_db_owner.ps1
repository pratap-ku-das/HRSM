param(
    [string]$InstanceId = 'i-028b4179c559bffb9',
    [string]$RdsEndpoint = 'hrms-database-staging.cdc6cyayy6za.eu-north-1.rds.amazonaws.com',
    [string]$Profile = 'orbithr-local',
    [string]$Region = 'eu-north-1'
)

$ErrorActionPreference = 'Stop'

$masterPass = (aws ssm get-parameter --name /orbithr/staging/database/master_password --with-decryption --query "Parameter.Value" --output text --profile $Profile --region $Region).Trim()
$escapedMaster = $masterPass -replace "'", "''"

$remoteScript = @"
#!/usr/bin/env bash
set -euo pipefail
export PGSSLMODE=require
export PGPASSWORD='$escapedMaster'

psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "ALTER DATABASE hrms_staging OWNER TO orbithr_staging_app;"
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE hrms_staging TO orbithr_staging_app;"
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d hrms_staging -c "ALTER SCHEMA public OWNER TO orbithr_staging_app; GRANT ALL ON SCHEMA public TO orbithr_staging_app;"

unset PGPASSWORD
echo "DATABASE_OWNER_GRANTED"
"@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
$paramJson = @{ commands = @("echo '$b64' | base64 -d | bash") } | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\owner_grant_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile $Profile `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched ownership grant via SSM: $cmdId"
Start-Sleep -Seconds 6

$inv = (aws ssm get-command-invocation --command-id $cmdId --instance-id $InstanceId --profile $Profile --output json) | ConvertFrom-Json
Write-Host "Status: $($inv.Status)"
Write-Host "StdOut: $($inv.StandardOutputContent)"
Write-Host "StdErr: $($inv.StandardErrorContent)"
