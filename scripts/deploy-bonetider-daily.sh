#!/usr/bin/env bash
#
# Daily rebuild + deploy of islam.se.
#
# WHY THIS EXISTS
#   The /bonetider/[stad] prayer-time pages server-render *this day's* times, the visible
#   "I dag …" date, and the JSON-LD `dateModified` at BUILD time. Without a daily rebuild,
#   crawlers are served stale values — e.g. a page that reads "I dag · 27 juni" and
#   dateModified 2026-06-13 while the real date is weeks later. For queries as time-sensitive
#   as "bönetider <stad>", that freshness gap is a real ranking/quality liability. Rebuilding
#   once a day regenerates every city page with today's times + an honest, current dateModified
#   and sitemap <lastmod> (which already declares changefreq=DAILY).
#
# WHAT IT DOES (and deliberately does NOT do)
#   * Builds ONLY the web package (`pnpm --filter @islam-se/web run build`). The web app has no
#     workspace deps, so core/quotes/orchestrator are not rebuilt.
#   * Renders the PDF. ⚠️ NOT optional, despite being irrelevant to prayer times: a Pages
#     deploy is a full SNAPSHOT of dist/, so omitting `pnpm pdf` 404s the already-live
#     /samlingsvolym.pdf that BookPod links to.
#
# WHAT THE NIGHT ACTUALLY COSTS (measured 2026-08-20, 8-core dev box, 2 473 pages)
#   ~125 s on an ordinary night, ~310 s on the first night of a month.
#
#   The difference is the per-town artefacts. A month's prayer times are the same on the
#   1st as on the 28th, so the .ics calendars (2 128) and the month PDFs (272) are
#   deterministic per (ort, år, månad) and cached on disk under node_modules/.astro —
#   recomputed when the month turns, copied every other night. Byte-identical output also
#   means wrangler uploads none of those 101 MB again until the month rolls.
#
#   ⚠️ That cache lives in node_modules. A deploy host that wipes node_modules pays the
#   cold cost (~310 s) on the next run — correct, just slower. Never "clean" it nightly.
#
#   ⚠️ Do NOT set ASTRO_BUILD_CONCURRENCY on a memory-tight host. It looks like the knob
#   for "build gently", and it is the opposite: astro.config.ts already sets 1 (Astro's
#   default and the fastest value measured), and anything higher multiplies peak RSS.
#   The first real run on hetzner had =2 pinned in the systemd unit, which put the build
#   over MemoryHigh; the kernel started reclaiming and page renders went from 300 ms to
#   17 s each. Removing the override fixed it — the same run then finished in ~5 min.
#
#   The 2 265 HTML pages that carry a date DO need re-rendering every night: 2 128 city
#   pages, 137 mosque pages, and the mast prayer chip on every page. Astro's experimental
#   incremental build does not help here — it keys on getStaticPaths cacheKey plus the
#   module graph, neither of which sees "the date changed", so it would either skip the
#   very pages the job exists to refresh or invalidate them all anyway.
#   * Deploys the static `dist/` to Cloudflare Pages, production branch `master`.
#
# REQUIREMENTS (for cron / CI, non-interactive)
#   * pnpm + Node installed and on PATH.
#   * The `typst` binary on PATH — scripts/generate-pdf.ts shells out to it.
#   * Wrangler authenticated WITHOUT a browser: export CLOUDFLARE_API_TOKEN (a token with the
#     "Cloudflare Pages: Edit" permission) and CLOUDFLARE_ACCOUNT_ID in the environment.
#     ⚠️ Set them in cron's own environment; cron does not read your shell profile.
#
# USAGE
#   scripts/deploy-bonetider-daily.sh
#   SKIP_GIT_PULL=1 scripts/deploy-bonetider-daily.sh   # deploy current checkout as-is
#
# CRONTAB (01:30 Europe/Stockholm — inside the new day in both CET and CEST; a run at
# 00:00 is a coin flip on which date the build stamps)
#   CRON_TZ=Europe/Stockholm
#   CLOUDFLARE_API_TOKEN=…
#   CLOUDFLARE_ACCOUNT_ID=…
#   30 1 * * * /path/to/islam.se/scripts/deploy-bonetider-daily.sh >> /var/log/islam-se-deploy.log 2>&1
#
# INSTALLED ON hetzner AS A SYSTEMD TIMER (the box already drives zuhd.news the same way):
#   /etc/systemd/system/islam-se-deploy.service   oneshot, EnvironmentFile=/etc/islam-se-deploy.env
#   /etc/systemd/system/islam-se-deploy.timer     OnCalendar=*-*-* 01:30 Europe/Stockholm
#   journalctl -u islam-se-deploy -n 60           read the last run
#
# SHIP GUARD
#   Refuses to publish when the repo root holds a `.no-ship` file, or when any commit since
#   the last successful deploy says EJ GRANSKAD / FÅR INTE SHIPPAS / DO NOT SHIP. Override
#   once, after review, with SKIP_SHIP_GUARD=1.
#
# Smoke-test it the way cron will run it, not the way your shell does — PATH and auth
# failures only show up under a stripped environment:
#   env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin \
#     CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
#     /path/to/islam.se/scripts/deploy-bonetider-daily.sh
#
set -euo pipefail

# Resolve the repo root from this script's location, so cron can call it by absolute path.
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

log() { printf '[deploy-bonetider-daily %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Check the credential BEFORE the seven-minute build, not at the deploy step after it.
# On the unattended host the build peaks around 7 GB RSS; discovering a missing token
# then means the box has swapped itself hoarse for nothing. An interactive `wrangler
# login` (the config below) counts too — that is how this runs from a laptop.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ ! -f "${HOME:-/root}/.config/.wrangler/config/default.toml" ]; then
	log "no CLOUDFLARE_API_TOKEN and no wrangler login — refusing to build something it cannot deploy"
	exit 1
fi

# A slow run must not have the next night's run building on top of it. Exit 0, not 1 — an
# overlap is a skipped refresh, not a failure worth mailing the operator about.
exec 9>"${TMPDIR:-/tmp}/islam-se-daily-deploy.lock"
if ! flock -n 9; then
	log "another run holds the lock — skipping"
	exit 0
fi

# Pick up any newly committed code. Freshness itself needs no new commit (the build stamps
# today's date), so a non-fast-forward or offline box must not abort the daily refresh.
if [ "${SKIP_GIT_PULL:-0}" != "1" ]; then
	# bash reads a script incrementally, by byte offset, WHILE running it — so a pull that
	# rewrites this file mid-run makes the shell resume at an offset that now points into
	# different text. Re-exec when the pull changed us, and pass a marker so the new process
	# does not pull (and re-exec) again.
	before="$(cksum <"${BASH_SOURCE[0]}")"
	git pull --ff-only 2>/dev/null || log "git pull skipped (non-ff, dirty tree, or offline)"
	if [ "$(cksum <"${BASH_SOURCE[0]}")" != "$before" ]; then
		log "the pull updated this script — re-executing the new version"
		SKIP_GIT_PULL=1 exec "${BASH_SOURCE[0]}" "$@"
	fi
fi

# An unattended deploy publishes whatever master holds, and master is a working surface:
# 86e0719 committed a finished /svar/ page with "EJ GRANSKAD, får inte shippas ännu" in its
# message precisely so it could sit unshipped until a human had reviewed it. Scanning only
# HEAD would clear that commit the moment anything landed on top of it, so the range runs
# from the last SHA this script actually deployed — recorded in .git after each success, and
# absent on the first run, when an operator is watching anyway.
#
# To publish past a blocked commit once the content has been reviewed:
#   SKIP_SHIP_GUARD=1 scripts/deploy-bonetider-daily.sh
DEPLOYED_SHA_FILE="${DEPLOYED_SHA_FILE:-$REPO_DIR/.git/islam-se-last-deployed-sha}"
if [ "${SKIP_SHIP_GUARD:-0}" != "1" ]; then
	if [ -f "$REPO_DIR/.no-ship" ]; then
		log "refusing: .no-ship exists in the repo root — remove it to resume deploys"
		exit 1
	fi
	last_deployed="$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || true)"
	if [ -n "$last_deployed" ] && git cat-file -e "$last_deployed^{commit}" 2>/dev/null; then
		if git log --format=%B "$last_deployed..HEAD" |
			grep -qiE 'EJ GRANSKAD|FÅR INTE SHIPPAS|DO NOT SHIP'; then
			log "refusing: a commit since $(git rev-parse --short "$last_deployed") is marked as not shippable"
			log "review it, then re-run once with SKIP_SHIP_GUARD=1"
			exit 1
		fi
	fi
fi

# Astro's content layer caches rendered markdown in node_modules/.astro/data-store.json,
# and its cache key does NOT include the rehype/remark chain. So a commit that changes how
# markdown renders — a plugin edit, a new pipeline step — produces a build that silently
# re-serves the OLD markup. The first night this bit us, the whole fördjupning corpus came
# out without its margin notes and the deploy guard (correctly) refused to ship it.
#
# The store is only a cache: dropping it costs one content re-sync, some fifteen seconds.
# Do it whenever HEAD has moved since the last successful deploy — that is exactly the set
# of nights where content or code could have changed, and it costs nothing on the nights
# it hasn't. Compared against the recorded SHA rather than a before/after of the pull, so
# it still holds after the re-exec above (which skips the pull by design).
head_now="$(git rev-parse HEAD 2>/dev/null || true)"
last_shipped="$(cat "$DEPLOYED_SHA_FILE" 2>/dev/null || true)"
if [ "$head_now" != "$last_shipped" ]; then
	log "HEAD moved since the last deploy — dropping the content cache so markdown re-renders"
	find "$REPO_DIR/apps/web/node_modules/.astro" -maxdepth 1 -name data-store.json -delete 2>/dev/null || true
fi

# Fast no-op on days the lockfile is unchanged; installs new deps after a pull.
# Filtered to the web package: it has no workspace deps, while a full workspace install
# pulls @huggingface/transformers and onnxruntime for packages this build never touches
# (2,1 GB against a few hundred MB) — weight the deploy host has no use for.
log "installing deps"
pnpm install --filter "@islam-se/web..." --frozen-lockfile

# Parity check against adhan, run on the actual build date so a DST or edge-date regression
# fails here instead of shipping 2 118 pages of wrong times.
log "checking prayer-time parity"
pnpm --filter @islam-se/web exec tsx scripts/check-bonetider.ts

# A wedged dist has survived a rebuild before; start from nothing.
rm -rf "$REPO_DIR/apps/web/dist"

log "building web (astro + markdown)"
pnpm --filter @islam-se/web run build

log "rendering pdf (typst)"
pnpm --filter @islam-se/web run pdf

# Last gate before the snapshot replaces the live site.
log "running deploy guard"
node "$REPO_DIR/apps/web/scripts/assert-full-build.mjs"

# Deploy the freshly built static site to Cloudflare Pages (production).
# ⚠️ --branch master, or Cloudflare files it as a Preview deploy and nothing goes live.
log "deploying dist to Cloudflare Pages (project islam-se, branch master)"
pnpm --filter @islam-se/web exec wrangler pages deploy dist \
	--project-name islam-se \
	--branch master \
	--commit-dirty=true

# Only a deploy that actually happened moves the mark the ship guard reads from.
git rev-parse HEAD >"$DEPLOYED_SHA_FILE"

log "done"
