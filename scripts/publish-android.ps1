[CmdletBinding()]
param(
    [int]$VersionCode = 0,
    [string]$VersionName = "",
    [switch]$Force,
    [switch]$NoCommit,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$androidDir = Join-Path $repoRoot "android-app"
$appGradle = Join-Path $androidDir "app\build.gradle.kts"
$releaseApk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
$publicApk = Join-Path $repoRoot "public\downloads\OrbitHR.apk"
$keystoreProperties = Join-Path $androidDir "keystore.properties"
$expectedCertificate = "5424c389fc525ade2347a70c9b63dfabc5064d30676a78f6c14645527fdf1e4b"

# Automatically resolve JAVA_HOME if not configured
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath $env:JAVA_HOME)) {
    $candidateJavas = @(
        'D:\Program Files\Android Studio\jbr',
        'C:\Program Files\Android\Android Studio\jbr',
        'C:\Program Files\Java\jdk-21',
        'C:\Program Files\Java\jdk-17'
    )
    foreach ($cand in $candidateJavas) {
        if (Test-Path -LiteralPath $cand) {
            $env:JAVA_HOME = $cand
            $env:PATH = (Join-Path $cand 'bin') + ';' + $env:PATH
            break
        }
    }
}

# Automatically resolve ANDROID_HOME if not configured
if (-not $env:ANDROID_HOME -or -not (Test-Path -LiteralPath $env:ANDROID_HOME)) {
    $candidateSdks = @(
        (Join-Path $repoRoot ".toolchains\android-sdk"),
        (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
        'C:\Android\Sdk'
    )
    foreach ($cand in $candidateSdks) {
        if (Test-Path -LiteralPath $cand) {
            $env:ANDROID_HOME = $cand
            break
        }
    }
}

function Assert-LastExitCode([string]$message) {
    if ($LASTEXITCODE -ne 0) { throw $message }
}

if (-not (Test-Path -LiteralPath $keystoreProperties)) { throw "Missing signing configuration: $keystoreProperties" }
$signingProperties = ConvertFrom-StringData ([IO.File]::ReadAllText($keystoreProperties))
$configuredKeystore = $signingProperties['RELEASE_STORE_FILE']
if ([string]::IsNullOrWhiteSpace($configuredKeystore)) {
    throw "RELEASE_STORE_FILE is missing from $keystoreProperties"
}
$keystore = Join-Path $androidDir $configuredKeystore
if (-not (Test-Path -LiteralPath $keystore)) { throw "Missing permanent signing key: $keystore" }

Push-Location $repoRoot
try {
    & git diff --quiet -- android-app
    $androidChanged = $LASTEXITCODE -ne 0
    & git diff --cached --quiet -- android-app
    $androidStaged = $LASTEXITCODE -ne 0
    if (-not $Force -and -not $androidChanged -and -not $androidStaged) {
        throw "No Android source changes detected. Use -Force only when intentionally republishing."
    }

    $gradleText = [IO.File]::ReadAllText($appGradle)
    $codeMatch = [regex]::Match($gradleText, 'versionCode\s*=\s*providers[^\r\n]*\?:\s*(\d+)')
    $nameMatch = [regex]::Match($gradleText, 'versionName\s*=\s*providers[^\r\n]*\?:\s*"([^"]+)"')
    if (-not $codeMatch.Success -or -not $nameMatch.Success) { throw "Could not read the default app version from build.gradle.kts" }

    $currentCode = [int]$codeMatch.Groups[1].Value
    $currentName = $nameMatch.Groups[1].Value
    if ($VersionCode -le 0) { $VersionCode = $currentCode + 1 }
    if ([string]::IsNullOrWhiteSpace($VersionName)) {
        $semantic = [regex]::Match($currentName, '^(\d+)\.(\d+)\.(\d+)$')
        if (-not $semantic.Success) { throw "Current version '$currentName' is not semantic versioning. Pass -VersionName explicitly." }
        $VersionName = "{0}.{1}.{2}" -f $semantic.Groups[1].Value, $semantic.Groups[2].Value, ([int]$semantic.Groups[3].Value + 1)
    }
    if ($VersionCode -lt $currentCode) { throw "VersionCode must not be lower than the current value $currentCode" }

    $updated = [regex]::Replace($gradleText, '(versionCode\s*=\s*providers[^\r\n]*\?:\s*)\d+', "`${1}$VersionCode", 1)
    $updated = [regex]::Replace($updated, '(versionName\s*=\s*providers[^\r\n]*\?:\s*)"[^"]+"', "`${1}`"$VersionName`"", 1)
    [IO.File]::WriteAllText($appGradle, $updated, (New-Object Text.UTF8Encoding($false)))

    $mobileReleaseFile = Join-Path $repoRoot "server\v1\mobileRelease.ts"
    if (Test-Path -LiteralPath $mobileReleaseFile) {
        $mrContent = [IO.File]::ReadAllText($mobileReleaseFile)
        $mrContent = [regex]::Replace($mrContent, 'versionCode:\s*\d+', "versionCode: $VersionCode")
        $mrContent = [regex]::Replace($mrContent, 'versionName:\s*"[^"]+"', "versionName: `"$VersionName`"")
        $todayStr = (Get-Date -Format 'yyyy-MM-dd')
        $mrContent = [regex]::Replace($mrContent, 'publishedAt:\s*"[^"]+"', "publishedAt: `"$todayStr`"")
        [IO.File]::WriteAllText($mobileReleaseFile, $mrContent, (New-Object Text.UTF8Encoding($false)))
    }

    $sdkRoot = $env:ANDROID_HOME
    if (-not $sdkRoot -or -not (Test-Path -LiteralPath $sdkRoot)) { throw "Android SDK not found. Install it or set ANDROID_HOME." }
    $buildTools = Get-ChildItem (Join-Path $sdkRoot "build-tools") -Directory | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $buildTools) { throw "Android SDK build-tools are missing." }
    $apkSigner = Join-Path $buildTools.FullName "apksigner.bat"
    $aapt = Join-Path $buildTools.FullName "aapt.exe"

    Push-Location $androidDir
    try {
        & .\gradlew.bat :app:testDebugUnitTest :app:assembleRelease --console=plain --no-daemon --max-workers=2
        Assert-LastExitCode "Android release build failed."
    } finally {
        Pop-Location
    }

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $signature = (& $apkSigner verify --verbose --print-certs $releaseApk 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $prevPref
    }
    Assert-LastExitCode "APK signature verification failed."
    if (-not $signature.ToLowerInvariant().Contains("certificate sha-256 digest: $expectedCertificate")) {
        throw "Refusing to publish: APK is not signed by the permanent BalajiOne certificate."
    }

    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $badging = (& $aapt dump badging $releaseApk 2>&1 | Out-String)
    } finally {
        $ErrorActionPreference = $prevPref
    }
    Assert-LastExitCode "Could not inspect APK metadata."
    if (-not $badging.Contains("versionCode='$VersionCode'") -or -not $badging.Contains("versionName='$VersionName'")) {
        throw "Built APK version does not match $VersionName ($VersionCode)."
    }

    Copy-Item -LiteralPath $releaseApk -Destination $publicApk -Force
    $hash = (Get-FileHash -LiteralPath $publicApk -Algorithm SHA256).Hash
    Write-Host "Verified OrbitHR $VersionName ($VersionCode)"
    Write-Host "Signer: BalajiOne Enterprises"
    Write-Host "SHA256: $hash"

    if (-not $NoCommit) {
        & git add -- android-app public/downloads/OrbitHR.apk
        Assert-LastExitCode "Could not stage Android release files."
        & git diff --cached --quiet
        if ($LASTEXITCODE -ne 0) {
            & git commit -m "Publish OrbitHR Android $VersionName ($VersionCode) [skip ci]"
            Assert-LastExitCode "Could not commit Android release."
        }
    }
    if (-not $NoPush) {
        if ($NoCommit) { throw "-NoCommit cannot be combined with an automatic push." }
        & git push origin main
        Assert-LastExitCode "Could not push Android release."
    }
} finally {
    Pop-Location
}
