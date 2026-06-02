// Property-based tests for the tabular Hijri arithmetic. hijri.test.ts sweeps 20k days
// from 2000 for the day-0 boundary; this fuzzes an 800-year JDN range where the closed-form
// year estimate (30·(jdn−epoch)+10646)/10631 is most likely to land off-by-one, and pins
// the inverse pair as exact inverses across that whole span.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { gregorianToJDN, islamicToJDN, jdnToIslamic } from './hijri';

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
