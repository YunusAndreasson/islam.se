// Closed-form Web Mercator projection between geographic [lon, lat] and screen
// pixels, for a NORTH-UP map with no pitch (which the Bönetider map is — see
// bonetider.tsx, bearing/pitch are never set). MapLibre uses 512 px tiles, so the
// world is `512 · 2^zoom` px square; a point's screen position is its Mercator
// offset from the camera centre, scaled by that world size, around the viewport
// centre.
//
// Why we need this: the solar wash + prayer lines move onto a Skia overlay that
// draws in SCREEN space, but the geometry (and the camera) live in lon/lat. MapLibre
// owns the basemap + camera; we mirror its projection here so the overlay stays glued
// to the map. The functions are `'worklet'`-tagged so they run on the UI thread when
// building Skia paths from Reanimated shared values, and run normally on the JS thread
// for the React marker overlay and in tests.
//
// This must match MapLibre's projection: spherical Web Mercator (EPSG:3857), 512 px
// tiles, latitude clamped to the Mercator limit (±85.0511°).

const DEG = Math.PI / 180;
/** The Mercator latitude limit — beyond this, y → ±∞. MapLibre clamps here too. */
const MAX_LAT = 85.05112878;

/** The camera that frames the map: centre coordinate, zoom, and viewport size (px). */
export interface Camera {
  lon: number;
  lat: number;
  zoom: number;
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Map world size in pixels at a given zoom (512 px tiles, like MapLibre). */
export function worldSize(zoom: number): number {
  'worklet';
  return 512 * 2 ** zoom;
}

/** Longitude → normalised Mercator x in [0, 1]. */
export function mercX(lon: number): number {
  'worklet';
  return (lon + 180) / 360;
}

/** Latitude → normalised Mercator y in [0, 1] (0 = north pole side, 1 = south). */
export function mercY(lat: number): number {
  'worklet';
  const clamped = lat > MAX_LAT ? MAX_LAT : lat < -MAX_LAT ? -MAX_LAT : lat;
  const phi = clamped * DEG;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
}

/** Normalised Mercator x → longitude. */
export function invMercX(mx: number): number {
  'worklet';
  return mx * 360 - 180;
}

/** Normalised Mercator y → latitude (inverse Gudermannian). */
export function invMercY(my: number): number {
  'worklet';
  const t = Math.exp((0.5 - my) * 2 * Math.PI);
  const phi = 2 * (Math.atan(t) - Math.PI / 4);
  return phi / DEG;
}

/** Project a geographic coordinate to a screen pixel under the given camera. */
export function project(lon: number, lat: number, cam: Camera): ScreenPoint {
  'worklet';
  const ws = worldSize(cam.zoom);
  return {
    x: (mercX(lon) - mercX(cam.lon)) * ws + cam.width / 2,
    y: (mercY(lat) - mercY(cam.lat)) * ws + cam.height / 2,
  };
}

/** Unproject a screen pixel back to a geographic coordinate under the given camera. */
export function unproject(x: number, y: number, cam: Camera): { lon: number; lat: number } {
  'worklet';
  const ws = worldSize(cam.zoom);
  const mx = (x - cam.width / 2) / ws + mercX(cam.lon);
  const my = (y - cam.height / 2) / ws + mercY(cam.lat);
  return { lon: invMercX(mx), lat: invMercY(my) };
}
