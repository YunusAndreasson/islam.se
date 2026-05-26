// The solar field: turn the prayer-times engine into map geometry.
//
// IMPORTANT — validity: every *moment* on this map comes straight from adhan via
// computePrayerTimes(). Nothing here invents a prayer time. The lines are the
// exact locus where a real prayer time equals the chosen instant; the wash
// between those moments is a faithful visualisation of adhan's own twilight
// intervals (Fajr→sunrise = dawn, Maghrib→Isha = dusk), not a new calculation.
//
// We compute a grid of prayer times ONCE per (date, settings) — that's the only
// expensive step — then per displayed instant it's cheap arithmetic on the cache.
import type { Feature, FeatureCollection, MultiLineString, Polygon } from 'geojson';

import { computePrayerTimes, PRAYER_ORDER, type PrayerKey } from '../prayer-times';
import type { PrayerSettings } from '../settings/types';
import { marchingSquares, representativePoint, type Segment } from './contour';
import {
  average,
  DAWN_COOL,
  DAY,
  DUSK_WARM,
  mix,
  NIGHT,
  type RGBA,
  rgbaString,
  WHITE_NIGHT,
} from './palette';

// Generously larger than the camera's Sweden framing so the wash always covers the
// whole viewport — at the locked zoom-out the visible map spills well past Sweden
// (open sea west, Finland/Baltics east, the continent south), and a tighter grid
// left those edges unwashed as a visible rectangular "box". Cells outside Sweden
// carry the wash but need no detail, so the step can stay moderate.
const DEFAULT_GRID_BOUNDS: [number, number, number, number] = [0.0, 50.0, 34.0, 73.0];
// Moderate step: fine enough (with the colour-field blur in buildCells) to read as
// a smooth gradient over Sweden, coarse enough that covering the wider viewport
// keeps the one-time grid build — memoised per (day, settings) — a brief one-off.
const DEFAULT_LAT_STEP = 0.42;
const DEFAULT_LON_STEP = 0.52;

/** Prayer + sun-event times (ms epoch; NaN where adhan can't resolve them) at one point. */
export interface PointTimes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
  sunset: number;
}

export interface SolarGrid {
  lats: number[];
  lons: number[];
  /** pt[latIdx][lonIdx] */
  pt: PointTimes[][];
}

export interface GridOptions {
  bounds?: [number, number, number, number];
  latStep?: number;
  lonStep?: number;
}

const ms = (d: Date): number => (d instanceof Date ? d.getTime() : Number.NaN);

function axis(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(4)));
  return out;
}

/** Build the cached prayer-time lattice. Location-independent: it covers the whole map. */
export function buildGrid(
  date: Date,
  settings: PrayerSettings,
  opts: GridOptions = {},
): SolarGrid {
  const [w, s, e, n] = opts.bounds ?? DEFAULT_GRID_BOUNDS;
  const lats = axis(s, n, opts.latStep ?? DEFAULT_LAT_STEP);
  const lons = axis(w, e, opts.lonStep ?? DEFAULT_LON_STEP);
  const pt = lats.map((lat) =>
    lons.map((lon) => {
      const p = computePrayerTimes({ latitude: lat, longitude: lon }, date, settings);
      return {
        fajr: ms(p.fajr),
        sunrise: ms(p.sunrise),
        dhuhr: ms(p.dhuhr),
        asr: ms(p.asr),
        maghrib: ms(p.maghrib),
        isha: ms(p.isha),
        sunset: ms(p.sunset),
      };
    }),
  );
  return { lats, lons, pt };
}

const ok = (n: number): boolean => Number.isFinite(n);

// Two-stop ramp through a transition interval [start, end]. The midpoint is the
// vivid tint (warm at dusk, cool at dawn); the ends fade toward day / night.
function ramp(now: number, start: number, end: number, mid: RGBA, edge: RGBA): RGBA {
  const p = (now - start) / (end - start);
  return p < 0.5 ? mix(edge, mid, p / 0.5) : mix(mid, NIGHT, (p - 0.5) / 0.5);
}

/**
 * The twilight colour at one point for a given instant, derived from that point's
 * own adhan times. Returns an RGBA whose alpha dims the basemap (clear by day,
 * heavy indigo at night, warm/cool during the dusk/dawn intervals).
 */
export function washAt(now: number, t: PointTimes): RGBA {
  const { fajr, sunrise, sunset, isha } = t;
  if (ok(fajr) && ok(sunrise) && ok(sunset) && ok(isha)) {
    if (now < fajr) return NIGHT;
    // Fajr → sunrise: night fades up through cool dawn into clear day.
    if (now < sunrise) return ramp(now, sunrise, fajr, DAWN_COOL, DAY);
    if (now < sunset) return DAY;
    // Maghrib(sunset) → Isha: clear day deepens through warm dusk into night.
    if (now < isha) return ramp(now, sunset, isha, DUSK_WARM, DAY);
    return NIGHT;
  }
  // Polar fallback: the place never reaches true night. Show daylight while the
  // sun is up (if we have those), else a pale white-night tint. Never NaN, never black.
  if (ok(sunrise) && ok(sunset)) {
    return now >= sunrise && now < sunset ? DAY : WHITE_NIGHT;
  }
  return WHITE_NIGHT;
}

/**
 * The twilight wash as fill polygons. We colour each (strided) cell by averaging
 * its four corners so the coarse grid reads as a soft gradient, and we drop
 * essentially-clear daytime cells so midday adds no overdraw.
 */
// A single 3×3 box blur of the per-point colour field. Flat-shaded cells otherwise
// step between neighbours (visible banding in the steep dusk/dawn ramp); softening
// the field first makes adjacent cells nearly continuous, so the wash reads as a
// gradient — far cheaper than the grid resolution it would take to match it.
function smooth(grid: RGBA[][]): RGBA[][] {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const out: RGBA[][] = [];
  for (let i = 0; i < h; i++) {
    out[i] = [];
    for (let j = 0; j < w; j++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= h || jj >= w) continue;
          const c = grid[ii][jj];
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
          n += 1;
        }
      }
      out[i][j] = [r / n, g / n, b / n, a / n];
    }
  }
  return out;
}

export function buildCells(grid: SolarGrid, now: number, stride = 2): FeatureCollection {
  const { lats, lons, pt } = grid;
  const colorAt: RGBA[][] = smooth(pt.map((row) => row.map((t) => washAt(now, t))));
  const features: Feature<Polygon, { color: string }>[] = [];
  for (let i = 0; i < lats.length - 1; i += stride) {
    const i2 = Math.min(i + stride, lats.length - 1);
    for (let j = 0; j < lons.length - 1; j += stride) {
      const j2 = Math.min(j + stride, lons.length - 1);
      const c = average([colorAt[i][j], colorAt[i][j2], colorAt[i2][j2], colorAt[i2][j]]);
      if (c[3] < 0.012) continue; // daytime — nothing to veil
      features.push({
        type: 'Feature',
        properties: { color: rgbaString(c) },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lons[j], lats[i]],
              [lons[j2], lats[i]],
              [lons[j2], lats[i2]],
              [lons[j], lats[i2]],
              [lons[j], lats[i]],
            ],
          ],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

export interface PrayerLineLabel {
  prayer: PrayerKey;
  lngLat: [number, number];
}

export interface SolarLines {
  lines: FeatureCollection;
  labels: PrayerLineLabel[];
}

/**
 * The sweeping prayer lines: for each prayer, the level-0 contour of
 * (prayerTime − now). A line only exists where that prayer is crossing the map at
 * this instant, so lines appear, sweep, and vanish on their own as time advances.
 */
export function buildLines(
  grid: SolarGrid,
  now: number,
  prayers: readonly PrayerKey[] = PRAYER_ORDER,
): SolarLines {
  const { lats, lons, pt } = grid;
  const features: Feature<MultiLineString, { prayer: PrayerKey }>[] = [];
  const labels: PrayerLineLabel[] = [];
  for (const prayer of prayers) {
    const field = pt.map((row) => row.map((t) => t[prayer] - now));
    const segments: Segment[] = marchingSquares(lats, lons, field, 0);
    if (segments.length === 0) continue;
    features.push({
      type: 'Feature',
      properties: { prayer },
      geometry: { type: 'MultiLineString', coordinates: segments },
    });
    const label = representativePoint(segments);
    if (label) labels.push({ prayer, lngLat: label });
  }
  return { lines: { type: 'FeatureCollection', features }, labels };
}
