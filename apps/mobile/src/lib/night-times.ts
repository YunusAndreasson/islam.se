// The night's two voluntary landmarks — its midpoint and the start of its last third —
// derived from a day's prayer times. Mirrors prayer-times.ts structurally (an ordered
// tuple, a key union, one label table per surface) but stays deliberately OUTSIDE
// PrayerKey.
//
// WHY NOT JUST ADD TWO KEYS TO PRAYER_ORDER
// ------------------------------------------
// PRAYER_ORDER feeds solar/field.ts, which draws each prayer as the level-0 contour of
// (prayerTime − now) across a whole-country lattice (~3752 adhan calls per key per day).
// That works because every one of the six IS a solar event — a depression angle the sun
// reaches somewhere. Nattens mitt is not: it is an arithmetic bisection of the night, so
// it has no angle and cannot be a contour line at all. Widening PrayerKey would also
// silently make both times notification slots, widget rows, PerPrayerSlot fields and
// candidates in nextPrayerKeyAt — none of which is wanted. Keeping them in their own
// union is what makes the blast radius equal to the surfaces we actually opted into.
import { type PrayerTimes, SunnahTimes } from 'adhan';

/** The night's landmarks, chronologically. */
export const NIGHT_ORDER = ['middleOfNight', 'lastThird'] as const;
export type NightKey = (typeof NIGHT_ORDER)[number];

// Transliterated in the same DIN 31635 / ALA-LC style as PRAYER_LABELS, so a night row
// sits in the dock's list without announcing itself as a different kind of thing:
//   ʿayn = ʿ    ṣ = emphatic s    ā/ī/ū = long vowels    th = ث
export const NIGHT_LABELS: Record<NightKey, string> = {
  middleOfNight: 'Muntaṣaf al-layl',
  lastThird: 'Thuluth al-layl al-ākhir',
};

/**
 * Swedish translations, paired with the transliterated name in two-line displays.
 *  – Muntaṣaf al-layl        → Nattens mitt
 *  – Thuluth al-layl al-ākhir → Nattens sista tredjedel
 */
export const NIGHT_SWEDISH_NAMES: Record<NightKey, string> = {
  middleOfNight: 'Nattens mitt',
  lastThird: 'Nattens sista tredjedel',
};

/**
 * MaterialCommunityIcons glyphs, chosen so both are astronomically TRUE rather than
 * decorative — the same discipline as the sun-cycle glyphs in PRAYER_ICONS:
 *  – Nattens mitt    → moon-full            (a full moon culminates at the night's middle)
 *  – Sista tredjedel → moon-waning-crescent (the waning crescent IS the pre-dawn moon)
 * ʿIshāʾ already owns `weather-night`, also a crescent; the filled disc keeps the two
 * night rows from reading as two of the same glyph stacked.
 */
export const NIGHT_ICONS = {
  middleOfNight: 'moon-full',
  lastThird: 'moon-waning-crescent',
} as const satisfies Record<NightKey, string>;

/** Both landmarks for one night. `null` = the night has no meaningful division today. */
export type NightTimes = Record<NightKey, Date | null>;

const EMPTY: NightTimes = { middleOfNight: null, lastThird: null };

/**
 * The night that BEGINS on `times`' day: adhan divides maghrib(D) → fajr(D+1), which is
 * the classical night (sunset to true dawn). So the last third routinely lands after
 * midnight, on the following calendar day — callers that show it next to a date must say
 * so. Manual per-prayer offsets are already baked into `times` by adhan, so they carry
 * through here for free.
 *
 * SunnahTimes builds the next day internally with adhan's `dateByAddingDays`, which
 * preserves local hours. Every caller passes `stockholmPrayerDate(...)` (local noon), so
 * this is the same noon anchoring `addStockholmDays` uses in stockholm-time.ts — it
 * agrees with the DST invariant rather than working around it.
 *
 * THE GUARD IS THE POINT OF THIS FUNCTION. Two ways the raw values are unusable:
 *
 *  1. Non-finite — invalid coordinates, or polar resolution 'unresolved' above the Arctic
 *     circle. Same NaN story the rest of the app renders as '—'.
 *
 *  2. At or before ʿIshāʾ. Under HighLatitudeRule.MiddleOfTheNight both fajr and isha are
 *     clamped toward the night's midpoint, so in a Swedish summer they converge and
 *     SunnahTimes ends up dividing an interval that is not the night. Measured over all
 *     of 2026 with the Turkey method, the number of days on which the midpoint or last
 *     third falls at/before ʿIshāʾ:
 *
 *         rule                Malmö  Stockholm  Umeå  Kiruna
 *         auto (default)          0          0     0       0
 *         twilightAngle           0          0     0       5
 *         middleOfTheNight      106        128     —     175
 *
 *     A third of the year, a user who picks that rule would be shown a "last third of the
 *     night" that arrives before the night prayer's time has even entered. That is a
 *     contradiction on screen, so it is suppressed rather than displayed.
 *
 * Genuinely short nights are NOT suppressed: Kiruna at midsummer has a 25-minute night
 * with an 8-minute last third under the default settings. That is short but true, and the
 * app's job is to report it, not to invent a minimum.
 */
export function computeNightTimes(times: PrayerTimes): NightTimes {
  // adhan always populates every slot with a Date object; an unresolvable one is an
  // INVALID Date (NaN), never missing. Bailing here also means SunnahTimes is never
  // constructed from a day adhan could not resolve — it would build a second PrayerTimes
  // for the next day from the same coordinates, and prayer-times.ts documents how badly
  // that can go with garbage input.
  const isha = times.isha.getTime();
  if (!Number.isFinite(isha)) return EMPTY;

  const sunnah = new SunnahTimes(times);
  const keep = (d: Date): Date | null => {
    const t = d.getTime();
    return Number.isFinite(t) && t > isha ? d : null;
  };
  return {
    middleOfNight: keep(sunnah.middleOfTheNight),
    lastThird: keep(sunnah.lastThirdOfTheNight),
  };
}
