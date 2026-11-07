// The indexed contour against the plain one. buildLines draws every prayer line through
// contourAt, which visits only the cells that can carry a line at this instant; the
// reference fills the whole field and walks every cell. They must return the SAME segments
// in the SAME order — chaining, smoothing and the pill's placement all read that order.
//
// THE RISK THIS PINS: an index that misses a cell drops a piece of a prayer line with no
// error anywhere (a gap, or a pill on the wrong stretch). Wrap-around instants are where
// that would hide: just after midnight, and longitudes whose calendar date is not the
// lattice's, where a cell's corners sit on different days.
import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { PRAYER_ORDER } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { buildGrid, contourAt, contourByFullScan, type SolarGrid } from './field';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Built once per suite: the default (graded) lattice on three telling dates, and a coarse
// eastern lattice whose local dates run a day ahead of its UTC one.
const GRIDS: { name: string; grid: SolarGrid; day: number }[] = [
  { name: 'midsummer', day: Date.UTC(2026, 5, 21) },
  { name: 'midwinter', day: Date.UTC(2026, 11, 21) },
  { name: 'equinox', day: Date.UTC(2026, 2, 20) },
].map(({ name, day }) => ({ name, day, grid: buildGrid(new Date(day + 12 * HOUR), DEFAULT_SETTINGS) }));
GRIDS.push({
  name: 'far east',
  day: Date.UTC(2026, 9, 1),
  grid: buildGrid(new Date(Date.UTC(2026, 9, 1, 12)), DEFAULT_SETTINGS, {
    bounds: [100, 20, 179, 66],
    latStep: 3,
    lonStep: 3,
  }),
});

describe('contourAt', () => {
  for (const { name, grid, day } of GRIDS) {
    it(`returns the full scan's segments, in order, at any instant (${name})`, () => {
      fc.assert(
        fc.property(
          // The viewed day and a few hours either side: past midnight both ways.
          fc.double({ min: day - 3 * HOUR, max: day + DAY + 3 * HOUR, noNaN: true }),
          fc.constantFrom(...PRAYER_ORDER),
          (now, prayer) => {
            expect(contourAt(grid, prayer, now)).toEqual(contourByFullScan(grid, prayer, now));
          },
        ),
        { numRuns: 60 },
      );
    });
  }

  it('draws the lines it should: a real day has crossings for every prayer', () => {
    // Guards the property above from passing vacuously on empty output.
    const { grid, day } = GRIDS[2]!;
    for (const prayer of PRAYER_ORDER) {
      const seen = Array.from({ length: 48 }, (_, k) => contourAt(grid, prayer, day + k * 0.5 * HOUR).length);
      expect(Math.max(...seen)).toBeGreaterThan(0);
    }
  });
});
