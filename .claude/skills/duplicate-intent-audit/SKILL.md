---
name: duplicate-intent-audit
description: >
  Detect pages that serve the same search intent as another page, even when their wording is
  different. Same-intent overlap is a quality and possible-overlap (cannibalisation) concern, and
  becomes a spam-policy concern (scaled content abuse) only when many pages are made mainly to
  rank. On islam.se: svar, fördjupning and essays competing for the same query in Search
  Console, and the bönetider city pages. Use when a user asks "are my pages competing with each
  other," "do I have duplicate content risk," or before a new svar or fördjupning page on a topic
  the site already covers. Not for a traffic drop (traffic-drop-diagnosis).
---

# Duplicate-Intent Audit

Checking for duplicate *text* is the wrong check. Two pages answering the same query can look
"different" to a text-diff and still compete with each other, split clicks, and make a site look
like it was built for search engines rather than readers.

How to frame the risk (Google's wording; facts checked against Google documentation on 2026-10-05):

- Google's **scaled content abuse** policy is about many pages generated mainly to manipulate
  search rankings and not to help users, "no matter how it's created" (by AI, by humans, or by
  a mix). It does not name same-intent overlap. Apply that lens only when many pages are made
  mainly to rank (Step 5).
- Google has said there is no "duplicate content penalty" (Google Search Central blog, 2008, and the same stance in its duplicate-URL docs). Duplicate or overlapping pages are a
  quality and crawl-efficiency matter: Google picks a canonical and may not show every near-duplicate.
  Do not use the word "penalty" for overlap. Pages made mainly to rank can be demoted by automated
  systems or get a manual action; that is the spam-policy case, not the overlap case.
- Google gives **no guidance on cannibalisation** (several of your pages ranking for one query).
  Everything about it in this skill is a heuristic, not documented Google behaviour.
- Related named policy: **doorway abuse** (pages made to rank for specific, similar queries that
  funnel users to a less useful page). It applies only to that pattern.

---

## On islam.se — read this first

- **Data.** Pull with the GSC helper, never by hand:
  `~/.claude/skills/google-search-console/scripts/gsc query --dim query,page --start <date> --limit 25000`.
  Property `https://islam.se/`. Brand queries to drop: anything matching `islam\.?se`.
- **Clean window.** Impressions, CTR and position are wrong before 2026-04-28 (Google's logging
  error); a window starting after that date is clean. Clicks are good throughout.
- **Inventory.** `data/svar/*.md` → `/svar/<slug>/`, `data/fordjupning/*.md` →
  `/fordjupning/<slug>/`, `data/articles/*.md` → essays at the root, plus the hand-built pages
  in `apps/web/src/pages/`. Legacy WordPress URLs are `oldPaths` and `customRedirects` in
  `apps/web/astro.config.ts`: a path in `oldPaths` with no `customRedirects` line 301s to the
  homepage, a soft 404 that `svar-answer-page` exists to fix.
- **Overlap by design is not a finding.** A svar page (question intent, »vad är hijab?«) under a
  fördjupning (the broad term, »hijab«) is the hub-and-child exception in Step 1:
  `apps/web/src/lib/svar-fordjupning.ts` decides which pillar owns which answer, and
  `python3 scripts/check-spoke-ownership.py` checks it. Flag such a pair only when Step 3 shows
  the two splitting the same query. An essay argues a thesis, a different intent from an answer
  page; an essay is never merged or redirected into one.
- **Bönetider city pages** (`/bonetider/<stad>/`) are the site's one programmatic set and the only
  place Step 5's scaled-content lens can apply. Two cities are two places, not overlap; look for a
  city page with nothing but the table, or two URLs for the same place.
- **Survivor and merge.** Report the plan; the user decides every redirect and merge. A merge into
  a svar or fördjupning page goes through `svar-answer-page` or `fordjupning-page`.
- **House rules on any copy you propose.** A title, heading or description must pass the
  doctrine grep in `AGENTS.md` and `pnpm -w lint:house`, and follow the site's Swedish (no
  »X som …« title frames). Propose; never edit a published page on this skill's say-so.
- **Removed pack skills.** The other skills in this pack were removed on purpose (2026-10-29).
  Where the text below sends you to `page-quality-audit`, judge the page by reading it;
  `technical-seo-audit` or `indexing-crawl-health-audit` → `gsc inspect <url>`;
  `traffic-drop-diagnosis` is still here.

---

## Step 0 — Ask before assuming

1. How is content produced — hand-written, templated from a dataset, AI-drafted, a mix?
   Templated/programmatic sites are most exposed to this specific problem.
2. Has the same *kind* of page ever been built under two different naming schemes at different
   times (a redesign, a new batch using a different template)? This is the most common root
   cause.
3. How many pages exist, and is a full URL/title list or sitemap available? This needs to look
   across the whole set — duplicate-intent pairs are invisible one page at a time.
4. Is Search Console (or equivalent) access available? Real click and query data is the best
   signal for confirming a suspected pair is actually competing (Step 3).
5. Has anything already been merged/redirected? Avoid re-flagging resolved pairs.

**If there's no sitemap/URL list:** discover pages by crawling from the homepage (or whatever
URLs are available) and following internal links, or ask only for the domain and enumerate via
a search-engine site-search query. **If there's no Search Console access:** proceed with Step 1
(topic/entity clustering) regardless — it doesn't need performance data — and note in the
output that Step 4's survivor-selection will be based on content quality alone rather than real
performance data. Search Console is free and worth setting up (verify site ownership via a DNS
record, HTML file, or meta tag); mention it as a useful one-time step, but don't block the audit.

---

## Step 1 — Detect near-duplicate pages by topic/entity, not literal text

Literal text-overlap is a secondary signal only. Primary method:

1. For every page, extract the core entity/subject and the content-type/angle (overview,
   comparison, pricing breakdown, how-to).
2. Group pages sharing both. Any group of 2+ is a candidate cluster — investigate all of them,
   even if the prose reads completely differently. Low text-overlap does not clear a pair.

Common root causes to check for:
- **Naming-convention drift**: the same page-kind built under two different naming patterns at
  different points in the site's history. Re-scan the *whole* site's naming patterns explicitly.
- **Reversed-pair content**: for "A vs. B" comparisons, check explicitly for "B vs. A."
- **Two-hub-per-entity**: more than one hub/landing template ever used for the same entity.

**Exceptions: legitimate overlap, do not flag as duplicates.**
- Hub and child pages (a hub summarising what its child pages cover in depth).
- `hreflang` language/region variants of the same page.
- Different intents sharing a head query (for example "what is X" and "X calculator" can both
  rank for "X" and serve different needs). Check the intent behind each page, not just the query.

---

## Step 2 — Check for orphaned pages already superseded by a redirect

Check whether the site still builds pages at URLs already redirected away by rewrite rules
elsewhere in the stack — safe, easy deletions, easy to miss because production masks them.

---

## Step 3 — Search Console-only detector for possible overlap [RULE]

Use this when you have a page-and-query export but no URL list, or to confirm Step 1 clusters.
This is a heuristic: Google gives no guidance on cannibalisation, and every number below is a
PROPOSED default (see Defaults).

1. Pull page-by-query data for 90 days (`DUP-WINDOW`). Drop brand queries (the Search Console
   branded filter if available, otherwise your own brand-term match; the filter can misclassify).
2. For each non-brand query, flag it when two or more pages each hold at least 20% of that
   query's impressions (`DUP-SHARE`), the combined position is worse than 3 (`DUP-POSITION`), and
   the page with the most clicks changed at least twice across the window (`DUP-SWAPS`).
   Use `DUP-OVERLAP` (an overlap ratio of 0.30 with at least 3 shared queries between a pair of
   pages) only if the page-by-query export cannot be split by query.
3. **Weight by clicks.** Rank flagged pairs by combined clicks, not impressions. Google
   documented a logging error that made impressions inaccurate from 13 May 2025 to 27 Apr 2026
   (clicks were not affected), so impression shares inside that affected window are inaccurate; weight by clicks.
4. Apply the exceptions in Step 1 before reporting.
5. Word every result as **"possible overlap"**. Never write "cannibalisation proven" or
   "caused by". The same data also fits a rank change, a seasonal shift or a result-page change.

A flagged pair with both pages near-invisible while a distinct related page performs normally is
one more hint, not a finding by itself.

---

## Step 4 — Use real performance data to pick the survivor

For each confirmed cluster, pull click data (`DUP-WINDOW`). Choosing the survivor: weigh
existing clicks and position, actual content quality (don't default to the higher-ranking page
if it's thinner — merge the better content in), and naming-convention fit. If both are
near-invisible, search equity isn't a meaningful tiebreaker — decide on content quality and
naming consistency. Consolidate with a 301 redirect or `rel=canonical` (Google treats both as
strong signals). Google calls deleting content a last resort; prefer merging and redirecting.

---

## Step 5 — Apply the scaled-content-abuse lens only when it fits

Ask whether many pages (not two or three) were produced mainly to rank rather than to help
readers: pages generated at volume with little original value, scraped or reworded material,
stitched-together sources, or many pages whose content makes little sense but contains search keywords (Google's example). Many near-identical pages differing only in a swapped keyword are a further sign by this skill's own inference, not a Google example. If
yes, say it is a possible spam-policy exposure and hand off to `page-quality-audit` and the
site owner for a decision. If it is just a handful of overlapping pages, it is a consolidation
task, not a policy matter.

---

## Step 6 — Recommend prevention, not just cleanup

Recommend a creation-time check in whatever process generates new pages: before publishing,
check whether this entity+content-type combination already exists under any naming convention,
and whether a comparison's reversed pair already exists.

---

## Defaults (not Google figures; all PROPOSED)

| id | value | unit | basis | calibrate on |
|---|---|---|---|---|
| DUP-WINDOW | 90 | days | PROPOSED | how often the site's queries change; shorten for fast-moving topics |
| DUP-SHARE | 20% | share of a query's impressions per page, two or more pages | PROPOSED | the site's own distribution of multi-page queries |
| DUP-POSITION | worse than 3 | combined position | PROPOSED | the site's median position for flagged queries |
| DUP-SWAPS | at least 2 | times the top page (by clicks) changes in the window | PROPOSED | the site's normal ranking volatility |
| DUP-OVERLAP | 0.30, with at least 3 shared queries | overlap ratio between two pages | PROPOSED; may change after testing | compare against DUP-SHARE on the same export |

---

## Output shape

Every detected cluster with: entity/topic and content-type shared, text-overlap % as secondary
data, likely root cause, click data per page, whether any Step 1 exception applies, the label
"possible overlap" (confirmed versus inferred stated), recommended survivor + merge plan, any
orphaned-redirect pages, whether the scaled-content-abuse lens (Step 5) was applied and why, and
a prevention recommendation for the content-creation process.

---

Facts checked against Google documentation on 2026-10-05.
