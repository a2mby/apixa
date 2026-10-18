#!/usr/bin/env bash
# Shared helper: build Core (+ mocking), then start an examples/* frontend package.
# Usage: run-frontend.sh <pnpm-filter> <label> [url-hint] [script=dev]
set -euo pipefail

FILTER="${1:?package filter required (e.g. @apixa/example-next)}"
LABEL="${2:-$FILTER}"
HINT="${3:-}"
SCRIPT="${4:-dev}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found." >&2
  exit 1
fi

echo "Building @apixa/core…"
pnpm --filter @apixa/core build

echo "Building @apixa/mocking…"
pnpm --filter @apixa/mocking build

echo ""
echo "Starting ${LABEL}…"
if [[ -n "${HINT}" ]]; then
  echo "Open → ${HINT}"
fi
echo ""

pnpm --filter "${FILTER}" "${SCRIPT}"
