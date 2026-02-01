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

# Quote database
pnpm cli import-url <url>       # Import from single URL
pnpm cli import-urls <file>     # Batch import (marks done with "# DONE ")
pnpm cli import-arabic <file>   # Import Arabic texts (OpenITI)
pnpm cli import-norse <file>    # Import Norse sagas
pnpm cli search <query>         # Semantic search
pnpm cli stats                  # Database statistics

# Content production
pnpm produce article <topic>    # Full 4-stage pipeline
pnpm produce research-only <topic>  # Research stage only
```

## Architecture

```
packages/
├── quotes/          # Core library: fetching, extraction, embeddings, SQLite storage
│   ├── database.ts      # SQLite + sqlite-vec for vector search
│   ├── embeddings-local.ts  # HuggingFace transformers (multilingual-e5-small)
│   ├── extractor.ts     # Swedish quote extraction (Claude)
│   ├── extractor-arabic.ts  # Arabic extraction
│   └── fetcher.ts       # URL text fetching
├── orchestrator/    # Multi-stage content pipeline
│   ├── claude-runner.ts     # Spawns Claude CLI subprocess
│   ├── orchestrator.ts      # 4-stage pipeline controller
│   ├── quote-service.ts     # Quote search integration
│   └── prompts/             # Stage prompts (research, fact-check, author, review)
apps/
├── cli/             # Quote management CLI (Commander)
└── content-producer/  # Article production CLI
```

**Data flow:** URL → Fetch → Claude extraction → Local embeddings → SQLite → Search/Content pipeline

**Pipeline stages:** Research → Fact-Check → Author → Review → Final article

## Key Technical Details

- **Embeddings:** Local HuggingFace (384 dimensions, no API cost) with OpenAI fallback
- **Vector search:** sqlite-vec extension on `data/quotes.db`
- **Languages:** Swedish (sv), Arabic (ar), Norse/English (en)
- **Batch import:** Resumable via "# DONE " prefix markers in URL files
- **Quality gates:** Fact-check credibility ≥7, review score ≥8 to publish

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Claude extraction and pipeline
- `OPENAI_API_KEY` - Optional fallback for embeddings (local preferred)

## Data Files

- `data/urls.txt` - Gutenberg URLs for Swedish texts
- `data/urls-arabic.txt` - OpenITI URLs for Arabic texts
- `data/quotes.db` - Main quote database (~55MB, ~20,500 quotes)
- `data/extracted/` - Raw extraction outputs for review
