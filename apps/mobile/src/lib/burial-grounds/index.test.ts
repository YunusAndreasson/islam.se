import { describe, expect, it } from '@jest/globals';

import {
  type BurialGround,
  burialGroundById,
  burialGroundForPress,
  getBurialGrounds,
  sectionLabel,
  toFeatureCollection,
} from './index';

const grounds = getBurialGrounds();
const feature = (id: unknown): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: { id },
});

describe('toFeatureCollection', () => {
  it('emits one point per burial ground, in [lng, lat] order', () => {
    const fc = toFeatureCollection();
    expect(fc.features).toHaveLength(grounds.length);
    for (const [i, f] of fc.features.entries()) {
      const b = grounds[i]!;
      // Swapped axes put Sweden in the Indian Ocean — the one mistake GeoJSON invites.
      expect(f.geometry.coordinates).toEqual([b.lng, b.lat]);
      expect(f.properties).toEqual({ id: b.id, name: b.name });
      // Without a top-level id native feature-state silently cannot identify the ring.
      expect(f.id).toBe(b.id);
    }
    expect(new Set(fc.features.map((f) => f.id)).size).toBe(fc.features.length);
  });
});

describe('burialGroundForPress', () => {
  const [a, b] = grounds as [BurialGround, BurialGround];

  it('opens the burial ground nearest the finger, not the first hit', () => {
    // MapLibre returns every symbol in the hitbox in no particular order (see nearestHit).
    expect(burialGroundForPress([feature(a.id), feature(b.id)], [b.lng, b.lat])).toBe(b);
    expect(burialGroundForPress([feature(b.id), feature(a.id)], [a.lng, a.lat])).toBe(a);
  });

  it('ignores features it has no record for, and answers nothing for an empty hit', () => {
    expect(burialGroundForPress([feature('no-such-place'), feature(42)], [a.lng, a.lat])).toBeUndefined();
    expect(burialGroundForPress([], [a.lng, a.lat])).toBeUndefined();
    expect(burialGroundForPress(undefined, [a.lng, a.lat])).toBeUndefined();
  });
});

describe('sectionLabel', () => {
  it("uses the huvudman's own name for the section, and a plain noun when there is none", () => {
    const named = grounds.find((g) => g.section);
    const unnamed = grounds.find((g) => !g.section);
    expect(named && sectionLabel(named)).toBe(named?.section);
    expect(unnamed && sectionLabel(unnamed)).toBe('Muslimskt gravkvarter');
  });
});

describe('the mirrored list', () => {
  it('resolves every id back to its record', () => {
    for (const g of grounds) expect(burialGroundById(g.id)).toBe(g);
  });

  it('cites a source for every record', () => {
    expect(grounds.filter((g) => !g.source.startsWith('https://')).map((g) => g.id)).toEqual([]);
  });
});
