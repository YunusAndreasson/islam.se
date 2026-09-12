// How far the map may wander, in one place — because two things have to agree about it:
// the camera's own leash, and the prayer-time lattice the sweeping lines are contoured
// from. When they disagreed, the lattice was the smaller of the two and every line ended
// in mid-sea at an invisible rectangle the reader could pan to but never past.

/** [west, south, east, north] */
export type Bounds = [number, number, number, number];

/**
 * The furthest the camera may wander. The app's Sweden framing is the FIT target (see
 * SWEDEN_BOUNDS in bonetider); this is the leash, and it is deliberately continental. A
 * reader looking across the Öresund at Denmark, up into Finnmark, over to Åland or down to
 * the Mediterranean is doing something reasonable — the solar geometry is correct
 * everywhere, so there is no cartographic reason to pen them into Sweden.
 *
 * What it stops is the far end of that freedom: nothing prevented a fling from parking the
 * camera in the Pacific, where the overlay dutifully projected Sweden's prayer lines over
 * open ocean and the reset chip was the only way home. A hard stop is kinder than a chip,
 * and cheaper — off-bounds panning still fetched tiles for a view nobody wants.
 *
 * WHY SO WIDE — this is sized against the SCREEN, not taste. maxBounds constrains the
 * viewport, so if the box is shorter than the visible map at CAMERA_MIN_ZOOM, MapLibre has
 * to clamp every frame and the map fights the finger. At z3 the tallest supported phone
 * (956 pt) shows 0.233 of the world vertically; this box spans 0.284, so it always has
 * room. Narrowing it means raising CAMERA_MIN_ZOOM to match — check both together.
 */
export const CAMERA_MAX_BOUNDS: Bounds = [-20.0, 35.0, 60.0, 80.0];

/** Floor only. The ceiling stays open: the mosque layer and the qibla arc are drawn for
 *  city zoom, and the projection handles zoom exactly. */
export const CAMERA_MIN_ZOOM = 3;

/** The Mercator world. Past ±85° the projection runs off to infinity and no basemap tile
 *  exists, so nothing outside this can be shown however wide a box asks for. */
export const WORLD_BOUNDS: Bounds = [-180.0, -85.0, 180.0, 85.0];

/**
 * Grow a box by `lonPad`/`latPad` degrees on every side, clipped to the Mercator world.
 *
 * Used to give the prayer-time lattice a margin past the camera's leash: a line has to
 * reach the edge of the SCREEN, and the screen's edge is the box's edge exactly when the
 * reader is pressed against the leash — with no margin the contour would have no cell to
 * cross there and would stop a hair short of the rail, which reads as the line ending for
 * a reason rather than running off the page.
 */
export function expandBounds(b: Bounds, lonPad: number, latPad: number): Bounds {
  return [
    Math.max(WORLD_BOUNDS[0], b[0] - lonPad),
    Math.max(WORLD_BOUNDS[1], b[1] - latPad),
    Math.min(WORLD_BOUNDS[2], b[2] + lonPad),
    Math.min(WORLD_BOUNDS[3], b[3] + latPad),
  ];
}
