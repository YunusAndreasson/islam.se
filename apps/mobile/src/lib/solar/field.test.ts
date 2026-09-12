import { describe, expect, it } from '@jest/globals';

import { at, first, last } from '@/test-utils/at';

import type { FeatureCollection } from 'geojson';

import { computePrayerTimes } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { CAMERA_MAX_BOUNDS } from '@/lib/map/camera-bounds';
import { buildGrid, buildLines, gradedAxis, type SolarGrid } from './field';

// A coarse UNIFORM grid keeps these fast while still spanning the default bounds. Passing
// steps opts out of the graded axis (see buildGrid), which is what lets a 1°/1.5° lattice
// stand in for the real one here.
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
  // THE GAP THIS GUARDS. The lattice used to be a Sweden-shaped box (lat 50→73, lon 0→34)
  // while the camera's leash was continental, so every sweeping line ended at an invisible
  // rectangle in the North Sea that the reader could pan to but never past. The field must
  // cover everything the camera can be pointed at — that is the whole contract between
  // these two constants, and it is why DEFAULT_GRID_BOUNDS is derived from the leash
  // rather than written out a second time.
  it('covers every degree the camera can be pointed at', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    expect(first(grid.lons, 'grid.lons')).toBeLessThanOrEqual(CAMERA_MAX_BOUNDS[0]);
    expect(first(grid.lats, 'grid.lats')).toBeLessThanOrEqual(CAMERA_MAX_BOUNDS[1]);
    expect(last(grid.lons, 'grid.lons')).toBeGreaterThanOrEqual(CAMERA_MAX_BOUNDS[2]);
    expect(last(grid.lats, 'grid.lats')).toBeGreaterThanOrEqual(CAMERA_MAX_BOUNDS[3]);
  });

  it('computes ordered, valid times inland', () => {
    // Explicit bounds so lat 62 / lon 15 are actual samples: the default box starts at
    // lon −26 now, and whether a given degree lands on a node is an accident of the step.
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, { bounds: [0, 50, 34, 73], ...GRID_OPTS });

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

// The lattice went from a Sweden-shaped box to the camera's whole leash, and two things
// that were free inside one country stop being free across a continent: a calendar day is
// no longer the same day everywhere on it, and a cell far from the core spans enough
// ground that the field inside it is no longer a straight line. These pin both, plus the
// accuracy the widening was NOT allowed to cost Sweden.
describe('gradedAxis', () => {
  const CORE_MIN = 50;
  const CORE_MAX = 73;

  it('keeps the core at its own step and coarsens outward', () => {
    const a = gradedAxis(30, 85, CORE_MIN, CORE_MAX, 0.42, 4);
    const stepAt = (v: number) => {
      const i = a.findIndex((x) => x >= v);
      return (a[i + 1] as number) - (a[i] as number);
    };
    // Inside the core the step is the core's own — this is the resolution every line over
    // Sweden was tuned against, and the focus of this app is Sweden.
    expect(stepAt(60)).toBeCloseTo(0.42, 6);
    // Far outside it the step has reached the far value, so the far field costs rows
    // instead of a whole extra lattice.
    expect(stepAt(34)).toBeCloseTo(4, 6);
  });

  it('is strictly increasing and lands exactly on both bounds', () => {
    const a = gradedAxis(30, 85, CORE_MIN, CORE_MAX, 0.42, 4);
    // marchingSquares divides by the gap between neighbouring samples: a repeat would put
    // an Infinity into a line, and a step backwards would fold the lattice over itself.
    for (let i = 1; i < a.length; i++) expect(a[i] as number).toBeGreaterThan(a[i - 1] as number);
    expect(first(a, 'axis')).toBe(30);
    expect(last(a, 'axis')).toBe(85);
  });

  it('never jumps by more than the growth factor between neighbouring cells', () => {
    // A cell nineteen times its neighbour would kink the line where the two meet, because
    // marching squares interpolates linearly inside each.
    const a = gradedAxis(30, 85, CORE_MIN, CORE_MAX, 0.42, 4);
    for (let i = 2; i < a.length - 1; i++) {
      const prev = (a[i] as number) - (a[i - 1] as number);
      const next = (a[i + 1] as number) - (a[i] as number);
      // The last cell on each side is a remainder and may be shorter; only growth is bounded.
      expect(next / prev).toBeLessThan(1.7);
    }
  });

  it('degenerates to the plain axis when the core covers everything', () => {
    const a = gradedAxis(50, 52, 40, 60, 0.5, 4);
    expect(a).toEqual([50, 50.5, 51, 51.5, 52]);
  });
});

describe('buildLines across a continent', () => {
  /** A feature's polylines, or none — the narrowing every geometry read here needs. */
  const coordsOf = (f: FeatureCollection['features'][number] | undefined): [number, number][][] =>
    f?.geometry.type === 'MultiLineString' ? (f.geometry.coordinates as [number, number][][]) : [];

  // THE BUG THIS GUARDS, AND IT IS NOT A SMALL ONE. The lattice holds ONE calendar date,
  // but a calendar date is longitude-dependent: at 18:30 UTC Fajr is breaking where the
  // local date is already tomorrow, so "today's Fajr" there is twenty hours off and the
  // level-0 contour does not exist at all. Measured on a global lattice before the fix,
  // the Fajr line was MISSING and Dhuhr's was drawn 60° from where Dhuhr truly was.
  it('finds the line at the far edge of the box, not a day away from it', () => {
    const grid = buildGrid(DATE, DEFAULT_SETTINGS, GRID_OPTS);
    const east = { latitude: 55, longitude: 60 };
    const west = { latitude: 55, longitude: -20 };
    for (const place of [east, west]) {
      const t = computePrayerTimes(place, DATE, DEFAULT_SETTINGS);
      const { lines } = buildLines(grid, t.maghrib.getTime());
      const maghrib = lines.features.find(
        (f) => (f.properties as { prayer?: string } | null)?.prayer === 'maghrib',
      );
      expect(maghrib).toBeDefined();
      // and it passes within a degree of the place whose Maghrib it is
      const near = coordsOf(maghrib).flat().some(
        ([lon, lat]) => Math.abs(lon - place.longitude) < 1.5 && Math.abs(lat - place.latitude) < 3,
      );
      expect(near).toBe(true);
    }
  });

  it('costs Sweden nothing: every vertex over the country is within a minute of adhan', () => {
    // The oracle test. Widening the lattice was allowed to coarsen the far field; it was
    // NOT allowed to move a line over Sweden, so each vertex there is handed back to adhan
    // and asked what the prayer really is at that point. Before the widening this was 2 s.
    const grid = buildGrid(DATE, DEFAULT_SETTINGS);
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const now = central.maghrib.getTime();
    const { lines } = buildLines(grid, now);
    let checked = 0;
    for (const f of lines.features) {
      const prayer = (f.properties as { prayer: keyof ReturnType<typeof pointTimes> }).prayer;
      for (const line of coordsOf(f)) {
        for (const [lon, lat] of line) {
          if (lon < 10 || lon > 25 || lat < 55 || lat > 69) continue;
          const truth = pointTimes({ latitude: lat, longitude: lon })[prayer];
          expect(Math.abs(truth - now)).toBeLessThan(60_000);
          checked++;
        }
      }
    }
    // Guard the guard: an empty loop would pass silently.
    expect(checked).toBeGreaterThan(20);
    function pointTimes(c: { latitude: number; longitude: number }) {
      const t = computePrayerTimes(c, DATE, DEFAULT_SETTINGS);
      return {
        fajr: t.fajr.getTime(),
        sunrise: t.sunrise.getTime(),
        dhuhr: t.dhuhr.getTime(),
        asr: t.asr.getTime(),
        maghrib: t.maghrib.getTime(),
        isha: t.isha.getTime(),
      };
    }
  });

  it('anchors the label pill in the core, not at the centroid of a continental line', () => {
    // A line running from the Sahara to Svalbard has its centroid over the Mediterranean,
    // and representativePoint snaps to the point nearest it — so the pill would leave the
    // screen the reader is actually looking at.
    const grid = buildGrid(DATE, DEFAULT_SETTINGS);
    const central = computePrayerTimes({ latitude: 62, longitude: 15.5 }, DATE, DEFAULT_SETTINGS);
    const { lines, labels } = buildLines(grid, central.maghrib.getTime());
    const maghribLine = lines.features.find(
      (f) => (f.properties as { prayer?: string } | null)?.prayer === 'maghrib',
    );
    const span = coordsOf(maghribLine).flat().map(([, lat]) => lat);
    // The line really does run well past the country in both directions...
    expect(Math.min(...span)).toBeLessThan(50);
    const label = labels.find((l) => l.prayer === 'maghrib');
    expect(label).toBeDefined();
    // ...and the pill is still up in the core.
    expect(label?.lngLat[1]).toBeGreaterThanOrEqual(50);
    expect(label?.lngLat[1]).toBeLessThanOrEqual(73);
  });
});
