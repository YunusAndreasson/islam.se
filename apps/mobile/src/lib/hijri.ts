// Hijri (Islamic) date for display. The app already stores a `hijriOffset` setting
// but never rendered a date — this fills that gap. We use the arithmetic *tabular*
// Islamic calendar (the deterministic civil calendar, 30-year cycle), which is what
// the offset is for: tabular dates can sit ±1 day from a local moon-sighting or the
// Umm al-Qura announcement, so the user nudges `hijriOffset` to match their mosque.
// Kept UI-free and pure so it's trivially testable and any screen can call it.

export interface HijriDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–30. */
  day: number;
}

// 1 Muharram AH 1 in the civil tabular variant = JDN 1948440 (Friday epoch).
const ISLAMIC_EPOCH = 1948440;

/** Gregorian (proleptic Gregorian) calendar date → Julian Day Number (integer, noon). */
function gregorianToJDN(year: number, month: number, day: number): number {
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
function islamicToJDN(year: number, month: number, day: number): number {
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
function jdnToIslamic(jdn: number): HijriDate {
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

// Transliterated month names in the same academic style as PRAYER_LABELS
// (DIN 31635 / ALA-LC): ʿ for ʿayn, macrons for long vowels, subdots on
// emphatic consonants. So the Hijri date line under the Förhandsvisning
// headline and the prayer names in the rows speak the same Arabic register.
export const HIJRI_MONTHS: readonly string[] = [
  'Muḥarram',
  'Ṣafar',
  'Rabīʿ al-awwal',
  'Rabīʿ al-thānī',
  'Jumādā al-awwal',
  'Jumādā al-thānī',
  'Rajab',
  'Shaʿbān',
  'Ramaḍān',
  'Shawwāl',
  'Dhū al-qaʿda',
  'Dhū al-ḥijja',
];

/** e.g. "9 Dhul-hijja 1447". */
export function formatHijri(date: Date, offsetDays = 0): string {
  const h = toHijri(date, offsetDays);
  return `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}`;
}

/** Capitalised Swedish weekday + day + month, e.g. "tisdag 26 maj". Companion to the
    Hijri line so the dock can show both calendars side by side. */
export function formatGregorian(date: Date): string {
  try {
    const s = new Intl.DateTimeFormat('sv-SE', {
      // Pin to Swedish civil time like the rest of the app, so the dock's weekday/day
      // can't roll to the wrong calendar day near midnight on a device in another zone.
      timeZone: 'Europe/Stockholm',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
    // Swedish weekdays/months are lowercase; lift just the leading letter so the
    // header reads "Tisdag 26 maj" rather than the bare "tisdag 26 maj".
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return date.toDateString();
  }
}
