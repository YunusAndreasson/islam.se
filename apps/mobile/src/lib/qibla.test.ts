import { describe, expect, it } from '@jest/globals';

import {
  angleDelta,
  deriveQiblaStatus,
  formatKm,
  greatCirclePoints,
  headingReliable,
  KAABA,
  QIBLA_ALIGN_RELEASE,
  QIBLA_ALIGN_TOL,
  qiblaAligned,
  qiblaBearing,
  qiblaDistanceKm,
} from './qibla';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };

/** Initial compass bearing from p to q — the independent oracle the arc is checked
 *  against. Deliberately NOT reusing anything from qibla.ts: this is the textbook
 *  forward-azimuth formula, so if greatCirclePoints and qiblaBearing ever disagree,
 *  the test is a third opinion rather than an echo of one of them. */
function initialBearing(p: [number, number], q: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lon1, lat1] = [toRad(p[0]), toRad(p[1])];
  const [lon2, lat2] = [toRad(q[0]), toRad(q[1])];
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

describe('qiblaBearing', () => {
  it('points south-east from Sweden (toward Mecca)', () => {
    // Stockholm → ~148° (SE). A Swedish user faces roughly south-east for the qibla;
    // anything pointing north would be a sign the bearing math is inverted.
    const b = qiblaBearing({ latitude: 59.3293, longitude: 18.0686 });
    expect(b).toBeGreaterThan(120);
    expect(b).toBeLessThan(165);
  });
});

describe('qiblaDistanceKm', () => {
  it('is ~0 at the Kaaba itself', () => {
    expect(qiblaDistanceKm(KAABA)).toBeLessThan(1);
  });

  it('matches the known Stockholm→Mecca great-circle distance', () => {
    const d = qiblaDistanceKm({ latitude: 59.3293, longitude: 18.0686 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4800);
  });
});

describe('angleDelta', () => {
  it('is wrap-aware across 0/360', () => {
    expect(angleDelta(359, 1)).toBe(2);
    expect(angleDelta(10, 350)).toBe(20);
  });

  it('is 0 when equal and 180 when opposite', () => {
    expect(angleDelta(90, 90)).toBe(0);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('headingReliable', () => {
  // The compass needle was "wrong at first, then right": the first readings arrive
  // mid-calibration (accuracy 0–1, up to >50° off on iOS) before the magnetometer
  // settles. Gating the qibla lock on accuracy ≥ 2 is what stops the app pointing at —
  // and buzzing "you're facing Mecca" on — a confidently-wrong heading during warm-up.
  it('rejects no-reading and low-calibration levels', () => {
    expect(headingReliable(null)).toBe(false);
    expect(headingReliable(undefined)).toBe(false);
    expect(headingReliable(0)).toBe(false); // none (>50° uncertainty on iOS)
    expect(headingReliable(1)).toBe(false); // low — still too coarse for a 4° lock
  });

  it('accepts medium and high calibration', () => {
    expect(headingReliable(2)).toBe(true);
    expect(headingReliable(3)).toBe(true); // high (<20° uncertainty on iOS)
  });
});

describe('qiblaAligned', () => {
  it('acquires a lock only within the tight tolerance', () => {
    expect(qiblaAligned(0, false)).toBe(true);
    expect(qiblaAligned(QIBLA_ALIGN_TOL, false)).toBe(true); // exactly at the edge → lock
    expect(qiblaAligned(QIBLA_ALIGN_TOL + 0.1, false)).toBe(false);
  });

  it('holds a lock through the wider release band (hysteresis)', () => {
    // The whole point: a heading sitting at 5° off is NOT close enough to acquire a fresh
    // lock, but IS close enough to keep an existing one. That gap is what stops jitter on
    // the 4° edge from strobing the brass lock and re-buzzing the haptic frame after frame.
    expect(qiblaAligned(5, false)).toBe(false); // can't acquire here…
    expect(qiblaAligned(5, true)).toBe(true); // …but holds if already locked
    expect(qiblaAligned(QIBLA_ALIGN_RELEASE, true)).toBe(true); // holds to the release edge
    expect(qiblaAligned(QIBLA_ALIGN_RELEASE + 0.1, true)).toBe(false); // past it → release
  });

  it('keeps acquire tighter than release so the band is real', () => {
    expect(QIBLA_ALIGN_TOL).toBeLessThan(QIBLA_ALIGN_RELEASE);
  });
});

describe('deriveQiblaStatus', () => {
  const BEARING = 148; // a Stockholm-ish qibla, due south-east

  it('does NOT lock onto an uncalibrated reading pointing dead at the qibla', () => {
    // THE documented "wrong at first, then right" bug: during magnetometer warm-up the heading
    // can read tens of degrees off while the OS still reports low calibration. Even when such a
    // reading happens to point EXACTLY at the bearing, accuracy below MEDIUM must surface as
    // `calibrating` — never `aligned` — or the app buzzes "du är vänd mot Mecka" at the wrong
    // orientation. This is the single most important correctness property of the screen.
    expect(deriveQiblaStatus(BEARING, 0, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
    expect(deriveQiblaStatus(BEARING, 1, BEARING, false)).toEqual({ aligned: false, near: false, calibrating: true });
  });

  it('locks the instant the reading is both trusted and aimed', () => {
    expect(deriveQiblaStatus(BEARING, 2, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
    expect(deriveQiblaStatus(BEARING, 3, BEARING, false)).toEqual({ aligned: true, near: false, calibrating: false });
  });

  it('reports "on your way" in the approach band, not a lock', () => {
    expect(deriveQiblaStatus(BEARING + 20, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
  });

  it('carries the lock hysteresis through `wasAligned`', () => {
    // 6° off: not close enough to ACQUIRE a fresh lock (so it reads "near"), but close enough
    // to HOLD one already established — the gap that stops 4°-edge jitter from strobing it.
    expect(deriveQiblaStatus(BEARING + 6, 3, BEARING, false)).toEqual({ aligned: false, near: true, calibrating: false });
    expect(deriveQiblaStatus(BEARING + 6, 3, BEARING, true)).toEqual({ aligned: true, near: false, calibrating: false });
  });
});

// The arc the map draws from the user's dot toward Mecca. The whole point of sampling a
// great circle rather than drawing a straight line is that a straight line on a Mercator
// map is a RHUMB line (constant bearing), which from Sweden runs several degrees off the
// true qibla — a wrong direction rendered confidently, which is the worst failure this
// feature can have.
describe('greatCirclePoints', () => {
  it('returns exactly the requested number of samples', () => {
    expect(greatCirclePoints(STOCKHOLM, KAABA, 2)).toHaveLength(2);
    expect(greatCirclePoints(STOCKHOLM, KAABA, 96)).toHaveLength(96);
  });

  // Verbatim, not round-tripped through the vector maths — the arc has to start exactly
  // on the brass dot, and a sub-pixel gap at the head is visible at city zoom.
  it('starts and ends exactly on the given coordinates', () => {
    const pts = greatCirclePoints(STOCKHOLM, KAABA, 40);
    expect(pts[0]).toEqual([STOCKHOLM.longitude, STOCKHOLM.latitude]);
    expect(pts[39]).toEqual([KAABA.longitude, KAABA.latitude]);
  });

  // THE assertion that proves the arc actually points at Mecca rather than merely ending
  // there: its departure heading must be the bearing the compass sheet shows. If someone
  // replaced the slerp with a linear lon/lat interpolation this fails — that path also
  // ends at the Kaaba, but leaves Stockholm ~10° off the qibla.
  it('leaves the origin on the qibla bearing the compass reports', () => {
    const pts = greatCirclePoints(STOCKHOLM, KAABA, 96);
    expect(initialBearing(pts[0], pts[1])).toBeCloseTo(qiblaBearing(STOCKHOLM), 1);
  });

  // A great circle has ONE plane, so the forward azimuth measured toward the Kaaba from
  // any point on the path equals that point's own qibla bearing. Checking it along the
  // whole arc catches a path that starts right and then wanders.
  it('stays on the qibla bearing from every point along the way', () => {
    const pts = greatCirclePoints(STOCKHOLM, KAABA, 32);
    for (const [lon, lat] of pts.slice(0, -1)) {
      const expected = qiblaBearing({ latitude: lat, longitude: lon });
      expect(angleDelta(initialBearing([lon, lat], [KAABA.longitude, KAABA.latitude]), expected))
        .toBeLessThan(0.5);
    }
  });

  // The great circle bows POLEWARD of a naive lon/lat interpolation — that curve is the
  // whole feature, and pinning it stops a "simplification" to linear interpolation from
  // slipping past the endpoint tests above (a lerp hits both ends exactly too).
  it('bows north of a straight lon/lat interpolation', () => {
    const lerpLat = (STOCKHOLM.latitude + KAABA.latitude) / 2;
    const [, arcLat] = greatCirclePoints(STOCKHOLM, KAABA, 3)[1];
    // ~0.5° ≈ 50 km off the lerp from Stockholm: small in degrees, plainly visible as a
    // curve across the map, and far above any floating-point noise.
    expect(arcLat - lerpLat).toBeGreaterThan(0.3);

    // And it bows to ONE side for the whole length — never crossing back south of the
    // lerp, which is what would make the drawn curve wobble rather than arc.
    const pts = greatCirclePoints(STOCKHOLM, KAABA, 21);
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1);
      const lerp = STOCKHOLM.latitude + (KAABA.latitude - STOCKHOLM.latitude) * t;
      expect(pts[i][1]).toBeGreaterThanOrEqual(lerp - 1e-9);
    }
  });

  // Degenerate inputs must yield a usable degenerate path, not a row of NaNs that Skia
  // would turn into an invisible-or-garbage stroke.
  it('collapses to the origin when both ends coincide', () => {
    const pts = greatCirclePoints(KAABA, KAABA, 5);
    for (const [lon, lat] of pts) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
    expect(pts[2]).toEqual([KAABA.longitude, KAABA.latitude]);
  });

  it('refuses invalid coordinates and degenerate sample counts', () => {
    expect(() => greatCirclePoints({ latitude: Number.NaN, longitude: 18 }, KAABA, 8)).toThrow(
      RangeError,
    );
    expect(() => greatCirclePoints(STOCKHOLM, { latitude: 0, longitude: 999 }, 8)).toThrow(
      RangeError,
    );
    // A single point is not a path; a fractional count would make t = i/(n−1) meaningless.
    expect(() => greatCirclePoints(STOCKHOLM, KAABA, 1)).toThrow(RangeError);
    expect(() => greatCirclePoints(STOCKHOLM, KAABA, 12.5)).toThrow(RangeError);
  });
});

describe('formatKm', () => {
  it('rounds and groups thousands in Swedish style', () => {
    // sv-SE groups with a (thin/no-break) space, not a comma.
    expect(formatKm(412.4)).toMatch(/^412 km$/);
    expect(formatKm(4102).replace(/\s/g, ' ')).toMatch(/^4 ?102 km$/);
  });
});
