#!/usr/bin/env bash
# Start the Node CLI (basic) example (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-basic" "Node CLI (basic)" "stdout" "start"
