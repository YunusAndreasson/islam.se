// How "night" it is at the viewed location and instant, as a 0→1 scalar — the
// same day/dusk/night/dawn arc the map wash draws, distilled to one number the
// chrome (dock, menu, status bar, city markers) can lean on so the whole app dims
// into night together with the map instead of staying daylight-white over it.
//
// 0 = full day, 1 = deep night, with smooth ramps through dusk (maghrib→isha) and
// dawn (fajr→sunrise). Pure so it's trivially testable.

export interface NightTimes {
  fajr: number;
  sunrise: number;
  /** Maghrib stands in for sunset (they coincide for the standard definition). */
  maghrib: number;
  isha: number;
}

const ok = (n: number): boolean => Number.isFinite(n);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function nightFactor(now: number, t: NightTimes): number {
  const { fajr, sunrise, maghrib, isha } = t;
  // Polar / unresolved days: keep the chrome light rather than guess (white nights
  // never reach true dark; a polar night is an edge we'd rather under- than over-dim).
  if (!(ok(fajr) && ok(sunrise) && ok(maghrib) && ok(isha))) return 0;
  if (now < fajr) return 1; // small hours — still night
  if (now < sunrise) return clamp01(1 - (now - fajr) / (sunrise - fajr)); // dawn 1→0
  if (now < maghrib) return 0; // day
  if (now < isha) return clamp01((now - maghrib) / (isha - maghrib)); // dusk 0→1
  return 1; // after isha — night
}
