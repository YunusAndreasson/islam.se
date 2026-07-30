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
	git pull --ff-only 2>/dev/null || log "git pull skipped (non-ff, dirty tree, or offline)"
fi

# Fast no-op on days the lockfile is unchanged; installs new deps after a pull.
log "installing deps"
pnpm install --frozen-lockfile

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

log "done"
