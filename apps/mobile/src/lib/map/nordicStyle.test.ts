import { describe, expect, it } from '@jest/globals';

import { mapStyleFor, NORDIC_DARK, NORDIC_LIGHT } from './nordicStyle';

const SV_LABEL = ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name']];

function layer(style: typeof NORDIC_LIGHT, id: string) {
  const found = style.layers.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing map layer: ${id}`);
  return found as typeof found & { filter?: unknown; minzoom?: number; layout?: Record<string, unknown> };
}

describe.each([
  { name: 'light', style: NORDIC_LIGHT },
  { name: 'dark', style: NORDIC_DARK },
])('Nordic $name place-label policy', ({ style }) => {
  it('keeps Copenhagen out of the existing city layer and prioritises Swedish cities', () => {
    const cities = layer(style, 'label_city');

    expect(cities.filter).toEqual([
      'all',
      ['==', ['get', 'class'], 'city'],
      ['!', ['in', SV_LABEL, ['literal', ['Köpenhamn', 'København', 'Copenhagen']]]],
    ]);
    expect(cities.layout?.['symbol-sort-key']).toEqual([
      'match',
      SV_LABEL,
      ['Stockholm', 'Göteborg', 'Malmö'],
      0,
      ['Östersund', 'Växjö'],
      1,
      ['+', 10, ['coalesce', ['get', 'rank'], 99]],
    ]);
  });

  it('shows and prioritises Kiruna/Borlänge in the existing town layer from source zoom 7', () => {
    const towns = layer(style, 'label_town');

    expect(towns.minzoom).toBe(7);
    expect(towns.layout?.['symbol-sort-key']).toEqual([
      'match',
      SV_LABEL,
      ['Kiruna', 'Borlänge'],
      0,
      ['+', 10, ['coalesce', ['get', 'rank'], 99]],
    ]);
  });

  it('does not introduce a curated place source or extra place-label layer', () => {
    expect(Object.keys(style.sources)).toEqual(['openmaptiles', 'relief']);
    expect(style.layers.filter((candidate) => candidate.id.startsWith('label_')).map((candidate) => candidate.id))
      .toEqual(['label_country', 'label_city', 'label_town']);
  });
});

it('never delegates legacy map-style values to stock styles that can show Copenhagen', () => {
  expect(mapStyleFor('nordic', 'light')).toBe(NORDIC_LIGHT);
  expect(mapStyleFor('standard', 'light')).toBe(NORDIC_LIGHT);
  expect(mapStyleFor('satellite', 'dark')).toBe(NORDIC_DARK);
});
