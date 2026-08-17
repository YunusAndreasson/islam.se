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
// It all draws UNDER the Skia wash by design: a mosque is a place on the ground, not
// chrome floating above the sky, and the dots reading as warm specks THROUGH the cool
// twilight is the point. The wash overlay is pointerEvents="none", so a tap falls
// straight through to the symbol layer and onPress fires (default 44×44 hitbox).
//
// ⚠️ TWO SOURCES over the same points, and the split is load-bearing: only the GLYPH tier
// may be tapped. A pressable source hit-tests EVERY layer it owns —
// `queryRenderedFeatures(pointWithHitbox, *pressableSource.getLayerIDs())` in the binding's
// MLRNMapView — so while the dust shared the pressable source, the 44×44 hitbox meant a tap
// anywhere within ~22 dp of a 1.2 px, 42 %-opacity speck opened a detail card. Below z7 the
// glyph layer does not exist at all, so at the national view the dust was the ONLY tap
// target: tapping southern Sweden reliably opened a card for a mosque nobody could see, let
// alone aim at. Across the z7–8 overlap both tiers answered and features[0] could be a dust
// dot belonging to a DIFFERENT mosque than the glyph under the finger. A second, plain
// GeoJSONSource (no onPress) makes the dust inert; 234 points indexed twice is nothing.
//
// The glyph isn't a bundled asset: we render MaterialCommunityIcons' `mosque` to a
// bitmap at the current theme's muted-ink colour (getImageSource) and register it via
// <Images>. That keeps a real mosque silhouette without shipping an SDF, and it re-tints
// itself when the OS light/dark theme flips.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType, NativeSyntheticEvent } from 'react-native';

import { hapticLight } from '@/lib/haptics';
import { type Mosque, mosqueById, toFeatureCollection } from '@/lib/mosques';
import { useActiveScheme, useColors } from '@/theme/useColors';

const SOURCE_ID = 'mosques';
const DUST_SOURCE_ID = 'mosques-dust';
const LAYER_ID = 'mosque-symbols';
const DUST_LAYER_ID = 'mosque-dust';
// Rendered glyph size in px; scaled DOWN on the map by icon-size so the marker stays a
// quiet ~20–26 px place mark, never a billboard.
const GLYPH_PX = 48;

// Each mosque is one tiny, soft warm dot — a "snow" dusting, not a glow. A per-scheme colour +
// master opacity (`peak`) is all the circle layer needs; radius / blur / the zoom crossfade live
// on the layer itself. Kept intentionally faint: mosques are a SECONDARY feature that should only
// hint "zoom in here", never a field that competes with the prayer lines.
type DotStyle = {
  /** Opaque hex — the dot's alpha comes from circle-opacity (`peak`), not the colour.
   *  ALSO the colour the zoomed-in glyph is rasterised in, so the dot literally becomes
   *  the mosque as you zoom (see glyphColor). */
  color: string;
  /** Dot opacity at the national view; tapers to 0 by the glyph handoff. */
  peak: number;
};
// Dark: a warm pale-gold fleck glinting on the navy basemap through the twilight wash.
// 9.87:1 on the navy land — comfortably past the 3:1 a non-text UI element needs.
const SNOW_DARK: DotStyle = { color: '#e8c894', peak: 0.5 };
// Light: a deeper muted brass so the tiny dot still registers on warm parchment (a pale fleck
// would vanish there), a touch lower to match the lighter ground. 4.20:1 on parchment — which
// is what settled the "does gold work in light mode too?" question: it does, but only at THIS
// weight. The dark mode's pale gold would be 1.4:1 there, i.e. invisible.
const SNOW_LIGHT: DotStyle = { color: '#967038', peak: 0.42 };

interface Props {
  /** Tapped-mosque callback — the map screen lifts this into the detail card. */
  onSelect: (mosque: Mosque) => void;
}

export function MosqueLayer({ onSelect }: Props) {
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
  // Changing this back is one line — glyphColor = c.inkMuted.
  const glyphColor = snow.color;
  // The rendered glyph as a full RN image source (keeps `scale` so the retina bitmap
  // isn't drawn double-size), or null until it resolves / if it never does.
  const [icon, setIcon] = useState<ImageSourcePropType | null>(null);

  const data = useMemo(() => toFeatureCollection(), []);

  useEffect(() => {
    let mounted = true;
    // Rasterises the vector glyph to a bitmap. try/catch guards environments where the
    // native rasteriser is absent (jsdom under test); .catch handles async rejection.
    // Either way a missing glyph leaves the layer un-rendered, never crashing the map.
    try {
      void MaterialCommunityIcons.getImageSource('mosque', GLYPH_PX, glyphColor)
        .then((src) => {
          // getImageSource resolves to { uri, scale, width, height } — pass the whole
          // thing so MapLibre honours the device pixel ratio.
          if (mounted && src && typeof src === 'object' && 'uri' in src) {
            setIcon(src);
          }
        })
        .catch(() => {});
    } catch {
      // no-op
    }
    return () => {
      mounted = false;
    };
  }, [glyphColor]);

  const handlePress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const feature = e.nativeEvent?.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id !== 'string') return;
    const mosque = mosqueById(id);
    if (!mosque) return;
    // A source press BUBBLES to <Map onPress>, which clears the selection — so opening a
    // card would immediately close it again. Stopping here is the pairing the binding
    // documents on MapProps.onPress ("to prevent this use event.stopPropagation() in the
    // Source handler"). Called only on a real hit, so a tap that finds no mosque still
    // reaches the map and dismisses whatever card is open.
    e.stopPropagation();
    // A control landing synchronously under the finger — the one place the haptics
    // policy allows a tick on a tap (opening a screen is otherwise silent feedback).
    hapticLight();
    onSelect(mosque);
  };

  return (
    <>
      {/* Register the glyph bitmap only once it has rasterised — the symbol layer below
          is gated on the same icon, so the source never references a missing image. The
          dust tier does NOT wait on it: at the national view (where the dust lives) the
          few-ms raster is long done, and gating the country-scale view on a city-scale
          glyph would be backwards. */}
      {icon && <Images images={{ 'mosque-pin': { source: icon, sdf: false } }} />}
      {/* DUST — its own source, deliberately WITHOUT onPress (see the header): the specks
          are a hint to zoom in, never a tap target. Declared first so it keeps drawing
          beneath the glyphs across the z7–8 crossfade. */}
      <GeoJSONSource id={DUST_SOURCE_ID} data={data}>
        {/* The national-view "snow": one tiny soft dot per mosque. maxzoom caps native
            work once the crossfade has handed off to the glyphs (opacity already 0 by then). */}
        <Layer
          id={DUST_LAYER_ID}
          type="circle"
          maxzoom={8}
          paint={{
            'circle-color': snow.color,
            // Tiny — a snow fleck at national zoom, growing only slightly toward the glyph
            // handoff. Small enough that even 235 of them read as a light dusting, not clutter.
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 6, 1.7, 8, 2.6],
            // A little blur turns each hard pixel into a soft speck (snow, not confetti).
            'circle-blur': 0.4,
            // Crossfade: fade in by the national view (z4 — the fully zoomed-out state the layer
            // exists to fix), hold through the regional view, then taper to 0 by ~z7.8 as the
            // glyphs (minzoom 7) fade in — a dissolve, not a pop. A short lead-in below z4 keeps
            // an even-further-out view (all of Scandinavia) from snapping on abruptly.
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.4,
              0,
              4,
              snow.peak,
              6.4,
              snow.peak,
              7.8,
              0,
            ],
          }}
        />
      </GeoJSONSource>
      {/* GLYPHS — the city-view place marks, and the ONLY tappable tier. Only mount once
          the icon bitmap exists so the layer never paints a "missing image" box. */}
      <GeoJSONSource id={SOURCE_ID} data={data} onPress={handlePress}>
        {icon && (
          <Layer
            id={LAYER_ID}
            type="symbol"
            minzoom={7}
            layout={{
              'icon-image': 'mosque-pin',
              // Small, and grows only gently with zoom — a place mark, not a billboard.
              'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 13, 0.72],
              // Icons thin themselves out at low zoom instead of clumping (POI behaviour).
              'icon-allow-overlap': false,
              'icon-optional': false,
              // WHICH mosque survives that thinning. With both allow-overlaps false, the
              // spec's default symbol-z-order ("auto") falls back to SOURCE order — so in
              // Malmö (twelve mosques) placement was decided by how data.json happens to be
              // sorted, i.e. by county spelling, and the survivors reshuffled on every pan.
              // `sort` is the opening year, undated mosques last (see toFeatureCollection):
              // lower key = placed first, so the established ones hold the crowded views.
              'symbol-sort-key': ['get', 'sort'],
              // The name is a bonus, not required — it drops before the icon does.
              'text-optional': true,
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              // Labels appear only when zoomed in close: size interpolates up from 0.
              'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 11.5],
              // A name that collides above its icon gets to try the other three sides
              // before it gives up, instead of vanishing outright — which is what a fixed
              // 'text-anchor': 'top' meant in exactly the dense city views where the names
              // matter most. `text-anchor` is @disabledBy this and so is gone; `text-offset`
              // stays and is read as an ABSOLUTE distance, applied per winning anchor.
              'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
              'text-justify': 'auto',
              'text-offset': [0, 0.85],
              'text-allow-overlap': false,
              'text-padding': 6,
              'text-max-width': 8,
            }}
            paint={{
              // Fade the glyph in as it enters, and keep it a touch soft — quiet, not loud.
              'icon-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 9, 0.95],
              'text-color': c.ink,
              // Halo in the ground colour (parchment / navy) so the name reads over the
              // solar wash — the same trick the basemap's own town labels use.
              'text-halo-color': c.paper,
              'text-halo-width': 1.4,
              'text-halo-blur': 0.3,
            }}
          />
        )}
      </GeoJSONSource>
    </>
  );
}
