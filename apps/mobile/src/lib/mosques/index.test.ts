import { describe, expect, it } from '@jest/globals';

import {
  formatMosqueDistance,
  getMosques,
  lanDisplay,
  locationLabel,
  type Mosque,
  mosqueById,
  mosqueForPress,
  toFeatureCollection,
  UNDATED_SORT,
} from './index';
import { at, first } from '@/test-utils/at';

// The vendored dataset is the ground truth the map layer and the detail card both read,
// so these guard its integrity: every record geocoded inside Sweden with the fields the
// UI depends on. A broken sync (wrong columns, a null coordinate) would otherwise only
// surface as invisible/misplaced pins on a device.
describe('mosque dataset', () => {
  it('exposes the synced set as valid geocoded Swedish mosques', () => {
    const mosques = getMosques();
    // sync.test.ts proves exact parity with the canonical web dataset. Repeating its
    // current length here made every legitimate data sync require an unrelated test edit.
    expect(mosques.length).toBeGreaterThan(0);
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

    const feature = first(fc.features, 'features');
    const m = first(mosques, 'mosques');
    expect(feature.type).toBe('Feature');
    expect(feature.geometry.type).toBe('Point');
    // GeoJSON is [lng, lat] — the reverse of a lat/lng pair. Guarding the order stops
    // the classic bug where every pin lands in the wrong hemisphere.
    expect(feature.geometry.coordinates).toEqual([m.lng, m.lat]);
    expect(feature.properties).toEqual({
      id: m.id,
      name: m.name,
      sort: m.opened ?? UNDATED_SORT,
    });

    // Every feature's coordinate[0] is a longitude (10–25), coordinate[1] a latitude
    // (55–70) — a property-based check that the order holds for all 236, not just the first.
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

  // THE BUG THIS GUARDS: the glyph layer runs icon-allow-overlap: false, and the style
  // spec's default symbol-z-order ("auto") only sorts by viewport y when an allow-overlap
  // is true — otherwise placement follows SOURCE order. data.json is ordered by län then
  // name, so which of Malmö's twelve mosques survived a collision came down to county
  // spelling, and the survivors changed as you panned. `sort` feeds symbol-sort-key
  // (lower places first). If this contract breaks, nothing fails visibly: the labels just
  // go back to being arbitrary, which is invisible in a screenshot and impossible to
  // notice in review.
  it('ranks dated mosques ahead of undated ones for symbol-sort-key', () => {
    const dated: Mosque = { ...first(getMosques(), 'mosques'), id: 'dated', opened: 1984 };
    const undated: Mosque = { ...at(getMosques(), 1, 'mosques'), id: 'undated', opened: undefined };
    const features = toFeatureCollection([dated, undated]).features;
    const a = first(features, 'features');
    const b = at(features, 1, 'features');

    expect(a.properties.sort).toBe(1984);
    expect(b.properties.sort).toBe(UNDATED_SORT);
    // Lower key = placed first, so a dated mosque must outrank an undated one.
    expect(a.properties.sort).toBeLessThan(b.properties.sort);
    // And the fallback has to sit past every real year in the set, or a late-opening
    // mosque would silently sort behind the undated tail.
    const years = getMosques()
      .map((m) => m.opened)
      .filter((y): y is number => typeof y === 'number');
    expect(Math.max(...years)).toBeLessThan(UNDATED_SORT);
  });

  it('gives every feature a numeric sort key', () => {
    for (const f of toFeatureCollection().features) {
      expect(Number.isFinite(f.properties.sort)).toBe(true);
    }
  });
});

describe('mosqueById', () => {
  it('resolves a known id and returns undefined for an unknown one', () => {
    const known = at(getMosques(), 10, 'mosques');
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

// THE BUG THESE GUARD: the map handler took `features[0]`. MapLibre's hit test returns every
// symbol whose rendered box meets a box around the touch point, in no defined order, so in a
// crowded city the card could describe a mosque the finger never touched — confidently, with
// no clue for the reader beyond a name they did not aim at. The tap's own coordinate is in
// the event, so the nearest hit is the answer.
describe('mosqueForPress', () => {
  /** A hit-test result for a mosque, as MapLibre hands it over (only `properties.id` is
   *  read — the geometry is deliberately ignored, see the function's comment). */
  function hit(m: Mosque): GeoJSON.Feature {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: { id: m.id, name: m.name, sort: m.opened ?? UNDATED_SORT },
    };
  }

  /** Two real mosques far enough apart that "nearest" is unambiguous. */
  const mosques = getMosques();
  const north = at(
    mosques.filter((m) => m.lat > 63),
    0,
    'northern mosques',
  );
  const south = at(
    mosques.filter((m) => m.lat < 57),
    0,
    'southern mosques',
  );

  it('picks the hit nearest the finger, not the first one MapLibre returned', () => {
    // The finger is on the southern mosque; the northern one is listed first.
    const tapped = mosqueForPress([hit(north), hit(south)], [south.lng, south.lat]);
    expect(tapped?.id).toBe(south.id);

    // And the same list resolves the other way when the finger moves — the order of the
    // features must have no say at all.
    expect(mosqueForPress([hit(north), hit(south)], [north.lng, north.lat])?.id).toBe(north.id);
  });

  it('resolves a genuinely crowded tap to the closest of the crowd', () => {
    const crowd = mosques.filter((m) => m.city === south.city);
    // A point nudged towards the LAST of the crowd — the one features[0] can never be.
    const target = crowd.length > 1 ? at(crowd, crowd.length - 1, 'city crowd') : south;
    const tapped = mosqueForPress(crowd.map(hit), [target.lng + 0.0001, target.lat - 0.0001]);
    expect(tapped?.id).toBe(target.id);
  });

  it('answers nothing for an empty or missing hit list', () => {
    expect(mosqueForPress([], [18.07, 59.33])).toBeUndefined();
    expect(mosqueForPress(undefined, [18.07, 59.33])).toBeUndefined();
  });

  it('ignores features that are not mosques we know', () => {
    const stranger: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [18.07, 59.33] },
      properties: { id: 'inte-en-moske' },
    };
    const idless: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [18.07, 59.33] },
      properties: null,
    };
    // Both strangers sit exactly under the finger and must still lose to the real mosque
    // hundreds of kilometres away — an unknown id is not a mosque, however close it is.
    expect(mosqueForPress([stranger, idless, hit(north)], [18.07, 59.33])?.id).toBe(north.id);
    expect(mosqueForPress([stranger, idless], [18.07, 59.33])).toBeUndefined();
  });

  it('keeps the first of two mosques at the same spot, so a near-duplicate is stable', () => {
    // The dataset carries near duplicates (the sync guard warns under 150 m). Whichever card
    // opens, it must be the SAME one every time — a tie that flips on re-render would read
    // as the map changing its mind.
    const twin: Mosque = { ...south, id: `${south.id}-tvilling` };
    const features = [hit(south), hit(twin)];
    // The twin is not in the dataset, so it cannot win; the point is that the resolved
    // answer does not depend on where in the list the real one sits.
    expect(mosqueForPress(features, [south.lng, south.lat])?.id).toBe(south.id);
    expect(mosqueForPress([...features].reverse(), [south.lng, south.lat])?.id).toBe(south.id);
  });
});
