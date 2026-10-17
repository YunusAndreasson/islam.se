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
