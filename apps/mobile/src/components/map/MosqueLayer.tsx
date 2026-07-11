// The mosque POI layer — Sweden's ~255 mosques as quiet, zoom-gated places on the
// basemap, NOT attention-grabbing pins. It renders as a NATIVE MapLibre source+layer
// (a child of <Map>), unlike the app's other overlays (the solar wash / prayer pills,
// which are RN/Skia siblings projected over the map). Going native buys three things
// for free that would be painful to hand-roll over hundreds of points:
//   • zoom gating   — nothing at the national view (the solar field stays the hero);
//                     glyphs fade in only as you zoom into a city (layer minzoom),
//                     names only when you're zoomed in close (text-size → 0 below ~z12).
//   • collision     — icons/labels thin themselves out and never overlap each other or
//                     the basemap's own town labels (allow-overlap: false).
//   • hit-testing   — a tap resolves to the pressed mosque via the source's onPress.
//
// It draws UNDER the Skia wash by design: a mosque is a place on the ground, not chrome
// floating above the sky. The wash overlay is pointerEvents="none", so a tap falls
// straight through to this native layer and onPress fires (default 44×44 hitbox).
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

import { hapticLight } from '../../lib/haptics';
import { type Mosque, mosqueById, toFeatureCollection } from '../../lib/mosques';
import { useColors } from '../../theme/useColors';

const SOURCE_ID = 'mosques';
const LAYER_ID = 'mosque-symbols';
// Rendered glyph size in px; scaled DOWN on the map by icon-size so the marker stays a
// quiet ~20–26 px place mark, never a billboard.
const GLYPH_PX = 48;

interface Props {
  /** Tapped-mosque callback — the map screen lifts this into the detail card. */
  onSelect: (mosque: Mosque) => void;
}

export function MosqueLayer({ onSelect }: Props) {
  const c = useColors();
  // Muted ink, not accent/brass: a mosque reads as a neutral place on the map, and
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

  // Gate on the glyph so the layer never paints a "missing image" box. Mosques only
  // surface at zoom ≥ 7, so the few ms this waits is never on screen at first paint.
  if (!icon) return null;

  return (
    <>
      <Images images={{ 'mosque-pin': { source: icon, sdf: false } }} />
      <GeoJSONSource id={SOURCE_ID} data={data} onPress={handlePress}>
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
      </GeoJSONSource>
    </>
  );
}
