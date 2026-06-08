// The polar daylight boundary line drawn on the map (midnight sun in summer, polar night
// in winter) must sit exactly where the prayer engine stops resolving sun-event prayers —
// otherwise the dashed line and the points where the fajr/sunrise sweeps terminate would
// disagree, and the line would be lying about WHY the lines stop. These tests pin the
// analytic boundary (polarBoundaryFor) against adhan itself, the source of truth.
import { describe, expect, test } from '@jest/globals';

import { computePrayerTimes } from '../prayer-times';
import { DEFAULT_SETTINGS } from '../settings/types';
import { polarBoundaryFor } from './sun';

// Mirror the line grid's settings: bonetider.tsx forces 'unresolved' so the polar cells go
// NaN (Invalid Date) rather than borrowing a neighbouring latitude's time.
const LINE_SETTINGS = { ...DEFAULT_SETTINGS, polarCircleResolution: 'unresolved' as const };

// adhan reads Y/M/D off the Date; a local-noon Date matches what stockholmPrayerDate feeds it.
const dayFor = (y: number, mo1: number, d: number): Date => new Date(y, mo1 - 1, d, 12, 0, 0, 0);

// Lowest latitude (scanning north) at which `key` becomes Invalid Date for the given day.
function nanOnsetLat(date: Date, lon: number, key: 'sunrise' | 'fajr'): number | null {
  for (let lat = 60; lat <= 72; lat += 0.05) {
    const t = computePrayerTimes({ latitude: lat, longitude: lon }, date, LINE_SETTINGS)[key];
    if (Number.isNaN(t.getTime())) return Number(lat.toFixed(2));
  }
  return null;
}

describe('polarBoundaryFor', () => {
  test('summer → midnight-sun line at adhan’s sunrise NaN boundary, longitude-independent', () => {
    const date = dayFor(2026, 6, 8);
    const boundary = polarBoundaryFor(date);
    expect(boundary?.kind).toBe('midnight-sun');

    // The analytic line lands within a scan-step of where adhan actually loses sunrise…
    const sunriseOnset = nanOnsetLat(date, 16, 'sunrise') as number;
    expect(Math.abs((boundary as { lat: number }).lat - sunriseOnset)).toBeLessThan(0.2);

    // …and fajr vanishes at the same latitude (its high-lat rule needs a night that, north
    // of here, no longer exists) — so one line correctly serves both sweeps.
    const fajrOnset = nanOnsetLat(date, 16, 'fajr') as number;
    expect(Math.abs(fajrOnset - sunriseOnset)).toBeLessThan(0.2);

    // The boundary depends only on latitude → identical onset at every longitude, which is
    // what makes a perfectly horizontal map line the correct shape (not a tilted one).
    for (const lon of [11, 16, 21, 24]) {
      expect(Math.abs((nanOnsetLat(date, lon, 'sunrise') as number) - sunriseOnset)).toBeLessThan(0.2);
    }
  });

  test('winter → polar-night line at adhan’s sunrise NaN boundary', () => {
    const date = dayFor(2026, 12, 21);
    const boundary = polarBoundaryFor(date);
    expect(boundary?.kind).toBe('polar-night');

    const sunriseOnset = nanOnsetLat(date, 16, 'sunrise') as number;
    expect(Math.abs((boundary as { lat: number }).lat - sunriseOnset)).toBeLessThan(0.3);
  });

  test('near the equinoxes the boundary is off the map → null (no line drawn)', () => {
    // ~3 weeks past the spring equinox the boundary is still well north of 71°N.
    expect(polarBoundaryFor(dayFor(2026, 4, 10))).toBeNull();
    expect(polarBoundaryFor(dayFor(2026, 9, 10))).toBeNull();
  });
});
