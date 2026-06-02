// Property-based tests for the great-circle distance and place snapping. nearest.test.ts
// checks a few fixed distances; these fuzz the whole globe so a haversine regression
// (a dropped cos term, a missing asin clamp at the antipode) shows up anywhere.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { PLACES } from './data';
import { haversineKm, nearestPlace } from './nearest';

const lat = fc.double({ min: -90, max: 90, noNaN: true });
const lon = fc.double({ min: -180, max: 180, noNaN: true });

describe('haversineKm — metric invariants', () => {
  it('is symmetric: d(A,B) === d(B,A)', () => {
    fc.assert(
      fc.property(lat, lon, lat, lon, (aLat, aLon, bLat, bLon) => {
        const ab = haversineKm(aLat, aLon, bLat, bLon);
        const ba = haversineKm(bLat, bLon, aLat, aLon);
        expect(ab).toBeCloseTo(ba, 6);
      }),
    );
  });

  it('is zero between a point and itself', () => {
    fc.assert(
      fc.property(lat, lon, (p, q) => {
        expect(haversineKm(p, q, p, q)).toBeCloseTo(0, 9);
      }),
    );
  });

  it('never exceeds the antipodal distance (half the circumference)', () => {
    // The clamp `Math.asin(Math.min(1, …))` is what keeps the antipode (h ≈ 1, where
    // floating error can push the root just over 1) from producing NaN or an overshoot.
    const EARTH_KM = 6371.0088;
    const MAX = Math.PI * EARTH_KM; // ≈ 20015.09 km
    fc.assert(
      fc.property(lat, lon, lat, lon, (aLat, aLon, bLat, bLon) => {
        const d = haversineKm(aLat, aLon, bLat, bLon);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(MAX + 1e-6);
      }),
    );
  });

  it('satisfies the triangle inequality (within float tolerance)', () => {
    // d(A,C) ≤ d(A,B) + d(B,C). A real metric must obey this; a sign error in one term
    // would let some triple violate it.
    fc.assert(
      fc.property(lat, lon, lat, lon, lat, lon, (aLat, aLon, bLat, bLon, cLat, cLon) => {
        const ac = haversineKm(aLat, aLon, cLat, cLon);
        const ab = haversineKm(aLat, aLon, bLat, bLon);
        const bc = haversineKm(bLat, bLon, cLat, cLon);
        expect(ac).toBeLessThanOrEqual(ab + bc + 1e-6);
      }),
    );
  });
});

describe('nearestPlace — snapping is idempotent', () => {
  it("a place's own coordinates snap back to that exact place at distance 0", () => {
    // No two places share coordinates (see nearest.test.ts), so the nearest place to a
    // place's exact location is itself — the GPS-snap and picker paths both depend on this.
    fc.assert(
      fc.property(fc.nat({ max: PLACES.length - 1 }), (i) => {
        const p = PLACES[i];
        const match = nearestPlace(p.lat, p.lon);
        expect(match.place.lat).toBe(p.lat);
        expect(match.place.lon).toBe(p.lon);
        expect(match.distanceKm).toBe(0);
      }),
    );
  });
});
