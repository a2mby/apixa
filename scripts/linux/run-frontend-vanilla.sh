#!/usr/bin/env bash
# Start the Vanilla example (Linux).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-vanilla" "Vanilla" "http://localhost:5175" "dev"
