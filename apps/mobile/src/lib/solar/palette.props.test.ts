// Property-based tests for colour blending. palette.test.ts pins fixed pairs; these fuzz
// the whole RGBA space so an off-by-one rounding or a channel mix-up in `mix` can't hide
// between the chosen colours.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { mix, type RGBA } from './palette';

const channel = fc.integer({ min: 0, max: 255 });
const alpha = fc.double({ min: 0, max: 1, noNaN: true });
const rgba = fc.tuple(channel, channel, channel, alpha) as fc.Arbitrary<RGBA>;
const t = fc.double({ min: 0, max: 1, noNaN: true });

describe('mix — blend invariants', () => {
  it('returns the endpoints exactly at t=0 and t=1', () => {
    fc.assert(
      fc.property(rgba, rgba, (a, b) => {
        const at0 = mix(a, b, 0);
        expect([at0[0], at0[1], at0[2]]).toEqual([a[0], a[1], a[2]]);
        expect(at0[3]).toBeCloseTo(a[3], 12);
        const at1 = mix(a, b, 1);
        expect([at1[0], at1[1], at1[2]]).toEqual([b[0], b[1], b[2]]);
        expect(at1[3]).toBeCloseTo(b[3], 12);
      }),
    );
  });

  it('keeps every RGB channel within the endpoints and the alpha an exact lerp', () => {
    fc.assert(
      fc.property(rgba, rgba, t, (a, b, k) => {
        const m = mix(a, b, k);
        for (let i = 0; i < 3; i++) {
          const lo = Math.min(a[i], b[i]);
          const hi = Math.max(a[i], b[i]);
          expect(m[i]).toBeGreaterThanOrEqual(lo);
          expect(m[i]).toBeLessThanOrEqual(hi);
          expect(Number.isInteger(m[i])).toBe(true); // RGB channels stay integers
        }
        // Alpha is NOT rounded — it must be the exact linear interpolation.
        expect(m[3]).toBeCloseTo(a[3] + (b[3] - a[3]) * k, 12);
      }),
    );
  });
});
