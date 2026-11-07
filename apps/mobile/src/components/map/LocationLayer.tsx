// Geographic content belongs to MapLibre's camera: the user's dot and qibla ray
// move with the basemap even when JS is busy rebuilding prayer contours.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import { latLngOf, type LonLat } from '@/lib/coordinates';
import { slotFor } from '@/lib/map/layer-slots';
import { greatCirclePoints, KAABA } from '@/lib/qibla';
import { useActiveScheme, useColors } from '@/theme/useColors';

interface Props {
  point: LonLat;
  showQibla: boolean;
}

export function LocationLayer({ point, showQibla }: Props) {
  const colors = useColors();
  const scheme = useActiveScheme();
  const dot = useMemo<GeoJSON.Feature<GeoJSON.Point>>(
    () => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: point },
    }),
    [point],
  );
  const arc = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(
    () => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: greatCirclePoints(latLngOf(point), KAABA, 96),
      },
    }),
    [point],
  );
  // Keep the same hue at alpha zero: transparent black introduces a dark fringe.
  const rgb = Number.parseInt(colors.accent.slice(1), 16);
  const hue = `${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}`;

  return (
    <>
      {/* Stay mounted when hidden so re-enabling the ray cannot put it above the dot. */}
      <GeoJSONSource id="location-qibla" data={arc} lineMetrics tolerance={0}>
        <Layer
          id="location-qibla-line"
          beforeId={slotFor('location-qibla-line')}
          type="line"
          layout={{
            visibility: showQibla ? 'visible' : 'none',
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-width': 1.5,
            'line-gradient': [
              'interpolate', ['linear'], ['line-progress'],
              0, `rgba(${hue}, 0.5)`,
              0.33, `rgba(${hue}, 0)`,
            ],
          }}
        />
      </GeoJSONSource>
      {/* No press handler: these decorations must not steal map taps. */}
      <GeoJSONSource id="location-point" data={dot}>
        <Layer
          id="location-glow"
          beforeId={slotFor('location-glow')}
          type="circle"
          paint={{
            'circle-radius': 13,
            'circle-color': colors.highlight,
            'circle-opacity': 0.16,
          }}
        />
        <Layer
          id="location-dot"
          beforeId={slotFor('location-dot')}
          type="circle"
          paint={{
            // MapLibre draws the stroke outside the radius: 4 + 2 = the previous 6 dp.
            'circle-radius': 4,
            'circle-color': colors.highlight,
            'circle-stroke-width': 2,
            'circle-stroke-color': scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff',
          }}
        />
      </GeoJSONSource>
    </>
  );
}
