<#
.SYNOPSIS
    OrbitHR Staging Infrastructure Safe Teardown & Decommissioning Script.
.DESCRIPTION
    Safely deprovisions dedicated OrbitHR staging infrastructure (VPC 10.100.0.0/16)
    with strict fail-closed safeguards protecting production assets.
    
    Default mode is DRY-RUN (-DryRun $true). Destructive commands are only proposed
    or executed when -DryRun $false and -Force are explicitly provided.
.PARAMETER DryRun
    When true (default), audits and prints target resources without executing deletions.
.PARAMETER Force
    Safety confirmation switch required for non-dry-run decommissioning.
.PARAMETER StagingVpcId
    The staging VPC ID (default: vpc-0c6889ef293f31cdb).
.PARAMETER StagingInstanceId
    The staging EC2 instance ID (default: i-028b4179c559bffb9).
.PARAMETER StagingRdsId
    The staging RDS instance ID (default: hrms-database-staging).
.PARAMETER StagingBucket
    The staging S3 bucket (default: orbithr-staging-deployments-402545554824).
#>
[CmdletBinding()]
param(
    [switch]$DryRun = $true,
    [switch]$Force = $false,
    [string]$StagingVpcId = "vpc-0c6889ef293f31cdb",
    [string]$StagingInstanceId = "i-028b4179c559bffb9",
    [string]$StagingRdsId = "hrms-database-staging",
    [string]$StagingBucket = "orbithr-staging-deployments-402545554824",
    [string]$Region = "eu-north-1",
    [string]$Profile = "orbithr-staging"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   OrbitHR Staging Decommissioning & Safe Teardown Script        " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Mode: $(if ($DryRun) { '[DRY RUN] - READ ONLY AUDIT' } else { '[LIVE EXECUTION] - DESTRUCTIVE' })" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Red" })

# -----------------------------------------------------------------------------
# 1. HARD SAFEGUARDS: Protected Production Resource Deny-List
# -----------------------------------------------------------------------------
$ProtectedProductionResources = @{
    VpcId               = "vpc-0f8de3bbcdc8e468f"
    VpcCidr             = "172.31.0.0/16"
    Ec2InstanceId       = "i-068f8f1e571bc5cc6"
    RdsInstanceId       = "hrms-database"
    PreMigrationSnapshot = "orbithr-pre-p2-10-rc2-snapshot"
    S3ProductionBucket  = "orbithr-production-deployments-402545554824"
    Ec2ProductionRole   = "OrbitHR-EC2-Role"
}

function Assert-NotProductionResource {
    param([string]$ResourceId, [string]$ResourceType)
    foreach ($entry in $ProtectedProductionResources.GetEnumerator()) {
        if ($ResourceId -eq $entry.Value) {
            throw "FATAL SAFETY VIOLATION: Target $ResourceType '$ResourceId' matches protected production asset '$($entry.Key)' ($($entry.Value))! Teardown immediately aborted."
        }
    }
    if ($ResourceId -like "*production*") {
        throw "FATAL SAFETY VIOLATION: Target $ResourceType '$ResourceId' contains protected keyword 'production'! Teardown immediately aborted."
    }
}

# Run upfront checks on provided parameters
Assert-NotProductionResource -ResourceId $StagingVpcId -ResourceType "VPC"
Assert-NotProductionResource -ResourceId $StagingInstanceId -ResourceType "EC2"
Assert-NotProductionResource -ResourceId $StagingRdsId -ResourceType "RDS"
Assert-NotProductionResource -ResourceId $StagingBucket -ResourceType "S3"

Write-Host "[PASS] Preflight production deny-list check passed. Zero production identifiers matched." -ForegroundColor Green

# -----------------------------------------------------------------------------
# 2. Decommissioning Plan Inventory
# -----------------------------------------------------------------------------
$TeardownPlan = [ordered]@{
    "1. EC2 Compute" = @(
        "Terminate EC2 Instance: $StagingInstanceId (DeleteOnTermination will release gp3 root volume)",
        "Wait for instance-terminated status",
        "Audit and release lingering unattached EBS volumes tagged Environment=Staging / Project=OrbitHR",
        "Audit and disassociate Elastic Public IPv4 (13.60.60.174) if allocated"
    )
    "2. RDS Relational Database" = @(
        "Delete RDS DB Instance: $StagingRdsId (skip-final-snapshot or optional audit snapshot)",
        "Wait for db-instance-deleted status",
        "Delete DB Subnet Group: dbsng-staging-orbithr",
        "Verify automated backups lifecycle: Delete retained automated backup if required"
    )
    "3. S3 Deployment Storage" = @(
        "Abort all lingering incomplete multipart uploads on s3://$StagingBucket",
        "Delete all object versions and delete markers in s3://$StagingBucket",
        "Delete bucket: s3://$StagingBucket"
    )
    "4. AWS Systems Manager & Biometrics" = @(
        "Delete SSM Parameter: /orbithr/staging/database/master_password",
        "Delete SSM Parameter: /orbithr/staging/database/app_password",
        "Delete Rekognition Face Collection: orbithr-staging"
    )
    "5. IAM Scoped Entities" = @(
        "Remove role from instance profile: OrbitHR-EC2-Staging-Profile",
        "Delete instance profile: OrbitHR-EC2-Staging-Profile",
        "Detach policy OrbitHR-EC2-Staging-Host-Policy from role OrbitHR-EC2-Staging-Role",
        "Detach policy AmazonSSMManagedInstanceCore from role OrbitHR-EC2-Staging-Role",
        "Delete role: OrbitHR-EC2-Staging-Role",
        "Delete customer managed policy: OrbitHR-EC2-Staging-Host-Policy"
    )
    "6. Dedicated Staging Network (VPC 10.100.0.0/16)" = @(
        "Delete Security Group: sg-0213eec021664fb5d (launch-wizard-staging)",
        "Delete Security Group: sg-0c419bb8f24c56ba3 (ec2-rds-staging)",
        "Delete Security Group: sg-022b7179ca5885967 (rds-staging)",
        "Detach Internet Gateway from VPC: $StagingVpcId",
        "Delete Internet Gateway: igw-0b893cb566db9b78a",
        "Delete Subnet: subnet-0f0c0ae2f1abffc2b (10.100.1.0/24, public)",
        "Delete Subnet: subnet-0f8921e05d045cb97 (10.100.10.0/24, private db 1)",
        "Delete Subnet: subnet-0ef42721f579549f3 (10.100.20.0/24, private db 2)",
        "Delete Route Table: rtb-02e0df400c6d59518 (staging public route table)",
        "Delete VPC: $StagingVpcId (10.100.0.0/16)"
    )
}

Write-Host "`nTarget Decommissioning Hierarchy:" -ForegroundColor Yellow
foreach ($phase in $TeardownPlan.Keys) {
    Write-Host "  [$phase]" -ForegroundColor White
    foreach ($action in $TeardownPlan[$phase]) {
        Write-Host "    - $action" -ForegroundColor Gray
    }
}

if ($DryRun) {
    Write-Host "`n[DRY RUN COMPLETE] Zero resources were modified or deleted." -ForegroundColor Green
    Write-Host "All safeguards hold. To perform live decommissioning, live AWS CLI session with MFA is required." -ForegroundColor Yellow
    return
}

# -----------------------------------------------------------------------------
# 3. Live Destruction Guard
# -----------------------------------------------------------------------------
if (-not $Force) {
    throw "FATAL: Live destruction requested (-DryRun `$false) but -Force switch was not provided. Aborting."
}

Write-Warning "LIVE DECOMMISSIONING NOT AUTHORIZED IN AUTONOMOUS ACCEPTANCE AUDIT MODE."
throw "FAIL-CLOSED: Live teardown execution requires explicit operator authorization and fresh interactive MFA."
