// The mosque POI layer — Sweden's ~255 mosques on the basemap as quiet, zoom-gated
// places, NOT attention-grabbing pins. It renders as a NATIVE MapLibre source+layers
// (a child of <Map>), unlike the app's other overlays (the solar wash / prayer pills,
// which are RN/Skia siblings projected over the map). Going native buys things for free
// that would be painful to hand-roll over hundreds of points: zoom gating, collision
// culling, hit-testing, and — the reason for the two-tier design below — a GPU density
// field that pools light across all 255 points at national zoom without 255 blurs.
//
// TWO TIERS, crossfading by zoom so a mosque always reads at the right scale:
//   • GLOW  (heatmap, z≲8) — at the fully-zoomed-out national view the individual glyphs
//     would be invisible specks, so instead a warm single-hue heatmap pools soft light
//     where mosques concentrate: Stockholm / Göteborg / Malmö glow, the sparse north
//     stays dark — a truthful, beautiful "where the mosques are" field. In dark mode it
//     reads as lantern/city light through the twilight wash; in light mode as a gentle
//     warm bloom on the parchment. A single warm ramp (not a thermal green→red heatmap)
//     is what makes it illumination rather than data-viz. It is deliberately SUBTLE — an
//     accent, never loud enough to unseat the solar field as the hero.
//   • GLYPHS (symbol, z≥7) — as you zoom into a city the glow fades out and the muted
//     mosque silhouettes fade in (icon-size stays small — a place mark, not a billboard),
//     names only when zoomed in close (text-size → 0 below ~z12). Collision keeps them
//     from overlapping each other or the basemap's own town labels.
// The two overlap across ~z7–8, so the glow dissolves INTO the glyphs rather than
// popping. (History: this layer used to render NOTHING below z7, which left the national
// view with no mosque impression at all — the glow tier fixes exactly that.)
//
// It all draws UNDER the Skia wash by design: a mosque is a place on the ground, not
// chrome floating above the sky, and the glow reading as warm light THROUGH the cool
// twilight is the point. The wash overlay is pointerEvents="none", so a tap falls
// straight through to the symbol layer and onPress fires (default 44×44 hitbox).
//
// The glyph isn't a bundled asset: we render MaterialCommunityIcons' `mosque` to a
// bitmap at the current theme's muted-ink colour (getImageSource) and register it via
// <Images>. That keeps a real mosque silhouette without shipping an SDF, and it re-tints
// itself when the OS light/dark theme flips.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType, NativeSyntheticEvent } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { type Mosque, mosqueById, toFeatureCollection } from '../../lib/mosques';
import { useActiveScheme, useColors } from '../../theme/useColors';

const SOURCE_ID = 'mosques';
const LAYER_ID = 'mosque-symbols';
const GLOW_LAYER_ID = 'mosque-glow';
// Rendered glyph size in px; scaled DOWN on the map by icon-size so the marker stays a
// quiet ~20–26 px place mark, never a billboard.
const GLYPH_PX = 48;

// The illumination ramp maps heatmap density (0→1) to a warm glow. Kept to a SINGLE hue
// family (transparent gold → luminous core) so it reads as pooled light, not a thermal
// map. Stop 0 is the warm hue at alpha 0 — never `transparent` (= black@0), which would
// ring each pool with a faint dark fringe (the same trap the wash gradient avoids).
//
// TRANSPARENT FLOOR: the ramp holds fully transparent up through a low density before any
// colour appears. That floor is what keeps the overview CLEAN rather than "dirty" — the
// broadly-populated south otherwise fills with a diffuse low-density warm veil that mixes
// with the cool twilight wash into a muddy brown smear. With the floor, only genuine
// concentrations light up as crisp gold pools on clean dark ground; the smear is gone.
type GlowRamp = {
  color: ExpressionSpecification;
  /** Master opacity at the national view; tapers to 0 by the glyph handoff. */
  peak: number;
};
// Dark: clean amber pools brightening to a rich warm-gold core at the densest cities —
// the hero case, glowing up through the navy basemap + thin twilight wash. No brown ember
// at the low end (brown-on-navy is exactly what read as "dirty"); it goes straight from
// transparent to a clean amber once density is real.
const GLOW_DARK: GlowRamp = {
  color: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(210,164,88,0)',
    // Hold transparent through the diffuse low-density fog — this is the anti-"dirty" floor.
    0.2,
    'rgba(210,164,88,0)',
    // Glow begins only where mosques actually concentrate, as a clean amber (not brown).
    0.4,
    'rgba(216,168,90,0.42)',
    0.62,
    'rgba(232,190,116,0.66)',
    0.82,
    'rgba(244,208,140,0.85)',
    // Densest city cores stay a rich warm gold, not a blown-out cream-white — lantern
    // light, not a hotspot.
    1,
    'rgba(250,226,168,0.96)',
  ],
  peak: 0.72,
};
// Light: a gentle brass bloom on the warm parchment — same transparent floor so it never
// becomes a stain, golden (not brown), and lower in both ramp-alpha and master opacity.
const GLOW_LIGHT: GlowRamp = {
  color: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(190,140,52,0)',
    0.2,
    'rgba(190,140,52,0)',
    0.42,
    'rgba(196,148,60,0.28)',
    0.66,
    'rgba(206,162,80,0.42)',
    0.85,
    'rgba(218,182,108,0.52)',
    1,
    'rgba(230,200,138,0.6)',
  ],
  peak: 0.5,
};

interface Props {
  /** Tapped-mosque callback — the map screen lifts this into the detail card. */
  onSelect: (mosque: Mosque) => void;
}

export function MosqueLayer({ onSelect }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // The glow tier IS allowed brass — it's light emitted by a place, not a UI accent, so
  // it doesn't collide with the "live now" reservation the way a brass glyph would.
  const glow = scheme === 'dark' ? GLOW_DARK : GLOW_LIGHT;
  // Muted ink, not accent/brass: a mosque GLYPH reads as a neutral place on the map, and
  // brass stays reserved for the "live now" prayer signal. `c` (and thus glyphColor)
  // changes when the OS theme flips, which re-renders the glyph at the new colour.
  const glyphColor = c.inkMuted;
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
    // A control landing synchronously under the finger — the one place the haptics
    // policy allows a tick on a tap (opening a screen is otherwise silent feedback).
    hapticLight();
    onSelect(mosque);
  };

  return (
    <>
      {/* Register the glyph bitmap only once it has rasterised — the symbol layer below
          is gated on the same icon, so the source never references a missing image. The
          glow tier does NOT wait on it: at the national view (where the glow lives) the
          few-ms raster is long done, and gating the country-scale hero on a city-scale
          glyph would be backwards. */}
      {icon && <Images images={{ 'mosque-pin': { source: icon, sdf: false } }} />}
      <GeoJSONSource id={SOURCE_ID} data={data} onPress={handlePress}>
        {/* GLOW — the national-view illumination. maxzoom caps native work once the
            crossfade has handed off to the glyphs (opacity already 0 by then). All five
            heatmap knobs are paint props; keys are kebab-case (the RN lib camel-cases
            them) and the `['heatmap-density']` token inside the ramp passes through. */}
        <Layer
          id={GLOW_LAYER_ID}
          type="heatmap"
          maxzoom={8}
          paint={{
            // Radius (px) of one point's influence: kept tight at national zoom so metros
            // pool into crisp light instead of smearing into a haze (a wide radius over the
            // dense south is what made the overview read "dirty"), softening as it grows.
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 6, 16, 8, 36],
            // Global multiplier — lifted a touch with zoom so lone rural mosques still
            // register a faint warm dot rather than vanishing.
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 1.1, 7, 1.5],
            'heatmap-color': glow.color,
            // Crossfade: reach full strength by the national view (z4 — the fully
            // zoomed-out state the layer exists to fix), hold through the regional view,
            // then taper to 0 by ~z7.8 as the glyphs (minzoom 7) fade in — a dissolve,
            // not a pop. A short lead-in below z4 keeps an even-further-out view (all of
            // Scandinavia) from snapping on abruptly.
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3.4,
              0,
              4,
              glow.peak,
              6.4,
              glow.peak,
              7.8,
              0,
            ],
          }}
        />
        {/* GLYPHS — the city-view place marks. Only mount once the icon bitmap exists so
            the layer never paints a "missing image" box. */}
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
              // The name is a bonus, not required — it drops before the icon does.
              'text-optional': true,
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              // Labels appear only when zoomed in close: size interpolates up from 0.
              'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 11.5],
              'text-anchor': 'top',
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
