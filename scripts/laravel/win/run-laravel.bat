@echo off
REM Start the Laravel playground directly (Windows).
setlocal EnableExtensions
call "%~dp0..\lib\run-laravel.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
