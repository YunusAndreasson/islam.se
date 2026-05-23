# islam.se — Frontpage & Discovery Redesign Plan

> Handover brief for Claude Code. The site runs on Astro. The reading template
> inside an essay is already tuned and must not be touched. What follows is
> about giving the essay corpus more doors, framing it within the source text
> and the calendar, without losing the quiet that already defines the site.

---

## 1. Goal

A first-time visitor should find their way deep into the corpus by following the composition — not by reading instructions. The homepage shows the shape of the work; it does not narrate it.

## 2. Editorial stance

The site presents Islam to Swedish readers from within the Sunni scholarly tradition. This is a stance, not an announcement — it shapes editorial choices without ever being declared on the page. The register on the page is contemplative, not confessional.

The stance has only a few load-bearing consequences for the agent:

- **Quran translation.** Mohammed Knut Bernström's *Koranens budskap* (chosen), sourced via the Tarteel MCP (slug `sv-knut`) together with the Uthmanic Arabic. Displayed as a small attributed rotating set — within scope (§7.2).
- **Reciter.** Yasser al-Dosari, from the Sunni recitation tradition (author's choice, §13.2).
- **Hijri calculation.** Umm al-Qura, the conventional Sunni reference (§7.9).
- **Märkesdagar.** Only observances established in hadith appear. Anything contested within Sunni Islam (Mawlid an-Nabī, Isra wa Mi'raj) is deliberately excluded — not surfaced as a choice (§7.9).

The recurring thinkers (Ibn Qayyim al-Jawziyyah, Ibn Taymiyya, Ibn al-Jawzī, Ibn Khaldūn, al-Māwardī, al-Ghazālī) all work within the classical Sunni canon. This is the site's frame, not a coincidence — but it is expressed through *which* thinkers are featured, not through any statement on the page.

## 3. What must not change — and what is being torn out

Preserve, untouched:

- Reading-template typography — font, measure, line-height, vertical rhythm. Tuned.
- Warm near-black palette (`#1a1917` and its neighbours), `light dark` color-scheme behaviour.
- The wordmark mast and dotted-separator nav (`Essäer · Om · AI`) in `Header.astro`. Expand around it; do not restyle it.
- View Transitions across pages — via `<ClientRouter />` in `Base.astro` (the Astro 6 name for the former `ViewTransitions`; don't reach for the old name), with `transition:persist` already wired on the header and player.
- The reading experience inside an essay (`[...slug].astro`).

Being deliberately removed — name this honestly, because it is the largest single deletion:

- **The homepage hero carousel.** The current `index.astro` is a full-screen bildspel: prev/next buttons, swipe handling, keyboard nav, and a 25-second Ken Burns zoom (`hero-zoom` in `layout.css`). This is replaced wholesale by the vertical composition in §7. The entire hero script block and its CSS go.
- The homepage's `hero-cta-listen → floating-player:play` wiring goes with it (see §11, Audio — the verse must not reuse the floating player).

The aesthetic target after the teardown: **no carousels, no scroll-driven theatre, no hover parallax, no autoplay.** The quiet that the carousel currently violates.

## 4. The bar

This work targets recognition at the level of Awwwards SOTD, FWA, CSS Design Awards in the editorial/typography category, 2026. That bar requires more than tasteful minimalism — tasteful minimalism is now commodity. What separates an award-level editorial site from a competent one:

- **A signature composition.** Something recognisable from a thumbnail. Likely an asymmetric editorial grid that breaks at deliberate moments, or a typographic treatment that does heavy lifting where most sites reach for imagery.
- **Detail at the micro-scale.** How a hairline divider meets a margin. How dates and reading times are set. How italics carrying Arabic transliteration (*jihād al-nafs*, *Ibn Qayyim al-Jawziyyah*) are spaced and weighted.
- **The Arabic script of the Quran** (§7.2). The single most consequential typographic moment on the site. If this is rendered with the seriousness it demands, the whole composition earns its standing.
- **Motion as meaning, not decoration.** View Transitions already in place; they should feel inevitable.
- **Lighthouse near-perfect across the board.** Performance, accessibility, SEO, best practices.
- **Considered edge cases — including the ones that already exist but are not yet composed.** `404.astro` is currently plain text; compose it to this bar. Also: search-no-results, audio failure, the longest possible title, the shortest possible lead.

## 5. References

Study these directly before composing layouts. Browse the last six months of Awwwards SOTD in *Typography* and *Editorial* — what is winning now, not what won in 2022.

- **Nordic editorial restraint** — ARK Journal (`arkjournal.com`), Norm Architects (`normcph.com`), Frama (`framacph.com`), Toteme Studio (`toteme-studio.com`). Asymmetric heroes, hairline-only dividers, how a single image and three lines carry a fold.
- **Editorial discovery at scale** — Aeon (`aeon.co`) for content-type architecture; Noēma (`noemamag.com`) for thematic threads in editorial voice; Granta (`granta.com`) issue indexes.
- **Closest spiritual sibling** — Craig Mod (`craigmod.com`). Single-author long-form, contemplative discovery without a tag system.
- **Arabic typography done seriously** — Khatt Foundation (`khtt.net`), the Aga Khan Museum collections. Arabic given vertical room, never compressed, never decorative.

Anti-reference: any site with a "Read more →" button under a card; any Quran-app aesthetic with reciter dropdowns, verse-navigator arrows, chunky audio players; any da'wa site whose visual register signals confessional persuasion rather than contemplative invitation.

## 6. Discovery architecture

Four orthogonal entry axes. None replaces the others.

**Recency.** The default homepage spine — the work as it unfolds in time.

**Ämnen.** An exhaustive topical taxonomy — every essay carries exactly one primary ämne, so the whole corpus is reachable by subject, not just by date. This is the systematic backbone the curated Trådar can't give: a thread holds 4–8 chosen essays, an ämne holds all of its kind. The categories are derived from the corpus and named as single clean concepts — consistent definite-singular nouns, **no "&" pairings, no filler** (an ampersand in a category name is a tell that two things were bolted together because the taxonomy wasn't thought through). **Their order is not alphabetical or by size — it follows the prophetic da'wah sequence, foundational theology first**, the way the invitation to Islam was given (the Meccan→Medinan arc; the Muʿādh-to-Yemen hadith: creed, then worship, then law): the Creator through His signs, then His revelation, then the soul's response, then law, then society — and last the Swedish reader's own meeting-point. This order is the canonical one: the homepage sections (§7.7), the archive grouping (§9), and the schema enum all use it.

1. **Skapelsen** — the Creator known through His signs: nature, the animals, the cosmos, the āyāt. The Meccan Quran's first argument for God.
2. **Skriften** — the revelation that follows: the Quran, the message, language, the text's history.
3. **Själen** — the soul's response: the heart and its desires, the vices, grief, forgiveness, the tongue, purification (the Ibn Qayyim cycle of the heart sits here).
4. **Rätten** — right action and law: justice, governance, rights, money.
5. **Samhället** — the believing community and the public sphere; the social fabric and the tradition meeting contemporary Sweden.
6. **Sökandet** — the modern inward search the invitation answers (Swedenborg, Strindberg, Linné, Levertin).
7. **Norden** — the inherited past, reckoned with in the new light: Norse myth and old-Swedish heritage.

Seven is a starting point, not scripture; the author adjusts names and boundaries but holds the naming discipline. Evocative clusters that *don't* generalise into a clean bucket — the night essays, the Strindberg crisis, the heart cycle, the essays on speech and truth — belong as **Trådar**, not categories. (This is why *Natten* and *Tungan* are threads and not ämnen: "night" and "the tongue" are motifs cutting across Själen, Sökandet and Samhället, not topical homes of their own.)

**Trådar.** Editorially curated collections of 4–8 essays, each with a short framing paragraph by the author. The corpus already organises itself around recurring threads (the Ibn Qayyim cycle on the anatomy of the heart; the Strindberg crisis essays; the nature/creation essays; the jurisprudence-and-money essays; the night essays).

**Tänkare.** Recurring interlocutors, each a page with a short paragraph and the essays that engage them. The membership below is **derived from the corpus** (distinct essays mentioning each name, of 46) — not guessed — so the pages are actually substantial:

- Classical Sunni scholars: Ibn Qayyim (34), Ibn Taymiyya (20), Ibn al-Jawzī (18), Ibn Khaldūn (11), al-Māwardī (8), al-Ghazālī (5).
- Swedish and Western: Strindberg (22), Boye (13), Söderberg (12), Ellen Key (12), Geijer (9), Lagerlöf (6), Rydberg (6), Hammarskjöld (5), Swedenborg (5), Levertin (4), Kierkegaard (3), Linné (3).

Two corrections the data forced: **Sībawayh appears in only one essay** — below the threshold; the earlier draft listed him wrongly, drop him. And **Ibn Taymiyya, Ibn al-Jawzī, and Ellen Key** are major presences the earlier draft omitted (Ellen Key is the fourth-most-cited name in the whole corpus). These are mention-frequencies, not depth measures, so the author prunes any that are passing references rather than genuine interlocutors (§13.7).

**No existing metadata supports this yet.** Article frontmatter today is only `title / publishedAt / wordCount / description / audioFile / audioDuration` (`content.config.ts`). There is no author, thinker, or thread field, and nothing is machine-derivable from the bodies reliably. Threads and thinkers are therefore **net-new structured data**, authored by hand — either as new frontmatter keys on each essay, or as dedicated content collections (`tradar`, `tankare`) that reference essay slugs. The latter keeps the essay files untouched and is preferred. The author supplies the membership and the framing prose (§13.6–7).

**Ämnen** add one `category` field to each essay's frontmatter (a single enum value — so this one does touch the essay files). But unlike threads and thinkers it is **agent-draftable**: the agent reads each essay and assigns one primary ämne, the author only confirms (§13.9). It is mechanical work, not editorial-prose work.

Thread and thinker pages inherit the essay template's typographic tuning. They are part of the canon, not utility pages.

## 7. Homepage composition

The homepage reads top-to-bottom as a single composition. Generous vertical breathing between movements. Hairline rules as the only divider, used sparingly. The rhythm matters as much as the modules: no two adjacent sections share the same density.

**The order follows da'wah priority — most important first**, the way the message was given: the word of God opens the page and is its apex (Dagens vers); then the invitation through the essays; then the layers of discovery (the ämnen themselves in the §6 da'wah order); then the sacred year — and distribution last, because the book and podcast are how the work *travels*, not what it *is*. This is tempered by good design, never dogmatic: importance is carried by **position and weight, never by louder styling**. It stays a contemplative essay site, not a portal.

The full sequence (this diagram is the authoritative order; the numbered subsections below are reference labels, not the sequence):

```
Mast → Dagens vers → Senaste essän → Nyligen publicerat
→ Citat → Ämnen → Trådar → Tänkare → Märkesdagar
→ Boken & podden → Hela arkivet → Footer
```

The three new movements — verse, quote, calendar — determine whether the homepage earns its standing.

### 7.1 Mast

Unchanged structurally. The search magnifier (§8) is added to it.

### 7.2 Dagens vers

A verse from the Quran, set with the seriousness the text demands, with quiet audio and a single line linking to the Mushaf.

- **Arabic.** A serious Uthmanic-style naskh, aligned to the standard madinan codex. Generous vertical room, right-aligned, proper diacritic spacing. The typographic centrepiece of the site.
- **Swedish translation.** Bernström's *Koranens budskap* (Tarteel slug `sv-knut`), set below the Arabic in the reading typeface, italic, narrower measure.
- **Reference.** Surah name and ayah number (e.g., *al-Baqara 2:255*), quiet and small.
- **Audio.** A single elegant play glyph. No timeline, no scrubber visible until invoked, no reciter dropdown, no next/previous. One reciter, author's choice. Lazy — no file fetched until the user presses play. **This audio is a standalone minimal `<audio>` element; it must not route through the existing `FloatingPlayer` (§11).**
- **Book link.** A single typographic line linking to the chosen edition (e.g., *Koranens budskap hos Adlibris →*). Restrained. Not a button.
- **Resonance — the verse's door into the corpus.** Every verse in the rotation maps to an essay (curation rule, §13.1), so one quiet line in the same register always links to it (e.g., *Essän som växer ur denna vers: Tigerns bön →*). `relatedEssay` is **derived from the verse's footnote citation by the build-time citation index** (§11), not hand-typed, and the build fails if a rotation verse is cited by no essay — the rule is enforced, not just intended. This fuses the sacred frame into the corpus rather than leaving it a standalone widget — the §11 coherence rule made literal, and it keeps the daily verse always one the site has actually written about.

What this is not: a Quran app on a homepage. No tafsir popups, no translation toggles, no copy affordance — the verse is received, not shared from here.

Verse curation: the author provides the rotation list (§13.1), and **every verse must map to an essay** — the rotation is drawn only from verses the corpus already engages (creation, the heart's peace *al-Ra'd 13:28*, the signs in night and day). Not legal verses, not polemical verses.

**Sourcing — verified against the live Tarteel MCP (`mcp.tarteel.ai`); all three pieces come from one source.** Probing `tools/list` and calling the data-only tools confirms Tarteel returns exactly what this module needs:

1. **Arabic + Bernström in one call.** `get_translation_text` with `{ start_ayah, translations: ["sv-knut"] }` returns the Uthmanic Arabic (`text_arabic`, fully voweled) *and* Knut Bernström's Swedish (`translator: "Knut Bernström"`) for the same ayah. The earlier worry is resolved: the Arabic is not in `data/quran.db` (its `text_arabic` is empty), but Tarteel supplies it, and Tarteel carries Bernström directly (slug `sv-knut`). The repo's own Wennerström DB is not used here.
2. **Audio.** `play_ayahs` returns direct CDN mp3 URLs (e.g. `https://audio-cdn.tarteel.ai/quran/.../002186.mp3`). `lookup_reciters` lists the catalog with IDs; the chosen reciter is **Yasser al-Dosari (id 26)** (§13.2).
3. **Rights.** A small rotating set of single verses, sourced through Tarteel's licensed API and displayed with attribution — *"Översättning: Mohammed Knut Bernström, Koranens budskap"* — is within scope (author's call, confirmed). The rotation is a handful of verses received one at a time; do not reproduce large spans.

**Setup-time only — never at build or deploy.** Tarteel is a one-time authoring tool, not a pipeline dependency. A script (e.g. `scripts/sync-verses.ts`, reusing the JSON-RPC/SSE plumbing in `packages/orchestrator/src/services/tarteel-client.ts`) is run *by hand* whenever the curated verse list changes: for each verse key it fetches the Arabic + Bernström text and writes it into the `verser` content collection, and downloads the chosen reciter's mp3s into `public/audio/quran/`. **All of it — text and audio — is committed to the repo.** From then on `astro build` and `pnpm ship` read only those static files and self-hosted audio; Tarteel can be down, rate-limited, or gone and the site builds and deploys byte-identically. There is **no Tarteel call at build or deploy, and none at runtime** — the homepage does only deterministic date-based selection over committed content (same pattern as the quote module, §7.5).

### 7.3 Senaste essän

One essay, the most recent, given more weight than the rest. Larger image, fuller lead. Asymmetric — image and text do not stack into a card. This is where the signature composition lives or dies. (Data is already available: `getArticles()` returns sorted, with `heroImage`/`mobileHeroImage` resolved by slug.)

### 7.4 Nyligen publicerat

Five or six recent essays after the feature. Mixed treatment — alternating image-left, image-right, occasional image-less. Not a rigid 3-column grid. Title and image *are* the link.

### 7.5 Citat

One quote from the corpus, set as an editorial pull-quote, with quiet share.

- A single quote, given space. No decorative quotation marks unless they earn their place typographically.
- Attribution underneath: essay title (linked) and date, in the small meta style.
- Copy and share are invisible until interaction — they appear quietly, not as floating tooltips or chip buttons. On mobile, native Web Share API. On desktop, copy-to-clipboard with a subtle confirmation (a change in the affordance state, not a toast).
- Start with a 5-quote array provided by the author (§13.4), rotated by day. These are editorial pull-quotes *from the essays* (note: distinct from the 59k-quote pipeline database, which does not feed the website). The content model should make extending the list trivial.

The quote sits between the editorial feed and the curated discovery layer as a pause — a moment where the site's voice is sampled before the visitor commits to entering further.

### 7.6 Boken & podden

The collected volume (PDF) and the podcast given a homepage seat — currently buried at the bottom of `/om`. It sits **late in the sequence by design** (after Märkesdagar, before the archive): distribution is the lowest da'wah priority on the page. One module, not two; a short line of editorial voice; direct PDF download and the two podcast destinations (Apple, Spotify — links already in `om.astro`). **Shows the PDF cover image** (§13.8); the rest stays typographic and restrained.

The PDF is a generated artifact: `scripts/generate-pdf.ts` (`pnpm pdf`) compiles `/samlingsvolym.pdf` into `dist/` via **Typst** (an external binary, must be installed where the build runs). Reuse the existing artifact and link path — no new PDF work, and don't re-implement generation. Just confirm the `pnpm pdf` step runs before deploy so the link doesn't 404.

### 7.7 Ämnen och Trådar

Two groupings, kept visually distinct so the page never reads as the same module twice.

**Ämnen — the themed sections (image-led).** The discovery body of the homepage: a run of category sections, each exposing a few essays, **in the §6 da'wah order — Skapelsen first, Norden last** (the sequence carries meaning; do not reorder by recency or size). Built as *editorial sections* (the Aeon / Noēma model in §5), not a blog card-grid. The rules that hold it at the bar:

- The **category heading is the link** to the full ämne. No "se alla →" / "Läs mer →" button under the cards — that exact affordance is the §4 anti-reference; the heading does that job.
- **Title and image are the link** — no card borders, no chrome (the §7.4 principle).
- **No two adjacent sections share a treatment** (the §7 rhythm rule): one ämne as a single large lead plus two small; the next text-led with no images; the next a quiet trio. Varied density is what reads as editorial rather than templated.
- A **one-line editorial sentence** under each heading, in the site's voice — a section is framed, not just labelled.
- About three essays per section; the rest live on the ämne's own page and in the archive (§9). This is also why **Nyligen publicerat (§7.4) stays slim** — the breadth lives here now; recency only shows the newest.

**Trådar — the curated arcs (text-led).** Four to six threads: title, one editorial sentence, essay count, no required imagery. The hand-picked narrative selections (the heart cycle, the Strindberg crisis, the night essays) — deliberately quieter and text-only, so they read as a different register from the image-led ämnen above. (Backed by the `tradar` collection — §6.)

### 7.8 Tänkare

A quiet arrangement of the recurring thinkers as **two facing groups** — the Sunni canon (Ibn Qayyim, Ibn Taymiyya, Ibn al-Jawzī…) and the Swedish/Western voices (Strindberg, Boye, Söderberg, Ellen Key…). The composition itself shows the dialogue that defines the site — 42 of 46 essays hold both traditions at once — without ever declaring it (§2). Name and essay count only; no portraits — the site has none, and adding them would shift the register. (Backed by the `tankare` collection — §6.)

### 7.9 Märkesdagar

Upcoming dates from the Sunni Islamic year, mapped to Gregorian. A quiet two-column rhythm in the editorial register, not a calendar UI.

- Three to five upcoming events shown at any time, rolling forward as dates pass.
- Each row: Gregorian date, event name, Hijri date set smaller alongside or below in the meta style.
- No countdown timers, no urgency styling, no calendar grid vocabulary. Events sit in time; they are not engagement triggers.
- ±1 day uncertainty is inherent (lunar, sighting-based). Use Umm al-Qura (available via the platform `Intl` calendar — §11, no dependency) and present dates as observed, not as oracle.

**Build-time + deploy-cadence caveat — design around it.** Hijri values are computed at build time (§11), and deploys are manual (`pnpm ship`). If the "upcoming three" are *selected* at build time, the list goes stale between deploys. Instead: embed the **full annual table** (a year or two of events, as a build-time-generated static array) and let the client pick the upcoming 3–5 from `Date.now()` on load. Accurate without a runtime Hijri library and without depending on rebuild frequency.

**Selection principle: only observances established in hadith.** Anything debated within Sunni Islam is excluded by design — there is no "contested" tier and no toggle. The set, in Hijri-year order:

- **Islamic New Year** — 1 Muharram
- **Day of Ashura** — 10 Muharram (voluntary fast commemorating Moses, with the 9th or 11th paired)
- **Ramadan** — start and end
- **The last ten nights of Ramadan** — Laylat al-Qadr sought on the odd nights, often emphasised on the 27th *(period)*
- **Eid al-Fitr** — 1 Shawwal
- **The six days of Shawwal** — the recommended fast following Ramadan *(period across the month)*
- **The first ten days of Dhul Hijjah** — the days in which "righteous deeds are most beloved to Allah" (al-Bukhārī); the first nine are days of fasting for non-pilgrims *(period)*
- **Day of Arafah** — 9 Dhul Hijjah (the fast for non-pilgrims is the most virtuous of the year)
- **Eid al-Adha** — 10 Dhul Hijjah
- **Hajj** — 8–13 Dhul Hijjah (the days of Tashrīq, 11–13, conclude it) *(period)*

Optional, author's call — established but **monthly-recurring**, which sits awkwardly in a rolling "upcoming" list: **the White Days** (Ayyām al-Bīḍ), fasting the 13th, 14th, 15th of each lunar month. If included, render them as one quiet standing line, not as twelve entries competing for the upcoming-five window.

Explicitly excluded as debated: Mawlid an-Nabī (12 Rabī' al-Awwal) and Isra wa Mi'raj (27 Rajab). Do not add them.

Design note: distinguish **single days** (New Year, Ashura, Eid al-Fitr, Arafah, Eid al-Adha) from **periods** (last ten nights, six of Shawwal, first ten of Dhul Hijjah, Hajj), which render as date ranges. The build-time table carries every occurrence; the client picks the upcoming three to five (§7.9 caveat above).

### 7.10 Hela arkivet →

A single generously-spaced line linking to `/essaer`.

### 7.11 Footer

Authorship as it appears on `/om`. Canonical and RSS. Nothing more.

## 8. Mobile composition

Mobile is not adapted from desktop — it is composed alongside. The constraints sharpen the work.

- The `Essäer · Om · AI` row stays visible at all viewport widths. No hamburger hiding what is already short.
- Search lives in the mast as a small magnifier, opening a full-screen quiet overlay. Client-side index over titles and leads — the corpus is small enough (§11).
- The Arabic verse must render at mobile widths without compression. If the verse is long, reduce font-size before line-height; never let diacritics collide. Audit at 380px.
- The quote module's share affordance uses the native Web Share sheet — this is where mobile pulls ahead of desktop.
- Thread, thinker, and märkesdagar lists on mobile are the same vertical sequences as desktop. Vertical scroll is the native motion; respect it.
- Hero imagery weight reduces at small breakpoints. The site uses `.webp` with `-mobile` variants already (resolved in `articles.ts`).
- No sticky headers. They eat vertical space and conflict with the calm.

## 9. The archive (`/essaer`)

Currently a flat list, re-sectioned client-side into "Att läsa / Lästa" by reading progress stored in `localStorage` (`rp:<slug>` keys, in `essaer.astro`). The archive is a register, not a feed.

- Primary grouping is by **ämne**, in the §6 da'wah order (Skapelsen → … → Norden) — the category is the archive's main register, so every essay sits under its subject with quiet ämne headings. This is where the exhaustive sort lives (the homepage §7.7 only samples each ämne). A chronological by-year view stays one tap away.
- A single filter row: *Ämnen · Trådar · Tänkare · Längd · Kronologiskt*. Each opens a quiet overlay.
- Reading-time filter as a sub-filter, meaningfully bucketed.
- Rows stay text-led. No per-row thumbnails.
- **Preserve, do not silently discard, the existing read-progress behaviour.** Decide explicitly how it composes with ämne grouping — e.g. a read/unread value-shift on each row within its ämne, rather than two top-level sections. The progress stat ("N av M lästa") is worth keeping.

## 10. The about page (`/om`)

The prose is excellent and untouched. The book and podcast links currently sit after the closing attribution as two separate `aside`s; they are elevated to a single quiet module above the attribution, mirroring (without duplicating) the homepage treatment in §7.6.

That is the only change to `/om`.

## 11. Cross-cutting craft

**Coherence — study the system first, verify the result last (a required step, not a nicety).** The biggest risk now is not any one module failing; it is the new movements (verse, quote, ämnen sections, calendar, thread/thinker pages) coming out as competent but *disjoint* widgets that don't read as one site. Apply three lenses — before building each module, and again before calling it done:

- **Blending with the rest of the site.** Before writing a line, read `tokens.css`, `typography.css`, and `layout.css`, and build *on* them. Reuse the existing type scale, the `--space-*` rhythm, the warm near-black palette, the hairline-divider language, the meta/`label` style (how dates, reading-times and counts are already set), and the existing component idioms (`Header`, `AudioPlayer`). One design system extended — never a second, parallel system invented for the new modules. The benchmark is an existing essay page and `/om`: hold a new module beside them; if the type, spacing, or weight feels even slightly foreign, it is wrong.
- **Gestalt — the page is one composition, not a stack.** The homepage must read top-to-bottom as a single intentional whole (the §7 sequence), with the parts perceived as belonging together: a shared left edge / common measure so modules align rather than each setting its own width; identical treatment of repeated elements (every date, every count, every label set the same way) so similarity binds them; whitespace used to group and separate (proximity), so a reader perceives movements, not a pile of cards. Figure and ground stay calm — content is figure; the warm ground recedes.
- **Visual hierarchy — one focal point per movement, clear primacy overall.** The daily verse (§7.2) is the page's apex — the word of God, the single most prominent moment (da'wah priority, §7, expressed in weight, not noise). The feature essay (§7.3) is second. Everything else is quieter and supports them. Within each module, a single entry point for the eye (title or image), with meta receding. The §7 rhythm rule (no two adjacent sections share a density) is the tool that keeps hierarchy legible — if two neighbours compete, one must yield. Build hierarchy with scale, weight, whitespace and position, never with colour or rules (the palette has no accents).

- **Arabic typography.** No Arabic face ships in the repo today (only Literata + Source Sans 3), so one must be added. Use an OFL-licensed naskh built for Quranic vocalization — **Amiri Quran** (purpose-made for mushaf text) or **Scheherazade New** (full harakat coverage); both self-host cleanly. Avoid the KFGQPC Uthmanic HAFS font as a webfont: it is the truest madinan glyph set but its licence restricts redistribution. Subset to `woff2` and load it through the existing `Font` component pattern in `Base.astro`. Test harakat against the curated verses at every breakpoint before considering the work done.
- **Search.** Client-side, build-time indexed over titles and leads. Trust the agent to pick the tool; the corpus does not warrant infrastructure.
- **Audio (verse).** One standalone inline `<audio>` element for the daily verse, lazy-loaded, no third-party player UI. **Do not reuse `FloatingPlayer.astro`** — it carries a scrubber, speed toggle, and podcast-subscribe links, which is exactly the Quran-app chrome §7.2 rejects. The play affordance and its playing/paused states are the only audio chrome. (`FloatingPlayer` remains the player for essay/podcast audio elsewhere.)
- **RSS.** Already complete — `rss.xml.ts` builds items from `getArticles()` (every essay included automatically) with full rendered content, and `Base.astro` advertises it via `<link rel="alternate">`. Leave it; just keep new content types (verses, threads) out of the feed unless deliberately intended.
- **OG images.** Per-essay imagery is good (static hero `.webp`). Threads and thinkers need typographic OG — this is the one genuinely net-new piece of infrastructure in the plan (build-time image generation, e.g. Satori / an Astro endpoint). Budget for it; keep it build-time, not runtime.
- **Citation index (build-time).** A small read-only parser over the essay footnotes — uniform `Koranen, <surah> N:N` across all 46 — yields an essay→verse index. It **derives and validates** the verse `relatedEssay` links (§7.2): the link is read from which essay actually cites the verse, and the build fails if a rotation verse is cited by no essay (enforcing the §13.1 rule). No new authored data — pure derivation from content already in the essays (the corpus cites 127 distinct verses, so the verse pool scales with the work).
- **Structured data.** `Article` per essay, `CollectionPage` for the archive, threads, thinkers.
- **URLs.** Swedish, lowercase, ASCII-folded: `/tradar/hjartats-anatomi`, `/tankare/ibn-qayyim`.
- **Diacritics.** Arabic transliteration is set in italics with macrons throughout the corpus. The CSS must render *ḥ*, *ṣ*, *ā*, *ī*, *ū* with proper spacing and weight.
- **Hijri calculation.** No dependency and no hand-transcribed tables: `Intl.DateTimeFormat` with the `islamic-umalqura` calendar is built into Node/V8 and returns Umm al-Qura values (verified — `Intl` converts Gregorian→Hijri; finding the Gregorian date of a future Hijri event is a short forward search over that primitive). Generate the static event table at setup/build time from it (see §7.9 for why the upcoming-selection happens client-side). The ±1-day sighting caveat still stands — present dates as observed, not oracle.
- **Web Share API.** Used for the quote share on supporting devices; degraded to copy-to-clipboard elsewhere.
- **Astro.** Zero JS by default; partial hydration only where audio, search, and share need it; content collections for essays, threads, thinkers, and verses; the image pipeline for responsive imagery. Use it well; do not prove you are using it.

## 12. Implementation phases

Ship incrementally. Each phase ships independently.

**Coherence gate — every phase, before it ships.** A module is not done when it works; it is done when it disappears into the whole. Before shipping any phase: view the new work *in the full page* and on mobile (audit at 380px), beside an existing essay page and `/om`, and apply the three lenses in §11 (blending, gestalt, hierarchy). If anything reads as bolted-on — foreign type, its own width, a competing focal point — fix it before moving on. This gate is mandatory, not a final-polish afterthought.

**Phase 0 — Author inputs (§13).** ✅ Complete. All editorial inputs resolved — reciter, verse rotation, quotes, thread definitions, thinker confirmation (§13). Verse sourcing was already verified (Tarteel supplies Arabic, Bernström, and audio — §7.2).

**Phase 1 — Homepage recomposition.** Tear out the carousel (§3). Feature treatment, restructured recent list, book & podcast module. Mobile alongside.

**Phase 2 — Sacred frame.** Run the one-time `sync-verses` script and **commit** the fetched assets (Arabic + Bernström text → `verser` collection, reciter mp3s → `public/audio/quran/`); then build the daily verse module against those committed files (no Tarteel at build/deploy, §7.2). Plus the quote module (5-item array, copy/share). The two modules that define whether the site earns its standing.

**Phase 3 — Discovery scaffolding.** Thread and thinker content collections (§6). Index and detail pages. Homepage sections appear.

**Phase 4 — Calendar and archive.** Märkesdagar module (full-table + client-side selection, §7.9). Archive redesign with year grouping, filter row, client-side search overlay, read-state preserved (§9).

**Phase 5 — About page elevation.** Book/pod module repositioned within `/om`.

## 13. Author inputs — resolved

All editorial inputs are settled; no open decisions remain. Implementation reads the lists below as the source of truth until they live in content collections. Everything else is the agent's craft.

**Closed earlier:** translation → Bernström *Koranens budskap* (`sv-knut`, with the Arabic, §7.2); Mawlid/Isra → excluded (§7.9); ämnen taxonomy → 7 names set and all 46 essays assigned (review only); book module → **shows the PDF cover** (§7.6).

**Reciter (§13.2):** Yasser al-Dosari (Tarteel id 26).

**Verse rotation (§13.1)** — **every verse maps to an essay**; the rotation is curated *from* the corpus, so the daily verse is always one the site has written about. Bernström text + Uthmanic Arabic + Dosari audio fetched by `sync-verses`; none legal or polemical. `relatedEssay` is derived and validated by the citation index (§11) — the §7.2 resonance link:
- al-Raʿd 13:28 → *Längtan heter ångest* (the heart's unrest)
- Āl ʿImrān 3:190 → *Ljusa blå natt* (the signs in night and day)
- al-Isrāʾ 17:44 → *Tigerns bön* (the essay is built on this verse)
- al-Mulk 67:3 → *Vintergatan vi släckte*
- al-Zumar 39:42 → *Sömnens lilla död*

(Dropped: al-Baqara 2:186 — no essay, stays only on `/om`; Qāf 50:16 — no essay. Re-add only with an essay to point at.)

**Citat (§13.4)** — verbatim, the essay's own voice, one per ämne:
- *Lögnens bokföring* — "Lögnen skickar ingen räkning omedelbart. Den fakturerar på kredit. Och den tar ränta."
- *Tigerns bön* — "Berget kan inte falla. Därför kan det heller inte resa sig. Den som legat sömnlös och ändå reser sig till gryningsbönen vet vad det kostar."
- *Äter ni var för sig?* — "Bekvämligheten förfinar smaken. Den förfinade smaken gör aptiten privat. Den privata aptiten löser de band som en gång höll gruppen samman."
- *Tid till salu* — "Att ta ränta innebär att tvinga spegeln att alstra eget ljus. Men speglar alstrar inte ljus. De kastar det tillbaka."
- *Vikingarna hade inte ångest* — "Ingen tvekan, ingen ångest. Han ser, väljer, handlar."

**Trådar (§13.6)** — slug, members, and the one-sentence framing for the `tradar` collection:
1. `hjartats-anatomi` — langtan-heter-angest, ormboet-i-hjartat, det-enogda-begaret, passionens-klangvaxt, lejonet-i-hjartat, sjalens-infargning. *"Som en läkare kartlägger kroppens sjukdomar kartlade Ibn Qayyim al-Jawziyya hjärtats — begärets stadier, blickens dubbelhet, vanans långsamma infärgning."*
2. `tungan-och-sanningen` — det-tungan-inte-nar, tungans-fastning, lognens-bokforing, rosten-over-taken, eld-mot-en-rost. *"Talet kan erövras genom lögn och lika säkert genom tystnad — om vad ett ord kostar, från sanningens pris till böneutropets ord över taken."*
3. `natten` — ljusa-bla-natt, nattbonens-ansikte, somnens-lilla-dod, traden-hade-andakt, silvertarnans-hijra. *"Natten flås ur dagen som ett skinn, säger Koranen — om sömnlöshet och vaka, om bönen som väcker och sömnen som är dödens lilla syster."*
4. `maskinen-och-manniskan` — chipet-och-riddjuret, den-starkaste-tjanaren, bergen-som-vagrade, serumet-och-blicken. *"Vad händer när människan delegerar sina beslut till maskiner som inte kan bäva inför dem?"* Framing may name al-Aḥzāb 33:72 (the *al-amāna* the mountains refused), which 3 of its 4 essays cite.
5. `strindbergs-kris` (tightest — 3 firm) — skapad-ur-ingenting, strindbergs-enda-steg, kompassnalens-moske (+ det-han-letade-efter optional). *"Under Inferno-åren prövade Strindberg varje hållning han kunde nå, och ingen bar hans vikt."*

**Tänkare (§13.7):** §6 list confirmed against the corpus — all 18 stand, counts exact, low-frequency names verified as genuine interlocutors; Sībawayh stays dropped (1 essay). No pruning.

---

*The site is good. This plan gives the content more doors and frames it within the source text and the calendar. All editorial inputs are now settled (§13); what remains is the build — beginning with the Phase 1 carousel teardown.*
