// A development-only cross-check: does OUR Mercator projection agree with MapLibre's?
//
// WHY THIS EXISTS. The Skia field canvas and the RN marker layer do not ask MapLibre where
// a coordinate is — they mirror its camera and re-project themselves (see ./projection.ts),
// because a per-frame bridge round-trip could never keep up with a pan. That mirror is a
// COPY of MapLibre's geometry, and a copy can drift from its original silently: every pixel
// still lands somewhere plausible, the lines still glow, and the only symptom is that the
// whole country is in the wrong place.
//
// That has now happened twice, and both times a user found it rather than we did:
//   • the camera centre was taken from MapLibre's reported `center`, which is the camera
//     TARGET and is shifted by the dock's fitBounds padding — every city ~50 svenska mil
//     south (see viewportCentreFromBounds in app/bonetider.tsx);
//   • the viewport size was taken from useWindowDimensions, which on iOS can be larger than
//     the Stack screen's content area — every point shifted by half the difference.
//
// Both would have been caught in one settled frame by asking MapLibre for the same point and
// comparing. `MapRef.project()` returns dp on BOTH platforms (Android divides by
// displayDensity in MLRNMapView.kt; iOS returns UIKit points), so the two answers are
// directly comparable with no scaling.
//
// Read the SHAPE of the drift, not just its size — that is what names the bug:
//   • same dy on every point, dx ≈ 0 → the camera centre's latitude is wrong (the padding bug)
//   • dx and dy growing with distance from the viewport centre → wrong zoom/world size
//   • a constant offset in both axes → wrong viewport width/height
// Three points spread the length of the country is the minimum that can tell them apart.
import type { LonLat } from '../coordinates';
import { type Camera, project } from './projection';

/** The part of MapLibre's `MapRef` this needs — declared structurally so the check can be
 *  tested against a plain object instead of a mocked native module. */
export interface ProjectionProbe {
  project(lngLat: LonLat): Promise<[x: number, y: number]>;
}

/** One reference point's disagreement, in dp. */
export interface ProjectionDrift {
  point: LonLat;
  /** Where ./projection.ts puts it under the camera the overlays are drawing with. */
  ours: { x: number; y: number };
  /** Where MapLibre puts it. */
  theirs: { x: number; y: number };
  dx: number;
  dy: number;
  /** Euclidean distance, the single number worth thresholding on. */
  distance: number;
}

/** Malmö, Stockholm, Kiruna — the south coast, the middle and the far north, so a uniform
 *  offset and a scale error cannot look the same. All three are inside SWEDEN_BOUNDS, so
 *  they are on screen at the framing the app opens in (MapLibre still answers for points
 *  off screen, which is why the check does not depend on that). */
export const GUARD_POINTS: readonly LonLat[] = [
  [13.0038, 55.605], // Malmö
  [18.0686, 59.3293], // Stockholm
  [20.2253, 67.8558], // Kiruna
];

/** Drift at every reference point, worst first. Rejects nothing and warns about nothing —
 *  callers decide what a given magnitude means (see reportProjectionDrift). */
export async function projectionDrift(
  probe: ProjectionProbe,
  cam: Camera,
  points: readonly LonLat[] = GUARD_POINTS,
): Promise<ProjectionDrift[]> {
  const drifts = await Promise.all(
    points.map(async (point) => {
      const ours = project(point[0], point[1], cam);
      const [x, y] = await probe.project(point);
      const dx = ours.x - x;
      const dy = ours.y - y;
      return {
        point,
        ours,
        theirs: { x, y },
        dx,
        dy,
        distance: Math.hypot(dx, dy),
      };
    }),
  );
  return drifts.sort((a, b) => b.distance - a.distance);
}

/** How far apart (dp) the two projections may be before something is wrong. Generous by
 *  the standards of the bugs above — those were off by hundreds of dp — but tight enough
 *  that a half-pixel of rounding never speaks. */
export const DRIFT_TOLERANCE_DP = 1.5;

// Once per session. The first breach carries every number needed to name the bug; the same
// warning on every settled pan afterwards is how a real warning gets skimmed past.
let warned = false;
// Clean passes so far. The check is NOT free — three bridge round-trips — and it runs on the
// settled camera event, which is the same JS thread that forwards camera frames to the Skia
// overlay. The bugs it exists to catch are systematic (a wrong anchor, a wrong viewport, a
// wrong world size), not intermittent: they are wrong at every camera or at none. So a
// handful of agreeing samples across different cameras is proof enough for one session, and
// after that the guard retires itself instead of taxing every pan for the rest of the run.
let cleanPasses = 0;

/** Agreeing samples before the guard stops asking. More than one because the first settle is
 *  always the same initial fit — a second and third land wherever the reader has panned to,
 *  which is what makes the sample worth anything. */
export const CLEAN_PASSES_BEFORE_TRUST = 3;
// A check is awaiting MapLibre's answer. Without this the latch above leaks: `warned` can
// only be set AFTER the round-trip, so two settled events arriving inside one round-trip both
// pass the check and both warn. (Observed on device: two warnings from one gesture run.)
let checking = false;

/** Clears the once-per-session latch. For tests, and for anything that legitimately starts
 *  a new projection regime (a style swap, a fresh screen mount). */
export function resetProjectionGuard(): void {
  warned = false;
  checking = false;
  cleanPasses = 0;
}

/**
 * Compare the two projections and warn ONCE if they disagree. A no-op outside development:
 * this is a check on our own arithmetic, not a runtime safety net, and it must never spend
 * a bridge round-trip in a shipped build.
 *
 * Call it on the SETTLED region event. `stillCurrent` is what makes the reading trustworthy
 * there: asking MapLibre costs a round-trip, and a settle is very often followed immediately
 * by another gesture — so the answer can come back describing a camera that has already moved
 * on, and comparing it against the one we sampled reports a drift nobody has. On device that
 * produced 253 dp of pure fiction from two quick swipes. Any camera change during the
 * round-trip therefore voids the sample rather than reporting it.
 *
 * @param stillCurrent Called after the round-trip; return false if the camera has moved on
 *   since `cam` was published. Omitting it trusts the caller to only ask at rest.
 * @returns the worst drift found, or null when the check did not run or was voided.
 */
export async function reportProjectionDrift(
  probe: ProjectionProbe | null | undefined,
  cam: Camera,
  points: readonly LonLat[] = GUARD_POINTS,
  stillCurrent?: () => boolean,
): Promise<ProjectionDrift | null> {
  // `typeof` rather than a null check: the ref this comes from is MapLibre's `MapRef` in
  // the app but a bare host element in the screen tests (the binding is string-mocked), and
  // a guard that throws inside the tests it is meant to protect is worse than no guard.
  if (!__DEV__ || warned || checking || typeof probe?.project !== 'function') return null;
  if (cleanPasses >= CLEAN_PASSES_BEFORE_TRUST) return null;
  // A camera with no viewport has not been measured yet (the seed state before onLayout);
  // projecting against it is meaningless rather than wrong.
  if (!(cam.width > 0) || !(cam.height > 0)) return null;

  let drifts: ProjectionDrift[];
  checking = true;
  try {
    drifts = await projectionDrift(probe, cam, points);
  } catch {
    // The native module can reject while the map is tearing down or before the style
    // exists. A guard that crashes the screen it guards is worse than no guard.
    return null;
  } finally {
    checking = false;
  }

  // The map moved while we were asking. MapLibre answered for where it is NOW, `cam` says
  // where it was — the difference is the gesture, not a bug.
  if (stillCurrent && !stillCurrent()) return null;

  const worst = drifts[0];
  if (!worst) return null;
  if (worst.distance <= DRIFT_TOLERANCE_DP) {
    cleanPasses += 1;
    return worst;
  }

  warned = true;
  console.warn(
    `[karta] Vår projektion och MapLibres skiljer sig med ${worst.distance.toFixed(1)} dp — ` +
      'överlägget (bönelinjer, brasspricken, pillren) ligger fel mot kartan.\n' +
      `kamera: lon=${cam.lon.toFixed(4)} lat=${cam.lat.toFixed(4)} zoom=${cam.zoom.toFixed(3)} ` +
      `viewport=${cam.width}×${cam.height}\n` +
      drifts
        .map(
          (d) =>
            `  [${d.point[0]}, ${d.point[1]}] vår (${d.ours.x.toFixed(1)}, ${d.ours.y.toFixed(1)}) ` +
            `MapLibre (${d.theirs.x.toFixed(1)}, ${d.theirs.y.toFixed(1)}) ` +
            `Δ (${d.dx.toFixed(1)}, ${d.dy.toFixed(1)})`,
        )
        .join('\n'),
  );
  return worst;
}
