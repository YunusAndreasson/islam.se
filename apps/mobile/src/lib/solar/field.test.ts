import { describe, expect, it } from '@jest/globals';

import type { FeatureCollection } from 'geojson';

import { computePrayerTimes } from '../prayer-times';
import { DEFAULT_SETTINGS } from '../settings/types';
import { buildCells, buildGrid, buildLines, washAt, type PointTimes } from './field';

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
});

describe('washAt', () => {
  const t: PointTimes = (() => {
    const p = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    return {
      fajr: p.fajr.getTime(),
      sunrise: p.sunrise.getTime(),
      dhuhr: p.dhuhr.getTime(),
      asr: p.asr.getTime(),
      maghrib: p.maghrib.getTime(),
      isha: p.isha.getTime(),
      sunset: p.sunset.getTime(),
    };
  })();

  it('is fully transparent at midday and a heavy veil deep at night', () => {
    const midday = (t.dhuhr + t.sunset) / 2;
    const deepNight = t.fajr - 60 * 60_000; // an hour before dawn
    expect(washAt(midday, t)[3]).toBe(0); // clear — basemap untouched
    expect(washAt(deepNight, t)[3]).toBeGreaterThan(0.5); // night veil
  });

  it('warms up during the Maghrib→Isha dusk interval', () => {
    const midDusk = (t.sunset + t.isha) / 2;
    const [r, , b, a] = washAt(midDusk, t);
    expect(a).toBeGreaterThan(0); // not clear
    expect(a).toBeLessThan(0.66); // not yet full night
    expect(r).toBeGreaterThan(b); // warm (red channel leads blue) — the sunset glow
  });

  it('never returns NaN when prayer times are unresolvable (polar)', () => {
    const broken: PointTimes = {
      fajr: Number.NaN,
      sunrise: Number.NaN,
      dhuhr: t.dhuhr,
      asr: t.asr,
      maghrib: Number.NaN,
      isha: Number.NaN,
      sunset: Number.NaN,
    };
    const c = washAt(t.dhuhr, broken);
    expect(c.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('buildCells', () => {
  it('veils the country at night but adds almost nothing at midday', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const midday = (central.dhuhr.getTime() + central.sunset.getTime()) / 2;
    const midnight = central.fajr.getTime() - 3 * 60 * 60_000;

    const dayCells = buildCells(grid, midday);
    const nightCells = buildCells(grid, midnight);
    expect(nightCells.features.length).toBeGreaterThan(dayCells.features.length);
    // Every cell carries a parseable rgba colour.
    for (const f of nightCells.features) {
      expect(String((f.properties as { color?: string } | null)?.color)).toMatch(/^rgba\(/);
    }
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
    expect(() => buildCells(grid, now)).not.toThrow();
    const { lines } = buildLines(grid, now);
    expect(flattenCoords(lines).every((n) => Number.isFinite(n))).toBe(true);
    expect(flattenCoords(buildCells(grid, now)).every((n) => Number.isFinite(n))).toBe(true);
  });
});
