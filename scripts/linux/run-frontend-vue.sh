#!/usr/bin/env bash
# Start the Vue example (Linux).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-vue" "Vue" "http://localhost:5174" "dev"
