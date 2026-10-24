param(
    [string]$BashScript,
    [string]$ScriptFile,
    [string]$InstanceId = 'i-028b4179c559bffb9',
    [string]$Profile = 'orbithr-local',
    [int]$WaitSeconds = 8
)

if ($ScriptFile -and (Test-Path $ScriptFile)) {
    $BashScript = Get-Content -Path $ScriptFile -Raw
}

$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($BashScript))
$paramJson = @{ commands = @("echo '$b64' | base64 -d | bash") } | ConvertTo-Json
$tempFile = (Join-Path $HOME 'AppData\Local\Temp\ssm_cmd_param.json').Replace('\', '/')
$paramJson | Set-Content -Path $tempFile -Encoding Ascii

$cmdId = (aws ssm send-command `
    --instance-ids $InstanceId `
    --document-name "AWS-RunShellScript" `
    --parameters "file://$tempFile" `
    --profile $Profile `
    --query "Command.CommandId" `
    --output text).Trim()

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

Write-Host "Dispatched SSM Command $cmdId. Waiting $WaitSeconds seconds..."
Start-Sleep -Seconds $WaitSeconds

$inv = (aws ssm get-command-invocation `
    --command-id $cmdId `
    --instance-id $InstanceId `
    --profile $Profile `
    --output json) | ConvertFrom-Json

Write-Host "Status: $($inv.Status)"
Write-Host "StdOut:"
Write-Host $inv.StandardOutputContent
Write-Host "StdErr:"
Write-Host $inv.StandardErrorContent
