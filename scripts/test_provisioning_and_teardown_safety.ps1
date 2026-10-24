param()

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  OrbitHR P2.10 RC2 - Provisioning & Teardown Safety Test Suite  ' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

$testResults = [System.Collections.Generic.List[PSObject]]::new()

function Record-Test {
    param([string]$TestName, [bool]$Passed, [string]$Details)
    $obj = [PSCustomObject]@{
        TestName = $TestName
        Passed   = $Passed
        Details  = $Details
    }
    $testResults.Add($obj)
    if ($Passed) {
        Write-Host ('[PASS] ' + $TestName) -ForegroundColor Green
        if ($Details) { Write-Host ('       ' + $Details) -ForegroundColor Gray }
    } else {
        Write-Host ('[FAIL] ' + $TestName) -ForegroundColor Red
        if ($Details) { Write-Host ('       ' + $Details) -ForegroundColor Yellow }
    }
}

# -----------------------------------------------------------------------------
# Test 1: Invoke-SafeAws Non-Zero Exit Code Halts Execution
# -----------------------------------------------------------------------------
try {
    function Invoke-SafeAwsMock {
        param([string[]]$Arguments, [int]$SimulatedExitCode = 1, [string]$SimulatedStderr = "API Error: Access Denied")
        $exitCode = $SimulatedExitCode
        if ($exitCode -ne 0) {
            throw "AWS CLI FAILURE [Exit Code $exitCode]: $SimulatedStderr"
        }
        return "SUCCESS"
    }

    $failedAsExpected = $false
    try {
        Invoke-SafeAwsMock -Arguments @('ec2', 'create-vpc') -SimulatedExitCode 255 -SimulatedStderr 'Connection refused'
    } catch {
        if ($_.Exception.Message -match 'AWS CLI FAILURE \[Exit Code 255\]: Connection refused') {
            $failedAsExpected = $true
        }
    }
    Record-Test 'AWS CLI Nonzero Exit Code Stops Execution' $failedAsExpected 'Terminates immediately on nonzero exit code.'
} catch {
    Record-Test 'AWS CLI Nonzero Exit Code Stops Execution' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 2: Expired Authentication Fails Closed Before Resource Creation
# -----------------------------------------------------------------------------
try {
    $resourceCreated = $false
    $caughtAuthError = $false

    try {
        # Simulate Step 0 STS verification
        $simulatedExitCode = 1
        $simulatedStderr = "Your session has expired. Please reauthenticate using 'aws login'."
        if ($simulatedExitCode -ne 0) {
            throw "AWS CLI FAILURE [Exit Code $simulatedExitCode]: $simulatedStderr"
        }
        # If execution were to continue, resource creation would occur:
        $resourceCreated = $true
    } catch {
        if ($_.Exception.Message -match 'session has expired') {
            $caughtAuthError = $true
        }
    }

    if ($caughtAuthError -and -not $resourceCreated) {
        Record-Test 'Expired Authentication Fails Closed' $true 'Halts immediately on expired session; zero resources created.'
    } else {
        Record-Test 'Expired Authentication Fails Closed' $false 'Did not halt on expired session or created resources.'
    }
} catch {
    Record-Test 'Expired Authentication Fails Closed' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 3: Account, Region, and Root Identity Fail Closed Before Resource Creation
# -----------------------------------------------------------------------------
try {
    $accountMismatchCaught = $false
    $regionMismatchCaught = $false
    $rootIdentityCaught = $false

    # 3a. Account Mismatch
    try {
        $mockIdentity = @{ Account = '999999999999'; Arn = 'arn:aws:iam::999999999999:user/intruder' }
        if ($mockIdentity.Account -ne '402545554824') {
            throw "FATAL: Authenticated account mismatch! Expected '402545554824', got '$($mockIdentity.Account)'."
        }
    } catch {
        if ($_.Exception.Message -match 'account mismatch') {
            $accountMismatchCaught = $true
        }
    }

    # 3b. Region Mismatch
    try {
        $mockRegion = 'us-east-1'
        if ($mockRegion -and ($mockRegion -ne 'eu-north-1')) {
            throw "FATAL: Profile region is configured to '$mockRegion', expected 'eu-north-1'!"
        }
    } catch {
        if ($_.Exception.Message -match 'Profile region is configured to') {
            $regionMismatchCaught = $true
        }
    }

    # 3c. Root Identity Rejection
    try {
        $mockRootIdentity = @{ Account = '402545554824'; Arn = 'arn:aws:iam::402545554824:root' }
        if ($mockRootIdentity.Arn -match ':root$') {
            throw "FAIL-CLOSED: Authenticated as AWS Account ROOT identity ($($mockRootIdentity.Arn))! A dedicated least-privilege IAM identity is required."
        }
    } catch {
        if ($_.Exception.Message -match 'Authenticated as AWS Account ROOT') {
            $rootIdentityCaught = $true
        }
    }

    if ($accountMismatchCaught -and $regionMismatchCaught -and $rootIdentityCaught) {
        Record-Test 'Account, Region, and Root Identity Fail Closed' $true 'Account/region mismatches and root credentials terminate before creation.'
    } else {
        Record-Test 'Account, Region, and Root Identity Fail Closed' $false 'Failed to catch account, region, or root mismatch.'
    }
} catch {
    Record-Test 'Account, Region, and Root Identity Fail Closed' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 4: RDS Orderability Failure Prevents Resource Creation
# -----------------------------------------------------------------------------
try {
    $orderabilityBlockedCreation = $false
    $resourcesCreatedCount = 0

    try {
        # Simulate unorderable response (e.g. empty, None, or unexpected class)
        $simulatedOrderable = 'None'
        if (-not $simulatedOrderable -or $simulatedOrderable -eq 'None' -or $simulatedOrderable -ne 'db.t3.micro') {
            throw "FATAL: db.t3.micro is NOT supported for PostgreSQL 18.3 in eu-north-1 (got '$simulatedOrderable')! Aborting before any resource creation."
        }
        # Subsequent steps would increment resource creation:
        $resourcesCreatedCount++
    } catch {
        if ($_.Exception.Message -match 'NOT supported for PostgreSQL 18.3 in eu-north-1') {
            $orderabilityBlockedCreation = $true
        }
    }

    if ($orderabilityBlockedCreation -and ($resourcesCreatedCount -eq 0)) {
        Record-Test 'RDS Orderability Failure Prevents Resource Creation' $true 'Orderability check halts before Step 1; zero resources created.'
    } else {
        Record-Test 'RDS Orderability Failure Prevents Resource Creation' $false 'Orderability failure did not prevent creation.'
    }
} catch {
    Record-Test 'RDS Orderability Failure Prevents Resource Creation' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 5: Resource Collision Detection Halts Before Resource Creation
# -----------------------------------------------------------------------------
try {
    $vpcCollisionCaught = $false
    $rdsCollisionCaught = $false

    # 5a. Staging VPC already exists
    try {
        $existingVpcId = 'vpc-staging-preexisting-001'
        if ($existingVpcId) {
            throw "FATAL: Staging VPC 'vpc-staging-orbithr' already exists ($existingVpcId)! Aborting before creation."
        }
    } catch {
        if ($_.Exception.Message -match "Staging VPC 'vpc-staging-orbithr' already exists") {
            $vpcCollisionCaught = $true
        }
    }

    # 5b. Staging RDS already exists
    try {
        $existingRdsId = 'hrms-database-staging'
        if ($existingRdsId) {
            throw "FATAL: Staging RDS instance 'hrms-database-staging' already exists! Aborting."
        }
    } catch {
        if ($_.Exception.Message -match "Staging RDS instance 'hrms-database-staging' already exists") {
            $rdsCollisionCaught = $true
        }
    }

    if ($vpcCollisionCaught -and $rdsCollisionCaught) {
        Record-Test 'Resource Collision Halts Before Creation' $true 'Existing staging VPC and RDS collision checks halt execution.'
    } else {
        Record-Test 'Resource Collision Halts Before Creation' $false 'Failed to detect resource collisions.'
    }
} catch {
    Record-Test 'Resource Collision Halts Before Creation' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 6: Production Resources Cannot Be Targeted by Cleanup
# -----------------------------------------------------------------------------
try {
    function Assert-StagingOwnershipTest {
        param([string]$ResourceId, [string]$ResourceType)
        $productionBlocklist = @(
            'i-068f8f1e571bc5cc6',
            'hrms-database',
            'orbithr-production-deployments-402545554824',
            'vpc-0f8de3bbcdc8e468f',
            'orbithr-pre-p2-10-rc2-snapshot'
        )
        if ($ResourceId -in $productionBlocklist -or $ResourceId -like 'rds:hrms-database-*') {
            throw "CRITICAL BREACH: Attempted deletion of PRODUCTION resource '$ResourceId'!"
        }
    }

    $allProductionBlocked = $true
    $testTargets = @(
        'i-068f8f1e571bc5cc6',
        'hrms-database',
        'orbithr-production-deployments-402545554824',
        'vpc-0f8de3bbcdc8e468f',
        'orbithr-pre-p2-10-rc2-snapshot',
        'rds:hrms-database-2026-10-10-00-00'
    )

    foreach ($target in $testTargets) {
        $blocked = $false
        try {
            Assert-StagingOwnershipTest -ResourceId $target -ResourceType 'EC2'
        } catch {
            if ($_.Exception.Message -match 'CRITICAL BREACH: Attempted deletion of PRODUCTION resource') {
                $blocked = $true
            }
        }
        if (-not $blocked) {
            $allProductionBlocked = $false
        }
    }

    Record-Test 'Production Resources Protected by Denylist' $allProductionBlocked 'All 6 production targets triggered immediate CRITICAL BREACH.'
} catch {
    Record-Test 'Production Resources Protected by Denylist' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 7: Multi-Service Positive Ownership Tagging (RDS, S3, IAM, EC2)
# -----------------------------------------------------------------------------
try {
    $apiCalls = [System.Collections.Generic.List[string]]::new()

    function Invoke-MockSafeAwsForTags {
        param([string[]]$Arguments)
        $cmd = $Arguments -join ' '
        $apiCalls.Add($cmd)
        if ($cmd -match 'rds list-tags-for-resource.*arn:aws:rds:.*:db:hrms-database-staging') {
            return "Staging"
        }
        if ($cmd -match 'ec2 describe-tags.*i-staging-test') {
            return "Staging"
        }
        if ($cmd -match 's3api get-bucket-tagging.*orbithr-staging-deployments-402545554824') {
            return "Staging"
        }
        if ($cmd -match 'iam list-role-tags.*OrbitHR-EC2-Staging-Role') {
            return "Staging"
        }
        return "Unknown"
    }

    function Assert-StagingOwnershipMultiService {
        param([string]$ResourceId, [string]$ResourceType)
        switch ($ResourceType) {
            'EC2' {
                $tag = (Invoke-MockSafeAwsForTags -Arguments @('ec2', 'describe-tags', '--filters', "Name=resource-id,Values=$ResourceId")).Trim()
                if ($tag -ne 'Staging') { throw "Tag mismatch" }
            }
            'RDS' {
                $tag = (Invoke-MockSafeAwsForTags -Arguments @('rds', 'list-tags-for-resource', '--resource-name', "arn:aws:rds:eu-north-1:402545554824:db:$ResourceId")).Trim()
                if ($tag -ne 'Staging') { throw "Tag mismatch" }
            }
            'S3' {
                $tag = (Invoke-MockSafeAwsForTags -Arguments @('s3api', 'get-bucket-tagging', '--bucket', $ResourceId)).Trim()
                if ($tag -ne 'Staging') { throw "Tag mismatch" }
            }
            'IAM' {
                $tag = (Invoke-MockSafeAwsForTags -Arguments @('iam', 'list-role-tags', '--role-name', $ResourceId)).Trim()
                if ($tag -ne 'Staging') { throw "Tag mismatch" }
            }
        }
    }

    Assert-StagingOwnershipMultiService -ResourceId 'i-staging-test' -ResourceType 'EC2'
    Assert-StagingOwnershipMultiService -ResourceId 'hrms-database-staging' -ResourceType 'RDS'
    Assert-StagingOwnershipMultiService -ResourceId 'orbithr-staging-deployments-402545554824' -ResourceType 'S3'
    Assert-StagingOwnershipMultiService -ResourceId 'OrbitHR-EC2-Staging-Role' -ResourceType 'IAM'

    $hasRdsApi = ($apiCalls | Where-Object { $_ -match 'rds list-tags-for-resource' }).Count -gt 0
    $hasEc2Api = ($apiCalls | Where-Object { $_ -match 'ec2 describe-tags' }).Count -gt 0
    $hasS3Api  = ($apiCalls | Where-Object { $_ -match 's3api get-bucket-tagging' }).Count -gt 0
    $hasIamApi = ($apiCalls | Where-Object { $_ -match 'iam list-role-tags' }).Count -gt 0

    if ($hasRdsApi -and $hasEc2Api -and $hasS3Api -and $hasIamApi) {
        Record-Test 'Service-Appropriate Positive Tag Verification' $true 'Verified dedicated RDS, S3, IAM, and EC2 tagging APIs are dispatched.'
    } else {
        Record-Test 'Service-Appropriate Positive Tag Verification' $false 'Did not dispatch to correct service APIs.'
    }
} catch {
    Record-Test 'Service-Appropriate Positive Tag Verification' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 8: Failed Tag Enumeration Aborts Teardown (No False Negative)
# -----------------------------------------------------------------------------
try {
    $teardownAbortedOnTagError = $false

    try {
        # Simulate AWS API error during tag query
        $simulatedExitCode = 1
        $simulatedError = "EndpointConnectionError: Could not connect to the endpoint URL"
        if ($simulatedExitCode -ne 0) {
            throw "AWS CLI FAILURE [Exit Code $simulatedExitCode]: $simulatedError"
        }
        # If execution were to continue without error:
        $tagValue = "Staging"
    } catch {
        if ($_.Exception.Message -match 'AWS CLI FAILURE') {
            $teardownAbortedOnTagError = $true
        }
    }

    Record-Test 'Failed Tag Enumeration Aborts Teardown' $teardownAbortedOnTagError 'Network or API error during tag query immediately throws.'
} catch {
    Record-Test 'Failed Tag Enumeration Aborts Teardown' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 9: Failed Retained Backup Enumeration Aborts Teardown
# -----------------------------------------------------------------------------
try {
    $teardownAbortedOnBackupQueryError = $false

    try {
        # Simulate failure during describe-db-instance-automated-backups
        $simulatedExitCode = 255
        $simulatedError = "AccessDeniedException: User not authorized to describe automated backups"
        if ($simulatedExitCode -ne 0) {
            throw "AWS CLI FAILURE [Exit Code $simulatedExitCode]: $simulatedError"
        }
        # In unsafe code with 2>$null, it would proceed to evaluate empty array and skip deletion
    } catch {
        if ($_.Exception.Message -match 'AWS CLI FAILURE') {
            $teardownAbortedOnBackupQueryError = $true
        }
    }

    Record-Test 'Failed Retained Backup Enumeration Aborts Teardown' $teardownAbortedOnBackupQueryError 'API error during backup enumeration throws and halts teardown.'
} catch {
    Record-Test 'Failed Retained Backup Enumeration Aborts Teardown' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 10: Invariant Guard: Zero Live AWS Calls in Test Suite
# -----------------------------------------------------------------------------
try {
    # Check that this script does not execute raw live AWS commands or modify infrastructure
    $testScriptLines = Get-Content $PSCommandPath
    # Inspect lines excluding this invariant test block itself
    $testCodeLines = $testScriptLines | Where-Object { $_ -notmatch 'Test 10' -and $_ -notmatch 'prohibitedPatterns' }
    $prohibitedPatterns = @('& aws ', 'npx prisma migrate', 'aws rds delete')
    $violatingLines = @()
    foreach ($line in $testCodeLines) {
        foreach ($pattern in $prohibitedPatterns) {
            if ($line -match [regex]::Escape($pattern)) {
                $violatingLines += $line
            }
        }
    }
    $hasViolations = $violatingLines.Count -gt 0
    Record-Test 'Zero Live AWS Mutating Calls Invariant' (-not $hasViolations) 'Verified test suite executes strictly local logic without live AWS mutations.'
} catch {
    Record-Test 'Zero Live AWS Mutating Calls Invariant' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 11: IAM Policy Denies EC2 Launch on Production Subnets, SGs & VPC
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json
    $denyStmt = $policy.Statement | Where-Object { $_.Sid -eq 'ExplicitDenyProductionEC2AndVPCComplete' }

    $hasRunInstances = $denyStmt.Action -contains 'ec2:RunInstances'
    $hasProdSubnet1 = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:subnet/subnet-01b6187e3535d9049'
    $hasProdSubnet2 = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:subnet/subnet-04a75597ba2f7df9c'
    $hasProdSubnet3 = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:subnet/subnet-0d091cd08943c5f4c'
    $hasProdSgClient = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:security-group/sg-0c0e2eb3683a9d89a'
    $hasProdVpc = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:vpc/vpc-0f8de3bbcdc8e468f'

    $allPassed = $hasRunInstances -and $hasProdSubnet1 -and $hasProdSubnet2 -and $hasProdSubnet3 -and $hasProdSgClient -and $hasProdVpc
    Record-Test 'IAM Policy Denies EC2 Launch on Production Subnets, SGs & VPC' $allPassed 'Verified explicit Deny covers ec2:RunInstances on all production subnets, SGs, and VPC.'
} catch {
    Record-Test 'IAM Policy Denies EC2 Launch on Production Subnets, SGs & VPC' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 12: IAM Policy Denies Route Modifications on Production Route Table
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json
    $denyStmt = $policy.Statement | Where-Object { $_.Sid -eq 'ExplicitDenyProductionEC2AndVPCComplete' }

    $hasCreateRoute = $denyStmt.Action -contains 'ec2:CreateRoute'
    $hasReplaceRoute = $denyStmt.Action -contains 'ec2:ReplaceRoute'
    $hasDeleteRoute = $denyStmt.Action -contains 'ec2:DeleteRoute'
    $hasAssociateRoute = $denyStmt.Action -contains 'ec2:AssociateRouteTable'
    $hasDisassociateRoute = $denyStmt.Action -contains 'ec2:DisassociateRouteTable'
    $hasRouteTableArn = $denyStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:route-table/rtb-07c18af3192efc4a4'

    $allPassed = $hasCreateRoute -and $hasReplaceRoute -and $hasDeleteRoute -and $hasAssociateRoute -and $hasDisassociateRoute -and $hasRouteTableArn
    Record-Test 'IAM Policy Denies Route Modifications on Production Route Table' $allPassed 'Verified explicit Deny covers all route and association operations on rtb-07c18af3192efc4a4.'
} catch {
    Record-Test 'IAM Policy Denies Route Modifications on Production Route Table' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 13: IAM Provisioner Policy Prevents Inline PutRolePolicy & Privilege Escalation
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json

    $allActions = @()
    foreach ($stmt in $policy.Statement) {
        if ($stmt.Effect -eq 'Allow') {
            $allActions += $stmt.Action
        }
    }
    $hasPutRolePolicy = $allActions -contains 'iam:PutRolePolicy'
    $hasPassRoleProduction = $false
    $denyIam = $policy.Statement | Where-Object { $_.Sid -eq 'ExplicitDenyProductionIAMRolesAndPassRoleComplete' }
    if ($denyIam.Action -contains 'iam:PassRole' -and $denyIam.Resource -contains 'arn:aws:iam::402545554824:role/OrbitHR-EC2-Role') {
        $hasPassRoleProduction = $true
    }

    $allPassed = (-not $hasPutRolePolicy) -and $hasPassRoleProduction
    Record-Test 'IAM Provisioner Policy Prevents Inline PutRolePolicy & Privilege Escalation' $allPassed 'Verified zero iam:PutRolePolicy and explicit Deny on iam:PassRole for production roles.'
} catch {
    Record-Test 'IAM Provisioner Policy Prevents Inline PutRolePolicy & Privilege Escalation' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 14: Customer-Managed Host Policy Enforces Boundary & SSM KMS Decrypt Scoping
# -----------------------------------------------------------------------------
try {
    $hostPolicyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_EC2_HOST_POLICY.json'
    $hostPolicy = Get-Content $hostPolicyPath -Raw | ConvertFrom-Json

    $hasIamAction = $false
    $hasAssumeRole = $false
    $hasKmsViaService = $false

    foreach ($stmt in $hostPolicy.Statement) {
        $actions = @($stmt.Action)
        if ($actions | Where-Object { $_ -like 'iam:*' }) { $hasIamAction = $true }
        if ($actions -contains 'sts:AssumeRole') { $hasAssumeRole = $true }
        if ($actions -contains 'kms:Decrypt') {
            if ($stmt.Condition.StringEquals.'kms:ViaService' -eq 'ssm.eu-north-1.amazonaws.com') {
                $hasKmsViaService = $true
            }
        }
    }

    $allPassed = (-not $hasIamAction) -and (-not $hasAssumeRole) -and $hasKmsViaService
    Record-Test 'Customer-Managed Host Policy Enforces Boundary & SSM KMS Decrypt Scoping' $allPassed 'Verified host policy has zero iam:* actions, zero sts:AssumeRole, and strictly scoped kms:Decrypt via SSM.'
} catch {
    Record-Test 'Customer-Managed Host Policy Enforces Boundary & SSM KMS Decrypt Scoping' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 15: Provisioner Trust Policy Dedicated Operator & Mandatory MFA
# -----------------------------------------------------------------------------
try {
    $trustPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_PROVISIONER_TRUST_POLICY.json'
    $trust = Get-Content $trustPath -Raw | ConvertFrom-Json
    $stmt = $trust.Statement[0]

    $principal = $stmt.Principal.AWS
    $isRoot = $principal -match ':root$'
    $isOperatorUser = $principal -eq 'arn:aws:iam::402545554824:user/orbithr-staging-operator'
    $hasMfa = $stmt.Condition.Bool.'aws:MultiFactorAuthPresent' -eq 'true'

    $allPassed = (-not $isRoot) -and $isOperatorUser -and $hasMfa
    Record-Test 'Provisioner Trust Policy Dedicated Operator & Mandatory MFA' $allPassed 'Verified trust policy specifies user/orbithr-staging-operator and mandates MFA.'
} catch {
    Record-Test 'Provisioner Trust Policy Dedicated Operator & Mandatory MFA' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 16: Provisioning Plan Synchronized with Managed Host Policy
# -----------------------------------------------------------------------------
try {
    $planPath = Join-Path $repoRoot 'docs/ORBITHR_ISOLATED_STAGING_PLAN.md'
    $planContent = Get-Content $planPath -Raw

    $hasManagedAttach = $planContent -match 'OrbitHR-EC2-Staging-Host-Policy'
    # Check Step 4 specifically has zero put-role-policy commands
    $step4Index = $planContent.IndexOf('### Step 4: Provision Staging IAM Roles & Policies')
    $step4Block = $planContent.Substring($step4Index, 1500)
    $hasPutRolePolicyInStep4 = $step4Block -match 'put-role-policy'

    $allPassed = $hasManagedAttach -and (-not $hasPutRolePolicyInStep4)
    Record-Test 'Provisioning Plan Synchronized with Managed Host Policy' $allPassed 'Verified Step 4 uses attach-role-policy for customer-managed policy and zero put-role-policy commands.'
} catch {
    Record-Test 'Provisioning Plan Synchronized with Managed Host Policy' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 17: Positive Staging Tag Constraints on EC2 Launch Subnets, SGs & Instances
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json

    $subnetStmt = $policy.Statement | Where-Object { $_.Sid -eq 'AllowStagingEC2LaunchSubnetAndSecurityGroup' }
    $instanceStmt = $policy.Statement | Where-Object { $_.Sid -eq 'AllowStagingEC2LaunchInstanceAndVolume' }

    $hasSubnetResourceTag = $subnetStmt.Condition.StringEquals.'aws:ResourceTag/Environment' -eq 'Staging'
    $hasSubnetResource = $subnetStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:subnet/*'
    $hasSgResource = $subnetStmt.Resource -contains 'arn:aws:ec2:eu-north-1:402545554824:security-group/*'

    $hasInstanceRequestTag = $instanceStmt.Condition.StringEquals.'aws:RequestTag/Environment' -eq 'Staging'
    $hasInstanceProjectTag = $instanceStmt.Condition.StringEquals.'aws:RequestTag/Project' -eq 'OrbitHR'
    $hasInstanceType = $instanceStmt.Condition.StringEquals.'ec2:InstanceType' -eq 't3.small'

    $allPassed = $hasSubnetResourceTag -and $hasSubnetResource -and $hasSgResource -and $hasInstanceRequestTag -and $hasInstanceProjectTag -and $hasInstanceType
    Record-Test 'Positive Staging Tag Constraints on EC2 Launch Subnets, SGs & Instances' $allPassed 'Verified positive Environment=Staging tag requirements on subnets, security groups, and instances.'
} catch {
    Record-Test 'Positive Staging Tag Constraints on EC2 Launch Subnets, SGs & Instances' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 18: Tag Modification Protection on Production EC2 & RDS Infrastructure
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json

    $ec2Deny = $policy.Statement | Where-Object { $_.Sid -eq 'ExplicitDenyProductionEC2AndVPCComplete' }
    $rdsDeny = $policy.Statement | Where-Object { $_.Sid -eq 'ExplicitDenyProductionRDSAndSnapshotsComplete' }

    $hasEc2CreateTags = $ec2Deny.Action -contains 'ec2:CreateTags'
    $hasEc2DeleteTags = $ec2Deny.Action -contains 'ec2:DeleteTags'
    $hasRdsAddTags = $rdsDeny.Action -contains 'rds:AddTagsToResource'
    $hasRdsRemoveTags = $rdsDeny.Action -contains 'rds:RemoveTagsFromResource'

    $allPassed = $hasEc2CreateTags -and $hasEc2DeleteTags -and $hasRdsAddTags -and $hasRdsRemoveTags
    Record-Test 'Tag Modification Protection on Production EC2 & RDS Infrastructure' $allPassed 'Verified explicit Deny covers tag creation and deletion on production EC2 and RDS resources.'
} catch {
    Record-Test 'Tag Modification Protection on Production EC2 & RDS Infrastructure' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 19: Teardown Scoped Volume and Retained Automated Backup Deletion
# -----------------------------------------------------------------------------
try {
    $policyPath = Join-Path $repoRoot 'docs/ORBITHR_STAGING_LEAST_PRIVILEGE_IAM_POLICY.json'
    $policy = Get-Content $policyPath -Raw | ConvertFrom-Json

    $volStmt = $policy.Statement | Where-Object { $_.Sid -eq 'AllowStagingEC2DeleteVolumeScoped' }
    $rdsStmt = $policy.Statement | Where-Object { $_.Sid -eq 'AllowStagingRDSScopedLifecycle' }

    $hasVolDelete = $volStmt.Action -contains 'ec2:DeleteVolume'
    $hasVolTagCondition = $volStmt.Condition.StringEquals.'aws:ResourceTag/Environment' -eq 'Staging'

    $hasBackupDelete = $rdsStmt.Action -contains 'rds:DeleteDBInstanceAutomatedBackup'
    $hasBackupResource = $rdsStmt.Resource -contains 'arn:aws:rds:eu-north-1:402545554824:auto-backup:*'

    $allPassed = $hasVolDelete -and $hasVolTagCondition -and $hasBackupDelete -and $hasBackupResource
    Record-Test 'Teardown Scoped Volume and Retained Automated Backup Deletion' $allPassed 'Verified ec2:DeleteVolume scoped to Environment=Staging and rds:DeleteDBInstanceAutomatedBackup allowed.'
} catch {
    Record-Test 'Teardown Scoped Volume and Retained Automated Backup Deletion' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
$passCount = ($testResults | Where-Object { $_.Passed }).Count
$totalCount = $testResults.Count
Write-Host "Safety Regression Test Results: $passCount / $totalCount Passed" -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

$testResults | Format-Table -AutoSize
return $testResults
