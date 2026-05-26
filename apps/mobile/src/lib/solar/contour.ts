// Marching squares — extract the level-0 isoline of a scalar field over a
// lat/lon lattice. We use it to draw the locus of points where a prayer happens
// at exactly the chosen instant (field value = prayerTime − now, level 0): that
// line is what "sweeps in over the country" as time advances. Pure + tested.

/** A line segment as two [lon, lat] points. */
export type Segment = [[number, number], [number, number]];

// Linear-interpolate the [lon,lat] point on the edge p1→p2 where the field
// crosses `level`. Caller guarantees v1 and v2 straddle the level.
function crossing(
  p1: [number, number],
  v1: number,
  p2: [number, number],
  v2: number,
): [number, number] {
  const t = v1 / (v1 - v2);
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

/**
 * Contour the scalar grid `values[latIdx][lonIdx]` at `level`, returning the
 * crossing as independent segments (a MultiLineString's worth). Cells touching a
 * NaN corner are skipped — this is how polar points with undefined prayer times
 * (or the midnight sun) drop out of the line cleanly instead of corrupting it.
 */
export function marchingSquares(
  lats: number[],
  lons: number[],
  values: number[][],
  level = 0,
): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < lats.length - 1; i++) {
    for (let j = 0; j < lons.length - 1; j++) {
      // Corner values relative to the level. TL/TR/BR/BL go clockwise from the
      // top-left of the cell (lower lat index = "top").
      const vTL = values[i][j] - level;
      const vTR = values[i][j + 1] - level;
      const vBR = values[i + 1][j + 1] - level;
      const vBL = values[i + 1][j] - level;
      if (
        Number.isNaN(vTL) ||
        Number.isNaN(vTR) ||
        Number.isNaN(vBR) ||
        Number.isNaN(vBL)
      ) {
        continue;
      }

      const TL: [number, number] = [lons[j], lats[i]];
      const TR: [number, number] = [lons[j + 1], lats[i]];
      const BR: [number, number] = [lons[j + 1], lats[i + 1]];
      const BL: [number, number] = [lons[j], lats[i + 1]];

      // 4-bit case: each corner contributes a bit when it is above the level.
      const code =
        (vTL > 0 ? 8 : 0) + (vTR > 0 ? 4 : 0) + (vBR > 0 ? 2 : 0) + (vBL > 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;

      // Edge crossings, computed lazily per case.
      const top = () => crossing(TL, vTL, TR, vTR);
      const right = () => crossing(TR, vTR, BR, vBR);
      const bottom = () => crossing(BR, vBR, BL, vBL);
      const left = () => crossing(BL, vBL, TL, vTL);

      switch (code) {
        case 1: // BL
        case 14:
          segments.push([left(), bottom()]);
          break;
        case 2: // BR
        case 13:
          segments.push([bottom(), right()]);
          break;
        case 3: // BR+BL
        case 12:
          segments.push([left(), right()]);
          break;
        case 4: // TR
        case 11:
          segments.push([top(), right()]);
          break;
        case 6: // TR+BR
        case 9:
          segments.push([top(), bottom()]);
          break;
        case 7: // not TL
        case 8: // TL
          segments.push([top(), left()]);
          break;
        case 5: // saddle (TR+BL)
          segments.push([top(), left()]);
          segments.push([bottom(), right()]);
          break;
        case 10: // saddle (TL+BR)
          segments.push([top(), right()]);
          segments.push([bottom(), left()]);
          break;
      }
    }
  }
  return segments;
}

/**
 * A representative point on a set of segments, for placing a label. We take the
 * centroid of all segment endpoints, then snap to the nearest actual point so the
 * label sits on the line rather than floating off it (e.g. on a curved isoline).
 */
export function representativePoint(segments: Segment[]): [number, number] | null {
  if (segments.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const [a, b] of segments) {
    sx += a[0] + b[0];
    sy += a[1] + b[1];
    n += 2;
  }
  const cx = sx / n;
  const cy = sy / n;
  let best: [number, number] = segments[0][0];
  let bestD = Infinity;
  for (const [a, b] of segments) {
    for (const p of [a, b]) {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

export interface LabelPlacement {
  /** The point on the line where the label is anchored ([lon, lat]). */
  point: [number, number];
  /** Unit tangent of the line at `point`, in [lon, lat] space. */
  tangent: [number, number];
}

/**
 * Where to put a line's label, plus the line's local direction there. The point
 * is `representativePoint`; the tangent is the direction of a segment incident to
 * it. Callers use the tangent to push the label *perpendicular* to the line so the
 * sweeping line never crosses the label text (a vertical line, for instance, needs
 * its label pushed sideways — lifting it straight up would keep it on the line).
 */
export function labelPlacement(segments: Segment[]): LabelPlacement | null {
  const point = representativePoint(segments);
  if (!point) return null;
  let dir: [number, number] | null = null;
  for (const [a, b] of segments) {
    const onA = a[0] === point[0] && a[1] === point[1];
    const onB = b[0] === point[0] && b[1] === point[1];
    if (onA || onB) {
      dir = [b[0] - a[0], b[1] - a[1]];
      break;
    }
  }
  // Fallback (point wasn't an endpoint — shouldn't happen): assume a horizontal line.
  if (!dir) dir = [1, 0];
  const len = Math.hypot(dir[0], dir[1]) || 1;
  return { point, tangent: [dir[0] / len, dir[1] / len] };
}

// marchingSquares emits independent 2-point segments, not ordered polylines, so a
// line can't be smoothed until its segments are chained back into a path. Shared
// endpoints between adjacent cells are mathematically identical (proven by the edge
// interpolation) but may differ by a float ULP, so we key nodes at 6-decimal
// precision (≈0.1 m — far finer than the ~30 km grid, so distinct crossings never
// collide).
function ptKey(p: readonly number[]): string {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}

/**
 * Join independent segments into connected polylines. Greedy: walk each unused
 * segment outward from both ends through shared endpoints. At a junction (a node
 * touched by >2 segments — rare, from a saddle) it just takes the first available
 * branch; the result stays connected, which is all the renderer needs.
 */
export function chainSegments(segments: Segment[]): [number, number][][] {
  const incident = new Map<string, number[]>();
  const add = (k: string, i: number): void => {
    const arr = incident.get(k);
    if (arr) arr.push(i);
    else incident.set(k, [i]);
  };
  segments.forEach(([a, b], i) => {
    add(ptKey(a), i);
    add(ptKey(b), i);
  });

  const used = new Array<boolean>(segments.length).fill(false);
  // From node `k`, find an unused incident segment and return its far endpoint.
  const step = (k: string): { seg: number; next: [number, number]; nextKey: string } | null => {
    const cands = incident.get(k);
    if (!cands) return null;
    for (const i of cands) {
      if (used[i]) continue;
      const [a, b] = segments[i];
      const next = ptKey(a) === k ? b : a;
      return { seg: i, next, nextKey: ptKey(next) };
    }
    return null;
  };

  const polylines: [number, number][][] = [];
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    const [a, b] = segments[s];
    const line: [number, number][] = [a, b];
    // Extend forward from b, then backward from a.
    for (let nx = step(ptKey(b)); nx; nx = step(nx.nextKey)) {
      used[nx.seg] = true;
      line.push(nx.next);
    }
    for (let pv = step(ptKey(a)); pv; pv = step(pv.nextKey)) {
      used[pv.seg] = true;
      line.unshift(pv.next);
    }
    polylines.push(line);
  }
  return polylines;
}

/**
 * Chaikin corner-cutting: replaces each interior vertex with two points at 1/4 and
 * 3/4 along its edges, rounding off the grid facets into a smooth curve while
 * pinning the two endpoints. Two iterations is enough to hide the lattice stepping
 * under the line's glow without drifting the line meaningfully off its true locus.
 */
export function chaikin(line: [number, number][], iterations = 2): [number, number][] {
  let pts = line;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
