import { describe, expect, it } from '@jest/globals';

import { visibleLineRange } from './visible-line';

describe('visibleLineRange', () => {
  it('starts at the viewport entry even when both endpoints are outside', () => {
    expect(visibleLineRange([[-100, 50, 300, 50]], 100, 100)).toEqual({ start: 0.25, end: 0.5 });
    expect(visibleLineRange([[50, 300, 50, -100]], 100, 100)).toEqual({ start: 0.5, end: 0.75 });
  });

  it('clips a diagonal against both axes', () => {
    const range = visibleLineRange([[-100, -100, 200, 200]], 100, 100)!;
    expect(range.start).toBeCloseTo(1 / 3);
    expect(range.end).toBeCloseTo(2 / 3);
  });

  it('returns the full range for a visible path including repeated points', () => {
    expect(visibleLineRange([[0, 0, 0, 0, 50, 50, 100, 100]], 100, 100)).toEqual({ start: 0, end: 1 });
  });

  it('counts offscreen path length but does not count moveTo gaps', () => {
    expect(visibleLineRange([[-100, -100, -100, 0], [0, 50, 100, 50]], 100, 100)).toEqual({
      start: 0.5,
      end: 1,
    });
  });

  it('retains the complete envelope when the path exits and reenters', () => {
    expect(visibleLineRange([[-100, 50, 200, 50, -100, 50]], 100, 100)).toEqual({
      start: 1 / 6,
      end: 5 / 6,
    });
  });

  it('includes lines on the viewport boundary but excludes a tangent point', () => {
    expect(visibleLineRange([[-100, 0, 200, 0]], 100, 100)).toEqual({ start: 1 / 3, end: 2 / 3 });
    expect(visibleLineRange([[-100, 100, 100, -100]], 100, 100)).toBeNull();
  });

  it.each([
    [],
    [[]],
    [[50, 50]],
    [[50, 50, 50, 50]],
    [[-100, -1, 200, -1]],
    [[101, -100, 101, 200]],
    [[-100, 50, -50, 50]],
    [[50, 50, NaN, 50]],
    [[Infinity, 50]],
    [[0, 0, 50]],
  ])('returns null for empty, invisible or invalid geometry (%j)', (...polylines) => {
    expect(visibleLineRange(polylines, 100, 100)).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid viewport dimensions (%s)', (size) => {
    expect(visibleLineRange([[0, 0, 100, 100]], size, 100)).toBeNull();
    expect(visibleLineRange([[0, 0, 100, 100]], 100, size)).toBeNull();
  });
});
