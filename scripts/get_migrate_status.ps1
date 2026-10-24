$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$paramJson = @{
    commands = @('runuser -u ec2-user -- bash -lc "cd /home/ec2-user/orbithr-releases/release-staging-e249b41-20261015164750 && npx prisma migrate status 2>&1"')
} | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\status_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids i-028b4179c559bffb9 `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile orbithr-local `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched status command: $cmdId"
Start-Sleep -Seconds 6

$out = (aws ssm get-command-invocation `
    --command-id $cmdId `
    --instance-id i-028b4179c559bffb9 `
    --profile orbithr-local `
    --query "StandardOutputContent" `
    --output text)

Write-Host $out
