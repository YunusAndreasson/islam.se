import { afterEach, describe, expect, it } from '@jest/globals';

import { formatGregorian, formatHijri, HIJRI_MONTHS, toHijri } from './hijri';
import { DEFAULT_ZONE, setDisplayZone, startOfZoneDay, zonePrayerDate } from './zone-time';

// The tabular Islamic calendar is deterministic; these anchors pin it to the civil
// calendar most Swedish mosques fall back on. It can sit ±1 day from a local
// moon-sighting — that gap is exactly what the user's `hijriOffset` closes — so we
// assert known new-moon civil dates (which match Umm al-Qura exactly here) and the
// structural invariants, not a sighting we can't predict.
describe('toHijri', () => {
  it('maps known civil new-month dates to day 1', () => {
    // 1 Muharram 1444 AH (Islamic new year) fell on 30 Jul 2022 (Umm al-Qura).
    expect(toHijri(new Date(2022, 6, 30))).toEqual({ year: 1444, month: 1, day: 1 });
    // 1 Ramadan 1444 AH fell on 23 Mar 2023.
    expect(toHijri(new Date(2023, 2, 23))).toEqual({ year: 1444, month: 9, day: 1 });
  });

  it('applies the day offset by shifting the underlying day count', () => {
    const base = new Date(2026, 4, 26);
    const plus = toHijri(base, 1);
    const zero = toHijri(base, 0);
    // +1 offset advances exactly one Hijri day.
    expect(plus.day).toBe(zero.day + 1);
  });

  it('always yields a valid day (1–30) and month (1–12) — no boundary day 0', () => {
    // A naive ÷29.5 month estimate produces day 0 at some month starts; this guards
    // the regression. Sweep a long span so every month boundary is exercised.
    for (let t = 0; t < 20000; t++) {
      const d = new Date(2000, 0, 1 + t);
      const h = toHijri(d);
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(30);
      expect(h.month).toBeGreaterThanOrEqual(1);
      expect(h.month).toBeLessThanOrEqual(12);
    }
  });

  it('advances monotonically across day boundaries', () => {
    const a = toHijri(new Date(2026, 4, 26));
    const b = toHijri(new Date(2026, 4, 27));
    // Consecutive civil days are consecutive Hijri days (either day+1, or wrap to a
    // new month's day 1).
    expect(b.day === a.day + 1 || b.day === 1).toBe(true);
  });
});

describe('formatHijri', () => {
  it('renders "<day> <month> <year>" with a transliterated month name', () => {
    expect(formatHijri(new Date(2022, 6, 30))).toBe(`1 ${HIJRI_MONTHS[0]} 1444`);
    expect(HIJRI_MONTHS).toHaveLength(12);
  });
});

// ── The Gregorian line follows the display zone ──────────────────────────────────────────
//
// PrayerDock stacks two date lines: a Gregorian one built from the middle of the day, and a
// Hijri one built from `zonePrayerDate(dayStart)`. Its comment promises they always name the
// same day. That held only while both were pinned to Stockholm; once the display zone became
// the device's (lib/zone-time), a Gregorian formatter still hardcoded to Europe/Stockholm
// put them a day apart for readers far enough west, with the header naming tomorrow above
// six prayer rows naming today.
describe('formatGregorian and the display zone', () => {
  afterEach(() => setDisplayZone(DEFAULT_ZONE));

  it('names the reader’s own day, not Stockholm’s', () => {
    // Honolulu is UTC−10; Stockholm in July is UTC+2. Midday on the 15th in Honolulu is
    // already the small hours of the 16th in Stockholm — a twelve-hour gap, which is why
    // the old pin survived every test written from a Swedish desk.
    setDisplayZone('Pacific/Honolulu');
    const dayStart = startOfZoneDay(Date.UTC(2026, 6, 15, 22));
    const midday = new Date(dayStart + 12 * 3_600_000);

    expect(formatGregorian(midday)).toContain('15 juli');
  });

  it('agrees with the Hijri line it is stacked on, in any zone', () => {
    // The invariant PrayerDock's comment actually claims. Asserted as agreement between the
    // two lines rather than against a literal date, because that is the thing a reader sees
    // break — and it stays true if either formatter is reshaped.
    for (const zone of ['Pacific/Honolulu', 'Pacific/Auckland', 'Asia/Riyadh', DEFAULT_ZONE]) {
      setDisplayZone(zone);
      const dayStart = startOfZoneDay(Date.UTC(2026, 6, 15, 22));
      const gregorianDay = Number(formatGregorian(new Date(dayStart + 12 * 3_600_000)).match(/\d+/)?.[0]);
      const hijriDay = toHijri(zonePrayerDate(dayStart)).day;
      // Both are day-of-month in their own calendars; what must match is that they were
      // derived from the SAME civil day, so re-deriving the Hijri day from the Gregorian
      // one lands on the same value.
      const fromGregorian = toHijri(new Date(2026, 6, gregorianDay, 12)).day;
      expect(fromGregorian).toBe(hijriDay);
    }
  });
});
