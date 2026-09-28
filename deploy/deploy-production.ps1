[CmdletBinding()]
param(
    [string]$Profile = 'orbithr-local',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$region = 'eu-north-1'
$accountId = '402545554824'
$bucket = 'orbithr-production-deployments-402545554824'
$instanceId = 'i-068f8f1e571bc5cc6'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$previousLocation = Get-Location

$awsCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Amazon\AWSCLIV2\aws.exe'),
    (Join-Path $env:ProgramFiles 'Amazon\AWSCLIV2\aws.exe')
)
$aws = $awsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $aws) {
    throw 'AWS CLI v2 is not installed.'
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

$artifact = $null
$parametersFile = $null
$uploadedKey = $null

try {
    Set-Location -LiteralPath $repositoryRoot

    Write-Host 'Checking AWS login...'
    $identity = (Invoke-OrbitAws -Arguments @(
        'sts', 'get-caller-identity', '--output', 'json'
    ) | Out-String | ConvertFrom-Json)
    if ($identity.Account -ne $accountId) {
        throw ('AWS profile belongs to account ' + $identity.Account + ', expected ' + $accountId + '.')
    }
    Write-Host ('Authenticated as ' + $identity.Arn)

    if (-not $SkipBuild) {
        Write-Host 'Running tests...'
        & npm test
        if ($LASTEXITCODE -ne 0) {
            throw 'Tests failed. Deployment stopped.'
        }

        Write-Host 'Building production application...'
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'Production build failed. Deployment stopped.'
        }
    }

    if (-not (Test-Path -LiteralPath 'dist\index.html')) {
        throw 'dist/index.html is missing. Run without -SkipBuild.'
    }

    $commit = (& git rev-parse --short HEAD).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to determine the Git commit.'
    }
    $releaseId = $commit + '-' + (Get-Date -Format 'yyyyMMddHHmmss')
    $artifact = Join-Path ([IO.Path]::GetTempPath()) ('orbithr-' + $releaseId + '.tgz')
    $uploadedKey = 'deployments/local/orbithr-' + $releaseId + '.tgz'

    Write-Host ('Packaging release ' + $releaseId + '...')
    & tar -czf $artifact dist server prisma public deploy package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $artifact)) {
        throw 'Release packaging failed.'
    }

    Write-Host 'Uploading encrypted release to S3...'
    Invoke-OrbitAws -Arguments @(
        's3', 'cp',
        $artifact,
        ('s3://' + $bucket + '/' + $uploadedKey),
        '--sse', 'AES256',
        '--only-show-errors'
    ) | Out-Null

    $remoteArtifact = '/tmp/orbithr-' + $releaseId + '.tgz'
    $remoteInstaller = '/tmp/orbithr-install-' + $releaseId + '.sh'
    $remoteCommands = @(
        'set -euo pipefail',
        ('aws s3 cp s3://' + $bucket + '/' + $uploadedKey + ' ' + $remoteArtifact + ' --region ' + $region + ' --only-show-errors'),
        ('tar -xOf ' + $remoteArtifact + ' deploy/install-ec2-release.sh > ' + $remoteInstaller),
        ('chmod 700 ' + $remoteInstaller),
        ($remoteInstaller + ' ' + $remoteArtifact + ' ' + $releaseId),
        ('rm -f ' + $remoteArtifact + ' ' + $remoteInstaller)
    ) -join [char]10

    $parametersFile = Join-Path ([IO.Path]::GetTempPath()) ('orbithr-ssm-' + $releaseId + '.json')
    $parametersJson = @{ commands = @($remoteCommands) } | ConvertTo-Json -Depth 4
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($parametersFile, $parametersJson, $utf8WithoutBom)
    $parametersUri = 'file://' + ($parametersFile -replace '\\', '/')

    Write-Host 'Starting deployment through Systems Manager...'
    $commandId = (Invoke-OrbitAws -Arguments @(
        'ssm', 'send-command',
        '--instance-ids', $instanceId,
        '--document-name', 'AWS-RunShellScript',
        '--comment', ('Deploy OrbitHR ' + $releaseId),
        '--parameters', $parametersUri,
        '--query', 'Command.CommandId',
        '--output', 'text'
    ) | Out-String).Trim()
    Write-Host ('SSM command: ' + $commandId)

    $status = 'Pending'
    for ($attempt = 1; $attempt -le 90; $attempt++) {
        Start-Sleep -Seconds 10
        try {
            $status = (Invoke-OrbitAws -Arguments @(
                'ssm', 'get-command-invocation',
                '--command-id', $commandId,
                '--instance-id', $instanceId,
                '--query', 'Status',
                '--output', 'text'
            ) | Out-String).Trim()
        } catch {
            $status = 'Pending'
        }
        Write-Host ('Deployment status: ' + $status)
        if ($status -in @('Success', 'Failed', 'Cancelled', 'TimedOut')) {
            break
        }
    }

    if ($status -ne 'Success') {
        $remoteError = (Invoke-OrbitAws -Arguments @(
            'ssm', 'get-command-invocation',
            '--command-id', $commandId,
            '--instance-id', $instanceId,
            '--query', 'StandardErrorContent',
            '--output', 'text'
        ) | Out-String).Trim()
        if ($remoteError) {
            Write-Warning $remoteError
        }
        throw ('Deployment failed with status ' + $status + '.')
    }

    Write-Host ('OrbitHR ' + $releaseId + ' deployed successfully.') -ForegroundColor Green
}
finally {
    if ($uploadedKey) {
        & $aws s3 rm ('s3://' + $bucket + '/' + $uploadedKey) --profile $Profile --region $region --only-show-errors 2>$null | Out-Null
    }
    foreach ($temporaryFile in @($artifact, $parametersFile)) {
        if ($temporaryFile -and (Test-Path -LiteralPath $temporaryFile)) {
            Remove-Item -LiteralPath $temporaryFile -Force
        }
    }
    Set-Location -LiteralPath $previousLocation
}
