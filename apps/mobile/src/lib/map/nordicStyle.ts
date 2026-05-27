// A custom MapLibre style for the Bönetider map — the single biggest lever on the
// app's "Nordic beauty". The stock OpenFreeMap Positron style is built for general
// wayfinding: it carries roads, railways, buildings, foreign-language sea names
// (a Cyrillic "Балтийское море" over the Baltic) and a busy gray palette — all
// noise under our solar wash, whose whole job is to read clearly over a calm map.
//
// This style keeps Positron's data (OpenFreeMap's planet vector tiles + a low-zoom
// Natural Earth shaded-relief raster) and glyphs, but redraws it as quiet Nordic
// cartography with enough relief and structure to stop reading flat:
//   • a desaturated shaded-relief base, so the Scandinavian mountains and the
//     Norrland fells give the land real topographic depth (faded out as you zoom
//     in, where it would only blur);
//   • pale land, a soft but present Nordic-blue water (coast + the great lakes),
//     a faint forest tint (the country is mostly wood) and a barely-there urban
//     warmth around the cities — nothing else; NO roads / rail / buildings / POIs;
//   • markers for the cities (the capital larger), names resolved Swedish-first
//     (name:sv → name:latin → name) so the sea is "Östersjön", never Cyrillic;
//   • a cool palette tuned to the app's night-indigo accent, so the chrome floating
//     over it (the glass dock, the menu) reads as one piece with the map.
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import { palette } from '../../theme/tokens';

const PLANET = 'https://tiles.openfreemap.org/planet';
const RELIEF = 'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Swedish-first label resolution. name:sv where the tiles carry it (most seas,
// countries, large places), then a Latin transliteration, then the raw name —
// so a label is never blank and never Cyrillic.
const SV_LABEL: unknown = ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name']];

// Map cartography palette. Warmed to the website's parchment family (so the land is
// the same paper as the chrome and the screens) and de-fainted — the old cool
// blue-grey land + 0.15 boundary read as washed-out. The land is now warm sand, the
// water a deeper Nordic blue that carves the coast with more presence, and the
// borders a warm, more visible hairline. The solar wash still reads clearly on top.
const LAND = '#ece6d8'; //        warm parchment land
const WATER = '#9fb4c8'; //       deeper Nordic blue — carves the coastline with presence
const FOREST = 'rgba(120,140,104,0.16)'; // warm wood tint — Sweden is mostly forest
const PARK = 'rgba(120,140,104,0.2)';
const URBAN = 'rgba(176,160,134,0.15)'; // soft warmth where the cities are
const FAINT_INK = palette.inkFaint; //  country / region names (warm)
const WATER_INK = '#7d8a93'; //         sea / lake names (italic)
const HALO = 'rgba(250,247,240,0.92)'; // warm light halo
const BOUNDARY = 'rgba(40,33,22,0.22)'; // warm, more present border hairline

export const nordicMapStyle = {
  version: 8,
  name: 'Nordic Calm',
  glyphs: GLYPHS,
  sources: {
    openmaptiles: { type: 'vector', url: PLANET },
    relief: { type: 'raster', tiles: [RELIEF], tileSize: 256, maxzoom: 6 },
  },
  layers: [
    // Land base.
    { id: 'background', type: 'background', paint: { 'background-color': LAND } },

    // Shaded relief, desaturated to a neutral hillshade so it adds topography, not
    // Natural Earth's greens/browns. Strongest at country zoom (where the mountains
    // read), gone by the time you're zoomed into a city (where it would just blur).
    {
      id: 'relief',
      type: 'raster',
      source: 'relief',
      paint: {
        'raster-saturation': -1,
        'raster-contrast': 0.08,
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 6, 0.26, 7.5, 0.08, 9, 0],
      },
    },

    // Faint urban footprint — gives the cities a soft presence under their markers.
    {
      id: 'urban',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
      paint: { 'fill-color': URBAN, 'fill-antialias': false },
    },

    // Forest + parks — a whisper of green so the land isn't dead flat.
    {
      id: 'wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': FOREST, 'fill-antialias': false },
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': PARK, 'fill-antialias': false },
    },

    // Water — the figure-ground that defines the Swedish coastline and its lakes.
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: { 'fill-color': WATER, 'fill-antialias': true },
    },

    // Country borders — faint dashed hairlines, just enough to separate Sweden
    // from its neighbours without drawing attention.
    {
      id: 'boundary_country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': BOUNDARY,
        'line-dasharray': [3, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.2],
      },
    },

    // --- Area labels from the tiles, then our own city overlay on top ---

    // Sea & lake names: cool italic, no Cyrillic.
    {
      id: 'water_name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': SV_LABEL,
        'text-font': ['Noto Sans Italic'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 15],
        'text-letter-spacing': 0.1,
        'text-max-width': 7,
      },
      paint: { 'text-color': WATER_INK, 'text-halo-color': HALO, 'text-halo-width': 1 },
    },

    // Neighbouring countries (Norge, Finland, Danmark…): quiet uppercase, fade out
    // as you zoom into Sweden so they never compete with Swedish places.
    {
      id: 'label_country',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['==', ['get', 'class'], 'country'],
      maxzoom: 8,
      layout: {
        'text-field': SV_LABEL,
        'text-font': ['Noto Sans Regular'],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.18,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 13],
        'text-max-width': 6,
      },
      paint: {
        'text-color': FAINT_INK,
        'text-halo-color': HALO,
        'text-halo-width': 1,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 7, 0.3],
      },
    },

    // City markers + labels are drawn as a React overlay (components/map/MapMarkersOverlay)
    // ABOVE the Skia solar wash, so they stay legible on the night map and dim with it.
  ],
} as const;

/** maplibre-react-native's `mapStyle` accepts a style URL or a style JSON object.
    The hand-authored object is looser than the generated spec types, so we assert. */
export const NORDIC_MAP_STYLE = nordicMapStyle as unknown as StyleSpecification;
