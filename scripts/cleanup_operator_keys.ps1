[CmdletBinding()]
param(
    [string]$OperatorUser = 'orbithr-staging-operator',
    [string]$AdminProfile = 'orbithr-local'
)

$ErrorActionPreference = 'Stop'

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR - Purge Ephemeral Operator Credentials                 " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$keyCheck = & aws iam list-access-keys --user-name $OperatorUser --profile $AdminProfile --output json | ConvertFrom-Json
if ($keyCheck.AccessKeyMetadata -and $keyCheck.AccessKeyMetadata.Count -gt 0) {
    foreach ($k in $keyCheck.AccessKeyMetadata) {
        & aws iam delete-access-key --user-name $OperatorUser --access-key-id $k.AccessKeyId --profile $AdminProfile
        Write-Host "[DELETED] Access key ID: $($k.AccessKeyId)" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] No access keys exist for $OperatorUser." -ForegroundColor Green
}

$credsPath = Join-Path $HOME '.aws\credentials'
if (Test-Path $credsPath) {
    $existingCreds = Get-Content $credsPath -Raw
    $cleanCreds = $existingCreds -replace '(?ms)\[orbithr-operator-temp\].*?(?=\r?\n\[|\Z)', ''
    Set-Content -Path $credsPath -Value $cleanCreds.Trim()
    Write-Host "[CLEANUP] Removed [orbithr-operator-temp] from credentials file." -ForegroundColor Gray
}

Write-Host "[SUCCESS] Zero operator access keys remain." -ForegroundColor Green
