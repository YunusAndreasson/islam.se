// A non-uniform time axis for the dock's day scrubber: the minutes around each prayer
// are given more of the track than the empty hours between them, so the finger gets
// fine control exactly where the reader is aiming.
//
// WHY THE LINEAR AXIS IS UNUSABLE NEAR A PRAYER
// ---------------------------------------------
// The track is ~247 px wide on a 375 pt screen and spans a whole day, so one pixel is
// ≈5.8 minutes and the few pixels a finger wobbles are a twenty-minute jump. Landing on
// "ten minutes before ʿAṣr" is then a matter of luck. Most of that resolution is spent on
// stretches nobody scrubs into — the small hours, the long midday gap — while the minutes
// that actually carry a decision are compressed into a couple of pixels.
//
// WHY A WARP AND NOT A SNAP
// -------------------------
// A magnet that snaps the thumb onto the prayer instant makes it easy to land ON a prayer
// and impossible to land just BEFORE one, which is the opposite of fine control: the times
// a reader wants around Maghrib are 18:55 and 19:05, not only 19:00. A warp keeps every
// instant of the day reachable and merely changes how many pixels each one costs.
//
// THE SHAPE
// ---------
// A density over the day — 1 everywhere, rising to 1 + `strength` in a smooth well of
// ±`wellMinutes` around each mark — integrated and normalised to a cumulative map
// `toTrack: time → track`. Because the density is everywhere ≥ 1 the map is strictly
// increasing, so it inverts exactly; `toTime` is that inverse and is what the pan gesture
// reads. Normalising keeps the ends pinned (00:00 at the left rail, 24:00 at the right),
// so the whole day stays reachable in one drag and the fine control near prayers is paid
// for by the hours between them, not by the day's length.
//
// EVERY consumer of the axis must go through `toTrack` — thumb, fill, prayer marks AND the
// hour ruler. Warping the marks but not the ruler would put "12" somewhere other than
// where noon is, which is precisely the class of lie the ruler was rebuilt to stop telling.

/**
 * Half-width of a prayer's well, in minutes of real time either side of the mark, and the
 * peak extra density at the mark itself.
 *
 * These two are the whole feel of the control, so here is what the pair buys on the ~247 px
 * track of a 375 pt screen, against the 5.8 min/px of the flat axis it replaces:
 *
 *   at a prayer      2.3 min/px   (2.6× finer — a 3 px wobble is 7 min, not 17)
 *   fine band        ±12 min      (where the axis is under 4 min/px)
 *   between prayers  6.8 min/px   (17% coarser — the hours nobody aims at pay for it)
 *   hour ruler       ≤ 6 px shift (largest at "12", which the wells straddle unevenly)
 *
 * Raising `strength` buys precision at the mark; widening the well spreads it over more of
 * the approach. Both are paid for out of the same purse — the day is a fixed number of
 * pixels — so past roughly these values the empty hours get coarse enough to notice while
 * the mark itself stops improving much.
 */
const WELL_MINUTES = 20;
const WELL_STRENGTH = 2;
/** Samples across the day the cumulative is built on. 1024 ⇒ ≈84 s per cell, and the map
 *  is linear inside a cell, which is finer than the ≈5.8 min a pixel is worth. */
const SAMPLES = 1024;

export interface TimelineWarp {
  /** Time fraction of the viewed day (0..1) → position along the track (0..1). */
  toTrack(f: number): number;
  /** Position along the track (0..1) → time fraction of the viewed day (0..1). */
  toTime(x: number): number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The axis a day with no marks gets: the plain linear one. */
const IDENTITY: TimelineWarp = { toTrack: clamp01, toTime: clamp01 };

/**
 * Build the warped axis for one viewed day.
 *
 * @param marks Prayer positions as fractions of the viewed day; anything outside 0..1 or
 *   non-finite is ignored, so a polar day that loses a prayer simply loses its well.
 * @param dayLength Real length of the viewed day in ms (23/24/25 h across DST) — the wells
 *   are specified in minutes, and a fixed 24 h would size them wrong on a transition day.
 */
export function makeTimelineWarp(
  marks: readonly number[],
  dayLength: number,
  opts: { wellMinutes?: number; strength?: number; samples?: number } = {},
): TimelineWarp {
  const wellMinutes = opts.wellMinutes ?? WELL_MINUTES;
  const strength = opts.strength ?? WELL_STRENGTH;
  const n = opts.samples ?? SAMPLES;

  const ms = marks.filter((m) => Number.isFinite(m) && m >= 0 && m <= 1);
  const half = (wellMinutes * 60_000) / dayLength;
  if (ms.length === 0 || !Number.isFinite(half) || half <= 0 || strength <= 0) return IDENTITY;

  // cum[i] is the track position of the instant i/n, normalised to end at exactly 1.
  // Built in two passes over the same trapezoid sum — the first to learn the total, the
  // second to write the normalised values — so the array is never read back by index while
  // it is being built. 2 × 1024 density evaluations of ≤ 6 marks each, once per viewed day.
  const density = (f: number) => densityAt(f, ms, half, strength);
  let total = 0;
  let prev = density(0);
  for (let i = 1; i <= n; i++) {
    const d = density(i / n);
    total += (prev + d) / 2;
    prev = d;
  }

  const cum: number[] = [0];
  let acc = 0;
  prev = density(0);
  for (let i = 1; i <= n; i++) {
    const d = density(i / n);
    acc += (prev + d) / 2;
    prev = d;
    // The last cell is pinned rather than divided: 24:00 must land on the right rail
    // exactly, or the day's last minutes become unreachable by a rounding error.
    cum.push(i === n ? 1 : acc / total);
  }

  return {
    toTrack(f) {
      const t = clamp01(f) * n;
      const i = Math.min(n - 1, Math.floor(t));
      const lo = cum[i];
      const hi = cum[i + 1];
      // In bounds by the clamp and the Math.min above. Guarded rather than asserted for
      // the reason contour.ts guards its lattice reads: an undefined here would not throw,
      // it would place the thumb at NaN — a `left` React Native accepts and then paints
      // nowhere. Degrading to the linear axis keeps the scrubber usable instead.
      if (lo === undefined || hi === undefined) return clamp01(f);
      return lo + (hi - lo) * (t - i);
    },
    toTime(x) {
      const v = clamp01(x);
      // Largest cell whose start is at or below v. The cumulative is strictly increasing
      // (density ≥ 1), so the cell has non-zero width and the division below is safe.
      let lo = 0;
      let hi = n;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const c = cum[mid];
        if (c === undefined) return v;
        if (c <= v) lo = mid;
        else hi = mid;
      }
      const a = cum[lo];
      const b = cum[lo + 1];
      if (a === undefined || b === undefined || b <= a) return v;
      return clamp01((lo + (v - a) / (b - a)) / n);
    },
  };
}

/**
 * Pixels-per-minute multiplier at one point of the day, 1 being the flat axis. Only the
 * shape of the wells; the caller-facing map normalises it.
 *
 * Overlapping wells are CLAMPED rather than summed. In a Swedish summer Maghrib and ʿIshāʾ
 * close to within minutes of each other, and two stacked wells would put a 5× spike on one
 * spot — which reads as the thumb sticking, and steals the resolution from everywhere else
 * through the normalisation.
 */
function densityAt(f: number, marks: readonly number[], half: number, strength: number): number {
  let s = 0;
  for (const m of marks) {
    const u = Math.abs(f - m) / half;
    // Raised cosine: 1 at the mark, 0 with zero slope at the well's edge, so the axis has
    // no gear-change where a well begins.
    if (u < 1) s += strength * ((1 + Math.cos(Math.PI * u)) / 2);
  }
  return 1 + Math.min(s, strength);
}
