import { describe, expect, it } from '@jest/globals';

import type { FeatureCollection } from 'geojson';

import { computePrayerTimes } from '../prayer-times';
import { DEFAULT_SETTINGS } from '../settings/types';
import { buildGrid, buildLines } from './field';

// A coarse grid keeps these fast while still spanning the default bounds, which are
// generous enough to cover the whole map viewport (lat 50→73, lon 0→34).
const GRID_OPTS = { latStep: 1, lonStep: 1.5 };
// Fixed local day so prayer instants are stable regardless of the runner's clock.
const DATE = new Date(2026, 2, 21, 12, 0, 0); // 21 Mar 2026, around the equinox

function flattenCoords(fc: FeatureCollection): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) for (const x of v) walk(x);
  };
  for (const f of fc.features) walk((f.geometry as { coordinates?: unknown }).coordinates);
  return out;
}

describe('buildGrid', () => {
  it('covers the configured bounds and computes ordered, valid times inland', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    expect(grid.lats[0]).toBe(50);
    expect(grid.lats[grid.lats.length - 1]).toBeGreaterThanOrEqual(72);
    expect(grid.lons[0]).toBe(0);

    // A central-Sweden node: prayers must be finite and chronological. This is the
    // contract every line and wash relies on — out-of-order times would mean the
    // visualisation is reading adhan wrong.
    const iLat = grid.lats.indexOf(62);
    const jLon = grid.lons.indexOf(15);
    expect(iLat).toBeGreaterThanOrEqual(0);
    expect(jLon).toBeGreaterThanOrEqual(0);
    const t = grid.pt[iLat][jLon];
    expect(t.fajr).toBeLessThan(t.sunrise);
    expect(t.sunrise).toBeLessThan(t.dhuhr);
    expect(t.dhuhr).toBeLessThan(t.asr);
    expect(t.asr).toBeLessThan(t.sunset);
    expect(t.sunset).toBeLessThanOrEqual(t.isha);
  });

  // The default steps (0.42 / 0.52) don't divide the bounds evenly, so the stepped axis
  // used to stop short of its declared max (lat 72.68 not 73, lon 33.8 not 34), leaving an
  // unwashed strip at the top/right edge. The axis must now reach the exact max. A tiny
  // custom region with the same non-dividing steps reproduces it without the full grid.
  it('reaches the exact max bound even when the step does not divide the range', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, {
      bounds: [0, 50, 1, 51], // [w, s, e, n] — 1° wide/tall
      latStep: 0.42,
      lonStep: 0.52,
    });
    expect(grid.lats[grid.lats.length - 1]).toBe(51); // not 50.84
    expect(grid.lons[grid.lons.length - 1]).toBe(1); // not 0.52
    // Still monotonic with no duplicated final point from the appended max.
    for (let i = 1; i < grid.lats.length; i++) expect(grid.lats[i]).toBeGreaterThan(grid.lats[i - 1]);
    for (let j = 1; j < grid.lons.length; j++) expect(grid.lons[j]).toBeGreaterThan(grid.lons[j - 1]);
  });
});

describe('buildLines', () => {
  it('draws the Maghrib line exactly when Maghrib is sweeping the country', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    // The instant Maghrib occurs at central Sweden — the line must cross there.
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const { lines, labels } = buildLines(grid, central.maghrib.getTime());

    const prayerOf = (f: { properties: unknown }) =>
      (f.properties as { prayer?: string } | null)?.prayer;
    const maghrib = lines.features.find((f) => prayerOf(f) === 'maghrib');
    expect(maghrib).toBeDefined();
    expect(labels.some((l) => l.prayer === 'maghrib')).toBe(true);

    // Midday: Maghrib is hours away and nowhere near the country — no Maghrib line.
    const noon = buildLines(grid, central.dhuhr.getTime());
    expect(noon.lines.features.find((f) => prayerOf(f) === 'maghrib')).toBeUndefined();
  });

  it('emits no NaN coordinates under polar (unresolved) settings in summer', () => {
    const summer = new Date(2026, 5, 21, 12, 0, 0); // midnight-sun season up north
    const settings = { ...DEFAULT_SETTINGS, polarCircleResolution: 'unresolved' as const };
    const grid = buildGrid(summer, settings, GRID_OPTS);
    const now = summer.getTime();
    const { lines } = buildLines(grid, now);
    expect(flattenCoords(lines).every((n) => Number.isFinite(n))).toBe(true);
  });
});
