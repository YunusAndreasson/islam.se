// Anti-rubberstamp: the oracle is the dataset itself, not a hand-copied
// expected coordinate. We assert invariants (distance bounds, name matches
// when given a known place's exact coords) rather than brittle equality on
// some lat/lon a future GeoNames refresh might shift by 100m.
import { describe, expect, it } from '@jest/globals';

import { PLACES } from './data';
import { haversineKm, nearestPlace } from './nearest';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(59.3293, 18.0686, 59.3293, 18.0686)).toBe(0);
  });

  it('Stockholm → Göteborg ≈ 397 km (great-circle)', () => {
    // Independent check (https://www.movable-type.co.uk/scripts/latlong.html)
    // returns 397 km ±1; we tolerate ±5 km against any small floating-point drift.
    const km = haversineKm(59.3293, 18.0686, 57.7089, 11.9746);
    expect(km).toBeGreaterThan(392);
    expect(km).toBeLessThan(402);
  });

  it('is symmetric', () => {
    const a = haversineKm(67.85, 20.22, 55.6, 13.0);
    const b = haversineKm(55.6, 13.0, 67.85, 20.22);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('nearestPlace', () => {
  it('snaps to the exact place when given that place\'s own coords', () => {
    // Markaryd is a small Kronoberg town — exactly the case the user wants
    // to work. Giving its own coords back must round-trip to itself.
    const markaryd = PLACES.find((p) => p.name === 'Markaryd');
    if (!markaryd) throw new Error('Markaryd missing from dataset — regenerate src/lib/places/data.ts');
    const { place, distanceKm } = nearestPlace(markaryd.lat, markaryd.lon);
    expect(place.name).toBe('Markaryd');
    expect(place.county).toBe('Kronoberg');
    expect(distanceKm).toBeLessThan(0.001);
  });

  it('GPS in central Stockholm → "Stockholm"', () => {
    // Sergels torg.
    const { place } = nearestPlace(59.3326, 18.0649);
    expect(place.name).toBe('Stockholm');
  });

  it('GPS near Markaryd centre → Markaryd', () => {
    // ~500m N of the centre — must still pick Markaryd, not a neighbouring tätort.
    const { place, distanceKm } = nearestPlace(56.4655, 13.5965);
    expect(place.name).toBe('Markaryd');
    expect(distanceKm).toBeLessThan(1);
  });

  it('returns a place for any Swedish coordinate (middle of Vänern)', () => {
    // Out on the lake — there is no settlement there, but nearestPlace
    // must still return SOMETHING (the closest town on the shore).
    const { place, distanceKm } = nearestPlace(58.85, 13.25);
    expect(place.name).toBeTruthy();
    // Vänern is ~50 km wide; closest shore town must be within that radius.
    expect(distanceKm).toBeLessThan(50);
  });

  it('no two places share identical coords (would break round-trip)', () => {
    // Cheap O(N) version of the round-trip invariant: if two entries had
    // the same lat/lon, snapping that point would deterministically pick
    // one and the other could never be selected by GPS — making it dead
    // weight in the dataset. The build script (scripts/build-places.py)
    // dedups by coords; this test guards against a manual edit regressing it.
    const seen = new Set<string>();
    const collisions: string[] = [];
    for (const p of PLACES) {
      const key = `${p.lat},${p.lon}`;
      if (seen.has(key)) collisions.push(`${p.name} (${p.county}) @ ${key}`);
      seen.add(key);
    }
    expect(collisions).toEqual([]);
  });

  it('includes Kiruna so polar-circle handling stays reachable from the picker', () => {
    // The prayer-times suite has a Kiruna-midsummer regression — the polar
    // circle's `aqrabBalad` fallback is only exercised if a user can actually
    // select a place above the Arctic Circle. If the population threshold in
    // build-places.py rises and quietly cuts Kiruna, this fails loudly.
    const kiruna = PLACES.find((p) => p.name === 'Kiruna');
    expect(kiruna).toBeDefined();
    expect(kiruna && kiruna.lat).toBeGreaterThan(66.5);
  });

  it('round-trips a representative sample (extremes + biggest cities)', () => {
    // Smoke check against the slow O(N²) sweep — sampled, but covers
    // latitudinal extremes (Kiruna up north, Trelleborg down south) where
    // the haversine is most likely to misbehave, plus the 5 biggest cities
    // because regressions there would be the most user-visible.
    const samples = [
      ...PLACES.slice(0, 5), // 5 biggest by population
      [...PLACES].sort((a, b) => b.lat - a.lat)[0], // northernmost
      [...PLACES].sort((a, b) => a.lat - b.lat)[0], // southernmost
      [...PLACES].sort((a, b) => b.lon - a.lon)[0], // easternmost
      [...PLACES].sort((a, b) => a.lon - b.lon)[0], // westernmost
    ];
    for (const p of samples) {
      const { place } = nearestPlace(p.lat, p.lon);
      expect({ name: place.name, county: place.county }).toEqual({ name: p.name, county: p.county });
    }
  });
});
