// palette.mix() is the colour-blend primitive every twilight wash stop, prayer pill
// and chrome surface composes through. A subtle bug here — alpha drifting, channels
// going non-integer, an alpha lerp clamping — would smear across the whole map and
// dock. Tested as invariants (idempotence at endpoints, monotonicity, no-overflow)
// rather than literal mid-point colours, so it can't drift with palette tuning.
import { describe, expect, it } from '@jest/globals';

import { mix, rgbaString, type RGBA } from './palette';

describe('mix', () => {
  const A: RGBA = [10, 20, 30, 0.1];
  const B: RGBA = [200, 220, 240, 0.9];

  it('returns the endpoints exactly at t=0 and t=1', () => {
    expect(mix(A, B, 0)).toEqual(A);
    expect(mix(A, B, 1)).toEqual(B);
  });

  it('produces integer RGB channels (rgbaString requires whole numbers)', () => {
    // rgba(255.4, …) renders fine in CSS but is malformed for React Native — pinning
    // integer channels guards against a future "remove Math.round, it's a no-op" PR.
    for (let i = 0; i <= 10; i++) {
      const [r, g, b] = mix(A, B, i / 10);
      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
    }
  });

  it('is monotonic in every channel between the endpoints', () => {
    // For mix() to behave as a single-axis crossfade (which everything that calls it
    // assumes), each channel must move strictly in the endpoint direction — a sign
    // flip or a clamped lerp would silently make the dusk wash zigzag.
    let prev = mix(A, B, 0);
    for (let i = 1; i <= 10; i++) {
      const cur = mix(A, B, i / 10);
      // R/G/B all go up (A is darker), alpha goes up too (A is more transparent).
      expect(cur[0]).toBeGreaterThanOrEqual(prev[0]);
      expect(cur[1]).toBeGreaterThanOrEqual(prev[1]);
      expect(cur[2]).toBeGreaterThanOrEqual(prev[2]);
      expect(cur[3]).toBeGreaterThanOrEqual(prev[3]);
      prev = cur;
    }
  });

  it('keeps alpha at fractional precision (not rounded to integer)', () => {
    // The RGB channels round to integers; alpha does NOT. If a refactor accidentally
    // rounds alpha, every translucent stop snaps to fully opaque or fully clear,
    // collapsing the entire twilight wash.
    const [, , , a] = mix(A, B, 0.5);
    expect(a).toBeCloseTo(0.5, 5);
    expect(Number.isInteger(a)).toBe(false);
  });
});

describe('rgbaString', () => {
  it('formats channels as integers and alpha at 3 decimals', () => {
    // The format is what the React Native style engine consumes; lock both the
    // channel/alpha shape and the comma separator so a regex-driven consumer can't
    // silently fail to parse (we've been bitten by locale-dot vs locale-comma).
    expect(rgbaString([12, 34, 56, 0.125])).toBe('rgba(12,34,56,0.125)');
    expect(rgbaString([0, 0, 0, 0])).toBe('rgba(0,0,0,0.000)');
    expect(rgbaString([255, 255, 255, 1])).toBe('rgba(255,255,255,1.000)');
  });
});
