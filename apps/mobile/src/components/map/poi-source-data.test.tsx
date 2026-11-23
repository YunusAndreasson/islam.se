import { expect, it, jest } from '@jest/globals';
import type { GeoJSONSourceProps as MockSourceProps } from '@maplibre/maplibre-react-native';
import { render } from '@testing-library/react-native';

import { toFeatureCollection as burialFeatures } from '@/lib/burial-grounds';
import { toFeatureCollection as mosqueFeatures } from '@/lib/mosques';
import { hostsOfType } from '@/test-utils/rendered';
import { BurialGroundLayer } from './BurialGroundLayer';
import { MosqueLayer } from './MosqueLayer';

// Project the installed GeoJSONSource's JS-to-native boundary into the test renderer.
// The standard project mock stops before MapLibre serializes object data to a string.
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Images: 'Images',
    Layer: 'Layer',
    GeoJSONSource: React.memo(function MockGeoJSONSource({ data, ...props }: MockSourceProps) {
      return React.createElement('GeoJSONSource', {
        ...props,
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    }),
  };
});

const noop = () => {};

// Crossing z7 used to reserialize every point before the native press handler could
// change. The ring and glyph still need the full, identical dataset on both sides.
it.each([
  { id: 'mosques', Layer: MosqueLayer, features: mosqueFeatures },
  { id: 'burial-grounds', Layer: BurialGroundLayer, features: burialFeatures },
])('$id crosses the glyph threshold without serializing its unchanged collection', async ({ id, Layer, features }) => {
  const expected = features();
  const { rerender } = await render(<Layer onSelect={noop} pressable={false} />);
  const stringify = jest.spyOn(JSON, 'stringify');
  try {
    for (const pressable of [true, false]) {
      await rerender(<Layer onSelect={noop} pressable={pressable} />);
      const sources = hostsOfType('GeoJSONSource');
      const glyph = sources.find((source) => source.props.id === id);
      expect(typeof glyph?.props.onPress).toBe(pressable ? 'function' : 'undefined');
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        expect(JSON.parse(source.props.data)).toEqual(expected);
      }
    }
    const serializedCollections = stringify.mock.calls
      .map(([data]) => data)
      .filter((data) => data?.type === 'FeatureCollection');
    expect({ source: id, serializationsWhileCrossingZoom7: serializedCollections.length })
      .toEqual({ source: id, serializationsWhileCrossingZoom7: 0 });
  } finally {
    stringify.mockRestore();
  }
});
