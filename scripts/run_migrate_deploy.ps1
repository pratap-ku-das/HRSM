$paramJson = @{
    commands = @('runuser -u ec2-user -- bash -lc "cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015163131 && npx prisma migrate deploy 2>&1 | tr -cd \"[:print:]\n\t\""')
} | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\migrate_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids i-028b4179c559bffb9 `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile orbithr-local `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched migrate deploy command: $cmdId. Waiting for execution..."
Start-Sleep -Seconds 15

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
