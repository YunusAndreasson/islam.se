// Property-based tests for the qibla geometry. qibla.test.ts pins a handful of fixed
// bearings/angles; these fuzz the whole input space so a modular-arithmetic regression
// (the +540/−180 wrap, a stray sign) can't survive between the chosen examples.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { haversineKm } from './places/nearest';
import {
  angleDelta,
  deriveQiblaStatus,
  HEADING_ACCURACY_MIN,
  headingReliable,
  KAABA,
  normalizeHeading,
  QIBLA_PROX_RANGE,
  qiblaBearing,
  qiblaDistanceKm,
  qiblaProximity,
  shortestTurn,
} from './qibla';

// Compass bearings live in [0, 360). noNaN keeps the generator on real angles.
const bearing = fc.double({ min: 0, max: 360, noNaN: true, maxExcluded: true });

describe('angleDelta — modular wrap invariants', () => {
  it('is symmetric: angleDelta(a,b) === angleDelta(b,a)', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        expect(angleDelta(a, b)).toBeCloseTo(angleDelta(b, a), 9);
      }),
    );
  });

  it('always lands in [0, 180]', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const d = angleDelta(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(180 + 1e-9);
      }),
    );
  });

  it('is zero for identical bearings', () => {
    fc.assert(
      fc.property(bearing, (a) => {
        expect(angleDelta(a, a)).toBe(0);
      }),
    );
  });

  it('matches the independent minimal circular-distance formula', () => {
    // An oracle written a completely different way: the shortest arc between two bearings
    // is min(|a−b|, 360−|a−b|). angleDelta's +540/−180 wrap must agree with it for every
    // pair in the real [0,360) domain — this is what actually pins the modular arithmetic
    // (the symmetry/range/identity checks alone would pass several wrong formulas).
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const raw = Math.abs(a - b);
        const expected = Math.min(raw, 360 - raw);
        expect(angleDelta(a, b)).toBeCloseTo(expected, 9);
      }),
    );
  });
});

describe('qibla bearing & distance — global bounds', () => {
  const coord = fc.record({
    latitude: fc.double({ min: -89.9, max: 89.9, noNaN: true }),
    longitude: fc.double({ min: -180, max: 180, noNaN: true }),
  });

  it('bearing is always a valid compass angle [0, 360)', () => {
    fc.assert(
      fc.property(coord, (c) => {
        const b = qiblaBearing(c);
        expect(Number.isFinite(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(360);
      }),
    );
  });

  it('distance to the Kaaba is finite and never exceeds half the Earth circumference', () => {
    // The antipode of any point is ~20015 km away; nothing on a sphere is farther. A
    // missing asin clamp (asin of >1) would NaN or overshoot this bound.
    const HALF_CIRCUMFERENCE_KM = Math.PI * 6371;
    fc.assert(
      fc.property(coord, (c) => {
        const d = qiblaDistanceKm(c);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(HALF_CIRCUMFERENCE_KM + 1);
      }),
    );
  });

  it('distance from the Kaaba to itself is zero', () => {
    expect(qiblaDistanceKm(KAABA)).toBeCloseTo(0, 6);
  });

  it('agrees with the independent haversine implementation in places/nearest', () => {
    // qiblaDistanceKm and haversineKm are two separately-written great-circle formulas (only
    // the Earth radius differs: 6371 vs 6371.0088, a 0.0014% gap). They must agree to within
    // that — a mutation in either haversine (a swapped operator, a sign flip in 1−a) moves the
    // result by far more than the tolerance. A genuine cross-implementation oracle.
    fc.assert(
      fc.property(coord, (c) => {
        const qd = qiblaDistanceKm(c);
        const hv = haversineKm(c.latitude, c.longitude, KAABA.latitude, KAABA.longitude);
        expect(Math.abs(qd - hv)).toBeLessThan(hv * 0.002 + 0.5);
      }),
    );
  });
});

describe('normalizeHeading — into [0, 360)', () => {
  it('wraps negatives and ≥360 into range (concrete)', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(370)).toBeCloseTo(10, 9);
    expect(normalizeHeading(-10)).toBeCloseTo(350, 9);
    expect(normalizeHeading(720)).toBe(0);
  });

  it('always returns a value in [0, 360) for any real input', () => {
    fc.assert(
      fc.property(fc.double({ min: -10000, max: 10000, noNaN: true }), (x) => {
        const n = normalizeHeading(x);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(360);
      }),
    );
  });
});

describe('shortestTurn — the dial-unwrap step', () => {
  // These two properties together UNIQUELY define the shortest signed turn — the only value in
  // (−180,180] congruent to (to−from) mod 360. A wrong wrap constant (the +540, the −180) or a
  // sign flip breaks one of them, and that exact bug is what would make the needle whip the
  // LONG way around the 0/360 seam — a regression no geometry test in qibla.test.ts would catch
  // (they only check the magnitude, never the sign or the winding).
  it('lands exactly on the target heading (≡ to, mod 360)', () => {
    fc.assert(
      fc.property(bearing, bearing, (from, to) => {
        // Wrap-aware: the landed heading must sit at zero circular distance from `to` (a plain
        // numeric compare would spuriously fail at the seam, where 359.999 ≡ 0.001).
        expect(angleDelta(from + shortestTurn(from, to), to)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('never turns more than 180° — always the short way', () => {
    fc.assert(
      fc.property(bearing, bearing, (from, to) => {
        expect(Math.abs(shortestTurn(from, to))).toBeLessThanOrEqual(180 + 1e-9);
      }),
    );
  });

  it('its magnitude equals the independent min-arc oracle (and angleDelta)', () => {
    fc.assert(
      fc.property(bearing, bearing, (a, b) => {
        const raw = Math.abs(a - b);
        const minArc = Math.min(raw, 360 - raw);
        expect(Math.abs(shortestTurn(a, b))).toBeCloseTo(minArc, 9);
        expect(Math.abs(shortestTurn(a, b))).toBeCloseTo(angleDelta(a, b), 9);
      }),
    );
  });

  it('eases the SHORT way across the 0/360 seam (concrete signs)', () => {
    expect(shortestTurn(359, 1)).toBeCloseTo(2, 9); // +2°, not −358°
    expect(shortestTurn(1, 359)).toBeCloseTo(-2, 9); // −2°, not +358°
    expect(shortestTurn(10, 350)).toBeCloseTo(-20, 9);
    expect(shortestTurn(350, 10)).toBeCloseTo(20, 9);
  });

  it('accumulates into a continuous winding (the unwrap the rose feeds its rotation)', () => {
    // Stepping a quarter-turn at a time all the way around must total a full +360 (and −360 the
    // other way): the running sum the screen feeds the dial rotation never snaps back at the
    // seam. A single long-way step anywhere would blow this far past ±360.
    const round = (path: number[]) => path.slice(1).reduce((sum, h, i) => sum + shortestTurn(path[i], h), 0);
    expect(round([0, 90, 180, 270, 0])).toBeCloseTo(360, 9);
    expect(round([0, 270, 180, 90, 0])).toBeCloseTo(-360, 9);
  });
});

describe('qiblaProximity — the "getting warmer" ramp', () => {
  const accuracy = fc.option(fc.integer({ min: 0, max: 3 }), { nil: null });

  it('always lands in [0, 1]', () => {
    fc.assert(
      fc.property(bearing, bearing, accuracy, (h, b, a) => {
        const p = qiblaProximity(h, a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is pinned to 0 for any untrusted reading — even one pointing dead-on', () => {
    // The safety property: a not-yet-calibrated compass must never warm the dial toward a
    // bearing it can't vouch for, no matter how aligned it happens to look during warm-up.
    fc.assert(
      fc.property(bearing, bearing, (h, b) => {
        expect(qiblaProximity(h, 0, b)).toBe(0);
        expect(qiblaProximity(h, 1, b)).toBe(0);
        expect(qiblaProximity(h, null, b)).toBe(0);
      }),
    );
    expect(qiblaProximity(100, 1, 100)).toBe(0); // dead-on but uncalibrated → still cold
  });

  it('peaks at the bearing and is cold past the range, when trusted', () => {
    expect(qiblaProximity(100, 3, 100)).toBeCloseTo(1, 9);
    expect(qiblaProximity(100 + QIBLA_PROX_RANGE, 3, 100)).toBeCloseTo(0, 9);
    expect(qiblaProximity(100 + QIBLA_PROX_RANGE + 10, 3, 100)).toBe(0); // clamped, never negative
  });

  it('never warms as you turn away — monotonic in angle when trusted', () => {
    const off = fc.double({ min: 0, max: 90, noNaN: true });
    fc.assert(
      fc.property(bearing, off, off, (b, d1, d2) => {
        const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
        expect(qiblaProximity(b + near, 3, b)).toBeGreaterThanOrEqual(qiblaProximity(b + far, 3, b) - 1e-9);
      }),
    );
  });
});

describe('deriveQiblaStatus — the band machine stays self-consistent', () => {
  const accuracy = fc.option(fc.integer({ min: 0, max: 3 }), { nil: null });

  it('keeps the three bands mutually consistent for every reading', () => {
    fc.assert(
      fc.property(bearing, bearing, accuracy, fc.boolean(), (heading, brg, acc, wasAligned) => {
        const s = deriveQiblaStatus(heading, acc, brg, wasAligned);
        const reliable = headingReliable(acc);
        expect(s.calibrating).toBe(!reliable); // calibrating iff the reading is untrusted
        expect(s.aligned && s.near).toBe(false); // never both at once
        if (s.aligned || s.near) expect(reliable).toBe(true); // a direction claim needs trust
        if (s.calibrating) {
          // an untrusted reading makes NO direction claim, even pointing dead-on
          expect(s.aligned).toBe(false);
          expect(s.near).toBe(false);
        }
      }),
    );
  });
});

describe('headingReliable — gates exactly at the calibration threshold', () => {
  it('is true at and above HEADING_ACCURACY_MIN, false below, and false for no reading', () => {
    // The lock/point decision turns on this boundary; an off-by-one (`>=` → `>`) would refuse
    // to ever confirm a just-calibrated compass, or lock onto a still-wobbly one.
    expect(headingReliable(HEADING_ACCURACY_MIN)).toBe(true); // exactly at threshold → trust
    expect(headingReliable(HEADING_ACCURACY_MIN + 1)).toBe(true);
    expect(headingReliable(HEADING_ACCURACY_MIN - 1)).toBe(false); // below → still calibrating
    expect(headingReliable(null)).toBe(false);
    expect(headingReliable(undefined)).toBe(false);
  });
});
