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
 *
 * `avoid` + `avoidRadius` (optional): a point the label must keep clear of — in
 * practice the user's location dot. The moment a prayer's line reaches the user's
 * city is exactly when the line passes through their coordinates, so the centroid
 * snap used to park the pill ON the brass dot and the city name at the
 * most-watched moment. With an avoid point the label slides ALONG its line (still
 * snapped to a real endpoint) to the spot nearest the centroid that clears the
 * radius; if the whole line is inside it, fall back to the endpoint farthest from
 * `avoid` — best effort, never null because of avoidance.
 *
 * `avoidRadius` is in latitude-degrees of screen distance: longitude deltas are
 * compressed by cos(lat) so the clearance circle is round on the Mercator screen,
 * not an ellipse twice as wide as it is tall up at Nordic latitudes.
 */
export function representativePoint(
  segments: Segment[],
  avoid?: [number, number],
  avoidRadius = 0,
): [number, number] | null {
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
  const lonScale = avoid ? Math.cos((avoid[1] * Math.PI) / 180) : 1;
  // Squared screen-equivalent distance from `avoid` (Infinity when no avoid point,
  // so every endpoint counts as clear and the legacy centroid snap is unchanged).
  const clearance = (p: readonly [number, number]): number => {
    if (!avoid) return Infinity;
    const dx = (p[0] - avoid[0]) * lonScale;
    const dy = p[1] - avoid[1];
    return dx * dx + dy * dy;
  };
  const minClear = avoidRadius * avoidRadius;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  let farthest: [number, number] = segments[0][0];
  let farthestD = -Infinity;
  for (const [a, b] of segments) {
    for (const p of [a, b]) {
      const away = clearance(p);
      if (away > farthestD) {
        farthestD = away;
        farthest = p;
      }
      if (away < minClear) continue;
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best ?? farthest;
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
export function labelPlacement(
  segments: Segment[],
  avoid?: [number, number],
  avoidRadius = 0,
): LabelPlacement | null {
  const point = representativePoint(segments, avoid, avoidRadius);
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

/**
 * Orient an open polyline north-first. The renderer's sweep-in reveal trims the path
 * from its START, so without a convention each line appears from whichever end
 * chainSegments happened to walk first — one prayer's line could sweep upward while
 * the next swept downward. North-first makes every reveal pour top-of-screen →
 * south, one deliberate direction across all prayers. A closed loop is returned
 * unchanged: it has no ends, so its (arbitrary) seam is as good a start as any.
 */
export function orientNorthFirst(line: [number, number][]): [number, number][] {
  if (line.length < 2) return line;
  const first = line[0];
  const last = line[line.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  if (closed) return line;
  return first[1] >= last[1] ? line : [...line].reverse();
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
 * Light approximating smoothing of a chained contour, to iron out the grid-scale
 * waviness marching squares leaves on a coarse lattice. The crossings stair-step along
 * the ~40 km cell edges; centripetal Catmull-Rom then threads *through* every one of
 * them, faithfully preserving that waviness — so on its own the rendered isoline reads
 * as a gently faceted polyline, not the smooth curve the underlying solar field is.
 *
 * A few binomial [¼, ½, ¼] passes pull the control polygon toward that smooth
 * underlying curve before catmullRom resamples it, removing the sampling artefact (a
 * sub-cell move toward the true contour — it doesn't invent a time, it de-noises the
 * lattice). Endpoints are pinned so an open line still reaches the map edge; a closed
 * loop is smoothed cyclically so its seam stays continuous.
 */
export function smoothChain(line: [number, number][], iterations = 3): [number, number][] {
  if (line.length < 3) return line;
  const closed = line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
  let pts = closed ? line.slice(0, -1) : line;
  const m = pts.length;
  if (m < 3) return line;
  for (let it = 0; it < iterations; it++) {
    const out: [number, number][] = new Array(m);
    for (let i = 0; i < m; i++) {
      if (!closed && (i === 0 || i === m - 1)) {
        out[i] = pts[i];
        continue;
      }
      const a = pts[(i - 1 + m) % m];
      const b = pts[i];
      const c = pts[(i + 1) % m];
      out[i] = [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]];
    }
    pts = out;
  }
  return closed ? [...pts, pts[0]] : pts;
}

/**
 * Resample a polyline as a smooth curve that PASSES THROUGH its points, via a
 * centripetal Catmull-Rom spline.
 *
 * The marching-squares contour is piecewise-linear at the ~35 km grid, so it needs
 * smoothing to read as a curve. Chaikin corner-cutting (the old approach) only
 * *approximates* — it cuts toward the inside of each vertex, leaving a quadratic
 * B-spline whose curvature is discontinuous at every knot; the eye reads those
 * curvature jumps as the faint "hand-drawn, almost-but-not-quite" facets that survive
 * even many iterations. Catmull-Rom instead *interpolates*: it threads a smooth cubic
 * through each contour point with continuous tangents (C1), so the rendered line reads
 * as a true geometric curve rather than a rounded polyline. Centripetal parameterisation
 * (alpha = 0.5) is what prevents the cusps and self-intersections that the uniform variant
 * forms on unevenly-spaced cell crossings. It does NOT strictly bound the curve to the
 * control polygon — a sharp convex corner can bulge a few percent of a cell past it (a 90°
 * kink overshoots ~7%) — but a prayer isoline over a smooth solar field turns gently, so
 * the measured overshoot on real lines is essentially nil and far under a pixel at the
 * country zoom. (If contours ever sharpened, a tension/limiter clamp would cap it.)
 *
 * Open lines preserve their endpoints exactly (the end tangents are clamped). A *closed*
 * loop — which chainSegments emits with its first point repeated at the end, e.g. when an
 * isoline closes on a local extremum inside the country — is instead fitted cyclically:
 * the control points wrap around the loop so the join at the (arbitrary) start vertex has
 * the same continuous tangent as every other knot. Clamping a closed loop as if it were
 * open would leave a visible kink at that seam wherever chaining happened to cut the cycle.
 *
 * A line shorter than 3 points has no curve to fit and is returned unchanged. `samples` is
 * the number of points generated per source segment (curve resolution) — the source
 * vertices stay ~35 km apart, so 12 keeps each rendered arc well under a pixel of chord
 * error at the country zoom.
 */
export function catmullRom(line: [number, number][], samples = 12): [number, number][] {
  const n = line.length;
  if (n < 3 || samples < 1) return line;

  // A loop arrives with its first vertex duplicated at the end (see chainSegments). Drop
  // that duplicate and treat the spline as cyclic so the seam is smoothed like any knot.
  const closed = line[0][0] === line[n - 1][0] && line[0][1] === line[n - 1][1];
  const pts = closed ? line.slice(0, -1) : line;
  const m = pts.length;
  if (m < 3) return line; // a 2-vertex loop is degenerate — nothing to curve

  // Control point at index k: wrap around the loop when closed, clamp to the ends when
  // open (so the open curve still passes through and pins its real endpoints).
  const at = (k: number): [number, number] =>
    closed ? pts[((k % m) + m) % m] : pts[k < 0 ? 0 : k >= m ? m - 1 : k];

  // Centripetal knot spacing uses sqrt of the chord length; guard zero-length spans
  // (coincident crossings) so no knot delta is 0 and nothing divides by zero.
  const knot = (a: [number, number], b: [number, number]): number =>
    Math.max(1e-9, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));

  // Open: span the m-1 interior segments p_i→p_{i+1}. Closed: also span the closing
  // segment p_{m-1}→p_0, so the resampled curve returns to its start point (stays closed).
  const out: [number, number][] = [at(0)];
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    // Four control points around the segment p1→p2 (wrapped or clamped via `at`).
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);

    // Sample the Barry–Goldman pyramid across [t1, t2]; s=samples lands exactly on p2,
    // so consecutive segments join without duplicating the shared vertex.
    for (let s = 1; s <= samples; s++) {
      const t = t1 + ((t2 - t1) * s) / samples;
      const lerp = (
        ax: number,
        ay: number,
        bx: number,
        by: number,
        ta: number,
        tb: number,
      ): [number, number] => {
        const w = (t - ta) / (tb - ta);
        return [ax + (bx - ax) * w, ay + (by - ay) * w];
      };
      const [a1x, a1y] = lerp(p0[0], p0[1], p1[0], p1[1], t0, t1);
      const [a2x, a2y] = lerp(p1[0], p1[1], p2[0], p2[1], t1, t2);
      const [a3x, a3y] = lerp(p2[0], p2[1], p3[0], p3[1], t2, t3);
      const [b1x, b1y] = lerp(a1x, a1y, a2x, a2y, t0, t2);
      const [b2x, b2y] = lerp(a2x, a2y, a3x, a3y, t1, t3);
      out.push(lerp(b1x, b1y, b2x, b2y, t1, t2));
    }
  }
  return out;
}
