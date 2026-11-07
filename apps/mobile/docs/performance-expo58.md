# Expo 58 performance measurements — 17 October 2026

Measured on the Android API 35 `pixel` emulator, 411 × 914 dp, using a development
build, Hermes, React Compiler, Expo 58.0.13, RN 0.88, Skia 2.14 and MapLibre RN 11.5.
The emulator uses SwiftShader; its kernel/GPU transport dominates native profiles.
These are local measurements, not physical-device FPS or battery claims.

## Changes and evidence

| Change | Before | After | Scope |
| --- | --- | --- | --- |
| Map grid cache across rounding/polar preference changes | 20 rebuilds in 20 changes | 0 rebuilds in 20 changes | Deterministic cache benchmark; user prayer-time settings still apply |
| Project 1,816 vertices across 3 paths | Median 5.139 ms/frame | Median 0.488 ms/frame | Alternating UI-thread microbenchmark, five rounds of 60 frames per implementation; about 90.5% less projection time |
| Stationary overview drawing clock | New shader/path time each animation frame | At most 2 samples/second at national zoom | Bounded to 0.05 dp solar displacement and 500 ms lag; exact during preview and at city zoom |

Path benchmark milliseconds/frame, in run order:

- Original: 6.1393, 5.1392, 4.2352, 5.1037, 10.0221.
- Native transform: 0.4884, 0.4537, 0.3141, 0.7166, 0.6733.

Native transforms cache immutable geometry relative to a local origin. A conservative
float32 error guard and zoom ceiling retain the original Float64 projection whenever
precision would be insufficient. Runtime Skia comparison checked 5,874 projected
points at zooms 3, 4.5 and 7: maximum error 0.001334 dp. A fixed preview screenshot
before/after the path change had 0% pixel mismatch.

## Repeated idle profiles

| Run | React capture | React commits | Native jank events | Severe events |
| --- | --- | --- | --- | --- |
| Original 1 | 24.47 s | 8 | 67 | 23 |
| Sampled clock 1 | 20.92 s | 7 | 50 | 0 |
| Original 2 | 22.17 s | 5 | 70 | 28 |
| Sampled clock 2 | 20.58 s | 5 | 59 | 15 |

These native trace windows include different start/stop overhead and emulator load.
Raw event counts are **not** a controlled FPS percentage. Both sampled-clock runs
reduced RenderThread samples, but severe stalls persisted in the second run. Combined
React/native reports mostly placed stalls outside React commits. Do not convert
development render durations to production estimates with a fixed multiplier.

## Verification

- All 118 Jest suites passed: 1,420 tests, including preview/live projection, precision
  bounds, polar boundary rendering, reduced motion, cache behavior and date handling.
- TypeScript: zero errors. Project Expo lint passed. Diff whitespace check passed.
- Manual Argent checks reached the map, settings, calculation settings, Qibla and
  Moon views; Moon switched between sky and month modes. Pan and timeline scrub
  changed the expected camera/time state.
- Gesture replay remains unverified: after two attempts, native tree reads timed out
  or uiautomator returned `Killed`. Failed checks are preserved in the local flows.
- Background/resume exposed a blank development-build screen; investigation found
  ReactHost reloads and an invalidated Expo location callback. A clean relaunch and
  development-server reconnect were used for recovery. This is not a passing resume
  regression test, and no production startup/resume improvement is claimed.
- A final dual-profile attempt after reconnect could not start the Hermes sampler:
  `Runtime.evaluate` timed out. Native capture completed independently. The paired
  comparisons above precede the native-path change; the path improvement is supported
  by the alternating UI-thread benchmark and visual/numerical checks, not a final
  paired whole-app profile.
- Memory reached roughly 1.06 GB RSS after the long profiling/HMR session, and about
  720 MB during a fresh reconnect. This does not establish a leak or a memory saving.

Raw reports, profiler session files, benchmark outputs and test plan are local under
`.argent/performance/expo58/`; recordings are under `.argent/flows/`. Draft recordings
with failed or unknown checks must not be presented as passing regression tests.

## Skia 3 migration — 2026-10-17

Migrated the native drawing package from `@shopify/react-native-skia@2.14.0` to
`react-native-skia@3.6.2`, retaining the declarative scene, cached paths and sampled
clock. The [migration guide](https://wcandillon.github.io/react-native-skia/docs/getting-started/migration/)
describes Graphite/Dawn drawing on a native thread pool, Metal on Apple platforms,
and Vulkan on Android. It also explicitly says v2 is still maintained. This migration
adopts that architecture; the measurements below do not establish a whole-app speedup.

Android prebuild now explicitly sets API 26 as the minimum. Skia's required Vulkan
1.1 feature conflicts with MapLibre Vulkan 13.6.1's 1.0.3 declaration during manifest
merging. `withSkiaVulkanAndroid` selects the stricter 1.1 requirement in the app
manifest, preserving Play device filtering. Do not lower/remove it to make unsupported
devices install: Skia canvases would be blank. Only the unscoped Skia package is installed.

The app and package versions advance to 1.2.0. The existing `appVersion` runtime policy
is retained, separating this native ABI from 1.1.0 Skia 2 builds. This requires new native
builds; it cannot be delivered to old binaries as a JavaScript-only update. No update,
store build, submission or deployment was published during this investigation.

### Controlled Android checks

The comparison used the same API 35 Pixel emulator, app data, MapTiler configuration,
411.43 × 914.29 dp viewport and Sweden camera (61.4282039562, 17.4136249819,
zoom 4.1425185239). After a diagnostic headless emulator restart, Skia 3 reported
Vulkan available through the host NVIDIA Quadro M1200. These captures are separate
from the earlier SwiftShader runs above. Skia 2 used the existing Expo 58.0.13 native
binary; its baseline Metro dependency tree had Expo 58.0.14, while the isolated Skia 3
tree used locked Expo 58.0.13. This patch-level difference and development profiling
overhead are additional limits on attributing small differences to Skia.

For a fixed preview at 06:00 Europe/Stockholm on 17 October 2026, both versions had
2,392 prayer-line vertices. Argent's screenshot diff reported 0% mismatch after
rounding: 76 changed pixels in two small regions of the moon button. The transparent
wash, visible prayer line, blurred mosque lights, MapLibre labels and dock were visually
consistent. The screenshots were taken several minutes apart, so the small live moon
icon also had different time input; the comparison does not isolate its renderer.

| Workload | Skia 2 | Skia 3 |
|---|---|---|
| Fixed preview capture | 20.68 s; 1 React commit; 0 above 16 ms; no native jank reported | 20.57 s; 1 React commit; 0 above 16 ms; no native jank reported |
| First 40-update scrub capture | 23.77 s; 83 commits, 47 above 16 ms; 305 reported janks, 2 severe | 24.55 s; 86 commits, 44 above 16 ms; 342 reported janks, 5 severe |
| Warmed 40-update scrub capture | 21.17 s; 81 commits, 44 above 16 ms; 283 reported janks, 7 severe | 23.10 s; 85 commits, 43 above 16 ms; 280 reported janks, 7 severe |

The deterministic scrub driver calls the app clock's `setFraction` 40 times at 500 ms
intervals with `0.18 + (i % 16) * 0.035`, then returns to 0.25. It exercises React,
geometry generation and rendering; it is an integration workload, not a measured
finger-gesture latency test. Both warmed captures follow a complete warm-up sequence.
The capture windows differ and native hotspots include emulator GPU transport and
kernel frames. Raw jank totals are not an FPS percentage or proof of a phone-level
performance improvement. React geometry updates remain expensive in both versions.
Some native report timestamps exceed the React capture window; combined timing
correlation is not reliable enough here to assign individual stalls to React commits.

### Migration verification and remaining limits

- Full `pnpm verify` passed: typecheck, lint, 119 suites and 1,425 tests. An initial
  run had timeouts while compiling; a complete unchanged-threshold rerun passed.
- Final Android x86_64 debug build at version 1.2.0 passed (966 Gradle tasks).
- Verified map transparency, prayer lines, shader wash, blur, moon button and moon
  dial; dark/light style changes rendered, and the original light preference was restored.
- A real pan changed longitude. Native camera jumps confirmed overlay camera updates
  at zoom 7 and 12, covering the cached-path and precision-fallback ranges. A recorded
  pinch returned success without changing zoom; touch pinch remains unverified.
- One real Home/launch cycle produced AppState `background` then `active`, with GPU
  availability still true and the map/dock visibly rendered after resume. This is a
  single smoke check, not a lifecycle soak or proof that the earlier v2 resume issue is fixed.
- Draft flows retain the observed steps under `.argent/flows/`; they have not passed
  two complete replays and are not claimed as saved acceptance tests.
- iOS, physical phones, older Vulkan drivers, release-mode performance, all Android
  ABIs, long-run memory and polar-season visuals were not validated in this experiment.
  Keep Android 10-bit rendering disabled for the transparent overlay: it requires an
  opaque SurfaceView to survive composition and would change the map layering contract.

Raw React sessions, Perfetto traces, reports, screenshot diff and passing build/test
logs are local under `.argent/performance/skia3/`. An initial live-clock baseline had
different time input and is retained for diagnosis only, not included in the table.

After merging, the newer dependency work was retained: Expo and dev-client 58.0.14,
router 58.0.23, Argent 0.29.0 and agent CLI 1.0.19. Comparing the reconciled lockfile
with the pre-merge newer lockfile found no direct dependency downgrade, unexpected
removal, or decrease in the highest resolved version of any retained transitive package.
The combined master tree passed typecheck, lint, the deprecated-API check, and all
119 suites / 1,425 tests. Its Android x86_64 build also passed (966 tasks), was installed,
and launched from a fresh master Metro server. Runtime version 1.2.0 and Vulkan GPU
availability were confirmed; map, wash, line, mosque lights, moon and dock rendered,
with no AndroidRuntime or ReactNativeJS errors in the final log check. iOS and physical
device validation remain outstanding. Logs and the downgrade audit are saved alongside
the comparison artifacts.

## 1.3.0 polish pass — 2026-11-06 (JS only, NOT yet measured)

Code-level changes made without a device build. Nothing below has a before/after number
yet: the Phase 0 baseline (screenshots, recordings, gfxinfo around the 40-step scrub
driver, idle Perfetto in an imminent window) has not been captured, and every claim of a
saving here is an inference from the code until it has. Correctness changes are pinned by
tests; performance changes are listed with the measurement that would confirm them.

| Change | Why it should cost less, or be right | Confirm with |
| --- | --- | --- |
| Basemap style passed as a pre-serialised string | `<Map>` re-ran `JSON.stringify` over the whole style on every render (every tick and scrub step) | JS profile of a scrub |
| `<Map>` onPress stable over a ref | a fresh closure per tick voided the compiler's memo of the whole `<Map>` element and its layers | React commits per tick |
| React Compiler now compiles every component and hook (scrubber, `useSolarClock`, `useAim` were skipped) | the scrub pan config is memoised instead of re-sent to native on every render | RNGH config sends during a drag |
| Scrub positions coalesced, latest wins (`lib/map/scrub-pipeline`) | at most one position queued behind a slow field rebuild, not one per step | lines stop when the finger stops; gfxinfo jank % |
| Precision fallback culls off-screen segments (pen-up) except while a reveal trims | above ~z11 every vertex was re-projected and handed to Skia per frame | Skia redraw time at z12 |
| Mosque-speck holes skipped while closed (map moving) | up to ~235 circles rebuilt per pan frame for a hole at opacity 0 | redraw time during a pan |
| Comet tip mounted only during a reveal | its trim ran over the whole next-prayer path on every redraw at opacity 0 | idle redraw cost |
| Wash shader: sin/cos latitude from one `exp`; sin/cos declination as uniforms; `asin` only below the horizon | per pixel: `exp+atan+sin+cos+sin+cos+asin` → `exp`, and no `asin` in daylight | GPU time per redraw |
| Wash dither indexed by device pixel | in dp the noise repeated over 3 × 3 device pixels on a 3× screen | banding check, dark night |

### Measured: the prayer-line contour (2026-11-07)

The one change in this pass with a before/after number. A dual (React + Perfetto) profile of
a scrub on the emulator named `marchingSquares` as the largest app-owned JS function in the
scrub commit (133 ms self of ~1.1 s sampled, dev build); everything above it was React/Fabric
internals. `buildLines` filled a 70 × 84 field per prayer and walked every cell, ~34,000 cell
visits per step, for lines that cross a few hundred cells. It now visits only the cells whose
time interval can contain the instant (a per-day, per-prayer index in `lib/solar/field.ts`,
`contourAt`), with output identical to the full scan (`field.props.test.ts`).

| Per scrub step, all six prayers (Node/V8, interleaved runs, host load ≈ 9) | Before | After |
| --- | --- | --- |
| Contour (`contourByFullScan` → `contourAt`) | 125 ms | 2.5 ms |
| `buildLines` total | — | 24 ms (chaining + smoothing now dominate) |

On the device the re-profile no longer shows `marchingSquares` among the top functions. Commit
durations are NOT comparable between the two device runs: the host's load swung between ~9 and
~40 (another session, `updatedb`), and the sampler stalled for over half a second in both.
What remains in a scrub commit is Fabric's clone/commit of the map screen's subtree and, in dev
only, React 19's performance-track `measure` calls (`structuredClone` of each mark's detail).

Correctness fixes in the same pass (tests named in brackets): app layers in a fixed stack
through slots at the end of the style [`layer-slots.contract.test`]; pills and map taps
follow the solar drift, ~550 px at z11 [`MapMarkersOverlay.test`, `line-geometry.test`];
a fading line drifts from its own contour [`SolarSkiaOverlay.test`]; boundary dashes move
with the map; the bloom does not replay; the scrubber thumb no longer jumps back on
release, a second drag to the same end is sent, a tap ticks once [`PrayerDock.test`]; a
sideways swipe no longer opens the dock; calibration hysteresis [`aim.props.test`].

Deferred until a build: the Reanimated synchronous-UI-props flags and the Pressable
migration, the UI-thread camera handler, the bulk path build and geometry in shared
values, `colorSpace="srgb"`, the polar dissolve without an offscreen layer, the quantised
breath and the blur A/B.
