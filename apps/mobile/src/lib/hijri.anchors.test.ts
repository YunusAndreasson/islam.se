// External-reference anchors for the Hijri arithmetic. hijri.test.ts proves the
// calendar is SELF-consistent (round-trips, valid day/month bounds, monotonicity) — but
// a self-round-trip cannot catch a CORRELATED error: a wrong epoch, or a sign error
// duplicated in islamicToJDN and jdnToIslamic, round-trips perfectly and passes every
// such test while every displayed date is silently off.
//
// These anchors pin the hand-typed magic constants against values that come from OUTSIDE
// the Islamic algorithm:
//   • Julian Day Numbers of famous Gregorian dates (pure calendar/astronomy facts).
//   • The documented civil-epoch JDN (1948440 = 1 Muharram AH 1, Friday epoch).
//   • The documented 30-year tabular cycle length (10631 days) and leap-year set.
//   • A modern Gregorian→tabular-Hijri correspondence verifiable with any standard
//     converter (and cross-checked: tabular 1 Ramaḍān 1420 = 9 Dec 1999, the start of
//     Ramadan that year).
//
// NOTE: these are the *tabular* (arithmetic civil) calendar values. They can sit ±1–2 days
// from a moon-sighting or Umm al-Qura announcement — that gap is exactly what the app's
// `hijriOffset` setting exists to absorb. The anchors pin the deterministic arithmetic,
// not the sighting.
import { describe, expect, it } from '@jest/globals';

import { gregorianToJDN, islamicToJDN, jdnToIslamic, toHijri } from './hijri';

const ISLAMIC_EPOCH_JDN = 1948440;

describe('gregorianToJDN — against famous external Julian Day Numbers', () => {
  it('maps reference Gregorian dates to their documented JDNs', () => {
    // These JDNs are standard astronomy facts, independent of any Islamic arithmetic. A
    // single-digit typo in the Fliegel–van Flandern constants (153, 32045, 4/100/400…)
    // shifts every date and is caught here.
    expect(gregorianToJDN(2000, 1, 1)).toBe(2451545); // J2000.0 noon — the canonical anchor
    expect(gregorianToJDN(1970, 1, 1)).toBe(2440588); // Unix epoch day
    expect(gregorianToJDN(1, 1, 1)).toBe(1721426); // proleptic Gregorian year 1
  });
});

describe('Islamic epoch — the absolute calibration point', () => {
  it('1 Muharram AH 1 sits on the documented civil-epoch JDN, both directions', () => {
    expect(islamicToJDN(1, 1, 1)).toBe(ISLAMIC_EPOCH_JDN);
    expect(jdnToIslamic(ISLAMIC_EPOCH_JDN)).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('ties the Gregorian and Islamic calendars at the epoch (19 Jul 622 proleptic Gregorian)', () => {
    // 1 Muharram AH 1 (civil) = Friday 16 Jul 622 Julian = 19 Jul 622 proleptic Gregorian.
    // This couples the two independent constant sets — a wrong epoch OR a wrong Gregorian
    // constant breaks the equality.
    expect(gregorianToJDN(622, 7, 19)).toBe(ISLAMIC_EPOCH_JDN);
    expect(toHijri(new Date(622, 6, 19))).toEqual({ year: 1, month: 1, day: 1 });
  });
});

describe('30-year tabular cycle — pins the leap arithmetic', () => {
  it('spans exactly 10631 days (19×354 + 11×355)', () => {
    // The defining constant of the tabular calendar. A typo in the year length (354) or the
    // leap term floor((3+11y)/30) would make the cycle ≠ 10631, even while round-trips hold.
    expect(islamicToJDN(31, 1, 1) - islamicToJDN(1, 1, 1)).toBe(10631);
  });

  it('places leap days on the documented year set {2,5,7,10,13,16,18,21,24,26,29}', () => {
    // Each year is 354 (common) or 355 (leap) days. The set of leap years in the cycle is
    // the external signature of this tabular variant (the "Kuwaiti"/Microsoft-Hijri set).
    const leapYears: number[] = [];
    for (let y = 1; y <= 30; y++) {
      const len = islamicToJDN(y + 1, 1, 1) - islamicToJDN(y, 1, 1);
      expect([354, 355]).toContain(len);
      if (len === 355) leapYears.push(y);
    }
    expect(leapYears).toEqual([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);
  });
});

describe('modern Gregorian → tabular-Hijri anchors (via the JDN bridge)', () => {
  // Each expected Hijri triple is the external tabular value; the Gregorian JDN on the left
  // is the external astronomy fact. Asserting jdnToIslamic(externalJDN) === externalHijri
  // means a correlated islamicToJDN/jdnToIslamic error can't hide — the right-hand side
  // never passes through the Gregorian path.
  const anchors: { iso: string; jdn: number; hijri: { year: number; month: number; day: number } }[] = [
    // 2000-01-01: tabular 1 Ramaḍān 1420 = 9 Dec 1999 ⇒ 1 Jan 2000 = 24 Ramaḍān 1420.
    { iso: '2000-01-01', jdn: 2451545, hijri: { year: 1420, month: 9, day: 24 } },
    // 2020-01-01: 5 Jumādā al-ūlā 1441.
    { iso: '2020-01-01', jdn: 2458850, hijri: { year: 1441, month: 5, day: 5 } },
  ];

  for (const { iso, jdn, hijri } of anchors) {
    it(`${iso} ⇒ ${hijri.day}/${hijri.month}/${hijri.year} AH`, () => {
      // The Gregorian date's JDN matches the external constant…
      const [y, m, d] = iso.split('-').map(Number);
      expect(gregorianToJDN(y, m, d)).toBe(jdn);
      // …and that JDN converts to the external tabular Hijri date.
      expect(jdnToIslamic(jdn)).toEqual(hijri);
      // And the full public path agrees end-to-end.
      expect(toHijri(new Date(y, m - 1, d))).toEqual(hijri);
    });
  }
});
