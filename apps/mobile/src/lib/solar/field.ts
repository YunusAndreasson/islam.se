// The solar field: turn the prayer-times engine into map geometry.
//
// IMPORTANT — validity: every *moment* on this map comes straight from adhan via
// computePrayerTimes(). Nothing here invents a prayer time. The lines are the
// exact locus where a real prayer time equals the chosen instant. (The twilight
// wash that actually renders is independent of this file — pure sun geometry in
// washShader.ts, with its CPU twin in skia/washColor.ts; this file only feeds the
// sweeping prayer LINES.)
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
  orientNorthFirst,
  type Segment,
  smoothChain,
} from './contour';

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

// Label clearance around `avoid` (the user's dot), in screen-equivalent latitude
// degrees (see representativePoint). ~0.9° ≈ 55 dp at the whole-Sweden zoom — the
// pill's half-width plus the dot's glow, so the pill clears the dot and the city
// name above it without sliding further along the line than it has to.
const LABEL_AVOID_RADIUS = 0.9;

/**
 * The sweeping prayer lines: for each prayer, the level-0 contour of
 * (prayerTime − now). A line only exists where that prayer is crossing the map at
 * this instant, so lines appear, sweep, and vanish on their own as time advances.
 *
 * `avoid` ([lon, lat], optional): keep each line's label pill clear of this point —
 * the user's location dot. Without it, a pill parks ON the dot exactly when its
 * prayer's time reaches the user's city (the line passes through their coordinates
 * at that instant — the most-watched moment on the screen).
 */
export function buildLines(
  grid: SolarGrid,
  now: number,
  avoid?: [number, number],
  prayers: readonly PrayerKey[] = PRAYER_ORDER,
): SolarLines {
  const { lats, lons, pt } = grid;
  const features: Feature<MultiLineString, { prayer: PrayerKey }>[] = [];
  const labels: PrayerLineLabel[] = [];
  // One scratch buffer reused across all six prayers instead of a fresh number[][]
  // per prayer. buildLines re-runs on every scrub frame (clock.now changes as the
  // user drags the day slider), so collapsing six grid allocations per call into one
  // reused buffer cuts the per-frame GC churn — same values, marchingSquares reads
  // each fill synchronously before the next prayer overwrites it.
  const field: number[][] = lats.map(() => new Array<number>(lons.length));
  for (const prayer of prayers) {
    for (let i = 0; i < pt.length; i++) {
      const row = pt[i];
      const frow = field[i];
      for (let j = 0; j < row.length; j++) frow[j] = row[j][prayer] - now;
    }
    const segments: Segment[] = marchingSquares(lats, lons, field, 0);
    if (segments.length === 0) continue;
    // Chain the raw cell segments into paths; de-noise the coarse-grid waviness
    // (smoothChain) and then fit a smooth interpolating curve through each (centripetal
    // Catmull-Rom) so the line reads as a true curve, not the gently faceted polyline the
    // ~40 km lattice leaves behind. Label placement stays on the raw segments — the
    // smoothed line tracks them within a fraction of a cell.
    //
    // 6 de-noising passes (was 3): where a prayer time changes fast with latitude — e.g.
    // Maghrib in the far north near midsummer, whose isoline bends hard — the coarse grid
    // leaves a sharp facet that 3 passes left visible (and Mercator magnifies it up north).
    // Extra passes pull the control polygon onto the smooth underlying curve before
    // Catmull-Rom resamples it; endpoints stay pinned, so open lines still reach the edge.
    // North-first orientation so the renderer's sweep-in reveal always pours
    // north → south, one deliberate direction for every prayer (see orientNorthFirst).
    const smoothed = chainSegments(segments).map((line) =>
      orientNorthFirst(catmullRom(smoothChain(line, 6))),
    );
    features.push({
      type: 'Feature',
      properties: { prayer },
      geometry: { type: 'MultiLineString', coordinates: smoothed },
    });
    const placement = labelPlacement(segments, avoid, LABEL_AVOID_RADIUS);
    if (placement) labels.push({ prayer, lngLat: placement.point, tangent: placement.tangent });
  }
  return { lines: { type: 'FeatureCollection', features }, labels };
}
