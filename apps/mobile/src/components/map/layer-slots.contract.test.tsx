// Every native layer the app adds names its own slot as `beforeId`, and every slot has its
// layer. THE BUG THIS PINS: a layer with no anchor is appended to the top of the style when
// it is added, so the stack followed mount timing. The mosque glyphs (mounted once their
// bitmap rasterised) landed above the reader's dot, a layer switched back on in
// Inställningar landed above everything, and after a theme flip Android re-added the sources
// in HashMap order, which put the dot under every mosque layer. A new <Layer> without a slot
// brings exactly that back for itself, so it fails here.
import { describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';

import { APP_LAYER_ORDER, slotFor } from '@/lib/map/layer-slots';
import { NORDIC_DARK, NORDIC_LIGHT } from '@/lib/map/nordicStyle';
import { hostsOfType } from '@/test-utils/rendered';
import { BurialGroundLayer } from './BurialGroundLayer';
import { LocationLayer } from './LocationLayer';
import { MosqueLayer } from './MosqueLayer';

// The mosque glyph layer mounts only once its bitmap exists; give it one so the test sees
// every layer the app can add, not just the ones that mount synchronously.
jest.mock('@expo/vector-icons', () => {
  const Icon = () => null;
  Icon.getImageSource = async () => ({ uri: 'file:///mosque.png', scale: 1, width: 48, height: 48 });
  return { MaterialCommunityIcons: Icon };
});

const noop = () => {};

describe('app layer slots', () => {
  it('anchors every app layer beneath its own slot, and leaves no slot empty', async () => {
    await render(
      <>
        <BurialGroundLayer onSelect={noop} />
        <MosqueLayer onSelect={noop} />
        <LocationLayer point={[18.07, 59.33]} showQibla />
      </>,
    );
    await waitFor(() =>
      expect(hostsOfType('Layer').some((layer) => layer.props.id === 'mosque-symbols')).toBe(true),
    );

    const layers = hostsOfType('Layer');
    for (const layer of layers) {
      expect({ id: layer.props.id, beforeId: layer.props.beforeId }).toEqual({
        id: layer.props.id,
        beforeId: slotFor(layer.props.id),
      });
    }
    // Mount order no longer matters, so compare sets: one layer per slot, none unslotted.
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(layers.map((layer) => layer.props.id as string).sort(byName)).toEqual([...APP_LAYER_ORDER].sort(byName));
  });

  it.each([
    ['light', NORDIC_LIGHT],
    ['dark', NORDIC_DARK],
  ])('ends the %s basemap with the slots, in stack order', (_name, style) => {
    const ids = style.layers.map((layer) => layer.id);
    const tail = ids.slice(-APP_LAYER_ORDER.length);
    // Anything after the slots would draw over the app's layers; a slot missing from the
    // style leaves its layer waiting forever for an anchor that never arrives.
    expect(tail).toEqual(APP_LAYER_ORDER.map((id) => slotFor(id)));
  });
});
