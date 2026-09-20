// The lean-in maths: how far the map zooms toward the reader as a prayer approaches, and
// the promises it keeps — the zoom is the same gentle ramp for everyone, the reader's dot
// stays put (drifting a little only at the east edge), the approaching prayer line is never
// zoomed out of view, and nothing leans toward a dot the reader cannot see. The screen-side
// gating (live only, never against the reader's hand) is tested in
// __tests__/approach-camera.test.tsx.
import { describe, expect, it } from '@jest/globals';

import {
  anchoredCamera,
  APPROACH_EASE_MS,
  approachEaseMs,
  APPROACH_LEAD_MS,
  APPROACH_MAX_ZOOM,
  APPROACH_RELEASE_MS,
  approachPose,
  approachProximity,
  approachWindowEnd,
  LINE_EDGE_MARGIN,
  MS_PER_DEGREE,
  paddedCentre,
} from './approach';
import { type Camera, invMercY, mercX, mercY, project, worldSize } from './projection';

const MIN = 60_000;
const T0 = Date.UTC(2026, 4, 20, 17, 0); // any instant; the maths is translation-invariant

// A phone-shaped viewport and the dock strip bonetider reserves at the bottom.
const W = 393;
const H = 852;
const PAD = 200;

// The whole-Sweden home frame exactly as MapLibre's fitBounds produces it for
// SWEDEN_BOUNDS above a PAD-high dock: the tighter axis sets the zoom, the bounds sit
// centred in the area above the padding, and the UNPADDED viewport centre (the camera
// mirror's convention) is PAD/2 px south of that.
function homeFrame(): Camera {
  const [west, south, east, north] = [11.15, 55.35, 23.7, 69.0];
  const dx = mercX(east) - mercX(west);
  const dy = mercY(south) - mercY(north);
  const zoom = Math.log2(Math.min(W / (dx * 512), (H - PAD) / (dy * 512)));
  const ws = worldSize(zoom);
  const cy = (mercY(north) + mercY(south)) / 2 + PAD / 2 / ws;
  return { lon: (west + east) / 2, lat: invMercY(cy), zoom, width: W, height: H };
}
const HOME = homeFrame();

const STOCKHOLM = { lon: 18.0686, lat: 59.3293 };
const MALMO = { lon: 13.0038, lat: 55.605 };
const KIRUNA = { lon: 20.2253, lat: 67.8558 };
const HAPARANDA = { lon: 24.1365, lat: 65.8355 };
const LONDON = { lon: -0.1276, lat: 51.5072 };

const pose = (now: number, anchor = STOCKHOLM, instants = [T0]) =>
  approachPose({ now, instants, home: HOME, anchor, bottomPad: PAD });

describe('homeFrame (test fixture)', () => {
  it('is a plausible phone framing of Sweden', () => {
    // If this drifts, every number below is measured against the wrong map.
    expect(HOME.zoom).toBeGreaterThan(3.7);
    expect(HOME.zoom).toBeLessThan(4.1);
  });
});

describe('approachProximity', () => {
  it('is 0 outside the windows and 1 at the prayer itself', () => {
    expect(approachProximity(T0 - APPROACH_LEAD_MS - MIN, [T0])).toBe(0);
    expect(approachProximity(T0 - APPROACH_LEAD_MS, [T0])).toBe(0);
    expect(approachProximity(T0, [T0])).toBe(1);
    expect(approachProximity(T0 + APPROACH_RELEASE_MS, [T0])).toBe(0);
    expect(approachProximity(T0 + APPROACH_RELEASE_MS + MIN, [T0])).toBe(0);
  });

  it('is linear in time on both sides — proportional, not eased', () => {
    expect(approachProximity(T0 - 15 * MIN, [T0])).toBeCloseTo(0.5, 10);
    expect(approachProximity(T0 - 20 * MIN, [T0])).toBeCloseTo(1 / 3, 10);
    expect(approachProximity(T0 + 10 * MIN, [T0])).toBeCloseTo(0.5, 10);
  });

  it('takes the larger of two overlapping windows instead of dipping between them', () => {
    // Two prayers 40 min apart: 10 min after the first, the second is 30 min away.
    const pair = [T0, T0 + 40 * MIN];
    const now = T0 + 10 * MIN;
    expect(approachProximity(now, pair)).toBeCloseTo(0.5, 10); // the release, not the lead's 0
    expect(approachProximity(T0 + 25 * MIN, pair)).toBeCloseTo(0.5, 10); // now the lead
  });

  it('ignores prayers adhan could not place (polar NaN)', () => {
    expect(approachProximity(T0, [Number.NaN])).toBe(0);
    expect(approachProximity(T0 - 15 * MIN, [Number.NaN, T0])).toBeCloseTo(0.5, 10);
  });

  it('stays within 0..1 everywhere (sampled across a day of prayers)', () => {
    const day = [T0, T0 + 97 * MIN, T0 + 131 * MIN, T0 + 260 * MIN, T0 + 290 * MIN];
    for (let t = T0 - 120 * MIN; t <= T0 + 420 * MIN; t += 37_000) {
      const p = approachProximity(t, day);
      if (!(p >= 0 && p <= 1)) throw new Error(`proximity ${p} left 0..1 at t=${t - T0} ms`);
    }
  });
});

describe('approachWindowEnd', () => {
  it('is now itself when no prayer is near', () => {
    const now = T0 - 2 * APPROACH_LEAD_MS;
    expect(approachWindowEnd(now, [T0])).toBe(now);
  });

  it('is where the release runs out, from anywhere in the window', () => {
    expect(approachWindowEnd(T0 - 10 * MIN, [T0])).toBe(T0 + APPROACH_RELEASE_MS);
    expect(approachWindowEnd(T0 + 5 * MIN, [T0])).toBe(T0 + APPROACH_RELEASE_MS);
  });

  it('chains overlapping windows — a reset holds through both prayers', () => {
    const second = T0 + 40 * MIN;
    expect(approachWindowEnd(T0 - 5 * MIN, [second, T0])).toBe(second + APPROACH_RELEASE_MS);
  });

  it('does not chain a window that only begins after the stretch has ended', () => {
    const far = T0 + APPROACH_RELEASE_MS + APPROACH_LEAD_MS + 5 * MIN;
    expect(approachWindowEnd(T0, [T0, far])).toBe(T0 + APPROACH_RELEASE_MS);
  });
});

describe('anchoredCamera', () => {
  it('is the home frame itself at Δ = 0', () => {
    const cam = anchoredCamera(HOME, STOCKHOLM, 0);
    expect(cam.lon).toBeCloseTo(HOME.lon, 10);
    expect(cam.lat).toBeCloseTo(HOME.lat, 10);
    expect(cam.zoom).toBe(HOME.zoom);
  });

  it('keeps the reader’s dot on the same screen pixel at every Δ', () => {
    // The whole point of pivoting on the dot: the zoom must not slide anything sideways.
    for (const anchor of [STOCKHOLM, MALMO, KIRUNA, HAPARANDA]) {
      const before = project(anchor.lon, anchor.lat, HOME);
      for (const d of [0.01, 0.25, 0.5, APPROACH_MAX_ZOOM, 2]) {
        const after = project(anchor.lon, anchor.lat, anchoredCamera(HOME, anchor, d));
        const moved = Math.hypot(after.x - before.x, after.y - before.y);
        if (moved > 1e-6) {
          throw new Error(`dot at ${anchor.lon},${anchor.lat} moved ${moved} px at Δ=${d}`);
        }
      }
    }
  });

  it('adds exactly Δ to the zoom', () => {
    expect(anchoredCamera(HOME, STOCKHOLM, 0.5).zoom).toBeCloseTo(HOME.zoom + 0.5, 12);
  });
});

describe('approachPose', () => {
  const CITIES = { STOCKHOLM, MALMO, KIRUNA, HAPARANDA };

  it('peaks at APPROACH_MAX_ZOOM at the prayer and never exceeds it', () => {
    expect(pose(T0).delta).toBeCloseTo(APPROACH_MAX_ZOOM, 10);
    for (let t = T0 - APPROACH_LEAD_MS; t <= T0 + APPROACH_RELEASE_MS; t += 13_000) {
      for (const [name, anchor] of Object.entries(CITIES)) {
        const { delta: d, camera } = pose(t, anchor);
        if (d < 0 || d > APPROACH_MAX_ZOOM + 1e-12) {
          throw new Error(`Δ ${d} out of range at t=${t - T0} ms for ${name}`);
        }
        if (Math.abs(camera.zoom - (HOME.zoom + d)) > 1e-12) {
          throw new Error(`camera zoom ${camera.zoom} is not home + Δ for ${name}`);
        }
      }
    }
  });

  it('gives every reader in view the same proportional ramp', () => {
    // The guard moves the pivot, never the zoom — the east edge leans exactly like the rest.
    for (const minutes of [25, 15, 8, 3]) {
      const t = T0 - minutes * MIN;
      const expected = APPROACH_MAX_ZOOM * (1 - minutes / 30);
      for (const [name, anchor] of Object.entries(CITIES)) {
        const d = pose(t, anchor).delta;
        if (Math.abs(d - expected) > 1e-10) {
          throw new Error(`${name} leans ${d} at −${minutes} min, the ramp says ${expected}`);
        }
      }
    }
  });

  it('never moves more than a breath between two 30 s ticks', () => {
    // The stronger regional zoom remains a steady ramp: max/60 inward, max/40 outward.
    // Even at the eastern edge, each eased pivot adjustment stays below eight points.
    for (const [name, anchor] of Object.entries(CITIES)) {
      let prev = pose(T0 - APPROACH_LEAD_MS, anchor);
      for (let t = T0 - APPROACH_LEAD_MS + 30_000; t <= T0 + APPROACH_RELEASE_MS; t += 30_000) {
        const next = pose(t, anchor);
        const dz = Math.abs(next.delta - prev.delta);
        const a = project(anchor.lon, anchor.lat, prev.camera);
        const b = project(anchor.lon, anchor.lat, next.camera);
        const dotStep = Math.hypot(b.x - a.x, b.y - a.y);
        if (dz > APPROACH_MAX_ZOOM / 40 + 1e-10 || dotStep > 8) {
          throw new Error(
            `${name} at ${((t - T0) / MIN).toFixed(1)} min: zoom step ${dz.toFixed(4)}, ` +
              `dot moved ${dotStep.toFixed(1)} px in one tick`,
          );
        }
        prev = next;
      }
    }
  });

  it('keeps the horizontal position wherever the line is not at stake', () => {
    // Stockholm and Malmö have room east of them; after the prayer no line is approaching.
    for (const t of [T0 - 20 * MIN, T0 - 5 * MIN, T0, T0 + 10 * MIN]) {
      for (const anchor of [STOCKHOLM, MALMO]) {
        const before = project(anchor.lon, anchor.lat, HOME);
        const after = project(anchor.lon, anchor.lat, pose(t, anchor).camera);
        expect(after.x).toBeCloseTo(before.x, 6);
      }
    }
  });

  it('never zooms the approaching line out of view', () => {
    // The line crosses the reader's latitude T/4 degrees east of them. Wherever it would be
    // on screen at home zoom, it must still be on screen under the lean.
    const edge = W * (1 - LINE_EDGE_MARGIN);
    for (const [name, anchor] of Object.entries(CITIES)) {
      for (let t = T0 - APPROACH_LEAD_MS + MIN; t < T0; t += 20_000) {
        const lineLon = anchor.lon + (T0 - t) / MS_PER_DEGREE;
        if (project(lineLon, anchor.lat, HOME).x > edge) continue; // off-frame at home too
        const { delta: d, camera } = pose(t, anchor);
        const x = project(lineLon, anchor.lat, camera).x;
        if (x > edge + 1e-6) {
          throw new Error(
            `${name}: line at ${lineLon.toFixed(2)}°E drawn at x=${x.toFixed(1)} > ` +
              `${edge.toFixed(1)} under Δ=${d.toFixed(3)}, ${((T0 - t) / MIN).toFixed(1)} min out`,
          );
        }
      }
    }
  });

  it('shifts the pivot east for an east-edge reader, and only a little', () => {
    // Haparanda: with the dot as pivot, the line would stay hidden until the last minutes.
    const t = T0 - 8 * MIN;
    const home = project(HAPARANDA.lon, HAPARANDA.lat, HOME);
    const lean = project(HAPARANDA.lon, HAPARANDA.lat, pose(t, HAPARANDA).camera);
    // Drifted west, because the pivot moved east of it — by a margin, not a pan.
    expect(home.x - lean.x).toBeGreaterThan(1);
    expect(home.x - lean.x).toBeLessThan(60);
    expect(lean.y).toBeCloseTo(home.y, 6); // This city already has vertical clearance.
  });

  it('leans toward Malmö, a few points above the dock', () => {
    // SWEDEN_BOUNDS puts the south coast just clear of the dock on purpose; an inset on the
    // bottom edge once shut Sweden's third city out of the feature entirely.
    expect(project(MALMO.lon, MALMO.lat, HOME).y).toBeGreaterThan(H - PAD - 24);
    expect(pose(T0, MALMO).delta).toBeCloseTo(APPROACH_MAX_ZOOM, 10);
  });

  it('gives Malmö and Kiruna breathing room without changing the country view', () => {
    const topPad = 100;
    const clearance = (H - PAD - topPad) / 4;
    for (const anchor of [MALMO, KIRUNA]) {
      const input = { instants: [T0], home: HOME, anchor, bottomPad: PAD, topPad };
      const peak = approachPose({ ...input, now: T0 });
      const point = project(anchor.lon, anchor.lat, peak.camera);
      expect(point.y).toBeGreaterThanOrEqual(topPad + clearance - 1e-6);
      expect(point.y).toBeLessThanOrEqual(H - PAD - clearance + 1e-6);
      for (const now of [T0 - APPROACH_LEAD_MS, T0 + APPROACH_RELEASE_MS]) {
        expect(approachPose({ ...input, now }).camera).toEqual(HOME);
      }
      const halfway = approachPose({ ...input, now: T0 - APPROACH_LEAD_MS / 2 });
      const start = project(anchor.lon, anchor.lat, HOME);
      expect(project(anchor.lon, anchor.lat, halfway.camera).y).toBeCloseTo((start.y + point.y) / 2, 6);
    }
  });

  it('eases back out after the prayer on the release clock', () => {
    expect(pose(T0 + 10 * MIN).delta).toBeCloseTo(APPROACH_MAX_ZOOM / 2, 10);
    expect(pose(T0 + APPROACH_RELEASE_MS).delta).toBe(0);
  });

  it('does not lean toward a dot the reader cannot see', () => {
    // A traveller outside the home frame: zooming toward an off-screen point only slides
    // the map away from what they are looking at.
    expect(pose(T0, LONDON)).toEqual({ delta: 0, camera: HOME });
    // A dot hidden under the dock stays hidden — a lean would not reveal it.
    const underDock = { lon: STOCKHOLM.lon, lat: 55.0 };
    expect(project(underDock.lon, underDock.lat, HOME).y).toBeGreaterThan(H - PAD);
    expect(pose(T0, underDock).delta).toBe(0);
  });

  it('is the home frame with no prayer near', () => {
    expect(pose(T0 - APPROACH_LEAD_MS - MIN)).toEqual({ delta: 0, camera: HOME });
    expect(pose(T0, STOCKHOLM, [])).toEqual({ delta: 0, camera: HOME });
  });
});

describe('approachEaseMs', () => {
  it('gives a tick\'s step the plain breath', () => {
    expect(approachEaseMs(0.0125)).toBe(APPROACH_EASE_MS);
    expect(approachEaseMs(-0.0125)).toBe(APPROACH_EASE_MS);
  });

  it('gives a catch-up more time, but never lingers past a bound', () => {
    // Back from twenty minutes on Inställningar: half the lean arrives at once.
    expect(approachEaseMs(0.2)).toBeGreaterThan(APPROACH_EASE_MS);
    expect(approachEaseMs(0.5)).toBe(approachEaseMs(APPROACH_MAX_ZOOM));
    expect(approachEaseMs(APPROACH_MAX_ZOOM)).toBeLessThanOrEqual(2 * APPROACH_EASE_MS);
  });
});

describe('paddedCentre', () => {
  it('names the coordinate MapLibre places at the middle of the area above the padding', () => {
    const cam = anchoredCamera(HOME, STOCKHOLM, 0.4);
    const c = paddedCentre(cam, PAD);
    const p = project(c.lon, c.lat, cam);
    expect(p.x).toBeCloseTo(W / 2, 6);
    expect(p.y).toBeCloseTo((H - PAD) / 2, 6);
  });

  it('is the viewport centre when there is no padding', () => {
    const c = paddedCentre(HOME, 0);
    expect(c.lon).toBeCloseTo(HOME.lon, 10);
    expect(c.lat).toBeCloseTo(HOME.lat, 10);
  });
});
