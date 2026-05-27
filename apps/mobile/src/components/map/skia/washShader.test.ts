// The wash shader reads its per-point times from this texture, so the encoding is the
// contract between CPU and GPU. These tests pin it: times land in the right channel at
// the right fraction-of-day, an unresolved (NaN) time becomes the 0 sentinel, and a
// real time NEVER collides with that sentinel (so the shader's polar branch only fires
// for genuinely-missing times).
import { describe, expect, it } from '@jest/globals';

import type { SolarGrid } from '../../../lib/solar/field';
import { encodeFieldTexture } from './washShader';

const DAY_MS = 86_400_000;
const DAY_START = 1_700_000_000_000; // arbitrary epoch midnight reference

// Build a grid whose [latIdx][lonIdx] times are given as fraction-of-day (or null=NaN).
function gridFromFractions(rows: (number | null)[][][]): SolarGrid {
  const lats = rows.map((_, i) => 50 + i);
  const lons = rows[0].map((_, j) => 10 + j);
  const f = (x: number | null) => (x === null ? Number.NaN : DAY_START + x * DAY_MS);
  const pt = rows.map((row) =>
    row.map(([fajr, sunrise, sunset, isha]) => ({
      fajr: f(fajr),
      sunrise: f(sunrise),
      dhuhr: f(0.5),
      asr: f(0.6),
      sunset: f(sunset),
      maghrib: f(sunset),
      isha: f(isha),
    })),
  );
  return { lats, lons, pt };
}

describe('encodeFieldTexture', () => {
  it('packs fajr/sunrise/sunset/isha into R/G/B/A at the right fraction-of-day', () => {
    const grid = gridFromFractions([[[0.2, 0.3, 0.8, 0.9]]]);
    const { data, width, height } = encodeFieldTexture(grid, DAY_START, DAY_MS);
    expect(width).toBe(1);
    expect(height).toBe(1);
    expect(data[0]).toBe(Math.round(0.2 * 255)); // fajr → R
    expect(data[1]).toBe(Math.round(0.3 * 255)); // sunrise → G
    expect(data[2]).toBe(Math.round(0.8 * 255)); // sunset → B
    expect(data[3]).toBe(Math.round(0.9 * 255)); // isha → A
  });

  it('marks an unresolved (NaN) time as the 0 sentinel', () => {
    const grid = gridFromFractions([[[null, 0.3, 0.8, null]]]);
    const { data } = encodeFieldTexture(grid, DAY_START, DAY_MS);
    expect(data[0]).toBe(0); // fajr NaN → 0
    expect(data[3]).toBe(0); // isha NaN → 0
    expect(data[1]).toBeGreaterThan(0); // sunrise still valid
  });

  it('never lets a real time read as the 0 sentinel (a midnight time → byte 1)', () => {
    const grid = gridFromFractions([[[0, 0.3, 0.8, 0.99]]]); // fajr exactly at day start
    const { data } = encodeFieldTexture(grid, DAY_START, DAY_MS);
    expect(data[0]).toBe(1); // nudged off 0 so it isn't mistaken for unresolved
  });

  it('lays out rows south→north (row r = lats[r]) and sizes RGBA correctly', () => {
    const grid = gridFromFractions([
      [
        [0.1, 0.2, 0.7, 0.85],
        [0.1, 0.2, 0.7, 0.85],
      ],
      [
        [0.15, 0.25, 0.75, 0.9],
        [0.15, 0.25, 0.75, 0.9],
      ],
    ]);
    const { data, width, height } = encodeFieldTexture(grid, DAY_START, DAY_MS);
    expect([width, height]).toEqual([2, 2]);
    expect(data.length).toBe(2 * 2 * 4);
    // Row 0 (south, lat 50) carries fajr 0.1; row 1 (north, lat 51) carries fajr 0.15.
    expect(data[0]).toBe(Math.round(0.1 * 255));
    expect(data[(1 * width + 0) * 4]).toBe(Math.round(0.15 * 255));
  });
});
