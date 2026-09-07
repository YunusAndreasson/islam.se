# Incremental static builds

Astro's experimental incremental build is enabled for `/bonetider/[stad]` only.
Other routes continue to render on every build. Run the normal `pnpm build`;
the output still contains the complete site, including restored pages.

The city cache key includes place data, the Stockholm calendar date, the footer's
UTC/local dates, and the currently highlighted next prayer. Astro also invalidates
pages when their imported code, assets, configuration, or dependencies change.
Keep `build.concurrency` at 1; Astro disables this experiment above 1.

Preserve `apps/web/node_modules/.astro/` between builds to retain the cache.
A missing cache simply causes a full render. Use `pnpm exec astro build --force`
to bypass reuse, or disable `experimental.incrementalBuild` to turn off the trial.
After a forced Astro build, run `pnpm exec tsx scripts/generate-markdown.ts` if you
need the normal Markdown twins too. Changes to HTML-transforming middleware need
a forced rebuild; Astro does not currently track those for invalidation.

## Local trial, 7 September 2026

- First Astro build: 43.90 seconds, 2,486 pages.
- Repeat Astro build: 14.46 seconds, all 2,128 city pages reused (67% faster).
- Shared layout edit: all city pages rendered again; build completed in 47.88 seconds.
- All builds produced 2,425 Markdown twins, with 60 existing/hand-authored files skipped.
- Unit tests cover unchanged intervals, summer/winter midnight, prayer transitions,
  and changed place data.

These timings cover Astro's build step, not the surrounding figure generation or
Markdown export. Daily rebuilds must still run: caching does not refresh deployed
HTML by itself. The full deploy guard also requires the separately generated PDF
and EPUB books, just as before this trial.

Reference: https://docs.astro.build/en/reference/experimental-flags/incremental-build/
