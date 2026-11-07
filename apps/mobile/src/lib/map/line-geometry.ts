// One prayer line's geometry, in the forms the map draws and hit-tests it in.
//
// Three consumers read the same line: the Skia overlay draws it, the RN pill rides it, and
// a tap on the map measures the distance to it. They used to project it separately, and
// only the Skia copy applied the sun's drift between rebuilds — so at city zoom a pill sat
// hundreds of pixels from the line it named, and a tap on the drawn line missed. Everything
// a consumer needs is computed here once per build, and the drift is one function.
import type { LonLat } from '@/lib/coordinates';
import { type Camera, mercX, mercY, worldSize } from './projection';

/** The drift ceiling (ms): slightly longer than one live tick. A geometry older than this
 *  is stale, and extrapolating it further would fling the lines across the map. */
export const MAX_DRIFT_MS = 45_000;

const SOLAR_DAY_MS = 86_400_000;

export interface LineGeometry {
  /** Each polyline as interleaved normalised-Mercator x, y — camera-independent. */
  merc: Float64Array[];
  /** The first vertex. Native float32 geometry is stored relative to it, where float32
   *  keeps far more precision than near world x = 0.5. */
  originX: number;
  originY: number;
  /** The farthest vertex from the origin, in Mercator units — bounds the rounding error. */
  radius: number;
  /** The instant (ms epoch) the contour was traced for; the drift is measured from here. */
  builtAt: number;
}

/** Converts a prayer's lon/lat polylines once, for every consumer. */
export function lineGeometry(polylines: readonly (readonly LonLat[])[], builtAt: number): LineGeometry {
  const merc = polylines.map((line) => {
    const arr = new Float64Array(line.length * 2);
    line.forEach((p, i) => {
      arr[i * 2] = mercX(p[0]);
      arr[i * 2 + 1] = mercY(p[1]);
    });
    return arr;
  });
  const first = merc[0];
  const originX = first?.[0] ?? 0;
  const originY = first?.[1] ?? 0;
  let radius = 0;
  for (const arr of merc) {
    for (let i = 0; i + 1 < arr.length; i += 2) {
      radius = Math.max(radius, Math.hypot((arr[i] ?? 0) - originX, (arr[i + 1] ?? 0) - originY));
    }
  }
  return { merc, originX, originY, radius, builtAt };
}

/**
 * How far the sun has carried a line since its contour was traced, in normalised-Mercator x.
 *
 * Every prayer isoline moves west at one world revolution per mean solar day, so between
 * the 30 s rebuilds a line glides at exactly −1/86 400 000 per ms. Zero in preview, where
 * the geometry is exact for the instant, and never extrapolated past MAX_DRIFT_MS.
 */
export function solarDrift(nowMs: number, builtAt: number, preview: boolean): number {
  'worklet';
  if (preview) return 0;
  const dt = nowMs - builtAt;
  if (dt <= 0) return 0;
  return -(dt > MAX_DRIFT_MS ? MAX_DRIFT_MS : dt) / SOLAR_DAY_MS;
}

/**
 * The camera under which UNdrifted geometry projects to where the drifted line is drawn.
 *
 * Drift is a pure shift in Mercator x, and Mercator x is linear in longitude, so moving the
 * line by `driftX` is the same as moving the camera by −360·driftX degrees. Anything that
 * places or measures against a line (its pill, label clipping, a tap's distance) projects
 * through this, and lands exactly where the Skia path is drawn without knowing about drift.
 */
export function driftedCamera(cam: Camera, driftX: number): Camera {
  'worklet';
  if (driftX === 0) return cam;
  return { lon: cam.lon - driftX * 360, lat: cam.lat, zoom: cam.zoom, width: cam.width, height: cam.height };
}

/** What `appendProjected` draws into — a Skia path builder in the app, a recorder in tests. */
export interface PathSink {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
}

/**
 * Projects a line to screen points into `sink`, skipping every segment whose bounding box
 * lies wholly outside the viewport grown by `margin` (the halo's reach). The pen lifts
 * across a skipped run and comes down at the next drawn segment, so visible stretches stay
 * joined exactly as before. A segment with both ends offscreen still draws when its box
 * crosses the viewport — at street zoom one segment can span the whole screen.
 *
 * `cull: false` projects every vertex, for when a trim fraction must mean the same point of
 * the line as it does on the full path.
 */
export function appendProjected(
  sink: PathSink,
  merc: readonly Float64Array[],
  cam: Camera,
  driftX: number,
  margin: number,
  cull: boolean,
): void {
  'worklet';
  const ws = worldSize(cam.zoom);
  const ox = cam.width / 2 - mercX(cam.lon) * ws;
  const oy = cam.height / 2 - mercY(cam.lat) * ws;
  const minX = -margin;
  const minY = -margin;
  const maxX = cam.width + margin;
  const maxY = cam.height + margin;
  for (const arr of merc) {
    let penDown = false;
    let px = 0;
    let py = 0;
    for (let i = 0; i + 1 < arr.length; i += 2) {
      const mx = arr[i];
      const my = arr[i + 1];
      // Pairs by construction; a half pair would put a NaN in the path, and one NaN vertex
      // blanks the whole path — which is every prayer line at once.
      if (mx === undefined || my === undefined) break;
      const x = (mx + driftX) * ws + ox;
      const y = my * ws + oy;
      if (i === 0) {
        px = x;
        py = y;
        if (!cull) {
          sink.moveTo(x, y);
          penDown = true;
        }
        continue;
      }
      if (!cull) {
        sink.lineTo(x, y);
      } else if (
        (px < minX && x < minX) ||
        (px > maxX && x > maxX) ||
        (py < minY && y < minY) ||
        (py > maxY && y > maxY)
      ) {
        penDown = false;
      } else {
        if (!penDown) {
          sink.moveTo(px, py);
          penDown = true;
        }
        sink.lineTo(x, y);
      }
      px = x;
      py = y;
    }
  }
}
