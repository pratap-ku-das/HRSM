# OrbitHR P2.10 RC2 - Staging IAM Identity Setup Script
# Creates dedicated staging operator user, provisioner role, and customer-managed policies.
# Requires Account Admin/Root execution once to bootstrap least-privilege identities.

[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-local',
    [string]$Region = 'eu-north-1'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-AwsCli {
    param([string[]]$Arguments)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & aws @Arguments --profile $Profile 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    return @{ Output = ($output | Out-String).Trim(); ExitCode = $code }
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR P2.10 RC2 - Staging IAM Identity and Policy Bootstrapper " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Verify Caller Identity
$identityRes = Invoke-AwsCli -Arguments @('sts', 'get-caller-identity', '--output', 'json')
if ($identityRes.ExitCode -ne 0) {
    throw "AWS CLI Error: Unable to determine caller identity. $($identityRes.Output)"
}
$identity = $identityRes.Output | ConvertFrom-Json
Write-Host "Authenticated as: $($identity.Arn) in account $($identity.Account)" -ForegroundColor Yellow

if ($identity.Account -ne '402545554824') {
    throw "Account mismatch! Expected 402545554824, got $($identity.Account)"
}

# 2. Create Customer-Managed Staging Host Policy
$hostPolicyDoc = (Join-Path $repoRoot 'docs/ORBITHR_STAGING_EC2_HOST_POLICY.json').Replace('\', '/')
Write-Host "Ensuring Customer-Managed Host Policy 'OrbitHR-EC2-Staging-Host-Policy'..." -ForegroundColor Cyan
$hostPolicyArn = "arn:aws:iam::402545554824:policy/OrbitHR-EC2-Staging-Host-Policy"
$res = Invoke-AwsCli -Arguments @('iam', 'get-policy', '--policy-arn', $hostPolicyArn)
if ($res.ExitCode -ne 0) {
    $createRes = Invoke-AwsCli -Arguments @(
        'iam', 'create-policy',
        '--policy-name', 'OrbitHR-EC2-Staging-Host-Policy',
        '--policy-document', "file://$hostPolicyDoc",
        '--description', 'Dedicated least-privilege host policy for OrbitHR Staging EC2 host',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Project,Value=OrbitHR'
    )
    if ($createRes.ExitCode -ne 0) {
        throw "Failed to create OrbitHR-EC2-Staging-Host-Policy: $($createRes.Output)"
    }
    Write-Host "[CREATED] OrbitHR-EC2-Staging-Host-Policy" -ForegroundColor Green
} else {
    Write-Host "[EXISTS] OrbitHR-EC2-Staging-Host-Policy" -ForegroundColor Gray
}

# 3. Create Staging Provisioner Permissions Policy (Allow Statements)
$permPolicyDoc = (Join-Path $repoRoot 'docs/ORBITHR_STAGING_PROVISIONER_PERMISSIONS_POLICY.json').Replace('\', '/')
Write-Host "Ensuring Provisioner Permissions Policy 'OrbitHR-Staging-Provisioner-Permissions-Policy'..." -ForegroundColor Cyan
$permPolicyArn = "arn:aws:iam::402545554824:policy/OrbitHR-Staging-Provisioner-Permissions-Policy"
$res = Invoke-AwsCli -Arguments @('iam', 'get-policy', '--policy-arn', $permPolicyArn)
if ($res.ExitCode -ne 0) {
    $createRes = Invoke-AwsCli -Arguments @(
        'iam', 'create-policy',
        '--policy-name', 'OrbitHR-Staging-Provisioner-Permissions-Policy',
        '--policy-document', "file://$permPolicyDoc",
        '--description', 'Scoped provisioning permissions policy for OrbitHR Staging',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Project,Value=OrbitHR'
    )
    if ($createRes.ExitCode -ne 0) {
        throw "Failed to create OrbitHR-Staging-Provisioner-Permissions-Policy: $($createRes.Output)"
    }
    Write-Host "[CREATED] OrbitHR-Staging-Provisioner-Permissions-Policy" -ForegroundColor Green
} else {
    Write-Host "[EXISTS] OrbitHR-Staging-Provisioner-Permissions-Policy" -ForegroundColor Gray
}

# 4. Create Staging Provisioner Deny Policy (Production Boundary)
$denyPolicyDoc = (Join-Path $repoRoot 'docs/ORBITHR_STAGING_PROVISIONER_DENY_POLICY.json').Replace('\', '/')
Write-Host "Ensuring Provisioner Deny Policy 'OrbitHR-Staging-Provisioner-Deny-Policy'..." -ForegroundColor Cyan
$denyPolicyArn = "arn:aws:iam::402545554824:policy/OrbitHR-Staging-Provisioner-Deny-Policy"
$res = Invoke-AwsCli -Arguments @('iam', 'get-policy', '--policy-arn', $denyPolicyArn)
if ($res.ExitCode -ne 0) {
    $createRes = Invoke-AwsCli -Arguments @(
        'iam', 'create-policy',
        '--policy-name', 'OrbitHR-Staging-Provisioner-Deny-Policy',
        '--policy-document', "file://$denyPolicyDoc",
        '--description', 'Production protection boundary policy for OrbitHR Staging Provisioner',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Project,Value=OrbitHR'
    )
    if ($createRes.ExitCode -ne 0) {
        throw "Failed to create OrbitHR-Staging-Provisioner-Deny-Policy: $($createRes.Output)"
    }
    Write-Host "[CREATED] OrbitHR-Staging-Provisioner-Deny-Policy" -ForegroundColor Green
} else {
    Write-Host "[EXISTS] OrbitHR-Staging-Provisioner-Deny-Policy" -ForegroundColor Gray
}

# 5. Create Dedicated Staging Operator User
Write-Host "Ensuring IAM User 'orbithr-staging-operator'..." -ForegroundColor Cyan
$res = Invoke-AwsCli -Arguments @('iam', 'get-user', '--user-name', 'orbithr-staging-operator')
if ($res.ExitCode -ne 0) {
    $createRes = Invoke-AwsCli -Arguments @(
        'iam', 'create-user',
        '--user-name', 'orbithr-staging-operator',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Project,Value=OrbitHR'
    )
    if ($createRes.ExitCode -ne 0) {
        throw "Failed to create orbithr-staging-operator: $($createRes.Output)"
    }
    Write-Host "[CREATED] orbithr-staging-operator" -ForegroundColor Green
} else {
    Write-Host "[EXISTS] orbithr-staging-operator" -ForegroundColor Gray
}

# 6. Create Staging Provisioner Role with MFA Trust Policy
$trustDoc = (Join-Path $repoRoot 'docs/ORBITHR_STAGING_PROVISIONER_TRUST_POLICY.json').Replace('\', '/')
Write-Host "Ensuring IAM Role 'OrbitHR-Staging-Provisioner'..." -ForegroundColor Cyan
$res = Invoke-AwsCli -Arguments @('iam', 'get-role', '--role-name', 'OrbitHR-Staging-Provisioner')
if ($res.ExitCode -ne 0) {
    $createRes = Invoke-AwsCli -Arguments @(
        'iam', 'create-role',
        '--role-name', 'OrbitHR-Staging-Provisioner',
        '--assume-role-policy-document', "file://$trustDoc",
        '--description', 'Dedicated provisioner role for OrbitHR isolated staging',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Project,Value=OrbitHR'
    )
    if ($createRes.ExitCode -ne 0) {
        throw "Failed to create OrbitHR-Staging-Provisioner: $($createRes.Output)"
    }
    Write-Host "[CREATED] OrbitHR-Staging-Provisioner" -ForegroundColor Green
} else {
    Write-Host "[EXISTS] OrbitHR-Staging-Provisioner" -ForegroundColor Gray
}

# 7. Attach Both Provisioner Policies to Provisioner Role
Write-Host "Attaching policies to OrbitHR-Staging-Provisioner..." -ForegroundColor Cyan
$attachRes1 = Invoke-AwsCli -Arguments @(
    'iam', 'attach-role-policy',
    '--role-name', 'OrbitHR-Staging-Provisioner',
    '--policy-arn', $permPolicyArn
)
if ($attachRes1.ExitCode -ne 0) {
    throw "Failed to attach OrbitHR-Staging-Provisioner-Permissions-Policy: $($attachRes1.Output)"
}
Write-Host "[ATTACHED] OrbitHR-Staging-Provisioner-Permissions-Policy" -ForegroundColor Green

$attachRes2 = Invoke-AwsCli -Arguments @(
    'iam', 'attach-role-policy',
    '--role-name', 'OrbitHR-Staging-Provisioner',
    '--policy-arn', $denyPolicyArn
)
if ($attachRes2.ExitCode -ne 0) {
    throw "Failed to attach OrbitHR-Staging-Provisioner-Deny-Policy: $($attachRes2.Output)"
}
Write-Host "[ATTACHED] OrbitHR-Staging-Provisioner-Deny-Policy" -ForegroundColor Green

# 8. Grant AssumeRole to Operator User
Write-Host "Granting sts:AssumeRole on OrbitHR-Staging-Provisioner to orbithr-staging-operator..." -ForegroundColor Cyan
$assumePolicyDoc = (Join-Path $repoRoot 'docs/ORBITHR_STAGING_OPERATOR_ASSUME_ROLE_POLICY.json').Replace('\', '/')

$putUserRes = Invoke-AwsCli -Arguments @(
    'iam', 'put-user-policy',
    '--user-name', 'orbithr-staging-operator',
    '--policy-name', 'AllowAssumeStagingProvisioner',
    '--policy-document', "file://$assumePolicyDoc"
)
if ($putUserRes.ExitCode -ne 0) {
    throw "Failed to put user policy: $($putUserRes.Output)"
}
Write-Host "[ATTACHED] AllowAssumeStagingProvisioner user policy" -ForegroundColor Green

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  IAM Setup Completed Successfully. All Staging Policies Ready!  " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
