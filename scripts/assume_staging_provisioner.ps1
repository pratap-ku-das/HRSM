[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-staging',
    [string]$OperatorUser = 'orbithr-staging-operator',
    [string]$RoleArn = 'arn:aws:iam::402545554824:role/OrbitHR-Staging-Provisioner',
    [string]$MfaSerial = 'arn:aws:iam::402545554824:mfa/orbithr-staging-operator-mfa',
    [string]$AdminProfile = 'orbithr-local',
    [string]$Region = 'eu-north-1'
)

$ErrorActionPreference = 'Stop'

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR - Ephemeral Provisioner Profile Setup & Configuration " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Assert MFA device is active on the operator
$mfaCheck = & aws iam list-mfa-devices --user-name $OperatorUser --profile $AdminProfile --output json | ConvertFrom-Json
if (-not $mfaCheck.MFADevices -or $mfaCheck.MFADevices.Count -eq 0) {
    throw "FATAL: MFA device is not enabled for $OperatorUser! Run scripts/register_operator_mfa.ps1 first."
}
Write-Host "[VERIFIED] Operator MFA device active: $($mfaCheck.MFADevices[0].SerialNumber)" -ForegroundColor Green

# 2. Check and purge any stale access keys
$keyCheck = & aws iam list-access-keys --user-name $OperatorUser --profile $AdminProfile --output json | ConvertFrom-Json
if ($keyCheck.AccessKeyMetadata -and $keyCheck.AccessKeyMetadata.Count -gt 0) {
    Write-Host "[CLEANUP] Removing stale temporary access keys for $OperatorUser..." -ForegroundColor Yellow
    foreach ($k in $keyCheck.AccessKeyMetadata) {
        & aws iam delete-access-key --user-name $OperatorUser --access-key-id $k.AccessKeyId --profile $AdminProfile
    }
}

# 3. Create ephemeral access key strictly for this provisioning session
Write-Host "Generating ephemeral access key for $OperatorUser..." -ForegroundColor Cyan
$createKeyRes = & aws iam create-access-key --user-name $OperatorUser --profile $AdminProfile --output json | ConvertFrom-Json
$accessKeyId = $createKeyRes.AccessKey.AccessKeyId
$secretAccessKey = $createKeyRes.AccessKey.SecretAccessKey

# 4. Write credentials to ~/.aws/credentials under [orbithr-operator-temp]
$awsDir = Join-Path $HOME '.aws'
if (-not (Test-Path $awsDir)) { New-Item -ItemType Directory -Path $awsDir -Force | Out-Null }
$credsPath = Join-Path $awsDir 'credentials'
$configPath = Join-Path $awsDir 'config'

$credBlock = @"

[orbithr-operator-temp]
aws_access_key_id = $accessKeyId
aws_secret_access_key = $secretAccessKey
"@

if (Test-Path $credsPath) {
    $existingCreds = Get-Content $credsPath -Raw
    $cleanCreds = $existingCreds -replace '(?ms)\[orbithr-operator-temp\].*?(?=\r?\n\[|\Z)', ''
    Set-Content -Path $credsPath -Value ($cleanCreds.TrimEnd() + "`n" + $credBlock.Trim())
} else {
    Set-Content -Path $credsPath -Value $credBlock.Trim()
}

# 5. Configure ~/.aws/config for [profile orbithr-staging]
$configBlock = @"

[profile $Profile]
role_arn = $RoleArn
source_profile = orbithr-operator-temp
mfa_serial = $MfaSerial
region = $Region
"@

$existingConfig = Get-Content $configPath -Raw
if ($existingConfig -notmatch ("\[profile " + [regex]::Escape($Profile) + "\]")) {
    Add-Content -Path $configPath -Value $configBlock
} else {
    $cleanConfig = $existingConfig -replace ("(?ms)\[profile " + [regex]::Escape($Profile) + "\].*?(?=\r?\n\[|\Z)"), ''
    Set-Content -Path $configPath -Value ($cleanConfig.TrimEnd() + "`n" + $configBlock.Trim())
}

Write-Host "[SUCCESS] AWS profile '$Profile' configured with MFA role-assumption." -ForegroundColor Green
Write-Host "Ephemeral access key ID: $accessKeyId" -ForegroundColor Gray
Write-Host "Zero long-lived keys policy enforced. Key can be purged with scripts/cleanup_operator_keys.ps1." -ForegroundColor Gray
