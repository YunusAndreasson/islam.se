#!/usr/bin/env bash
# Keep this standalone pnpm/Expo app current while preserving patched packages.
#
# Usage:
#   pnpm deps:check          # report only (default)
#   pnpm deps:update         # update within declared semver ranges
#   pnpm deps:update:latest  # cross major versions, then re-pin Expo packages
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APPLY=0
LATEST=0

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --latest) LATEST=1 ;;
    --) ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument '$arg' (try --help)" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

echo "▸ [1/5] Checking Expo SDK compatibility…"
npx expo install --check --pnpm || true

echo
echo "▸ [2/5] Checking for outdated dependencies…"
pnpm outdated || true

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "▸ Dry run complete — nothing was changed."
  echo "  Run pnpm deps:update (or deps:update:latest to cross majors)."
  exit 0
fi

PATCH_EXCLUDES=("!expo")
while IFS= read -r pkg; do
  [ -n "$pkg" ] && PATCH_EXCLUDES+=("!$pkg")
done < <(awk '
  /^[^[:space:]#]/ { inblock = ($0 ~ /^patchedDependencies:/) ? 1 : 0 }
  inblock && /^[[:space:]]+[^[:space:]#]/ {
    key = $0
    sub(/^[[:space:]]+/, "", key)
    sub(/:.*$/, "", key)
    sub(/@[^@]*$/, "", key)
    if (key != "") print key
  }
' pnpm-workspace.yaml)

echo
echo "  Preserving the installed Expo SDK and patched dependencies: ${PATCH_EXCLUDES[*]}"
if [ "$LATEST" -eq 1 ]; then
  echo "▸ [3/5] Updating direct dependencies to their latest releases…"
  pnpm update --latest ${PATCH_EXCLUDES[@]+"${PATCH_EXCLUDES[@]}"}
else
  echo "▸ [3/5] Updating dependencies within package.json semver ranges…"
  pnpm update ${PATCH_EXCLUDES[@]+"${PATCH_EXCLUDES[@]}"}
fi

echo
echo "▸ [4/5] Re-pinning Expo-managed packages to SDK-compatible versions…"
npx expo install --fix --pnpm

echo
echo "▸ [5/5] Validating the installed dependency tree…"
npx expo-doctor || true

echo
echo "▸ Done. Review package.json and pnpm-lock.yaml before committing."
