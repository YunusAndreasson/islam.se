// How far the map may wander, in one place — because two things have to agree about it:
// the camera's own leash, and the prayer-time lattice the sweeping lines are contoured
// from. When they disagreed, the lattice was the smaller of the two and every line ended
// in mid-sea at an invisible rectangle the reader could pan to but never past.

import { invMercY, mercY, worldSize } from './projection';
import type { LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';

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
 * WHAT IT CONSTRAINS — the camera TARGET, not the viewport. Android passes it to
 * setLatLngBoundsForCameraTarget, and iOS refuses any camera whose centre leaves the box
 * (MLRNMapView's shouldChangeFromCamera). The visible map can therefore reach half a screen
 * past every edge, which is why the box can be this tight on Sweden and still never clip it.
 *
 * WHY SO WIDE — sized so a box shorter than the screen can never trap the camera: at z3
 * the tallest supported phone (956 pt) shows 0.233 of the world vertically; this box spans
 * 0.284. Narrowing it means raising CAMERA_MIN_ZOOM to match — check both together.
 */
export const CAMERA_MAX_BOUNDS: LngLatBounds = [-20.0, 35.0, 60.0, 80.0];

/** Floor only. The ceiling stays open: the mosque layer and the qibla arc are drawn for
 *  city zoom, and the projection handles zoom exactly. */
export const CAMERA_MIN_ZOOM = 3;

/** The Mercator world. Past ±85° the projection runs off to infinity and no basemap tile
 *  exists, so nothing outside this can be shown however wide a box asks for. */
const WORLD_BOUNDS: LngLatBounds = [-180.0, -85.0, 180.0, 85.0];

/**
 * Grow a box by `lonPad`/`latPad` degrees on every side, clipped to the Mercator world.
 *
 * Used to give the prayer-time lattice a margin past the camera's leash: a line has to
 * reach the edge of the SCREEN, and the screen's edge is the box's edge exactly when the
 * reader is pressed against the leash — with no margin the contour would have no cell to
 * cross there and would stop a hair short of the rail, which reads as the line ending for
 * a reason rather than running off the page.
 */
export function expandBounds(b: LngLatBounds, lonPad: number, latPad: number): LngLatBounds {
  return [
    Math.max(WORLD_BOUNDS[0], b[0] - lonPad),
    Math.max(WORLD_BOUNDS[1], b[1] - latPad),
    Math.min(WORLD_BOUNDS[2], b[2] + lonPad),
    Math.min(WORLD_BOUNDS[3], b[3] + latPad),
  ];
}

// In the approved 393 × 486 map, 17.5° E, 62.6° N sits at (196.5, 290)
// at 10.25 points per degree of longitude. Position it in the exposed map
// above the measured sheet. MapLibre's camera spans the full screen underneath.
export function openingSwedenCamera(width: number, height: number, sheetHeight: number) {
  const exposed = Math.max(1, height - sheetHeight);
  const scale = Math.min(width / 393, exposed / 486);
  // Keep the whole viewport inside the map's latitude leash on tall screens.
  const minWorld = height / (mercY(CAMERA_MAX_BOUNDS[1]) - mercY(CAMERA_MAX_BOUNDS[3]));
  const world = Math.max(minWorld, 360 * 10.25 * scale);
  const zoom = Math.log2(world / worldSize(0));
  const referenceY = mercY(62.6);
  // At large text sizes the sheet can occupy two thirds of the screen. Keep
  // Malmö's mark and name clear even if the zoom floor constrains the fit.
  const southCoastOffset = (mercY(55.35) - referenceY) * world;
  const anchorY = Math.min(exposed / 2 + (290 - 486 / 2) * scale, exposed - 12 - southCoastOffset);
  const center: LngLat = [17.5, invMercY(referenceY + (height / 2 - anchorY) / world)];
  return { center, zoom, padding: { top: 0, right: 0, bottom: 0, left: 0 } };
}
