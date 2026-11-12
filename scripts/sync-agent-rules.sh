#!/bin/sh
# Compatibility entry point. Repository-local only; no user prompt installation.
set -eu
cd "$(dirname "$0")/.."
exec node .ai/scripts/sync.mjs "$@"
