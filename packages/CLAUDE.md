# The quote database and the article pipeline

Covers `packages/*` and `apps/{cli,content-producer,tui,mcp-quotes,mcp-articles}`.

## The only question that matters

Every change here serves one outcome: the pipeline produces a better article for the
reader. Before writing code, ask: **will this make the published article better?**

Better means more compelling prose, more accurate sourcing, richer quote integration,
fewer failures that waste a 25-minute run, or faster iteration so the human can review
more drafts. A change that connects to none of these probably should not be made.

- **Prompts:** does the instruction change what gets written, or is it more words? Test
  with a real run.
- **Schemas and types:** does the pipeline need the field? A dead field is noise the
  model has to work around.
- **Infrastructure:** fewer crashes and better recovery, or engineering for its own sake?
- **Tests:** does it catch a bug that would silently corrupt an article?

The codebase is a tool. The article is the product.

## Commands

These are root scripts; from any subdirectory add `-w`.

```bash
pnpm -w produce article <topic>        # full pipeline; --resume --no-publish is a trial run that leaves data/articles alone
pnpm -w produce research-only <topic>
pnpm -w produce related <topic>        # the earlier essays an idea would build on; `article` runs it first
pnpm -w produce ideate <topic>         # ten article ideas with quote enrichment
pnpm -w produce status <path>
pnpm -w produce publish <run>          # publish a finished trial run as its final.md stands; no stage runs again
pnpm -w produce harvest <run>          # after hand-editing a published essay: record the diff against final.md
pnpm -w cli --help                     # quote, book and Quran import and search
pnpm -w tui
pnpm -w verify                         # Biome, types, tests, content checkers, build. Run before finishing
```

Batch imports are resumable: a finished line in the URL file gets a `# DONE ` prefix.

`apps/mcp-articles` deploys with `pnpm run deploy` from inside that directory.

## The pipeline

Earlier essays → Research → Fact-Check → Author → Deepen → Ground → Review (patches) →
Verify (tools) → Polish → Swedish voice → Audit → Final read (the gate) → Figures

The first stage reads every published essay in full against the idea. Research and the
author get the closest ones whole, to build on and to name in the text; code searches for
every sentence the stage quotes before it is passed on. A reference to an earlier essay is
always a link (»essän "[Titel](/slug/)"«): code puts the link in after the draft and again
before the final read, and no later edit may drop one. It judges nothing: whether an idea
is too close to a published essay is the editor's call.

Nothing is added after the last gate, and every stage after the draft returns patches
that code applies. The reviewer has no tools: what it cannot confirm it flags, and Verify
settles each item against a source (confirmed, corrected, struck or open).

Gates: fact-check credibility ≥ 7.5; final read score ≥ 8 with the verdict »publish«.

## What the code does not tell you

- The pipeline, the svar producer, the podcast and book import shell out to the `claude`
  CLI and **strip `ANTHROPIC_API_KEY`**, so they run on the logged-in subscription. Do not
  export the key expecting the pipeline to use it. Only the direct-SDK quote extractors in
  `packages/quotes/src/extraction/` read it.
- Embeddings are local (HuggingFace multilingual-e5-small, 384 dimensions). OpenAI is only
  a fallback.
- The databases are `data/quotes.db`, `data/books.db` and `data/quran.db`: SQLite with
  sqlite-vec.

## Changes that need the human's approval

- Zod schemas in `packages/orchestrator/src/schemas.ts`. They are the pipeline's
  contracts; a wrong schema makes every test derived from it wrong.
- Table definitions in `database.ts`, `books/database.ts` and `quran/database.ts`. A
  change there is a migration.
- The gate thresholds above. They are editorial decisions.

## Tests

- Use the real database in memory, not a mock: `createTestDatabase()`, `insertTestQuote()`
  and `seedTestQuotes()` in `packages/quotes/src/test-utils/db.ts`.
- `generateFakeEmbedding()` stands in for the model, so no test downloads it.
- Mock only what is external: HTTP and the Claude CLI subprocess.
- For pure functions (chunking, scoring, distance), assert invariants alongside examples.
