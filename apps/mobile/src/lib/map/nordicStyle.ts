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
//
// Apple Maps-inspired light/dark: two variants of this style, picked by
// `useColorScheme()` in `bonetider.tsx`. The dark basemap is a cool deep navy
// (Apple Maps dark mode reference), with water RECEDING under land (opposite of
// light mode where water is figure-ground) and a dark halo on labels so they
// read against a navy continent. The relief raster's hillshade is dialled down
// in dark mode so the mountains hint but don't muddy.
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import type { ColorSchemeName } from 'react-native';

import { darkPalette, lightPalette } from '../../theme/tokens';

const PLANET = 'https://tiles.openfreemap.org/planet';
const RELIEF = 'https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Swedish-first label resolution. name:sv where the tiles carry it (most seas,
// countries, large places), then a Latin transliteration, then the raw name —
// so a label is never blank and never Cyrillic.
const SV_LABEL: unknown = ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name']];

interface BasemapPalette {
  /** Land fill (background). */
  LAND: string;
  /** Water fill — Sweden's coastline + the great lakes. */
  WATER: string;
  /** Forest tint. */
  FOREST: string;
  /** Park overlay (a touch denser than forest). */
  PARK: string;
  /** Soft warmth/cool over urban footprints. */
  URBAN: string;
  /** Country names (faint). */
  FAINT_INK: string;
  /** Sea/lake italic labels. */
  WATER_INK: string;
  /** Halo around label text, tuned to the ground tone. */
  HALO: string;
  /** Country borders — a dashed hairline. */
  BOUNDARY: string;
  /** Relief raster opacity stops, zoom 3 / 6 / 7.5 / 9. The mountains hint without
      muddying — duller in dark mode where any extra ink reads as noise. */
  reliefStops: [number, number, number, number];
}

// Light basemap — the warm parchment world (the original Nordic Calm). Matches the
// website's parchment paper, so the basemap LAND and the lightPalette.paper are the
// same warm tone and the chrome reads as family with the map under it.
const LIGHT: BasemapPalette = {
  LAND: '#ece6d8',
  WATER: '#9fb4c8',
  FOREST: 'rgba(120,140,104,0.16)',
  PARK: 'rgba(120,140,104,0.2)',
  URBAN: 'rgba(176,160,134,0.15)',
  FAINT_INK: lightPalette.inkFaint,
  WATER_INK: '#7d8a93',
  HALO: 'rgba(250,247,240,0.92)',
  BOUNDARY: 'rgba(40,33,22,0.22)',
  reliefStops: [0.32, 0.26, 0.08, 0],
};

// Dark basemap — Apple Maps-inspired cool deep navy. The hierarchy INVERTS from
// light mode: water is darker than land (recedes), instead of land-paper / water-
// figure. Labels carry a DARK halo (opposite of light's warm halo). The forest
// and park hints go cool spruce so they don't read as warm islands on a cool sea.
// Note that LAND here matches darkPalette.surface (`#1d2233`) exactly, so a card
// raised over the basemap is the same hue — a deliberate near-flatness in dark
// mode (Apple Maps does this too: the dark map is one calm continent).
const DARK: BasemapPalette = {
  LAND: '#1d2233',
  WATER: '#0e1424',
  FOREST: 'rgba(96,124,108,0.18)',
  PARK: 'rgba(96,124,108,0.22)',
  URBAN: 'rgba(120,128,160,0.10)',
  FAINT_INK: darkPalette.inkFaint,
  WATER_INK: '#7c8aa0',
  HALO: 'rgba(18,22,36,0.92)',
  BOUNDARY: 'rgba(220,228,255,0.14)',
  reliefStops: [0.18, 0.14, 0.04, 0],
};

function buildStyle(c: BasemapPalette, name: string): StyleSpecification {
  return {
    version: 8,
    name,
    glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: PLANET },
      relief: { type: 'raster', tiles: [RELIEF], tileSize: 256, maxzoom: 6 },
    },
    layers: [
      // Land base.
      { id: 'background', type: 'background', paint: { 'background-color': c.LAND } },

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
          'raster-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, c.reliefStops[0],
            6, c.reliefStops[1],
            7.5, c.reliefStops[2],
            9, c.reliefStops[3],
          ],
        },
      },

      // Faint urban footprint — gives the cities a soft presence under their markers.
      {
        id: 'urban',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
        paint: { 'fill-color': c.URBAN, 'fill-antialias': false },
      },

      // Forest + parks — a whisper of green so the land isn't dead flat.
      {
        id: 'wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: { 'fill-color': c.FOREST, 'fill-antialias': false },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': c.PARK, 'fill-antialias': false },
      },

      // Water — the figure-ground that defines the Swedish coastline and its lakes.
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'fill-color': c.WATER, 'fill-antialias': true },
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
          'line-color': c.BOUNDARY,
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
        paint: { 'text-color': c.WATER_INK, 'text-halo-color': c.HALO, 'text-halo-width': 1 },
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
          'text-color': c.FAINT_INK,
          'text-halo-color': c.HALO,
          'text-halo-width': 1,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 7, 0.3],
        },
      },

      // City markers + labels are drawn as a React overlay (components/map/MapMarkersOverlay)
      // ABOVE the Skia solar wash, so they stay legible on the night map and dim with it.
    ],
  } as unknown as StyleSpecification;
}

/** Warm parchment basemap (Nordic Calm, the original look). */
export const NORDIC_LIGHT: StyleSpecification = buildStyle(LIGHT, 'Nordic Calm — Light');

/** Cool deep navy basemap (Apple Maps-inspired dark mode). */
export const NORDIC_DARK: StyleSpecification = buildStyle(DARK, 'Nordic Calm — Dark');

/** Pick a basemap for the current OS appearance. */
export function nordicMapStyleFor(scheme: ColorSchemeName): StyleSpecification {
  return scheme === 'dark' ? NORDIC_DARK : NORDIC_LIGHT;
}
