// The drawn Moon has to show the RIGHT amount of light. The area of the shape this geometry
// describes is computed here from first principles — a half-disc plus or minus a
// half-ellipse — and compared with the fraction that went in. That is an independent
// derivation, not a re-run of the implementation: the module returns an axis and a sweep and
// never mentions area at all.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import {
  crescentGeometry,
  skyReach,
  SKY_REACH_INNER,
  SKY_REACH_OUTER,
  SKY_SCALE_TOP_DEG,
} from './shape';

/** The lit area implied by a geometry, as a fraction of the whole disc. */
function litFraction(radius: number, g: ReturnType<typeof crescentGeometry>): number {
  const disc = Math.PI * radius * radius;
  const halfDisc = disc / 2;
  const halfEllipse = (Math.PI * radius * g.terminatorHalfHeight) / 2;
  // A crescent is the half-disc with the ellipse's top half taken out of it; a gibbous disc
  // is the half-disc with the ellipse's bottom half added on.
  return (g.crescent ? halfDisc - halfEllipse : halfDisc + halfEllipse) / disc;
}

describe('crescentGeometry — the lit area on screen is the lit area in the sky', () => {
  it('reproduces the illuminated fraction it was given, at every fraction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        (f, radius) => {
          expect(litFraction(radius, crescentGeometry(radius, f))).toBeCloseTo(f, 10);
        },
      ),
    );
  });

  it('puts the terminator on the limb at new, on the diameter at half, and mirrored at full', () => {
    expect(crescentGeometry(50, 0).terminatorHalfHeight).toBe(50);
    expect(crescentGeometry(50, 0.5).terminatorHalfHeight).toBe(0);
    expect(crescentGeometry(50, 1).terminatorHalfHeight).toBe(50);
  });

  it('turns the bulge over exactly at half, and not before', () => {
    // The sign of the sweep is what makes a 51 %-lit Moon read as gibbous rather than as a
    // crescent with too much light in it. Flipping it a hair early or late is invisible in
    // any single screenshot and wrong for half the month.
    expect(crescentGeometry(50, 0.49).crescent).toBe(true);
    expect(crescentGeometry(50, 0.5).crescent).toBe(true);
    expect(crescentGeometry(50, 0.51).crescent).toBe(false);
    expect(crescentGeometry(50, 0.49).sweep).toBeLessThan(0);
    expect(crescentGeometry(50, 0.51).sweep).toBeGreaterThan(0);
  });

  it('clamps a fraction that arrives outside 0–1 instead of drawing a moon larger than itself', () => {
    // An illumination of 1.02 would give a terminator axis past the limb and a shape that
    // spills outside the disc. The ephemeris will not produce one; a future caller might.
    expect(crescentGeometry(50, 1.4).terminatorHalfHeight).toBe(50);
    expect(crescentGeometry(50, -0.3).terminatorHalfHeight).toBe(50);
  });
});

describe('skyReach — the altitude cue has to actually move', () => {
  it('separates every altitude a Swedish reader will ever see', () => {
    // THE BUG THIS EXISTS FOR. The first version clamped `1 − altitude/90` into the same
    // output band, which saturates at the outer bound below 40.5° — so a Moon five degrees
    // up, twenty up, forty up and one under the horizon all drew at the same radius, and the
    // whole reason sky mode is more than an arrow was silently dead. At 59°N the Moon clears
    // 40° only around its highest passages, so that is most nights of most months.
    const low = skyReach(5);
    const mid = skyReach(20);
    const high = skyReach(40);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
    expect(low - high).toBeGreaterThan(0.1);
  });

  it('is monotonic, and never leaves the band the dial has room for', () => {
    let previous = Infinity;
    for (let alt = -20; alt <= 90; alt += 0.5) {
      const reach = skyReach(alt);
      expect(reach).toBeLessThanOrEqual(SKY_REACH_OUTER);
      expect(reach).toBeGreaterThanOrEqual(SKY_REACH_INNER);
      expect(reach).toBeLessThanOrEqual(previous);
      previous = reach;
    }
  });

  it('pins the horizon to the outer bound and the top of the scale to the inner one', () => {
    // A Moon below the horizon is still drawn — dimmed, at the rim — so negative altitudes
    // must clamp rather than run off the edge of the dial.
    expect(skyReach(0)).toBe(SKY_REACH_OUTER);
    expect(skyReach(-30)).toBe(SKY_REACH_OUTER);
    expect(skyReach(SKY_SCALE_TOP_DEG)).toBeCloseTo(SKY_REACH_INNER, 10);
    expect(skyReach(89)).toBe(SKY_REACH_INNER);
  });
});
