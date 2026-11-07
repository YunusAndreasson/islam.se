# apps/web — the site

Static Astro site on Cloudflare Pages. The texts it renders live outside this directory:
`../../data/articles` (essays), `../../data/svar` (answer pages) and
`../../data/fordjupning` (pillar pages).

## Commands

Run from this directory. A bare `pnpm <script>` finds only this package's scripts; the
ones defined at the repo root need `-w`.

```bash
pnpm check                    # astro check. Biome is `pnpm -w check`: same name, different tool
pnpm build:fast               # renders only a sample of the bönetider city pages; for iteration
pnpm build                    # full build
pnpm build:profile            # full build with Astro's timing report
pnpm -w test --project web    # this app's unit tests; drop --project for the whole repo
pnpm -w verify                # Biome, types, tests, content checkers, build. Run before finishing
```

To measure parallel prerendering, use `ASTRO_PRERENDER_WORKERS=2 pnpm build:profile`.
The default uses one thread. Keep `ASTRO_BUILD_CONCURRENCY` at 1 when comparing workers;
it controls simultaneous pages within each thread. Compare builds with equally warm
caches and check memory use as well as elapsed time.

## Dev server

For anything agent-driven (screenshot loops, Lighthouse passes) use the managed
background server, not `pnpm dev`. It leaves the terminal free and has a real readiness
signal.

```bash
pnpm dev:bg        # detached; prints URL and PID
pnpm dev:status    # URL, PID, uptime
pnpm dev:logs      # add -f to stream
pnpm dev:stop
```

Poll `GET /_astro/status` until it returns `{"ok":true}` before driving the browser;
do not sleep. The port is not fixed, so read it from `pnpm dev:status`.

## Deploy

`pnpm -w ship` is the only thing that puts the site live: full build, the PDF and EPUB
books, `wrangler pages deploy`, IndexNow. `git push` deploys nothing.

A Pages deploy is a full snapshot of `dist/`: whatever is missing from the directory
becomes a 404. Never deploy the output of `build:fast`.

`pnpm -w ship:mailer` deploys the corrections mailer Worker in `workers/rattelse-mailer`.

## Design

Read `../../DESIGN.md` before changing anything a reader sees.

Pictures have three makers, each a skill: the photographs that open essays, essäserier
and Fördjupning pages (and are their cards) come from `feature-image`; the site's own
engraved drawings from `ritning`; documentary photographs inside a text from
`article-photographs`.

## Content checks

The texts under `../../data/` are held by the checkers in `../../scripts/`. They all run
in `pnpm -w verify`; on their own they are `pnpm -w lint:house`, `lint:charts` and
`lint:chrome`.

## Map datasets — canonical here, mirrored one way

```
src/data/moskeer-sverige.csv     raw scrape (migrationskartan + OSM + muslimer.se)
        │  pnpm tsx scripts/build-moskeer.ts   ← re-import ONLY; overwrites the JSON wholesale
        ▼
src/data/moskeer-sverige.json             ★ CANONICAL — edit this one
src/data/begravningsplatser-sverige.json  ★ CANONICAL — hand-curated, no CSV behind it
```

Both JSON files are copied out of this app into generated mirrors. After editing either
one, run `pnpm -C ../mobile sync:data`; the mirrors' tests fail until you do. Never edit
a mirror.

**To remove or correct a mosque:** edit the JSON and delete the matching row from the CSV
as well, otherwise the next `build-moskeer` re-import resurrects it. Then sync.

**To add a burial ground** (the Muslim section of a cemetery): only with a `source` that
confirms the section exists today — the huvudman's own page first, local news second,
never a funeral-home list on its own, and never one that is only planned. `city`,
`citySlug`, `kommun` and `lan` are the nearest bönetider place, the same rule
`build-moskeer` uses; `src/lib/begravningsplatser/index.test.ts` holds the list to that.

The sync validates as it copies (required fields, unique ids, coordinates inside Sweden)
and warns about duplicate names and pins under 150 m apart.
