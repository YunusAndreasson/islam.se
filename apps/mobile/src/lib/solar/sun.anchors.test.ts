// External-reference anchors for the NOAA solar series. sun.test.ts checks only
// QUALITATIVE properties (declination sign at the solstices, a depression range over
// Sweden) — which a coefficient typo can satisfy while still being degrees off, and which
// never touch the equation of time AT ALL. Yet `eotMin` drives the true-solar-time term
// (`tst = utcMin + eotMin + 4·lon`) in sunAltitudeDeg and the wash shader, so a dropped or
// sign-flipped EoT term skews every twilight line's east–west position by up to ~16 min of
// longitude — completely uncaught today.
//
// These anchors pin declination AND the equation of time at the four cardinal dates against
// published astronomy. The expected values come from standard ephemerides, independent of
// this code. Tolerances are wide enough for the NOAA low-precision algorithm (and for
// evaluating at UTC noon rather than the exact event instant) but far tighter than the
// multi-minute / multi-degree shift a missing or sign-flipped term would produce.
import { describe, expect, it } from '@jest/globals';

import { solarParams } from './sun';

const DEG = 180 / Math.PI;
const declDeg = (date: Date): number => solarParams(date).declRad * DEG;
const eot = (date: Date): number => solarParams(date).eotMin;

// Earth's obliquity (~23.44°) is the declination magnitude at the solstices.
const OBLIQUITY = 23.44;

describe('solar declination — at the 2026 cardinal dates', () => {
  it('is ≈0° at both equinoxes', () => {
    expect(declDeg(new Date(Date.UTC(2026, 2, 20, 12)))).toBeCloseTo(0, 0); // ±0.5°
    expect(Math.abs(declDeg(new Date(Date.UTC(2026, 2, 20, 12))))).toBeLessThan(0.6);
    expect(Math.abs(declDeg(new Date(Date.UTC(2026, 8, 23, 12))))).toBeLessThan(0.6);
  });

  it('reaches +obliquity at the June solstice and −obliquity at the December solstice', () => {
    expect(declDeg(new Date(Date.UTC(2026, 5, 21, 12)))).toBeCloseTo(OBLIQUITY, 0);
    expect(declDeg(new Date(Date.UTC(2026, 11, 21, 12)))).toBeCloseTo(-OBLIQUITY, 0);
    // Tighter magnitude bound — declination changes slowly at the solstice, so noon is
    // within a few hundredths of a degree of the true extremum.
    expect(declDeg(new Date(Date.UTC(2026, 5, 21, 12)))).toBeGreaterThan(OBLIQUITY - 0.3);
    expect(declDeg(new Date(Date.UTC(2026, 11, 21, 12)))).toBeLessThan(-(OBLIQUITY - 0.3));
  });
});

describe('equation of time — sign AND magnitude at the cardinal dates', () => {
  // Central values are precise ephemeris EoT (apparent − mean solar time) — the convention
  // this code uses (eotMin is ADDED to mean time to get true solar time). TOL accommodates
  // the NOAA/Spencer low-precision series' ~0.3 min inherent error plus a little headroom on
  // the published value, while staying far under the 3–16 min shift a dropped or sign-flipped
  // term produces. Each case also asserts the SIGN independently, since a flip is the most
  // likely series bug and the cleanest thing to pin.
  const TOL = 1.2;
  const cases: { label: string; date: Date; central: number; sign: -1 | 1 }[] = [
    { label: '20 Mar (≈ −7.9 min)', date: new Date(Date.UTC(2026, 2, 20, 12)), central: -7.9, sign: -1 },
    { label: '21 Jun (≈ −1.6 min)', date: new Date(Date.UTC(2026, 5, 21, 12)), central: -1.6, sign: -1 },
    { label: '23 Sep (≈ +7.5 min)', date: new Date(Date.UTC(2026, 8, 23, 12)), central: 7.5, sign: 1 },
    { label: '21 Dec (≈ +2.0 min)', date: new Date(Date.UTC(2026, 11, 21, 12)), central: 2.0, sign: 1 },
  ];
  for (const { label, date, central, sign } of cases) {
    it(label, () => {
      const value = eot(date);
      if (sign < 0) expect(value).toBeLessThan(0);
      else expect(value).toBeGreaterThan(0);
      expect(Math.abs(value - central)).toBeLessThan(TOL);
    });
  }

  it('hits the annual extremes near 11 Feb (≈ −14.2 min) and 3 Nov (≈ +16.4 min)', () => {
    // The two turning points of the curve — the strongest test of the cos/sin 2g amplitude
    // terms. A wrong amplitude flattens or inflates these well beyond tolerance.
    expect(Math.abs(eot(new Date(Date.UTC(2026, 1, 11, 12))) - -14.2)).toBeLessThan(TOL);
    expect(Math.abs(eot(new Date(Date.UTC(2026, 10, 3, 12))) - 16.4)).toBeLessThan(TOL);
  });
});
