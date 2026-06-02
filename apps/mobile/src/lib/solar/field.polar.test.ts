// washAt's polar fallback is the safety net that keeps the map from going black-on-NaN at
// high latitudes, where adhan can't resolve Fajr/Isha (or even sunrise/sunset under the
// midnight sun). field.test.ts checks one polar-ish case; this exhausts the fallback's
// branch logic (every combination of which of the four relevant times is NaN) and then
// drives it through a REAL far-north midsummer grid — the actual user-facing scenario.
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_SETTINGS } from '../settings/types';
import { buildGrid, type PointTimes, washAt } from './field';
import { washStopsLight, type RGBA } from './palette';

const finiteRGBA = (c: RGBA): void => {
  expect(c).toHaveLength(4);
  for (const ch of c) expect(Number.isFinite(ch)).toBe(true);
  expect(c[3]).toBeGreaterThanOrEqual(0);
  expect(c[3]).toBeLessThanOrEqual(1);
};

const BASE = Date.UTC(2026, 5, 21, 0, 0, 0);
const H = 3_600_000;
// A well-ordered point-times template; individual fields get knocked to NaN per case.
const ordered: PointTimes = {
  fajr: BASE + 2 * H,
  sunrise: BASE + 4 * H,
  dhuhr: BASE + 12 * H,
  asr: BASE + 15 * H,
  maghrib: BASE + 21 * H,
  isha: BASE + 23 * H,
  sunset: BASE + 21 * H,
};
// Instants spread across the whole day so every code path in washAt is exercised.
const INSTANTS = [BASE + 1 * H, BASE + 3 * H, BASE + 12 * H, BASE + 21.5 * H, BASE + 23.5 * H];

describe('washAt — never returns NaN for any partial-NaN combination', () => {
  it('returns a finite RGBA (alpha in [0,1]) for all 16 NaN combinations of fajr/sunrise/sunset/isha', () => {
    const keys = ['fajr', 'sunrise', 'sunset', 'isha'] as const;
    for (let mask = 0; mask < 16; mask++) {
      const t: PointTimes = { ...ordered };
      keys.forEach((k, bit) => {
        if (mask & (1 << bit)) t[k] = Number.NaN;
      });
      for (const now of INSTANTS) finiteRGBA(washAt(now, t));
    }
  });

  it('falls back to the white-night / day band (never the deep NIGHT veil) when twilight is unresolved', () => {
    // When Fajr/Isha are NaN but sunrise/sunset are known, the wash must show DAY while the
    // sun is up and the pale WHITE_NIGHT otherwise — never the heavy NIGHT indigo (which
    // would imply a real night the polar point doesn't have).
    const polar: PointTimes = { ...ordered, fajr: Number.NaN, isha: Number.NaN };
    expect(washAt(BASE + 12 * H, polar)).toEqual(washStopsLight.DAY); // midday → day
    expect(washAt(BASE + 2 * H, polar)).toEqual(washStopsLight.WHITE_NIGHT); // pre-dawn → white night
  });
});

describe('washAt — real Kiruna midsummer grid (the actual polar scenario)', () => {
  it('keeps the far-north wash pale and finite all day under midnight sun, never black-on-NaN', () => {
    // 21 Jun above the Arctic Circle (67–68°N): the sun never sets, so adhan returns NaN for
    // sunrise/sunset AND Fajr/Isha under the 'unresolved' resolver the map uses for the grid.
    // The wash must stay WHITE_NIGHT everywhere — pale, finite, alpha well below the NIGHT
    // veil's 0.88 — rather than going black or NaN.
    const settings = { ...DEFAULT_SETTINGS, polarCircleResolution: 'unresolved' as const };
    const grid = buildGrid(new Date(2026, 5, 21, 12, 0, 0), settings, {
      bounds: [20, 67, 22, 68],
      latStep: 0.5,
      lonStep: 0.5,
    });
    let sampled = 0;
    for (const row of grid.pt) {
      for (const t of row) {
        for (const now of INSTANTS) {
          const c = washAt(now, t);
          finiteRGBA(c);
          expect(c[3]).toBeLessThan(0.5); // never the deep NIGHT (0.88) veil
          sampled++;
        }
      }
    }
    expect(sampled).toBeGreaterThan(0); // guard against an empty grid silently passing
  });
});
