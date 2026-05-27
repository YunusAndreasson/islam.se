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
import type { Feature, FeatureCollection, MultiLineString } from 'geojson';

import { computePrayerTimes, PRAYER_ORDER, type PrayerKey } from '../prayer-times';
import type { PrayerSettings } from '../settings/types';
import {
  catmullRom,
  chainSegments,
  labelPlacement,
  marchingSquares,
  type Segment,
  smoothChain,
} from './contour';
import { DAWN_COOL, DAWN_EDGE, DAY, DUSK_EDGE, DUSK_WARM, mix, NIGHT, type RGBA, WHITE_NIGHT } from './palette';

// Generously larger than the camera's Sweden framing so the wash always covers the
// whole viewport — at the locked zoom-out the visible map spills well past Sweden
// (open sea west, Finland/Baltics east, the continent south), and a tighter grid
// left those edges unwashed as a visible rectangular "box". Cells outside Sweden
// carry the wash but need no detail, so the step can stay moderate.
const DEFAULT_GRID_BOUNDS: [number, number, number, number] = [0.0, 50.0, 34.0, 73.0];
// Moderate step: fine enough (with the wash shader's bilinear texture sampling) to read
// as a smooth gradient over Sweden, coarse enough that covering the wider viewport keeps
// the one-time grid build — memoised per (day, settings) — a brief one-off.
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
  // The stepped loop stops at the last whole step <= max (e.g. 72.68 for [50, 73] step
  // 0.42), leaving an uncovered strip up to the declared bound. Append the exact max so
  // the grid actually spans the bounds it claims; the final cell is just shorter.
  const last = out[out.length - 1];
  if (last === undefined || last < max - 1e-9) out.push(Number(max.toFixed(4)));
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
    // Fajr → sunrise: night fades up through cool dawn into clear day. The DAWN_EDGE at
    // the sunrise end keeps the wash present right at the sunrise line (not transparent),
    // so the line and its gradient read as one — same fix applied to every twilight line.
    if (now < sunrise) return ramp(now, sunrise, fajr, DAWN_COOL, DAWN_EDGE);
    if (now < sunset) return DAY;
    // Maghrib(sunset) → Isha: clear day deepens through warm dusk into night. DUSK_EDGE
    // keeps the wash present at the Maghrib line so it connects to the sweeping line.
    if (now < isha) return ramp(now, sunset, isha, DUSK_WARM, DUSK_EDGE);
    return NIGHT;
  }
  // Polar fallback — only when adhan genuinely could NOT resolve the prayer/twilight
  // times (NaN). Note this is rare under the Sweden defaults: `aqrabBalad` resolves
  // Kiruna's midsummer into *valid* artificial Fajr/Isha (borrowed from the nearest date
  // that has a real night), so the branch above runs and the wash deepens to night around
  // those times — which is correct here, because the map visualises the prayer schedule
  // the app actually uses, not the raw astronomical daylight. This fallback is the last
  // resort for the truly-unresolvable case: show daylight while the sun is up if we have
  // it, else a pale white-night tint. Never NaN, never black.
  if (ok(sunrise) && ok(sunset)) {
    return now >= sunrise && now < sunset ? DAY : WHITE_NIGHT;
  }
  return WHITE_NIGHT;
}

export interface PrayerLineLabel {
  prayer: PrayerKey;
  lngLat: [number, number];
  /** Unit direction of the line at `lngLat`, in [lon, lat] space. */
  tangent: [number, number];
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
    // Chain the raw cell segments into paths; de-noise the coarse-grid waviness
    // (smoothChain) and then fit a smooth interpolating curve through each (centripetal
    // Catmull-Rom) so the line reads as a true curve, not the gently faceted polyline the
    // ~40 km lattice leaves behind. Label placement stays on the raw segments — the
    // smoothed line tracks them within a fraction of a cell.
    const smoothed = chainSegments(segments).map((line) => catmullRom(smoothChain(line)));
    features.push({
      type: 'Feature',
      properties: { prayer },
      geometry: { type: 'MultiLineString', coordinates: smoothed },
    });
    const placement = labelPlacement(segments);
    if (placement) labels.push({ prayer, lngLat: placement.point, tangent: placement.tangent });
  }
  return { lines: { type: 'FeatureCollection', features }, labels };
}
