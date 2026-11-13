#!/usr/bin/env bash
# Start the React Native (Expo) example (macOS).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec "$HERE/../shared/run-frontend.sh" "@apixa/example-react-native" "React Native (Expo)" "Expo DevTools (scan QR / press i or a)" "dev"
