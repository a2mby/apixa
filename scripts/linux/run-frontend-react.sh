#!/usr/bin/env bash
# Start the React + Vite example (Linux).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-react-vite" "React + Vite" "http://localhost:5173" "dev"
