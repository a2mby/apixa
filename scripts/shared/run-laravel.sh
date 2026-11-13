#!/usr/bin/env bash
# Start the Laravel playground directly (macOS/Linux shared helper).
# Usage: run-laravel.sh [--env=<environment>]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/examples/backends/laravel-backend"
HOST="${LARAVEL_HOST:-127.0.0.1}"
PORT="${LARAVEL_PORT:-8000}"
ENV_NAME="${LARAVEL_ENV:-}"

for arg in "$@"; do
  case "$arg" in
    --env=*) ENV_NAME="${arg#--env=}" ;;
    -h|--help)
      cat <<'EOF'
Start the Apixa Laravel playground.

Environment variables:
  LARAVEL_HOST  listener host (default 127.0.0.1)
  LARAVEL_PORT  listener port (default 8000)
  LARAVEL_ENV   optional Laravel environment name (for example testing)

Examples:
  ./scripts/macos/run-laravel.sh
  LARAVEL_PORT=8010 ./scripts/linux/run-laravel.sh
  ./scripts/macos/run-laravel.sh --env=testing
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$APP/artisan" ]]; then
  echo "Laravel playground not found at $APP" >&2
  exit 1
fi

if ! command -v php >/dev/null 2>&1; then
  echo "php is required but was not found. Install PHP 8.4+ and try again." >&2
  exit 1
fi

cd "$APP"

if [[ ! -f vendor/autoload.php ]]; then
  if ! command -v composer >/dev/null 2>&1; then
    echo "composer is required to install Laravel dependencies but was not found." >&2
    exit 1
  fi
  echo "Installing Laravel dependencies…"
  composer install --no-interaction
fi

if [[ ! -f .env ]]; then
  echo "Creating .env from .env.example…"
  cp .env.example .env
  php artisan key:generate --no-interaction
  echo "Edit .env with your PostgreSQL credentials before using the database."
fi

echo ""
echo "Starting Laravel on http://${HOST}:${PORT} …"
echo "Health check: http://${HOST}:${PORT}/up — Ctrl-C stops the server."
echo ""

SERVE_ARGS=(artisan serve --host="$HOST" --port="$PORT" --no-reload)
if [[ -n "$ENV_NAME" ]]; then
  SERVE_ARGS+=(--env="$ENV_NAME")
fi

exec php "${SERVE_ARGS[@]}"
