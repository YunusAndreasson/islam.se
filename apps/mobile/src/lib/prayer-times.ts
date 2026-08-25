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
 * adhan's AqrabBalad polar-circle substitution (the default `polarCircleResolution`,
 * which borrows a nearby day's angle when the true one doesn't exist) resolves each slot
 * independently, so it can borrow a DIFFERENT reference day per slot. Near Kiruna's Arctic
 * Circle that occasionally lands a later-named slot before an earlier one — ʿIshāʾ before
 * Maghrib, or on the deepest polar-night days ʿAṣr before Ẓuhr and even before Fajr (swept
 * a full year at Kiruna: 37 of 365 days). A schedule that reads out of order breaks the
 * reader's trust in every number on the screen, which is worse than a gap, so any slot that
 * doesn't land at or after the last valid one before it is invalidated the same way an
 * already-unresolvable polar slot is — Invalid Date, which formatTime renders as "–".
 *
 * Sunrise, Ẓuhr, ʿAṣr and Maghrib run this chain in order. Fajr sits outside it and is
 * checked against Sunrise directly, never the other way round: Sunrise is plain geometry,
 * correct right up to adhan's own true polar cutoff, while Fajr rides the high-latitude
 * TWILIGHT RULE — an approximation that can wobble a few minutes past Sunrise right at the
 * edge of the rule's own validity (verified against `polar-boundary.test.ts`, which pins the
 * map's midnight-sun line to exactly where adhan's raw Sunrise goes NaN). Folding Fajr into
 * the same left-to-right chain would blank out a Sunrise that is still correct, one scan-step
 * before it needed to.
 */
function enforceChronologicalOrder(times: PrayerTimes): PrayerTimes {
  const CHAIN = ['sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const satisfies readonly PrayerSlotKey[];
  let last = Number.NEGATIVE_INFINITY;
  for (const key of CHAIN) {
    const at = times[key].getTime();
    if (Number.isNaN(at) || at < last) {
      times[key] = new Date(Number.NaN);
      continue;
    }
    last = at;
  }
  const sunriseAt = times.sunrise.getTime();
  const fajrAt = times.fajr.getTime();
  if (Number.isNaN(fajrAt) || (!Number.isNaN(sunriseAt) && fajrAt > sunriseAt)) {
    times.fajr = new Date(Number.NaN);
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
