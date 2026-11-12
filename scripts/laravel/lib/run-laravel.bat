@echo off
REM Start the Laravel playground directly (Windows shared helper).
setlocal EnableExtensions

set "ROOT=%~dp0..\..\.."
set "APP=%ROOT%\examples\backends\laravel-backend"

if not defined LARAVEL_HOST set "LARAVEL_HOST=127.0.0.1"
if not defined LARAVEL_PORT set "LARAVEL_PORT=8000"

if not exist "%APP%\artisan" (
  echo Laravel playground not found at "%APP%" 1>&2
  exit /b 1
)

where php >nul 2>nul
if errorlevel 1 (
  echo php is required but was not found. Install PHP 8.4+ and try again. 1>&2
  exit /b 1
)

pushd "%APP%"

if not exist "vendor\autoload.php" (
  where composer >nul 2>nul
  if errorlevel 1 (
    echo composer is required to install Laravel dependencies but was not found. 1>&2
    popd
    exit /b 1
  )
  echo Installing Laravel dependencies...
  call composer install --no-interaction
  if errorlevel 1 (
    popd
    exit /b 1
  )
)

if not exist ".env" (
  echo Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
  call php artisan key:generate --no-interaction
  echo Edit .env with your PostgreSQL credentials before using the database.
)

echo.
echo Starting Laravel on http://%LARAVEL_HOST%:%LARAVEL_PORT% ...
echo Health check: http://%LARAVEL_HOST%:%LARAVEL_PORT%/up - Ctrl-C stops the server.
echo.

if defined LARAVEL_ENV (
  call php artisan serve --host=%LARAVEL_HOST% --port=%LARAVEL_PORT% --no-reload --env=%LARAVEL_ENV%
) else (
  call php artisan serve --host=%LARAVEL_HOST% --port=%LARAVEL_PORT% --no-reload
)
set "EXIT_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %EXIT_CODE%
