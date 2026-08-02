// The whole-country prayer-time lattice, cached per day.
//
// WHY A CACHE AT ALL. The grid is 56 × 67 = 3752 points, each one a `new PrayerTimes` —
// measured at 40–72 ms on desktop Node, which on Hermes and a mid-range Android maps to a
// 200–600 ms block of the JS thread. Before day navigation that cost was paid once per
// calendar day and nobody noticed. Stepping days makes it a cost per TAP, and stepping
// forward then back would pay it twice for a grid that has not changed at all.
//
// A tiny insertion-ordered Map, holding the viewed day and its two neighbours. Each grid is
// roughly 0.4–0.5 MB, so three is about 1.5 MB — worth it to make the back-step free, small
// enough not to matter. Deliberately NOT prefetching ±1 eagerly: that would move the stall
// rather than remove it, and the LRU should be measured on a real device first.
//
// The compute-affecting settings are folded in as a signature. A change to any of them
// invalidates EVERY cached day at once, which is right: they are global, not per-day.
import type { PrayerSettings } from '@/lib/settings/types';
import { stockholmPrayerDate } from '@/lib/stockholm-time';
import { buildGrid, type SolarGrid } from './field';

/** Viewed day ± 1. See the note above on why this is small and why nothing is prefetched. */
const MAX_ENTRIES = 3;

const cache = new Map<number, SolarGrid>();
let cachedSignature: string | null = null;

/**
 * The grid is built with polar resolution forced to 'unresolved' and rounding to 'none',
 * NOT the user's choices. This override lives here — rather than at the call site — so
 * that day navigation cannot make the cached days and the freshly-built ones disagree
 * about it, and so the reasoning has one home:
 *
 * POLAR: Sweden defaults to aqrabBalad, which borrows a neighbouring latitude's times.
 * That is discontinuous across the grid — lat 68 and 69 can both clamp to 22:21 next to
 * lat 67's real 21:50 — so the Maghrib/Ishaʾ isolines came out jagged, and it draws a
 * confident prayer line where there is really perpetual twilight. 'unresolved' leaves the
 * polar zone NaN, so the lines stay smooth and simply stop at the boundary.
 *
 * ROUNDING: minute-rounding is a DISPLAY convention. On the grid it quantises the time
 * field into ~15–30 km plateaus (the sun sweeps ~0.25° of longitude per minute) and the
 * level-0 contour stair-steps along those plateau edges — measured, the rounded grid
 * tripled the lines' spurious turning (11.3 vs 3.7 rad per Mercator unit) and left visible
 * long-wave wobble after smoothing.
 *
 * The user's OWN prayer times keep their chosen resolution and rounding; only the field
 * the lines are drawn from is overridden.
 */
function gridSettings(settings: PrayerSettings): PrayerSettings {
  return { ...settings, polarCircleResolution: 'unresolved', rounding: 'none' };
}

/**
 * The lattice for the Stockholm day starting at `dayStart`, built at most once per
 * (day, signature). Returns the SAME reference on a hit, so downstream `useMemo`s keyed on
 * it — buildLines, the projected paths — do not recompute either.
 *
 * `signature` must be `computeSignature(settings)`: it is passed in rather than derived
 * here so the caller's own memo keys and this cache key can never disagree.
 */
export function gridForDay(
  dayStart: number,
  settings: PrayerSettings,
  signature: string,
): SolarGrid {
  if (cachedSignature !== signature) {
    // A compute-affecting setting changed, so every stored day is stale at once.
    cache.clear();
    cachedSignature = signature;
  }

  const hit = cache.get(dayStart);
  if (hit) {
    // Re-insert so the viewed day is always the most recently used — otherwise stepping
    // back and forth between two days would evict whichever was inserted first.
    cache.delete(dayStart);
    cache.set(dayStart, hit);
    return hit;
  }

  const grid = buildGrid(stockholmPrayerDate(dayStart), gridSettings(settings));
  cache.set(dayStart, grid);
  // Map preserves insertion order, so the first key is the least recently used.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return grid;
}

/** Test seam — drops every entry and the stored signature, so one test's grids cannot
 *  satisfy another's cache hit. Mirrors resetLaunchCountForTests in lib/hints. */
export function __resetGridCache(): void {
  cache.clear();
  cachedSignature = null;
}
