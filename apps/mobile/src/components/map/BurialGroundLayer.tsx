// The burial-ground POI layer — the Muslim sections of some eighty Swedish cemeteries —
// drawn the way MosqueLayer draws mosques, and for the same reasons (read its header first):
// a NATIVE source and symbol layer, so zoom gating, collision culling and hit-testing come
// free; drawn under the Skia wash, because a grave is a place on the ground; in the same warm
// gold as the mosque glyph, so the two read as one family and only the SHAPE tells a grave
// from a mosque.
//
// What it deliberately does NOT copy:
//   • No dust tier. The national-view snow answers "where are the mosques"; eighty more
//     specks in it would blur that answer for a question nobody asks at country scale. A
//     grave is looked for in a town, so it appears with the town-scale glyphs, at z7.
//   • No pressable/inert split of the data. MosqueLayer needs two sources over one dataset
//     so the dust cannot answer a tap; with no dust there is nothing to keep inert. The
//     selection ring still gets its own source without onPress, for the reason MosqueLayer
//     gives: a ring on the pressable source would become a tap target of its own.
//
// DRAW ORDER IS COLLISION PRIORITY. MapLibre places symbols from the top layer down, so this
// layer's slot sits BELOW MosqueLayer's (lib/map/layer-slots): where a cemetery and a mosque
// would collide, the mosque — what this app is for — keeps its place and the grave yields.
//
// The glyph is a bundled PNG pair (assets/map/burial-pin-{light,dark}.png) rendered by
// scripts/build-burial-pins.mjs from the one path both maps share,
// apps/web/src/lib/begravningsplatser/glyph.ts — see it for what the glyph draws and why it
// is not a crescent.
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { type BurialGround, burialGroundForPress, toFeatureCollection } from '@/lib/burial-grounds';
import { hapticLight } from '@/lib/haptics';
import { GLYPH_PRESENCE_STOPS, zoomExpression } from '@/lib/map/dust';
import { slotFor } from '@/lib/map/layer-slots';
import { useActiveScheme, useColors } from '@/theme/useColors';

import { GLYPH_HITBOX, PLACE_GOLD } from './MosqueLayer';
import { useFeatureSelection } from './useFeatureSelection';

const SOURCE_ID = 'burial-grounds';
const RING_SOURCE_ID = 'burial-grounds-ring';
const LAYER_ID = 'burial-ground-symbols';
const SELECTED_LAYER_ID = 'burial-ground-selected';
const IMAGE_ID = 'burial-pin';

// 48 px logical, MosqueLayer's GLYPH_PX, in PLACE_GOLD — so icon-size below scales a grave
// exactly as it scales a mosque.
const PINS = {
  light: require('../../../assets/map/burial-pin-light.png'),
  dark: require('../../../assets/map/burial-pin-dark.png'),
} as const;

interface Props {
  /** Tapped-burial-ground callback — the map screen lifts this into the detail card. */
  onSelect: (ground: BurialGround) => void;
  /** The burial ground whose card is open, if any — gets a ring. Null clears it. */
  selectedId?: string | null;
  styleRevision?: number;
}

export function BurialGroundLayer({ onSelect, selectedId, styleRevision = 0 }: Props) {
  const selectionSource = useFeatureSelection(selectedId, styleRevision);
  const c = useColors();
  const scheme = useActiveScheme();
  const data = useMemo(() => toFeatureCollection(), []);

  const handlePress = (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    // The nearest hit, not features[0] — see lib/map/nearestHit.
    const ground = burialGroundForPress(e.nativeEvent?.features, e.nativeEvent?.lngLat);
    if (!ground) return;
    // A source press bubbles to <Map onPress>, which clears the selection — MosqueLayer's
    // handler has the full story. Stopped only on a real hit, so a miss still dismisses.
    e.stopPropagation();
    hapticLight();
    onSelect(ground);
  };

  return (
    <>
      <Images images={{ [IMAGE_ID]: { source: PINS[scheme], sdf: false } }} />
      {/* The selection ring, on a source with no onPress, and ALWAYS mounted — its stroke
          appears through feature state when a card is open, so a selection never mounts or
          unmounts a layer. Its slot keeps it beneath the glyph (lib/map/layer-slots). */}
      <GeoJSONSource ref={selectionSource} id={RING_SOURCE_ID} data={data}>
        <Layer
          id={SELECTED_LAYER_ID}
          beforeId={slotFor('burial-ground-selected')}
          type="circle"
          paint={{
            'circle-opacity': 0,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 7, 13, 13, 20],
            'circle-stroke-color': PLACE_GOLD[scheme],
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={SOURCE_ID} data={data} onPress={handlePress} hitbox={GLYPH_HITBOX}>
        <Layer
          id={LAYER_ID}
          beforeId={slotFor('burial-ground-symbols')}
          type="symbol"
          minzoom={7}
          layout={{
            'icon-image': IMAGE_ID,
            // MosqueLayer's scale, so a grave and a mosque read at the same size.
            'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 13, 0.72],
            'icon-allow-overlap': false,
            'icon-optional': false,
            // The name drops before the glyph does, and only appears close in — as mosques.
            'text-optional': true,
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 11.5],
            'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
            'text-justify': 'auto',
            'text-offset': [0, 0.85],
            'text-allow-overlap': false,
            'text-padding': 6,
            'text-max-width': 8,
          }}
          paint={{
            'icon-opacity': zoomExpression(GLYPH_PRESENCE_STOPS) as never,
            'text-color': c.ink,
            'text-halo-color': c.paper,
            'text-halo-width': 1.4,
            'text-halo-blur': 0.3,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
