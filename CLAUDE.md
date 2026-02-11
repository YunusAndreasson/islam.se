# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
pnpm tui                        # Launch terminal UI (Ink)

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
└── web/                 # Future web app placeholder
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

- `ANTHROPIC_API_KEY` - Required for Claude extraction and pipeline
- `OPENAI_API_KEY` - Optional fallback for embeddings (local preferred)

## Data Files

- `data/quotes.db` - Main quote database (~59k quotes)
- `data/books.db` - Book RAG database
- `data/quran.db` - Quran verses database
- `data/urls.txt` - Gutenberg URLs for Swedish texts
- `data/urls-arabic.txt` - OpenITI URLs for Arabic texts
- `data/extracted/` - Raw extraction outputs for review
- `data/articles/` - Published articles with `index.json` metadata

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
