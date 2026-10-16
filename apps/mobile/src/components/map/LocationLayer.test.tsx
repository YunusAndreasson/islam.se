import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { KAABA } from '@/lib/qibla';
import { at } from '@/test-utils/at';
import { hostsOfType } from '@/test-utils/rendered';
import { LocationLayer } from './LocationLayer';

const POINT: [number, number] = [18.0686, 59.3293];
const layer = (id: string) => at(hostsOfType('Layer').filter((node) => node.props.id === id), 0, id);

describe('native location content', () => {
  it('anchors a fixed-size dot and a great-circle ray to geographic coordinates', async () => {
    await render(<LocationLayer point={POINT} showQibla />);
    const sources = hostsOfType('GeoJSONSource');
    const arc = at(sources.filter((s) => s.props.id === 'location-qibla'), 0, 'arc');
    const dot = at(sources.filter((s) => s.props.id === 'location-point'), 0, 'dot');
    expect(dot.props.data.geometry.coordinates).toEqual(POINT);
    expect(arc.props.lineMetrics).toBe(true);
    const coordinates = arc.props.data.geometry.coordinates as number[][];
    expect(coordinates).toHaveLength(96);
    expect(coordinates[0]?.[0]).toBeCloseTo(POINT[0]);
    expect(coordinates[0]?.[1]).toBeCloseTo(POINT[1]);
    expect(coordinates[95]?.[0]).toBeCloseTo(KAABA.longitude);
    expect(coordinates[95]?.[1]).toBeCloseTo(KAABA.latitude);
    expect(layer('location-dot').props.paint['circle-radius']).toBe(4);
    expect(layer('location-dot').props.paint['circle-stroke-width']).toBe(2);
    expect(layer('location-qibla-line').props.paint['line-width']).toBe(1.5);
    expect(sources.every((s) => s.props.onPress === undefined)).toBe(true);
  });

  it('hides the ray without remounting its source or changing dot visibility', async () => {
    const { rerender } = await render(<LocationLayer point={POINT} showQibla />);
    const source = at(hostsOfType('GeoJSONSource'), 0, 'arc');
    const data = source.props.data;
    await rerender(<LocationLayer point={POINT} showQibla={false} />);
    expect(layer('location-qibla-line').props.layout.visibility).toBe('none');
    expect(source.props.data).toBe(data);
    expect(layer('location-dot').props.layout).toBeUndefined();
  });
});
