// Property-based tests for the qibla geometry — the bearing to Mecca and the great-circle
// arc drawn on the map. The instrument maths they used to sit beside (wrap, turn, proximity,
// the band machine) moved out with lib/aim; see aim.props.test.ts.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { haversineKm } from './places/nearest';
import { greatCirclePoints, KAABA, qiblaBearing, qiblaDistanceKm } from './qibla';
import { at } from '@/test-utils/at';

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

const swedishLat = fc.double({ min: 55.3, max: 69.1, noNaN: true });
const swedishLon = fc.double({ min: 11.1, max: 24.2, noNaN: true });

describe('greatCirclePoints — arc invariants for Swedish origins', () => {
  // THE assumption the whole component rests on. `mercX` does NOT wrap, so a path whose
  // longitudes crossed ±180° would be drawn as a line straight back across the entire
  // world map. Sweden (≈11–24°E) and Mecca (39.8°E) keep every sample inside one narrow
  // band of eastern longitudes — but that is a property of these inputs, not of the
  // function, so it is pinned here rather than assumed in a comment.
  it('never leaves the longitude band spanned by its endpoints', () => {
    fc.assert(
      fc.property(swedishLat, swedishLon, (latitude, longitude) => {
        const lo = Math.min(longitude, KAABA.longitude);
        const hi = Math.max(longitude, KAABA.longitude);
        for (const [lon] of greatCirclePoints({ latitude, longitude }, KAABA, 48)) {
          expect(lon).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(lon).toBeLessThanOrEqual(hi + 1e-9);
        }
      }),
    );
  });

  // Every sample is a real coordinate: a NaN anywhere would poison the Float64Array the
  // arc component projects from, and Skia would silently draw nothing (or garbage).
  it('produces only finite, in-range coordinates', () => {
    fc.assert(
      fc.property(swedishLat, swedishLon, (latitude, longitude) => {
        for (const [lon, lat] of greatCirclePoints({ latitude, longitude }, KAABA, 48)) {
          expect(Number.isFinite(lon)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
          expect(Math.abs(lat)).toBeLessThanOrEqual(90);
          expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        }
      }),
    );
  });

  // The path only ever approaches Mecca. A monotone run-down is what makes it read as a
  // ray with a destination rather than a curve that doubles back — and it is the cheapest
  // check that the interpolation parameter is used in the right direction.
  it('closes on the Kaaba monotonically', () => {
    fc.assert(
      fc.property(swedishLat, swedishLon, (latitude, longitude) => {
        const pts = greatCirclePoints({ latitude, longitude }, KAABA, 32);
        let previous = Number.POSITIVE_INFINITY;
        for (const [lon, lat] of pts) {
          const d = haversineKm(lat, lon, KAABA.latitude, KAABA.longitude);
          expect(d).toBeLessThanOrEqual(previous + 1e-6);
          previous = d;
        }
        expect(previous).toBeLessThan(1);
      }),
    );
  });

  // Even spacing in ANGLE is why 96 samples suffice at every zoom: if the steps bunched
  // up at one end, the sparse end would visibly polygonise when zoomed in.
  it('spaces its samples evenly along the arc', () => {
    fc.assert(
      fc.property(swedishLat, swedishLon, (latitude, longitude) => {
        const pts = greatCirclePoints({ latitude, longitude }, KAABA, 33);
        const steps: number[] = [];
        for (let i = 1; i < pts.length; i++) {
          const prev = at(pts, i - 1, 'arc points');
          const cur = at(pts, i, 'arc points');
          steps.push(haversineKm(prev[1], prev[0], cur[1], cur[0]));
        }
        const min = Math.min(...steps);
        const max = Math.max(...steps);
        // Equal in ANGLE means equal in great-circle distance too, to within the tiny
        // chord-vs-arc difference at 1/32 of the way. A lon/lat lerp would fail this.
        expect(max - min).toBeLessThan(0.05 * max);
      }),
    );
  });
});
