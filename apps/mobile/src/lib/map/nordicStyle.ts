// A custom MapLibre style for the Bönetider map — the single biggest lever on the
// app's "Nordic beauty". The Nordic look comes from the COLOUR palette and the
// halo/font choices, not from minimalism: roads, transit and small towns are
// fine to show as long as they're tinted into the same warm-paper / cool-navy
// world (Don Norman / Apple Maps cartography: information you'd actually want
// while orienting, just calmed).
//
// Two tile backends, picked at runtime by whether a MapTiler key is set:
//
//  • DEFAULT (no key): OpenFreeMap planet vector tiles + AWS Terrain Tiles for
//    elevation. Free, no signup.
//  • UPGRADED (EXPO_PUBLIC_MAPTILER_KEY set): MapTiler's OpenMapTiles vector
//    source (same schema, so every existing layer below keeps working unchanged)
//    + MapTiler's Terrain RGB elevation tiles. Free tier covers ~100k tile
//    requests/month.
//
// The relief is a REAL `hillshade` layer over a `raster-dem` source, not a
// pre-baked shaded-relief image. MapLibre Native gained the rewritten hillshade
// algorithms — including `multidirectional` — in iOS 6.24 / Android 13.0, and the
// React Native binding exposed `raster-dem` in 11.1.0. Three things follow:
// the shading is computed from elevation at the zoom you're actually at (so it no
// longer dissolves at mid-zoom the way the baked raster did), it is lit from
// several directions at once (which is what makes the Scandes read as a spine
// rather than a smear), and its shadow/highlight/accent colours are OURS — so the
// warm parchment map shades warm and the navy map shades cool, instead of both
// getting the same desaturated grey.
//
// Either way the cartographic look is the same: a desaturated shaded-relief
// base, pale land + soft Nordic-blue water + a whisper of forest/urban tint,
// the road network drawn in ink-muted hairlines so you can read major routes
// without the map shouting, and Swedish-first labels (name:sv → name:latin →
// name) so the sea is always "Östersjön" — never Cyrillic.
//
// Apple Maps-inspired light/dark: two variants of this style, picked by
// `useColorScheme()` in `bonetider.tsx`. The dark basemap is a cool deep navy
// (Apple Maps dark mode reference), with water RECEDING under land (opposite of
// light mode where water is figure-ground) and a dark halo on labels so they
// read against a navy continent. The hillshade is dialled down in dark mode so
// the mountains hint but don't muddy.
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import type { ColorSchemeName } from 'react-native';

import { darkPalette, lightPalette } from '../../theme/tokens';

// EXPO_PUBLIC_* env vars are inlined into the JS bundle at build/OTA time, so this
// resolves once at module load. Empty/undefined => OpenFreeMap fallback (no key
// required); any non-empty value => MapTiler.
const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '').trim();
const USE_MAPTILER = MAPTILER_KEY.length > 0;

const PLANET = USE_MAPTILER
  ? `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`
  : 'https://tiles.openfreemap.org/planet';
// Elevation tiles feeding the hillshade layer. The two providers use DIFFERENT RGB
// encodings, tile sizes and depths, and getting any of them wrong yields plausible-
// looking garbage rather than an error — so each value below was decoded from a real
// tile over Kebnekaise (67.9012 N, 18.5169 E, ~2096 m) rather than taken from docs:
// MapTiler returned 2063 m under the `mapbox` formula, AWS 2083 m under `terrarium`.
// If you ever swap a provider, re-run that check before trusting the shading.
const DEM = USE_MAPTILER
  ? `https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`
  : 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const DEM_ENCODING: 'mapbox' | 'terrarium' = USE_MAPTILER ? 'mapbox' : 'terrarium';
// MapTiler serves @2x (512 px) tiles; AWS Terrain Tiles are the classic 256 px.
const DEM_TILE_SIZE = USE_MAPTILER ? 512 : 256;
const DEM_MAXZOOM = USE_MAPTILER ? 14 : 15;
const DEM_ATTRIBUTION = USE_MAPTILER
  ? '© MapTiler © OpenStreetMap contributors'
  : 'AWS Terrain Tiles (Mapzen)';
const GLYPHS = USE_MAPTILER
  ? `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`
  : 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

// Swedish-first label resolution. name:sv where the tiles carry it (most seas,
// countries, large places), then a Latin transliteration, then the raw name —
// so a label is never blank and never Cyrillic.
const SV_LABEL: unknown = ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name']];

// Keep the country overview Swedish-first without maintaining a second city
// source/layer. Copenhagen sits close enough to Malmö to win the shared symbol
// collision at this zoom, so omit it and give Sweden's three largest cities —
// followed by a sparse set of regional places — placement priority inside the
// two existing vector-tile place layers. OpenMapTiles only starts emitting
// `class=town` features at z7, so Kiruna/Borlänge enter there; no style filter can
// make a feature exist in lower-zoom tiles without adding another data source.
const PRIMARY_SWEDISH_CITIES = ['Stockholm', 'Göteborg', 'Malmö'];
const FEATURED_SWEDISH_CITIES = ['Östersund', 'Växjö'];
const FEATURED_SWEDISH_TOWNS = ['Kiruna', 'Borlänge'];
const COPENHAGEN_NAMES = ['Köpenhamn', 'København', 'Copenhagen'];

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
  /** Place labels (towns/villages from the tiles, not the curated city overlay). */
  PLACE_INK: string;
  /** Sea/lake italic labels. */
  WATER_INK: string;
  /** Halo around label text, tuned to the ground tone. */
  HALO: string;
  /** Country borders — a dashed hairline. */
  BOUNDARY: string;
  /** Major roads (motorway / trunk) — quiet inked ribbons over the land. */
  ROAD_MAJOR: string;
  /** Minor roads (primary / secondary) — faded one step from major. */
  ROAD_MINOR: string;
  /** Railway — a hairline, mostly visible only at city zoom. */
  RAIL: string;
  /** Glaciers and permanent ice (Kebnekaise + the small high-mountain glaciers in
      the Scandes). A very pale, almost-white fill in light mode; a faint icy
      navy in dark mode. Fills the visual void up north where there are no
      towns. */
  GLACIER: string;
  /** Wetlands — Lapland myrar, Norrbotten and Västerbotten coastal marshes. A
      cool blue-grey wash that reads as "neither land nor water". A LOT of the
      sparse north is wetland; without this the mountains and forests floated
      on bare land. */
  WETLAND: string;
  /** Mountain peak ink — the small triangle marker and its name+elevation
      label up in the Scandes. Same family as PLACE_INK but a notch firmer so
      a peak doesn't read as a town. */
  PEAK: string;
  /** Hillshade shadow colours — slopes facing AWAY from each light source, one entry
      per light in `hillshade-illumination-direction`. Warm brown over parchment, cool
      near-black over navy: this is the half of the upgrade the baked raster could not
      do, since a pre-shaded image is the same grey in both themes. Alpha decays across
      the three lights so the primary NW light carries the form and the two fill lights
      only open up the slopes it leaves flat. */
  RELIEF_SHADOW: [string, string, string];
  /** Hillshade highlight colours — slopes facing TOWARD each light source. Same
      three-light decay as RELIEF_SHADOW. */
  RELIEF_HIGHLIGHT: [string, string, string];
  /** Hillshade accent — picks out rugged terrain (sharp ridges, cliff faces) on top of
      the directional shading. One colour, not per-light. */
  RELIEF_ACCENT: string;
  /** Hillshade exaggeration stops (zoom 3 / 6 / 9 / 12) — how strongly slope drives the
      shading, as the mountains hint without muddying. Duller in dark mode where any
      extra ink reads as noise.

      These carry over the tuned head of the old relief raster's opacity ramp (z3/z6),
      including the deliberate z6 bump that makes the Scandes read as a real mountain
      spine rather than a flat strip. The TAIL is new: the old ramp fell to 0 by z12 on
      the free tier because the Natural Earth raster simply had no data above z6. The
      DEM runs to z14/z15, so there is no data cliff to hide any more and the relief is
      allowed to sustain into city zoom, which was the point of the upgrade. */
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
  PLACE_INK: lightPalette.inkMuted,
  WATER_INK: '#7d8a93',
  HALO: 'rgba(250,247,240,0.92)',
  BOUNDARY: 'rgba(40,33,22,0.22)',
  ROAD_MAJOR: 'rgba(40,33,22,0.45)',
  ROAD_MINOR: 'rgba(40,33,22,0.28)',
  RAIL: 'rgba(40,33,22,0.30)',
  // Glacier: a near-paper pale icy white. Sits on top of the relief raster so the
  // mountain texture still shows through faintly.
  GLACIER: 'rgba(225,233,240,0.78)',
  // Wetland: cool blue-grey, slightly cooler than the warm parchment LAND. Subtle
  // pattern would be ideal but a flat low-opacity wash reads honestly enough at
  // these zooms.
  WETLAND: 'rgba(150,170,180,0.20)',
  // Peak ink: a touch deeper than PLACE_INK so triangles + names don't drown in
  // the relief shading.
  PEAK: lightPalette.ink,
  // Warm umber shadows and a parchment-white lift, so the mountains are made of the
  // same warm paper as the rest of the light map rather than sitting on it in grey.
  RELIEF_SHADOW: ['rgba(92,74,50,0.55)', 'rgba(92,74,50,0.26)', 'rgba(92,74,50,0.16)'],
  RELIEF_HIGHLIGHT: ['rgba(255,251,242,0.50)', 'rgba(255,251,242,0.22)', 'rgba(255,251,242,0.13)'],
  RELIEF_ACCENT: 'rgba(120,98,66,0.30)',
  // Bumped country-zoom shading (z6) from 0.30 → 0.40 so the Scandes range reads
  // as a real mountain spine rather than a flat strip — the user's main complaint.
  reliefStops: [0.42, 0.4, 0.3, 0.22],
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
  PLACE_INK: darkPalette.inkMuted,
  WATER_INK: '#7c8aa0',
  HALO: 'rgba(18,22,36,0.92)',
  BOUNDARY: 'rgba(220,228,255,0.14)',
  ROAD_MAJOR: 'rgba(220,228,255,0.38)',
  ROAD_MINOR: 'rgba(220,228,255,0.22)',
  RAIL: 'rgba(220,228,255,0.24)',
  // Glacier: a soft icy navy — visible enough to mark the high-mountain ice in
  // Lapland without spotlighting against the calm dark map.
  GLACIER: 'rgba(225,232,255,0.16)',
  // Wetland: cool muted, a touch lighter than LAND so myrar read as patches.
  WETLAND: 'rgba(130,150,180,0.14)',
  // Peak ink: warm pale ink so the small triangles read on the night map.
  PEAK: darkPalette.ink,
  // Cool near-black shadows and a pale moonlit highlight. The highlight is deliberately
  // weaker than light mode's: on a navy continent a bright ridge line is the fastest way
  // to make the map noisy, and the shadows alone carry enough form at these zooms.
  RELIEF_SHADOW: ['rgba(6,10,20,0.60)', 'rgba(6,10,20,0.28)', 'rgba(6,10,20,0.17)'],
  RELIEF_HIGHLIGHT: ['rgba(186,202,240,0.32)', 'rgba(186,202,240,0.15)', 'rgba(186,202,240,0.09)'],
  RELIEF_ACCENT: 'rgba(150,170,215,0.22)',
  reliefStops: [0.26, 0.26, 0.18, 0.12],
};

function buildStyle(c: BasemapPalette, name: string): StyleSpecification {
  return {
    version: 8,
    name,
    glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: PLANET },
      terrain: {
        type: 'raster-dem',
        tiles: [DEM],
        encoding: DEM_ENCODING,
        tileSize: DEM_TILE_SIZE,
        maxzoom: DEM_MAXZOOM,
        attribution: DEM_ATTRIBUTION,
      },
    },
    layers: [
      // Land base.
      { id: 'background', type: 'background', paint: { 'background-color': c.LAND } },

      // Shaded relief, computed from the elevation tiles rather than painted into them.
      //
      // POSITION IS LOAD-BEARING: this must stay above `background` and below `water`.
      // Both DEM sets encode BATHYMETRY, not just land, so a hillshade drawn above the
      // water fill would shade the Baltic seafloor — ridges and trenches showing through
      // the sea. The opaque water fill further down is what hides it.
      {
        id: 'relief',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          // `multidirectional` is the reason for the whole upgrade: one primary light
          // from the north-west (the cartographic convention) plus two fills from the
          // north-east and south-east, so slopes facing away from a single sun are
          // modelled instead of going flat black. It is also the only method that
          // accepts ARRAYS here — direction, altitude, shadow and highlight are read
          // per light source, and the three arrays must stay the same length.
          'hillshade-method': 'multidirectional',
          'hillshade-illumination-direction': [315, 45, 135],
          'hillshade-illumination-altitude': [55, 40, 30],
          // Anchored to the map, not the viewport, so the light stays north-west in
          // GEOGRAPHIC terms. Moot in practice — bonetider.tsx disables touchRotate, so
          // the map is always north-up and the two anchors coincide — but it is the
          // honest choice if rotation is ever restored.
          'hillshade-illumination-anchor': 'map',
          'hillshade-shadow-color': c.RELIEF_SHADOW,
          'hillshade-highlight-color': c.RELIEF_HIGHLIGHT,
          'hillshade-accent-color': c.RELIEF_ACCENT,
          'hillshade-exaggeration': [
            'interpolate', ['linear'], ['zoom'],
            3, c.reliefStops[0],
            6, c.reliefStops[1],
            9, c.reliefStops[2],
            12, c.reliefStops[3],
          ],
          resampling: 'linear',
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
      // Wetlands — Lapland's myrar, the Norrbotten/Västerbotten coastal marshes,
      // the Vänern/Vättern lowlands. Without this the sparse north reads as bare
      // land; with it the country picks up the texture it actually has.
      {
        id: 'wetland',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['wetland']]],
        paint: { 'fill-color': c.WETLAND, 'fill-antialias': false },
      },
      // Glaciers + permanent ice — Kebnekaise and the smaller high-mountain
      // glaciers along the Scandes. Pale icy fills that fill the high-north
      // visual void where towns are absent.
      {
        id: 'glacier',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['ice', 'glacier']]],
        paint: { 'fill-color': c.GLACIER, 'fill-antialias': true },
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

      // --- Transportation: roads + rail, tinted into the Nordic palette. ----
      //
      // Order matters in MapLibre: later layers paint above earlier ones, so rail goes
      // first (dashed background line), then minor roads, then majors on top — the road
      // hierarchy reads as ribbons widening with importance, never with the rail
      // crossing over a major route. All hairline-thin; the chrome (city dots, solar
      // wash, prayer lines) stays the visual lead at every zoom.

      // Railway — a quiet dashed hairline, visible mostly at city zoom and above.
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['==', ['get', 'class'], 'rail'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.RAIL,
          'line-dasharray': [2, 3],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.2],
        },
      },

      // Minor road network — primary + secondary trunks within cities. Appears later
      // than the motorway spine so it doesn't dominate the country view.
      {
        id: 'roads_minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.ROAD_MINOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 0.9, 16, 1.6],
        },
      },

      // Motorway / trunk — the E4, E6, E18 etc. The spine of Sweden's road network,
      // visible from country zoom so a user can see "the road they're driving" right
      // away. A touch wider than minor roads, and inked one notch stronger.
      {
        id: 'roads_major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.ROAD_MAJOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1.0, 12, 1.8, 16, 2.6],
        },
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

      // City labels from the tiles — Stockholm / Göteborg / Malmö + the regional
      // capitals (Uppsala, Linköping, Örebro …). Drawn from country zoom so the big
      // three are always visible. Replaces an earlier RN-overlay of curated city
      // dots/names that duplicated these same labels against the basemap. Body
      // weight a touch heavier than the towns layer so the hierarchy reads.
      {
        id: 'label_city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: [
          'all',
          ['==', ['get', 'class'], 'city'],
          ['!', ['in', SV_LABEL, ['literal', COPENHAGEN_NAMES]]],
        ],
        minzoom: 3,
        layout: {
          'text-field': SV_LABEL,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 13, 10, 16, 14, 19],
          'text-max-width': 8,
          'symbol-sort-key': [
            'match',
            SV_LABEL,
            PRIMARY_SWEDISH_CITIES,
            0,
            FEATURED_SWEDISH_CITIES,
            1,
            ['+', 10, ['coalesce', ['get', 'rank'], 99]],
          ],
          // Name sits OFF the place point (atlas-style), never centred on it: the RN
          // overlay draws the user's brass dot AT the chosen city's coordinates, and
          // it can't join the basemap's symbol collision — a centred label put the
          // dot mid-word ("Stoc●holm"). Every anchor listed here holds the point clear
          // at `text-radial-offset` ems, so that invariant survives whichever one wins.
          // `center` must never appear in this list; it is the bug.
          //
          // Variable rather than a single fixed anchor: with one hard-coded side, two
          // labels that collide mean MapLibre drops one outright. Given four candidates
          // it slides the loser to another side of its own point and keeps both. Order
          // is preference — 'bottom' anchors the text box's bottom edge to the point, so
          // the name still reads ABOVE it exactly as before wherever there is room, and
          // the alternatives only come into play where the label would otherwise vanish.
          'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
          // Replaces the old fixed `text-offset: [0, -0.5]` — same 0.5 em gap, now
          // applied along whichever direction the chosen anchor points. (`text-offset`
          // is ignored once a radial offset is set, so the two must not both be here.)
          'text-radial-offset': 0.5,
        },
        paint: {
          'text-color': c.PLACE_INK,
          'text-halo-color': c.HALO,
          'text-halo-width': 1.4,
        },
      },

      // Smaller Swedish towns and villages — fill in as you zoom into a region.
      // OpenMapTiles first emits towns at z7. Giving the two requested towns first
      // placement priority keeps that regional view useful without a curated overlay.
      {
        id: 'label_town',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['town', 'village']]],
        minzoom: 7,
        layout: {
          'text-field': SV_LABEL,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'],
            9, ['case', ['==', ['get', 'class'], 'town'], 11, 9],
            14, ['case', ['==', ['get', 'class'], 'town'], 14, 11.5],
          ],
          'text-max-width': 8,
          'symbol-sort-key': [
            'match',
            SV_LABEL,
            FEATURED_SWEDISH_TOWNS,
            0,
            ['+', 10, ['coalesce', ['get', 'rank'], 99]],
          ],
          // Same off-the-point anchoring as label_city (see there): the user can pick
          // ANY town from the places list, so every place label keeps its point clear
          // for the overlay's location dot. This layer benefits most from the variable
          // anchor — towns and villages crowd each other at z9-z12 in a way cities
          // never do at country zoom.
          'text-variable-anchor': ['bottom', 'top', 'left', 'right'],
          'text-radial-offset': 0.5,
        },
        paint: {
          'text-color': c.PLACE_INK,
          'text-halo-color': c.HALO,
          'text-halo-width': 1.2,
        },
      },

      // Mountain peaks — Kebnekaise, Sarektjåkkå, Helagsfjället and the other named
      // summits along the Scandes. Filtered by `rank` so only the biggest appear at
      // country zoom (otherwise the high-mountain region went to symbol-soup); more
      // peaks unlock as you zoom in. The label is name + elevation in metres, so a
      // user can read the spine of the country instead of an empty Norrland.
      //
      // `text-field` joins the name and an elevation suffix. `ele` is the integer
      // height in metres (OpenMapTiles schema). The optional MaterialIcons-style
      // triangle isn't available without a sprite, so we use a Unicode glyph (▲)
      // as a tiny ink mark in front of the name — keeps the layer sprite-free.
      {
        id: 'mountain_peak',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'mountain_peak',
        minzoom: 5,
        filter: [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['<=', ['coalesce', ['get', 'rank'], 99],
            ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 4, 11, 10, 13, 99],
          ],
        ],
        layout: {
          'text-field': [
            'format',
            '▲  ', { 'font-scale': 0.7 },
            ['coalesce', ['get', 'name:sv'], ['get', 'name:latin'], ['get', 'name'], ''], {},
            ['case', ['has', 'ele'], ['concat', '\n', ['get', 'ele'], ' m'], ''],
            { 'font-scale': 0.78, 'text-color': c.FAINT_INK },
          ],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 9, 12, 13, 13],
          'text-max-width': 8,
          'text-anchor': 'left',
          'text-offset': [0.4, 0],
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
        },
        paint: {
          'text-color': c.PEAK,
          'text-halo-color': c.HALO,
          'text-halo-width': 1.4,
          // The triangle is the icon-equivalent here, kept opacity-modulated to
          // recede at country zoom and lift in as you zoom into the mountains.
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 9, 0.95],
        },
      },
    ],
  } as unknown as StyleSpecification;
}

/** Warm parchment basemap (Nordic Calm, the original look). */
export const NORDIC_LIGHT: StyleSpecification = buildStyle(LIGHT, 'Nordic Calm — Light');

/** Cool deep navy basemap (Apple Maps-inspired dark mode). */
export const NORDIC_DARK: StyleSpecification = buildStyle(DARK, 'Nordic Calm — Dark');

/** Pick a basemap for the current OS appearance — Nordic style only. */
export function nordicMapStyleFor(scheme: ColorSchemeName): StyleSpecification {
  return scheme === 'dark' ? NORDIC_DARK : NORDIC_LIGHT;
}

/** Pick the app-owned Nordic style. Legacy persisted stock-style values are accepted
    by the type for migration, but deliberately resolve here too: a remote MapTiler
    style owns its label layers, so it cannot honour the no-Copenhagen policy without
    fetching/rewriting that style or adding a second label layer. */
export function mapStyleFor(
  _styleId: 'nordic' | 'standard' | 'satellite',
  scheme: ColorSchemeName,
): StyleSpecification {
  return nordicMapStyleFor(scheme);
}

/** Tile provider used by the Nordic style — drives the credits line in Om appen. */
export const TILES_PROVIDER: 'maptiler' | 'openfreemap' = USE_MAPTILER ? 'maptiler' : 'openfreemap';

/** Elevation provider behind the hillshade — also credited in Om appen. On the MapTiler
    path this is the same house as the vector tiles and the existing credit already
    covers it; on the free path AWS Terrain Tiles is a THIRD party whose data (SRTM,
    EU-DEM/Copernicus and friends) is not covered by the OSM or OpenFreeMap lines, so it
    needs a credit of its own. */
export const TERRAIN_PROVIDER: 'maptiler' | 'aws' = USE_MAPTILER ? 'maptiler' : 'aws';
