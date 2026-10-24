<#
.SYNOPSIS
    Run Gate P2 Network Isolation Verification on Staging EC2 Host
#>
[CmdletBinding()]
param(
    [string]$InstanceId = 'i-028b4179c559bffb9',
    [string]$RdsEndpoint = 'hrms-database-staging.cdc6cyayy6za.eu-north-1.rds.amazonaws.com',
    [string]$Profile = 'orbithr-local'
)

$ErrorActionPreference = 'Stop'

$scriptContent = Get-Content (Join-Path $PSScriptRoot 'verify-network-isolation.sh') -Raw
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($scriptContent))

$paramJson = @{
    commands = @("echo '$b64' | base64 -d | bash -s -- $RdsEndpoint")
} | ConvertTo-Json

$tempFile = (Join-Path $HOME 'AppData\Local\Temp\gate_p2_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

Write-Host "Dispatching Gate P2 verification script to $InstanceId..." -ForegroundColor Cyan
$cmdId = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile $Profile `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched Gate P2 probe via SSM (Command ID: $cmdId). Waiting for execution..." -ForegroundColor Cyan
Start-Sleep -Seconds 7

$status = "Pending"
for ($i = 0; $i -lt 15; $i++) {
    $inv = (aws ssm get-command-invocation `
        --command-id $cmdId `
        --instance-id $InstanceId `
        --profile $Profile `
        --output json) | ConvertFrom-Json

    $status = $inv.Status
    if ($status -in @('Success', 'Failed', 'TimedOut', 'Cancelled')) {
        break
    }
    Start-Sleep -Seconds 2
}

if ($status -ne 'Success') {
    Write-Host "Gate P2 execution status: $status" -ForegroundColor Red
    Write-Host "StdErr:" -ForegroundColor Red
    Write-Host $inv.StandardErrorContent
    Write-Host "StdOut:" -ForegroundColor Yellow
    Write-Host $inv.StandardOutputContent
    throw "Gate P2 probe failed!"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Gate P2 Probe Succeeded! Output:" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host $inv.StandardOutputContent
