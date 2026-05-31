// Qibla — the bearing toward the Kaaba in Mecca, and the great-circle distance to
// it. The bearing comes from adhan (the same library the prayer times use, so the
// whole app speaks one source of truth); the distance is a plain haversine. Pure
// and UI-free so the compass screen and its tests can both call it.
import { Coordinates, Qibla } from 'adhan';

import type { LatLng } from './prayer-times';

/** The Kaaba, Mecca. */
export const KAABA: LatLng = { latitude: 21.4225, longitude: 39.8262 };

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Bearing in degrees clockwise from true north, from `coords` toward the Kaaba. */
export function qiblaBearing(coords: LatLng): number {
  return Qibla(new Coordinates(coords.latitude, coords.longitude));
}

/** Great-circle distance in kilometres from `coords` to the Kaaba. */
export function qiblaDistanceKm(coords: LatLng): number {
  const dLat = rad(KAABA.latitude - coords.latitude);
  const dLon = rad(KAABA.longitude - coords.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(coords.latitude)) * Math.cos(rad(KAABA.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Smallest absolute angle (0–180°) between two compass bearings, wrap-aware. So
    359° and 1° are 2° apart, not 358°. Drives the "you're facing the qibla" test. */
export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// expo-location's heading `accuracy` is a calibration level 0–3 (0 = none, 3 = high).
// Per the Expo SDK docs, on iOS 3 means < 20° uncertainty and 0 means > 50°. Below
// MEDIUM the compass can be tens of degrees off — far more than the ≤4° qibla lock
// tolerance — so we treat anything under this as "still calibrating" and ask the user
// to move the phone in a figure-8 rather than show (or lock onto) a confidently-wrong
// heading. One canonical threshold shared by the Qibla screen and the map compass button.
export const HEADING_ACCURACY_MIN = 2;

/** Whether a heading reading is trustworthy enough to point at / lock onto the qibla.
    `accuracy` is the expo-location heading calibration level (0–3); null = no reading yet. */
export function headingReliable(accuracy: number | null | undefined): boolean {
  return accuracy != null && accuracy >= HEADING_ACCURACY_MIN;
}

/** A distance formatted for Swedish display: "412 km" / "4 102 km" (thin-space groups). */
export function formatKm(km: number): string {
  const rounded = Math.round(km);
  return `${rounded.toLocaleString('sv-SE')} km`;
}
