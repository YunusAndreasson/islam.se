# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The site's position — non-negotiable

**islam.se is a Sunni site. It is not shia and it is not sufi.** Every page that
states doctrine states it from the position of *ahl as-sunna wa'l-jamāʿa* and the
four classical rättsskolor — hanafi, maliki, shafii, hanbali. Presenting shia or
sufi doctrine as co-normative with that is **a clear violation**, not a stylistic
preference, and it must be fixed before anything ships.

**A shia reference is only tolerated when it serves to show the position wrong.**
Naming shia is allowed when the classical ruling answers it — that is the job of
`/svar/sunni-och-shia` and `/svar/de-rattledda-kaliferna`, where every shia claim
is followed by what *ahl as-sunna* holds and why. A neutral, descriptive mention
that just reports what shia do, and leaves it standing, does not belong on the
site. Concretely, never:

- slot jaʿfaritisk rätt in beside the four madhhabs, or write "de fem skolorna" —
  there are four;
- write a heading like »Rättsskolorna **och shia** om X«;
- add "…och enligt shiitisk rätt" to a statement of the classical ruling;
- claim the difference is only historical ("klyftan löper aldrig genom
  trosbekännelsen") — the imamate and the stance on the *sahāba* are trosfrågor;
- cite a shia or sufi authority as the thing that settles a question, or link out
  to shia sites (al-islam.org, sistani.org and the like);
- present sufism as a path alongside sunni islam rather than a fromhetsströmning
  judged by Koranen and sunna.

On a pure doctrine page (»vad säger rättsskolorna om X«) you take the four and
stop there.

**The producer does not know this rule.** Grep every draft before validating:

```bash
grep -niE "shia|shiit|jaʿfar|jafarit|tolvshi|imamit|khamsa|marja|sufi|tariqa|tasawwuf" <fil>
```

Then ask of each hit: does this show the position wrong? If not, it goes. That
applies to neutral name-drops in otherwise factual lists too — an illustrative
list of Swedish samfund or a "varav"-breakdown of MUCF-statistik does not need
the shia entry to stay accurate, so leave it out.

### Creed: the salaf's understanding, without wearing the label

Where the site states ʿaqīda it follows *ahl as-sunna* as the *salaf* understood
it: the names and attributes affirmed as revealed, without *taʾwīl*, *taʿtīl* or
*tamthīl*; *istiwāʾ* is real and the "how" is not asked; Ibn Taymiyya, Ibn
al-Qayyim and the fatwa tradition after them are the reference points. This is
already the voice of `/svar/vad-ar-tawhid`, `/svar/islams-gudssyn` and
`/svar/vad-ar-odet-qadar` — match it.

**But never name the school.** Do not write "salafi", "wahhabi", "athari" or
"sunnitisk" in reader-facing copy; write »klassisk«, »islamisk«, »de lärda«,
»ahl as-sunna«. The position must be visible in what the page *says*, never worn
as a badge. A page that announces its madhhab has already lost the reader it was
written for.

### Liberal and modernist thought is the third violation

It is the easiest one to miss, because it arrives as fairness rather than as a
claim. The objection sections are where it gets in. Stating an objection at full
strength is required — »ingen halmgubbeparad« — but an objection left standing is
a concession, and these sentence-shapes are how a page concedes without noticing:

- "svaret är riktigt men inte fullständigt", "går inte att förklara bort", "kan
  inte avfärdas" — attached to a ruling that in fact has an answer;
- treating hadith as optional ("det är just traditionens ställning som är
  omtvistad") — sunnan is the second source, not a contested add-on;
- letting a revisionist's frame set the question (Kecia Ali, Ayesha Chaudhry,
  Zahra Ayubi, Amina Wadud, Fazlur Rahman and the like). Cite them where they
  establish a historical fact; never let their normative conclusion close a
  section;
- "de lärda är oense" used to dissolve a ruling rather than to report a genuine
  *ikhtilāf*;
- delegitimising a ruling by the jurists' gender or era ("medeltida manliga
  jurister") — a norm is tested against its evidence, not its transmitter;
- conceding that classical fiqh cannot simply be followed today.

**The rule: the objection may be stated in full, but the classical position gets
the last word.** If no answer is given, the objection has won on the page. When a
genuine practical problem remains — no islamic court in the diaspora, waiting
times under begravningslagen — say so plainly; that is honesty about Sweden, not
a concession about the religion.

## Project Overview

TypeScript monorepo for building a semantic quote database and AI-powered content production pipeline. Extracts quotes from literary texts (Gutenberg, OpenITI), generates local embeddings, and produces articles through a multi-stage Claude pipeline with quality gates.

## Commands

```bash
pnpm install                    # Install dependencies
pnpm build                      # Build all packages
pnpm check                      # Run Biome linting
pnpm check:fix                  # Fix linting issues
pnpm knip                       # Find dead code/unused exports
pnpm test                       # Run vitest tests
pnpm verify                     # check + typecheck + test + house style + build (run before finishing)
pnpm typecheck:web              # astro check alone (~21s) while iterating on apps/web
pnpm tui                        # Launch terminal UI (Ink)
pnpm deploy                     # Alias for pnpm ship (build + pdf + deploy web app)

# Quote database
pnpm cli import-url <url>       # Import from single URL
pnpm cli import-urls <file>     # Batch import (marks done with "# DONE ")
pnpm cli import-arabic <file>   # Import Arabic texts (OpenITI)
pnpm cli import-norse <file>    # Import Norse sagas
pnpm cli import-quran <file>    # Import Quran verses
pnpm cli search <query>         # Semantic search quotes
pnpm cli stats                  # Quote database statistics

# Book RAG
pnpm cli import-book <url>      # Import single book
pnpm cli import-books <file>    # Batch import books
pnpm cli book-search <query>    # Search book passages
pnpm cli book-stats             # Book database statistics

# Quran
pnpm cli quran-search <query>   # Search Quran verses
pnpm cli quran-stats            # Quran statistics

# Content production
pnpm produce article <topic>    # Full 4-stage pipeline
pnpm produce research-only <topic>  # Research stage only
pnpm produce ideate <topic>     # Generate 10 article ideas with quote enrichment
pnpm produce status <path>      # Check article/idea status
```

## Web dev server (`apps/web`)

Astro 7 ships a managed background dev server. Prefer it over `pnpm dev` for any
agent-driven or scripted work (screenshot loops, Lighthouse passes) — it does not
occupy a terminal and it exposes a real readiness signal.

```bash
pnpm dev:bg        # astro dev --background — detached, prints URL + PID, JSON logging
pnpm dev:status    # URL, PID, uptime
pnpm dev:logs      # structured logs; add -f to stream
pnpm dev:stop      # SIGTERM, escalating to SIGKILL after 5s
```

**Poll `GET /_astro/status` (returns `{"ok":true}`) instead of sleeping before
driving the browser.** The port is not fixed — 4321 upward, whichever is free —
so read it from `pnpm dev:status` rather than hardcoding 4321.

## Deploy

- **Web app (`apps/web`, Astro → Cloudflare Pages):** `pnpm deploy` (alias for
  `pnpm ship`) from the repo root — builds all packages, generates PDFs, then
  `wrangler pages deploy dist --project-name islam-se --branch master`.
  Requires wrangler auth (`wrangler login`).
- **MCP articles worker (`apps/mcp-articles`, Cloudflare Worker):**
  `pnpm deploy` inside `apps/mcp-articles` — bundles articles then `wrangler deploy`.

## Architecture

```
packages/
├── core/                # Shared TypeScript types
│   └── src/types/       # quote.ts, book.ts, quran.ts, search.ts
├── quotes/              # Core library: fetching, extraction, embeddings, storage
│   ├── src/
│   │   ├── extraction/      # Swedish, Arabic, Norse quote extractors
│   │   ├── embeddings/      # Local (HuggingFace) and OpenAI embeddings
│   │   ├── books/           # Book RAG: database, chunker, importer, search
│   │   ├── quran/           # Quran database and extractor
│   │   ├── database.ts      # SQLite + sqlite-vec for vector search
│   │   ├── search.ts        # Quote search functions
│   │   └── fetcher.ts       # URL text fetching
├── orchestrator/        # Multi-stage content pipeline
│   ├── src/
│   │   ├── services/        # quote-service, book-service, ideation-service,
│   │   │                    # article-publisher, reference-tracker, source-validator
│   │   ├── claude-runner.ts # Spawns Claude CLI subprocess
│   │   └── index.ts         # ContentOrchestrator (4-stage pipeline)
│   └── prompts/             # Stage prompts (ideator, research, fact-check, author, review)
apps/
├── cli/                 # Quote management CLI (Commander)
│   └── src/
│       ├── commands/        # 17 command modules
│       └── utils/           # path, url-file, interrupt helpers
├── content-producer/    # Article production CLI
├── tui/                 # Terminal UI for idea management and pipeline (Ink/React)
├── mcp-quotes/          # MCP server for quote/book/Quran/Wikipedia tools
└── web/                 # Astro site (islam.se), deployed to Cloudflare Pages via pnpm ship
```

**Data flow:** URL → Fetch → Claude extraction → Local embeddings → SQLite → Search/Content pipeline

**Pipeline stages:** Research → Fact-Check → Author → Review → Final article

## Key Technical Details

- **Embeddings:** Local HuggingFace multilingual-e5-small (384 dimensions, no API cost) with OpenAI fallback
- **Vector search:** sqlite-vec extension on `data/quotes.db` and `data/books.db`
- **Languages:** Swedish (sv), Arabic (ar), Norse/English (en)
- **Batch import:** Resumable via "# DONE " prefix markers in URL files
- **Quality gates:** Fact-check credibility ≥7, review score ≥8 to publish
- **MCP server:** 8 tools — search_quotes, search_by_filter, search_text, get_inventory, bulk_search, search_books, search_quran, fetch_wikipedia

## Environment Variables

- `ANTHROPIC_API_KEY` - Only for the direct-SDK quote extractors
  (`packages/quotes/src/extraction/*`). The content pipeline, svar producer,
  podcast and book import all shell out to the `claude` CLI and **strip this
  variable** so they run on the logged-in Claude Code subscription — do not
  export it expecting the pipeline to use it.
- `OPENAI_API_KEY` - Optional fallback for embeddings (local preferred)

## Data Files

- `data/quotes.db` - Main quote database (~59k quotes)
- `data/books.db` - Book RAG database
- `data/quran.db` - Quran verses database
- `data/urls.txt` - Gutenberg URLs for Swedish texts
- `data/urls-arabic.txt` - OpenITI URLs for Arabic texts
- `data/extracted/` - Raw extraction outputs for review
- `data/articles/` - Published articles with `index.json` metadata

### Mosque dataset — one canonical file, one direction

```
apps/web/src/data/moskeer-sverige.csv     raw scrape (migrationskartan + OSM + muslimer.se)
                │  pnpm tsx scripts/build-moskeer.ts   ← re-import ONLY; overwrites the JSON wholesale
                ▼
apps/web/src/data/moskeer-sverige.json    ★ CANONICAL — edit this one
                │  pnpm sync:mosques      (run from apps/mobile)
                ▼
apps/mobile/src/lib/mosques/data.json     generated mirror — NEVER edit by hand
```

**To remove or correct a mosque:** edit the web JSON, delete the matching row from the CSV
as well (otherwise the next `build-moskeer` re-import resurrects it), then run
`pnpm sync:mosques` from `apps/mobile`.

The sync validates as it copies — required fields, unique ids, coordinates inside Sweden —
and warns about duplicate names and pins under 150 m apart. `pnpm sync:mosques:check` and
`apps/mobile/src/lib/mosques/sync.test.ts` (which runs in the normal suite) fail if the two
files disagree. That guard exists because they silently diverged for three weeks in 2026-07
while the old `cp`-based script was simply never run: the app shipped seven duplicate
mosques and one record whose coordinates put a Landskrona mosque in Göteborg.

## The Only Question That Matters

Every change to this codebase exists to serve one outcome: the pipeline produces a better article for the reader. Before writing code, refactoring, adding a feature, or optimizing something, ask:

**"Will this change make the published article better?"**

"Better" means: more compelling prose, more accurate sourcing, richer quote integration, fewer pipeline failures that waste a 25-minute run, or faster iteration so the human can review more drafts. If a change doesn't connect to one of these, it probably shouldn't be made.

This applies at every level:
- **Prompt engineering** — Does this instruction actually change what Claude writes, or is it just more words? Test with a real run.
- **Schema/type changes** — Does the pipeline need this field, or is it speculative structure? Dead fields are noise the LLM has to work around.
- **Infrastructure work** — Does this make the pipeline more reliable (fewer crashes, better error recovery), or is it engineering for its own sake?
- **Test additions** — Does this test catch a bug that would silently corrupt article quality, or is it testing an implementation detail that will change next week?

The codebase is a tool. The article is the product. Never confuse the two.

## Testing Philosophy

Tests are the primary feedback loop for LLM-driven development. They serve as cross-session memory, machine-speed verification, and the executable specification that makes high-velocity iteration possible.

### Principles

- **Test behavior through public interfaces, not implementation details.** Functions get refactored constantly. Assertions against observable outputs survive; assertions against internal state break on every change.
- **Minimize mocking.** Use in-memory SQLite (via `createTestDatabase()` in `packages/quotes/src/test-utils/db.ts`) instead of mocking the database layer. Only mock truly external dependencies (HTTP, Claude CLI subprocess). If something is mockable with an in-memory substitute, prefer the real implementation.
- **Failure messages are cross-session documentation.** The next session reads the failure output, not the test name. Make failure messages describe what invariant broke and why it matters, not just "expected X got Y."
- **Bug fix tests must describe the bug.** When fixing a regression, the test should comment what went wrong and why — this is the only durable memory that prevents a future session from "improving" the code back into the same bug.
- **Never write tests that mirror implementation logic.** If the test reconstructs the same algorithm as the code, it verifies nothing. Test the contract (given input X, output should be Y), not the steps.
- **Prefer property-based assertions over single examples where applicable.** For pure functions (chunking, scoring, embedding distance), assert invariants (`output.length <= maxSize`, `score >= 0 && score <= 1`, `symmetry: distance(a,b) === distance(b,a)`) alongside example-based tests.

### Test speed matters

Test execution time is the bottleneck for iteration velocity. Keep the full suite under 5 seconds. Never add I/O, network calls, or sleeps to tests. The existing pattern of in-memory SQLite + fake embeddings (`generateFakeEmbedding()`) is correct — maintain it.

### What to test (and not)

**Always test (machine domain, no human review needed):**
- Database operations: insert, query, search, FTS, vector similarity
- Business logic: scoring algorithms, chunking, length categorization, slug generation
- Parsing and validation: JSON extraction from Claude responses, Zod schema validation
- Edge cases: Unicode/Arabic text handling, empty inputs, boundary conditions

**Structural code (human must review, tests are secondary):**
- Zod schemas in `packages/orchestrator/src/schemas.ts` — these define pipeline contracts. A wrong schema makes all derived tests wrong. Changes to these schemas require human approval.
- TypeScript types in `packages/core/src/types/` — shared across all packages. Changes cascade everywhere.
- Database schema definitions in `database.ts`, `books/database.ts`, `quran/database.ts` — define persisted data shape. Schema changes are effectively migrations.
- Quality gate thresholds (credibility ≥7, review score ≥8) — business decisions, not implementation.

### Existing test infrastructure

- **Framework:** Vitest with `globals: true`, `environment: "node"`, 10s timeout
- **Test utils:** `packages/quotes/src/test-utils/db.ts` — `createTestDatabase()`, `insertTestQuote()`, `generateFakeEmbedding()`, `seedTestQuotes()`
- **Pattern:** In-memory SQLite for isolation, fake embeddings to avoid model downloads, minimal mocking
- **Run:** `pnpm test` (vitest run, ~270 tests)
