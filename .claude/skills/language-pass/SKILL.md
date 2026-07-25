---
name: language-pass
description: Retroactive Swedish language pass over one or many already-published islam.se texts (data/articles/*.md essays, data/svar/*.md answer pages) — raise the prose to the essay bar and remove anglicismer, latinismer and AI-tics, plus house typography, without touching quotes, footnotes, headings or the SEO frontmatter of a page that already ranks. Use when asked to "gå igenom texter i efterhand", "polera texten/språket", "språkgranska", "höja svenskan", "få bort anglicismer/latinismer/ai-tics", or to review, proofread or improve the Swedish of existing pages — one page or a whole batch. Not for producing new pages: that is svar-answer-page or `pnpm produce`.
---

# Språkpass — reviewing published texts after the fact

The pipeline polishes a text once, on the way out. This skill is the pass that
happens *afterwards*, over text that is already live: one page, a dozen, or the
whole corpus.

**The point of the pass is the prose.** Everything mechanical below is a floor,
not a goal. A page can pass every lint and still be flat, and a flat page is a
failed page. The user's standard, stated plainly: *the language must hold the
same class as the essays.*

**Three things must come out, every time** (the user's explicit priority):

1. **Anglicismer** — English thought translated into correct-but-foreign Swedish:
   *i termer av*, *baserat på*, *det kan argumenteras*, *narrativ*, *vokabulär*,
   *navigera komplexiteten*, *det är värt att notera*.
2. **Latinismer** — the Latin word where Swedish has its own: *kontext* →
   *sammanhang*, *fundamental* → *grundläggande*, *aspekt* → *sida*, *komplex* →
   *invecklad*, *specifik* → *bestämd*, *implicit* → *outtalad*.
3. **AI-tics** — constructions that are perfectly good Swedish until you count
   them. The frequency is the tell, so every one has a cap: *inte X utan Y* (≤2),
   *snarare än* (≤2), *skillnaden är* (≤1), *insikt* (≤2), *paradox* (≤1),
   *Sammanfattningsvis* (0), semicolon chains (≤1/stycke), *Denna…* as paragraph
   opener (≤2).

`scripts/check-language-tics.py` finds all three mechanically — it carries the
full tables from both rulebooks, not the narrow subset `evaluate-article.py`
scores against. Run it first, then judge each hit by ear; the script proposes,
you decide.

## The house signature — protect it

The corpus's best sentences share one form, the balanced semicolon antithesis:

> Sadaqa är frivillig generositet; zakat är de fattigas rätt.
> Iblīs föll aldrig från änglarnas led; han stod aldrig i den.
> Budskapets kärna lever kvar; bokstaven är förlorad.
> Ödet förklarar det som drabbar människan; det ursäktar aldrig det hon väljer.

`swedish-voice.md` §7 caps semicolons at one per paragraph. That rule is written
against the English semicolon chain ("utmanar; provocerar; tvingar") and applying
it literally lints away the best thing this corpus does. **Do not.** The tic is a
*chain* of three or more clauses; a single load-bearing antithesis is a strength,
and semicolons inside citations (`Bukhārī 5729; Muslim 2219`) or separating list
items that contain commas are simply correct punctuation. `check-language-tics.py`
now encodes exactly that distinction — the naive reading produced 38 flags corpus-wide,
of which nearly all were false; the corrected rule leaves 6.

The general lesson: the tools propose, you decide. Three of four flags on the
cornerstone pages were false (deliberate parallelism, a citation, a serial list).
A flag is a question, never an instruction.

## The bar

`data/articles/*.md` **is** the bar. Before editing anything, read one essay end
to end — `kottet-och-tecknet.md` (qualityScore 9.0) or `strindbergs-enda-steg.md`
— and carry its sentence rhythm in your ear while you work. From `polish.md`:
Strindberg's essays, Lagerlöf's meditations, *Axess*, *Respons*. Prose where the
writing is part of the argument. A sentence that only conveys information fails.

For answer pages the second benchmark is `data/svar/vad-ar-kaba.md`, the genre's
peak.

**Craft is shared; register is not.** The essay bar means the *sentence-level*
standard — rhythm, precision, verbs over noun-chains, closings that land. It does
not mean turning an answer page into an essay. A `/svar/` page stays
answer-first, third person, encyclopedic, question-shaped H2s; that structure is
what makes it rank and what makes an AI Overview quote it. Raise the sentences
inside the structure. Never restructure toward the essay genre.

## The rulebooks (read them, don't re-derive them)

Two files in the repo are canonical. Read both at the start of a pass — they hold
several hundred lines of specifics this skill deliberately does not duplicate:

- `packages/orchestrator/prompts/swedish-voice.md` — §1–16 English-thought prose,
  §17 word level (invented words, gender, prepositions), §18 the *countable* AI
  patterns with hard caps ("inte X utan Y" ≤2, ordmonotoni table, attribution
  verbs, "Koranen [verb]" ≤3, em-dash budget). §16 is the constructive half:
  inversion, compounding, participles, the connectors (*därav*, *häri*,
  *nämligen*) that compress a whole clause into one word.
- `packages/orchestrator/prompts/polish.md` — the reader's pass. Momentum
  killers, rhythm, the corpus-measured LLM tics ("inte för att X — utan för att
  Y", "snarare än", "skillnaden är", "paradox", the italic-term-then-gloss
  formula), and what you may *add*: silence after density, a concrete image, a
  beat of surprise.

Plus the accumulated corpus knowledge in memory: `[[essay_ai_tics_language_pass]]`
(the pipeline's signature tics and what was already fixed), `[[feedback_article_opening]]`,
`[[fakta_cornerstone_audit]]` (the binding svar conventions),
`[[orthodoxy_review_guardrail]].`

## Workflow

### 0. Scope and baseline

Resolve the target set to concrete paths. Then check `git status` — the guard in
step 3 diffs against `HEAD`, so know which files were already dirty before you
started (at the time of writing, the 12 cornerstone svar pages carry uncommitted
scholar-quote work).

**Batch size.** A real prose pass requires reading the whole file and hearing it.
Cap deep passes at **~6 pages per session**; beyond that quality decays into
find-and-replace. A mechanical-only sweep (typography, guillemets, `idag`) can
safely cover all 116 files at once — just say in the report which kind of pass
each file got. Never let a mechanical sweep be reported as a language pass.

### 1. Triage — measure before reading

```bash
cd /home/yunus/Work/islam.se
python3 scripts/check-language-tics.py --corpus data/svar/*.md   # anglicismer, latinismer, ai-tics
python3 scripts/check-house-style.py data/svar/*.md              # husets typografi och konventioner
python3 scripts/check-cross-page-facts.py data/svar/*.md data/articles/*.md   # motsägelser MELLAN sidor
python3 scripts/evaluate-article.py data/svar/*.md               # upprepningar, fotnoter, kursivering
```

- **`check-language-tics.py`** is the primary tool for this skill's three
  priorities. Anglicisms and latinisms are reported per occurrence (always
  wrong); AI tics are reported against a per-file cap with the surrounding
  phrase and a concrete replacement. `--category anglicism` narrows it,
  `--corpus` ranks which patterns recur across the whole batch. Quotes are
  masked out, so a hit is always the author's own Swedish.
- **`check-house-style.py`** is genre-aware (svar vs essay from the path) and
  grades `error` / `warn` / `info`.
- **`check-cross-page-facts.py`** catches the one defect class hand-editing makes
  *worse*: a reader of one page structurally cannot see the other 115. Three
  checks — `fakta` compares prose against a curated registry of the house's
  decided figures (ummah size, hajj pilgrims, nisāb, zakat rate…), `källa` finds
  the same source reference quoted with different wording, `dubblett` finds
  near-identical quotes that differ. **Add a registry entry every time a figure is
  decided** — that is what turns a house decision from spoken into enforced.
  `--check upptäck` runs generic numeric extraction to find registry candidates;
  it is noisy on purpose and off by default.
- **`evaluate-article.py`** stays the pipeline's stable scoring baseline —
  useful here for repetitions, orphaned footnotes and italics consistency.

All three take globs and print a batch summary. Use the numbers to *order* the
work, never to define it. A file with 0 mechanical issues can still be the
flattest page on the site.

The `--corpus` view has a second purpose: a pattern that recurs across many files
is a **prompt** problem, not a text problem. Fold those lessons back into
`swedish-voice.md` / `polish.md` / `svar-author.md` so the next generation starts
higher.

### 2. The pass itself, one file at a time

1. **Read the whole file.** Not a grep — the whole thing, frontmatter included.
2. **Score each `##` section 1–5** the way `polish.md` prescribes: 5 = lives and
   drives forward, 3 = correct but flat, 1 = the reader's attention leaks out.
   Name the single strongest and single weakest sentence. This is the diagnosis
   that makes the edit purposeful instead of cosmetic.
3. **Edit with the `Edit` tool, one targeted replacement at a time.** Never
   rewrite a file with `Write` — that is how a verified quote silently changes a
   comma and nobody notices for six months.
4. Work the layers in order: **prose** (sections scoring ≤3 — momentum, rhythm,
   landings), then **anglicisms and latinisms** (every one, they are simply
   wrong), then **AI tics** down to their caps, then **house typography**.
   Prose first is deliberate: rewriting a flat paragraph often dissolves the tic
   inside it, whereas fixing the tic first leaves the flatness untouched.
5. When a fix is available in more than one shape, vary it. The 2026-06-13
   re-pass learned this the hard way: a fix applied uniformly becomes the next
   tic.

### 3. Verify

```bash
python3 scripts/check-protected-regions.py data/svar/vad-ar-zakat.md   # bevis: bara prosan rördes
python3 scripts/check-language-tics.py data/svar/vad-ar-zakat.md       # anglicismer/latinismer = 0
python3 scripts/check-house-style.py data/svar/vad-ar-zakat.md         # ska vara ren
git diff data/svar/vad-ar-zakat.md                                      # läs varje rad
```

`check-protected-regions.py` compares the working copy against git (`--base` to
pick another ref) and fails if anything changed inside a protected region —
frontmatter, blockquote content, headings, footnotes, inline quotes, or the verse
references that drive the recitation players. Treat a red result as a bug in your
edit, not in the guard.

Then build. **The Astro content cache must be cleared first or you will verify
stale content:**

```bash
rm -f apps/web/node_modules/.astro/data-store.json
pnpm --filter @islam-se/web build
```

### 4. Report and hand over

Per file: sections scored, what changed and why, before/after counts, and —
separately — everything you *flagged but did not change* (frontmatter wording,
doctrinal doubts, quotes that look mistranslated). Those are the user's call.

This is YMYL religious content on a site that ranks. **Do not deploy.** The user
reviews and ships with `pnpm ship`.

## What you never touch

| Region | Why |
|---|---|
| Blockquote content (`>` lines) | Verified source text. Not a word, not a comma — including an em dash the house style would otherwise forbid. |
| Inline quotes `"…"` | Same rule. You may change the *delimiters* (»…« → "…"), never the words inside. |
| `> — Koranen 9:103` attribution lines | **Load-bearing.** `rehype-quran-verse.ts` matches this at end-of-line to inject the svar recitation player. Reword it and the player disappears. |
| Footnote definitions `[^N]: Koranen, Yūnus 10:36.` | **Load-bearing.** Same plugin, essay path, plus the daily-verse citation index in `src/lib/citations.ts`. The digits are the key; the surah name is a display label. |
| Footnote markers and their numbering | Sequence breaks silently. |
| Headings | Structure — and on svar pages each `##` is a real search query, i.e. a ranking asset. |
| Frontmatter | On a page that already ranks, `title`/`description`/`keywords` are SEO load. Flag improvements; change only with the user's approval, or when something is factually or doctrinally wrong. |
| `related` slugs | A dangling slug crashes the build. |
| Arabic transliteration variants in essays | Standing user directive: focus on the Swedish. Do not harmonize Taymiyyah/Jawziyyah/Ghazali spellings. |
| `ﷺ` `ﷻ` | Wrapped by `rehype-honorific.ts`. |

Two more shapes that break rendering rather than meaning:

- **An essay's first character** may not be `>`, `"`, `”`, `«` or Å/Ä/Ö — the
  dropcap (`::first-letter`) breaks. Start with a plain word.
- **Don't introduce ALL-CAPS runs**: `remark-abbr.ts` turns any 2+ uppercase
  sequence into small-caps `<abbr>`.

## House conventions

Enforced by `check-house-style.py`:

| Rule | Convention |
|---|---|
| `em-dash` | Prose uses the spaced en dash ` – `. The em dash `—` belongs only in a blockquote attribution. |
| `guillemets` | `"…"`, never `»…«`. |
| `curly-quotes` | Straight `"`, not `”`. |
| `idag` | *i dag*, two words. |
| `mekka` | *Mecka*. |
| `du-tilltal` | Svar pages are third person — *muslimen*, *den som*. (Inside a quote it is fine.) |
| `body-kallor` | No `## Källor` in a svar body; frontmatter `sources` renders the list. |
| `dropcap-opening` | See above, essays only. |
| `sunnitisk` | Avoid in copy — *klassisk* / *islamisk*. (*sunnimuslimer* as a demographic is fine.) |
| `dot-under` | Svar pages transliterate without dots below (*tawhīd*, not *tawḥīd*); macrons stay. Essays keep full transliteration. |
| `seesaw-closers` | At most 2 sections per svar page may land on "inte X, utan Y". |
| `dash-budget` | ~6 authorial dashes per svar page. |
| `unspaced-dash`, `double-space` | Residue from hand edits. |

Not machine-checkable, still binding: *Muhammed* in Swedish prose, divine
pronouns lowercase outside quotes, *de lärda*, Swedish-primary biblical names
(Abraham, Mose (Mūsā)), "omkring två miljarder" for the ummah, no
"gränsen mellan X och Y" closers (that is kaba's signature).

## Traps

- **The Astro data store caches content.** `rm -f apps/web/node_modules/.astro/data-store.json`
  before any build you intend to trust.
- **Description drift.** House pattern for essays is `description` == the body
  opening. Rewrite the opening and the two silently diverge — flag it rather than
  editing frontmatter yourself.
- **A quote can be wrong.** Quote *integrity* means you don't touch it. If the
  translation looks off or the same source is rendered differently in two files,
  report it; the user decides, and verification runs against the source per
  `[[quotes_db_arabic_attribution_trap]]`.
- **Uniform fixes become the next tic.** Vary.
- **`check-house-style.py` reads the genre from the file path.** Run it on copies
  that don't live under a `/svar/` directory and every svar-only rule silently
  switches off — a "before/after" comparison against a scratch copy will lie.
- **`quran-verses.json` lists only verses that have already been synced.** A verse
  missing from it says nothing about whether recitation audio exists; the vendored
  QUL segment file (`apps/web/scripts/data/qul-alnufais-segments.json`) covers all
  6236 ayat. If a page cites the Quran and shows no player, the fix is an
  attribution line plus `pnpm sync-verses`, not a shrug.
- **The attribution line is functional, not decorative.** `rehype-quran-verse.ts`
  matches `> — Koranen N:N` anchored at end-of-line. A reference written inline as
  `(Koranen 21:22)` renders no player at all.
- **Markdown silently collapses a verse-per-line blockquote into running prose.**
  An author who sets a sura or a poem on separate `>` lines gets one paragraph:
  al-Fatiha rendered as a block on the very page whose prose says "på sju rader",
  and Martinson's *Aniara* was set as prose in the essay about *Aniara*. Fix with
  a markdown hard break — two trailing spaces on every line of the block **except
  the last** (the attribution line, or the line carrying the footnote marker).
  Verify in the browser: `blockquote.querySelectorAll('br').length`.

## Current backlog (measured 2026-07-25, all 116 files)

**Language (`check-language-tics.py --corpus`) — 42 files clean, 74 with hits:**

| | Count | Files |
|---|---|---|
| Anglicismer | 4 | *vokabulär* ×2, *navigera* ×2 |
| Latinismer | 14 | *legitim*, *specifik*, *dominera*, *dimension*, *position*, *tolerera*, *manifest* |
| Akademiskt | 1 | *ontologi* |
| **AI-tics** | **176** | dominated by **"inte X utan Y": 97 over-cap hits across 35 files** — the single biggest language defect in the corpus, exactly the ~7.4/article that `swedish-voice.md §18` measured. Then semicolon chains (38 in 34 files), "Den som…" openers (11), *diagnos* (9), *skarp* (5). |

The vocabulary layer is in good shape — the earlier sweeps did their job. The
*construction* layer is not: a third of the corpus still see-saws.

**Typography (`check-house-style.py`) — 45 files with errors** (26 svar, 19
essays): 149 em dash in prose, 8 guillemets, 3 du-tilltal. Most essay hits are a
single `imageCaption: "… — …"` in frontmatter, which the earlier dash conversion
only applied to body text. The svar hits cluster in the ~50 pages that were never
part of the 2026-07-09 cornerstone fix pass; the 12 cornerstone pages are clean.
Worst: `vad-sager-islam-om-hedersmord`, `aktenskap-i-islam`,
`det-muslimska-spanien-al-andalus`, `hur-blir-man-muslim`, `vad-ar-koranen`,
`vad-ar-sharia` (9–10 errors each).

All of that is still only the measurable floor. Prose quality across the
non-cornerstone svar pages has never been audited against the essay bar — that is
the real work.

## Key files

- Rulebooks: `packages/orchestrator/prompts/swedish-voice.md`, `polish.md`
- Tools: `scripts/check-language-tics.py` (anglicismer/latinismer/ai-tics — this
  skill's main instrument), `scripts/check-house-style.py`,
  `scripts/check-protected-regions.py`, `scripts/evaluate-article.py`, and the
  narrower `scripts/find-{repetitions,colloquial,italics-inconsistency,orphaned-footnotes,idiom-opportunities}.py`
- Corpus: `data/articles/*.md` (53 essays), `data/svar/*.md` (63 answer pages)
- Rendering that constrains the text: `apps/web/src/plugins/rehype-quran-verse.ts`,
  `rehype-honorific.ts`, `remark-abbr.ts`, `apps/web/src/lib/citations.ts`
- Sibling skill for *producing* new answer pages: `.claude/skills/svar-answer-page/SKILL.md`
