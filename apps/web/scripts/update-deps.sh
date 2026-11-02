#!/usr/bin/env bash
# Update only this website, retaining the compatibility ranges in package.json.
# Usage: pnpm deps:update             Update and validate (--apply).
#        pnpm deps:check              Report outdated packages without changes (default).
# pnpm deps:check exits 1 when updates exist (pnpm outdated's standard behavior).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$APP_DIR/../.." && pwd)"
cd "$APP_DIR"

case "${1:-}" in
  ''|--check)
    [ "$#" -le 1 ] || { echo 'Only --check is supported.' >&2; exit 2; }
    exec pnpm outdated
    ;;
  --apply)
    [ "$#" -eq 1 ] || { echo 'Only --apply is supported.' >&2; exit 2; }
    ;;
  -h|--help)
    sed -n '2,5s/^# //p' "$0"
    exit 0
    ;;
  *) echo "Unknown argument: $1 (try --help)" >&2; exit 2 ;;
esac

trap 'echo "Dependency update or validation failed. Review package.json and the workspace pnpm-lock.yaml; changes have been kept for diagnosis." >&2' ERR

# Do not use --latest: it crosses compatibility boundaries, including 0.x ranges.
# Keep workspace release-age and build-script policies intact and run
# noninteractively instead of approving unexpected prompts.
echo 'Updating website dependencies within their declared version ranges…'
pnpm --filter @islam-se/web --fail-if-no-match update --depth 0 --yes

echo 'Checking website peer dependency compatibility…'
pnpm --filter @islam-se/web --fail-if-no-match peers check

echo 'Checking Astro and TypeScript…'
pnpm run check

echo 'Running website unit tests…'
pnpm --dir "$WORKSPACE_DIR" exec vitest run --project web

# The sample build exercises the site pipeline without generating every city's
# prayer calendar. A deployment still requires the normal full build.
echo 'Building the website with sampled prayer calendars…'
pnpm run build:fast

echo 'Update validated. Review package.json and the workspace pnpm-lock.yaml before committing.'
