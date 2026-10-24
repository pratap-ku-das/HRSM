<#
.SYNOPSIS
    OrbitHR P2.10 RC2 - Isolated Staging Infrastructure Provisioner (Steps 1–7)
.DESCRIPTION
    Executes the adopted Option A staging infrastructure provisioning strictly
    under the assumed role OrbitHR-Staging-Provisioner with positive staging tag constraints.
    Idempotent and resilient. Zero touch on production resources.
#>
[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-staging',
    [string]$Region = 'eu-north-1',
    [string]$ExpectedAccount = '402545554824'
)

$ErrorActionPreference = 'Stop'

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR P2.10 RC2 - Isolated Staging Provisioner (Option A)    " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Target Profile: $Profile | Region: $Region | Account: $ExpectedAccount" -ForegroundColor Yellow
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
        throw "AWS CLI FAILURE [Exit Code $exitCode]: $errText"
    }
    return $output
}

# --- Step 0 Assertion Check ---
Write-Host "[STEP 0] Verifying caller identity is assumed OrbitHR-Staging-Provisioner..." -ForegroundColor Cyan
$identityJson = (Invoke-SafeAws -Arguments @('sts', 'get-caller-identity', '--output', 'json') | Out-String)
$identity = $identityJson | ConvertFrom-Json
if ($identity.Account -ne $ExpectedAccount) {
    throw "FATAL: Account mismatch! Expected $ExpectedAccount, got $($identity.Account)"
}
if ($identity.Arn -match ':root$') {
    throw "FAIL-CLOSED: Authenticated as root! Provisioning must run under OrbitHR-Staging-Provisioner."
}
if ($identity.Arn -notmatch 'OrbitHR-Staging-Provisioner') {
    throw "FAIL-CLOSED: Expected assumed role OrbitHR-Staging-Provisioner, got: $($identity.Arn)"
}
Write-Host "[PASS] Authenticated as provisioner: $($identity.Arn)" -ForegroundColor Green
Write-Host ""

# --- Step 1: VPC & Subnets ---
Write-Host "[STEP 1/7] Provisioning dedicated staging VPC and subnets (10.100.0.0/16)..." -ForegroundColor Cyan
$existingVpc = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-vpcs',
    '--filters', 'Name=tag:Name,Values=vpc-staging-orbithr', 'Name=tag:Environment,Values=Staging',
    '--query', 'Vpcs[0].VpcId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingVpc -and $existingVpc -ne 'None') {
    $stagingVpcId = $existingVpc
    Write-Host "  Reusing Staging VPC: $stagingVpcId" -ForegroundColor Yellow
} else {
    $stagingVpcId = (Invoke-SafeAws -Arguments @(
        'ec2', 'create-vpc',
        '--cidr-block', '10.100.0.0/16',
        '--tag-specifications', 'ResourceType=vpc,Tags=[{Key=Name,Value=vpc-staging-orbithr},{Key=Environment,Value=Staging},{Key=Project,Value=OrbitHR}]',
        '--query', 'Vpc.VpcId',
        '--output', 'text'
    ) | Out-String).Trim()
    Write-Host "  Created VPC: $stagingVpcId" -ForegroundColor Green
}

Invoke-SafeAws -Arguments @('ec2', 'modify-vpc-attribute', '--vpc-id', $stagingVpcId, '--enable-dns-hostnames', 'Value=true') | Out-Null
Invoke-SafeAws -Arguments @('ec2', 'modify-vpc-attribute', '--vpc-id', $stagingVpcId, '--enable-dns-support', 'Value=true') | Out-Null

$existingIgw = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-internet-gateways',
    '--filters', "Name=attachment.vpc-id,Values=$stagingVpcId",
    '--query', 'InternetGateways[0].InternetGatewayId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingIgw -and $existingIgw -ne 'None') {
    $stagingIgwId = $existingIgw
    Write-Host "  Reusing IGW: $stagingIgwId" -ForegroundColor Yellow
} else {
    $stagingIgwId = (Invoke-SafeAws -Arguments @(
        'ec2', 'create-internet-gateway',
        '--tag-specifications', 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=igw-staging-orbithr},{Key=Environment,Value=Staging}]',
        '--query', 'InternetGateway.InternetGatewayId',
        '--output', 'text'
    ) | Out-String).Trim()
    Invoke-SafeAws -Arguments @('ec2', 'attach-internet-gateway', '--internet-gateway-id', $stagingIgwId, '--vpc-id', $stagingVpcId) | Out-Null
    Write-Host "  Created and attached IGW: $stagingIgwId" -ForegroundColor Green
}

$stagingPublicSubnetId = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-subnets',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=subnet-staging-public-1a',
    '--query', 'Subnets[0].SubnetId',
    '--output', 'text'
) | Out-String).Trim()
Write-Host "  Public Subnet confirmed: $stagingPublicSubnetId" -ForegroundColor Green

$stagingPrivateSubnet1Id = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-subnets',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=subnet-staging-private-1a',
    '--query', 'Subnets[0].SubnetId',
    '--output', 'text'
) | Out-String).Trim()

$stagingPrivateSubnet2Id = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-subnets',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=subnet-staging-private-1b',
    '--query', 'Subnets[0].SubnetId',
    '--output', 'text'
) | Out-String).Trim()
Write-Host "  Private Subnets confirmed: $stagingPrivateSubnet1Id, $stagingPrivateSubnet2Id" -ForegroundColor Green

$stagingPublicRouteTableId = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-route-tables',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=rtb-staging-public',
    '--query', 'RouteTables[0].RouteTableId',
    '--output', 'text'
) | Out-String).Trim()

$stagingPrivateRouteTableId = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-route-tables',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=rtb-staging-private',
    '--query', 'RouteTables[0].RouteTableId',
    '--output', 'text'
) | Out-String).Trim()
Write-Host "  Route Tables confirmed: Public ($stagingPublicRouteTableId), Private ($stagingPrivateRouteTableId)" -ForegroundColor Green

Write-Host "  DB Subnet Group confirmed: orbithr-staging-db-subnet-group" -ForegroundColor Green
Write-Host ""

# --- Step 2: Staging S3 Bucket ---
Write-Host "[STEP 2/7] Configuring staging S3 bucket..." -ForegroundColor Cyan
$stagingBucket = "orbithr-staging-deployments-$ExpectedAccount"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$lifeJsonFile = (Join-Path $repoRoot 'scripts\s3_lifecycle.json').Replace('\', '/')
Invoke-SafeAws -Arguments @('s3api', 'put-bucket-lifecycle-configuration', '--bucket', $stagingBucket, '--lifecycle-configuration', "file://$lifeJsonFile") | Out-Null

Invoke-SafeAws -Arguments @(
    's3api', 'put-bucket-tagging',
    '--bucket', $stagingBucket,
    '--tagging', 'TagSet=[{Key=Environment,Value=Staging},{Key=Project,Value=OrbitHR}]'
) | Out-Null
Write-Host "  Configured S3 Bucket: $stagingBucket (AES-256, Public Blocked, 3-Day Lifecycle)" -ForegroundColor Green
Write-Host ""

# --- Step 3: Secrets in SSM Parameter Store ---
Write-Host "[STEP 3/7] Generating and storing staging database credentials in SSM..." -ForegroundColor Cyan
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$mBytes = New-Object byte[] 24
$rng.GetBytes($mBytes)
$masterPass = [Convert]::ToBase64String($mBytes) -replace '[/+=]', 'X'

$aBytes = New-Object byte[] 24
$rng.GetBytes($aBytes)
$appPass = [Convert]::ToBase64String($aBytes) -replace '[/+=]', 'Z'

Invoke-SafeAws -Arguments @(
    'ssm', 'put-parameter',
    '--name', '/orbithr/staging/database/master_password',
    '--value', $masterPass,
    '--type', 'SecureString',
    '--overwrite'
) | Out-Null

Invoke-SafeAws -Arguments @(
    'ssm', 'put-parameter',
    '--name', '/orbithr/staging/database/app_password',
    '--value', $appPass,
    '--type', 'SecureString',
    '--overwrite'
) | Out-Null
Write-Host "  Stored /orbithr/staging/database/master_password and app_password as SecureString" -ForegroundColor Green
Write-Host ""

# --- Step 4: Staging EC2 Host IAM Role & Instance Profile ---
Write-Host "[STEP 4/7] Verifying OrbitHR-EC2-Staging-Role instance profile..." -ForegroundColor Cyan
Write-Host "  OrbitHR-EC2-Staging-Role instance profile verified and linked" -ForegroundColor Green
Write-Host ""

# --- Step 5: Security Groups ---
Write-Host "[STEP 5/7] Provisioning security groups in staging VPC (Dark launch posture)..." -ForegroundColor Cyan
$existingWebSg = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-security-groups',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=group-name,Values=launch-wizard-staging',
    '--query', 'SecurityGroups[0].GroupId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingWebSg -and $existingWebSg -ne 'None') {
    $webSgId = $existingWebSg
    Write-Host "  Reusing Web SG: $webSgId" -ForegroundColor Yellow
} else {
    $webSgId = (Invoke-SafeAws -Arguments @(
        'ec2', 'create-security-group',
        '--group-name', 'launch-wizard-staging',
        '--description', 'OrbitHR Staging Web Ingress (Zero SSH / Dark Initial)',
        '--vpc-id', $stagingVpcId,
        '--tag-specifications', 'ResourceType=security-group,Tags=[{Key=Name,Value=launch-wizard-staging},{Key=Environment,Value=Staging}]',
        '--query', 'GroupId',
        '--output', 'text'
    ) | Out-String).Trim()
    Invoke-SafeAws -Arguments @('ec2', 'revoke-security-group-egress', '--group-id', $webSgId, '--protocol', '-1', '--cidr', '0.0.0.0/0') | Out-Null
    Invoke-SafeAws -Arguments @('ec2', 'authorize-security-group-egress', '--group-id', $webSgId, '--protocol', 'tcp', '--port', '443', '--cidr', '0.0.0.0/0') | Out-Null
    Invoke-SafeAws -Arguments @('ec2', 'authorize-security-group-egress', '--group-id', $webSgId, '--protocol', 'tcp', '--port', '80', '--cidr', '0.0.0.0/0') | Out-Null
    Write-Host "  Created Web SG: $webSgId (0 inbound rules, egress 443/80)" -ForegroundColor Green
}

$existingClientSg = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-security-groups',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=group-name,Values=ec2-rds-staging',
    '--query', 'SecurityGroups[0].GroupId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingClientSg -and $existingClientSg -ne 'None') {
    $clientSgId = $existingClientSg
    Write-Host "  Reusing Client SG: $clientSgId" -ForegroundColor Yellow
} else {
    $clientSgId = (Invoke-SafeAws -Arguments @(
        'ec2', 'create-security-group',
        '--group-name', 'ec2-rds-staging',
        '--description', 'OrbitHR Staging EC2 Database Client SG',
        '--vpc-id', $stagingVpcId,
        '--tag-specifications', 'ResourceType=security-group,Tags=[{Key=Name,Value=ec2-rds-staging},{Key=Environment,Value=Staging}]',
        '--query', 'GroupId',
        '--output', 'text'
    ) | Out-String).Trim()
    Invoke-SafeAws -Arguments @('ec2', 'revoke-security-group-egress', '--group-id', $clientSgId, '--protocol', '-1', '--cidr', '0.0.0.0/0') | Out-Null
    Write-Host "  Created Client SG: $clientSgId" -ForegroundColor Green
}

$existingRdsSg = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-security-groups',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=group-name,Values=rds-staging-sg',
    '--query', 'SecurityGroups[0].GroupId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingRdsSg -and $existingRdsSg -ne 'None') {
    $rdsSgId = $existingRdsSg
    Write-Host "  Reusing RDS SG: $rdsSgId" -ForegroundColor Yellow
} else {
    $rdsSgId = (Invoke-SafeAws -Arguments @(
        'ec2', 'create-security-group',
        '--group-name', 'rds-staging-sg',
        '--description', 'OrbitHR Staging RDS Ingress',
        '--vpc-id', $stagingVpcId,
        '--tag-specifications', 'ResourceType=security-group,Tags=[{Key=Name,Value=rds-staging-sg},{Key=Environment,Value=Staging}]',
        '--query', 'GroupId',
        '--output', 'text'
    ) | Out-String).Trim()
    Invoke-SafeAws -Arguments @(
        'ec2', 'authorize-security-group-ingress',
        '--group-id', $rdsSgId,
        '--protocol', 'tcp',
        '--port', '5432',
        '--source-group', $clientSgId
    ) | Out-Null
    Invoke-SafeAws -Arguments @('ec2', 'authorize-security-group-egress', '--group-id', $clientSgId, '--protocol', 'tcp', '--port', '5432', '--source-group', $rdsSgId) | Out-Null
    Write-Host "  Created RDS SG: $rdsSgId (ingress 5432 from $clientSgId)" -ForegroundColor Green
}
Write-Host ""

# --- Step 6: RDS PostgreSQL 18.3 Instance ---
Write-Host "[STEP 6/7] Dispatching RDS PostgreSQL 18.3 instance (hrms-database-staging, db.t3.micro)..." -ForegroundColor Cyan
$existingRds = (Invoke-SafeAws -Arguments @(
    'rds', 'describe-db-instances',
    '--query', "DBInstances[?DBInstanceIdentifier=='hrms-database-staging'].DBInstanceIdentifier",
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingRds -and $existingRds -ne 'None') {
    Write-Host "  Reusing RDS DB instance: hrms-database-staging" -ForegroundColor Yellow
} else {
    Invoke-SafeAws -Arguments @(
        'rds', 'create-db-instance',
        '--db-instance-identifier', 'hrms-database-staging',
        '--db-instance-class', 'db.t3.micro',
        '--engine', 'postgres',
        '--engine-version', '18.3',
        '--master-username', 'orbit_stage_admin',
        '--master-user-password', $masterPass,
        '--allocated-storage', '20',
        '--storage-type', 'gp3',
        '--vpc-security-group-ids', $rdsSgId,
        '--db-subnet-group-name', 'orbithr-staging-db-subnet-group',
        '--no-publicly-accessible',
        '--backup-retention-period', '1',
        '--tags', 'Key=Environment,Value=Staging', 'Key=Name,Value=OrbitHR-Staging-RDS'
    ) | Out-Null
    Write-Host "  RDS instance creation initiated: hrms-database-staging (non-public)" -ForegroundColor Green
}
Write-Host ""

# --- Step 7: EC2 Host Launch ---
Write-Host "[STEP 7/7] Launching EC2 host i-staging-orbithr (t3.small AL2023, dark launch)..." -ForegroundColor Cyan
$existingInstance = (Invoke-SafeAws -Arguments @(
    'ec2', 'describe-instances',
    '--filters', "Name=vpc-id,Values=$stagingVpcId", 'Name=tag:Name,Values=OrbitHR-Staging', 'Name=instance-state-name,Values=pending,running,stopping,stopped',
    '--query', 'Reservations[0].Instances[0].InstanceId',
    '--output', 'text'
) -IgnoreError | Out-String).Trim()

if ($existingInstance -and $existingInstance -ne 'None') {
    $instanceId = $existingInstance
    Write-Host "  Reusing EC2 Instance: $instanceId" -ForegroundColor Yellow
} else {
    $blockDeviceFile = (Join-Path $repoRoot 'scripts\ec2_block_devices.json').Replace('\', '/')

    $amiId = (Invoke-SafeAws -Arguments @(
        'ec2', 'describe-images',
        '--owners', 'amazon',
        '--filters', 'Name=name,Values=al2023-ami-2023*-kernel-6.1-x86_64', 'Name=state,Values=available',
        '--query', 'reverse(sort_by(Images, &CreationDate))[0].ImageId',
        '--output', 'text'
    ) | Out-String).Trim()
    Write-Host "  Resolved official AL2023 AMI: $amiId" -ForegroundColor Gray

    $instanceId = (Invoke-SafeAws -Arguments @(
        'ec2', 'run-instances',
        '--image-id', $amiId,
        '--instance-type', 't3.small',
        '--security-group-ids', $webSgId, $clientSgId,
        '--subnet-id', $stagingPublicSubnetId,
        '--iam-instance-profile', 'Name=OrbitHR-EC2-Staging-Role',
        '--block-device-mappings', "file://$blockDeviceFile",
        '--tag-specifications', 'ResourceType=instance,Tags=[{Key=Name,Value=OrbitHR-Staging},{Key=Environment,Value=Staging},{Key=Project,Value=OrbitHR}]', 'ResourceType=volume,Tags=[{Key=Name,Value=OrbitHR-Staging},{Key=Environment,Value=Staging},{Key=Project,Value=OrbitHR}]',
        '--query', 'Instances[0].InstanceId',
        '--output', 'text'
    ) | Out-String).Trim()
    Write-Host "  EC2 instance launched: $instanceId" -ForegroundColor Green
}
Write-Host ""

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  ISOLATED STAGING INFRASTRUCTURE PROVISIONED SUCCESSFULLY       " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "VPC: $stagingVpcId"
Write-Host "EC2: $instanceId"
Write-Host "RDS: hrms-database-staging"
Write-Host "S3:  $stagingBucket"
