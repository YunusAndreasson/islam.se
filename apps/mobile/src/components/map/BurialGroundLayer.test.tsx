// The burial-ground layer is native MapLibre, so — as with MosqueLayer — what is testable in
// JS is its declaration plus the native-state synchronization tested in useFeatureSelection.
// These pin the same invariants MosqueLayer's own tests do, because
// this layer copies the two decisions those tests exist for: the ring must never be a tap
// target, and it must be mounted with the style rather than on selection.
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { getBurialGrounds } from '@/lib/burial-grounds';
import { at } from '@/test-utils/at';
import { hostsOfType } from '@/test-utils/rendered';
import { BurialGroundLayer } from './BurialGroundLayer';

/** The binding is string-mocked in jest.setup, so its components are host elements. */
function declared() {
  return {
    sources: hostsOfType('GeoJSONSource'),
    layers: hostsOfType('Layer'),
    images: hostsOfType('Images'),
  };
}

const noop = () => {};
const byId = <T extends { props: { id?: string } }>(nodes: T[], id: string) =>
  at(nodes.filter((n) => n.props.id === id), 0, id);

describe('BurialGroundLayer', () => {
  it('makes only the glyph source tappable, with the mosque layer’s tight hitbox', async () => {
    await render(<BurialGroundLayer onSelect={noop} />);
    const { sources } = declared();

    // A pressable source hit-tests every layer it owns: a ring on it would be a tap target
    // that re-opens the card the reader is trying to dismiss.
    expect(byId(sources, 'burial-grounds-ring').props.onPress).toBeUndefined();
    const glyphs = byId(sources, 'burial-grounds');
    expect(typeof glyphs.props.onPress).toBe('function');
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(glyphs.props.hitbox[side]).toBeLessThan(22);
    }
  });

  it('mounts the ring with the style, transparent until its native feature state selects it', async () => {
    await render(<BurialGroundLayer onSelect={noop} />);
    const ring = byId(declared().layers, 'burial-ground-selected');
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
  });

  it('rings exactly the selected burial ground, at every zoom', async () => {
    const ground = at(getBurialGrounds(), 0, 'burial grounds');
    await render(<BurialGroundLayer onSelect={noop} selectedId={ground.id} />);
    const ring = byId(declared().layers, 'burial-ground-selected');
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
    expect(ring.props.paint['circle-opacity']).toBe(0);
    expect(ring.props.minzoom).toBeUndefined();
  });

  it('draws its glyphs from the town-scale zoom up, from a registered pin', async () => {
    await render(<BurialGroundLayer onSelect={noop} />);
    const { layers, images } = declared();
    const glyphs = byId(layers, 'burial-ground-symbols');
    // No national-view tier: the country view stays the mosques' (see the file header).
    expect(glyphs.props.minzoom).toBe(7);
    const pin = glyphs.props.layout['icon-image'];
    expect(images.some((i) => pin in i.props.images)).toBe(true);
  });
});
