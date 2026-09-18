// The speck curves are read by MapLibre (as a style expression) and by the Skia wash (as a
// worklet) — these pin that the two readings are the same curve.
import { describe, expect, it } from '@jest/globals';

import { atZoom, DUST_PRESENCE_STOPS, DUST_RADIUS_STOPS, zoomExpression } from './dust';

describe('atZoom', () => {
  it('clamps at both ends, as MapLibre does', () => {
    expect(atZoom(DUST_RADIUS_STOPS, 2)).toBe(1.2);
    expect(atZoom(DUST_RADIUS_STOPS, 14)).toBe(2.6);
  });

  it('hits every stop exactly and interpolates linearly between them', () => {
    for (const [z, v] of DUST_PRESENCE_STOPS) expect(atZoom(DUST_PRESENCE_STOPS, z)).toBe(v);
    expect(atZoom(DUST_RADIUS_STOPS, 5)).toBeCloseTo(1.45, 12);
    expect(atZoom(DUST_PRESENCE_STOPS, 3.7)).toBeCloseTo(0.5, 12);
  });

  it('says the specks are gone once the glyphs have taken over', () => {
    // The wash stops clearing holes here; a hole past this point would be an empty patch.
    expect(atZoom(DUST_PRESENCE_STOPS, 7.8)).toBe(0);
    expect(atZoom(DUST_PRESENCE_STOPS, 10)).toBe(0);
  });
});

describe('zoomExpression', () => {
  it('is the same curve, scaled, in MapLibre’s interpolate form', () => {
    expect(zoomExpression(DUST_PRESENCE_STOPS, 0.5)).toEqual([
      'interpolate', ['linear'], ['zoom'], 3.4, 0, 4, 0.5, 6.4, 0.5, 7.8, 0,
    ]);
    expect(zoomExpression(DUST_RADIUS_STOPS)).toEqual([
      'interpolate', ['linear'], ['zoom'], 4, 1.2, 6, 1.7, 8, 2.6,
    ]);
  });
});
