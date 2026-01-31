# Islam.se - Text Production Platform

## Project Overview
TypeScript monorepo for building a quote database from literary texts using Claude for extraction and OpenAI for embeddings.

## Current Phase: Quote Database
Building a semantic search database of literary quotes.

## Architecture
- `packages/quotes` - Quote fetching, extraction, embeddings, storage
- `apps/cli` - Command-line interface

## Key Commands
```bash
pnpm install                    # Install dependencies
pnpm build                      # Build all packages
pnpm check                      # Run Biome linting

# Quote import
pnpm cli import-url <url>       # Import from single Gutenberg URL
pnpm cli import-urls urls.txt   # Batch import from URL list

# Search & stats
pnpm cli search <query>         # Search quotes semantically
pnpm cli stats                  # Show database statistics
```

## Development Workflow
1. Add Gutenberg URLs to `data/urls.txt` (one per line)
2. Run `pnpm cli import-urls data/urls.txt`
3. Review extracted quotes in `data/extracted/`
4. Quotes are stored in `data/quotes.db` with embeddings

## Environment Variables
- `ANTHROPIC_API_KEY` - Required for Claude extraction
- `OPENAI_API_KEY` - Required for embeddings

## Code Style
- TypeScript strict mode
- Biome for linting & formatting
- Zod for runtime validation
