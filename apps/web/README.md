# islam.se web

Static Astro website with Cloudflare Pages Functions for Markdown negotiation,
news rendering and reader corrections. Publishing content lives in `../../data`.
Read `CLAUDE.md` for content, design, dataset and deployment rules.

## Local setup

Use Node 26 (the CI runtime) and the pnpm version declared in the repository-root
`package.json`. From this directory:

```sh
pnpm -w install --frozen-lockfile
pnpm dev:bg
pnpm dev:status
```

The dev server reports its URL; do not assume a fixed port. `pnpm dev:logs` shows
logs and `pnpm dev:stop` stops it. Local databases are optional for the website:
the build preserves committed library figures when the databases are absent.
Production correction handlers require the bindings and secrets described in
`.dev.vars.example` and `wrangler.jsonc`; do not commit real secret values.

## Quality checks

```sh
pnpm lint                    # web formatting and lint
pnpm check                   # Astro + strict TypeScript, including checked edge JS
pnpm test                    # web tests, no live services required
pnpm knip                    # unused web files, exports and dependencies
pnpm check:edge              # bundle Pages Functions and mailer without deploying
pnpm build:fast              # sampled city pages for iteration
pnpm -w verify               # full workspace gate, full build and page budgets
```

Run `pnpm -w verify` before finishing a change. It includes the web unused-code
and edge bundling checks. CI runs the same command on
pull requests and pushes to master. The mobile app has its own isolated workflow.
The root Knip configuration declares Pages routes, the mailer and maintenance
scripts as entry points; update it when adding an independently invoked script.
Do not ignore a finding simply to make the check pass.

Tests should exercise observable behavior through public functions, with local
request objects and service doubles. Keep external calls and sleeps out of tests.
Runtime validation is still needed for JSON from users and upstream services even
when the consuming code is typed.

## Performance tools

`pnpm bench` compares a build with the committed benchmark baseline. Playwright is
a declared development dependency. Install its browser explicitly before use:

```sh
pnpm exec playwright install chromium
pnpm bench --quick
```

The benchmark also needs Lighthouse on PATH (or `BENCH_LIGHTHOUSE`) and Chromium
via `CHROME_PATH`. See `scripts/bench/bench.mjs` for options and measurement caveats.
Font subsetting uses `uvx`; the full website build requires Typst (CI pins
0.15.1); audio tools use ffmpeg.
These are external CLI prerequisites, not npm dependencies.

## Deployment

Only `pnpm -w ship` deploys the site. A sampled build must never be deployed:
Cloudflare Pages replaces the whole deployment snapshot. CI verifies and builds;
it does not deploy. See `CLAUDE.md` for the full workflow.
