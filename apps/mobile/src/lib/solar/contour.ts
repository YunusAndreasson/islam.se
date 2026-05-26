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
