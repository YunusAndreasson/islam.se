// City markers as a map overlay, drawn ABOVE the solar wash (unlike base-style
// layers, which the wash veils at night). Swedish cities carry the accent, foreign
// capitals are muted, and both the dots and labels dim with the night factor so
// they stay legible whether the map is a bright day or a deep-indigo night. Data
// is the curated set in lib/map/cities — see there for why we don't use the tiles.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

import { CITY_GEOJSON } from '../../lib/map/cities';
import { nightChrome } from './nightChrome';

// Dot size by rank, growing with zoom. The dot is always present; the label below
// it is collision-managed (rank-sorted) so the big cities win at the country view.
const DOT_RADIUS = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  ['match', ['get', 'rank'], 1, 4.5, 2, 3.4, 2.8],
  9,
  ['match', ['get', 'rank'], 1, 7, 2, 5.5, 4.5],
];

const LABEL_SIZE = [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  ['match', ['get', 'rank'], 1, 13, 2, 11.5, 10.5],
  9,
  ['match', ['get', 'rank'], 1, 17, 2, 15, 13.5],
];

export function CityMarkers({ night }: { night: number }) {
  const c = nightChrome(night);
  // Foreign capitals stay muted; Swedish cities take the (night-lightened) accent.
  const dotColor = ['case', ['==', ['get', 'foreign'], 1], c.inkMuted, c.accent];
  const textColor = ['case', ['==', ['get', 'foreign'], 1], c.inkMuted, c.ink];
  // A white rim by day; on the night map a faint light rim keeps the dot crisp.
  const rim = night > 0.5 ? 'rgba(237,240,245,0.9)' : '#ffffff';

  return (
    <GeoJSONSource id="cities" data={CITY_GEOJSON}>
      <Layer
        id="city-dot"
        type="circle"
        // biome-ignore lint/suspicious/noExplicitAny: MapLibre paint expression typing
        paint={{
          'circle-color': dotColor as any,
          'circle-radius': DOT_RADIUS as any,
          'circle-stroke-color': rim,
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.95,
          'circle-opacity': ['case', ['==', ['get', 'foreign'], 1], 0.8, 1] as any,
        }}
      />
      <Layer
        id="city-label"
        type="symbol"
        layout={{
          'text-field': ['get', 'name'] as any,
          'text-font': ['Noto Sans Regular'],
          'text-size': LABEL_SIZE as any,
          'text-anchor': 'top',
          'text-offset': [0, 0.7],
          'text-max-width': 8,
          'text-optional': true,
          'symbol-sort-key': ['get', 'rank'] as any,
        }}
        // biome-ignore lint/suspicious/noExplicitAny: MapLibre paint expression typing
        paint={{
          'text-color': textColor as any,
          'text-halo-color': c.halo,
          'text-halo-width': 1.3,
          'text-halo-blur': 0.6,
        }}
      />
    </GeoJSONSource>
  );
}
