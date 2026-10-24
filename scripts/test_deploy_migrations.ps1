$migrations = @(
    "20260831130000_mobile_auth",
    "20260910150000_employee_face_verification",
    "20260913110000_org_rbac_foundation",
    "20260913150000_workflow_engine",
    "20260914090000_attendance_engine",
    "20260914113000_payroll_engine",
    "20260914150000_notifications",
    "20260915100000_governance_reporting_security_ai",
    "20260915130000_totp_mfa",
    "20260915150000_leave_policy",
    "20260915170000_performance_reviews",
    "20260915190000_employee_service_requests",
    "20260915210000_session_metadata",
    "20260916120000_recruitment_analytics",
    "20260921113000_auth_schema_drift_repair",
    "20260921121500_session_schema_drift_repair",
    "20260921123000_employee_org_columns_drift_repair",
    "20260921124500_stored_rbac_drift_repair"
)

$resolveCmds = ($migrations | ForEach-Object { "npx prisma migrate resolve --applied $_" }) -join "; "

$remoteScript = @"
cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015164750
runuser -u ec2-user -- bash -lc 'cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015164750; $resolveCmds; npx prisma migrate deploy'
"@

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))
$paramJson = @{ commands = @("echo '$b64' | base64 -d | bash") } | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\test_mig_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids i-028b4179c559bffb9 `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile orbithr-local `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched test migrate: $cmdId. Waiting 25s..."
Start-Sleep -Seconds 25

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
