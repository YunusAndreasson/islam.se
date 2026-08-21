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

echo "▸ [1/6] Checking Expo SDK compatibility…"
npx expo install --check --pnpm || true

echo
echo "▸ [2/6] Checking for outdated dependencies…"
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
  echo "▸ [3/6] Updating direct dependencies to their latest releases…"
  pnpm update --latest ${PATCH_EXCLUDES[@]+"${PATCH_EXCLUDES[@]}"}
else
  echo "▸ [3/6] Updating dependencies within package.json semver ranges…"
  pnpm update ${PATCH_EXCLUDES[@]+"${PATCH_EXCLUDES[@]}"}
fi

echo
echo "▸ [4/6] Re-pinning Expo-managed packages to SDK-compatible versions…"
npx expo install --fix --pnpm

echo
echo "▸ [5/6] Collapsing duplicate minimumReleaseAgeExclude entries…"
# pnpm 11 appends every freshly approved version to minimumReleaseAgeExclude without
# looking at what is already there, so a package that has been exempted before ends up
# listed twice. Its matcher (evaluateVersionPolicy) returns on the FIRST rule whose name
# matches, so the stale entry shadows the new one and the very next `pnpm install` fails
# the lockfile supply-chain check for a version this file plainly exempts. Keep one entry
# per package — the highest version — so the list stays effective.
node <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");
const path = "pnpm-workspace.yaml";
const lines = readFileSync(path, "utf8").split("\n");
const start = lines.findIndex((line) => line.startsWith("minimumReleaseAgeExclude:"));
if (start === -1) process.exit(0);
let end = start + 1;
while (end < lines.length && /^\s+-\s/.test(lines[end])) end++;
const isHigher = (a, b) => {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0);
  }
  return false;
};
const order = [];
const best = new Map();
for (const line of lines.slice(start + 1, end)) {
  const entry = line.replace(/^\s*-\s*/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
  const at = entry.lastIndexOf("@");
  const name = entry.slice(0, at);
  const version = entry.slice(at + 1);
  if (!best.has(name)) {
    order.push(name);
    best.set(name, version);
  } else if (isHigher(version, best.get(name))) {
    best.set(name, version);
  }
}
const dropped = end - start - 1 - order.length;
if (dropped === 0) {
  console.log("  Nothing shadowed — list already has one entry per package.");
  process.exit(0);
}
const kept = order.map((name) => {
  const entry = name + "@" + best.get(name);
  return "  - " + (name.startsWith("@") ? "'" + entry + "'" : entry);
});
writeFileSync(path, [...lines.slice(0, start + 1), ...kept, ...lines.slice(end)].join("\n"));
console.log("  Dropped " + dropped + " shadowed " + (dropped === 1 ? "entry" : "entries") + ".");
NODE

echo
echo "▸ [6/6] Validating the installed dependency tree…"
npx expo-doctor || true

echo
echo "▸ Done. Review package.json and pnpm-lock.yaml before committing."
