import { expect, it, jest } from '@jest/globals';
import type { GeoJSONSourceProps as MockSourceProps, GeoJSONSourceRef as MockSourceRef } from '@maplibre/maplibre-react-native';
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
    GeoJSONSource: React.memo(function MockGeoJSONSource({ data, ref, ...props }: MockSourceProps) {
      const selectionRef: React.Ref<Pick<MockSourceRef, 'setFeatureState' | 'removeFeatureState'>> | undefined = ref;
      React.useImperativeHandle(selectionRef, () => ({
        setFeatureState: async () => {}, removeFeatureState: async () => {},
      }), []);
      return React.createElement('GeoJSONSource', {
        ...props,
        data: typeof data === 'string' ? data : JSON.stringify(data),
      });
    }),
  };
});

// ISLAM-SE-Q investigation: each dataset used to cross into two native
// sources, which decoded the same collection twice at first paint.
it.each([
  { id: 'mosques', Layer: MosqueLayer, features: mosqueFeatures },
  { id: 'burial-grounds', Layer: BurialGroundLayer, features: burialFeatures },
])('$id sends one collection to native across selection and style changes', async ({ id, Layer, features }) => {
  const expected = features();
  const { rerender } = await render(<Layer selectedId={null} />);
  const stringify = jest.spyOn(JSON, 'stringify');
  try {
    for (const selectedId of [expected.features[0]!.properties.id, null]) {
      await rerender(<Layer selectedId={selectedId} styleRevision={1} />);
      const sources = hostsOfType('GeoJSONSource');
      const glyph = sources.find((source) => source.props.id === id);
      expect(glyph).toBeDefined();
      expect(glyph?.props.onPress).toBeUndefined();
      expect(sources).toHaveLength(1);
      for (const source of sources) {
        expect(JSON.parse(source.props.data)).toEqual(expected);
      }
    }
    const serializedCollections = stringify.mock.calls
      .map(([data]) => data)
      .filter((data) => data?.type === 'FeatureCollection');
    expect({ source: id, repeatSerializations: serializedCollections.length })
      .toEqual({ source: id, repeatSerializations: 0 });
  } finally {
    stringify.mockRestore();
  }
});
