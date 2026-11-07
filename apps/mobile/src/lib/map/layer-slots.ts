// Where each of the app's own map layers sits in the style, bottom to top.
//
// MapLibre appends a layer that names no anchor to the TOP of the style at the moment it is
// added, so the stack used to be whatever order the layers happened to arrive in:
//   • the mosque glyphs mount only once their bitmap has rasterised, after the reader's dot;
//   • a layer switched back on in Inställningar lands above everything mounted before it;
//   • after every theme change Android re-adds the app's sources from a HashMap, in hash
//     order — which put the reader's dot beneath every mosque layer and dropped the qibla
//     ray to the bottom (MLRNMapView.kt keeps `mSources` in a HashMap).
//
// The basemap style therefore ends with one invisible placeholder per app layer, in the
// order below, and each app layer is inserted directly beneath its own placeholder
// (`beforeId`). The placeholders are part of every style the map loads, so the anchor
// always exists, and the result no longer depends on when anything mounted.
import type { LayerSpecification } from '@maplibre/maplibre-react-native';

/** The app's layers, bottom to top. Mosques above burial grounds, so a mosque wins the
 *  symbol collision where the two meet; the reader's own mark above everything. */
export const APP_LAYER_ORDER = [
  'burial-ground-selected',
  'burial-ground-symbols',
  'mosque-dust',
  'mosque-selected',
  'mosque-symbols',
  'location-qibla-line',
  'location-glow',
  'location-dot',
] as const;

export type AppLayerId = (typeof APP_LAYER_ORDER)[number];

/** The placeholder `layer` is inserted beneath — pass it as the layer's `beforeId`. */
export function slotFor(layer: AppLayerId): string {
  return `slot:${layer}`;
}

/** The placeholders the basemap style ends with. A hidden background layer draws nothing
 *  and needs no source, so a style that carries them looks and costs exactly the same. */
export function slotLayers(): LayerSpecification[] {
  return APP_LAYER_ORDER.map((id) => ({
    id: slotFor(id),
    type: 'background',
    layout: { visibility: 'none' },
  }));
}
