#!/usr/bin/env bash
# Start the Next.js example (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-next" "Next.js" "http://localhost:3000" "dev"
