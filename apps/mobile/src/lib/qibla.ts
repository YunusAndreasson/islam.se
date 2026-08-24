// Qibla — the bearing toward the Kaaba in Mecca, and the great-circle distance to
// it. The bearing comes from adhan (the same library the prayer times use, so the
// whole app speaks one source of truth); the distance is a plain haversine. Pure
// and UI-free so the compass screen and its tests can both call it.
import { Coordinates, Qibla } from 'adhan';

import { isValidLatLng, lonLatOf, type LonLat } from './coordinates';
import type { LatLng } from './prayer-times';

/** The Kaaba, Mecca. */
export const KAABA: LatLng = { latitude: 21.4225, longitude: 39.8262 };

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Bearing in degrees clockwise from true north, from `coords` toward the Kaaba. */
export function qiblaBearing(coords: LatLng): number {
  if (!isValidLatLng(coords)) throw new RangeError('qiblaBearing requires valid coordinates');
  return Qibla(new Coordinates(coords.latitude, coords.longitude));
}

/** Great-circle distance in kilometres from `coords` to the Kaaba. */
export function qiblaDistanceKm(coords: LatLng): number {
  if (!isValidLatLng(coords)) throw new RangeError('qiblaDistanceKm requires valid coordinates');
  const dLat = rad(KAABA.latitude - coords.latitude);
  const dLon = rad(KAABA.longitude - coords.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(coords.latitude)) * Math.cos(rad(KAABA.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * The great-circle path from `from` to `to`, sampled at `samples` points and returned as
 * `[lon, lat]` pairs — the shortest route over the sphere, which is what "the direction
 * of the qibla" actually means. Drawn on the map it is a curve, not a straight line, and
 * that curve is the honest one: a straight line on a Mercator map is a rhumb line, which
 * for Sweden → Mecca points several degrees off the true qibla.
 *
 * Spherical linear interpolation between the two positions as unit vectors, so the
 * spacing is even in ANGLE (and therefore on screen) rather than in latitude.
 *
 * The endpoints are returned verbatim rather than round-tripped through the vector
 * maths, so the arc starts exactly on the user's dot with no sub-pixel gap.
 *
 * ANTIMERIDIAN: the returned longitudes are NOT wrapped, and `mercX` does not wrap
 * either — a path crossing ±180° would be drawn straight back across the whole map. This
 * is safe for every caller here because Sweden (≈11–24°E) and Mecca (39.8°E) put the
 * entire arc inside a 30°-wide band of eastern longitudes; qibla.props.test.ts pins that
 * invariant. Anything spanning the Pacific needs a split this function does not do.
 */
export function greatCirclePoints(from: LatLng, to: LatLng, samples: number): LonLat[] {
  if (!isValidLatLng(from) || !isValidLatLng(to)) {
    throw new RangeError('greatCirclePoints requires valid coordinates');
  }
  if (!Number.isInteger(samples) || samples < 2) {
    throw new RangeError('greatCirclePoints requires at least 2 samples');
  }

  const lat1 = rad(from.latitude);
  const lon1 = rad(from.longitude);
  const lat2 = rad(to.latitude);
  const lon2 = rad(to.longitude);
  const v1: [number, number, number] = [
    Math.cos(lat1) * Math.cos(lon1),
    Math.cos(lat1) * Math.sin(lon1),
    Math.sin(lat1),
  ];
  const v2: [number, number, number] = [
    Math.cos(lat2) * Math.cos(lon2),
    Math.cos(lat2) * Math.sin(lon2),
    Math.sin(lat2),
  ];
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  // The central angle between the two positions — the arc's total angular length.
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  const out: LonLat[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    if (i === 0) {
      out.push(lonLatOf(from));
      continue;
    }
    if (i === samples - 1) {
      out.push(lonLatOf(to));
      continue;
    }
    // Coincident (omega → 0) or antipodal (omega → π) points have no unique great circle,
    // and sinOmega → 0 would divide by zero. Neither can happen for a Swedish origin and
    // Mecca, but a degenerate call must return a usable degenerate path, not NaNs.
    if (sinOmega < 1e-12) {
      out.push(lonLatOf(from));
      continue;
    }
    const a = Math.sin((1 - t) * omega) / sinOmega;
    const b = Math.sin(t * omega) / sinOmega;
    const x = a * v1[0] + b * v2[0];
    const y = a * v1[1] + b * v2[1];
    const z = a * v1[2] + b * v2[2];
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

/** A distance formatted for Swedish display: "412 km" / "4 102 km" (thin-space groups). */
export function formatKm(km: number): string {
  const rounded = Math.round(km);
  return `${rounded.toLocaleString('sv-SE')} km`;
}
