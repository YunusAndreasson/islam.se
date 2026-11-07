# Modernization changes and verification

The audit covers the web application in `apps/web` and the shared monorepo tooling
that installs, checks and builds it. The mobile app remains a separate pnpm root
with its existing CI workflow.

## Improvements

### Types and unused code

- Enabled TypeScript checking in the correction handlers, shared correction
  helpers, Markdown middleware and shared news renderer.
- Added typed database, mailer and handler contracts, plus a discriminated union
  for article versus mosque storage inputs.
- Typed field names against their limit tables; fixed the missing mosque reason
  limit exposed by that check.
- Excluded all generated `dist-*` variants from source type checking.
- Configured Knip with the real Pages routes, private mailer and maintenance
  scripts. It no longer mistakes those entry points for dead files.
- Deleted the unused Chart component, obsolete count-only rate limiter, duplicated
  escaping implementations and unused re-exports. Made internally used helpers
  and types private instead of exposing an unused public API.

### Safety and shared logic

- Replaced separate count/insert operations with one conditional SQL insert for
  both correction endpoints. Concurrent article and mosque submissions share the
  same rolling-hour cap. Rejected inserts send no notification and do not return
  a fake case number.
- Added migration-backed SQLite regression tests that exercise concurrent public
  endpoint calls, expiry, IP isolation and parameterized storage.
- Added a shared 64 KiB streaming JSON reader. It counts actual bytes, cancels
  oversized bodies, handles split Unicode and rejects malformed/non-object data.
- Reused the JSON reader in Turnstile verification and the private mailer; null
  payloads no longer produce accidental field-access errors.
- Added five-second deadlines to Turnstile and mailer requests, with a controlled
  unavailable response for verification transport failures.
- Require the full origin, including protocol, for browser correction requests.
- Keep Markdown asset and canonical URLs on the site's origin even for double-
  slash paths. Do not follow asset redirects or recurse through an origin fetch.
- Honor unacceptable Markdown media ranges, reject HTML soft-404s as Markdown,
  and preserve normal HTML when the asset binding fails.
- Validate upstream news entries in one parser shared by the edge and browser,
  replacing the unchecked browser cast. One malformed entry cannot break the feed.
- Use the common XML escaper for figures and mail HTML, and the common email
  pattern for reply-to validation. Added mail header/HTML regression tests.
- Confine benchmark file lookups to the build directory, including symlink
  targets. Handle malformed escapes, traversal and missing 404 files safely.

### Performance and maintenance

- Correction storage now needs one database round trip instead of a count query
  followed by an insert.
- OG cache generations include installed renderer package manifests and font
  bytes, so compatible package or font updates cannot silently reuse stale cards.
- Preserved existing build caches; reduced the PDF cache helper's complexity and
  simplified numeric clamps without changing their finite-input behavior.
- Declared and locked Playwright locally, removing the benchmark's dependency on
  a sibling checkout.
- Fixed the agents 0.33.0 Babel 7/8 peer conflict with a version-scoped package
  extension that supplies its missing Babel 8 core dependency. No global override.

### Developer workflow and CI

- Added local `test`, `lint`, `knip` and `check:edge` commands and a developer README.
- Included script and mailer regression tests in the normal web suite.
- Extended root `verify` to check unused web code and bundle both Pages Functions
  and the mailer. Edge checks are dry runs, not deployments.
- Added CI with a frozen lockfile, pinned action commit SHAs, read-only repository
  permissions, cancellation of superseded runs and the required Typst toolchain.
  CI invokes the same verification gate as local development.

## Verification

- Type checking: 449 files, zero errors and zero warnings; one existing optional
  async-style hint.
- Tests: 115 repository test files, 1,251 passing tests.
- Web Knip: no unused files, exports or dependency findings.
- Dependency peer check: no issues.
- Biome: no lint or formatting warnings in the final gate.
- Workflow: actionlint passed. Hosted CI awaits the first push/PR.
- Pages bundle: built successfully; generated routes contain only the two
  correction endpoints, news handler and root middleware, not tests.
- Mailer bundle: dry-run build passed with its existing private bindings.
- Working-tree whitespace check: passed.
- Full verification gate: passed, including all workspace builds, 2,614 generated
  web pages, Markdown generation and page budgets. Local log:
  `/tmp/islam-modernization-final.log`.
- Combined `pnpm check:edge` command: passed (Pages and private mailer).
- Frozen lockfile validation: passed with `pnpm -w install --frozen-lockfile --lockfile-only --ignore-scripts`.

## Completion audit

- Typing: strict compiler settings remain enabled, public edge inputs have checked
  contracts and runtime validation, and the full type gate passes.
- DRY: correction storage, feed parsing, bounded JSON parsing and escaping share
  implementations; obsolete copies and unused exported APIs were removed.
- Safety: regressions cover concurrency, hostile input, timeouts, escaping,
  origin confinement and filesystem boundaries. Both edge bundles compile.
- Performance: storage removes a database round trip; generated bundles are not
  typechecked; cache invalidation reflects actual renderer/font inputs. The full
  static build and page-budget checks pass. No unmeasured speedup is claimed.
- Testability and use: normal test discovery covers edge, script and mailer cases;
  the documented commands work; frozen dependencies, peer checks and CI syntax
  validate successfully. Hosted CI will run when the changes are pushed.
- Unused code: the web dead-code gate is clean, and deleted code has no remaining
  references or build dependencies.
- Process cleanup: all recorded build processes exited. No task-related build,
  test or bundling jobs remain. The user's pre-existing Astro dev server was kept.

All changes remain in the working tree for review. Nothing was deployed.

## Map library review

MapLibre GL JS 6.16.0 was both installed and the npm `latest` release when checked
on 2026-11-07. The mosque/burial locator is the web application's only MapLibre
surface. The prayer-time maps use purpose-built canvas/SVG Mercator rendering;
the wall display computes its prayer lattice in a worker. Their visibility gating,
cached drawing and limited geographic scope do not justify adding a WebGL map
dependency to those pages.

The locator now uses MapLibre's
[global state expressions](https://maplibre.org/maplibre-style-spec/expressions/#global-state)
for its palette. A measured theme switch made 85 `setPaintProperty` calls before
this change; it now makes one `setGlobalStateProperty` call and no individual paint
updates. The two-colour burial bitmap still needs one image update. These are API
call counts, not a frame-rate or CPU benchmark.

Selection uses feature state in paint expressions rather than changing layer
filters. GeoJSON features carry stable IDs, and both sources use `promoteId: "id"`:
the string slugs otherwise become numeric IDs during tile encoding. Rendered
features were checked, not just the source data or state setter's return value.
Selection survives filtering and is cleared when its place disappears.

Search skips source updates when the matching IDs are unchanged. It retains full
filtered source replacement so cluster counts describe the actual search results.
MapLibre 6 already queues/coalesces pending `setData` calls; adding a second queue
would duplicate that machinery. `updateData` is useful for large, incremental live
datasets, whereas this small static directory replaces filtered subsets.
See the [GeoJSONSource API](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/).

Cluster clicks use the features supplied by the layer event, avoiding a second
rendered-feature query. Pending expansion results are ignored after source changes,
context loss or navigation. WebGL recovery restores the current theme, search,
burial visibility and transient feature state after MapLibre reconstructs the style.

Existing lazy JS/CSS loading, explicitly bundled workers, clustering, cooperative
gestures, reduced-motion camera behavior, native controls and attribution remain.
Globe/terrain/3D rendering would add work without helping this Sweden place finder.
Worker prewarming would also undermine its lazy loading and cleanup; none was added.

Chromium with software WebGL passed 25 runtime assertions covering theme update
counts, rendered IDs and selection, equivalent and rapid searches, burial toggling,
valid/stale cluster expansion, forced WebGL loss/recovery, and navigation teardown.
Light and dark maps were visually inspected. This validates behavior in Chromium;
it is not a physical-device GPU performance measurement or cross-browser test.

The full `pnpm -w verify` gate passed after the map changes: 115 test files,
1,251 tests, typechecking, lint, Knip, edge bundles, content checks, all workspace
builds, 2,614 generated pages and page budgets. The first attempt hit the host's
`/tmp` write quota; the successful run used
`TMPDIR=/home/yunus/.cache/islam-map-review-tmp`. Logs and browser assertion results
are in `/home/yunus/.cache/islam-map-review-verify.log` and
`/home/yunus/.cache/islam-map-review-browser.json`.

Both task-created Chromium processes exited, their Argent sessions were stopped,
and the verification process exited successfully. The existing Astro development
server was preserved. No changes were deployed.
