import { describe, expect, it } from '@jest/globals';
import { scrubGrabOffset } from './scrub-grab';

describe('thumb pickup', () => {
  it.each([-24, -12, 0, 12, 24])('does not jump when grabbed %i dp from its centre', (distance) => {
    const thumb = 180;
    const touch = thumb + distance;
    const offset = scrubGrabOffset(touch, thumb);
    expect(touch + offset).toBe(thumb);
    expect(touch + 10 + offset).toBe(thumb + 10);
  });
  it.each([25, -25, 140, -140])('keeps direct rail selection outside the grab target (%i dp)', (distance) => {
    expect(scrubGrabOffset(180 + distance, 180)).toBe(0);
  });
  it('preserves pickup at either end of the track', () => {
    expect(10 + scrubGrabOffset(10, 0)).toBe(0);
    expect(345 + scrubGrabOffset(345, 355)).toBe(355);
  });
});
