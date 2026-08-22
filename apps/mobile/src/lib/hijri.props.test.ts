// Property-based tests for the tabular Hijri arithmetic. hijri.test.ts sweeps 20k days
// from 2000 for the day-0 boundary; this fuzzes an 800-year JDN range where the closed-form
// year estimate (30·(jdn−epoch)+10646)/10631 is most likely to land off-by-one, and pins
// the inverse pair as exact inverses across that whole span.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import {
  gregorianToJDN,
  hijriMonthLength,
  hijriToGregorian,
  islamicToJDN,
  jdnToGregorian,
  jdnToIslamic,
  addHijriMonths,
  toHijri,
} from './hijri';

// JDNs spanning Gregorian years ~1600–2400 — wide enough to exercise many 30-year cycles.
const JDN_MIN = gregorianToJDN(1600, 1, 1);
const JDN_MAX = gregorianToJDN(2400, 1, 1);
const jdn = fc.integer({ min: JDN_MIN, max: JDN_MAX });

describe('jdnToIslamic ⇄ islamicToJDN — exact inverses', () => {
  it('round-trips every JDN in the range', () => {
    fc.assert(
      fc.property(jdn, (n) => {
        const h = jdnToIslamic(n);
        expect(islamicToJDN(h.year, h.month, h.day)).toBe(n);
      }),
    );
  });

  it('always yields a valid month (1–12) and day (1–30)', () => {
    fc.assert(
      fc.property(jdn, (n) => {
        const h = jdnToIslamic(n);
        expect(h.month).toBeGreaterThanOrEqual(1);
        expect(h.month).toBeLessThanOrEqual(12);
        expect(h.day).toBeGreaterThanOrEqual(1);
        expect(h.day).toBeLessThanOrEqual(30);
      }),
    );
  });
});

describe('day advance — one JDN forward is exactly one Hijri day forward', () => {
  it('increments the day, wraps the month, or wraps the year — never skips or repeats', () => {
    fc.assert(
      fc.property(jdn, (n) => {
        const a = jdnToIslamic(n);
        const b = jdnToIslamic(n + 1);
        const sameDay = b.year === a.year && b.month === a.month && b.day === a.day + 1;
        const nextMonth = b.year === a.year && b.month === a.month + 1 && b.day === 1;
        const nextYear = b.year === a.year + 1 && b.month === 1 && b.day === 1;
        expect(sameDay || nextMonth || nextYear).toBe(true);
      }),
    );
  });
});

describe('jdnToGregorian ⇄ gregorianToJDN — exact inverses', () => {
  it('round-trips every JDN in the range', () => {
    // The month sheet is the only surface that walks Hijri → civil, so this inverse is the
    // one direction nothing else in the app exercises. A correlated slip in the two
    // Fliegel–Van Flandern constant sets would be invisible everywhere but here.
    fc.assert(
      fc.property(jdn, (n) => {
        const g = jdnToGregorian(n);
        expect(gregorianToJDN(g.year, g.month, g.day)).toBe(n);
      }),
    );
  });

  it('always yields a valid month and day', () => {
    fc.assert(
      fc.property(jdn, (n) => {
        const g = jdnToGregorian(n);
        expect(g.month).toBeGreaterThanOrEqual(1);
        expect(g.month).toBeLessThanOrEqual(12);
        expect(g.day).toBeGreaterThanOrEqual(1);
        expect(g.day).toBeLessThanOrEqual(31);
      }),
    );
  });
});

describe('hijriMonthLength — the ring can only ever have 29 or 30 notches', () => {
  it('is 29 or 30 for every month of a wide span of years, and sums to the year', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 1700 }), (year) => {
        let total = 0;
        for (let month = 1; month <= 12; month++) {
          const length = hijriMonthLength(year, month);
          expect(length === 29 || length === 30).toBe(true);
          total += length;
        }
        // A tabular Hijri year is 354 days, or 355 in the eleven leap years of the cycle.
        // Rolling the year over by hand in the month-12 branch is the thing this catches:
        // get it wrong and Dhū al-ḥijja is 29 days in a leap year and the total reads 354.
        expect(total).toBe(islamicToJDN(year + 1, 1, 1) - islamicToJDN(year, 1, 1));
        expect(total === 354 || total === 355).toBe(true);
      }),
    );
  });
});

describe('hijriToGregorian ⇄ toHijri — the month sheet lands back on the day the dock labelled', () => {
  it('round-trips through any offset the setting allows', () => {
    fc.assert(
      fc.property(jdn, fc.integer({ min: -2, max: 2 }), (n, offset) => {
        // Start from a civil day, label it as the dock does, then ask the sheet for the
        // civil day of that label. The offset must cancel, or a reader who nudged their
        // Hijri date would find the calendar's own days pointing at the wrong dates.
        const civil = jdnToGregorian(n);
        const h = toHijri(new Date(civil.year, civil.month - 1, civil.day), offset);
        expect(hijriToGregorian(h, offset)).toEqual(civil);
      }),
    );
  });
});

describe('addHijriMonths', () => {
  it('never lands outside 1–12, at any offset in either direction', () => {
    // The failure this guards is a month 0 or a month 13 reaching hijriMonthLength or
    // HIJRI_MONTHS, where it is an out-of-bounds read rather than an error.
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1700 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: -400, max: 400 }),
        (year, month, delta) => {
          const out = addHijriMonths(year, month, delta);
          expect(out.month).toBeGreaterThanOrEqual(1);
          expect(out.month).toBeLessThanOrEqual(12);
        },
      ),
    );
  });

  it('is exactly reversible, and a year of steps is one year', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1700 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: -400, max: 400 }),
        (year, month, delta) => {
          const there = addHijriMonths(year, month, delta);
          expect(addHijriMonths(there.year, there.month, -delta)).toEqual({ year, month });
        },
      ),
    );
    expect(addHijriMonths(1447, 5, 12)).toEqual({ year: 1448, month: 5 });
    expect(addHijriMonths(1447, 5, -12)).toEqual({ year: 1446, month: 5 });
  });

  it('agrees with walking one month at a time across a year boundary', () => {
    // The inline version this replaced walked a loop; the arithmetic must land where the walk
    // would, including at the 12→1 seam where the year has to move with the month.
    expect(addHijriMonths(1447, 12, 1)).toEqual({ year: 1448, month: 1 });
    expect(addHijriMonths(1447, 1, -1)).toEqual({ year: 1446, month: 12 });
  });
});
