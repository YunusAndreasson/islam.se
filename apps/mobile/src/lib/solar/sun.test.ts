// The wash and the chrome both decide "how dark is it" from these functions, so pin the
// physics to known astronomy. Declination at the solstices/equinox, and — the case that
// motivated the whole solar model — the sun's MAXIMUM depression at Sweden's latitudes in
// late May: Malmö only reaches ~13° below (astronomical twilight, never true night), Kiruna
// barely ~0.7° (white night). If these drift, the night colour is lying about the sky.
import { describe, expect, it } from '@jest/globals';

import { solarParams, sunAltitudeDeg } from './sun';

const DEG = 180 / Math.PI;

// Lowest the sun gets over a whole UTC day at a place (its depression at solar midnight).
function minAltitudeDeg(lat: number, lon: number, y: number, m: number, d: number): number {
  let min = 90;
  for (let minute = 0; minute < 1440; minute += 5) {
    const date = new Date(Date.UTC(y, m, d, 0, 0) + minute * 60_000);
    min = Math.min(min, sunAltitudeDeg(lat, lon, date));
  }
  return min;
}

describe('solarParams', () => {
  it('puts declination at ~+23.44° near the June solstice and ~0° at the equinox', () => {
    const solstice = solarParams(new Date(Date.UTC(2026, 5, 21, 12))).declRad * DEG;
    expect(solstice).toBeGreaterThan(23.0);
    expect(solstice).toBeLessThan(23.6);
    const equinox = solarParams(new Date(Date.UTC(2026, 2, 20, 12))).declRad * DEG;
    expect(Math.abs(equinox)).toBeLessThan(1.5);
  });
});

describe('sunAltitudeDeg — Sweden in late May', () => {
  it('Malmö only sinks to astronomical twilight (~13° down), never true night', () => {
    const min = minAltitudeDeg(55.6, 13.0, 2026, 4, 28);
    // ~ -13°: deep astronomical twilight, but well short of the −18° that means real night.
    expect(min).toBeLessThan(-11);
    expect(min).toBeGreaterThan(-15);
    expect(min).toBeGreaterThan(-18); // the headline: Malmö is NOT dark in late May
  });

  it('Kiruna barely dips below the horizon (white night)', () => {
    const min = minAltitudeDeg(67.85, 20.2, 2026, 4, 28);
    expect(min).toBeGreaterThan(-2);
    expect(min).toBeLessThan(2); // grazes the horizon — essentially perpetual twilight
  });

  it('reaches a sensible noon altitude (sun well up) at Malmö', () => {
    let max = -90;
    for (let minute = 0; minute < 1440; minute += 5) {
      const date = new Date(Date.UTC(2026, 4, 28, 0) + minute * 60_000);
      max = Math.max(max, sunAltitudeDeg(55.6, 13.0, date));
    }
    // noon altitude ≈ 90 − lat + declination ≈ 90 − 55.6 + 21.4 ≈ 56°
    expect(max).toBeGreaterThan(52);
    expect(max).toBeLessThan(60);
  });
});

// The depression → darkness/colour ramp moved to skia/washColor.ts (the CPU twin of the wash
// shader); its monotonicity, the Malmö-not-black headline, and the saturation point are pinned
// in washColor.test.ts. This file now covers only the sun's geometry.
