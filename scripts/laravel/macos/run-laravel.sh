#!/usr/bin/env bash
# Start the Laravel playground directly (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../lib/run-laravel.sh" "$@"
