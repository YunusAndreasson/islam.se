#!/usr/bin/env bash
# One entry point for production app releases.
set -euo pipefail
cd "$(dirname "$0")"

exec ./scripts/eas-release.sh "$@"
