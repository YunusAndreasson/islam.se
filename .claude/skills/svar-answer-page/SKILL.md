---
name: svar-answer-page
description: Produce ONE high-quality orthodox-Sunni answer page (data/svar/*.md) for islam.se, optimized for 2026 Google + AI-Overview search, to recover a legacy URL's lost ranking. Use when asked to write/produce a svar answer page, recover an orphaned legacy URL, fix a "301-to-homepage" page, write an SEO answer for a query islam.se ranks for, or work through the orphaned-redirect backlog. One article per session, high quality, human-reviewed, redirect repointed.
---

# Answer-page (`/svar/`) production skill

islam.se migrated off WordPress. ~214 old reference URLs (e.g. `/pelare/sunna/`,
`/religion/agnosticism/`) still rank on Google's first page but are 301'd to the
**homepage** — a soft-404 that throws the ranking away (≈41k impressions/90d, ~25% of
the site's search visibility). The fix per URL: **write a real answer page at
`/svar/<slug>/` and repoint the 301 to it**, so the ranking transfers instead of dying.

**This skill produces ONE such page per session, to a very high bar.** Never bulk-generate
— Google's 2026 scaled-content-abuse enforcement punishes mass AI pages; quality +
human review + staggered publishing is the whole strategy.

## Workflow (one session, one page)

1. **Pick the target** from the orphaned backlog (see "The backlog" below). You need:
   its `question` (the real Swedish query it ranks for), a `slug`, and the `legacyPath`.
2. **Produce** with the programmatic producer (researches local DBs + Sunni web sources,
   then authors in house style):
   ```bash
   cd /home/yunus/Work/islam.se
   pnpm --filter @islam-se/content-producer build   # if producer code changed
   node --no-warnings apps/content-producer/dist/index.js svar \
     "Vad är sunna?" --slug vad-ar-sunna --legacy /pelare/sunna/
   ```
   Writes `data/svar/<slug>.md` and prints the redirect tuple to add. Defaults to
   **Opus 4.8 at `--effort xhigh`** (very high — pass `--effort max` for the hardest
   topics, `--model sonnet` only to economize); re-run with `--overwrite` to regenerate.
   (~10–30 min; it spawns a headless Claude with web + MCP.)
3. **Evaluate — hard, against the bar (do NOT self-rubber-stamp).** Read the file and:
   - **Benchmark** it against `data/svar/vad-ar-kaba.md` (the genre's quality peak) and a
     literary essay in `data/articles/` (the prose ceiling). Score prose, SEO, accuracy.
   - **Run an independent adversarial critic** (spawn a subagent) that reads the draft +
     kaba + an essay and returns per-dimension scores (prose / AI-tics / accuracy / SEO)
     with a line-level punch-list. The author over-rates its own prose — the critic
     catches flat sections, invented words, terminology slips and missed citations.
     Synthesize both views; trust the harsher one on prose.
   - Apply the AI-tic checklist (see [[essay_ai_tics_language_pass]]) and house terminology
     ([[terminology_and_design_sync]]: avoid "sunnitisk" in copy).
4. **Improve** — apply the punch-list (hand-edit this page; and **fold every recurring
   lesson back into `prompts/svar-author.md`** so the next draft starts higher — that
   compounding is the point of one-per-session). Don't ship a page that misses a rubric
   "must" — especially the prose-landing one.
5. **Repoint the 301**: add the tuple to `customRedirects` in `apps/web/astro.config.ts`
   (this is what transfers the ranking — without it the page is an orphan):
   ```ts
   ["/pelare/sunna", "/svar/vad-ar-sunna/"],
   ```
6. **Build + verify**: `pnpm --filter @islam-se/web build` (a dangling `related` slug
   crashes the build — the producer guards this, but confirm). Spot-check the rendered
   page and its JSON-LD.
7. **Human review gate** (REQUIRED): orthodoxy + factual accuracy. Defer to the user for
   sign-off — this is YMYL religious content. See [[orthodoxy_review_guardrail]].
8. **Ship** one page; move on. Don't batch.

## The 2026 quality rubric (score every page; a "must" miss = don't ship)

Grounded in current AI-Overview / GEO research (the goal is to be *cited in the AI
Overview*, which ~2× the CTR, not just to rank). Per-page **musts**:

- **Answer-first**: first sentence fully answers the question, in bold, opening with a
  definitional "**X är Y**" for the head entity. (Highest-leverage; AI extracts the opening.)
- **Question-shaped H2s**: each `##` is a real Swedish query; the section beneath it
  stands alone (~130–170 words) and answers that one sub-question.
- **Fan-out coverage**: the page answers the main query + its obvious follow-ups
  (origin, meaning, misconception, ruling, practical consequence) — the "People also ask" set.
- **Evidence**: ≥1 named sourced statistic/fact AND ≥1 named-authority quote (Qur'an
  sura:aya / hadith collection+number / named scholar) with reference. (Biggest lever
  for pos 4–10 pages.)
- **Entities**: ~12–15 named entities per 1000 words (scholars, madhāhib, places, books).
- **Length 700–1100 words** — NOT padded. Pages <1000 words get cited more, not less.
- **Tone**: neutral, fluent, non-promotional. No marketing voice.
- **Prose that lands (the usual weak point — hold the line here):** each `##` section ends
  on a concrete, memorable verdict, not a trailing summary clause (the kaba bar:
  *"Tydligare än så kan gränsen … inte dras"*). On the eval of `vad-ar-sunna`, accuracy
  (9/10) and SEO came out strong but **prose was the weak dimension (5–6/10)** — flat,
  expository, no per-section landing. If a section just trails off, rewrite the closing.
  **But the opposite over-correction is now the bigger tic (2026-06-20 batch audit of 30
  pages: 173/179 section closers landed on the *same* see-saw — "inte X, utan Y", a
  semicolon-pivot, or an em-dash sharpening).** Cap that shape at **two sections per page**;
  let the rest land on a flat declarative, a concrete image, or a historical anchor. Watch
  the connective run-up ("X är därför/alltså inte … utan …"), the "vilar på *tawhīd*"
  reduction, em-dash overuse (≤ ~6/page), and reused organic metaphors (tree/root/branch/
  fruit, *ryggrad*). Both prompts now enforce this.
- **Title** leads with the literal query ("Vad är X? …", like kaba's "Vad är Kaba?"),
  ≤ ~58 chars, == H1 sense. **Meta description** 150–160 chars with a curiosity gap the
  AI Overview won't summarize.
- **FAQ** 3–5 real follow-ups (auto-emits FAQPage JSON-LD — keep it, but expect NO rich
  result; FAQ rich results were removed May 2026, it's an AI-parsing aid only).
- **Sources** section (≥2), al-ibadah.com URL where a ruling is stated.
- **Internal links**: `related` to 1–3 existing sibling pages (producer validates they exist).
- **Orthodoxy**: orthodox Sunni (Athari) only; sensitive topics factual + fair, not polemical.
- **House style (the slips the critic caught):** real Swedish only (SAOL — no coinages:
  "kärnmärke"→"kännetecken"); avoid "sunnitisk/-a" in copy (use "klassiska"/"islamiska";
  "sunnimuslimer" as a demographic is fine); consistent macron transliteration
  (*rakaʿāt*, not *rakaʿat*); no "hen" (use "muslimen"/"en muslim"); cite every source you
  list (don't list 33:21 in `sources` and never quote it); hook the adjacent entity
  (*sunna*→*sunnit*/*ahl as-sunna*) for fan-out + entity density.

Dead/harmful 2026 advice — do NOT do: build strategy on FAQ rich results; invest in
`llms.txt` (Google ignores it); pad to 2000 words; assume "#1 = cited"; mass-produce.

## Sourcing (what the producer draws on)

- **Local (MCP, via `.mcp.json`)**: `search_quran` (Bernström Swedish), `search_books`
  (153 books incl. Ibn Taymiyya, Ibn al-Qayyim, al-Ghazālī, an-Nawawī), `search_quotes`
  (6.3k Islamic + Swedish), `fetch_wikipedia`.
- **Web (separate batch — never mix with MCP in one parallel call)**: al-ibadah.com +
  islamqa.info for fiqh; Wikipedia/high-trust for non-doctrinal facts.

## Site-level gaps to raise with the user (E-E-A-T — improve the template, not per page)

The 2026 research flags these as high-value but they need template/identity decisions:
- **Named, credentialed author + `Person` JSON-LD.** The `/svar/` template currently sets
  `author: {@id: ORG}` (Organization). For YMYL religious content a *named author/reviewer*
  is a near-binary trust gate. Needs a real identity decision (who authors/reviews?).
- **Visible published + "Uppdaterad" dates** matching `datePublished`/`dateModified`.
- **≥1 relevant image with alt text** per page (template is text-only today).
- **Fill `Organization.sameAs`** (Wikidata/Wikipedia/socials) — still empty; brand mentions
  + entity corroboration now outweigh backlinks for AI citation.
These are tracked separately; per-page production works within today's template.

## The backlog (the full orphaned set)

214 legacy content pages 301 → homepage. Get the live, ranked list anytime with the
`google-search-console` skill (classify pages whose redirect target is `https://islam.se/`).
Tier by impressions: bespoke pages for ≥100 impr (~66 pages); repoint the <30-impr long
tail to the nearest relevant page/hub instead of writing thin pages. Top targets:

| Impr/90d | Legacy URL | Question | slug |
|---|---|---|---|
| 3,166 | /pelare/sunna/ | Vad är sunna? | vad-ar-sunna |
| 3,057 | /kvinna/slojan/ | Varför bär muslimska kvinnor slöja? | varfor-bar-muslimska-kvinnor-sloja |
| 2,510 | /religion/agnosticism/ | Vad säger islam om agnosticism? | islam-och-agnosticism |
| 2,491 | /historia/symboler/ | Vilka är islams symboler? | islams-symboler |
| 1,925 | /religion/shia/ | Vad är skillnaden mellan sunni och shia? | sunni-och-shia |
| 1,650 | /pelare/vallfarden/ | Vad är hajj (vallfärden)? | vad-ar-hajj |
| 1,497 | /tro/en-medelvag…/ | Vad betyder alhamdulillah? | vad-betyder-alhamdulillah |
| 1,107 | /pelare/sharia/ | Vad är sharia? | vad-ar-sharia |
| … | (full list via the GSC skill) | | |

## Gotchas (learned producing `vad-ar-sunna`)

- **Quote dates in frontmatter.** An unquoted `publishedAt: 2026-06-20T00:00:00Z` is
  parsed by Astro as a YAML *timestamp* → a JS `Date`, which fails the collection's
  `z.string()` and **breaks the build**. The producer now emits double-quoted scalars
  (`defaultStringType: "QUOTE_DOUBLE"`); keep it that way.
- **al-ibadah.com must be a section deep-page**, not the homepage. Real sections:
  `/troslara/` (creed — incl. the Messenger's authority), `/bon/`, `/fasta/`,
  `/vallfard/`, `/renhet/`, `/allmosa/`. Verify with WebFetch; if none fits, cite by
  name without a URL.
- **`sources` (frontmatter) must equal the body "Källor" list** — the array drives the
  Article `citation[]` JSON-LD; a mismatch silently drops citations.
- **E-E-A-T author gap (site-level):** the rendered `Article.author` is `{@id: #org}`
  (Organization), not a named `Person`. Resolve with the user before scaling — a named,
  credentialed author/reviewer is a near-binary trust gate for YMYL religious content.

## Prompt-engineering notes (Opus 4.8 — the producer runs on it)

Grounded in Anthropic's current docs (platform.claude.com `prompting-claude-opus-4-8` /
`claude-4-best-practices`) + 2026 third-party playbooks. The producer prompts already apply:
- **Be explicit about tool use.** Opus 4.8 *under-reaches for tools by default*; the author
  prompt mandates calling `search_quran`+`search_books` before writing. Validated: this
  lifted sourcing richness (hajj = 7 sources / 5 verified citations, vs 4 pre-mandate).
- **Tight output contract** (complete page, no preamble, don't ask) — 4.8 narrates/asks more.
- **Review = coverage, not triage** — 4.8 obeys "only flag major issues" too literally and
  drops findings; the review prompt tells the editor to fix everything + self-check first.
- **Markdown-mode (JSON frontmatter + body) is correct** — Structured Outputs is JSON-only
  and would discard the body; instruction + the exact format spec is the right tool here.
- Effort: author `xhigh`, review `max` (set explicitly; 4.8 is effort-sensitive).
Deferred pass-2 ideas (validate before trusting): XML-tag structure, one worked `<example>`
of the full page, an explicit-scope sweep on broad rules, a constraint de-dup pass.

Validated articles (two-pass, Opus 4.8): `vad-ar-sunna` (hand-tuned), `vad-ar-sharia`
(critic 8.6/10), `vad-ar-hajj` (7 sources, kaba-bar prose). All build; redirects unwired
pending review.

## Key files

- Producer CLI: `apps/content-producer/src/index.ts` (`svar` command) →
  `svar-producer.ts` (uses orchestrator `ClaudeRunner`), `svar-schema.ts` (frontmatter
  Zod). Authoring prompt: `apps/content-producer/prompts/svar-author.md` (tune this to
  improve output quality).
- Pages: `data/svar/<slug>.md`. Collection schema: `apps/web/src/content.config.ts`.
  Rendering + JSON-LD: `apps/web/src/pages/svar/[slug].astro`.
- Redirects: `customRedirects` in `apps/web/astro.config.ts`.
- Related memory: [[orthodoxy_review_guardrail]], [[gsc_skill]], [[web_bonetider_feature]].
