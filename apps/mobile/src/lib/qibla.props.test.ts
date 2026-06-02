// Property-based tests for the qibla geometry. qibla.test.ts pins a handful of fixed
// bearings/angles; these fuzz the whole input space so a modular-arithmetic regression
// (the +540/−180 wrap, a stray sign) can't survive between the chosen examples.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { haversineKm } from './places/nearest';
import { angleDelta, HEADING_ACCURACY_MIN, headingReliable, KAABA, qiblaBearing, qiblaDistanceKm } from './qibla';

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
