// The mosque POI layer — Sweden's ~235 mosques on the basemap as quiet, zoom-gated
// places, NOT attention-grabbing pins. It renders as a NATIVE MapLibre source+layers
// (a child of <Map>), unlike the app's other overlays (the solar wash / prayer pills,
// which are RN/Skia siblings projected over the map). Going native buys things for free
// that would be painful to hand-roll over hundreds of points: zoom gating, collision
// culling, and hit-testing.
//
// TWO TIERS, crossfading by zoom so a mosque always reads at the right scale:
//   • DUST  (circle, z≲8) — at the fully-zoomed-out national view a mosque glyph would be an
//     invisible speck, so instead each of the ~235 mosques renders as a tiny, soft warm dot:
//     a fine "snow" dusting scattered across the country, naturally denser where mosques
//     concentrate (the south / the metros) and sparse in the north — a truthful "where the
//     mosques are" without a heavy glow. Mosques are a SECONDARY feature, so this is only a
//     quiet hint that invites a zoom-in, deliberately never loud enough to unseat the solar
//     field as the hero. (A circle layer, NOT a heatmap: every mosque shows as its own dot
//     independent of its neighbours, so lone rural mosques still appear — the old heatmap
//     pooled them into city blobs and dropped isolated ones below its density floor, and even
//     dialled right down it read as an attention-grabbing glow rather than a light dusting.)
//   • GLYPHS (symbol, z≥7) — as you zoom into a city the dots fade out and the muted
//     mosque silhouettes fade in (icon-size stays small — a place mark, not a billboard),
//     names only when zoomed in close (text-size → 0 below ~z12). Collision keeps them
//     from overlapping each other or the basemap's own town labels.
// The two overlap across ~z7–8, so the dust dissolves INTO the glyphs rather than
// popping. (History: this layer used to render NOTHING below z7, which left the national
// view with no mosque impression at all — the dust tier fixes exactly that.)
//
// It all draws UNDER the Skia wash — a sibling view over the whole map, so nothing native
// can draw above it. That used to be argued as the point ("warm specks THROUGH the cool
// twilight"), and at Maghrib and ʿIshāʾ it simply drowned them: the reader could hardly see
// a mosque. The wash now clears a soft hole around each speck instead (SolarSkiaOverlay),
// so the specks keep their own colour at every hour while staying native — aligned with
// the basemap to the pixel. The speck's zoom curves live in lib/map/dust for exactly that
// reason: the hole has to match the speck it uncovers. The glyph tier is not cleared, since
// collision hides an unknown subset of glyphs and a hole where one was culled would be an
// empty patch of daylight. The wash overlay is pointerEvents="none", so a tap falls
// through to the map. The map tests only the rendered glyph layer after a tap.
// Dust and the selection ring share its data but never enter the hit test.
//
// DRAW ORDER. Every layer here is inserted beneath its own placeholder at the end of the
// basemap style (lib/map/layer-slots), so these draw above the basemap's own labels in a
// fixed order, whenever they mount. That is not the same thing as winning a COLLISION: MapLibre Native
// has collided symbols across sources since v4.0, so mosque glyphs and town labels already
// keep out of each other's way, and which one yields is decided by MapLibre's placement
// order — which we have NOT verified against the native renderer. If mosque names start
// losing to town names in the dense city views, `beforeId` on these layers is the knob; do
// not turn it blind, because guessing the direction wrong drops mosque glyphs instead.
//
// THE GLYPH IS A BUNDLED IMAGE, one per theme, like the burial ground's beside it. It used
// to be drawn on the device: @expo/vector-icons rasterised Material Design Icons' `mosque`
// from its font at runtime, in an effect, and the symbol layer waited on a piece of state
// for the result — so the glyph tier mounted a beat after the map, and a whole icon font
// shipped to draw one shape. scripts/build-map-pins.mjs now renders that same outline to
// PNGs in PLACE_GOLD; the theme flip picks the other file.
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import {
  DUST_PRESENCE_STOPS,
  DUST_RADIUS_STOPS,
  GLYPH_MIN_ZOOM,
  zoomExpression,
} from '@/lib/map/dust';
import { slotFor } from '@/lib/map/layer-slots';
import { toFeatureCollection } from '@/lib/mosques';
import { useActiveScheme, useColors } from '@/theme/useColors';
import { PLACE_GOLD, placeGlyphLayout, placeGlyphPaint, placeRingPaint } from './place-layer-style';
import { useFeatureSelection } from './useFeatureSelection';

const SOURCE_ID = 'mosques';
const LAYER_ID = 'mosque-symbols';
const DUST_LAYER_ID = 'mosque-dust';
const SELECTED_LAYER_ID = 'mosque-selected';
// 48 px logical in PLACE_GOLD (the script's BASE_PX), scaled DOWN on the map by icon-size
// so the marker stays a quiet ~20–26 px place mark, never a billboard.
const PINS = {
  light: require('../../../assets/map/mosque-pin-light.png'),
  dark: require('../../../assets/map/mosque-pin-dark.png'),
} as const;

// Each mosque is one tiny, soft warm dot — a "snow" dusting, not a glow. A per-scheme colour +
// master opacity (`peak`) is all the circle layer needs; radius / blur / the zoom crossfade live
// on the layer itself. Kept intentionally faint: mosques are a SECONDARY feature that should only
// hint "zoom in here", never a field that competes with the prayer lines.
type DotStyle = {
  /** Opaque hex — the dot's alpha comes from circle-opacity (`peak`), not the colour.
   *  ALSO the colour the zoomed-in glyph is drawn in (the bundled pins are PLACE_GOLD), so
   *  the dot literally becomes the mosque as you zoom. */
  color: string;
  /** Dot opacity at the national view; tapers to 0 by the glyph handoff. */
  peak: number;
};
// Dark: a warm pale-gold fleck glinting on the navy basemap through the twilight wash.
// 9.87:1 on the navy land — comfortably past the 3:1 a non-text UI element needs.
const SNOW_DARK: DotStyle = { color: PLACE_GOLD.dark, peak: 0.5 };
// Light: a deeper muted brass so the tiny dot still registers on warm parchment (a pale fleck
// would vanish there), a touch lower to match the lighter ground. 4.20:1 on parchment — which
// is what settled the "does gold work in light mode too?" question: it does, but only at THIS
// weight. The dark mode's pale gold would be 1.4:1 there, i.e. invisible.
const SNOW_LIGHT: DotStyle = { color: PLACE_GOLD.light, peak: 0.42 };


interface Props {
  /** The mosque whose card is open, if any — gets a ring so the card has a visible anchor
   *  on the map. Null clears it. */
  selectedId?: string | null;
  /** Changes when the basemap style reloads and loses its native feature state. */
  styleRevision?: number;
}

export function MosqueLayer({ selectedId, styleRevision = 0 }: Props) {
  const selectionSource = useFeatureSelection(selectedId, styleRevision);
  const c = useColors();
  const scheme = useActiveScheme();
  // Warm — a mosque reads as emitted place-light against the cool field.
  const snow = scheme === 'dark' ? SNOW_DARK : SNOW_LIGHT;
  // The glyph wears the SAME warm gold as the dust dot it replaces. It used to be neutral
  // muted ink, on the rule that brass stays reserved for the "live now" prayer signal —
  // but that rule was already bent for the dot, so zooming in turned a gold fleck into a
  // grey building for no reason a user could name. One colour across the whole zoom range
  // makes the handoff read as the same object getting closer.
  //
  // The reservation still holds where it matters: the "live now" brass is the palette's
  // c.highlight family and it moves, pulses or counts down. Mosques are static ground.
  // (The gold is in the bundled pins now: a different colour means re-running the script.)

  const data = useMemo(() => JSON.stringify(toFeatureCollection()), []);

  return (
    <>
      <Images images={{ 'mosque-pin': { source: PINS[scheme], sdf: false } }} />
      <GeoJSONSource ref={selectionSource} id={SOURCE_ID} data={data}>
        {/* The national-view "snow": one tiny soft dot per mosque. maxzoom caps native
            work once the crossfade has handed off to the glyphs (opacity already 0 by then). */}
        <Layer
          id={DUST_LAYER_ID}
          beforeId={slotFor('mosque-dust')}
          type="circle"
          maxzoom={8}
          paint={{
            'circle-color': snow.color,
            // Tiny — a snow fleck at national zoom, growing only slightly toward the glyph
            // handoff. Small enough that even 235 of them read as a light dusting, not clutter.
            'circle-radius': zoomExpression(DUST_RADIUS_STOPS),
            // A little blur turns each hard pixel into a soft speck (snow, not confetti).
            'circle-blur': 0.4,
            // Crossfade: in by the national view, out by ~z7.8 as the glyphs fade in — a
            // dissolve, not a pop. See DUST_PRESENCE_STOPS; the wash's holes follow it too.
            'circle-opacity': zoomExpression(DUST_PRESENCE_STOPS, snow.peak),
          }}
        />
        {/* Feature state reveals the ring without mounting a new layer above the glyph. */}
        <Layer
          id={SELECTED_LAYER_ID}
          beforeId={slotFor('mosque-selected')}
          type="circle"
          paint={placeRingPaint(snow.color)}
        />
        <Layer
          id={LAYER_ID}
          beforeId={slotFor('mosque-symbols')}
          type="symbol"
          minzoom={GLYPH_MIN_ZOOM}
          layout={{
            ...placeGlyphLayout,
            'icon-image': 'mosque-pin',
            // Prioritize older mosques when symbols collide.
            'symbol-sort-key': ['get', 'sort'],
          }}
          paint={placeGlyphPaint(c)}
        />
      </GeoJSONSource>
    </>
  );
}
