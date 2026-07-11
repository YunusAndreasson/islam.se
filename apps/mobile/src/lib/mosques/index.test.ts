import { describe, expect, it } from '@jest/globals';

import {
  formatMosqueDistance,
  getMosques,
  lanDisplay,
  locationLabel,
  type Mosque,
  mosqueById,
  toFeatureCollection,
} from './index';

// The vendored dataset is the ground truth the map layer and the detail card both read,
// so these guard its integrity: every record geocoded inside Sweden with the fields the
// UI depends on. A broken sync (wrong columns, a null coordinate) would otherwise only
// surface as invisible/misplaced pins on a device.
describe('mosque dataset', () => {
  it('holds the full set of geocoded Swedish mosques', () => {
    const mosques = getMosques();
    expect(mosques.length).toBe(255);
    for (const m of mosques) {
      // Coordinates inside Sweden's bbox — the web build asserts the same window, so a
      // point outside it means the import picked up the wrong lat/lng columns.
      expect(m.lat).toBeGreaterThanOrEqual(55);
      expect(m.lat).toBeLessThanOrEqual(70);
      expect(m.lng).toBeGreaterThanOrEqual(10);
      expect(m.lng).toBeLessThanOrEqual(25);
      // Fields the card/layer read unconditionally must be present non-empty strings.
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.kommun.length).toBeGreaterThan(0);
      expect(m.lan.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids (mosqueById never collides)', () => {
    const ids = new Set(getMosques().map((m) => m.id));
    expect(ids.size).toBe(getMosques().length);
  });
});

describe('toFeatureCollection', () => {
  it('emits one GeoJSON point per mosque with [lng, lat] order and lean properties', () => {
    const mosques = getMosques();
    const fc = toFeatureCollection();
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBe(mosques.length);

    const first = fc.features[0];
    const m = mosques[0];
    expect(first.type).toBe('Feature');
    expect(first.geometry.type).toBe('Point');
    // GeoJSON is [lng, lat] — the reverse of a lat/lng pair. Guarding the order stops
    // the classic bug where every pin lands in the wrong hemisphere.
    expect(first.geometry.coordinates).toEqual([m.lng, m.lat]);
    expect(first.properties).toEqual({ id: m.id, name: m.name });

    // Every feature's coordinate[0] is a longitude (10–25), coordinate[1] a latitude
    // (55–70) — a property-based check that the order holds for all 255, not just the first.
    for (const f of fc.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(lng).toBeGreaterThanOrEqual(10);
      expect(lng).toBeLessThanOrEqual(25);
      expect(lat).toBeGreaterThanOrEqual(55);
      expect(lat).toBeLessThanOrEqual(70);
    }
  });

  it('respects a filtered mosque list', () => {
    const subset = getMosques().slice(0, 3);
    expect(toFeatureCollection(subset).features.length).toBe(3);
  });
});

describe('mosqueById', () => {
  it('resolves a known id and returns undefined for an unknown one', () => {
    const known = getMosques()[10];
    expect(mosqueById(known.id)).toBe(known);
    expect(mosqueById('no-such-mosque')).toBeUndefined();
  });
});

describe('lanDisplay', () => {
  it('maps the short county form to the proper Swedish län name', () => {
    // Explicit, non-genitive: "Skåne län", never "Skånes län".
    expect(lanDisplay('Skåne')).toBe('Skåne län');
    expect(lanDisplay('Västra Götaland')).toBe('Västra Götalands län');
    expect(lanDisplay('Stockholm')).toBe('Stockholms län');
  });

  it('falls back to "{county} län" for an unmapped county', () => {
    expect(lanDisplay('Nyland')).toBe('Nyland län');
  });
});

describe('locationLabel', () => {
  it('formats the card subtitle as "kommun · län"', () => {
    const m = { kommun: 'Botkyrka', lan: 'Stockholm' } as Mosque;
    expect(locationLabel(m)).toBe('Botkyrka · Stockholms län');
  });
});

describe('formatMosqueDistance', () => {
  it('shows metres under a kilometre', () => {
    expect(formatMosqueDistance(0.48)).toBe('480 m');
    expect(formatMosqueDistance(0.123)).toBe('120 m');
  });

  it('shows one decimal between 1 and 10 km (Swedish comma)', () => {
    // Accept '.' or ',' so the assertion survives a stripped-ICU Node; on a full-ICU
    // runtime (what the app ships and CI runs) it is the Swedish comma "2,3 km".
    expect(formatMosqueDistance(2.34)).toMatch(/^2[.,]3 km$/);
    expect(formatMosqueDistance(5.5)).toMatch(/^5[.,]5 km$/);
  });

  it('shows whole kilometres from 10 km up', () => {
    expect(formatMosqueDistance(42.4)).toBe('42 km');
  });
});
