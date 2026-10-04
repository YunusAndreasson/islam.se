# apps/mobile — the app

Expo / React Native app: prayer times, qibla, the moon, and a map of mosques and Muslim
burial grounds.

## A separate project inside the repository

This directory is its own pnpm root with its own lockfile, excluded from the repository's
workspace. Run every `pnpm` command from here. Nothing at the repo root reaches this app:
not its Biome, not its Vitest, not `pnpm -w` or `--filter`. Here it is ESLint and Jest.

## Commands

```bash
pnpm verify            # typecheck, lint, tests with the coverage gate. Run before finishing
pnpm test <path>       # one test file
pnpm android           # dev build through scripts/dev-android.sh, which pins JDK 17 and picks the AVD
pnpm ios
pnpm mutation          # Stryker over the pure core; slow, run it on request
pnpm release:check     # every release preflight, no build
```

## Releases

`pnpm release`, `release:ios` and `release:android` build on EAS and submit automatically:
iOS to TestFlight, Android to the Play **production** track. Run them only on an explicit
request. `release:check` is the safe one.

The script refuses to start unless the whole repository is committed and HEAD equals its
upstream. Store-submission checklists are in `docs/`.

## Map data is a generated mirror

`src/lib/mosques/data.json` and `src/lib/burial-grounds/data.json` are generated. Never
edit them by hand: a correction goes into the canonical file named at the top of
`scripts/sync-web-data.mjs`, and `pnpm sync:data` regenerates the mirror.
`pnpm sync:data:check` and the two `sync.test.ts` files fail when a mirror disagrees with
its source.

## Tests

- The coverage gate covers an explicit allow-list of pure modules in `jest.config.js`. A
  new pure module in `src/lib` is added to that list. Never lower a threshold to turn the
  gate green.
- Calculations are pinned three ways, by file name: `*.test.ts` for examples,
  `*.props.test.ts` for fast-check properties, `*.anchors.test.ts` for values taken from
  an external reference.
