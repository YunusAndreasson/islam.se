// How "night" it is at the viewed location and instant, as a 0→1 scalar — the same
// darkness the map wash draws, distilled to one number the chrome (dock, menu, status bar,
// city markers) can lean on so the whole app dims into night together with the map.
//
// 0 = full day, 1 = true night. It is derived from the sun's real DEPRESSION below the
// horizon (see sun.ts), not from prayer-time intervals — so Malmö's luminous summer night
// no longer reads as a deep black (it only ever reaches ~0.8 in late May), and the ramp is
// physically smooth instead of stitched from Maghrib→Isha / Fajr→sunrise. Pure, so it's
// trivially testable.
import { darknessFromAltitude, sunAltitudeDeg } from './sun';

/** Darkness 0→1 at a place and instant, from the sun's true altitude. */
export function nightFactor(nowMs: number, latDeg: number, lonDeg: number): number {
  if (!Number.isFinite(nowMs)) return 0;
  return darknessFromAltitude(sunAltitudeDeg(latDeg, lonDeg, new Date(nowMs)));
}
