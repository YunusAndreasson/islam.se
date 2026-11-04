#!/usr/bin/env bash
# Update every dependency in the pnpm workspace to its latest release.
#
#   pnpm deps:update              update, then lint + typecheck + test
#   pnpm deps:update --dry-run    only list what is outdated
#   pnpm deps:update --build      also build every package, web to dist-check
#   pnpm deps:update --no-check   update only, skip the checks
#   pnpm deps:update --allow-dirty  run even if package.json/lockfile have local edits
#
# Scope is the workspace (packages/*, apps/*). apps/mobile is its own Expo root
# with its own `deps:update`; its versions follow the Expo SDK, so it is left alone.
#
# One package is held at its current major, because `--latest` would break it:
#   typescript  apps/web's `astro check` needs the TS 5/6 programmatic API that the
#               native TS 7 compiler does not ship (@astrojs/check peers ^5 || ^6).
# It still gets in-range updates. The script checks the peer range on every run
# and says when the cap can be lifted. (marked was capped too until marked-terminal
# 8.0.0 widened its peer to marked <19, 2026-11-04.)
set -euo pipefail

cd "$(dirname "$0")"

dry_run=false check=true build=false allow_dirty=false
for arg in "$@"; do
	case "$arg" in
	--dry-run) dry_run=true ;;
	--no-check) check=false ;;
	--build) build=true ;;
	--allow-dirty) allow_dirty=true ;;
	-h | --help)
		sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
	*)
		echo "unknown option: $arg (see --help)" >&2
		exit 2
		;;
	esac
done

# capped package → the package whose peer range holds it back
declare -A caps=([typescript]=@astrojs/check)

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

# True when the gatekeeper's latest release accepts the capped package's latest.
cap_can_lift() {
	local pkg=$1 gate=$2 latest range
	latest=$(pnpm view "$pkg" version)
	range=$(pnpm view "$gate@latest" "peerDependencies.$pkg")
	[[ -n $range ]] || return 0
	local matching
	matching=$(pnpm view "$pkg@$range" version --json 2>/dev/null || true)
	[[ $matching == *"\"$latest\""* ]]
}

step "Outdated in the workspace"
pnpm outdated -r || true # exits 1 whenever anything is outdated

step "Checking the version caps"
for pkg in "${!caps[@]}"; do
	gate=${caps[$pkg]}
	if cap_can_lift "$pkg" "$gate"; then
		echo "  $pkg: $gate@latest now accepts $pkg@latest — the cap can go (remove it from this script)"
	else
		echo "  $pkg: still capped by $gate ($(pnpm view "$gate@latest" "peerDependencies.$pkg"))"
	fi
done

$dry_run && exit 0

if ! $allow_dirty && ! git diff --quiet -- pnpm-lock.yaml package.json '*/package.json' ':!apps/mobile'; then
	echo "package.json or pnpm-lock.yaml has uncommitted changes — commit or stash them first," >&2
	echo "so the update lands as a diff of its own." >&2
	exit 1
fi

# A dependency update renames pnpm's peer-suffixed store dirs out from under a
# running dev server: /_astro/status stays ok while every page returns 500.
dev_running=true
status=$(pnpm --silent --filter @islam-se/web run dev:status 2>&1 || true)
[[ $status == *"No dev server"* ]] && dev_running=false

step "Updating to latest (except ${!caps[*]})"
excludes=()
for pkg in "${!caps[@]}"; do excludes+=("!$pkg"); done
pnpm update -r --latest "${excludes[@]}"

step "Updating ${!caps[*]} within their ranges"
pnpm update -r "${!caps[@]}"

if $dev_running; then
	step "Restarting the web dev server"
	pnpm --filter @islam-se/web run dev:stop
	pnpm --filter @islam-se/web run dev:bg
fi

if $check; then
	step "Lint, typecheck and tests"
	pnpm check
	pnpm typecheck:web
	pnpm test
fi

if $build; then
	step "Building every package"
	pnpm -r --filter '!@islam-se/web' build
	# The web build goes to dist-check: `dist` collides with a running dev server.
	if pgrep -f "astro build" >/dev/null; then
		echo "another astro build is running — skipping the web build" >&2
	else
		(cd apps/web && pnpm exec astro build --outDir dist-check)
	fi
fi

step "Done"
git --no-pager diff --stat -- pnpm-lock.yaml package.json '*/package.json'
