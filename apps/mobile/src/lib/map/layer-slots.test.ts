import { describe, expect, it } from '@jest/globals';

import { APP_LAYER_ORDER, slotFor, slotLayers } from './layer-slots';

describe('app layer slots', () => {
  it('gives every app layer its own placeholder, in stack order', () => {
    const slots = slotLayers();
    // One placeholder per layer: two layers sharing an anchor would be stacked by arrival
    // order again, which is the bug the slots exist to remove.
    expect(slots.map((s) => s.id)).toEqual(APP_LAYER_ORDER.map((id) => slotFor(id)));
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
  });

  it('draws nothing: hidden background layers with no source', () => {
    for (const slot of slotLayers()) {
      expect(slot).toEqual({ id: slot.id, type: 'background', layout: { visibility: 'none' } });
    }
  });

  it("keeps the reader's mark on top and mosques above burial grounds", () => {
    const at = (id: (typeof APP_LAYER_ORDER)[number]) => APP_LAYER_ORDER.indexOf(id);
    expect(at('location-dot')).toBe(APP_LAYER_ORDER.length - 1);
    expect(at('location-glow')).toBeLessThan(at('location-dot'));
    // The ray leaves from beneath the dot, never across it.
    expect(at('location-qibla-line')).toBeLessThan(at('location-glow'));
    // Symbol collision gives the higher layer first pick, so a mosque keeps its place.
    expect(at('burial-ground-symbols')).toBeLessThan(at('mosque-symbols'));
    // Each selection ring sits under the glyph it circles.
    expect(at('mosque-selected')).toBeLessThan(at('mosque-symbols'));
    expect(at('burial-ground-selected')).toBeLessThan(at('burial-ground-symbols'));
  });
});
