@echo off
REM Start the React + Vite example (Windows).
setlocal EnableExtensions
call "%~dp0..\shared\run-frontend.bat" "@apixa/example-react-vite" "React + Vite" "http://localhost:5173" "dev"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
