// How long the camera takes to travel on its own — Återställ's fit back to the whole country
// and the position control's flight in to the reader — from the distance it has to cover,
// in one rule, so the two moves feel like one hand.
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
import { motion } from '@/theme/tokens';

import { type Camera, mercX, mercY, worldSize } from './projection';

/** The shortest a camera move of its own may take — a small correction. */
export const TRAVEL_MIN_MS = motion.slow;
/** The longest — the flight from the whole country to the reader's street, and back. */
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
