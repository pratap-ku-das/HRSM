[CmdletBinding()]
param()

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  OrbitHR - Operator MFA Activation (Secure Local Prompt)       " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "CRITICAL:" -ForegroundColor Magenta
Write-Host "1. Check Google Authenticator for the entry: 'orbithr-staging-operator-mfa'" -ForegroundColor Yellow
Write-Host "   (Do NOT use the 'pratapdas78488@gmail.com' / root entry!)" -ForegroundColor Red
Write-Host "2. If you have not scanned 'operator_mfa_qr.png' yet, open this file and scan it:" -ForegroundColor Yellow
Write-Host "   C:\Users\prata\Downloads\operator_mfa_qr.png" -ForegroundColor White
Write-Host ""

$code1 = (Read-Host -Prompt "Enter the 6-digit code currently displayed for 'orbithr-staging-operator-mfa'").Trim()

Write-Host ""
Write-Host "Now WATCH your Google Authenticator timer ring..." -ForegroundColor Cyan
Write-Host "Wait until the code CHANGES to a NEW 6-digit number." -ForegroundColor Yellow
Write-Host ""

$code2 = (Read-Host -Prompt "Enter the NEW consecutive 6-digit code").Trim()

if ($code1 -notmatch '^\d{6}$' -or $code2 -notmatch '^\d{6}$') {
    Write-Host "[ERROR] Both codes must be exactly 6 numeric digits (e.g. 123456)." -ForegroundColor Red
    exit 1
}

if ($code1 -eq $code2) {
    Write-Host "[ERROR] Code 1 and Code 2 are identical! You must wait for the next 30-second cycle so the code changes." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Submitting MFA activation to AWS..." -ForegroundColor Cyan
& aws iam enable-mfa-device `
    --user-name orbithr-staging-operator `
    --serial-number arn:aws:iam::402545554824:mfa/orbithr-staging-operator-mfa `
    --authentication-code1 $code1 `
    --authentication-code2 $code2 `
    --profile orbithr-local

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] MFA device successfully activated for orbithr-staging-operator!" -ForegroundColor Green
    if (Test-Path "$HOME\Downloads\operator_mfa_qr.png") {
        Remove-Item "$HOME\Downloads\operator_mfa_qr.png" -Force
        Write-Host "[CLEANUP] Deleted temporary QR image: $HOME\Downloads\operator_mfa_qr.png" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "[ERROR] AWS rejected the codes (InvalidAuthenticationCode)." -ForegroundColor Red
    Write-Host "Please verify:" -ForegroundColor Yellow
    Write-Host "  a) You scanned 'C:\Users\prata\Downloads\operator_mfa_qr.png'." -ForegroundColor Yellow
    Write-Host "  b) You read the code from 'orbithr-staging-operator-mfa' (not pratapdas78488@gmail.com)." -ForegroundColor Yellow
    Write-Host "  c) Your phone clock is synchronized." -ForegroundColor Yellow
    exit $LASTEXITCODE
}
