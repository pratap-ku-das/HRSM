<#
.SYNOPSIS
    OrbitHR P2.10 RC2 - Initialize Staging Database & Application Role
.DESCRIPTION
    Connects to the newly provisioned RDS PostgreSQL 18.3 instance via SSM on the staging host,
    creates database hrms_staging and user orbithr_staging_app with app_password.
#>
[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-staging',
    [string]$Region = 'eu-north-1',
    [string]$InstanceId = 'i-028b4179c559bffb9',
    [string]$RdsEndpoint = 'hrms-database-staging.cdc6cyayy6za.eu-north-1.rds.amazonaws.com'
)

$ErrorActionPreference = 'Stop'

Write-Host "Retrieving database credentials from SSM Parameter Store..." -ForegroundColor Cyan
$masterPass = (aws ssm get-parameter --name /orbithr/staging/database/master_password --with-decryption --query "Parameter.Value" --output text --profile $Profile --region $Region).Trim()
$appPass = (aws ssm get-parameter --name /orbithr/staging/database/app_password --with-decryption --query "Parameter.Value" --output text --profile $Profile --region $Region).Trim()

Write-Host "Synchronizing RDS master password with SSM parameter..." -ForegroundColor Cyan
aws rds modify-db-instance `
    --db-instance-identifier hrms-database-staging `
    --master-user-password $masterPass `
    --apply-immediately `
    --profile orbithr-local `
    --region $Region | Out-Null

Write-Host "Waiting 15 seconds for RDS master password modification to apply..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

$escapedMaster = $masterPass -replace "'", "''"
$escapedApp = $appPass -replace "'", "''"

$remoteScript = @"
#!/usr/bin/env bash
set -euo pipefail

export PGSSLMODE=require
export PGPASSWORD='$escapedMaster'

# 1. Create database if not exists
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'hrms_staging'" | grep -q 1 || \
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "CREATE DATABASE hrms_staging;"

# 2. Create role if not exists and update password
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname = 'orbithr_staging_app'" | grep -q 1 || \
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "CREATE USER orbithr_staging_app WITH PASSWORD '$escapedApp';"

psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "ALTER USER orbithr_staging_app WITH PASSWORD '$escapedApp';"
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "GRANT CONNECT ON DATABASE hrms_staging TO orbithr_staging_app;"
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "ALTER DATABASE hrms_staging OWNER TO orbithr_staging_app;"
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE hrms_staging TO orbithr_staging_app;"

# 3. Grant schema permissions
psql -h $RdsEndpoint -p 5432 -U orbit_stage_admin -d hrms_staging -c "
ALTER SCHEMA public OWNER TO orbithr_staging_app;
GRANT USAGE, CREATE ON SCHEMA public TO orbithr_staging_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO orbithr_staging_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO orbithr_staging_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO orbithr_staging_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO orbithr_staging_app;
"

unset PGPASSWORD
echo "DB_INIT_SUCCESS"
"@

# Encode remote script in base64 to prevent any quoting or escaping issues
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$paramJson = @{
    commands = @("echo $b64 | base64 -d | bash")
} | ConvertTo-Json
$tempParamFile = (Join-Path $HOME 'AppData\Local\Temp\ssm_db_init_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempParamFile -Encoding Ascii

Write-Host "Dispatching database initialization via SSM to $InstanceId..." -ForegroundColor Cyan
$cmdOutput = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempParamFile" `
    --profile orbithr-local `
    --region $Region `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempParamFile -Force -ErrorAction SilentlyContinue

Write-Host "SSM Command dispatched: $cmdOutput. Waiting for completion..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

$status = "Pending"
for ($i = 0; $i -lt 15; $i++) {
    $inv = (aws ssm get-command-invocation `
        --command-id $cmdOutput `
        --instance-id $InstanceId `
        --profile orbithr-local `
        --region $Region `
        --output json) | ConvertFrom-Json

    $status = $inv.Status
    if ($status -in @('Success', 'Failed', 'TimedOut', 'Cancelled')) {
        break
    }
    Start-Sleep -Seconds 2
}

if ($status -ne 'Success') {
    throw "Database initialization failed via SSM! Status: $status. StdErr: $($inv.StandardErrorContent)"
}

Write-Host "[SUCCESS] Database 'hrms_staging' and role 'orbithr_staging_app' initialized!" -ForegroundColor Green
Write-Host $inv.StandardOutputContent
