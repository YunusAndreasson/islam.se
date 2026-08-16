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

import { startOfStockholmDay } from './stockholm-time';

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
 * MaterialCommunityIcons glyphs: a circle filling up, because that is literally what these
 * two times are — the night 1/2 and 2/3 elapsed.
 *  – Nattens mitt    → circle-half-full (exactly a half)
 *  – Sista tredjedel → circle-slice-5   (5/8; MDI has no thirds — see below)
 *
 * THIS REPLACED A LUNAR PAIR (moon-full + moon-waning-crescent), and the reason is worth
 * keeping so nobody reaches for the moon again. Each was individually true — a full moon
 * does culminate at the night's middle, a waning crescent does rise before dawn — but they
 * are phases of DIFFERENT nights, a fortnight apart, and can never both describe the night
 * being listed. Stacked in one group they read as a month passing, not a night. Worse here
 * than anywhere: the dock renders the Hijri date directly above these rows, so on
 * 2 Rabīʿ al-awwal (a thin waxing crescent) the card drew a full moon and a waning
 * crescent, and the audience for a prayer app is the audience that notices. ʿIshāʾ's
 * `weather-night` is a crescent too, two rows up, which made it worse still.
 *
 * The 5/8 approximation is deliberate and is the smaller sin: 0.625 against 0.667 is
 * sub-pixel at the 18 dp these render at, MDI offers no exact third, and the icon is not
 * the measurement — the time beside it is. An elapsed-proportion glyph is true every night
 * of the year, which is exactly what a lunar phase is not.
 */
export const NIGHT_ICONS = {
  middleOfNight: 'circle-half-full',
  lastThird: 'circle-slice-5',
} as const satisfies Record<NightKey, string>;

/** Both landmarks for one night. `null` = the night has no meaningful division today. */
export type NightTimes = Record<NightKey, Date | null>;

// Swedish names the night by the morning it leads into — "natten mot måndag" — which is
// also how anyone actually says it. That idiom does the work a bare "+1" was failing at:
// these times belong to a night that STRADDLES midnight, under a card headed with the
// evening's date, and a reader setting an alarm for 01:31 has to know which morning.
const TIME_ZONE = 'Europe/Stockholm';
let weekdayFmt: { long?: Intl.DateTimeFormat | null; short?: Intl.DateTimeFormat | null } = {};
function getWeekdayFmt(style: 'long' | 'short'): Intl.DateTimeFormat | null {
  const cached = weekdayFmt[style];
  if (cached !== undefined) return cached;
  let built: Intl.DateTimeFormat | null;
  try {
    // Pinned to Swedish civil time like every other date in the app, so a device in
    // another zone can't roll the weekday to the wrong day near midnight.
    built = new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, weekday: style });
  } catch {
    built = null;
  }
  weekdayFmt[style] = built;
  return built;
}

/** Reset the memoised formatters. Test-only. */
export function resetNightFormattersForTests(): void {
  weekdayFmt = {};
}

/**
 * The night group's heading: "Natten mot måndag" — the night that BEGINS on `dayStart`
 * (a Stockholm-midnight epoch) and ends at the following dawn. Falls back to a bare
 * "Natten" on a runtime without full Intl data rather than printing a wrong weekday.
 */
export function nightCaption(dayStart: number): string {
  const fmt = getWeekdayFmt('long');
  if (!fmt) return 'Natten';
  // Noon-anchored, like every other day step in this app: a Stockholm day is 23, 24 or 25
  // hours, and `+ 86_400_000` lands on the same date once a year (see stockholm-time.ts).
  const noonNextDay = new Date(dayStart + 36 * 3_600_000);
  try {
    return `Natten mot ${fmt.format(noonNextDay)}`;
  } catch {
    return 'Natten';
  }
}

/**
 * Short Swedish weekday ("mån") for a landmark that lands on the morning side of midnight.
 * Returned per row because only SOME of them cross: in winter the midpoint falls at 22:41
 * on the evening's own date while the last third falls at 01:06 on the next, and the
 * heading alone cannot say which is which.
 */
export function crossedMidnightLabel(at: Date, dayStart: number): string | undefined {
  if (startOfStockholmDay(at.getTime()) === dayStart) return undefined;
  const fmt = getWeekdayFmt('short');
  if (!fmt) return undefined;
  try {
    // sv-SE renders these as "mån"/"tis"/…; some ICU builds append a period.
    return fmt.format(at).replace('.', '');
  } catch {
    return undefined;
  }
}

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
