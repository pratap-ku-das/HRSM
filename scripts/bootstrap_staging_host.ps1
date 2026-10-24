<#
.SYNOPSIS
    Bootstrap Staging Host Environment and Systemd Service
#>
[CmdletBinding()]
param(
    [string]$InstanceId = 'i-028b4179c559bffb9',
    [string]$Profile = 'orbithr-local',
    [string]$Region = 'eu-north-1'
)

$ErrorActionPreference = 'Stop'

Write-Host "Retrieving app_password from SSM Parameter Store..." -ForegroundColor Cyan
$appPass = (aws ssm get-parameter --name /orbithr/staging/database/app_password --with-decryption --query "Parameter.Value" --output text --profile $Profile --region $Region).Trim()

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$b1 = New-Object byte[] 32
$rng.GetBytes($b1)
$jwtSecret = [Convert]::ToBase64String($b1) -replace '[/+=]', 'J'

$b2 = New-Object byte[] 32
$rng.GetBytes($b2)
$mfaKey = [Convert]::ToBase64String($b2)

$envContent = @"
DATABASE_URL="postgresql://orbithr_staging_app:$appPass@hrms-database-staging.cdc6cyayy6za.eu-north-1.rds.amazonaws.com:5432/hrms_staging?sslmode=require"
PORT=3001
NODE_ENV=production
JWT_SECRET="$jwtSecret"
MFA_ENCRYPTION_KEY="$mfaKey"
"@

$serviceContent = @"
[Unit]
Description=OrbitHR Staging Web Application
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/orbithr
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
EnvironmentFile=/home/ec2-user/orbithr-shared/.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"@

$b64Env = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($envContent))
$b64Svc = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($serviceContent))

$remoteScript = @"
#!/usr/bin/env bash
set -euo pipefail

install -d -m 0750 -o ec2-user -g ec2-user /home/ec2-user/orbithr-shared /home/ec2-user/orbithr-releases /home/ec2-user/orbithr-shared/storage
echo '$b64Env' | base64 -d > /home/ec2-user/orbithr-shared/.env
chown ec2-user:ec2-user /home/ec2-user/orbithr-shared/.env
chmod 0600 /home/ec2-user/orbithr-shared/.env

echo '$b64Svc' | base64 -d > /etc/systemd/system/orbithr.service
chmod 0644 /etc/systemd/system/orbithr.service
systemctl daemon-reload
systemctl enable orbithr.service

echo "HOST_BOOTSTRAP_COMPLETE"
"@

$b64Script = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$paramJson = @{
    commands = @("echo '$b64Script' | base64 -d | bash")
} | ConvertTo-Json

$tempFile = (Join-Path $HOME 'AppData\Local\Temp\bootstrap_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

Write-Host "Dispatching host bootstrap to $InstanceId..." -ForegroundColor Cyan
$cmdId = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile $Profile `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "SSM Command ID: $cmdId. Waiting for execution..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

$inv = (aws ssm get-command-invocation `
    --command-id $cmdId `
    --instance-id $InstanceId `
    --profile $Profile `
    --output json) | ConvertFrom-Json

Write-Host "Status: $($inv.Status)"
if ($inv.Status -ne 'Success') {
    throw "Host bootstrap failed: $($inv.StandardErrorContent)"
}
Write-Host "[SUCCESS] Staging host directories, environment file, and systemd service configured!" -ForegroundColor Green
Write-Host $inv.StandardOutputContent
