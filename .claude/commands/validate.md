---
allowed-tools: Bash(pnpm verify:*), Bash(pnpm knip:*)
description: Run the repo's full verification (Biome, types, tests, content checkers, build) and dead-code detection
---

## Context

- Current branch: !`git branch --show-current`
- Uncommitted changes: !`git diff --stat HEAD`

## Your task

From the repository root, run `pnpm verify`, then `pnpm knip`. `verify` is the gate the
instruction files name: Biome, web types, unit tests, the content checkers and the build.
`apps/mobile` is outside it and has its own `pnpm verify`.

Report pass or fail per command; for a failure show only the relevant error lines. If
everything passes, say so in a line.
