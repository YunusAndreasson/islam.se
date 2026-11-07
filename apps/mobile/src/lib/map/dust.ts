// The mosque "snow" — one soft speck per mosque at the national view — has to be described
// in TWO places that must agree to the pixel: MapLibre draws the specks (MosqueLayer), and
// the Skia wash clears a hole around each one so the twilight colours do not drown them
// (SolarSkiaOverlay). A hole smaller than its speck tints the speck's edge; a hole that
// outlives the speck's fade leaves a light patch with nothing in it. So the zoom curves live
// here once, and both read them.

/** [zoom, value] pairs, zoom ascending — the shape of a MapLibre linear interpolation. */
export type ZoomStops = readonly (readonly [number, number])[];

/** The speck's radius (px): a snow fleck at national zoom, growing slightly toward the glyphs. */
export const DUST_RADIUS_STOPS: ZoomStops = [
  [4, 1.2],
  [6, 1.7],
  [8, 2.6],
];

/**
 * How present the speck tier is, 0..1 — multiplied by the scheme's own peak opacity on the
 * map. Fades in by the national view (z4), holds through the regional view, and dissolves
 * by ~z7.8 as the glyphs (minzoom 7) take over. The short lead-in below z4 keeps an even
 * wider view (all of Scandinavia) from snapping on abruptly.
 */
export const DUST_PRESENCE_STOPS: ZoomStops = [
  [3.4, 0],
  [4, 1],
  [6.4, 1],
  [7.8, 0],
];

/** The mosque and burial glyphs' opacity, rising out of nothing at their z7 minzoom while
 *  the dust above dissolves, so the town-scale tier fades in instead of popping in at 0.7. */
export const GLYPH_PRESENCE_STOPS: ZoomStops = [
  [7, 0],
  [8, 0.7],
  [9, 0.95],
];

/** Linear interpolation through `stops`, clamped at both ends — MapLibre's own rule. */
export function atZoom(stops: ZoomStops, zoom: number): number {
  'worklet';
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return 0;
  if (zoom <= first[0]) return first[1];
  if (zoom >= last[0]) return last[1];
  for (let i = 1; i < stops.length; i++) {
    const hi = stops[i]!;
    if (zoom <= hi[0]) {
      const lo = stops[i - 1]!;
      return lo[1] + ((zoom - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]);
    }
  }
  return last[1];
}

/** The same curve as a MapLibre style expression, each value multiplied by `scale`. */
export function zoomExpression(stops: ZoomStops, scale = 1): unknown[] {
  return ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([z, v]) => [z, v * scale])];
}
