import { describe, expect, it } from '@jest/globals';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

import { nordicMapStyleFor, NORDIC_DARK, NORDIC_LIGHT } from './nordicStyle';

const SV_LABEL = ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name']];

function layer(style: typeof NORDIC_LIGHT, id: string) {
  const found = style.layers.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing map layer: ${id}`);
  return found as typeof found & {
    filter?: unknown;
    minzoom?: number;
    layout?: Record<string, unknown>;
    paint?: Record<string, unknown>;
  };
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
    expect(Object.keys(style.sources)).toEqual(['openmaptiles', 'terrain']);
    expect(style.layers.filter((candidate) => candidate.id.startsWith('label_')).map((candidate) => candidate.id))
      .toEqual(['label_country', 'label_city', 'label_town']);
  });

  // buildStyle() ends in `as unknown as StyleSpecification`, so TypeScript checks
  // NOTHING about the layers it returns — a misspelt paint property or a malformed
  // expression compiles clean, ships, and silently renders nothing on device. This is
  // the only thing standing between that cast and a blank basemap.
  it('is a valid MapLibre style', () => {
    const errors = validateStyleMin(style).map((e) => `${e.message}`);
    expect(errors).toEqual([]);
  });

  // The DEM encoding is the one setting that fails SILENTLY: decode terrarium tiles
  // with the mapbox formula (or vice versa) and MapLibre reports no error, it just
  // shades a mountain range that does not exist. Pinned per provider against elevations
  // decoded from a real tile over Kebnekaise — see the comment on DEM in nordicStyle.ts.
  it('pairs the DEM tile URL with its own encoding, tile size and depth', () => {
    const dem = style.sources.terrain as {
      type: string;
      tiles: string[];
      encoding: string;
      tileSize: number;
      maxzoom: number;
    };

    expect(dem.type).toBe('raster-dem');
    if (dem.tiles[0]?.includes('maptiler')) {
      expect(dem).toMatchObject({ encoding: 'mapbox', tileSize: 512, maxzoom: 14 });
    } else {
      expect(dem).toMatchObject({ encoding: 'terrarium', tileSize: 256, maxzoom: 15 });
    }
  });

  // Both DEM sets encode bathymetry, so a hillshade drawn above the water fill shades
  // the Baltic seafloor. The opaque water fill is what hides it — this ordering is the
  // fix, and it is invisible in code review the moment someone reorders the array.
  it('draws the hillshade under the water fill so the seafloor never shows', () => {
    const ids = style.layers.map((candidate) => candidate.id);

    expect(ids.indexOf('relief')).toBeGreaterThan(ids.indexOf('background'));
    expect(ids.indexOf('relief')).toBeLessThan(ids.indexOf('water'));
  });

  // THE BUG THIS GUARDS: the RN overlay draws the user's brass location dot AT the
  // chosen place's coordinates, and it cannot take part in MapLibre's symbol collision.
  // So a place label that sits ON its own point ends up with the dot mid-word
  // ("Stoc●holm"). Every anchor offered here must therefore push the text OFF the point
  // — which is all of them except `center`. Adding `center` to either list, or dropping
  // the radial offset, silently reintroduces it.
  it.each(['label_city', 'label_town'])('never lets %s labels sit on their own point', (id) => {
    const layout = layer(style, id).layout as Record<string, unknown>;

    expect(layout['text-variable-anchor']).not.toContain('center');
    expect(layout['text-variable-anchor']).toContain('bottom');
    expect(layout['text-radial-offset']).toBeGreaterThan(0);
    // `text-offset` is ignored once a radial offset is set; having both is a sign
    // someone re-added the old fixed anchoring on top of the variable one.
    expect(layout['text-offset']).toBeUndefined();
  });

  // `multidirectional` is the only hillshade method that reads these three properties
  // per light source. MapLibre pairs them by index, so a mismatched length silently
  // drops or mislights a source rather than erroring.
  it('gives every hillshade light a matching direction, altitude and colour', () => {
    const paint = layer(style, 'relief').paint as Record<string, unknown[]>;

    expect(paint['hillshade-method']).toBe('multidirectional');
    const directions = paint['hillshade-illumination-direction'];
    // Named rather than chained off the index read: absent, `.length` would throw a bare
    // "of undefined" instead of saying which paint property the relief layer lost.
    expect(directions).toBeDefined();
    const lights = directions?.length ?? 0;
    expect(lights).toBeGreaterThan(1);
    expect(paint['hillshade-illumination-altitude']).toHaveLength(lights);
    expect(paint['hillshade-shadow-color']).toHaveLength(lights);
    expect(paint['hillshade-highlight-color']).toHaveLength(lights);
  });
});

// Appearance is the ONLY axis the basemap resolver has. There is deliberately no style
// choice: a remote stock style ships its own label layers and would reintroduce
// Copenhagen, which this map's Swedish place-label policy forbids. If a future change
// reintroduces a style parameter, this test is where that decision has to be re-argued.
it('resolves the basemap from the OS appearance alone', () => {
  expect(nordicMapStyleFor('light')).toBe(NORDIC_LIGHT);
  expect(nordicMapStyleFor('dark')).toBe(NORDIC_DARK);
  // An unsettled scheme ('unspecified', what useColorScheme reports before the OS
  // appearance resolves) must land on light rather than on nothing at all.
  expect(nordicMapStyleFor('unspecified')).toBe(NORDIC_LIGHT);
});
