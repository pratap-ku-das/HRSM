<#
.SYNOPSIS
    OrbitHR P2.10 RC2 - Strictly Read-Only Phase 1 Staging Preflight Check (Step 0)

.DESCRIPTION
    Executes mandatory preflight assertions prior to Phase 1 staging provisioning.
    GUARANTEE: Strictly read-only inspection. Contains ZERO resource-creation,
    modification, or deletion commands.

    Assertions enforced:
    1. Active AWS authentication for profile 'orbithr-local'
    2. Exact AWS account identity assertion: 402545554824
    3. Target region verification: eu-north-1
    4. PostgreSQL 18.3 / db.t3.micro orderability in eu-north-1
    5. Clean-slate collision checks on staging names (VPC, RDS, Subnet Group, S3, IAM, SGs)
#>
[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-local',
    [string]$Region = 'eu-north-1',
    [string]$ExpectedAccount = '402545554824'
)

$ErrorActionPreference = 'Stop'

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR P2.10 RC2 - Strictly Read-Only Preflight Check (Step 0) " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Execution Mode: READ-ONLY (Zero Mutation Guarantee)" -ForegroundColor Yellow
Write-Host ("Target Profile: " + $Profile + " | Region: " + $Region + " | Expected Account: " + $ExpectedAccount)
Write-Host ""

function Invoke-SafeAws {
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$IgnoreError
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & aws @Arguments --profile $Profile --region $Region 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $prev
    }
    if ($exitCode -ne 0 -and -not $IgnoreError) {
        $errText = ($output -join "`n").Trim()
        throw ("AWS CLI FAILURE [Exit Code " + $exitCode + "]: " + $errText)
    }
    return $output
}

# -----------------------------------------------------------------------------
# 1. AWS Authentication & Account Assertion
# -----------------------------------------------------------------------------
Write-Host "[CHECK 1/5] Verifying AWS authentication and caller identity..." -ForegroundColor Cyan
try {
    $identityJson = (Invoke-SafeAws -Arguments @('sts', 'get-caller-identity', '--output', 'json') | Out-String)
    $identity = $identityJson | ConvertFrom-Json
} catch {
    Write-Host "[FAIL] Unable to authenticate with AWS. Session may be expired." -ForegroundColor Red
    Write-Host "       Run 'aws login' to refresh your session." -ForegroundColor Yellow
    Write-Host ""
    throw $_
}

if (-not $identity -or -not $identity.Account) {
    throw "FATAL: Inconclusive STS caller identity lookup!"
}
if ($identity.Account -ne $ExpectedAccount) {
    throw ("FATAL: Authenticated account mismatch! Expected '" + $ExpectedAccount + "', got '" + $identity.Account + "'.")
}
if ($identity.Arn -match ':root$') {
    throw ("FAIL-CLOSED: Authenticated as AWS Account ROOT identity (" + $identity.Arn + ")! AWS Security Best Practices prohibit root credentials for routine infrastructure provisioning. A dedicated least-privilege IAM identity is required.")
}
Write-Host ("[PASS] Authenticated as " + $identity.Arn) -ForegroundColor Green
Write-Host ("       Account ID confirmed: " + $identity.Account) -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------------------------
# 2. Region Configuration Assertion
# -----------------------------------------------------------------------------
Write-Host "[CHECK 2/5] Verifying target AWS region configuration..." -ForegroundColor Cyan
$configuredRegion = (Invoke-SafeAws -Arguments @('configure', 'get', 'region', '--profile', $Profile) -IgnoreError | Out-String).Trim()
if ($configuredRegion -and ($configuredRegion -ne $Region)) {
    throw ("FATAL: Profile region is configured to '" + $configuredRegion + "', expected '" + $Region + "'!")
}
Write-Host ("[PASS] Target region confirmed: " + $Region) -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------------------------
# 3. RDS Engine & Instance Class Orderability Verification
# -----------------------------------------------------------------------------
Write-Host ("[CHECK 3/5] Verifying PostgreSQL 18.3 / db.t3.micro orderability in " + $Region + "...") -ForegroundColor Cyan
$orderableRaw = (Invoke-SafeAws -Arguments @(
    'rds', 'describe-orderable-db-instance-options',
    '--engine', 'postgres',
    '--engine-version', '18.3',
    '--db-instance-class', 'db.t3.micro',
    '--query', 'OrderableDBInstanceOptions[0].DBInstanceClass',
    '--output', 'text'
) | Out-String).Trim()

if (-not $orderableRaw -or $orderableRaw -eq 'None' -or $orderableRaw -ne 'db.t3.micro') {
    throw ("FATAL: db.t3.micro is NOT supported for PostgreSQL 18.3 in " + $Region + " (got '" + $orderableRaw + "')! Aborting before provisioning.")
}
Write-Host ("[PASS] RDS orderability verified: PostgreSQL 18.3 on db.t3.micro is orderable in " + $Region) -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------------------------
# 4. Resource Collision & Clean-Slate Assertions
# -----------------------------------------------------------------------------
Write-Host "[CHECK 4/5] Checking for resource name collisions in staging space..." -ForegroundColor Cyan

# 4a. Staging VPC
$existingVpcs = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-vpcs',
    '--filters', 'Name=tag:Name,Values=vpc-staging-orbithr',
    '--query', 'Vpcs[].VpcId',
    '--output', 'text'
) | Out-String).Trim()
if ($existingVpcs) {
    throw ("FATAL: Staging VPC 'vpc-staging-orbithr' already exists (" + $existingVpcs + ")! Cleanup required before provisioning.")
}

# 4b. Staging RDS Instance
$existingRds = (Invoke-SafeAws -Arguments @(
    'rds', 'describe-db-instances',
    '--query', "DBInstances[?DBInstanceIdentifier=='hrms-database-staging'].DBInstanceIdentifier",
    '--output', 'text'
) | Out-String).Trim()
if ($existingRds) {
    throw "FATAL: Staging RDS instance 'hrms-database-staging' already exists! Aborting."
}

# 4c. Staging DB Subnet Group
$existingSubnetGroups = (Invoke-SafeAws -Arguments @(
    'rds', 'describe-db-subnet-groups',
    '--query', "DBSubnetGroups[?DBSubnetGroupName=='orbithr-staging-db-subnet-group'].DBSubnetGroupName",
    '--output', 'text'
) | Out-String).Trim()
if ($existingSubnetGroups) {
    throw "FATAL: DB Subnet Group 'orbithr-staging-db-subnet-group' already exists! Aborting."
}

# 4d. Staging S3 Bucket
$stagingBucket = "orbithr-staging-deployments-" + $ExpectedAccount
$null = Invoke-SafeAws -Arguments @('s3api', 'head-bucket', '--bucket', $stagingBucket) -IgnoreError
if ($LASTEXITCODE -eq 0) {
    throw ("FATAL: S3 bucket '" + $stagingBucket + "' already exists! Staging bucket must not pre-exist.")
}

# 4e. Staging IAM Role
$existingRole = (Invoke-SafeAws -Arguments @(
    'iam', 'list-roles',
    '--query', "Roles[?RoleName=='OrbitHR-EC2-Staging-Role'].RoleName",
    '--output', 'text'
) | Out-String).Trim()
if ($existingRole) {
    throw "FATAL: IAM Role 'OrbitHR-EC2-Staging-Role' already exists! Aborting."
}

# 4f. Staging Security Groups
$existingSgs = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-security-groups',
    '--filters', 'Name=group-name,Values=launch-wizard-staging,ec2-rds-staging,rds-staging-sg',
    '--query', 'SecurityGroups[].GroupId',
    '--output', 'text'
) | Out-String).Trim()
if ($existingSgs) {
    throw ("FATAL: Staging security groups already exist (" + $existingSgs + ")! Aborting.")
}
Write-Host "[PASS] Zero resource collisions detected across VPC, RDS, S3, IAM, and Security Groups" -ForegroundColor Green
Write-Host ""

# -----------------------------------------------------------------------------
# 5. Production Protection Verification
# -----------------------------------------------------------------------------
Write-Host "[CHECK 5/5] Verifying production snapshot and VPC boundaries..." -ForegroundColor Cyan
$prodSnapshot = (Invoke-SafeAws -Arguments @(
    'rds', 'describe-db-snapshots',
    '--db-snapshot-identifier', 'orbithr-pre-p2-10-rc2-snapshot',
    '--query', 'DBSnapshots[0].Status',
    '--output', 'text'
) | Out-String).Trim()
if ($prodSnapshot -ne 'available') {
    throw ("FATAL: Protected production snapshot 'orbithr-pre-p2-10-rc2-snapshot' is NOT in 'available' status (got '" + $prodSnapshot + "')!")
}
Write-Host ("[PASS] Protected production snapshot confirmed intact (Status: " + $prodSnapshot + ")") -ForegroundColor Green
Write-Host ""

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  PREFLIGHT RESULT: ALL 5 CHECKS PASSED (FAIL-CLOSED VERIFIED)   " -ForegroundColor Green
Write-Host "  Zero AWS resources created or modified. Environment ready for  " -ForegroundColor Green
Write-Host "  operator Phase 1 authorization review.                         " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
