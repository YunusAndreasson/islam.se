import { describe, expect, it } from '@jest/globals';

import { angleDelta, formatKm, KAABA, qiblaBearing, qiblaDistanceKm } from './qibla';

describe('qiblaBearing', () => {
  it('points south-east from Sweden (toward Mecca)', () => {
    // Stockholm → ~148° (SE). A Swedish user faces roughly south-east for the qibla;
    // anything pointing north would be a sign the bearing math is inverted.
    const b = qiblaBearing({ latitude: 59.3293, longitude: 18.0686 });
    expect(b).toBeGreaterThan(120);
    expect(b).toBeLessThan(165);
  });
});

describe('qiblaDistanceKm', () => {
  it('is ~0 at the Kaaba itself', () => {
    expect(qiblaDistanceKm(KAABA)).toBeLessThan(1);
  });

  it('matches the known Stockholm→Mecca great-circle distance', () => {
    const d = qiblaDistanceKm({ latitude: 59.3293, longitude: 18.0686 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4800);
  });
});

describe('angleDelta', () => {
  it('is wrap-aware across 0/360', () => {
    expect(angleDelta(359, 1)).toBe(2);
    expect(angleDelta(10, 350)).toBe(20);
  });

  it('is 0 when equal and 180 when opposite', () => {
    expect(angleDelta(90, 90)).toBe(0);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('formatKm', () => {
  it('rounds and groups thousands in Swedish style', () => {
    // sv-SE groups with a (thin/no-break) space, not a comma.
    expect(formatKm(412.4)).toMatch(/^412 km$/);
    expect(formatKm(4102).replace(/\s/g, ' ')).toMatch(/^4 ?102 km$/);
  });
});
