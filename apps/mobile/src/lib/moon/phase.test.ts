// The phase bands. What makes this worth testing is not the arithmetic but the WORD: the
// almanac's four names belong to instants, and a band that quietly widens is how "nymåne"
// ends up printed over a five-day-old crescent.
import { describe, expect, it } from '@jest/globals';

import { formatIllumination, formatMoonAge, PHASE_NAMES, PHASE_ORDER, phaseKey } from './phase';

describe('phaseKey — the four named instants stay narrow', () => {
  it('names the quarters only within about half a day of the exact angle', () => {
    expect(phaseKey(0)).toBe('new');
    expect(phaseKey(90)).toBe('firstQuarter');
    expect(phaseKey(180)).toBe('full');
    expect(phaseKey(270)).toBe('lastQuarter');
    // 7.5° of phase angle is a little over 15 hours. One degree past that and the name has
    // to give way to the descriptive band, or the app is calling a crescent a new moon.
    expect(phaseKey(8)).toBe('waxingCrescent');
    expect(phaseKey(82)).toBe('waxingCrescent');
    expect(phaseKey(98)).toBe('waxingGibbous');
    expect(phaseKey(353)).toBe('new');
    expect(phaseKey(352)).toBe('waningCrescent');
  });

  it('separates waxing from waning at full and at new', () => {
    expect(phaseKey(120)).toBe('waxingGibbous');
    expect(phaseKey(240)).toBe('waningGibbous');
    expect(phaseKey(40)).toBe('waxingCrescent');
    expect(phaseKey(320)).toBe('waningCrescent');
  });

  it('normalises angles outside 0–360 rather than falling off the end', () => {
    // The phase angle arrives from an ephemeris, and a caller that has added or subtracted a
    // lunation should get the same band, not `undefined` reaching PHASE_NAMES as a key.
    expect(phaseKey(360)).toBe('new');
    expect(phaseKey(-5)).toBe('new');
    expect(phaseKey(450)).toBe('firstQuarter');
  });

  it('names every band it can return', () => {
    for (const key of PHASE_ORDER) expect(PHASE_NAMES[key]).toBeTruthy();
    for (let a = 0; a < 360; a += 0.5) {
      expect(PHASE_ORDER).toContain(phaseKey(a));
    }
  });
});

describe('the readout formats', () => {
  it('renders the illuminated fraction as whole per cent, with a non-breaking space', () => {
    // The NBSP is the point: Swedish typography binds a number to its unit, and a plain
    // space lets "62" and "%" land on different lines in a narrow readout.
    expect(formatIllumination(0.6205)).toBe('62 %');
    expect(formatIllumination(0)).toBe('0 %');
    expect(formatIllumination(1)).toBe('100 %');
  });

  it('clamps a fraction that arrives outside 0–1 instead of printing 104 %', () => {
    expect(formatIllumination(1.04)).toBe('100 %');
    expect(formatIllumination(-0.02)).toBe('0 %');
  });

  it('floors the Moon age, because a moon in its tenth day is nine days old', () => {
    expect(formatMoonAge(9.8)).toBe('9 dygn');
    expect(formatMoonAge(0.2)).toBe('0 dygn');
    expect(formatMoonAge(-0.4)).toBe('0 dygn');
  });
});
