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

const byId = <T extends { props: { id?: string } }>(nodes: T[], id: string) =>
  at(nodes.filter((n) => n.props.id === id), 0, id);

describe('BurialGroundLayer', () => {
  // ISLAM-SE-Q: a native handler would query every layer, including the ring,
  // in the tap recognizer before the screen's bounded hit test can run.
  it('hands the native burial source no press handler', async () => {
    await render(<BurialGroundLayer />);
    expect(byId(declared().sources, 'burial-grounds').props.onPress).toBeUndefined();
  });

  it('mounts the ring with the style, transparent until its native feature state selects it', async () => {
    await render(<BurialGroundLayer />);
    const ring = byId(declared().layers, 'burial-ground-selected');
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
  });

  it('rings exactly the selected burial ground, at every zoom', async () => {
    const ground = at(getBurialGrounds(), 0, 'burial grounds');
    await render(<BurialGroundLayer selectedId={ground.id} />);
    const ring = byId(declared().layers, 'burial-ground-selected');
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
    expect(ring.props.paint['circle-opacity']).toBe(0);
    expect(ring.props.minzoom).toBeUndefined();
  });

  it('draws its glyphs from the town-scale zoom up, from a registered pin', async () => {
    await render(<BurialGroundLayer />);
    const { layers, images } = declared();
    const glyphs = byId(layers, 'burial-ground-symbols');
    // No national-view tier: the country view stays the mosques' (see the file header).
    expect(glyphs.props.minzoom).toBe(7);
    const pin = glyphs.props.layout['icon-image'];
    expect(images.some((i) => pin in i.props.images)).toBe(true);
  });
});
