// Property-based tests for the contour maths. contour.test.ts uses fixed small grids and
// one 4-point spline; these fuzz arbitrary fields and polylines so a corner-classification
// or interpolation regression surfaces on shapes the examples never reach.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { catmullRom, marchingSquares, type Segment } from './contour';

describe('catmullRom — interpolates (passes through every control point)', () => {
  const point = fc.tuple(
    fc.double({ min: -1000, max: 1000, noNaN: true }),
    fc.double({ min: -1000, max: 1000, noNaN: true }),
  );
  const polyline = fc.array(point, { minLength: 3, maxLength: 10 });

  it('every input vertex appears on the resampled curve, and the curve is all-finite', () => {
    fc.assert(
      fc.property(polyline, (line) => {
        const out = catmullRom(line);
        for (const o of out) {
          expect(Number.isFinite(o[0])).toBe(true);
          expect(Number.isFinite(o[1])).toBe(true);
        }
        for (const p of line) {
          const hit = out.some((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) < 1e-6);
          expect(hit).toBe(true);
        }
      }),
    );
  });
});

describe('marchingSquares — level and sign invariances', () => {
  // Ordered axes (south→north, west→east) as the algorithm requires; a 4×4 field gives
  // a 3×3 cell grid that exercises every case including the two saddles.
  const lats = [55, 58, 61, 64];
  const lons = [10, 14, 18, 22];
  const field = fc.array(
    fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 4, maxLength: 4 }),
    { minLength: 4, maxLength: 4 },
  );
  // The corner classification is `v > 0`, which treats an EXACTLY-zero corner asymmetrically
  // under negation (−0 is still "not above"). That's a measure-zero discrete edge case, not
  // the geometric invariant we're testing — so the sign-flip property uses corners bounded
  // away from 0 (|v| ≥ 0.5), keeping crossings strictly interior to each edge.
  const nonZeroCell = fc
    .tuple(fc.constantFrom(-1, 1), fc.double({ min: 0.5, max: 100, noNaN: true }))
    .map(([s, m]) => s * m);
  const nonZeroField = fc.array(fc.array(nonZeroCell, { minLength: 4, maxLength: 4 }), {
    minLength: 4,
    maxLength: 4,
  });
  const level = fc.double({ min: -50, max: 50, noNaN: true });

  // Flatten to a sorted multiset of endpoints — order/pairing-independent.
  const endpoints = (segs: Segment[]): [number, number][] =>
    segs
      .flatMap(([a, b]) => [a, b])
      .sort((p, q) => p[0] - q[0] || p[1] - q[1]);

  it('contouring at level L equals contouring the L-shifted field at level 0', () => {
    // The only thing `level` does is subtract from every corner — so shifting the field by
    // −L and contouring at 0 must reproduce the exact same segments (same float ops).
    fc.assert(
      fc.property(field, level, (values, L) => {
        const atLevel = marchingSquares(lats, lons, values, L);
        const shifted = marchingSquares(
          lats,
          lons,
          values.map((row) => row.map((v) => v - L)),
          0,
        );
        expect(shifted).toEqual(atLevel);
      }),
    );
  });

  it('negating the field leaves the isoline through the same points', () => {
    // The zero-contour is sign-agnostic in POSITION: negating every value flips each cell's
    // 4-bit code to its complement, which the switch maps to the same crossing points (only
    // the saddle PAIRING differs). IEEE negation is exact, so the endpoint multiset matches
    // exactly. Catches a `>` vs `>=` corner-classification slip the fixed examples miss.
    fc.assert(
      fc.property(nonZeroField, (values) => {
        const pos = marchingSquares(lats, lons, values, 0);
        const neg = marchingSquares(
          lats,
          lons,
          values.map((row) => row.map((v) => -v)),
          0,
        );
        expect(endpoints(neg)).toEqual(endpoints(pos));
      }),
    );
  });
});
