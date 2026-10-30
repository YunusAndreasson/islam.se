---
name: traffic-drop-diagnosis
description: >
  Diagnose a fall in search traffic or clicks: is it real, how big, when exactly, broad or
  narrow, own-site or external cause, and whether to act, wait or investigate. Use when a user
  says "my traffic dropped," "did an update hit me," "is this a tracking issue," "why did clicks
  fall," or "what should I do right now." Not a routine monitoring setup (seo-health-monitoring),
  not a fix list, and not a migration plan; it ends in a diagnosis and a decision.
---

# Traffic Drop Diagnosis

Turns "traffic fell" into a ranked, evidence-backed diagnosis and an act / wait / investigate decision, before any page is edited. This is the full workflow behind the broad-vs-narrow fork in `seo-growth-stage-strategy` Step 3. Stage gate: apply that skill first; real emergencies (technical break, security issue, manual action) bypass it. Detecting that a drop is large enough to count is owned by `seo-health-monitoring`.

---

## On islam.se — read this first

- **Data.** `~/.claude/skills/google-search-console/scripts/gsc query --dim date --start <date>`
  for the daily series; add `--dim page` or `--filter "page contains /bonetider"` to segment.
  Property `https://islam.se/`. Bönetider city pages, svar, fördjupning, essays and the
  front page are the natural segments.
- **Change log.** There is no separate ledger: deploys are `pnpm -w ship`, so `git log` on `main`
  plus the commit dates give the change timeline. The redirects live in `apps/web/astro.config.ts`.
- **Seasonality is strong.** Ramadan, the two eids and the switch to and from summer time move
  bönetider traffic far more than any ranking change; compare year over year before anything else.
- **Removed pack skills.** The other skills in this pack were removed on purpose (2026-10-29).
  `seo-health-monitoring`'s thresholds are copied into Defaults below. For `measurement-discipline`
  and `change-and-decision-log` use git history; `technical-seo-audit`, `indexing-crawl-health-audit`
  and `site-migration-safety` → `gsc inspect <url>` and the redirect table; `page-quality-audit`
  → read the page; skip `backlink-profile-audit` and `seo-growth-stage-strategy`.
  `duplicate-intent-audit` is still here.

---

## Step 0 — Ask before assuming

1. **When did it start**; a one-day step or a slope over weeks?
2. **Which metric and source** — Search Console clicks, analytics sessions, Bing? Did clicks fall, or only impressions?
3. **How big**, versus which comparison period?
4. **What changed on the site** — deploys, redesign, migration, CMS or plugin updates, robots/noindex, redirects, bulk content, tracking or consent?
5. **Anything else** — an alert, a Search Console message, a rumored update, a server incident?

Search Console and Bing Webmaster Tools are free and need ownership verification. They are worth connecting, but never block on it: without them, work from analytics, server logs and live checks at reduced precision, and say so. If a search or analytics MCP or a CSV export is available, use it.

**If none of this can be answered:** pull whatever is observable (analytics, exports, live site, deploy history), date the drop from the daily series, and label every finding **inferred** or **confirmed**.

---

## Defaults

The minimum drop worth diagnosing is the Warning tier, copied here from the removed `seo-health-monitoring` skill. Measure clicks per segment, on complete days, against the same weekday in the prior period:

| id | value | unit |
|---|---|---|
| H-CRIT-DROP / H-CRIT-DAYS | more than 50% for 3+ | consecutive complete days (Critical) |
| H-WARN-DROP-A / H-WARN-DAYS-A | 25% or more for 5 | consecutive complete days (Warning) |
| H-WARN-DROP-B / H-WARN-DAYS-B | 50% or more for 2 | consecutive complete days (Warning) |
| H-MIN-BASELINE | 100 | clicks in the prior 28 days per segment; below it, a Critical pattern is capped at Warning and stated in counts, not percentages |

Single-day dips and falls of 25–50% for 2–4 days are Info. A fall below those tiers is "Info": log it and keep watching, do not diagnose it as a problem. All of those numbers are practitioner estimates (PROPOSED), not Google figures. The only time figures here come from Google: wait a full week after an update completes (Step 6).

---

## Step 1 — Confirm it is real

- First apply the tiers in Defaults: is the fall at least Warning, on complete days, with a segment baseline above the minimum-traffic guard? If not, report "within normal range / Info" and stop.
- Read Search Console's **"Data anomalies"** page and the **Google Search Status Dashboard** live; both change, and the anomalies page keeps only recent months, so note and log anything relevant now. Note any entry overlapping the drop and which metrics it says were affected. Example in Google's own wording: a logging error "prevented Search Console from accurately reporting impressions" from 13 May 2025 until 27 Apr 2026; impressions, CTR and average position were affected, and clicks were not. Do not describe this as an "over-count." Other entries (for example Discover logging errors) affected clicks and impressions. Read the entry; never assume.
- **Clicks are the most reliable metric.** Impressions, CTR and position are derived and move with SERP layout, reporting changes and query mix. Never conclude a ranking loss from impressions or position movement alone; impressions down with clicks steady is a reporting or layout signal until proven otherwise.
- Rule out measurement: tracking removed or broken, consent or tag changes, new filters, wrong property, new bot or internal traffic. Search Console clicks and analytics sessions measure different things and will not match (Search Console eliminates duplicates and robot visits); Search Console is the source for Google search performance, analytics for on-site behavior; compare each source's own trend (`measurement-discipline`). **Optional:** if analytics (for example GA4) is available, cross-check it; the diagnosis does not depend on it.
- Rule out calendar effects: day-of-week, holidays, seasonality (compare year-over-year; Search Console keeps about 16 months of data per Google's debugging guide, checked 2026-10-05; check current retention and export what you need), and incomplete recent days (the newest data can be preliminary and may change within hours; drop it, and allow 2-3 days of normal lag). Daily data uses Pacific time.
- Check for non-human traffic: a country or device cluster with very low engagement and about one page per session (a heuristic; re-verify).
- Chart and table totals can differ; compare like with like.
- Cross-check Bing: Google down while Bing holds points to a Google-specific cause.

**Decision rule:** analytics fell but Search Console clicks held means a measurement problem; fix tracking and stop. If nothing survives these checks, report "no real drop."

## Step 2 — Size and date it

Compare equal-length periods (same weekdays) against the prior period and year-over-year. Record onset to the day, size in clicks (absolute and %), and step vs slope. A step suggests a discrete event (deploy, update, outage, manual action); a slope suggests competition, demand or decay. Align onset with the deploy log.

## Step 3 — Broad or narrow

Broad: many unrelated pages and queries fell together. Narrow: one page, template or topic fell. Broad points to technical, update or demand causes; narrow to content, template or competitor causes.

**What to do about a broad event depends on size (Google's guidance on core updates):**
- **Small drop** (for example a result moving from position 2 to 4): there is no need for drastic action; avoid changing content that is already performing well.
- **Large, sustained, sitewide drop:** work through Google's helpful-content self-assessment ("Creating helpful, reliable, people-first content") for the whole site and for the most affected pages.
- Either way, do not rush "quick fix" changes. Google's own example of a bad one: removing some page element because you heard it was bad for SEO.

## Step 4 — Segment

Use pages present in both periods. Split by **page group or template** (sort by clicks difference; aggregate by URL pattern), **brand vs non-brand**, intent type (fact lookup vs tool or transactional), **device, country, search type, search appearance**, and **new vs established pages**.
- Concentration in one page family or query class is stronger evidence than a uniform drop. Check whether the footprint shrank (fewer pages earning impressions) or only per-page performance fell. Page-level data is aggregated by canonical URL (per the Search Analytics API documentation; re-verify in your property), so canonical or redirect changes move page-level data between URLs.
- View live results for the top losing queries: new competitors, AI answers or other SERP features that answer without a click (AI Overview and AI Mode traffic is included in Search Console's Web totals; a click on a link in them is an ordinary click, and all links in one AI Overview share one position). Classify each query first; SERP-feature ceilings are not fixable by rewrites.
- **Candidate cause, UNPROVEN: AI answer surface expansion.** Possible signals: the losing queries are narrow, long or question-style; impressions are stable or rising while clicks fall. These signals are consistent with, but do not prove, answers appearing on the results page. **Never state it as the cause**; no Search Console view isolates it for clicks (the separate Generative AI performance report shows impressions only). Record it as "possible, unconfirmed" and keep testing the other causes.

## Step 5 — Own-site causes

Line the change log up against the onset. Check: deploys and template edits; migrations and redirects (`site-migration-safety`); robots.txt, noindex, canonicals, status codes, errors, speed and outages (`technical-seo-audit`, server logs, Crawl stats); index coverage (`indexing-crawl-health-audit`); internal-link or navigation changes; removed or consolidated content; content edits; same-intent overlap (`duplicate-intent-audit`); page quality (`page-quality-audit`). Verify live state; never trust a prior report's claim that something was fixed. If nothing changed in the window, say so.

## Step 6 — External causes

- **Update windows:** read Google's ranking-update list on the Status Dashboard live, and note each update's start and end dates. A candidate must start on or before the onset; an update that began after the drop cannot explain it (this is the skill's own reasoning, not a Google statement).
- **Update-recovery sequencing** (when an update is the candidate):
  1. Confirm the rollout has finished (Status Dashboard end date). During a rollout, wait.
  2. Wait at least a full week after it completes, then compare the week after with the week before the update began.
  3. Check Manual actions and Security issues; if one exists, that is the cause to fix first.
  4. If the drop is confirmed, small, and within normal range: no drastic change (Step 3).
  5. If large and sustained: do the helpful-content self-assessment, then make targeted changes one at a time, each logged with a baseline (`change-and-decision-log`, `measurement-discipline`).
  6. Expect recovery, if any, to take months; Google gives no guarantee. It does not necessarily require waiting for the next announced core update (smaller unannounced core updates also run), but if nothing moves after several months, that may mean waiting for the next core update.
- **Manual actions and Security issues** in Search Console: check both.
- **Demand and competitors:** check declining queries in Google Trends and against peers.
- **Link loss** (`backlink-profile-audit`) only if segmentation points at pages that depended on lost links.

## Step 7 — Decide: act, wait or investigate

- **Act now:** a confirmed technical fault (blocked, noindexed, erroring, broken redirects, broken tracking), a manual action, a security issue.
- **Wait:** during an active rollout; drops below the Warning tier; small position moves of a few places.
- **Investigate further:** a concentrated segment with no explanation yet.
- Attribute to an update only with matching onset and a consistent pattern; otherwise record "unattributed."
- **Gate:** if a quality or spam cause is suspected, route to `page-quality-audit` and `duplicate-intent-audit`; make targeted, measured changes one at a time, per `seo-growth-stage-strategy`.

## Step 8 — What NOT to do

- Drastic or scattered edits across many pages, or reverting good changes, in reaction to a broad drop (see Step 3 for what Google advises by size).
- "Quick fix" changes made because of something you heard was bad for SEO.
- **Deleting content except as a last resort.** Google says deleting content is a last resort: only when it cannot be salvaged, and wanting to delete whole sections often signals they were made for search engines first.
- Disavowing links or noindexing pages at scale without evidence tying them to the loss (the skill's own advice, not a Google quote).
- Chasing impressions, CTR or position instead of clicks; rewriting titles for queries capped by SERP features.
- Bulk publishing, consolidating or mass redirecting during an active rollout; it muddies attribution (the skill's own advice).
- Stacking a second change on a page inside a measurement window.
- Stating AI answer expansion, or any unproven candidate, as the cause.

## Step 9 — Recovery monitoring

Log the diagnosis and any change with a baseline (`change-and-decision-log`). Re-measure clicks weekly by the same segments, starting after any rollout ends. Some fixes show within days; quality-related recovery can take months and is not guaranteed. Set a review date and escalation trigger. Hand ongoing tracking to `seo-health-monitoring`.

---

## Facts checked against Google documentation on 2026-10-05

Time-sensitive items marked (T).

- Wait at least a full week after a core update completes before analysing; compare with the week before it began. Verified.
- Small drop: no drastic action; large sustained drop: helpful-content self-assessment; avoid quick fixes; recovery can take months; deleting content is a last resort. Verified (Google core updates guidance, page dated 2025-12-10) (T).
- Impressions logging error 13 May 2025 to 27 Apr 2026: impressions, CTR and position affected, clicks not (T; the anomalies page keeps only recent entries).
- Newest Search Console data can be preliminary; normal lag 2-3 days; Pacific time. Verified (T).
- AI Overview and AI Mode traffic counts in the Web search type. Verified.
- Google's debugging guide uses a "Last 16 months" date range and describes exporting to keep more; treat 16 months as the working limit and re-check (T).
- Not a Google statement: update-onset logic, disavow/noindex and bulk-publishing advice, AI answer surface expansion as a candidate cause.

---

## Output shape

1. **Confirmed real:** yes/no, the tier reached (per Defaults), the checks that decided it, inferred vs confirmed.
2. **Onset date** and step vs slope.
3. **Size:** clicks, % and comparison basis.
4. **Broad or narrow**, with the segment that shows it.
5. **Ranked hypotheses:** evidence for and against each; what is ruled out; any unproven candidate labelled "unconfirmed."
6. **Recommended action or no-action**, and what not to touch.
7. **Monitor:** metrics, segments, cadence, duration, review date, escalation trigger.
