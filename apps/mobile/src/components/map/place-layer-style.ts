import type { CircleLayerSpecification, SymbolLayerSpecification } from '@maplibre/maplibre-react-native';

import { GLYPH_MIN_ZOOM, GLYPH_PRESENCE_STOPS, zoomExpression } from '@/lib/map/dust';
import type { Palette } from '@/theme/tokens';

/** The bundled mosque and burial pins are drawn in these (scripts/build-map-pins.mjs). */
export const PLACE_GOLD = { light: '#967038', dark: '#e8c894' } as const;

export const placeGlyphLayout: NonNullable<SymbolLayerSpecification['layout']> = {
  'icon-size': ['interpolate', ['linear'], ['zoom'], GLYPH_MIN_ZOOM, 0.4, 13, 0.72],
  'icon-allow-overlap': false,
  'icon-optional': false,
  'text-optional': true,
  'text-field': ['get', 'name'],
  'text-font': ['Noto Sans Regular'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 11.5],
  // A radial offset follows the selected anchor. The RN binding does not forward
  // text-variable-anchor-offset even though it exists in the standalone style spec.
  'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
  'text-radial-offset': 0.85,
  'text-justify': 'auto',
  'text-allow-overlap': false,
  'text-padding': 6,
  'text-max-width': 8,
};

export function placeGlyphPaint({ ink, paper }: Pick<Palette, 'ink' | 'paper'>): SymbolLayerSpecification['paint'] {
  return {
    'icon-opacity': zoomExpression(GLYPH_PRESENCE_STOPS),
    'text-color': ink,
    'text-halo-color': paper,
    'text-halo-width': 1.4,
    'text-halo-blur': 0.3,
  };
}

export function placeRingPaint(color: string): CircleLayerSpecification['paint'] {
  return {
    'circle-opacity': 0,
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 7, 13, 13, 20],
    'circle-stroke-color': color,
    'circle-stroke-width': 1.5,
    'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
  };
}
