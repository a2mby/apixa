@echo off
REM Start the Node CLI (basic) example (Windows).
setlocal EnableExtensions
call "%~dp0..\shared\run-frontend.bat" "@apixa/example-basic" "Node CLI (basic)" "stdout" "start"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
