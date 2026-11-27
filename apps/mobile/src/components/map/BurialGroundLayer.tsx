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
//
// DRAW ORDER IS COLLISION PRIORITY. MapLibre places symbols from the top layer down, so this
// layer's slot sits BELOW MosqueLayer's (lib/map/layer-slots): where a cemetery and a mosque
// would collide, the mosque — what this app is for — keeps its place and the grave yields.
//
// The glyph is a bundled PNG pair (assets/map/burial-pin-{light,dark}.png) rendered by
// scripts/build-map-pins.mjs from the one path both maps share,
// apps/web/src/lib/begravningsplatser/glyph.ts — see it for what the glyph draws and why it
// is not a crescent.
import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import { toFeatureCollection } from '@/lib/burial-grounds';
import { GLYPH_MIN_ZOOM } from '@/lib/map/dust';
import { slotFor } from '@/lib/map/layer-slots';
import { useActiveScheme, useColors } from '@/theme/useColors';

import { PLACE_GOLD, placeGlyphLayout, placeGlyphPaint, placeRingPaint } from './place-layer-style';
import { useFeatureSelection } from './useFeatureSelection';

const SOURCE_ID = 'burial-grounds';
const LAYER_ID = 'burial-ground-symbols';
const SELECTED_LAYER_ID = 'burial-ground-selected';
const IMAGE_ID = 'burial-pin';

// 48 px logical in PLACE_GOLD, the size MosqueLayer's pins are rendered at too — so
// icon-size below scales a grave exactly as it scales a mosque.
const PINS = {
  light: require('../../../assets/map/burial-pin-light.png'),
  dark: require('../../../assets/map/burial-pin-dark.png'),
} as const;

interface Props {
  /** The burial ground whose card is open, if any — gets a ring. Null clears it. */
  selectedId?: string | null;
  styleRevision?: number;
}

export function BurialGroundLayer({ selectedId, styleRevision = 0 }: Props) {
  const selectionSource = useFeatureSelection(selectedId, styleRevision);
  const c = useColors();
  const scheme = useActiveScheme();
  const data = useMemo(() => JSON.stringify(toFeatureCollection()), []);

  return (
    <>
      <Images images={{ [IMAGE_ID]: { source: PINS[scheme], sdf: false } }} />
      <GeoJSONSource ref={selectionSource} id={SOURCE_ID} data={data}>
        <Layer
          id={SELECTED_LAYER_ID}
          beforeId={slotFor('burial-ground-selected')}
          type="circle"
          paint={placeRingPaint(PLACE_GOLD[scheme])}
        />
        <Layer
          id={LAYER_ID}
          beforeId={slotFor('burial-ground-symbols')}
          type="symbol"
          minzoom={GLYPH_MIN_ZOOM}
          layout={{ ...placeGlyphLayout, 'icon-image': IMAGE_ID }}
          paint={placeGlyphPaint(c)}
        />
      </GeoJSONSource>
    </>
  );
}
