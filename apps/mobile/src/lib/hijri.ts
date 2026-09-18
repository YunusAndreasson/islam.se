// Hijri (Islamic) date for display. The app already stores a `hijriOffset` setting
// but never rendered a date — this fills that gap. We use the arithmetic *tabular*
// Islamic calendar (the deterministic civil calendar, 30-year cycle), which is what
// the offset is for: tabular dates can sit ±1 day from a local moon-sighting or the
// Umm al-Qura announcement, so the user nudges `hijriOffset` to match their mosque.
// Kept UI-free and pure so it's trivially testable and any screen can call it.
import { getDisplayZone } from './zone-time';

export interface HijriDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–30. */
  day: number;
}

// 1 Muharram AH 1 in the civil tabular variant = JDN 1948440 (Friday epoch).
const ISLAMIC_EPOCH = 1948440;

// gregorianToJDN / islamicToJDN / jdnToIslamic are exported ONLY so the anchor tests
// (hijri.anchors.test.ts) can pin their hand-typed magic constants against external
// references via the JDN bridge — a correlated error that round-trips would otherwise be
// invisible. They are an implementation detail; the app uses toHijri/formatHijri.
/** Gregorian (proleptic Gregorian) calendar date → Julian Day Number (integer, noon). */
export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Tabular Islamic (year, month, day) → JDN. Inverse of {@link jdnToIslamic}. */
export function islamicToJDN(year: number, month: number, day: number): number {
  return (
    day +
    Math.ceil(29.5 * (month - 1)) +
    (year - 1) * 354 +
    Math.floor((3 + 11 * year) / 30) +
    ISLAMIC_EPOCH -
    1
  );
}

/** JDN → tabular Islamic date. Round-trips with {@link islamicToJDN}. */
export function jdnToIslamic(jdn: number): HijriDate {
  // The closed-form year estimate can be off by one near a year boundary, and the
  // 29/30-day months make a "÷29.5" month estimate fail at boundaries (it can yield
  // day 0). So: clamp the year against the actual year starts, then linear-scan the
  // twelve months (cheap, exact) for the one containing `jdn`.
  let year = Math.floor((30 * (jdn - ISLAMIC_EPOCH) + 10646) / 10631);
  if (jdn < islamicToJDN(year, 1, 1)) year -= 1;
  else if (jdn >= islamicToJDN(year + 1, 1, 1)) year += 1;

  let month = 1;
  while (month < 12 && jdn >= islamicToJDN(year, month + 1, 1)) month++;
  const day = jdn - islamicToJDN(year, month, 1) + 1;
  return { year, month, day };
}

/**
 * The Hijri date for a Gregorian calendar day, with the user's day offset applied.
 * `date` is read in the *local* civil sense (its Y/M/D), since the Hijri day the
 * user wants labelled is the civil day they're living, not a UTC instant.
 */
export function toHijri(date: Date, offsetDays = 0): HijriDate {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate()) + offsetDays;
  return jdnToIslamic(jdn);
}

/** Proleptic Gregorian calendar date, as plain fields. Deliberately not a `Date`: these
 *  are calendar FIELDS, and handing back a Date invites a caller to read them through a
 *  time zone that is not the display zone (see the warning above `getGregorianFmt`). */
export interface GregorianDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

/** JDN → proleptic Gregorian date. The inverse of {@link gregorianToJDN}, which the
 *  Hijri month sheet needs to print "13 Rabīʿ al-awwal" next to its civil date: every
 *  other direction in this file goes Gregorian → Hijri, and the sheet walks the other way.
 *  (Fliegel–Van Flandern; hijri.props.test.ts pins the round trip.) */
export function jdnToGregorian(jdn: number): GregorianDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: 100 * b + d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

/**
 * 29 or 30 — the length of a tabular Hijri month.
 *
 * ⚠️ The month-13 shortcut does not work here. `islamicToJDN(y, 13, 1)` and
 * `islamicToJDN(y + 1, 1, 1)` are NOT the same day: the first carries `floor((3 + 11y)/30)`
 * and the second `floor((14 + 11y)/30)`, which differ in exactly the eleven leap years of
 * the 30-year cycle. Rolling the year over by hand is what makes Dhū al-ḥijja come out at
 * 30 days in a leap year instead of 29.
 */
export function hijriMonthLength(year: number, month: number): number {
  const next = month === 12 ? islamicToJDN(year + 1, 1, 1) : islamicToJDN(year, month + 1, 1);
  return next - islamicToJDN(year, month, 1);
}

/** The civil day a Hijri date falls on, with the user's offset UNDONE — the inverse of
 *  {@link toHijri}, so a day picked in the month sheet maps back to the same civil day the
 *  dock would have labelled with it. */
export function hijriToGregorian(h: HijriDate, offsetDays = 0): GregorianDate {
  return jdnToGregorian(islamicToJDN(h.year, h.month, h.day) - offsetDays);
}

/** The Hijri month `delta` months away, rolling the year over. Months are 1-based and years
 *  are not, which is the whole reason this is a function: the −1/+1 shuffle around the
 *  boundary is easy to get subtly wrong inline, and a month sheet that lands on month 0 or
 *  month 13 asks the calendar for a month that does not exist. Counted rather than walked, so
 *  stepping a year costs the same as stepping a month. */
export function addHijriMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const months = year * 12 + (month - 1) + delta;
  return { year: Math.floor(months / 12), month: (months % 12) + 1 };
}

// Transliterated month names in the same academic style as PRAYER_LABELS
// (DIN 31635 / ALA-LC): ʿ for ʿayn, macrons for long vowels, subdots on
// emphatic consonants. So the Hijri date line under the Förhandsvisning
// headline and the prayer names in the rows speak the same Arabic register.
export const HIJRI_MONTHS: readonly string[] = [
  'Muḥarram',
  'Ṣafar',
  'Rabīʿ al-awwal',
  // Classical forms — Rabīʿ (masc.) takes al-ākhir, Jumādā (fem.) al-ūlā /
  // al-ākhira — matching the academic register over the colloquial
  // al-thānī/al-awwal variants common in prayer apps.
  'Rabīʿ al-ākhir',
  'Jumādā al-ūlā',
  'Jumādā al-ākhira',
  'Rajab',
  'Shaʿbān',
  'Ramaḍān',
  'Shawwāl',
  'Dhū al-qaʿda',
  'Dhū al-ḥijja',
];

/** Swedish month names, lower-case as they are written mid-sentence. The two calendar sheets
 *  (map/DayPicker, moon/MoonMonthSheet) both title and caption with these. */
export const SWEDISH_MONTHS: readonly string[] = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

/** e.g. "9 Dhū al-ḥijja 1447". */
export function formatHijri(date: Date, offsetDays = 0): string {
  const h = toHijri(date, offsetDays);
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`;
}

/** Capitalised Swedish weekday + day + month, e.g. "tisdag 26 maj". Companion to the
    Hijri line so the dock can show both calendars side by side. */
// Built once and reused — the dock re-renders this label on every clock tick, so a
// per-call Intl.DateTimeFormat construction was wasted work. Cached null on a runtime
// without full Intl, falling back to toDateString() exactly as before.
// Two cached slots, not one: the dock re-renders this label on every clock tick, so a
// per-call Intl.DateTimeFormat construction was wasted work — and day navigation added a
// SECOND shape (with the year) that must not thrash the first. Each is cached null on a
// runtime without full Intl, falling back to toDateString() exactly as before.
//
// ⚠️ KEYED ON THE ZONE, and that is the whole point of the key. This used to pin
// `timeZone: 'Europe/Stockholm'` with a comment saying it matched "the rest of the app" —
// true until the display zone became the device's (see lib/zone-time). It stopped being
// true silently, and the result is the one defect PrayerDock's own comment promises cannot
// happen: its two date lines disagreeing.
//
// PrayerDock builds the Gregorian line from `dayStart + 12 h` and the Hijri line from
// `zonePrayerDate(dayStart)`. Pin only the first to Stockholm and, for a reader far enough
// west, that midday instant lands on the NEXT Stockholm day: in Honolulu (UTC−10) on
// 15 July, the header reads "torsdag 16 juli" above a Hijri date and six prayer rows that
// are all the 15th. Anywhere at UTC−10 or further west — Hawaii, Midway, Niue, Samoa,
// western Alaska.
const gregorianFmt: { [K in 'bare' | 'withYear']?: { zone: string; fmt: Intl.DateTimeFormat | null } } = {};
function getGregorianFmt(withYear: boolean): Intl.DateTimeFormat | null {
  const slot = withYear ? 'withYear' : 'bare';
  const zone = getDisplayZone();
  const cached = gregorianFmt[slot];
  if (cached?.zone === zone) return cached.fmt;
  let built: Intl.DateTimeFormat | null;
  try {
    built = new Intl.DateTimeFormat('sv-SE', {
      // The reader's own civil day — the same one every prayer row and the Hijri line are
      // computed for. The LOCALE stays sv-SE: this is a Swedish app wherever it is read.
      timeZone: zone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' as const } : {}),
    });
  } catch {
    built = null;
  }
  gregorianFmt[slot] = { zone, fmt: built };
  return built;
}

/** "28 aug." — a date compact enough to sit inside a sentence. Same display zone and same
 *  sv-SE locale as the long form above, and cached the same way: the Moon screen prints
 *  several of these in one readout and rebuilds them whenever its clock rolls. */
let shortFmt: { zone: string; fmt: Intl.DateTimeFormat | null } | undefined;
export function formatShortDate(date: Date): string {
  const zone = getDisplayZone();
  if (shortFmt?.zone !== zone) {
    try {
      shortFmt = {
        zone,
        fmt: new Intl.DateTimeFormat('sv-SE', { timeZone: zone, day: 'numeric', month: 'short' }),
      };
    } catch {
      shortFmt = { zone, fmt: null };
    }
  }
  if (!shortFmt.fmt) return date.toDateString();
  try {
    return shortFmt.fmt.format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * "Tisdag 26 maj" — the dock's date header.
 *
 * @param opts.year Add the year: "Tisdag 26 maj 2027". Off by default, because on today
 * (and its immediate neighbours) the year is noise. The day stepper turns it on once the
 * viewed day is in another year, where "26 maj" alone would be actively misleading.
 */
export function formatGregorian(date: Date, opts: { year?: boolean } = {}): string {
  const fmt = getGregorianFmt(opts.year === true);
  if (!fmt) return date.toDateString();
  try {
    const s = fmt.format(date);
    // Swedish weekdays/months are lowercase; lift just the leading letter so the
    // header reads "Tisdag 26 maj" rather than the bare "tisdag 26 maj".
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return date.toDateString();
  }
}
