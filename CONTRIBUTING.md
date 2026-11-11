# Contributing

Bug reports and pull requests for the code are welcome. For anything bigger
than a fix, open an issue first, so we can agree on the shape before you write
it. A wrong fact, quote or reference in a text goes through the »Föreslå en
rättelse« link at the end of the page, not through a pull request.

## Build and check

The site and the pipeline share one pnpm workspace; the app in `apps/mobile` is
a separate pnpm root. You need Node 26 and the pnpm version in
`packageManager`, Python 3, and Typst 0.15.1 for the full build. Each area has
its own notes: [apps/web/README.md](apps/web/README.md),
[apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) and
[packages/CLAUDE.md](packages/CLAUDE.md).

Before a pull request:

- `pnpm install --frozen-lockfile && pnpm verify` passes at the root: Biome,
  types, unused code, the edge bundles, the tests, the content checkers, the
  full build and the page budgets. The tests make no network calls and need
  none of the local databases.
- For a change to the app, `cd apps/mobile && pnpm install --frozen-lockfile &&
  pnpm verify` passes too: typecheck, lint, the deprecated-API and React
  Compiler checks, and the tests with their coverage gate.
- Anything a reader sees follows [DESIGN.md](DESIGN.md).
- One change per pull request, with a commit message in the repository's
  style: `fix(bonetider): …`, `feat(mobile): …`, `docs: …`.

## What islam.se won't do

Some choices are deliberate and changes to them need a strong case:

- Doctrine is stated from *ahl as-sunna* and the four schools of law, hanafi,
  maliki, shafii and hanbali. Shia and sufi positions aren't presented beside
  them ([AGENTS.md](AGENTS.md) has the full rule).
- An objection to a ruling may be stated in full, but the classical position
  answers it before the section ends.
- No text is published without a person reading it, and a fact that can't be
  traced to a source is cut.
- No accounts and no ads, on the site or in the app. The site counts visits
  anonymously with Cloudflare Web Analytics, which sets no cookies and stores no
  personal data; the app has no analytics, and its location never leaves the phone.
- A push deploys nothing. Only `pnpm ship` puts the site live.

## Security issues

Not in issues or pull requests: see [SECURITY.md](SECURITY.md).

## Conduct and license

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
contributing code, you agree it's released under the [MIT license](LICENSE).
The texts, recordings and pictures aren't open to contributions under that
license; [NOTICE.md](NOTICE.md) says what they're under.
