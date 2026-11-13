@echo off
REM Shared helper: build Core (+ mocking), then start an examples/* frontend package.
REM Usage: run-frontend.bat <pnpm-filter> <label> [url-hint] [script]
setlocal EnableExtensions

if "%~1"=="" (
  echo Package filter required ^(e.g. @apixa/example-next^)
  exit /b 1
)

set "FILTER=%~1"
set "LABEL=%~2"
if "%LABEL%"=="" set "LABEL=%FILTER%"
set "HINT=%~3"
set "SCRIPT=%~4"
if "%SCRIPT%"=="" set "SCRIPT=dev"

set "ROOT=%~dp0..\.."
cd /d "%ROOT%" || (
  echo Could not enter repo root: %ROOT%
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm is required but was not found.
  exit /b 1
)

echo Building @apixa/core...
call pnpm --filter @apixa/core build
if errorlevel 1 exit /b 1

echo Building @apixa/mocking...
call pnpm --filter @apixa/mocking build
if errorlevel 1 exit /b 1

echo.
echo Starting %LABEL%...
if not "%HINT%"=="" echo Open -^> %HINT%
echo.

call pnpm --filter "%FILTER%" "%SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
