import { describe, expect, it } from '@jest/globals';

import { chaikin, chainSegments, marchingSquares, representativePoint } from './contour';

// The contour engine is the geometry behind every sweeping prayer line. These
// guard the invariants a wrong line would silently violate: a crossing appears
// only where the field actually changes sign, and a NaN corner (an unresolvable
// polar prayer time) removes that cell from the line instead of poisoning it.
describe('marchingSquares', () => {
  // A 3x3 grid (lats south→north as index grows) with the sign flip between the
  // middle and top rows → a roughly horizontal contour must appear there.
  const lats = [55, 60, 65];
  const lons = [10, 15, 20];

  it('returns no segments when the field never crosses the level', () => {
    const allPositive = [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ];
    expect(marchingSquares(lats, lons, allPositive, 0)).toHaveLength(0);
  });

  it('traces a contour where the field changes sign', () => {
    // Negative in the north (top rows), positive in the south → the zero contour
    // runs east–west and every crossing latitude lies between the flipping rows.
    const field = [
      [1, 1, 1], // south: positive
      [-1, -1, -1], // crossing happens between row 0 and row 1
      [-1, -1, -1], // north: negative
    ];
    const segs = marchingSquares(lats, lons, field, 0);
    expect(segs.length).toBeGreaterThan(0);
    for (const [a, b] of segs) {
      for (const [lon, lat] of [a, b]) {
        expect(lon).toBeGreaterThanOrEqual(10);
        expect(lon).toBeLessThanOrEqual(20);
        expect(lat).toBeGreaterThan(55); // crossing sits north of the southern row
        expect(lat).toBeLessThanOrEqual(60);
      }
    }
  });

  it('interpolates the crossing position linearly along an edge', () => {
    // One cell, sign flip on the left and right edges at the exact midpoint.
    const field = [
      [-1, -1],
      [1, 1],
    ];
    const segs = marchingSquares([0, 10], [0, 10], field, 0);
    expect(segs).toHaveLength(1);
    // Both endpoints land at latitude 5 (halfway between 0 and 10).
    for (const [, lat] of segs[0]) {
      expect(lat).toBeCloseTo(5, 6);
    }
  });

  it('skips cells touching a NaN corner (unresolvable polar times)', () => {
    const field = [
      [-1, Number.NaN],
      [1, 1],
    ];
    // The only cell has a NaN corner → no contour, no crash, no NaN coordinates.
    expect(marchingSquares([0, 10], [0, 10], field, 0)).toHaveLength(0);
  });
});

describe('representativePoint', () => {
  it('returns null for an empty contour', () => {
    expect(representativePoint([])).toBeNull();
  });

  it('returns a point that lies on one of the segments', () => {
    const segs: [[number, number], [number, number]][] = [
      [
        [10, 55],
        [15, 56],
      ],
      [
        [15, 56],
        [20, 57],
      ],
    ];
    const p = representativePoint(segs);
    expect(p).not.toBeNull();
    const onLine = segs.some(([a, b]) =>
      [a, b].some((q) => q[0] === p?.[0] && q[1] === p?.[1]),
    );
    expect(onLine).toBe(true);
  });
});

// Smoothing the lines depends on first chaining marchingSquares' independent
// segments back into a path; if chaining drops or reorders points the smoothed
// line tears, so these guard the join and the corner-cut shape.
describe('chainSegments', () => {
  it('joins segments sharing endpoints into one ordered polyline', () => {
    // Three segments that connect end-to-end, given out of order and flipped.
    const segs: [[number, number], [number, number]][] = [
      [
        [15, 56],
        [20, 57],
      ],
      [
        [10, 55],
        [15, 56],
      ],
    ];
    const lines = chainSegments(segs);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual([
      [10, 55],
      [15, 56],
      [20, 57],
    ]);
  });

  it('keeps disconnected segments as separate polylines', () => {
    const segs: [[number, number], [number, number]][] = [
      [
        [0, 0],
        [1, 1],
      ],
      [
        [10, 10],
        [11, 11],
      ],
    ];
    expect(chainSegments(segs)).toHaveLength(2);
  });
});

describe('chaikin', () => {
  it('pins the endpoints and rounds the interior toward the corner', () => {
    // A right-angle corner: the kink at (1,0) must be cut, endpoints untouched.
    const line: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const out = chaikin(line, 1);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([1, 1]);
    // The sharp vertex (1,0) is replaced by two cut points, so it no longer appears.
    expect(out.some(([x, y]) => x === 1 && y === 0)).toBe(false);
    // Every point stays within the corner's bounding box (no overshoot).
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a 2-point line unchanged (nothing to round)', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    expect(chaikin(line, 2)).toEqual(line);
  });
});
