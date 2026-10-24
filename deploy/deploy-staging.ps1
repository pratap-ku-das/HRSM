<#
.SYNOPSIS
    Deploys OrbitHR release candidate to the isolated staging environment.

.DESCRIPTION
    Strictly isolated staging deployment script with fail-closed security guards
    preventing any accidental interaction with OrbitHR production infrastructure.
    Enforces working-tree cleanliness, archive manifest inspection, cryptographic
    SHA-256 verification on both packaging and receiving ends, and target identity assertions.

.PARAMETER StagingInstanceId
    The EC2 Instance ID of the isolated staging host (must have Name=OrbitHR-Staging
    and attached role OrbitHR-EC2-Staging-Role).
    Cannot be the production instance i-068f8f1e571bc5cc6.

.PARAMETER StagingBucket
    The staging S3 deployment bucket (default: orbithr-staging-deployments-402545554824).
    Must not contain the word 'production'.

.PARAMETER Profile
    AWS CLI profile name (default: orbithr-local).

.PARAMETER SkipBuild
    Skip running tests and building the production bundle.

.PARAMETER PackageOnly
    Build and package the release artifact with SHA-256 checksum locally; do not upload to AWS or deploy.

.PARAMETER ExpectedCommit
    Git commit hash required for deployment (default: e249b412735eaa79773d974af43e35f779b1cc4a).
#>
[CmdletBinding()]
param(
    [string]$StagingInstanceId,
    [string]$StagingBucket = 'orbithr-staging-deployments-402545554824',
    [string]$Profile = 'orbithr-local',
    [switch]$SkipBuild,
    [switch]$PackageOnly,
    [string]$ExpectedCommit = 'e249b412735eaa79773d974af43e35f779b1cc4a'
)

$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$region = 'eu-north-1'
$expectedAccountId = '402545554824'
$productionInstanceId = 'i-068f8f1e571bc5cc6'
$productionIp = '16.170.241.109'
$productionBucket = 'orbithr-production-deployments-402545554824'
$stagingRoleName = 'OrbitHR-EC2-Staging-Role'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location

# -----------------------------------------------------------------------------
# Fail-Closed Guard 1: Verify Git Commit & Working-Tree Cleanliness
# -----------------------------------------------------------------------------
Write-Host "=== OrbitHR Staging Deployment Pre-Flight Checks ===" -ForegroundColor Cyan
Set-Location -LiteralPath $repositoryRoot

$currentCommit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "FAIL-CLOSED: Unable to determine Git commit via git rev-parse HEAD."
}

if ($ExpectedCommit -and ($currentCommit -ne $ExpectedCommit)) {
    throw "FAIL-CLOSED: Commit mismatch! Expected approved candidate commit '$ExpectedCommit', got '$currentCommit'."
}
Write-Host "[PASS] Git Commit Verified: $currentCommit" -ForegroundColor Green

# Assert zero tracked modifications
& git diff-index --quiet HEAD --
if ($LASTEXITCODE -ne 0) {
    throw "FAIL-CLOSED: Working tree has uncommitted modifications in tracked files! Packaging aborted."
}
Write-Host "[PASS] Tracked working tree is clean." -ForegroundColor Green

# Assert no untracked files inside deployment payload directories
$untrackedPayloadFiles = (& git status --porcelain dist server prisma deploy public package.json package-lock.json tsconfig*.json | Where-Object { $_ -match '^\?\?' })
# Filter out deploy-staging.ps1 and install-staging-release.sh which are the staging deployment tools themselves
$untrackedPayloadFiles = $untrackedPayloadFiles | Where-Object { 
    $_ -notmatch 'deploy/deploy-staging\.ps1' -and $_ -notmatch 'deploy/install-staging-release\.sh' -and $_ -notmatch '\.test\.ts'
}
if ($untrackedPayloadFiles) {
    throw "FAIL-CLOSED: Untracked payload files detected: $($untrackedPayloadFiles -join ', '). Packaging aborted."
}
Write-Host "[PASS] Payload directories contain zero unexpected untracked files." -ForegroundColor Green

# -----------------------------------------------------------------------------
# Fail-Closed Guard 2: Parameter & Target Validation (Pre-Packaging)
# -----------------------------------------------------------------------------
if (-not $PackageOnly) {
    if (-not $StagingInstanceId) {
        throw "FAIL-CLOSED: StagingInstanceId parameter is required for deployment."
    }

    if ($StagingInstanceId -eq $productionInstanceId) {
        throw "FAIL-CLOSED: Production instance '$productionInstanceId' was provided as staging target! Aborting immediately."
    }

    if ($StagingBucket -eq $productionBucket -or $StagingBucket -like '*production*') {
        throw "FAIL-CLOSED: Production S3 bucket '$StagingBucket' targeted! Staging deployments cannot target production buckets. Aborting."
    }
}

# -----------------------------------------------------------------------------
# Build and Packaging Logic
# -----------------------------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "`nRunning test suite..." -ForegroundColor Cyan
    & npm test
    if ($LASTEXITCODE -ne 0) {
        throw "FAIL-CLOSED: Test suite execution failed. Deployment aborted."
    }
    Write-Host "[PASS] Tests passed." -ForegroundColor Green

    Write-Host "`nBuilding application bundle..." -ForegroundColor Cyan
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "FAIL-CLOSED: Application build failed. Deployment aborted."
    }
    Write-Host "[PASS] Application build successful." -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath 'dist\index.html')) {
    throw "FAIL-CLOSED: dist/index.html is missing. Run without -SkipBuild."
}

$commitShort = (& git rev-parse --short HEAD).Trim()
$releaseId = "staging-$commitShort-" + (Get-Date -Format 'yyyyMMddHHmmss')
$artifact = Join-Path ([IO.Path]::GetTempPath()) ("orbithr-$releaseId.tgz")
$uploadedKey = "deployments/staging/orbithr-$releaseId.tgz"

$parametersFile = $null
$uploadCompleted = $false

try {
    Write-Host "`nPackaging release artifact with strict security exclusions..." -ForegroundColor Cyan
    & tar -czf $artifact `
        --exclude='.env*' `
        --exclude='.git*' `
        --exclude='*.pem*' `
        --exclude='*.key*' `
        --exclude='*.p12*' `
        --exclude='*.pfx*' `
        --exclude='*backup*.sql*' `
        --exclude='*dump*.sql*' `
        --exclude='*.dump*' `
        --exclude='*.sqlite*' `
        --exclude='*.bak*' `
        --exclude='*serviceAccount*.json' `
        --exclude='storage/*' `
        --exclude='*.log' `
        --exclude='node_modules' `
        --exclude='dist/**/*.map' `
        --exclude='*.apk' `
        dist server prisma public deploy package.json package-lock.json tsconfig*.json

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $artifact)) {
        throw "FAIL-CLOSED: Release packaging failed."
    }

    $artifactSize = (Get-Item -LiteralPath $artifact).Length
    $artifactHash = (Get-FileHash -Path $artifact -Algorithm SHA256).Hash.ToLower()
    Write-Host "[PASS] Release Artifact Created: $artifact" -ForegroundColor Green
    Write-Host "       Size:   $([Math]::Round($artifactSize / 1MB, 2)) MB"
    Write-Host "       SHA256: $artifactHash" -ForegroundColor Yellow

    # -------------------------------------------------------------------------
    # Fail-Closed Guard 3: Archive Manifest Security Inspection
    # -------------------------------------------------------------------------
    Write-Host "`nInspecting archive manifest before allowing upload..." -ForegroundColor Cyan
    $manifestLines = (& tar -tzf $artifact)
    if ($LASTEXITCODE -ne 0) {
        throw "FAIL-CLOSED: Failed to read archive manifest for verification."
    }

    $prohibitedRegex = '(\.env|\.pem|\.key|\.p12|\.pfx|backup\.sql|dump\.sql|\.dump|\.sqlite|\.bak|serviceAccount|\.apk|storage/|node_modules/)'
    $prohibitedEntries = $manifestLines | Where-Object { $_ -match $prohibitedRegex }
    if ($prohibitedEntries) {
        throw "FAIL-CLOSED: Prohibited file found inside archive manifest: $($prohibitedEntries -join ', ')"
    }

    # Verify required staging installer is present in archive
    $requiredFiles = @(
        'package.json',
        'server/index.ts',
        'dist/index.html',
        'prisma/schema.prisma',
        'deploy/install-staging-release.sh'
    )
    foreach ($req in $requiredFiles) {
        if (-not ($manifestLines -contains $req)) {
            throw "FAIL-CLOSED: Required release file '$req' is missing from archive manifest."
        }
    }
    Write-Host "[PASS] Archive manifest verified clean of sensitive files and complete." -ForegroundColor Green

    if ($PackageOnly) {
        Write-Host "`n[PACKAGE-ONLY MODE] Artifact created, verified, and SHA-256 confirmed. Exiting without AWS upload." -ForegroundColor Green
        return @{
            ArtifactPath = $artifact
            ReleaseId    = $releaseId
            SHA256       = $artifactHash
            Commit       = $currentCommit
            Status       = 'VERIFIED'
        }
    }

    # -------------------------------------------------------------------------
    # AWS CLI Discovery & Execution Function
    # -------------------------------------------------------------------------
    $awsCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2\aws.exe'),
        (Join-Path $env:ProgramFiles 'Amazon\AWSCLIV2\aws.exe')
    )
    $aws = $awsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $aws) {
        throw 'FAIL-CLOSED: AWS CLI v2 is not installed or not found on standard paths.'
    }

    function Invoke-OrbitAws {
        param([Parameter(Mandatory)][string[]]$Arguments)
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $output = & $aws @Arguments --profile $Profile --region $region 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }
        if ($exitCode -ne 0) {
            throw ($output -join [Environment]::NewLine)
        }
        return $output
    }

    # -------------------------------------------------------------------------
    # Fail-Closed Guard 4: AWS Account Identity Verification
    # -------------------------------------------------------------------------
    Write-Host "`nVerifying AWS authentication..." -ForegroundColor Cyan
    $identityJson = (Invoke-OrbitAws -Arguments @('sts', 'get-caller-identity', '--output', 'json') | Out-String)
    $identity = $identityJson | ConvertFrom-Json
    if ($identity.Account -ne $expectedAccountId) {
        throw "FAIL-CLOSED: AWS profile belongs to account '$($identity.Account)', expected '$expectedAccountId'."
    }
    Write-Host "[PASS] Authenticated as $($identity.Arn) in account $expectedAccountId" -ForegroundColor Green

    # -------------------------------------------------------------------------
    # Fail-Closed Guard 5: Multi-Factor Target Identity Verification
    # -------------------------------------------------------------------------
    Write-Host "`nAsserting target instance identity and security profile..." -ForegroundColor Cyan
    $instanceDetailsJson = (Invoke-OrbitAws -Arguments @(
        'ec2', 'describe-instances',
        '--instance-ids', $StagingInstanceId,
        '--output', 'json'
    ) | Out-String)
    $instanceObj = ($instanceDetailsJson | ConvertFrom-Json).Reservations[0].Instances[0]

    # Check 1: State must be running
    if ($instanceObj.State.Name -ne 'running') {
        throw "FAIL-CLOSED: Target instance '$StagingInstanceId' is not running (state: $($instanceObj.State.Name))."
    }

    # Check 2: Name tag assertion
    $nameTag = ($instanceObj.Tags | Where-Object { $_.Key -eq 'Name' }).Value
    if ($nameTag -ne 'OrbitHR-Staging') {
        throw "FAIL-CLOSED: Target instance '$StagingInstanceId' lacks tag Name='OrbitHR-Staging' (got '$nameTag')."
    }

    # Check 3: IAM Instance Profile assertion
    $iamArn = $instanceObj.IamInstanceProfile.Arn
    if (-not $iamArn -or ($iamArn -notlike "*$stagingRoleName*")) {
        throw "FAIL-CLOSED: Target instance '$StagingInstanceId' does not have attached role '$stagingRoleName' (got '$iamArn')."
    }

    # Check 4: Public IP must not match production
    $publicIp = $instanceObj.PublicIpAddress
    if ($publicIp -and ($publicIp -eq $productionIp)) {
        throw "FAIL-CLOSED: Target instance has production public IP '$productionIp'! Aborting immediately."
    }

    Write-Host "[PASS] Target instance verified: State=running, Name=OrbitHR-Staging, Role=$stagingRoleName, IP=$publicIp" -ForegroundColor Green

    # -------------------------------------------------------------------------
    # Upload Release Artifact to Staging S3 Bucket
    # -------------------------------------------------------------------------
    Write-Host "`nUploading encrypted staging artifact to s3://$StagingBucket/$uploadedKey..." -ForegroundColor Cyan
    Invoke-OrbitAws -Arguments @(
        's3', 'cp',
        $artifact,
        ("s3://$StagingBucket/$uploadedKey"),
        '--sse', 'AES256',
        '--only-show-errors'
    ) | Out-Null
    $uploadCompleted = $true
    Write-Host "[PASS] Artifact uploaded to staging bucket." -ForegroundColor Green

    # -------------------------------------------------------------------------
    # Systems Manager Command Execution (With Safe Quoting & Remote Trap)
    # -------------------------------------------------------------------------
    $remoteArtifact = "/tmp/orbithr-$releaseId.tgz"
    $remoteInstaller = "/tmp/orbithr-install-$releaseId.sh"
    $remoteCommands = @(
        'set -euo pipefail',
        'trap ''rm -f "$remoteArtifact" "$remoteInstaller"'' EXIT',
        "remoteArtifact='$remoteArtifact'",
        "remoteInstaller='$remoteInstaller'",
        "aws s3 cp 's3://$StagingBucket/$uploadedKey' '$remoteArtifact' --region '$region' --only-show-errors",
        "tar -xOf '$remoteArtifact' deploy/install-staging-release.sh > '$remoteInstaller'",
        "chmod 700 '$remoteInstaller'",
        "'$remoteInstaller' '$remoteArtifact' '$releaseId' '$artifactHash'"
    ) -join [char]10

    $parametersFile = Join-Path ([IO.Path]::GetTempPath()) ("orbithr-staging-ssm-$releaseId.json")
    $parametersJson = @{ commands = @($remoteCommands) } | ConvertTo-Json -Depth 4
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($parametersFile, $parametersJson, $utf8WithoutBom)
    $parametersUri = 'file://' + ($parametersFile -replace '\\', '/')

    Write-Host "`nTriggering deployment via AWS Systems Manager..." -ForegroundColor Cyan
    $commandId = (Invoke-OrbitAws -Arguments @(
        'ssm', 'send-command',
        '--instance-ids', $StagingInstanceId,
        '--document-name', 'AWS-RunShellScript',
        '--comment', "Deploy OrbitHR Staging $releaseId",
        '--parameters', $parametersUri,
        '--query', 'Command.CommandId',
        '--output', 'text'
    ) | Out-String).Trim()
    Write-Host "SSM Command ID: $commandId" -ForegroundColor Yellow

    # Poll command status
    $status = 'Pending'
    for ($attempt = 1; $attempt -le 90; $attempt++) {
        Start-Sleep -Seconds 10
        try {
            $status = (Invoke-OrbitAws -Arguments @(
                'ssm', 'get-command-invocation',
                '--command-id', $commandId,
                '--instance-id', $StagingInstanceId,
                '--query', 'Status',
                '--output', 'text'
            ) | Out-String).Trim()
        } catch {
            $status = 'Pending'
        }
        Write-Host "Deployment status: $status (check $attempt/90)"
        if ($status -in @('Success', 'Failed', 'Cancelled', 'TimedOut')) {
            break
        }
    }

    if ($status -ne 'Success') {
        $remoteError = (Invoke-OrbitAws -Arguments @(
            'ssm', 'get-command-invocation',
            '--command-id', $commandId,
            '--instance-id', $StagingInstanceId,
            '--query', 'StandardErrorContent',
            '--output', 'text'
        ) | Out-String).Trim()
        if ($remoteError) {
            Write-Warning "SSM Stderr: $remoteError"
        }
        throw "FAIL-CLOSED: Staging deployment failed with status '$status'."
    }

    Write-Host "`nOrbitHR Staging $releaseId deployed successfully to $StagingInstanceId!" -ForegroundColor Green
}
finally {
    # Failure Cleanup for S3 Object
    if ($uploadCompleted -and ($status -ne 'Success') -and $aws -and (Test-Path -LiteralPath $aws)) {
        Write-Host "Cleaning up uploaded artifact from S3 on failure..." -ForegroundColor Yellow
        try {
            & $aws s3 rm ("s3://$StagingBucket/$uploadedKey") --profile $Profile --region $region --only-show-errors 2>$null | Out-Null
        } catch {
            Write-Warning "Failed to delete S3 artifact $uploadedKey on error: $_"
        }
    }

    # Ephemeral cleanup of local temporary files (retained only when caller explicitly requests PackageOnly)
    if (-not $PackageOnly -and $artifact -and (Test-Path -LiteralPath $artifact)) {
        Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
    }
    if ($parametersFile -and (Test-Path -LiteralPath $parametersFile)) {
        Remove-Item -LiteralPath $parametersFile -Force -ErrorAction SilentlyContinue
    }
    Set-Location -LiteralPath $previousLocation
}
