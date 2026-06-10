import { describe, expect, it } from '@jest/globals';

import {
  catmullRom,
  chainSegments,
  marchingSquares,
  orientNorthFirst,
  representativePoint,
  smoothChain,
} from './contour';

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

  // A prayer line passes through the user's coordinates exactly when that prayer's
  // time arrives at their city — without avoidance, the label pill parked ON the
  // user's brass dot + city name at the most-watched moment (the reported overlap).
  describe('avoid point (the user-dot clearance)', () => {
    // A west→east chain whose centroid snap is the middle point (15, 56).
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

    it('is the unchanged centroid snap when the avoid point is far away', () => {
      expect(representativePoint(segs, [40, 30], 0.9)).toEqual(representativePoint(segs));
    });

    it('slides along the line to the nearest clear endpoint when the dot sits on the snap', () => {
      const p = representativePoint(segs, [15, 56], 0.9);
      // Still a real endpoint of the line — the pill must stay ON its line…
      const onLine = segs.some(([a, b]) => [a, b].some((q) => q[0] === p?.[0] && q[1] === p?.[1]));
      expect(onLine).toBe(true);
      // …but no longer the avoided point.
      expect(p).not.toEqual([15, 56]);
    });

    it('falls back to the farthest endpoint when the whole line is inside the radius', () => {
      // Huge radius: nothing clears, so it must still return SOME endpoint (the pill
      // never vanishes because of avoidance) — specifically the farthest one.
      const p = representativePoint(segs, [10, 55], 50);
      expect(p).toEqual([20, 57]);
    });

    it('measures clearance round-on-screen (lon compressed by cos lat), not in raw degrees', () => {
      // Two candidate endpoints, both 1.2° of raw distance from the avoid point at
      // lat 60 — but east-west degrees are half-width on a Mercator screen up there,
      // so the eastward endpoint is effectively 0.6° away (inside a 0.9 radius)
      // while the northward one is a full 1.2° (clear). A raw-degree metric would
      // accept both and keep the visually-overlapping eastward pill.
      const eastAndNorth: [[number, number], [number, number]][] = [
        [
          [16.2, 60], // 1.2° east of the dot → ~0.6° on screen → NOT clear
          [15, 61.2], // 1.2° north of the dot → 1.2° on screen → clear
        ],
      ];
      expect(representativePoint(eastAndNorth, [15, 60], 0.9)).toEqual([15, 61.2]);
    });
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

describe('catmullRom', () => {
  it('interpolates the control points (curve passes through every input vertex)', () => {
    // Unlike corner-cutting, an interpolating spline must hit each source point. A
    // line that merely approximated them would drift inside the bends — the exact bug
    // that made the rendered prayer line look hand-drawn rather than geometric.
    const line: [number, number][] = [
      [0, 0],
      [1, 0.5],
      [2, 0],
      [3, 0.5],
    ];
    const out = catmullRom(line, 8);
    for (const p of line) {
      const hit = out.some(([x, y]) => Math.abs(x - p[0]) < 1e-9 && Math.abs(y - p[1]) < 1e-9);
      expect(hit).toBe(true);
    }
  });

  it('pins the endpoints exactly and densifies the interior', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 0],
    ];
    const out = catmullRom(line, 10);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([2, 0]);
    // 1 + (n-1)*samples points, and every coordinate finite (no NaN from a knot/0 divide).
    expect(out.length).toBe(1 + (line.length - 1) * 10);
    for (const [x, y] of out) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('leaves a 2-point line unchanged (no curve to fit)', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    expect(catmullRom(line)).toEqual(line);
  });

  it('does not divide by zero on coincident consecutive points', () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 0],
      [1, 1],
      [1, 1],
    ];
    const out = catmullRom(line, 6);
    for (const [x, y] of out) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  // A closed isoline (chainSegments repeats the first point at the end) must come back as
  // a closed curve — the renderer draws it as a loop, so a curve that ended somewhere off
  // the start would leave a gap.
  it('keeps a closed loop closed (first point repeated at the end)', () => {
    const loop: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0], // duplicated start — the closed-loop marker chainSegments emits
    ];
    const out = catmullRom(loop, 8);
    expect(out[0]).toEqual(out[out.length - 1]); // still a closed ring
    expect(out[0]).toEqual([0, 0]);
  });

  // The seam bug this guards: where chainSegments happens to cut the cycle is arbitrary,
  // so the smoothed loop must NOT depend on which vertex is first. We rotate the loop's
  // start by one vertex and require the same geometric curve. Clamping the loop as an open
  // path (the bug) gives the start/end vertices a different, kinked tangent than the rest,
  // so the rotated curve would diverge near the old seam — this test would fail.
  it('smooths a closed loop seam-independently (rotating the start vertex yields the same curve)', () => {
    // An irregular pentagon so each vertex has a distinct tangent (a regular polygon could
    // pass by symmetry alone). Last point repeats the first to mark the loop as closed.
    const base: [number, number][] = [
      [0, 0],
      [2, 0.4],
      [2.6, 2],
      [1, 3],
      [-0.5, 1.5],
    ];
    const loopA: [number, number][] = [...base, base[0]];
    // Rotate the cut by one vertex: same cycle, different arbitrary start.
    const rot = [...base.slice(1), base[0]];
    const loopB: [number, number][] = [...rot, rot[0]];

    const a = catmullRom(loopA, 10);
    const b = catmullRom(loopB, 10);

    // Both describe the same closed curve, so each sampled point of one must appear on the
    // other (compared as point sets — the start offset differs but the geometry must not).
    const onCurve = (p: [number, number], curve: [number, number][]): boolean =>
      curve.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 1e-9);
    for (const p of a) expect(onCurve(p, b)).toBe(true);
    for (const p of b) expect(onCurve(p, a)).toBe(true);
  });
});

// smoothChain de-noises the grid-scale waviness that makes a coarse-lattice contour
// look faceted. The bug it prevents: a sweeping prayer line that reads as a gently
// jagged polyline rather than the smooth iso-curve the solar field actually is.
describe('smoothChain', () => {
  // Sum of absolute turning angles — a proxy for how jagged a polyline reads.
  const turning = (line: [number, number][]): number => {
    let sum = 0;
    for (let i = 1; i < line.length - 1; i++) {
      const a = Math.atan2(line[i][1] - line[i - 1][1], line[i][0] - line[i - 1][0]);
      const b = Math.atan2(line[i + 1][1] - line[i][1], line[i + 1][0] - line[i][0]);
      let d = Math.abs(b - a);
      if (d > Math.PI) d = 2 * Math.PI - d;
      sum += d;
    }
    return sum;
  };

  it('reduces a stair-stepped polyline’s total turning (less jagged)', () => {
    // A zig-zag along a diagonal — the marching-squares stair-step in miniature.
    const zig: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [3, 2],
      [3, 3],
    ];
    expect(turning(smoothChain(zig))).toBeLessThan(turning(zig));
  });

  it('pins the endpoints of an open line (it must still reach the map edge)', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 2],
      [2, 0],
      [3, 2],
      [4, 0],
    ];
    const out = smoothChain(line);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([4, 0]);
  });

  it('keeps a closed loop closed (first point equals last)', () => {
    const loop: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const out = smoothChain(loop);
    expect(out[0]).toEqual(out[out.length - 1]);
  });

  it('leaves a 2-point line unchanged (nothing to smooth)', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 1],
    ];
    expect(smoothChain(line)).toEqual(line);
  });
});

// The sweep-in reveal trims each rendered line from its START, so the polyline's
// orientation IS the direction the line pours onto the map. Without this guard a
// refactor of chainSegments' walk order would silently make some lines sweep
// south→north and others north→south — the kind of inconsistency nobody traces
// back to geometry ordering.
describe('orientNorthFirst', () => {
  it('keeps a line that already starts at its northern end', () => {
    const line: [number, number][] = [
      [15, 68],
      [15.5, 62],
      [16, 56],
    ];
    expect(orientNorthFirst(line)).toEqual(line);
  });

  it('reverses a south-first line so the reveal pours north → south', () => {
    const line: [number, number][] = [
      [16, 56],
      [15.5, 62],
      [15, 68],
    ];
    expect(orientNorthFirst(line)).toEqual([
      [15, 68],
      [15.5, 62],
      [16, 56],
    ]);
  });

  it('preserves the exact point set — orientation must never move geometry', () => {
    const line: [number, number][] = [
      [16, 56.123456],
      [15.5, 61.9],
      [15, 67.5],
    ];
    const out = orientNorthFirst(line);
    expect([...out].sort()).toEqual([...line].sort());
  });

  it('does not mutate its input when reversing', () => {
    const line: [number, number][] = [
      [16, 56],
      [15, 68],
    ];
    const copy = line.map((p) => [...p]);
    orientNorthFirst(line);
    expect(line).toEqual(copy);
  });

  it('leaves a closed loop unchanged (a loop has no end to lead from)', () => {
    const loop: [number, number][] = [
      [10, 60],
      [12, 58],
      [14, 60],
      [12, 62],
      [10, 60],
    ];
    expect(orientNorthFirst(loop)).toBe(loop);
  });

  it('leaves degenerate lines unchanged', () => {
    const point: [number, number][] = [[10, 60]];
    expect(orientNorthFirst(point)).toBe(point);
    expect(orientNorthFirst([])).toEqual([]);
  });
});
