import { describe, expect, it } from '@jest/globals';
import { makeTimelineWarp } from './timeline-warp';

const DAY = 86_400_000;
/** A time of day as a fraction of a 24 h day. */
const at = (h: number, m = 0) => ((h * 60 + m) * 60_000) / DAY;
/** A Stockholm September day: Fajr, soluppgång, Ẓuhr, ʿAṣr, Maghrib, ʿIshāʾ. */
const MARKS = [at(4, 30), at(6, 30), at(12, 50), at(16, 20), at(19, 20), at(21, 20)];
/** The track on a 375 pt screen, in px — the geometry every claim below is measured on. */
const TRACK_PX = 247;
const FLAT_MIN_PER_PX = 1440 / TRACK_PX; // ≈5.83

/** Minutes of the day one pixel covers at time `f`. The number the reader actually feels. */
function minutesPerPixel(warp: { toTrack(f: number): number; toTime(x: number): number }, f: number) {
  const dx = 1 / TRACK_PX;
  const x = warp.toTrack(f);
  const lo = warp.toTime(Math.max(0, x - dx / 2));
  const hi = warp.toTime(Math.min(1, x + dx / 2));
  return (hi - lo) * 1440;
}

describe('makeTimelineWarp', () => {
  it('pins both ends of the day to the rails', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    // If these drift, the day's first or last minutes become unreachable by dragging — the
    // rail clamps before the axis does, and 23:5x is simply not selectable.
    expect(warp.toTrack(0)).toBe(0);
    expect(warp.toTrack(1)).toBe(1);
    expect(warp.toTime(0)).toBe(0);
    expect(warp.toTime(1)).toBe(1);
  });

  it('is strictly increasing, so every instant has exactly one place on the track', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const x = warp.toTrack(i / 2000);
      // A flat step would be a time the thumb cannot express; a fall would let the thumb run
      // backwards under a forward finger.
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });

  it('round-trips time → track → time to the second', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    let worst = 0;
    for (let i = 0; i <= 5000; i++) {
      const f = i / 5000;
      worst = Math.max(worst, Math.abs(warp.toTime(warp.toTrack(f)) - f));
    }
    // toTime is the exact inverse of toTrack (both piecewise-linear on the same cells), so
    // this is float noise, not resolution. A committed scrub goes time → track (the thumb)
    // and the next drag comes back the other way: any real error here would make a prayer
    // tapped in the list land minutes off the mark it drew.
    expect(worst * DAY).toBeLessThan(1);
  });

  it('gives a prayer more than twice the resolution of the flat axis', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    for (const m of MARKS) {
      expect(minutesPerPixel(warp, m)).toBeLessThan(FLAT_MIN_PER_PX / 2);
    }
  });

  it('keeps the fine resolution across the approach to a prayer, not only its instant', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    // ±10 min either side of ʿAṣr: the window a reader is actually aiming into when they
    // want "just before the shadow reaches them". A well that only sharpened the exact
    // instant would still be fiddly to steer into.
    for (const delta of [-10, -5, 5, 10]) {
      const asr = MARKS[3] as number;
      expect(minutesPerPixel(warp, asr + delta / 1440)).toBeLessThan(4);
    }
  });

  it('charges the empty hours for it, but not by much', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    for (const f of [at(2), at(10), at(23)]) {
      const coarse = minutesPerPixel(warp, f);
      expect(coarse).toBeGreaterThan(FLAT_MIN_PER_PX);
      // The whole day is a fixed number of pixels, so precision at the marks is borrowed
      // from between them. A quarter is the point where the dead hours start feeling
      // slippery in their own right — the failure this bound exists to catch is someone
      // raising the well strength without noticing what it costs everywhere else.
      expect(coarse).toBeLessThan(FLAT_MIN_PER_PX * 1.25);
    }
  });

  it('does not stack wells where two prayers nearly coincide', () => {
    // A Swedish June: Maghrib and ʿIshāʾ 20 minutes apart. Summed wells would put a 5×
    // spike on that pair — the thumb sticking there — and the normalisation would then
    // take the cost out of the rest of the day.
    const summer = [at(1, 30), at(3, 40), at(13), at(17, 50), at(22, 5), at(22, 25)];
    const warp = makeTimelineWarp(summer, DAY);
    const single = makeTimelineWarp([at(12)], DAY);
    const peak = Math.min(minutesPerPixel(warp, at(22, 5)), minutesPerPixel(warp, at(22, 25)));
    expect(peak).toBeGreaterThan(minutesPerPixel(single, at(12)) * 0.9);
  });

  it('sizes the wells in real minutes across a DST day', () => {
    // The 25 h day: the same 20-minute well is a SMALLER fraction of it. Sizing the well in
    // fractions instead would quietly widen it by an hour's worth on the two days a year
    // the marks are already hardest to line up.
    const long = 25 * 3_600_000;
    const markLong = (3 * 3600_000) / long;
    const warp = makeTimelineWarp([markLong], long);
    const minutesFromMark = (mins: number) => markLong + (mins * 60_000) / long;
    // 15 min out is inside the well and finer than the day's flat ground; 25 min out is
    // already past its edge and no finer than an hour out. Measured in MINUTES, which on a
    // fraction-sized well would both land inside it and both come back equal.
    expect(minutesPerPixel(warp, minutesFromMark(15))).toBeLessThan(
      minutesPerPixel(warp, minutesFromMark(25)),
    );
    expect(minutesPerPixel(warp, minutesFromMark(25))).toBeCloseTo(
      minutesPerPixel(warp, minutesFromMark(60)),
      6,
    );
  });

  it('falls back to the linear axis when a day has no marks', () => {
    // A polar day where adhan resolves nothing: the scrubber must still work, plainly.
    const warp = makeTimelineWarp([], DAY);
    expect(warp.toTrack(0.37)).toBeCloseTo(0.37, 10);
    expect(warp.toTime(0.37)).toBeCloseTo(0.37, 10);
  });

  it('ignores marks that fall outside the viewed day', () => {
    const warp = makeTimelineWarp([Number.NaN, -0.2, 1.4], DAY);
    expect(warp.toTrack(0.42)).toBeCloseTo(0.42, 10);
  });

  it('clamps both directions to the day', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    // The pan's hitSlop reaches past both rails on purpose, so out-of-range input is the
    // normal case rather than an error: it has to land on 00:00 / 24:00, not off the axis.
    expect(warp.toTime(-0.5)).toBe(0);
    expect(warp.toTime(1.5)).toBe(1);
    expect(warp.toTrack(-0.5)).toBe(0);
    expect(warp.toTrack(1.5)).toBe(1);
  });

  it('keeps the prayers in order and inside the track', () => {
    const warp = makeTimelineWarp(MARKS, DAY);
    const positions = MARKS.map((m) => warp.toTrack(m));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const p of positions) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('moves the hour ruler by only a few pixels', () => {
    // The ruler is warped WITH the axis — it has to be, or "12" would stop marking noon.
    // What this pins is that the unevenness stays small enough to read as a ruler: the
    // labels may breathe, they may not visibly lie.
    const warp = makeTimelineWarp(MARKS, DAY);
    for (const hour of [6, 12, 18]) {
      const shift = Math.abs(warp.toTrack(hour / 24) - hour / 24) * TRACK_PX;
      expect(shift).toBeLessThan(8);
    }
  });
});
