@echo off
setlocal
set "BUN=%AGENT_RELAY_BUN_PATH%"
if "%BUN%"=="" set "BUN=bun"
"%BUN%" --no-env-file --no-install "%~dp0..\src\cli\helper.ts" %*
exit /b %ERRORLEVEL%
