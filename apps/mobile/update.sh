#!/usr/bin/env bash
# One entry point for routine dependency maintenance in this app.
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-}" in
  "")       exec pnpm deps:update ;;
  --check)  exec pnpm deps:check ;;
  --latest) exec pnpm deps:update:latest ;;
  -h|--help)
    echo "Usage: ./update.sh [--check|--latest]"
    ;;
  *)
    echo "error: unknown argument '$1' (try --help)" >&2
    exit 1
    ;;
esac
