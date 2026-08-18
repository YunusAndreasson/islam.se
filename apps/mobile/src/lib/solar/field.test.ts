import { describe, expect, it } from '@jest/globals';

import { at, first, last } from '@/test-utils/at';

import type { FeatureCollection } from 'geojson';

import { computePrayerTimes } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { buildGrid, buildLines, type SolarGrid } from './field';

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
    const t = at(at(grid.pt, iLat, 'grid.pt'), jLon, 'grid.pt row');
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
    expect(last(grid.lats, 'grid.lats')).toBe(51); // not 50.84
    expect(last(grid.lons, 'grid.lons')).toBe(1); // not 0.52
    // Still monotonic with no duplicated final point from the appended max.
    for (let i = 1; i < grid.lats.length; i++) {
      expect(at(grid.lats, i, 'grid.lats')).toBeGreaterThan(at(grid.lats, i - 1, 'grid.lats'));
    }
    for (let j = 1; j < grid.lons.length; j++) {
      expect(at(grid.lons, j, 'grid.lons')).toBeGreaterThan(at(grid.lons, j - 1, 'grid.lons'));
    }
  });
});

// buildLines fills ONE scratch buffer and re-reads it for each of the six prayers (a
// deliberate allocation saving — it re-runs on every scrub frame). These pin what the
// caller can rely on when the lattice is malformed: a hole must never reach the screen
// as geometry, and one prayer's line must not depend on which prayers were computed
// before it into the same buffer.
//
// NOTE ON WHAT THESE DO NOT PROVE: the unconditional NaN write in buildLines is not
// currently falsifiable by a test. A hole is a whole missing PointTimes, so it is a hole
// for every prayer, and skipping the write is observationally identical to writing NaN.
// Swapping the write for a skip leaves all three of these green — checked. They cover
// the contract, not that one line.
describe('buildLines — a malformed lattice must not reach the screen as geometry', () => {
  // A row that stops short of the longitude axis — what a malformed grid actually looks
  // like from the inside: the row is present, but it does not span the lons it claims to.
  const holedGrid = (): SolarGrid => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    const midIdx = Math.floor(grid.pt.length / 2);
    const pt = grid.pt.map((row, i) => (i === midIdx ? row.slice(0, -2) : [...row]));
    return { ...grid, pt };
  };

  const coordsOf = (fc: { features: { properties: unknown; geometry: unknown }[] }, prayer: string) =>
    fc.features.find((f) => (f.properties as { prayer?: string } | null)?.prayer === prayer)
      ?.geometry;

  it('gives the same line for a prayer whether or not another was computed first', () => {
    const grid = holedGrid();
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const now = central.maghrib.getTime();

    // Order-independence is the property the shared buffer has to keep: Maghrib's line
    // must not depend on whether Fajr was drawn into the same slots just before it.
    const afterFajr = buildLines(grid, now, undefined, ['fajr', 'maghrib']);
    const alone = buildLines(grid, now, undefined, ['maghrib']);
    expect(coordsOf(afterFajr.lines, 'maghrib')).toEqual(coordsOf(alone.lines, 'maghrib'));
  });

  it('never emits a NaN coordinate from the hole', () => {
    const grid = holedGrid();
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const { lines } = buildLines(grid, central.maghrib.getTime());
    for (const v of flattenCoords(lines)) expect(Number.isNaN(v)).toBe(false);
  });

  it('drops rows the latitude axis does not size a buffer for', () => {
    // `field` is sized from `lats` but walked over `pt`; a short axis means the trailing
    // rows have nowhere to be written, and contouring them would read another row's data.
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    const short: SolarGrid = { ...grid, lats: grid.lats.slice(0, -2) };
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const { lines } = buildLines(short, central.maghrib.getTime());
    for (const v of flattenCoords(lines)) expect(Number.isNaN(v)).toBe(false);
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

  it('orients every open polyline north-first so the sweep-in reveal pours southward', () => {
    // The renderer trims each line from its start; this pins the buildLines contract
    // that the start is the NORTHERN end — otherwise reveals sweep in random directions
    // depending on which end chainSegments happened to walk first.
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const { lines } = buildLines(grid, central.maghrib.getTime());
    for (const f of lines.features) {
      if (f.geometry.type !== 'MultiLineString') continue;
      for (const line of f.geometry.coordinates as [number, number][][]) {
        const head = first(line, 'polyline');
        const tail = last(line, 'polyline');
        const closed = head[0] === tail[0] && head[1] === tail[1];
        if (!closed) expect(head[1]).toBeGreaterThanOrEqual(tail[1]);
      }
    }
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
