import { describe, expect, it } from '@jest/globals';

import { worldSize } from './projection';
import { solarRenderInstant } from './solar-render-clock';

const DAY_START = Date.UTC(2026, 9, 24, 22); // Stockholm's 25-hour autumn day.

describe('the live drawing clock', () => {
  it('keeps solar displacement below 0.05 pixels, including fractional zooms and midnight', () => {
    for (const zoom of [3, 4, 4.37, 5, 6.2, 7, 8, 8.99, 9.04, 10, 14, 22]) {
      for (const elapsed of [0, 1, 17, 245.75, 499, 501, 12_345, 43_200_123, 89_999_999]) {
        const now = DAY_START + elapsed;
        const drawn = solarRenderInstant(now, DAY_START, zoom, false);
        expect(drawn).toBeGreaterThanOrEqual(DAY_START);
        expect(drawn).toBeLessThanOrEqual(now);
        expect(now - drawn).toBeLessThanOrEqual(500);
        expect((now - drawn) * worldSize(zoom) / 86_400_000).toBeLessThanOrEqual(0.050001);
      }
    }
  });

  it('reuses the same primitive between overview samples', () => {
    const now = DAY_START + 1_001;
    expect(solarRenderInstant(now + 16, DAY_START, 4, false))
      .toBe(solarRenderInstant(now, DAY_START, 4, false));
    expect(solarRenderInstant(now + 500, DAY_START, 4, false))
      .toBeGreaterThan(solarRenderInstant(now, DAY_START, 4, false));
  });

  it('preserves the exact instant during scrubbing and at city zoom', () => {
    const now = DAY_START + 12_345.67;
    expect(solarRenderInstant(now, DAY_START, 4, true)).toBe(now);
    expect(solarRenderInstant(now, DAY_START, 14, false)).toBe(now);
  });
});
