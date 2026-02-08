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

## Content Guidelines

The content is for islam.se, a Swedish publication targeting educated readers (Axess/Respons level). Key constraints for the ideator and content pipeline:

- **Avoid Sufism entirely:** No Sufi terminology (fana, muraqaba, tariqa), no Sufi figures (Ibn Arabi, Rumi as Sufi, al-Hallaj)
- **Use orthodox framing instead:** taqwa, ihsan, tazkiyat al-nafs, muhasaba; scholars like Ibn Taymiyyah, Ibn al-Qayyim, Ibn Rajab al-Hanbali, al-Ghazali (Ihya ethics), al-Nawawi
- **Counter-intuitive angles:** Ideas should make readers say "I never thought of it that way" — avoid survey overviews or basic explainers
- **Quote database:** Swedish literature (~34k: Strindberg, Key, Söderberg, Runeberg, Bergman, Topelius, Rydberg, Blanche, Boye, Lagerlöf, Geijer, Bremer, Söderblom, Hans Ruin, Geijerstam, Canth, Benedictsson, Levertin, Hallström, Heidenstam, Almqvist, Tegnér, Andersson, Södergran, Linné, Sjöberg, Fröding), Arabic Islamic (~20k: Ibn Qayyim, Ibn Taymiyyah, Ibn al-Jawzi, Ibn Rajab, al-Suyuti, al-Mawardi, Ibn Hazm, al-Nawawi, al-Ghazali, Ibn Hibban, Ibn Abi al-Dunya, al-Shafi'i), Norse/English (~5k)
