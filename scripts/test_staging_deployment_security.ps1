param()

$repoRoot = Split-Path -Parent $PSScriptRoot
$bashPath = 'C:\Users\prata\Git\bin\bash.exe'
$installerScript = (Join-Path $repoRoot 'deploy\install-staging-release.sh').Replace('\', '/')

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  OrbitHR P2.10 RC2 - Staging Deployment Security Test Suite     ' -ForegroundColor Cyan
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

function Invoke-SafeCommand {
    param([scriptblock]$Command)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Command 2>&1 | Out-String
        return $out
    } finally {
        $ErrorActionPreference = $prev
    }
}

# -----------------------------------------------------------------------------
# Test 1: Syntax Validation
# -----------------------------------------------------------------------------
try {
    $null = Get-Command -Syntax (Join-Path $repoRoot 'deploy\deploy-staging.ps1')
    Record-Test 'deploy-staging.ps1 PowerShell Syntax' $true 'No syntax errors detected.'
} catch {
    Record-Test 'deploy-staging.ps1 PowerShell Syntax' $false $_.Exception.Message
}

try {
    $res = Invoke-SafeCommand { & $bashPath -n (Join-Path $repoRoot 'deploy\install-staging-release.sh') }
    if ($LASTEXITCODE -eq 0) {
        Record-Test 'install-staging-release.sh Bash Syntax' $true 'No bash syntax errors detected.'
    } else {
        Record-Test 'install-staging-release.sh Bash Syntax' $false $res
    }
} catch {
    Record-Test 'install-staging-release.sh Bash Syntax' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 2: Commit Mismatch Rejection
# -----------------------------------------------------------------------------
$badCommitOut = Invoke-SafeCommand {
    & powershell -File (Join-Path $repoRoot 'deploy\deploy-staging.ps1') -ExpectedCommit '0000000000000000000000000000000000000000' -SkipBuild
}
if ($badCommitOut -match 'Commit mismatch') {
    Record-Test 'Unapproved Commit Rejection' $true 'Correctly failed closed on mismatched commit.'
} else {
    Record-Test 'Unapproved Commit Rejection' $false 'Expected script to fail on commit mismatch.'
}

# -----------------------------------------------------------------------------
# Test 3: Production Instance & Bucket Rejection
# -----------------------------------------------------------------------------
$prodInstanceOut = Invoke-SafeCommand {
    & powershell -File (Join-Path $repoRoot 'deploy\deploy-staging.ps1') -StagingInstanceId 'i-068f8f1e571bc5cc6' -SkipBuild
}
if ($prodInstanceOut -match 'Production instance.*i-068f8f1e571bc5cc6.*was provided as staging target') {
    Record-Test 'Production Instance ID Rejection' $true 'Rejected production instance i-068f8f1e571bc5cc6 immediately.'
} else {
    Record-Test 'Production Instance ID Rejection' $false 'Did not reject production instance ID.'
}

$prodBucketOut = Invoke-SafeCommand {
    & powershell -File (Join-Path $repoRoot 'deploy\deploy-staging.ps1') -StagingInstanceId 'i-staging-test' -StagingBucket 'orbithr-production-deployments-402545554824' -SkipBuild
}
if ($prodBucketOut -match 'Production S3 bucket.*targeted') {
    Record-Test 'Production S3 Bucket Rejection' $true 'Rejected production S3 bucket immediately.'
} else {
    Record-Test 'Production S3 Bucket Rejection' $false 'Did not reject production bucket.'
}

# -----------------------------------------------------------------------------
# Test 4: Package Creation & Manifest Inspection
# -----------------------------------------------------------------------------
$pkgResult = Invoke-SafeCommand {
    & powershell -File (Join-Path $repoRoot 'deploy\deploy-staging.ps1') -PackageOnly -SkipBuild
}
$tgzFiles = Get-ChildItem ([IO.Path]::GetTempPath()) -Filter 'orbithr-staging-*.tgz' | Sort-Object LastWriteTime -Descending
if ($tgzFiles.Count -gt 0) {
    $testTgz = $tgzFiles[0].FullName
    $tgzHash = (Get-FileHash -Path $testTgz -Algorithm SHA256).Hash.ToLower()
    Record-Test 'Release Artifact Packaging' $true ('Artifact generated: ' + $testTgz)

    # Inspect manifest
    $manifest = (& tar -tzf $testTgz)
    $hasApk = $manifest | Where-Object { $_ -match '\.apk$' }
    $hasEnv = $manifest | Where-Object { $_ -match '\.env' }
    $hasPem = $manifest | Where-Object { $_ -match '\.pem' }
    $hasInstaller = $manifest | Where-Object { $_ -eq 'deploy/install-staging-release.sh' }
    $hasServer = $manifest | Where-Object { $_ -eq 'server/index.ts' }

    if (-not $hasApk -and -not $hasEnv -and -not $hasPem) {
        Record-Test 'Manifest Sensitive File Exclusion' $true 'Verified zero .apk, .env, .pem files inside archive.'
    } else {
        Record-Test 'Manifest Sensitive File Exclusion' $false 'Found sensitive or excluded files in archive.'
    }

    if ($hasInstaller -and $hasServer) {
        Record-Test 'Manifest Required File Inclusion' $true 'Verified required installer and server files are present.'
    } else {
        Record-Test 'Manifest Required File Inclusion' $false 'Missing required files in archive.'
    }

    # -------------------------------------------------------------------------
    # Test 5: Receiving-Side SHA-256 Validation Tests
    # -------------------------------------------------------------------------
    $testTgzUnix = $testTgz.Replace('\', '/')

    # 5a. Correct Hash
    $correctHashOut = Invoke-SafeCommand {
        & $bashPath $installerScript $testTgzUnix 'test-rel' $tgzHash '--verify-only'
    }
    if ($correctHashOut -match 'VERIFIED: Release archive SHA-256 matches') {
        Record-Test 'Receiving-Side Correct Hash Verification' $true 'Installer accepted and verified matching SHA-256.'
    } else {
        Record-Test 'Receiving-Side Correct Hash Verification' $false 'Installer failed on correct hash.'
    }

    # 5b. Wrong Hash Rejection
    $wrongHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    $wrongHashOut = Invoke-SafeCommand {
        & $bashPath $installerScript $testTgzUnix 'test-rel' $wrongHash '--verify-only'
    }
    if ($wrongHashOut -match 'FATAL: SHA-256 checksum mismatch') {
        Record-Test 'Receiving-Side Wrong Hash Rejection' $true 'Installer rejected mismatched hash and aborted.'
    } else {
        Record-Test 'Receiving-Side Wrong Hash Rejection' $false 'Installer did not reject wrong hash.'
    }

    # 5c. Malformed Hash Rejection
    $malformedHashOut = Invoke-SafeCommand {
        & $bashPath $installerScript $testTgzUnix 'test-rel' 'not_a_valid_hash' '--verify-only'
    }
    if ($malformedHashOut -match 'FATAL: Expected SHA-256 hash is invalid or malformed') {
        Record-Test 'Receiving-Side Malformed Hash Rejection' $true 'Installer rejected malformed hash format.'
    } else {
        Record-Test 'Receiving-Side Malformed Hash Rejection' $false 'Installer did not reject malformed hash.'
    }

    # Clean up test tgz
    Remove-Item -LiteralPath $testTgz -Force -ErrorAction SilentlyContinue
} else {
    Record-Test 'Release Artifact Packaging' $false 'No release archive was generated.'
}

# -----------------------------------------------------------------------------
# Test 6: Database Safety Validation Tests
# -----------------------------------------------------------------------------
$tempDir = Join-Path ([IO.Path]::GetTempPath()) ('orbithr-db-tests-' + (Get-Random))
$null = New-Item -ItemType Directory -Path $tempDir -Force

try {
    # 6a. Production RDS Host Rejection
    $prodEnvFile = (Join-Path $tempDir '.env.prod').Replace('\', '/')
    'DATABASE_URL=postgresql://orbit_prod:Secret123@hrms-database.c3a2m0wq8.eu-north-1.rds.amazonaws.com:5432/hrms' | Out-File $prodEnvFile -Encoding ascii
    $prodDbOut = Invoke-SafeCommand {
        & $bashPath $installerScript '--test-db' $prodEnvFile
    }
    if ($prodDbOut -match 'FATAL: Production database host detected in staging environment') {
        Record-Test 'Production RDS Database Endpoint Rejection' $true 'Rejected production RDS URL immediately.'
    } else {
        Record-Test 'Production RDS Database Endpoint Rejection' $false 'Failed to reject production RDS.'
    }

    # 6b. Arbitrary Non-Staging Host Rejection
    $arbitraryEnvFile = (Join-Path $tempDir '.env.arbitrary').Replace('\', '/')
    'DATABASE_URL=postgresql://user:pass@some-arbitrary-db.rds.amazonaws.com:5432/app' | Out-File $arbitraryEnvFile -Encoding ascii
    $arbDbOut = Invoke-SafeCommand {
        & $bashPath $installerScript '--test-db' $arbitraryEnvFile
    }
    if ($arbDbOut -match 'FATAL: Database host .* does not match expected staging identity') {
        Record-Test 'Non-Staging Database Host Rejection' $true 'Rejected non-staging database host.'
    } else {
        Record-Test 'Non-Staging Database Host Rejection' $false 'Failed to reject non-staging database host.'
    }

    # 6c. Valid Staging RDS Host Acceptance
    $stagingEnvFile = (Join-Path $tempDir '.env.staging').Replace('\', '/')
    'DATABASE_URL=postgresql://orbit_stage:SafeStagePass@hrms-database-staging.c3a2m0wq8.eu-north-1.rds.amazonaws.com:5432/hrms_staging' | Out-File $stagingEnvFile -Encoding ascii
    $stageDbOut = Invoke-SafeCommand {
        & $bashPath $installerScript '--test-db' $stagingEnvFile
    }
    if ($stageDbOut -match 'VERIFIED: Target database endpoint matches staging identity: hrms-database-staging') {
        Record-Test 'Valid Staging RDS Endpoint Acceptance' $true 'Correctly verified staging database host identity.'
    } else {
        Record-Test 'Valid Staging RDS Endpoint Acceptance' $false 'Failed to accept valid staging RDS URL.'
    }
} finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
$passedCount = ($testResults | Where-Object { $_.Passed }).Count
$totalCount = $testResults.Count
$summaryColor = 'Red'
if ($passedCount -eq $totalCount) { $summaryColor = 'Green' }
Write-Host ('Test Results: ' + $passedCount + ' / ' + $totalCount + ' Passed') -ForegroundColor $summaryColor
Write-Host '=================================================================' -ForegroundColor Cyan

return $testResults
