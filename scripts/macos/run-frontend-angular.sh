#!/usr/bin/env bash
# Start the Angular example (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-angular" "Angular" "http://localhost:4200" "dev"
