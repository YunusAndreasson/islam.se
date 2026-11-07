import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { appendProjected, driftedCamera, lineGeometry, MAX_DRIFT_MS, solarDrift } from './line-geometry';
import { type Camera, project, worldSize } from './projection';

/** Records a sink's calls as screen-space polylines (a moveTo starts a new one). */
function recorder() {
  const runs: [number, number][][] = [];
  return {
    runs,
    sink: {
      moveTo: (x: number, y: number) => runs.push([[x, y]]),
      lineTo: (x: number, y: number) => runs[runs.length - 1]!.push([x, y]),
    },
  };
}

const SWEDEN: Camera = { lon: 17, lat: 62, zoom: 4, width: 400, height: 800 };

describe('lineGeometry', () => {
  it('carries each polyline in Mercator, relative-origin bounds and the build instant', () => {
    const g = lineGeometry([[[12, 56], [18, 59], [22, 66]]], 1_000);
    expect(g.merc).toHaveLength(1);
    expect(g.merc[0]).toHaveLength(6);
    expect(g.originX).toBe(g.merc[0]![0]);
    expect(g.originY).toBe(g.merc[0]![1]);
    // The farthest vertex is the last one here; the bound must not under-report it.
    const last = Math.hypot(g.merc[0]![4]! - g.originX, g.merc[0]![5]! - g.originY);
    expect(g.radius).toBeCloseTo(last, 12);
    expect(g.builtAt).toBe(1_000);
  });
});

describe('solarDrift', () => {
  it('moves a line west at one world per mean solar day', () => {
    expect(solarDrift(1_000 + 43_200_000 / 1_000, 1_000, false)).toBeCloseTo(-0.0005, 12);
    expect(solarDrift(30_000, 0, false)).toBeCloseTo(-30_000 / 86_400_000, 15);
  });

  it('is zero in preview, before the build instant, and capped past the ceiling', () => {
    expect(solarDrift(60_000, 0, true)).toBe(0);
    expect(solarDrift(0, 60_000, false)).toBe(0);
    expect(solarDrift(10 * MAX_DRIFT_MS, 0, false)).toBe(-MAX_DRIFT_MS / 86_400_000);
  });
});

describe('appendProjected', () => {
  it('projects every vertex exactly as project() does, drift included, when not culling', () => {
    const g = lineGeometry([[[12, 56], [18, 59], [22, 66]]], 0);
    const drift = -0.0003;
    const { runs, sink } = recorder();
    appendProjected(sink, g.merc, SWEDEN, drift, 40, false);
    expect(runs).toHaveLength(1);
    const ws = worldSize(SWEDEN.zoom);
    [[12, 56], [18, 59], [22, 66]].forEach(([lon, lat], i) => {
      const p = project(lon!, lat!, SWEDEN);
      expect(runs[0]![i]![0]).toBeCloseTo(p.x + drift * ws, 9);
      expect(runs[0]![i]![1]).toBeCloseTo(p.y, 9);
    });
  });

  it('drops segments far outside the viewport and lifts the pen across them', () => {
    // Street zoom over Malmö: the line runs from Malmö up past Stockholm, nearly all of
    // it far off screen. Only the stretch near the camera should be drawn.
    const cam: Camera = { lon: 13, lat: 55.6, zoom: 12, width: 400, height: 800 };
    const line: [number, number][] = [];
    for (let i = 0; i <= 400; i++) line.push([13 + i * 0.01, 55.6 + i * 0.01]);
    const g = lineGeometry([line], 0);
    const all = recorder();
    appendProjected(all.sink, g.merc, cam, 0, 40, false);
    const culled = recorder();
    appendProjected(culled.sink, g.merc, cam, 0, 40, true);
    const total = (runs: [number, number][][]) => runs.reduce((n, r) => n + r.length, 0);
    expect(total(all.runs)).toBe(401);
    expect(total(culled.runs)).toBeLessThan(40);
    // Everything that was drawn is near the screen.
    for (const run of culled.runs) {
      for (const [x, y] of run) {
        expect(x).toBeGreaterThan(-400);
        expect(y).toBeLessThan(1_600);
      }
    }
  });

  it('keeps a long segment that crosses the screen even though both ends are off it', () => {
    const cam: Camera = { lon: 15, lat: 60, zoom: 14, width: 400, height: 800 };
    const g = lineGeometry([[[14.9, 60], [15.1, 60]]], 0);
    const { runs, sink } = recorder();
    appendProjected(sink, g.merc, cam, 0, 40, true);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(2);
  });

  it('culls nothing that could be seen: every drawn point set covers the visible stretch', () => {
    // Property: for random lines and cameras, every segment that touches the viewport in
    // the full projection is also present in the culled one.
    const coord = fc.tuple(fc.double({ min: 5, max: 30, noNaN: true }), fc.double({ min: 54, max: 70, noNaN: true }));
    fc.assert(
      fc.property(
        fc.array(coord, { minLength: 2, maxLength: 40 }),
        fc.double({ min: 3, max: 13, noNaN: true }),
        coord,
        (points, zoom, [lon, lat]) => {
          const cam: Camera = { lon, lat, zoom, width: 390, height: 844 };
          const g = lineGeometry([points], 0);
          const full = recorder();
          appendProjected(full.sink, g.merc, cam, 0, 0, false);
          const culled = recorder();
          appendProjected(culled.sink, g.merc, cam, 0, 40, true);
          const key = (a: [number, number], b: [number, number]) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
          const kept = new Set<string>();
          for (const run of culled.runs) for (let i = 1; i < run.length; i++) kept.add(key(run[i - 1]!, run[i]!));
          const pts = full.runs[0]!;
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1]!;
            const b = pts[i]!;
            const touches =
              Math.max(a[0], b[0]) >= 0 && Math.min(a[0], b[0]) <= cam.width &&
              Math.max(a[1], b[1]) >= 0 && Math.min(a[1], b[1]) <= cam.height;
            if (touches) expect(kept.has(key(a, b))).toBe(true);
          }
        },
      ),
    );
  });
});

describe('driftedCamera', () => {
  // THE BUG THIS PINS: only the Skia path applied the drift, so between live rebuilds the
  // pill and a tap's hit-test used the undrifted line. At z11, 45 s of drift is ~550 px, so
  // the pill sat off-screen from the line it named and a tap on the drawn line missed.
  it('projects undrifted geometry exactly onto the drifted path', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 30, noNaN: true }),
        fc.double({ min: 54, max: 69, noNaN: true }),
        fc.double({ min: 3, max: 13, noNaN: true }),
        fc.double({ min: -MAX_DRIFT_MS / 86_400_000, max: 0, noNaN: true }),
        (lon, lat, zoom, drift) => {
          const cam: Camera = { lon: 17, lat: 62, zoom, width: 400, height: 800 };
          const g = lineGeometry([[[lon, lat], [lon + 0.5, lat - 0.5]]], 0);
          const { runs, sink } = recorder();
          appendProjected(sink, g.merc, cam, drift, 0, false);
          const p = project(lon, lat, driftedCamera(cam, drift));
          // Sub-pixel at every zoom the map allows, against coordinates up to ~10⁶ px.
          expect(Math.abs(runs[0]![0]![0] - p.x)).toBeLessThan(1e-3);
          expect(Math.abs(runs[0]![0]![1] - p.y)).toBeLessThan(1e-9);
        },
      ),
    );
  });

  it('is the camera itself when nothing has drifted', () => {
    expect(driftedCamera(SWEDEN, 0)).toBe(SWEDEN);
  });
});
