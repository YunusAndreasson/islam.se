import type { LonLat } from '@/lib/coordinates';

// Marching squares — extract the level-0 isoline of a scalar field over a
// lat/lon lattice. We use it to draw the locus of points where a prayer happens
// at exactly the chosen instant (field value = prayerTime − now, level 0): that
// line is what "sweeps in over the country" as time advances. Pure + tested.

/** A line segment as two [lon, lat] points. */
export type Segment = [LonLat, LonLat];

// Linear-interpolate the [lon,lat] point on the edge p1→p2 where the field
// crosses `level`. Caller guarantees v1 and v2 straddle the level.
function crossing(p1: LonLat, v1: number, p2: LonLat, v2: number): LonLat {
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
    // The two lattice rows this band of cells sits between, read once per band rather
    // than four times per cell.
    //
    // This guard is the one that earns its keep: the loop is bounded by `lats.length`,
    // so a `values` array with FEWER rows than the latitude axis made the old
    // `values[i][j]` throw "cannot read properties of undefined" — a hard crash on the
    // scrub path from a merely malformed grid. Skipping the band degrades to a shorter
    // line instead. contour.test.ts pins it (and fails without it).
    const rowT = values[i];
    const rowB = values[i + 1];
    const latT = lats[i];
    const latB = lats[i + 1];
    if (!rowT || !rowB || latT === undefined || latB === undefined) continue;
    for (let j = 0; j < lons.length - 1; j++) {
      // Corner values relative to the level. TL/TR/BR/BL go clockwise from the
      // top-left of the cell (lower lat index = "top").
      //
      // Unlike the row guard above, these corner checks change no behaviour: a missing
      // corner subtracted from `level` is NaN, and the NaN skip below already treats
      // that as "no data" — which is how a polar point with no prayer time drops out of
      // the line cleanly. They are here to state that intent at the read instead of
      // relying on arithmetic on `undefined` to arrive at it, and removing them is not
      // detectable by test. The `lonL`/`lonR` reads are in bounds by the loop condition
      // outright; they are checked for the same reason.
      const cTL = rowT[j];
      const cTR = rowT[j + 1];
      const cBR = rowB[j + 1];
      const cBL = rowB[j];
      const lonL = lons[j];
      const lonR = lons[j + 1];
      if (
        cTL === undefined ||
        cTR === undefined ||
        cBR === undefined ||
        cBL === undefined ||
        lonL === undefined ||
        lonR === undefined
      ) {
        continue;
      }
      const vTL = cTL - level;
      const vTR = cTR - level;
      const vBR = cBR - level;
      const vBL = cBL - level;
      if (
        Number.isNaN(vTL) ||
        Number.isNaN(vTR) ||
        Number.isNaN(vBR) ||
        Number.isNaN(vBL)
      ) {
        continue;
      }

      const TL: LonLat = [lonL, latT];
      const TR: LonLat = [lonR, latT];
      const BR: LonLat = [lonR, latB];
      const BL: LonLat = [lonL, latB];

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
  avoid?: LonLat,
  avoidRadius = 0,
): LonLat | null {
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
  const clearance = (p: LonLat): number => {
    if (!avoid) return Infinity;
    const dx = (p[0] - avoid[0]) * lonScale;
    const dy = p[1] - avoid[1];
    return dx * dx + dy * dy;
  };
  const minClear = avoidRadius * avoidRadius;
  let best: LonLat | null = null;
  let bestD = Infinity;
  // Seeded null and filled on the first endpoint rather than pre-read from
  // segments[0][0]: `segments` is non-empty here (checked above) so the loop always
  // sets it, and the null seed is what makes that reachability visible instead of a
  // second index read the compiler has to take on trust.
  let farthest: LonLat | null = null;
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
  point: LonLat;
  /** Unit tangent of the line at `point`, in [lon, lat] space. */
  tangent: LonLat;
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
  avoid?: LonLat,
  avoidRadius = 0,
): LabelPlacement | null {
  const point = representativePoint(segments, avoid, avoidRadius);
  if (!point) return null;
  let dir: LonLat | null = null;
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
export function orientNorthFirst(line: LonLat[]): LonLat[] {
  // Reading the two ends BEFORE the length test lets one guard cover both "too short to
  // orient" and "the ends are actually there" — so the reads below are checked rather
  // than assumed. Same behaviour as the old `line.length < 2` early return.
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last || line.length < 2) return line;
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
function ptKey(p: LonLat): string {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}

/**
 * Join independent segments into connected polylines. Greedy: walk each unused
 * segment outward from both ends through shared endpoints. At a junction (a node
 * touched by >2 segments — rare, from a saddle) it just takes the first available
 * branch; the result stays connected, which is all the renderer needs.
 */
export function chainSegments(segments: Segment[]): LonLat[][] {
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
  const step = (k: string): { seg: number; next: LonLat; nextKey: string } | null => {
    const cands = incident.get(k);
    if (!cands) return null;
    for (const i of cands) {
      // `incident` is built from `segments` itself, so every index here is in range —
      // destructuring the looked-up segment is what lets the compiler confirm that
      // rather than trusting the map and the array to have stayed in step.
      const seg = segments[i];
      if (!seg || used[i]) continue;
      const [a, b] = seg;
      const next = ptKey(a) === k ? b : a;
      return { seg: i, next, nextKey: ptKey(next) };
    }
    return null;
  };

  const polylines: LonLat[][] = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    if (!seg || used[s]) continue;
    used[s] = true;
    const [a, b] = seg;
    const line: LonLat[] = [a, b];
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
 * Split a chained polyline into the control points the two smoothers below both need:
 * the loop's duplicated first vertex dropped, and whether it was a loop at all.
 * Returns null when there is nothing to smooth (fewer than three distinct vertices) —
 * which is also what establishes, for every read that follows, that the array is long
 * enough to index. Both smoothers opened with the same six lines before this existed.
 */
function controlPoints(line: LonLat[]): { pts: LonLat[]; closed: boolean; m: number } | null {
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last || line.length < 3) return null;
  const closed = first[0] === last[0] && first[1] === last[1];
  const pts = closed ? line.slice(0, -1) : line;
  if (pts.length < 3) return null;
  return { pts, closed, m: pts.length };
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
export function smoothChain(line: LonLat[], iterations = 3): LonLat[] {
  const split = controlPoints(line);
  if (!split) return line;
  const { closed, m } = split;
  let pts = split.pts;
  for (let it = 0; it < iterations; it++) {
    const out: LonLat[] = new Array<LonLat>(m);
    for (let i = 0; i < m; i++) {
      // All three indices are wrapped into [0, m) — `a` and `c` cannot actually be
      // missing. Reading them through a guard rather than asserting past it is what
      // keeps a future change to the wrap arithmetic from silently producing NaN
      // control points, which render as an invisible line rather than a crash.
      const a = pts[(i - 1 + m) % m];
      const b = pts[i];
      const c = pts[(i + 1) % m];
      if (!a || !b || !c) return line;
      out[i] =
        !closed && (i === 0 || i === m - 1)
          ? b
          : [0.25 * a[0] + 0.5 * b[0] + 0.25 * c[0], 0.25 * a[1] + 0.5 * b[1] + 0.25 * c[1]];
    }
    pts = out;
  }
  const seam = pts[0];
  return closed && seam ? [...pts, seam] : pts;
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
export function catmullRom(line: LonLat[], samples = 12): LonLat[] {
  if (samples < 1) return line;
  // A loop arrives with its first vertex duplicated at the end (see chainSegments). Drop
  // that duplicate and treat the spline as cyclic so the seam is smoothed like any knot.
  // Fewer than 3 distinct vertices is degenerate — nothing to curve.
  const split = controlPoints(line);
  if (!split) return line;
  const { pts, closed, m } = split;

  // Control point at index k: wrap around the loop when closed, clamp to the ends when
  // open (so the open curve still passes through and pins its real endpoints). Both
  // forms land inside [0, m), so the result is never actually undefined — the callers
  // below still check, so a bad index degrades to the unsmoothed line instead of
  // pushing NaN into a Skia path (which blanks the whole overlay, not just one line).
  const at = (k: number): LonLat | undefined =>
    closed ? pts[((k % m) + m) % m] : pts[k < 0 ? 0 : k >= m ? m - 1 : k];

  // Centripetal knot spacing uses sqrt of the chord length; guard zero-length spans
  // (coincident crossings) so no knot delta is 0 and nothing divides by zero.
  const knot = (a: LonLat, b: LonLat): number =>
    Math.max(1e-9, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));

  // Open: span the m-1 interior segments p_i→p_{i+1}. Closed: also span the closing
  // segment p_{m-1}→p_0, so the resampled curve returns to its start point (stays closed).
  const start = at(0);
  if (!start) return line;
  const out: LonLat[] = [start];
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    // Four control points around the segment p1→p2 (wrapped or clamped via `at`).
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    if (!p0 || !p1 || !p2 || !p3) return line;

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
      ): LonLat => {
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
