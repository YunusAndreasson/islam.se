// The solar field: turn the prayer-times engine into map geometry.
//
// IMPORTANT — validity: every *moment* on this map comes straight from adhan via
// computePrayerTimes(). Nothing here invents a prayer time. The lines are the
// exact locus where a real prayer time equals the chosen instant. (The twilight
// wash that actually renders is independent of this file — pure sun geometry in
// washShader.ts, with its CPU twin in skia/washColor.ts; this file only feeds the
// sweeping prayer LINES.)
//
// There is exactly ONE approximation, and it is confined to nearestOccurrence: on the far
// side of the box, where the calendar day the lattice was built for is not the local day
// the reader's instant falls in, the neighbouring day's occurrence is taken to be 24 h from
// this one's rather than computed. That costs the prayer's own day-over-day drift — a few
// minutes, under a pixel at any zoom the camera allows — and it is never reached over
// Sweden, where the whole box is one calendar day. Everything else is adhan's own number.
//
// We compute a grid of prayer times ONCE per (date, settings) — that's the only
// expensive step — then per displayed instant it's cheap arithmetic on the cache.
import type { Feature, FeatureCollection, MultiLineString } from 'geojson';

import type { LonLat } from '@/lib/coordinates';
import { CAMERA_MAX_BOUNDS, expandBounds } from '@/lib/map/camera-bounds';
import { computePrayerTimes, PRAYER_ORDER, type PrayerKey } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import {
  catmullRom,
  chainSegments,
  labelPlacement,
  marchingSquares,
  orientNorthFirst,
  type Segment,
  smoothChain,
} from './contour';

// THE LATTICE IS GRADED, AND IT COVERS EVERYWHERE THE CAMERA CAN LOOK.
//
// It used to be a Sweden-shaped box (lat 50→73, lon 0→34) while the camera's leash was
// continental, so every sweeping line ended in mid-sea at an invisible rectangle the
// reader could pan to but never past. A prayer line is not a Swedish object — at any
// instant ʿIshāʾ is beginning somewhere — and it should run off the edge of the screen,
// not stop inside it.
//
// WHY GRADED RATHER THAN SIMPLY WIDER. Measured against adhan itself, by handing back
// every drawn vertex and asking what the prayer really is at that point, over Sweden:
//
//   lat 0.42  lon 0.52   1 s        lat 1    lon 0.52    3 s
//   lat 0.42  lon 2      1 s        lat 2    lon 0.52    6 s
//   lat 0.42  lon 8      2 s        lat 4    lon 0.52   15 s
//
// Longitude resolution is very nearly FREE: a prayer time shifts by exactly 4 minutes per
// degree of longitude, and linear interpolation across a cell reproduces a linear field
// exactly. Latitude is where the entire error lives, because that is the direction the
// field curves in. So the two axes are graded independently, the core keeps the resolution
// every line over Sweden was tuned against, and the far field is coarsened mostly in the
// direction that costs nothing — which is what makes the wider box 5740 points against the
// old 3752 (a 51 → 72 ms build on desktop Node) instead of several times that.
const DEFAULT_GRID_BOUNDS: [number, number, number, number] = expandBounds(
  CAMERA_MAX_BOUNDS,
  6,
  5,
);
/**
 * The box the app is actually about: Sweden with the sea and neighbours around it. Two
 * things are anchored to it — the core's fine step, and where a line's label pill is
 * allowed to sit (see buildLines).
 *
 * Sized generously past the camera's Sweden framing so the whole viewport is at the fine
 * step at the locked zoom-out; a tighter core left the edges visibly coarser.
 */
const CORE_BOUNDS: [number, number, number, number] = [0.0, 50.0, 34.0, 73.0];
/** Inside CORE_BOUNDS — unchanged from when the lattice WAS the core, because this is the
 *  resolution every line over Sweden was tuned against (see the smoothing note in
 *  buildLines) and the focus of this app is Sweden. Measured after the widening: every
 *  vertex over the country is still within 2 s of adhan, which field.test.ts pins. */
const CORE_LAT_STEP = 0.42;
const CORE_LON_STEP = 0.52;
/** Outside it, once the ramp below has run out. Measured over the whole box, the far field
 *  lands within a couple of minutes of adhan — well under a pixel at the zooms from which
 *  any of it is visible, and the camera cannot leave Europe at all. */
const FAR_LAT_STEP = 4.0;
const FAR_LON_STEP = 8.0;
/** How fast the step grows leaving the core. A jump straight from 0.52° to 8° would put a
 *  1:15 cell ratio against the core's edge, and marching squares interpolates per cell —
 *  so the line would visibly kink where the two met. Ramping keeps every cell within 1.6×
 *  of its neighbour, and is short enough to cost only a handful of rows. */
const AXIS_GROWTH = 1.6;

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

/**
 * One axis of the graded lattice: `coreStep` between `coreMin` and `coreMax`, then a step
 * growing by `growth` per sample out to `farStep` on both sides, ending exactly on `min`
 * and `max`.
 *
 * Monotone and duplicate-free by construction — marchingSquares divides by the gap between
 * neighbouring samples, so a repeated or out-of-order value would put an Infinity into a
 * line rather than merely a wrong vertex.
 */
export function gradedAxis(
  min: number,
  max: number,
  coreMin: number,
  coreMax: number,
  coreStep: number,
  farStep: number,
  growth = AXIS_GROWTH,
): number[] {
  const lo = Math.max(min, Math.min(coreMin, max));
  const hi = Math.min(max, Math.max(coreMax, min));
  const round = (v: number) => Number(v.toFixed(4));
  // Below the core, walked outward from its edge so the ramp starts at the core's own
  // step, then reversed into ascending order.
  const below: number[] = [];
  let v = lo;
  let step = coreStep;
  while (v > min + 1e-9) {
    step = Math.min(farStep, step * growth);
    v = Math.max(min, v - step);
    below.push(round(v));
  }
  below.reverse();
  const core = axis(lo, hi, coreStep);
  const out = [...below, ...core];
  v = hi;
  // Seeded from the core's LAST cell, not from coreStep. `axis` ends on the exact bound, so
  // that cell is a remainder — 0.32° where the step is 0.42° — and ramping from the nominal
  // step instead put a 2.1× jump right at the core's edge, the one place the grading exists
  // to keep smooth.
  const penultimate = core[core.length - 2];
  step = penultimate === undefined ? coreStep : hi - penultimate;
  while (v < max - 1e-9) {
    step = Math.min(farStep, step * growth);
    v = Math.min(max, v + step);
    out.push(round(v));
  }
  return out;
}

/** Build the cached prayer-time lattice. Location-independent: it covers the whole map. */
export function buildGrid(
  date: Date,
  settings: PrayerSettings,
  opts: GridOptions = {},
): SolarGrid {
  // An explicit bounds/step pair means a caller wants a UNIFORM lattice of its own — the
  // introduction's year demo builds twelve coarse ones, and the tests pin the axis contract
  // on them. Only the default is graded.
  const uniform = opts.bounds !== undefined || opts.latStep !== undefined || opts.lonStep !== undefined;
  const [w, s, e, n] = opts.bounds ?? DEFAULT_GRID_BOUNDS;
  const lats = uniform
    ? axis(s, n, opts.latStep ?? CORE_LAT_STEP)
    : gradedAxis(s, n, CORE_BOUNDS[1], CORE_BOUNDS[3], CORE_LAT_STEP, FAR_LAT_STEP);
  const lons = uniform
    ? axis(w, e, opts.lonStep ?? CORE_LON_STEP)
    : gradedAxis(w, e, CORE_BOUNDS[0], CORE_BOUNDS[2], CORE_LON_STEP, FAR_LON_STEP);
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
  lngLat: LonLat;
  /** Unit direction of the line at `lngLat`, in [lon, lat] space. */
  tangent: LonLat;
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

const DAY_MS = 86_400_000;
const HALF_DAY_MS = DAY_MS / 2;
/**
 * How far from `now` a cell may be and still take part in a line. Six hours is far more
 * than any cell spans (the widest is 15° of longitude — one hour — and even the hard bend
 * of Maghrib against the polar boundary stays well inside it), and it is what keeps the
 * unwrap seam below from drawing a contour of its own.
 */
const FIELD_WINDOW_MS = 6 * 3_600_000;
/**
 * The most time a single cell may span and still be contoured. Marching squares walks a
 * cell LINEARLY, which is a claim about the field being smooth at this resolution — and
 * two places on a global lattice break that claim badly:
 *
 *  • THE UNWRAP SEAM. Half a world from the reader the unwrap flips, so one corner reads
 *    +11.9 h and its neighbour −11.9 h. That cell straddles zero and would draw a line
 *    down the middle of the Pacific that no prayer is anywhere near. Measured: these are
 *    the bulk of the bad cells, and they cluster at a ~23 h spread — far outside anything
 *    real, which is why one flat cap separates them so cleanly.
 *  • THE TWILIGHT BOUNDARY. Past ~48.5° on midsummer the sun never reaches the ʿIshāʾ
 *    angle at all, and just short of it ʿIshāʾ races toward midnight. A coarse cell
 *    against that wall interpolates a crossing that is really 90 minutes away, drawn as a
 *    confident east-west line across Europe.
 *
 * An hour is chosen from the measurement, not taste. Over four dates and the whole box, an
 * honest crossing cell spans well under it — over Sweden the widest is under 10 minutes,
 * so the core is nowhere near this bound — while the artifacts sit at 23 hours. With the
 * cap in place ʿIshāʾ's worst midsummer vertex went from 91 minutes out to 3, and Sweden's
 * own vertices did not move at all.
 */
const FIELD_MAX_SPREAD_MS = 3_600_000;

/**
 * The signed distance from `now` to the occurrence of this prayer NEAREST it — which is not
 * always the one the lattice holds.
 *
 * A CALENDAR DAY IS LONGITUDE-DEPENDENT, AND THAT IS THE WHOLE PROBLEM WITH A GLOBAL FIELD.
 * The lattice is built for one calendar date (it has to be — that is what the grid cache is
 * keyed on, and what "the viewed day" means to the reader). But at 18:30 UTC, Fajr is
 * breaking at longitude +141°, where the local date is already TOMORROW. The lattice holds
 * that point's Fajr for today, twenty hours earlier, so `t − now` is −24 h there and the
 * level-0 contour does not exist at all: measured before this, the Fajr line was simply
 * MISSING from a global lattice while Dhuhr's was drawn 60° from where Dhuhr truly was.
 *
 * Unwrapping to ±12 h picks the neighbouring day's occurrence instead, approximating it as
 * exactly 24 h away. The error that costs is the prayer's own day-over-day drift — a few
 * minutes, under a couple of pixels at any zoom the camera allows, and it is paid only on
 * the far side of the world; the Nordic core never wraps at all. Getting the exact
 * neighbouring day instead would mean building the lattice three times over, for a
 * correction smaller than the line is wide.
 */
function nearestOccurrence(at: number, now: number): number {
  let d = at - now;
  if (d > HALF_DAY_MS) d -= DAY_MS;
  else if (d < -HALF_DAY_MS) d += DAY_MS;
  // Past the window there is nothing a line could legitimately be made of, and the seam
  // where the unwrap flips (|d| ≈ 12 h) would otherwise read as a 24-hour cliff — a
  // contour drawn straight down the middle of the Pacific.
  return Math.abs(d) > FIELD_WINDOW_MS ? Number.NaN : d;
}

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
  avoid?: LonLat,
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
      // `field` is sized from `lats` while this walks `pt`; the two come off the same
      // axes, so a missing row means the grid is malformed rather than merely polar.
      if (!row || !frow) continue;
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        // Written UNCONDITIONALLY — NaN for a hole rather than leaving the slot alone.
        // Today the two are equivalent: a hole is a whole missing PointTimes, so it is
        // a hole for all six prayers and no stale value can survive a pass. The
        // unconditional form is what keeps that true if the shape ever changes, since
        // `field` is one buffer shared by every prayer (see above) and a slot left
        // untouched would carry the previous prayer's value into this one's contour —
        // a line drawn at a moment nobody's day contains. NaN is what marchingSquares
        // already reads as "no data".
        frow[j] = cell ? nearestOccurrence(cell[prayer], now) : Number.NaN;
      }
    }
    const segments: Segment[] = marchingSquares(lats, lons, field, 0, FIELD_MAX_SPREAD_MS);
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
    // The pill is placed from the segments that fall in the CORE, not from the whole line.
    // representativePoint snaps to the point nearest the line's centroid, and the lattice
    // now runs from the Sahara to Svalbard: a Maghrib line running that whole way has its
    // centroid somewhere over the Mediterranean, so the pill — which used to sit on the
    // line in Sweden because the line WAS Sweden — would quietly leave the screen the
    // reader is looking at. Falls back to the whole line when none of it is in the core,
    // which is the case where the pill is off-screen anyway and any anchor will do.
    const inCore = ([lon, lat]: LonLat): boolean =>
      lon >= CORE_BOUNDS[0] && lon <= CORE_BOUNDS[2] && lat >= CORE_BOUNDS[1] && lat <= CORE_BOUNDS[3];
    const coreSegments = segments.filter(([a, b]) => inCore(a) || inCore(b));
    const placement = labelPlacement(
      coreSegments.length > 0 ? coreSegments : segments,
      avoid,
      LABEL_AVOID_RADIUS,
    );
    if (placement) labels.push({ prayer, lngLat: placement.point, tangent: placement.tangent });
  }
  return { lines: { type: 'FeatureCollection', features }, labels };
}
