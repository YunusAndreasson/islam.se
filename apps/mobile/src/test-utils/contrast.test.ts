// The oracle has to be right before anything can be measured against it, so this
// checks it against PUBLISHED reference values rather than against our own maths.
import { describe, expect, it } from '@jest/globals';

import { apcaLc, lc, wcagContrast } from './contrast';

describe('wcagContrast', () => {
  it('matches the published anchors', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(wcagContrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // Order must not matter — a ratio is symmetric.
    expect(wcagContrast('#777777', '#ffffff')).toBeCloseTo(wcagContrast('#ffffff', '#777777'), 10);
  });
});

describe('apcaLc', () => {
  // Reference values from the APCA-W3 0.1.9 published test vectors. If these drift the
  // constants have been "cleaned up" and every threshold in the palette tests is void.
  it('matches the APCA-W3 0.1.9 reference vectors', () => {
    expect(apcaLc('#000000', '#ffffff')).toBeCloseTo(106.04, 1);
    expect(apcaLc('#ffffff', '#000000')).toBeCloseTo(-107.88, 1);
    expect(apcaLc('#888888', '#ffffff')).toBeCloseTo(63.06, 1);
    expect(apcaLc('#ffffff', '#888888')).toBeCloseTo(-68.54, 1);
  });

  it('signs by polarity — dark-on-light positive, light-on-dark negative', () => {
    // This is the whole reason APCA is here: swapping text and background is a
    // DIFFERENT measurement, unlike WCAG where the pair is symmetric.
    expect(apcaLc('#1a1712', '#f6f3ed')).toBeGreaterThan(0);
    expect(apcaLc('#e8e3d8', '#161a26')).toBeLessThan(0);
    expect(apcaLc('#000000', '#ffffff')).not.toBeCloseTo(-apcaLc('#ffffff', '#000000'), 1);
  });

  it('reports no contrast for a colour on itself', () => {
    expect(apcaLc('#33437a', '#33437a')).toBe(0);
  });

  it('lc() drops the polarity sign', () => {
    expect(lc('#ffffff', '#000000')).toBeCloseTo(107.88, 1);
    expect(lc('#000000', '#ffffff')).toBeCloseTo(106.04, 1);
  });
});
