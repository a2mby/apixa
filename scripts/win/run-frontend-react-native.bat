@echo off
REM Start the React Native (Expo) example (Windows).
setlocal EnableExtensions
call "%~dp0..\shared\run-frontend.bat" "@apixa/example-react-native" "React Native (Expo)" "Expo DevTools (scan QR / press i or a)" "dev"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
