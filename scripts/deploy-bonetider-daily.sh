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
#   * Skips `pnpm pdf` (the slow Puppeteer article-PDF render) — irrelevant to prayer times.
#     This is the one difference from the interactive root `pnpm ship`.
#   * Deploys the static `dist/` to Cloudflare Pages, production branch `master`.
#
# REQUIREMENTS (for cron / CI, non-interactive)
#   * pnpm + Node installed and on PATH.
#   * Wrangler authenticated WITHOUT a browser: export CLOUDFLARE_API_TOKEN (a token with the
#     "Cloudflare Pages: Edit" permission) and CLOUDFLARE_ACCOUNT_ID in the environment.
#
# USAGE
#   scripts/deploy-bonetider-daily.sh
#   SKIP_GIT_PULL=1 scripts/deploy-bonetider-daily.sh   # deploy current checkout as-is
#
set -euo pipefail

# Resolve the repo root from this script's location, so cron can call it by absolute path.
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_DIR"

log() { printf '[deploy-bonetider-daily %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Pick up any newly committed code. Freshness itself needs no new commit (the build stamps
# today's date), so a non-fast-forward or offline box must not abort the daily refresh.
if [ "${SKIP_GIT_PULL:-0}" != "1" ]; then
	git pull --ff-only 2>/dev/null || log "git pull skipped (non-ff, dirty tree, or offline)"
fi

# Fast no-op on days the lockfile is unchanged; installs new deps after a pull.
log "installing deps"
pnpm install --frozen-lockfile

# Lean build: astro build + markdown generation for the web app only. No PDF, no other packages.
log "building web (astro, no pdf)"
pnpm --filter @islam-se/web run build

# Deploy the freshly built static site to Cloudflare Pages (production).
log "deploying dist to Cloudflare Pages (project islam-se, branch master)"
pnpm --filter @islam-se/web exec wrangler pages deploy dist \
	--project-name islam-se \
	--branch master \
	--commit-dirty=true

log "done"
