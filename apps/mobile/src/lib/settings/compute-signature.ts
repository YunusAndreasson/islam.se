// The signature that decides when the Bönetider map rebuilds its prayer-time grid (and the
// user's own times). It includes ONLY the settings that change adhan's computed times, so
// the one expensive step (a whole-country lattice of prayer times) doesn't re-run on a
// cosmetic change (theme, map style, Hijri offset, haptics, notifications, location).
//
// COMPLETENESS IS A CONTRACT. If you add a field to PrayerSettings that feeds buildParams
// (../prayer-times.ts) — i.e. it changes the computed times — it MUST be listed in
// COMPUTE_KEYS, or the map will silently keep rendering a STALE grid with no error to notice.
// compute-signature.test.ts guards this against drift, mirroring the union↔OPTIONS pattern
// in options.test.ts. Extracted from bonetider.tsx so it's testable without the map screen.
import type { PrayerSettings } from './types';

/** The PrayerSettings fields that change the computed prayer times (the grid-rebuild keys). */
export const COMPUTE_KEYS = [
  'calculationMethod',
  'madhab',
  'highLatitudeRule',
  'polarCircleResolution',
  'shafaq',
  'adjustments',
  'rounding',
] as const satisfies readonly (keyof PrayerSettings)[];

/** A stable string signature of the time-affecting settings — the grid memo key. */
export function computeSignature(s: PrayerSettings): string {
  return JSON.stringify(COMPUTE_KEYS.map((k) => s[k]));
}

/** Settings that can change local notification fire times, labels, or enabled prayers. */
export function notificationSignature(s: PrayerSettings): string {
  return JSON.stringify([COMPUTE_KEYS.map((k) => s[k]), s.notifications]);
}

/** Settings that can change the widget's prayer timeline or displayed Hijri date. */
export function widgetSignature(s: PrayerSettings): string {
  return JSON.stringify([COMPUTE_KEYS.map((k) => s[k]), s.hijriOffset]);
}
