$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inv = (aws ssm get-command-invocation `
    --command-id 3149911b-0fd7-476b-b489-9ab0db226442 `
    --instance-id i-028b4179c559bffb9 `
    --profile orbithr-local `
    --output json) | ConvertFrom-Json

Write-Host "STATUS:" $inv.Status
Write-Host "STDOUT:"
Write-Host $inv.StandardOutputContent
Write-Host "STDERR:"
Write-Host $inv.StandardErrorContent
