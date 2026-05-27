// "You are here" — a single locator dot at the coordinate the prayer times are
// computed for, drawn ABOVE the solar wash and the city dots. It makes the map's
// sweeping prayer lines legible against the dock's "next prayer": you can see which
// lines have already swept past you (they sit on the far side of your dot) and which
// haven't arrived yet. Brass — the app's "this concerns you / look here" accent — and
// a soft glow ring set it apart from the indigo city dots, and it dims with the night
// factor like the other canvas markers. See CityMarkers for the same overlay pattern.
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { FeatureCollection } from 'geojson';
import { useMemo } from 'react';

import type { LatLng } from '../../lib/prayer-times';
import { nightChrome } from './nightChrome';

export function UserLocationMarker({ coords, night }: { coords: LatLng; night: number }) {
  const c = nightChrome(night);
  const data = useMemo<FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [coords.longitude, coords.latitude] },
        },
      ],
    }),
    [coords.longitude, coords.latitude],
  );
  // A white rim by day; a faint light rim on the night map keeps the dot crisp.
  const rim = night > 0.5 ? 'rgba(237,240,245,0.95)' : '#ffffff';

  return (
    <GeoJSONSource id="user-location" data={data}>
      {/* Soft brass halo — reads as a locator glow, not another city dot. */}
      <Layer
        id="user-location-glow"
        type="circle"
        paint={{ 'circle-color': c.highlight, 'circle-radius': 13, 'circle-opacity': 0.16 }}
      />
      {/* Solid brass dot with a light rim, a touch larger than the biggest city dot. */}
      <Layer
        id="user-location-dot"
        type="circle"
        paint={{
          'circle-color': c.highlight,
          'circle-radius': 6,
          'circle-stroke-color': rim,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.95,
        }}
      />
    </GeoJSONSource>
  );
}
