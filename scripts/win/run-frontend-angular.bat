@echo off
REM Start the Angular example (Windows).
setlocal EnableExtensions
call "%~dp0..\shared\run-frontend.bat" "@apixa/example-angular" "Angular" "http://localhost:4200" "dev"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
