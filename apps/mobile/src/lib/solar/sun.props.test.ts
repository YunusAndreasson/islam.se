// Property-based tests for the solar geometry. sun.test.ts checks a few fixed points and
// sun.anchors.test.ts pins the series to ephemeris values; these fuzz the whole field so a
// monotonicity break in the darkness ramp, or a sign error in the hour-angle / longitude
// term, surfaces anywhere — not just at the chosen latitudes.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { darknessFromAltitude, sunAltitudeDeg } from './sun';

describe('darknessFromAltitude — bounded, monotone', () => {
  const alt = fc.double({ min: -40, max: 40, noNaN: true });

  it('always stays within [0, 1]', () => {
    fc.assert(
      fc.property(alt, (a) => {
        const d = darknessFromAltitude(a);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('is non-increasing in altitude (a higher sun is never darker)', () => {
    fc.assert(
      fc.property(alt, alt, (x, y) => {
        const hi = Math.max(x, y);
        const lo = Math.min(x, y);
        expect(darknessFromAltitude(hi)).toBeLessThanOrEqual(darknessFromAltitude(lo) + 1e-12);
      }),
    );
  });

  it('is zero whenever the sun is at or above the horizon', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 90, noNaN: true }), (a) => {
        expect(darknessFromAltitude(a)).toBe(0);
      }),
    );
  });
});

describe('sunAltitudeDeg — physical bounds and longitude–time equivalence', () => {
  const lat = fc.double({ min: -60, max: 60, noNaN: true });
  const lon = fc.double({ min: -150, max: 150, noNaN: true });
  // An arbitrary instant in 2026, as a UTC minute-of-year offset from Jan 1.
  const minuteOfYear = fc.integer({ min: 0, max: 365 * 24 * 60 - 1 });
  const dateFrom = (m: number): Date => new Date(Date.UTC(2026, 0, 1, 0, m, 0));

  it('returns a finite altitude within [-90, 90]', () => {
    fc.assert(
      fc.property(lat, lon, minuteOfYear, (la, lo, m) => {
        const alt = sunAltitudeDeg(la, lo, dateFrom(m));
        expect(Number.isFinite(alt)).toBe(true);
        expect(alt).toBeGreaterThanOrEqual(-90);
        expect(alt).toBeLessThanOrEqual(90);
      }),
    );
  });

  it('is invariant when a longitude shift is cancelled by an equal solar-time shift', () => {
    // The sun's altitude depends on longitude and time only through the true-solar-time term
    // `utcMin + eot + 4·lon`. Shifting +Δlon east (adds 4·Δlon min) while moving the clock
    // 4·Δlon min earlier leaves that term — and so the altitude — unchanged, modulo the tiny
    // declination/EoT drift over the shift. A sign error in the 4·lon or hour-angle term
    // would break this by many degrees; the 0.6° tolerance only absorbs the drift.
    const dLon = fc.double({ min: -30, max: 30, noNaN: true });
    fc.assert(
      fc.property(lat, lon, minuteOfYear, dLon, (la, lo, m, d) => {
        const base = dateFrom(m);
        const shifted = new Date(base.getTime() - d * 4 * 60_000); // 4 min per ° east, earlier
        const a1 = sunAltitudeDeg(la, lo, base);
        const a2 = sunAltitudeDeg(la, lo + d, shifted);
        expect(Math.abs(a1 - a2)).toBeLessThan(0.6);
      }),
    );
  });
});
