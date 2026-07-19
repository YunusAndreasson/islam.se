// Qibla — the bearing toward the Kaaba in Mecca, and the great-circle distance to
// it. The bearing comes from adhan (the same library the prayer times use, so the
// whole app speaks one source of truth); the distance is a plain haversine. Pure
// and UI-free so the compass screen and its tests can both call it.
import { Coordinates, Qibla } from 'adhan';

import { isValidLatLng } from './coordinates';
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

/** Smallest absolute angle (0–180°) between two compass bearings, wrap-aware. So
    359° and 1° are 2° apart, not 358°. Drives the "you're facing the qibla" test.
    (It is exactly the magnitude of {@link shortestTurn}.) */
export function angleDelta(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Normalize any heading (degrees) into the [0, 360) range — negatives and ≥360 wrap. */
export function normalizeHeading(raw: number): number {
  return ((raw % 360) + 360) % 360;
}

/** The shortest *signed* turn (degrees, in [−180, 180)) from bearing `from` to bearing `to`.
    Accumulating these is what unwraps the dial: it always steps the SHORT way across the
    0/360 seam (359°→1° is +2°, not −358°), so a needle eases instead of whipping all the way
    around. By construction `from + shortestTurn(from, to) ≡ to (mod 360)` and the step never
    exceeds 180° — the two properties that uniquely define it. */
export function shortestTurn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
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

// ── Qibla alignment: when do we call the phone "facing Mecca"? ───────────────────
// A fresh lock needs the tight tolerance; once locked it holds through a wider band so
// a heading sitting right on the 4° edge can't strobe the lock on and off — which would
// re-fire the haptic and flicker the brass every frame. One canonical "you're facing it"
// rule shared by the Qibla screen and the map's compass button (was a copy-pasted 4° in
// both, with a comment begging them to stay in sync — now the type system enforces it).

/** Degrees within which an *unlocked* compass first counts as facing the qibla. */
export const QIBLA_ALIGN_TOL = 4;
/** Once locked, alignment holds until the heading drifts past this (hysteresis band). */
export const QIBLA_ALIGN_RELEASE = 7;

/** Whether `delta` (the wrap-aware angle 0–180 between heading and qibla bearing) counts
    as aligned, given whether we were already locked. Hysteresis: tight to acquire, looser
    to keep, so a reading hovering at the boundary doesn't chatter. Reliability gating
    (calibration ≥ MEDIUM, via {@link headingReliable}) stays the caller's concern. */
export function qiblaAligned(delta: number, wasAligned: boolean): boolean {
  return delta <= (wasAligned ? QIBLA_ALIGN_RELEASE : QIBLA_ALIGN_TOL);
}

/** Degrees within which the readout encourages "you're on your way" (but not yet locked). */
export const QIBLA_NEAR_TOL = 30;
/** Beyond this many degrees off, the "getting warmer" proximity feedback is fully cold. */
export const QIBLA_PROX_RANGE = 45;

/** "Getting warmer" 0..1: 1 when pointing straight at the qibla, ramping linearly to 0 at
    {@link QIBLA_PROX_RANGE}° off. Pinned to 0 while the heading is untrustworthy — we must
    not warm the dial toward a bearing we don't yet believe (the calibration warm-up). */
export function qiblaProximity(heading: number, accuracy: number | null, bearing: number): number {
  if (!headingReliable(accuracy)) return 0;
  return Math.max(0, Math.min(1, 1 - angleDelta(heading, bearing) / QIBLA_PROX_RANGE));
}

/** The coarse, heading-derived state the compass shows: pointing at the qibla (`aligned`),
    closing in (`near`), or holding a reading we don't trust yet (`calibrating`). Pure, so the
    screen can re-render only when the band flips — and so the warm-up gate is unit-testable. */
export interface QiblaStatus {
  /** Within the (hysteresis-aware) lock tolerance AND the reading is trusted. */
  readonly aligned: boolean;
  /** Closing in (≤ {@link QIBLA_NEAR_TOL}°), trusted, but not yet locked. */
  readonly near: boolean;
  /** We have a live heading but its calibration is below MEDIUM — don't claim a direction. */
  readonly calibrating: boolean;
}

/** Fold a heading reading into the coarse {@link QiblaStatus}. `wasAligned` carries the prior
    lock so {@link qiblaAligned}'s hysteresis applies. The reliability gate is the whole point:
    an uncalibrated reading is `calibrating` and NEVER `aligned`/`near`, even if it happens to
    point exactly at the qibla — that's what stops the "wrong at first, then right" magnetometer
    warm-up from locking + buzzing on a confidently-wrong heading. */
export function deriveQiblaStatus(
  heading: number,
  accuracy: number | null,
  bearing: number,
  wasAligned: boolean,
): QiblaStatus {
  const reliable = headingReliable(accuracy);
  const delta = angleDelta(heading, bearing);
  const aligned = reliable && qiblaAligned(delta, wasAligned);
  const near = reliable && !aligned && delta <= QIBLA_NEAR_TOL;
  const calibrating = !reliable;
  return { aligned, near, calibrating };
}

/** A distance formatted for Swedish display: "412 km" / "4 102 km" (thin-space groups). */
export function formatKm(km: number): string {
  const rounded = Math.round(km);
  return `${rounded.toLocaleString('sv-SE')} km`;
}
