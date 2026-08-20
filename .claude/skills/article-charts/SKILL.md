---
name: article-charts
description: Add a chart to ONE islam.se text — an essay (data/articles/*.md), a fördjupning (data/fordjupning/*.md) or ett svar (data/svar/*.md) — as a ```chart fence that renders to build-time SVG on the web and into the PDF and EPUB books. Covers when a chart earns its place, which of five forms to reach for, how to source it, and where to find open Swedish and international data. Use when asked to "lägga till ett diagram", "visualisera siffrorna", "göra en graf", "illustrera statistiken", to chart data in a new or published text, or to check whether a number in an article should be shown rather than told. Not for producing the text itself: that is svar-answer-page, fordjupning-page or `pnpm produce`. Not for the /moskeer or /bonetider page furniture, which owns its own components.
---

# Diagram i artiklar (```chart)

`data/fordjupning/abort.md` states seven separate percentages. `griskott.md` three,
`kaba.md` three, `doden.md` two. Not one of them is shown. The reader gets a figure in the
middle of a sentence and has to hold it there while the argument moves on.

The site was never short of the craft. `AnnualPrayerChart.astro` is a 266-line static SVG
chart and `/moskeer` carries two CSS bar charts — but all of it lived in hand-built
`.astro` pages, and an article body had no way to hold anything at all: no MDX, no raw
HTML, no directives, and until 2026-08 not one fenced code block in 136 files.

There is now a mechanism, and this skill is about using it well. **The mechanism is the
easy half.** The hard half is that most numbers should not become charts, that a Swedish
dataset almost never measures the thing the sentence is about, and that the category a
dataset hands you may be one this site does not print.

**One text per session. Never batch. Never commit, never deploy** — the human checks every
figure against its source and ships with `pnpm ship`.

---

## ⭐ The one test: does the chart carry the argument?

DESIGN.md Principle 4 is the whole rule: *if I remove this, does the reading experience get
worse?* A chart that restates a sentence is decoration, and decoration comes out.

**Passes.** The chart does something the sentence cannot:

- The sentence gives one number; the shape of the others is the point.
  »En tredjedel av mänskligheten har aldrig sett Vintergatan« — and in Europe it is ninety
  per cent. Two bars make the gap a fact you see rather than a comparison you compute.
- A trend is the claim. »Antalet moskéer har vuxit stadigt sedan 1970-talet« is a sentence
  about a curve; six columns are that curve.
- A proportion is being argued about. »Religiösa motiv utgör en dryg sjättedel av
  hatbrotten« — a single segmented bar settles what »en dryg sjättedel« means.

**Fails.** Delete these:

- One number, no comparison. A bar chart of a single value is a number in a costume.
- The figures are already a list the reader can read. Three values in a sentence are a
  sentence.
- The chart exists because the section looked long. That is a layout problem; fix the
  layout.

If you cannot say in one clause what the chart shows *that the prose does not*, there is
no chart to add.

---

## Choosing which text to work on — the sweep

Do not go looking by hand, and do not start from a hunch about which page "feels
statistical". Run the survey:

```bash
python3 scripts/find-chart-candidates.py            # hela korpusen, rangordnad
python3 scripts/find-chart-candidates.py --top 5
python3 scripts/find-chart-candidates.py data/articles/*.md
```

It ranks passages that hold **three or more comparable numbers**, and marks with ⭐ the
ones where the author is already comparing in prose (»spänner från … till«, »mot«,
»medan«, »andelen«). A ⭐ is the strongest possible signal: the comparison exists, it is
just trapped in a sentence. ⛔ marks a passage that names *inriktning* — read the category
trap below before touching it.

### ⭐ On a cornerstone page, ask what the reader asked

The sweep above is **reactive** — it can only find a chart for a number the author already
wrote. On a pillar page that is the wrong end. Those pages carry `keywords:` and `faq:` in
frontmatter, and those are not decoration: they are a transcript of what someone typed
into a search box. Run:

```bash
python3 scripts/find-chart-candidates.py --gaps data/fordjupning/*.md
```

A page whose own keyword is »hur många moskéer finns i Sverige« and which answers it only
in prose has a chart-shaped hole that no body scan can find, because the body is what is
missing.

Then rank by three tests, in this order:

1. **Is there a verified source?** No source, no chart, however good the question.
2. **⭐ Does it overturn what the reader assumes?** This is the one that separates a good
   chart from a decoration. `halal.md`'s 84 / 75 / 63 procent stunned is high-value
   precisely because the reader arrives believing halal means unstunned. A chart that
   confirms the obvious has spent the reader's attention to tell them nothing.
3. **Is the figure already on nine other pages?** Then it belongs on the one page that
   explains it, not here.

**Prefer data the site owns.** `apps/web/src/data/moskeer-sverige.json` is 234 curated
mosques with a county on every one — a dataset no competitor has, answering that page's
top query, and with **no `inriktning` field**, so the category trap is not merely avoided
but structurally impossible.

⚠️⚠️ **A well-sourced chart can still be a false claim. Check for structural bias, not
only for sourcing.** The same mosque dataset carries an opening year for 170 of 234, and
the decades look like a clean series — 2 · 11 · 43 · 35 · 65 · 14 from the 1970s. Do not
chart it. Three things are wrong at once: 27 procent of the rows have no year and would
vanish silently; the 2020s are a decade in progress and would read as a collapse, the same
artefact as MUCF's 2025 rule change; and the file lists mosques that exist **now**, so
every congregation that closed is missing and the early decades are undercounted by
construction. A snapshot cannot be read as a history. The county distribution from the
same file has none of these problems, because a current snapshot is exactly what it is.

**The sweep is read-only and corpus-wide. The work it feeds is one text at a time.**
That split is the whole point. Ranking 136 files is cheap and safe; editing them is
neither, and a batch pass would put a near-identical bar chart on nine pages — the exact
failure `fordjupning-page/SKILL.md` records for prompt examples.

⚠️ **What the sweep is bad at, and why you still read the passage.** It scores
comparability, not meaning. Measured against the corpus 2026-08-20:

- It ranked `griskott.md`'s *slaughter* numbers (2 579 100 grisar, 245 700 ton) beside its
  *consumption* numbers (29,3 / 23,4 / 22,4 kilo). Only the second set is a chart; the
  first is three quantities of three different things.
- A page can hold the same figure as another nine pages. The estimate of how many muslims
  live in Sweden appears in `moske`, `tvagning`, `ramadan`, `koranen`, `hijab`, `uttryck`,
  `halal`, `griskott`, `doden` and the essay `vid-samma-bord`. Charting it on each would
  put ten copies of one figure on the site and ten chances to disagree with itself. It
  belongs on **one** page. Run `check-cross-page-facts.py --check fakta` across the whole
  corpus, not the edited file, before shipping any chart built on a shared number.
- It cannot see a chart whose data is not in the text at all. The strongest charts on this
  site may be ones where the prose gestures at a trend and the figures have to be fetched
  from SCB or Pew. See `DATAKALLOR.md`.

---

## Workflow (one text per session)

**0. Read the whole text first.** Not the section with the number in it — the whole thing.
A chart lands in an argument, and you cannot place it without knowing where the argument
turns.

**1. Find where a number is doing work.**

```bash
grep -nE "procent|[0-9]+ ?(miljoner|miljarder|tusen)|\b(en|två|tre|fyra) (tredjedel|fjärdedel)" data/fordjupning/<slug>.md
```

Then ignore most of the hits. You are looking for the one figure the paragraph *turns on*.

**2. Find the data.** `DIAGRAMKALLOR` is in the sibling file — read `DATAKALLOR.md` before
searching the open web. It carries verified endpoints, licences and the five things that
break an agent working from memory (SCB's v2 is not on `api.scb.se`; Kolada v2 is gone;
SST no longer exists; Eurostat's old REST is dead; Brå is biennial now).

**3. Verify the figure against the primary source. ⭐ Call the API, do not read the report
page.** Not a news article about the source, not your own memory, and not the agency's
own summary page — that page is a *press* rendering of the data and it drops categories
without saying so. Measured 2026-08-20 on `griskott.md`: Jordbruksverket's report page
listed five meats summing to 78,3 of a stated 79,9 kilo, and the missing 1,6 was
**fårkött**, which sits in `JO1301K2.px` as its own row. Reading the page instead of the
table left a hole that had to be guessed at; the API answered it exactly.

So: fetch the table, then cite the report. The dated, article-numbered publication is the
better `source:` string — but the numbers come from the query. `DATAKALLOR.md` carries the
roots and table ids, and its entries are written from live calls for this reason.

**When the API does not have the subject, write that down.** Socialstyrelsen's
`/api/v1/sv` has fourteen datasets and abortion is not one of them; the data is in a
separate PxWeb instance and in an xlsx annex to the annual publication. That is a fine
primary source — but the *next* session will re-discover the gap unless the entry in
`DATAKALLOR.md` says so. Fix the entry in the same pass.

If the endpoint does not answer at all, you have no `sourceUrl:` — write the source name
without a link and say so to the human.

> **En källa utan länk är korrekt. En påhittad länk är en förfalskning.**

**4. Choose the form.** `DIAGRAMFORMER.md` has the decision table. The short version:
comparing named categories → `bars`, which should be most charts. Ordered buckets or time
with short labels → `columns`. A trend over six or more points → `line`. Before-and-after
across several things → `slope`. Parts of a whole → `stack`.

**5. Write the fence**, immediately after the paragraph that establishes the number and
before the paragraph that interprets it.

````markdown
```chart
type: bars
unit: procent
source: Falchi et al., "The New World Atlas of Artificial Night Sky Brightness", Science Advances 2:6, 2016
note: Andelen som lever under en himmel där Vintergatan inte längre går att urskilja.
emphasis: Europa
data:
  Europa: 90
  Världen: 33
```
````

**6. Rewrite the prose so it hands off.** This step is not optional and it is the one that
gets skipped. A sentence that repeats what the chart already shows, sitting next to the
chart, is the failure this skill exists to prevent. The paragraph before should set up the
comparison; the paragraph after should say what it means. Neither should recite the
numbers.

**7. Put the source in the page's own apparatus**, not only in the figcaption:

| Genre | Where |
|---|---|
| `data/fordjupning`, `data/svar` | a `sources: [{ name, url }]` entry in frontmatter — it renders under Källor and `check-source-urls.py` then covers it |
| `data/articles` | a GFM footnote on the sentence that hands off |

Cite it **the way the page already cites it.** The checker compares the two and will tell
you when they disagree.

**8. Run the gates**, then stop and hand to the human.

---

## The rubric — a miss means it does not ship

- **The chart shows something the prose does not.** See ⭐ above.
- **Every figure was read from the source, this session.**
- **The caption says what the data cannot say.** See the honesty rule below.
- **One data colour.** If the chart needs a second hue, the chart is wrong.
- **Zero to axis.** Never a truncated baseline on `bars` or `columns`.
- **The alt text is a Swedish sentence with the values in it.** It is generated for you;
  override with `alt:` only when the generated one is genuinely wrong.
- **It reads at 375 px.** Check it, do not assume it.
- **It is still there in the book** — *for an essay*. `pnpm books`, then look at the page.
  A `data/fordjupning` or `data/svar` chart never reaches the PDF or the EPUB: both are
  built from `essay-corpus.ts`, which reads `data/articles` and nothing else. Running
  `pnpm books` after charting a pillar page proves nothing — the chart was never in scope.

---

## House voice inside a chart

The caption is prose and the house rules apply to it in full.

| Rule | In a chart |
|---|---|
| Quotes | Write straight `"…"` in the fence. The renderer converts to »…« exactly as remark-smartypants does for prose. Typing »…« yourself will trip `check-house-style.py` |
| Numbers | Write them bare — `196000`, `12,5`, or `196 000`. The renderer formats to `196 000` and `12,5 %` with non-breaking spaces |
| Dash | The spaced en dash ` – ` in captions. The em dash only in an attribution |
| Unit | Put it in `unit:`. It appears once in the caption, not on every bar — except `%`, which stays on the value |
| *i dag* | Two words |
| Du-tilltal | Never on a svar page |

**The honesty rule.** `note:` is not a hedge, it is the sentence that makes the chart true.
Every Swedish dataset here measures something adjacent to what the article is about, and
the caption is where that gap is stated in the reader's language:

- »Födelseland, inte trosbekännelse.«
- »Betjänade enligt samfundens egen redovisning, inte medlemskap.«
- »Polisanmälningar med hatbrottsmarkering, inte domar och inte förekomst.«
- »Självskattad tillhörighet i SOM-undersökningen.«

---

## ⛔ The category trap — blocking, and the one you will actually meet

The two datasets most likely to fit an article on this site — MUCF's *trossamfund, antal
betjänade* and its grant register — break Muslim congregations down by *inriktning*. Paste
that into a chart and a shia slice appears on the page.

`CLAUDE.md` rules on exactly this case, and it names statistics:

> an illustrative list of Swedish samfund or a »varav«-breakdown of MUCF-statistik does not
> need the shia entry to stay accurate, so leave it out.

A chart category is a neutral name-drop that stands unanswered — the precise thing this
site does not do. **Aggregate to `muslimska samfund`, or drop the chart.** Never a slice,
never a series, never an axis label. The same goes for splitting by rättsskola: a chart
with hanafi and maliki as categories turns a doctrinal question into a market share.

`scripts/check-chart-sources.py` greps every fence for this and **fails the build**. It is
a floor, not a substitute for reading. See `[[no-shia-content]]`.

---

## ⚠️ Traps

- **⚠️⚠️ Sweden collects no religion statistics, and SCB has none.** Verified empirically:
  `query=muslim` returns **0 tables**, `query=tro` returns **0**, `query=religion` returns
  five false positives about adult-education course subjects. Affiliation has not been
  registered since the church–state separation in 2000 and SCB has said collecting it is
  *»inte förenligt med lagen«*. Every »antal muslimer i Sverige« in circulation is an
  estimate from country of birth, from congregation-served counts, or from a survey — and
  those three disagree because they measure different things. **A chart captioned
  »muslimer i Sverige« built on födelseland data is a false claim, however carefully the
  numbers were copied.**

- **⚠️ MUCF's 2025 rule change is a cliff that is not real.** From 1 January 2025 a
  community needs ≥2 500 betjänade, auditor-verified, each member actively confirming.
  Free-church communities report **50–80 % falls** purely from the counting method. A
  2020–2024 → 2025 series shows a collapse that is an artefact. End the series at 2024 or
  put the break in the caption.

- **⚠️ Brå's hate-crime statistics are biennial now.** Latest reference year 2024, next
  release 2027. A `line` that assumes an annual series draws a gap that does not exist. And
  there is a method break around 2018 — never compare across it; the tabellsamling starts
  at 2020 for that reason.

- **⚠️ A brass-only palette is not a limitation to route around.** Two series is the
  ceiling and the parser enforces it. If a chart wants three, the honest move is small
  multiples — three `bars` charts under three sub-headings — not a wider palette. DESIGN.md
  allows four colours on the entire site.

- **⚠️⚠️ Editing the plugin does not invalidate the content cache — and the documented
  cure was wrong.** Under Astro 7 the store is **`apps/web/.astro/data-store.json`**.
  `apps/web/node_modules/.astro/` holds no data-store.json at all, so the path named in
  `rehype-sidenotes.ts` and in `sync-verses.ts` deleted nothing and reported success.
  Found 2026-08-20: a chart caption kept rendering with straight quotes through two dev
  restarts while `dist/` had the guillemets. Both files are corrected now, but the lesson
  is the general one — **a cure that silently no-ops is worse than no cure, because you go
  on to verify stale output and believe it.**

- **⚠️ Shiki would eat the fence.** `astro.config.ts` carries
  `syntaxHighlight: { type: "shiki", excludeLangs: ["chart"] }` because `rehypeShiki` is
  registered *above* the user rehype plugins. Remove that key and every chart silently
  becomes a syntax-highlighted code listing on a live page. `assert-full-build.mjs` counts
  fences against figures to catch it.

- **⚠️ Chromium will not show you the mobile bug.** The `slope` form shipped a figure that
  overflowed 375 px and made the whole page scroll sideways; headless Chromium reported
  nothing. It took a probe in **Zen** to find it. See `[[zen-probe-needs-same-origin-proxy]]`
  and `~/.claude/rules/browser.md`.

---

**⚠️ The markdown twin welds the label to the value, and only the machines see it.**
Found 2026-08-20 on the first fördjupning chart. `dist/<sida>/index.md` is built from the
rendered HTML by `generate-markdown.ts`, and a CSS chart's label and value are adjacent
inline spans — so `node-html-markdown` joined them: **`Griskött29,3`**, three orphaned
lines, caption run together as `Kilo per person.Källa:`. The SVG forms failed worse: the
`<svg>` strip in `extractMain` removed the plot outright, leaving a caption for numbers
that were gone. Nothing was wrong on the web, so nothing looked wrong. `flattenCharts()`
now replaces the whole figure with its `aria-label` sentence — the same text the screen
reader gets — and `assert-full-build.mjs` fails the deploy if a digit ever welds to a
letter again. **Essays are unaffected**: their twin comes from `[slug].md.ts`, which emits
the source body, so a machine reader gets the raw spec. Check the twin, not only the page:

```bash
sed -n '/```chart/,+14p' dist/fordjupning/<slug>/index.md
```

**⚠️ Splitting a paragraph to make room for a chart can weld prose onto the closing
fence.** Found 2026-08-20 on `ramadan.md`. The insertion anchored on a sentence the
paragraph continued past, so the block closed as ```` ``` Europeiska fatwarådet har mött
problemet… ````. Markdown does not close a fence with text after it, so the page would
have rendered the raw spec to the reader. `check-chart-sources.py` was strict — it
reported **0 diagram** on a file that visibly had one — while `chart:check` said »inga
fel«, because its pattern did not require the closing fence to own its line. A fast gate
that is more permissive than the blocking one is worse than no fast gate; both are strict
now. **A "0 diagram" count on a file you just edited is a finding, not a formality.**

### Var korpusen tog slut, och varför

Efter 26 diagram är den mekaniska sökningen uttömd. Det som återstår kräver att data hämtas
utifrån, sida för sida. Fyra saker visade sig inte gå att göra, och de är värda att skriva
ned så att nästa session inte gör om försöket:

- **Essäerna bär nästan aldrig ett diagram.** 1 av 57 hade jämförbara tal. De argumenterar
  ur texter, inte ur mätningar. `--gaps` och siffersvepet ska riktas mot `data/fordjupning`.
- **`kaba.md` har inget som passerar ⭐.** Enda talet är 83 procent omkomna oregistrerade
  pilgrimer, vilket meningen redan säger. Saudiska GASTAT går inte att nå (se `DATAKALLOR`).
- **`sunni-och-shia.md` ⛔ ska inte ha ett diagram.** Sidan har korpusens högsta täthet av
  jämförbara tal och sidans egna sökord frågar efter dem. Det är just därför regeln finns.
- **Två former saknas, och det märks.** `koranen.md`:s bästa diagram vore en tidsaxel med
  intervall (Birmingham 568–645 mot Wansbroughs cirka 800), och en qibla-riktning kan inte
  ritas som staplar eftersom 120 grader inte är dubbelt så mycket som 60. Tvinga inte in
  dem i `slope` — det ser rätt ut och påstår fel sak. Bygg en `range`-form den dagen fyra
  sidor faktiskt behöver den.

**⚠️ Rita storheten argumentet handlar om, inte råvärdena den räknas ur.** Nästan
publicerat 2026-08-20 på `sa-ber-man-steg-for-steg.md`: fajr och isha som två serier över
året, för att visa hur natten krymper i Stockholm. Kurvorna är korrekta och diagrammet
säger motsatsen till sanningen. Fajr tillhör *nästa* morgon, så natten är avståndet runt
midnatt — men på bilden glider kurvorna isär i juni, vilket läses som att natten blir
längre. Bildtexten hävdade det ena och bilden det andra. Lösningen var att räkna fram
natten själv (24 − isha + fajr) och rita den som en serie: en dal med botten i juni, som
inte går att missförstå. **Fråga alltid vad läsarens öga faktiskt mäter på bilden.** Två
korrekta serier kan bilda ett falskt påstående, och ingen grind fångar det.

## Gates — enforced in code, not only here

| Gate | Where | Behaviour |
|---|---|---|
| Malformed spec | `src/lib/chart/spec.ts` | ⛔ Throws with the line number. The build fails; it never renders half a chart |
| Missing `source:` | same | ⛔ Refuses to parse |
| More than two series | same | ⛔ Refuses — two data colours is what the site has |
| Negative share in a `stack` | same | ⛔ Refuses |
| Category trap | `scripts/check-chart-sources.py` | ⛔ Exit 1 |
| Dead `sourceUrl:` | same | ⛔ Exit 1 (skip with `--offline`) |
| Source absent from the page's apparatus | same | ⚠️ Warning — read it, it is usually right |
| Undated source | same | ⚠️ Warning |
| Fence not rendered / leaked as code | `apps/web/scripts/assert-full-build.mjs` | ⛔ Blocks the deploy |
| House punctuation in the caption | `scripts/check-house-style.py` | ⛔ via `pnpm lint:house` |
| Number contradicts another page | `scripts/check-cross-page-facts.py --check fakta` | ⚠️ Read every hit |

### ⭐ The inner loop is seconds. The build is a batch operation.

Measured 2026-08-20, the session that produced the first three charts: the gates that can
actually fail on a chart run in **1,3 s**, and `pnpm verify` takes **2 m 40 s** because it
rebuilds 2 473 pages. That session ran `pnpm verify` four times — about ten minutes — and
the build caught nothing the fast gates had not already caught. Authoring was never the
slow part.

**Per chart** (about a second, run it as often as you like):

```bash
pnpm chart:check data/fordjupning/<slug>.md    # parse, render web+print, alt, caption
python3 scripts/check-chart-sources.py data/fordjupning/<slug>.md
python3 scripts/check-house-style.py    data/fordjupning/<slug>.md
```

**Once, after the last chart is written** — and always before handing over:

```bash
rm -f apps/web/.astro/data-store.json      # ⚠️ NOT node_modules/.astro

python3 scripts/check-cross-page-facts.py --check fakta \
  data/articles/*.md data/svar/*.md data/fordjupning/*.md   # ⚠️ "fakta", not "siffra"

pnpm verify                                    # includes the build + assert-full-build
cd apps/web && pnpm run pdf && pnpm run epub   # only if an ESSAY gained a chart
```

The build is not optional — it is the only thing that proves rehype-chart ran, that Shiki
did not eat the fence, and that the markdown twin survived. It is simply not something to
pay for between two charts.

### ⚠️ »One text per session« governs judgement, not the build

The rule is about **authoring**, and it stands: decide each chart on its own page, against
its own argument, with its own source read fresh. The failure it prevents is nine pillar
pages ending up with the same bar chart because the second one was copied from the first —
the same mechanism `fordjupning-author.md` records for prompt examples.

Batching the *verification* does not touch that. Batching the *judgement* does. So: one
chart at a time, fully, each with the ⭐ test applied honestly — and one build at the end.
If you ever find yourself writing a spec by editing the previous one, stop; that is the
thing the rule exists to catch.

Then look at it: `pnpm dev:bg && pnpm dev:status` (the port is not fixed), both colour
schemes via the ⌘K overlay, 375 px and desktop, and **in Zen, not only Chromium**.

---

## Key files

- `apps/web/src/lib/chart/spec.ts` — the fence grammar and every ⛔ gate
- `apps/web/src/lib/chart/render.ts` — geometry, the brass/muted rule, web and print modes
- `apps/web/src/lib/chart/format.ts` — Swedish numerals and the house punctuation pass
- `apps/web/src/plugins/rehype-chart.ts` — markdown → figure
- `apps/web/src/components/Chart.astro` — the same figure on a hand-composed page
- `apps/web/src/styles/chart.css` — global, because a rehype-injected element carries no
  scoped hash, and therefore inlined into all 2 473 pages whether they hold a chart or not.
  **Measured 2026-08-20: 3 608 byte raw, 1 017 byte gzipped — 6 procent of a page's inline
  CSS, on a page that is 26,5 kB gzipped in total.** That is inside DESIGN.md's budget, so
  do not spend a build-system change on conditional loading, and do not delete the unused
  `columns` rules to save 1 kB raw: an available form that renders unstyled the first time
  someone reaches for it costs more than the bytes. Re-measure before reopening this
- `apps/web/scripts/generate-pdf.ts` (`case "code"`) and `generate-epub.ts` (`handlers.code`)
- `scripts/find-chart-candidates.py` — the sweep; read-only, ranks, decides nothing
- `pnpm chart:check` — the fast inner loop, 0,6 s. Use this, not `pnpm verify`, per chart
- `scripts/pxweb.py` — SCB, Jordbruksverket + 5 more; `probe` finds new PxWeb bases
- `scripts/worldbank.py` — WDI, with the aggregate trap and the retired codes handled
- `scripts/check-datakallor.py` — pings every endpoint in DATAKALLOR. Not in `pnpm verify`
  (no network in the test suite) — run it before trusting the catalogue
- `scripts/check-chart-sources.py` — the sourcing and category gates
- `DATAKALLOR.md` — verified open data sources ⭐ read before searching
- `DIAGRAMFORMER.md` — the five forms, the full grammar, worked examples

**Sibling skills:** `fordjupning-page` and `svar-answer-page` produce the text; this adds a
figure to a finished one. `language-pass` polishes prose retroactively, and runs in the
same shape as this: on a published file, with a human gate.

**A chart is always a separate, deliberate pass. The production pipeline never emits one** —
`fordjupning-author.md` already records what happens when an example enters a prompt: *»A
prompt example became the template… Illustrative examples in a prompt are copied as forms,
not read as hints.«* A chart example in the author prompt would put a near-identical bar
chart on every page produced after it.
