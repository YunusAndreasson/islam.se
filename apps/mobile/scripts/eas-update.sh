#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-runtime.js >&2
eas update "$@"

# EAS exports standalone maps into --input-dir (dist by default). Use that
# exact bundle, including for --skip-bundler. Keep --json stdout machine-readable.
input_dir=dist
while (( $# )); do
  case "$1" in
    --help|-h) exit 0 ;;
    --input-dir) shift; input_dir="$1" ;;
    --input-dir=*) input_dir="${1#*=}" ;;
    --source-maps=false|--source-maps=inline) exit 0 ;;
    --source-maps) [[ "${2:-}" != false && "${2:-}" != inline ]] || exit 0 ;;
  esac
  shift
done

if ! pnpm exec sentry-expo-upload-sourcemaps "$input_dir" >&2; then
  printf 'Update published. Retry only the Sentry upload with: pnpm exec sentry-expo-upload-sourcemaps %q\n' "$input_dir" >&2
fi
