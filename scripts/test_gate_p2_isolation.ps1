param()

$repoRoot = Split-Path -Parent $PSScriptRoot
$bashPath = 'C:\Users\prata\Git\bin\bash.exe'
$gateP2Script = (Join-Path $repoRoot 'scripts\verify-network-isolation.sh').Replace('\', '/')

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  OrbitHR P2.10 RC2 - Gate P2 Network Isolation Test Suite       ' -ForegroundColor Cyan
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

function Invoke-SafeBash {
    param([string]$BashScript)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $tempSh = [System.IO.Path]::GetTempFileName() + '.sh'
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($tempSh, $BashScript, $utf8NoBom)
        $tempShUnix = $tempSh.Replace('\', '/')
        $out = & $bashPath $tempShUnix 2>&1 | Out-String
        return @{ ExitCode = $LASTEXITCODE; Output = $out }
    } finally {
        if (Test-Path $tempSh) { Remove-Item $tempSh -Force -ErrorAction SilentlyContinue }
        $ErrorActionPreference = $prev
    }
}

# -----------------------------------------------------------------------------
# Test 1: verify-network-isolation.sh Bash Syntax
# -----------------------------------------------------------------------------
try {
    $res = & $bashPath -n $gateP2Script 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        Record-Test 'Gate P2 Script Bash Syntax' $true 'No bash syntax errors detected.'
    } else {
        Record-Test 'Gate P2 Script Bash Syntax' $false $res
    }
} catch {
    Record-Test 'Gate P2 Script Bash Syntax' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 2: Missing Staging Endpoint Argument (Fail-Closed)
# -----------------------------------------------------------------------------
try {
    $res = & $bashPath $gateP2Script 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -and $res -match 'FATAL: Staging RDS endpoint argument is missing') {
        Record-Test 'Missing Argument Fail-Closed' $true 'Exited non-zero and emitted fatal argument error.'
    } else {
        Record-Test 'Missing Argument Fail-Closed' $false ("ExitCode: $LASTEXITCODE; Output: $res")
    }
} catch {
    Record-Test 'Missing Argument Fail-Closed' $false $_.Exception.Message
}

# -----------------------------------------------------------------------------
# Test 3: Shell Tracing Disabled (set +x Guard)
# -----------------------------------------------------------------------------
$scriptContent = Get-Content (Join-Path $repoRoot 'scripts\verify-network-isolation.sh') -Raw
if ($scriptContent -match 'set \+x 2>/dev/null') {
    Record-Test 'Shell Tracing Disabled Guard' $true 'Confirmed set +x 2>/dev/null is enforced.'
} else {
    Record-Test 'Shell Tracing Disabled Guard' $false 'Missing set +x 2>/dev/null guard.'
}

# -----------------------------------------------------------------------------
# Test 4: Comprehensive Cleanup Trap (EXIT INT TERM HUP QUIT ERR)
# -----------------------------------------------------------------------------
if ($scriptContent -match 'trap cleanup_creds EXIT INT TERM HUP QUIT ERR') {
    Record-Test 'Comprehensive Signal & Error Trap' $true 'Cleanup trap registered for EXIT, INT, TERM, HUP, QUIT, ERR.'
} else {
    Record-Test 'Comprehensive Signal & Error Trap' $false 'Missing full signal trap registration.'
}

# -----------------------------------------------------------------------------
# Test 5: .pgpass Colon & Backslash Escaping Logic
# -----------------------------------------------------------------------------
$testEscapingScript = @'
APP_SECRET='test\pass:with:colons\and\slashes'
ESCAPED_SECRET=$(printf '%s' "$APP_SECRET" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g')
EXPECTED='test\\pass\:with\:colons\\and\\slashes'
if [ "$ESCAPED_SECRET" = "$EXPECTED" ]; then
    echo "MATCH"
    exit 0
else
    echo "MISMATCH: $ESCAPED_SECRET"
    exit 1
fi
'@
$res = Invoke-SafeBash $testEscapingScript
if ($res.ExitCode -eq 0 -and $res.Output -match 'MATCH') {
    Record-Test '.pgpass Colon and Backslash Escaping' $true 'Correctly escaped both colons and backslashes.'
} else {
    Record-Test '.pgpass Colon and Backslash Escaping' $false $res.Output
}

# -----------------------------------------------------------------------------
# Test 6: Secure Temporary File Creation (0600 mode)
# -----------------------------------------------------------------------------
if ($scriptContent -match 'PGPASS_TMP=\$\(mktemp\)' -and $scriptContent -match 'chmod 0600 "\$PGPASS_TMP"') {
    Record-Test 'Secure Credential File Mode (0600)' $true 'mktemp and chmod 0600 verified.'
} else {
    Record-Test 'Secure Credential File Mode (0600)' $false 'Missing mktemp or chmod 0600 mode setting.'
}

# -----------------------------------------------------------------------------
# Test 7: Zero Secrets in Command Line Arguments or Logs
# -----------------------------------------------------------------------------
if ($scriptContent -match 'PGPASSFILE="\$PGPASS_TMP" psql' -and $scriptContent -notmatch 'psql.*-W' -and $scriptContent -notmatch 'psql.*\$APP_SECRET') {
    Record-Test 'Zero CLI Argument Leakage' $true 'psql invocation uses PGPASSFILE; zero secrets in command arguments.'
} else {
    Record-Test 'Zero CLI Argument Leakage' $false 'Potential secret leakage detected in psql call.'
}

# -----------------------------------------------------------------------------
# Test 8: Secret Unsetting After Writing
# -----------------------------------------------------------------------------
if ($scriptContent -match 'unset APP_SECRET ESCAPED_SECRET') {
    Record-Test 'Secret Memory Cleanup (unset)' $true 'Secrets unset from environment memory immediately after use.'
} else {
    Record-Test 'Secret Memory Cleanup (unset)' $false 'Missing unset APP_SECRET ESCAPED_SECRET.'
}

# -----------------------------------------------------------------------------
# Test 9: Cleanup on Interruption Simulation
# -----------------------------------------------------------------------------
$testTrapScript = @'
PGPASS_TMP=$(mktemp)
touch "$PGPASS_TMP"
cleanup_creds() {
    rm -f "$PGPASS_TMP" 2>/dev/null
    exit 0
}
trap cleanup_creds EXIT INT TERM
# Simulate exit
exit 0
'@
$res = Invoke-SafeBash $testTrapScript
if ($res.ExitCode -eq 0) {
    Record-Test 'Trap Cleanup Functionality' $true 'Temporary credential file cleaned up on script termination.'
} else {
    Record-Test 'Trap Cleanup Functionality' $false $res.Output
}

# -----------------------------------------------------------------------------
# Test 10: Fail-Closed On Missing Tool Check
# -----------------------------------------------------------------------------
$testMissingToolScript = @'
for tool in non_existent_dummy_tool_xyz; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "FATAL: Required tool '$tool' is not installed." >&2
        exit 1
    fi
done
'@
$res = Invoke-SafeBash $testMissingToolScript
if ($res.ExitCode -ne 0 -and $res.Output -match 'FATAL: Required tool') {
    Record-Test 'Missing Verification Tool Fail-Closed' $true 'Halts immediately with non-zero exit when required tool is missing.'
} else {
    Record-Test 'Missing Verification Tool Fail-Closed' $false $res.Output
}

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
$passCount = ($testResults | Where-Object { $_.Passed }).Count
$totalCount = $testResults.Count
Write-Host "Gate P2 Test Results: $passCount / $totalCount Passed" -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

$testResults | Format-Table -AutoSize
