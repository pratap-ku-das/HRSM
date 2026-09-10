@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-android.ps1" %*
exit /b %ERRORLEVEL%
