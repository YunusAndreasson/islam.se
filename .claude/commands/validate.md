---
allowed-tools: Bash(pnpm build:*), Bash(pnpm vitest:*), Bash(pnpm check:*), Bash(pnpm knip:*)
description: Run tests, type-check, lint, and find dead code
---

## Context

- Current branch: !`git branch --show-current`
- Uncommitted changes: !`git diff --stat HEAD`

## Your task

Run the full validation suite for this monorepo. Run all four steps sequentially and report results.

### Steps

1. **Build** (type-check all packages):
   ```
   pnpm build
   ```

2. **Test** (run vitest):
   ```
   pnpm vitest run
   ```

3. **Lint** (Biome):
   ```
   pnpm check
   ```

4. **Dead code** (knip):
   ```
   pnpm knip
   ```

### Reporting

After all steps complete, give a brief summary:
- **Pass/Fail** for each step
- For failures: show only the relevant error lines, not the full output
- If everything passes, just say so concisely — no need for a wall of green text
