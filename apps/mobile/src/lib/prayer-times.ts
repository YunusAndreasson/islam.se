// Bridges PrayerSettings (our serialisable shape) onto adhan's CalculationParameters
// and computes the day's prayer times. Kept UI-free so any screen can call it.
import {
  type CalculationParameters,
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Rounding,
  Shafaq,
} from 'adhan';

import {
  type CalculationMethodKey,
  type HighLatitudeRuleKey,
  type PolarCircleResolutionKey,
  type PrayerSettings,
  PRAYER_SLOT_KEYS,
  type PrayerSlotKey,
} from './settings/types';
import { isValidLatLng } from './coordinates';
import { getDisplayZone } from './zone-time';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Each preset key → its adhan factory. Drives both compute and the settings UI. */
const METHOD_FACTORY: Record<CalculationMethodKey, () => CalculationParameters> = {
  MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
  Egyptian: CalculationMethod.Egyptian,
  Karachi: CalculationMethod.Karachi,
  UmmAlQura: CalculationMethod.UmmAlQura,
  Dubai: CalculationMethod.Dubai,
  Qatar: CalculationMethod.Qatar,
  Kuwait: CalculationMethod.Kuwait,
  MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
  Singapore: CalculationMethod.Singapore,
  Turkey: CalculationMethod.Turkey,
  Tehran: CalculationMethod.Tehran,
  NorthAmerica: CalculationMethod.NorthAmerica,
  Other: CalculationMethod.Other,
};

const HIGH_LAT_RULE: Record<
  Exclude<HighLatitudeRuleKey, 'auto'>,
  (typeof HighLatitudeRule)[keyof typeof HighLatitudeRule]
> = {
  middleOfTheNight: HighLatitudeRule.MiddleOfTheNight,
  seventhOfTheNight: HighLatitudeRule.SeventhOfTheNight,
  twilightAngle: HighLatitudeRule.TwilightAngle,
};

const POLAR_RESOLUTION: Record<
  PolarCircleResolutionKey,
  (typeof PolarCircleResolution)[keyof typeof PolarCircleResolution]
> = {
  aqrabBalad: PolarCircleResolution.AqrabBalad,
  aqrabYaum: PolarCircleResolution.AqrabYaum,
  unresolved: PolarCircleResolution.Unresolved,
};

const ROUNDING = {
  nearest: Rounding.Nearest,
  up: Rounding.Up,
  none: Rounding.None,
} as const;

const SHAFAQ = {
  general: Shafaq.General,
  ahmer: Shafaq.Ahmer,
  abyad: Shafaq.Abyad,
} as const;

/** Translate settings into a configured adhan CalculationParameters for `coords`. */
export function buildParams(settings: PrayerSettings, coords: Coordinates): CalculationParameters {
  const params = METHOD_FACTORY[settings.calculationMethod]();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  // 'auto' defers to adhan's latitude-aware recommendation; otherwise honour the
  // explicit choice. recommended() needs the coordinate, hence resolved here.
  params.highLatitudeRule =
    settings.highLatitudeRule === 'auto'
      ? HighLatitudeRule.recommended(coords)
      : HIGH_LAT_RULE[settings.highLatitudeRule];
  params.polarCircleResolution = POLAR_RESOLUTION[settings.polarCircleResolution];
  params.shafaq = SHAFAQ[settings.shafaq];
  params.adjustments = { ...params.adjustments, ...settings.adjustments };
  params.rounding = ROUNDING[settings.rounding];
  return params;
}

export function computePrayerTimes(
  coords: LatLng,
  date: Date,
  settings: PrayerSettings,
): PrayerTimes {
  // A GPS fix can arrive as NaN before the first lock, and a corrupt or hand-edited manual
  // location can be out of range. Feeding either to adhan is unsafe two ways: out-of-range
  // but finite coordinates produce confidently-WRONG times, and NaN/garbage under the
  // default aqrabBalad polar resolver sends adhan into infinite recursion (it hunts for a
  // valid night that never comes) — a hard crash. So for invalid input, substitute NaN
  // coordinates and the no-op Unresolved resolver: every slot becomes an Invalid Date that
  // formatTime renders as "—" — honest, and crash-free. Valid coordinates are untouched.
  const valid = isValidLatLng(coords);
  const c = valid
    ? new Coordinates(coords.latitude, coords.longitude)
    : new Coordinates(Number.NaN, Number.NaN);
  const params = buildParams(settings, c);
  if (!valid) params.polarCircleResolution = PolarCircleResolution.Unresolved;
  return enforceChronologicalOrder(new PrayerTimes(c, date, params));
}

/**
 * adhan's polar-circle substitution (the default `polarCircleResolution` is AqrabBalad, which
 * borrows a nearby locality's angle when the true one doesn't exist) resolves each slot
 * INDEPENDENTLY, so different slots can come back from different reference days — and right at
 * the edge of the polar cutoff even the unsubstituted solvers return roots that are simply not
 * of this day. A schedule that reads out of order breaks the reader's trust in every number on
 * the screen, which is worse than a gap, so any slot that cannot be placed is invalidated the
 * same way an already-unresolvable polar slot is — Invalid Date, which formatTime renders as "–".
 *
 * **Ẓuhr is the anchor, and everything else is measured against it.** Ẓuhr is solar transit:
 * it exists on every day of the year at every latitude, needs no search, no twilight angle and
 * no substitution, and is therefore the only slot that is never wrong. Every other slot rides
 * something that can fail:
 *
 *  • **Sunrise** is plain geometry, but the solver returns a bogus root on the day the sun
 *    stops rising: at Kiruna on 11 December (polar resolution 'unresolved', a setting the
 *    Beräkning screen offers) adhan gives Sunrise 14:18 — after that day's own solar noon of
 *    11:37 — alongside a Maghrib of 01:03, in the small hours before it. So Sunrise must be
 *    before Ẓuhr, and Maghrib after it.
 *  • **Fajr** rides the high-latitude TWILIGHT RULE, an approximation that can wobble a few
 *    minutes past Sunrise right at the edge of the rule's own validity (see
 *    `polar-boundary.test.ts`, which pins the map's midnight-sun line to exactly where adhan's
 *    raw Sunrise goes NaN). It is checked against Sunrise and never the other way round.
 *  • **ʿAṣr** is the one slot found by a SHADOW-RATIO search, and in polar winter the sun never
 *    climbs enough for the ratio to occur, so the search falls through and wanders.
 *  • **ʿIshāʾ** rides the twilight rule like Fajr, so Maghrib bounds it, not the reverse.
 *
 * THE DIRECTION OF BLAME IS THE WHOLE POINT, and it is what the previous left-to-right chain
 * got wrong. That chain walked Sunrise→Ẓuhr→ʿAṣr→Maghrib→ʿIshāʾ invalidating whichever slot
 * regressed, which always meant the LATER one — so a single wanderer poisoned everything after
 * it. Measured over 2026 across every place from Malmö to Treriksröset and every settings
 * combination the app offers, ʿAṣr came back at 23:43 on a day whose sunset was 12:52
 * (Jokkmokk, 24 Dec), at 09:37 the NEXT morning (Treriksröset, 16 Jan), and — hanafi at Kiruna,
 * 9 Jan — THREE WEEKS later. In the chain, that runaway ʿAṣr became the high-water mark, and
 * Maghrib and ʿIshāʾ were both blanked for "regressing" past it: at Kiruna on 9 January the raw
 * library had Maghrib 13:03 and ʿIshāʾ 16:01 — correct, and exactly the two times a reader
 * wants on a day with two hours of sun — and the guard threw them away to protect an ʿAṣr that
 * belonged to another month. The dock showed "ʿAṣr 06:51" under "Ẓuhr 11:51" with both evening
 * rows empty (confirmed on an emulator). Anchored on Ẓuhr, an unplaceable slot can only ever
 * invalidate itself.
 *
 * ʿAṣr's upper bound is Maghrib, falling back to ʿIshāʾ when the day has no computable sunset.
 * With neither there is no night for ʿAṣr to precede, nothing to bound the search, and the
 * honest answer is the same gap the polar slots already show.
 */
function enforceChronologicalOrder(times: PrayerTimes): PrayerTimes {
  const blank = (key: PrayerSlotKey): number => {
    times[key] = new Date(Number.NaN);
    return Number.NaN;
  };

  // No transit, no day. Reachable only through invalid coordinates, which computePrayerTimes
  // already forces down the Unresolved path — but anchoring on a value we have not checked is
  // exactly how the old chain went wrong, so it is checked.
  const dhuhr = times.dhuhr.getTime();
  if (Number.isNaN(dhuhr)) {
    for (const key of PRAYER_SLOT_KEYS) blank(key);
    return times;
  }

  // Morning, working outwards from noon: Sunrise before Ẓuhr, then Fajr before Sunrise —
  // or, on a day with no sunrise at all, before Ẓuhr.
  let sunrise = times.sunrise.getTime();
  if (Number.isNaN(sunrise) || sunrise > dhuhr) sunrise = blank('sunrise');
  const dawnBound = Number.isNaN(sunrise) ? dhuhr : sunrise;
  const fajr = times.fajr.getTime();
  if (Number.isNaN(fajr) || fajr > dawnBound) blank('fajr');

  // Evening: Maghrib after Ẓuhr, then ʿIshāʾ after Maghrib — or, with no sunset, after Ẓuhr.
  let maghrib = times.maghrib.getTime();
  if (Number.isNaN(maghrib) || maghrib < dhuhr) maghrib = blank('maghrib');
  const nightStart = Number.isNaN(maghrib) ? dhuhr : maghrib;
  let isha = times.isha.getTime();
  if (Number.isNaN(isha) || isha < nightStart) isha = blank('isha');

  // ʿAṣr last, because it is bounded on both sides by slots that have now been vetted: after
  // Ẓuhr, and before the night that survived above.
  const nightBound = Number.isNaN(maghrib) ? isha : maghrib;
  const asr = times.asr.getTime();
  if (Number.isNaN(asr) || Number.isNaN(nightBound) || asr < dhuhr || asr > nightBound) {
    blank('asr');
  }
  return times;
}

/**
 * The six daily prayers plus sunrise, in chronological order.
 *
 * Re-exported from settings/types rather than re-listed: that module owns the slot key
 * set because it must not import from here (see PRAYER_SLOT_KEYS for why the single list
 * matters). This name is the one the prayer domain reads by, and it stays the same tuple.
 */
export const PRAYER_ORDER = PRAYER_SLOT_KEYS;
export type PrayerKey = PrayerSlotKey;

/**
 * The prayer to treat as "current / next" at the instant `now` (ms epoch): the first in
 * the day's chronological order whose time is AT OR AFTER `now`. Returns null when every
 * prayer has already passed (callers then roll over to tomorrow's Fajr). Prayers adhan
 * couldn't resolve (Invalid Date → NaN, e.g. polar) are skipped, never selected.
 *
 * The boundary is INCLUSIVE (`>=`) on purpose. The dock lets the user time-travel by
 * tapping a prayer row, which lands the clock exactly on that prayer's time; with a strict
 * `>` the prayer didn't count as "after" itself, so the prayer AFTER it lit up instead —
 * tap Ẓuhr, ʿAṣr highlighted (the bug this guards). Landing exactly on a prayer should
 * select THAT prayer. In live mode the choice is unobservable: the clock ticks every 30 s
 * so `now` never equals a prayer to the millisecond, and at exact equality the just-arrived
 * prayer is the right "current" answer anyway.
 */
export function nextPrayerKeyAt(times: PrayerTimes, now: number): PrayerKey | null {
  for (const key of PRAYER_ORDER) {
    const at = times[key].getTime();
    if (Number.isFinite(at) && at >= now) return key;
  }
  return null;
}

export interface NextPrayer {
  key: PrayerKey;
  at: number;
  /** True when this prayer belongs to the day AFTER the one being viewed — so it is not in
   *  the schedule list above and needs naming in the hero. Called `nextDay` rather than
   *  `tomorrow` because "tomorrow" is actively wrong once the user can view other days: past
   *  ʿIshāʾ on a day three ahead, this is the day FOUR ahead. */
  nextDay: boolean;
}

/**
 * The prayer the dock counts down to: the first of the viewed day's slots at or after `now`,
 * falling back to the NEXT day's Fajr once the day's own ʿIshāʾ has passed. Null when neither
 * exists, which the dock renders as its empty copy ("Inga fler böner …").
 *
 * `nextDayFajr` is passed in rather than computed here because the caller memoises it per
 * (day, place, settings) — `next` re-runs on every 30 s tick, and computing a whole adhan day
 * each tick all evening for a value that only changes at midnight was waste.
 *
 * THE FALLBACK IS RANGE-CHECKED, and that is not defensive padding. "The next day's Fajr" is
 * not automatically in the future: under the middle-of-the-night rule Fajr sits at the middle
 * of the night, and far enough north around the equinox that lands just BEFORE midnight —
 * swept over 2026, the Fajr belonging to 28 March at Treriksröset falls at 23:59 on the 27th.
 * Handed onward unchecked it is a negative countdown, and the dock renders anything ≤ 0 as
 * "nu": the hero would sit on "Fajr 23:59 · nu" at an instant when nothing is due and stay
 * there. `nextPrayerKeyAt` cannot produce that — it filters on `at >= now` — so this fallback
 * was the one path into the dock that skipped the check.
 */
export function selectNextPrayer(
  times: PrayerTimes,
  nextDayFajr: number | null,
  now: number,
): NextPrayer | null {
  const key = nextPrayerKeyAt(times, now);
  if (key) return { key, at: times[key].getTime(), nextDay: false };
  if (nextDayFajr == null || !Number.isFinite(nextDayFajr) || nextDayFajr < now) return null;
  return { key: 'fajr', at: nextDayFajr, nextDay: true };
}

// Prayer names in academic Arabic transliteration (DIN 31635 / ALA-LC style):
//   ʿayn  = ʿ        ḍ = emphatic d        ī = long i
//   hamza = ʾ        ḥ = pharyngeal h      ū = long u
//                    ṣ = emphatic s        ā = long a
//                    ẓ = emphatic z
//
// The Swedish translation in PRAYER_SWEDISH_NAMES sits as a muted second line
// under the transliterated name in places that have room (Förhandsvisning). Sunrise
// (Shurūq) is included here even though it's a *marker* not a prayer — the
// user expects to see the same label everywhere a prayer time appears.
export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  sunrise: 'Shurūq',
  dhuhr: 'Ẓuhr',
  asr: 'ʿAṣr',
  maghrib: 'Maghrib',
  isha: 'ʿIshāʾ',
};

/**
 * Swedish translations, paired with the transliterated name in two-line displays.
 *  – Fajr     → Gryningsbönen   (true dawn, before sunrise)
 *  – Shurūq   → Soluppgång      (the marker — end of fajr-time)
 *  – Ẓuhr     → Middagsbönen    (sun past zenith)
 *  – ʿAṣr     → Eftermiddagsbönen (shadow = object length)
 *  – Maghrib  → Solnedgångsbönen (right after sunset)
 *  – ʿIshāʾ   → Nattbönen       (after twilight ends)
 */
export const PRAYER_SWEDISH_NAMES: Record<PrayerKey, string> = {
  fajr: 'Gryningsbönen',
  sunrise: 'Soluppgång',
  dhuhr: 'Middagsbönen',
  asr: 'Eftermiddagsbönen',
  maghrib: 'Solnedgångsbönen',
  isha: 'Nattbönen',
};

/**
 * MaterialCommunityIcons glyphs walking the solar cycle. Used in glance contexts
 * (Förhandsvisning) where a small icon adds scan-ability — the app's whole
 * visual identity is sun-driven, so a sun-cycle iconography fits the brand.
 *  – Fajr    → night-partly-cloudy   (night beginning to lift)
 *  – Shurūq  → sunset-up             (sun + arrow ↑, emerging)
 *  – Ẓuhr    → sunny                 (full disc, midday)
 *  – ʿAṣr    → partly-cloudy         (sun starting to descend, a softer glyph)
 *  – Maghrib → sunset-down           (sun + arrow ↓, dipping)
 *  – ʿIshāʾ  → night                 (crescent moon)
 */
export const PRAYER_ICONS = {
  fajr: 'weather-night-partly-cloudy',
  sunrise: 'weather-sunset-up',
  dhuhr: 'weather-sunny',
  asr: 'weather-partly-cloudy',
  maghrib: 'weather-sunset-down',
  isha: 'weather-night',
} as const satisfies Record<PrayerKey, string>;

/**
 * Format a prayer-time Date for display, 24-hour, in the app's display zone (see
 * lib/zone-time — the device's own zone, defaulting to Europe/Stockholm). Returns
 * '–' for slots adhan could not compute (Invalid Date), which happens above the Arctic
 * Circle when polar resolution is 'unresolved'.
 *
 * The LOCALE stays sv-SE regardless of where the phone is: this is a Swedish app, Sweden
 * uses the 24-hour clock exclusively, and a reader abroad wants their prayer times in the
 * same shape as the rest of the interface — not suddenly in AM/PM because the handset is
 * set to en-US.
 */
// Built once and reused: formatTime renders every prayer row and re-runs on each
// clock tick (PrayerDock), so a per-call Intl.DateTimeFormat construction was pure
// overhead. Cached null if the runtime lacks full Intl tz data, so fallbackFormat
// still fires exactly as before.
//
// Keyed on the zone rather than a bare singleton, which is what makes setDisplayZone take
// effect here: the cache invalidates itself the first time the zone it was built for is no
// longer the zone in force. A plain `let timeFmt` would have gone on printing Stockholm
// times for the rest of the session.
let timeFmt: { zone: string; fmt: Intl.DateTimeFormat | null } | undefined;
function getTimeFmt(): Intl.DateTimeFormat | null {
  const zone = getDisplayZone();
  if (timeFmt?.zone === zone) return timeFmt.fmt;
  try {
    timeFmt = {
      zone,
      fmt: new Intl.DateTimeFormat('sv-SE', { timeZone: zone, hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    timeFmt = { zone, fmt: null };
  }
  return timeFmt.fmt;
}

export function formatTime(date: Date | null | undefined): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '–';
  const fmt = getTimeFmt();
  if (fmt) {
    try {
      // Some ICU builds render the sv-SE time separator as "." instead of ":"
      // (see prayer-times.dst.test.ts). Normalise so app, widget and
      // notifications always show one separator, matching fallbackFormat.
      return fmt.format(date).replace('.', ':');
    } catch {
      // fall through to the fixed-offset fallback below
    }
  }
  // Hermes without full Intl tz data: fall back to a fixed Swedish offset. This one stays
  // Sweden-shaped even for a reader abroad — there is no tz database to consult, so the
  // only alternatives are the app's own readership or raw UTC, and UTC is nobody's clock.
  // Unreachable on any runtime with ICU, which is every shipping build.
  return fallbackFormat(date);
}

// Last-Sunday-of-`month0` at 01:00 UTC — the EU daylight-saving switch instants.
// Day 0 of the *next* month is the last day of this one; stepping back its weekday
// lands on that month's final Sunday. (UTC throughout, so it's leap/zone-safe.)
function lastSundayOneAmUTC(year: number, month0: number): number {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0));
  const lastSunday = lastDay.getUTCDate() - lastDay.getUTCDay();
  return Date.UTC(year, month0, lastSunday, 1, 0, 0);
}

// Whether `date` falls in Swedish summer time (CEST, UTC+2) vs winter (CET, UTC+1).
// EU DST runs from the last Sunday of March to the last Sunday of October, both
// switching at 01:00 UTC. The previous code used a crude month window (March–October
// flat), which rendered the transition weeks an hour off — late March before the
// switch, and late October after it. This honours the real boundary.
function isStockholmSummer(date: Date): boolean {
  const t = date.getTime();
  const year = date.getUTCFullYear();
  return t >= lastSundayOneAmUTC(year, 2) && t < lastSundayOneAmUTC(year, 9);
}

// Crude fixed-offset fallback (CET/CEST) — only used if Intl timeZone support is
// missing (Hermes without full ICU). Good enough to never show a raw UTC string to
// the user. Exported only so the DST boundary logic is directly unit-testable; the
// canonical path is the Intl formatter above. Stays pure (no Intl, no allocation
// beyond two Dates) so a missing-ICU runtime can rely on it.
export function fallbackFormat(date: Date): string {
  const offsetHours = isStockholmSummer(date) ? 2 : 1;
  const shifted = new Date(date.getTime() + offsetHours * 3600_000);
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
