// How long the camera takes to travel on its own — Återställ's fit back to the whole country
// and the position control's flight in to the reader — from the distance it has to cover,
// in one rule, so the two moves feel like one hand. (Since 2026-09-19 the position control
// is offered only to a reader outside Sweden, whose dot the home view cannot show; see
// MapAction in components/nav/MapNav. The rule is unchanged: a reader in Sweden's journey
// out is now a pinch, and Återställ still brings them back on this clock.)
//
// They were two constants: the flight in took 900 ms and the reset took `motion.slow`
// (350 ms), so the same journey ran two and a half times faster one way than the other,
// and from street zoom the whole country arrived in a third of a second — a snap, not a
// return. A duration that grows with the distance is how a native map times its camera
// (MapLibre GL JS derives flyTo's duration from the path length; UIKit's short-move default
// is ~350 ms), and it is what makes a nudge back home quick while the long way home takes
// its time.
//
// Distance is measured in what the eye crosses: zoom levels (each doubles the scale) plus
// the pan in screen widths at the WIDER of the two zooms, the view the ground is watched
// sliding past in. Clamped to the two ends the old constants set, so nothing got slower
// than the flight or quicker than the reset.
import { haversineKm } from '@/lib/coordinates';
import { motion } from '@/theme/tokens';

import { type Camera, mercX, mercY, project, unproject, worldSize } from './projection';

/** The shortest a camera move of its own may take — a small correction. */
export const TRAVEL_MIN_MS = motion.slow;
/** The longest — whole country to street zoom or back: Återställ from a close-up, or a
 *  reader abroad's flight to their dot. */
export const TRAVEL_MAX_MS = 900;
/** Time per zoom level crossed. */
export const MS_PER_ZOOM_LEVEL = 85;
/** Time per screen width of pan, measured at the wider zoom of the two. */
export const MS_PER_SCREEN_WIDTH = 220;

export interface CameraTarget {
  lon: number;
  lat: number;
  zoom: number;
}

/** How long the camera should take from `from` to `to`, in ms. */
export function cameraTravelMs(from: Camera, to: CameraTarget): number {
  const zoomSpan = Math.abs(to.zoom - from.zoom);
  const ws = worldSize(Math.min(from.zoom, to.zoom));
  const dx = (mercX(to.lon) - mercX(from.lon)) * ws;
  const dy = (mercY(to.lat) - mercY(from.lat)) * ws;
  const screens = from.width > 0 ? Math.hypot(dx, dy) / from.width : 0;
  const ms = TRAVEL_MIN_MS + zoomSpan * MS_PER_ZOOM_LEVEL + screens * MS_PER_SCREEN_WIDTH;
  return Math.round(Math.min(TRAVEL_MAX_MS, Math.max(TRAVEL_MIN_MS, ms)));
}

/** Frame a city at regional scale in the exposed map above the dock. The target is
 * the geometric viewport centre so both native SDKs can use the same zero padding. */
export function cityCameraTarget(from: Camera, city: CameraTarget, top: number, bottom: number): Camera {
  const frame = { ...from, ...city };
  const anchorY = (top + Math.max(top, from.height - bottom)) / 2;
  const centre = unproject(from.width / 2, from.height - anchorY, frame);
  return { ...frame, ...centre };
}

export function cityIsInView(from: Camera, city: Pick<CameraTarget, 'lon' | 'lat'>, top: number, bottom: number): boolean {
  const { x, y } = project(city.lon, city.lat, from);
  const edge = 20;
  return x >= edge && x <= from.width - edge && y >= top && y <= from.height - bottom;
}

/** The arc has time to show where the reader is going on a country-length trip. */
export function cityFlightMs(from: CameraTarget, to: CameraTarget): number {
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon);
  return Math.round(800 + Math.min(1, km / 1400) * 1000);
}

/** Match a camera settle to the current command, including when a previous flight
 * emits a late settle as MapLibre replaces it. Compare at the destination scale. */
export function reachedCameraTarget(frame: Camera, target: CameraTarget): boolean {
  const { x, y } = project(target.lon, target.lat, frame);
  return Math.abs(frame.zoom - target.zoom) < 0.08 &&
    Math.hypot(x - frame.width / 2, y - frame.height / 2) < 20;
}
