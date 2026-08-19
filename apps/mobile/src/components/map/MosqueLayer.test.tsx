// The mosque layer is native MapLibre, so what is testable in JS is its DECLARATION: which
// sources exist, which of them can be tapped, and what the selection ring is filtered to.
// Those are exactly the properties two real bugs turned on (see the file's ⚠️ header), so
// they are worth pinning even though no map is rendered here.
import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { getMosques } from '@/lib/mosques';
import { at } from '@/test-utils/at';
import { MosqueLayer } from './MosqueLayer';

/** The binding is string-mocked in jest.setup, so its components are host elements and can
 *  be read back by element type. */
function sourcesAndLayers() {
  const root = screen.UNSAFE_root;
  return {
    sources: root.findAllByType('GeoJSONSource' as never),
    layers: root.findAllByType('Layer' as never),
  };
}

const noop = () => {};

describe('MosqueLayer sources', () => {
  it('makes only the glyph tier tappable, and with a tighter hitbox than a button', () => {
    render(<MosqueLayer onSelect={noop} />);
    const { sources } = sourcesAndLayers();

    const dust = at(
      sources.filter((s) => s.props.id === 'mosques-dust'),
      0,
      'dust source',
    );
    const glyphs = at(
      sources.filter((s) => s.props.id === 'mosques'),
      0,
      'glyph source',
    );

    // A pressable source hit-tests every layer it owns, so the dust must not be one —
    // below z7 it would be the only tap target on the whole map.
    expect(dust.props.onPress).toBeUndefined();
    expect(typeof glyphs.props.onPress).toBe('function');
    // Tighter than MLRNPressableSource's 22 dp default: at z7 that default reaches about
    // seven kilometres of ground past the glyph.
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(glyphs.props.hitbox[side]).toBeLessThan(22);
    }
  });
});

describe('MosqueLayer selection ring', () => {
  // THE BUG THIS GUARDS: the ring used to mount only when a mosque was selected. A layer
  // added at runtime is APPENDED to the top of the style — MLRNLayer.add() calls
  // style.addLayer with no anchor and MLRNMapView.layerAdded does no reordering — so the ring
  // painted OVER the mosque glyph and its label halo instead of around them, exactly
  // contradicting the file's own header. Mounting it with the rest of the style is what makes
  // the declaration order hold at runtime, so "always present" is the invariant, not a detail.
  it('is mounted with the style even when no card is open, drawing nothing until one is', () => {
    render(<MosqueLayer onSelect={noop} />);
    const { layers } = sourcesAndLayers();

    const ring = at(
      layers.filter((l) => l.props.id === 'mosque-selected'),
      0,
      'selection ring',
    );
    // Filtered to an id no mosque has, so the layer is inert until something is selected.
    expect(ring.props.filter).toEqual(['==', ['get', 'id'], '']);
  });

  it('rings the selected mosque, filtered to exactly that one', () => {
    const mosque = at(getMosques(), 0, 'mosques');
    render(<MosqueLayer onSelect={noop} selectedId={mosque.id} />);
    const { layers } = sourcesAndLayers();

    const ring = at(
      layers.filter((l) => l.props.id === 'mosque-selected'),
      0,
      'selection ring',
    );
    expect(ring.props.filter).toEqual(['==', ['get', 'id'], mosque.id]);
    // A ring, not a dot: the fill stays transparent so the basemap and the twilight wash
    // read straight through it.
    expect(ring.props.paint['circle-opacity']).toBe(0);
    expect(ring.props.paint['circle-stroke-width']).toBeGreaterThan(0);
    // No minzoom — zooming out to the national view with the card open must still show
    // where its mosque is.
    expect(ring.props.minzoom).toBeUndefined();
  });

  // THE BUG THIS FORBIDS: putting the ring on the pressable source would make it a tap
  // target of its own — and below z7, where the glyph layer does not exist, the ONLY one.
  // A tap meant to dismiss the card would re-open it.
  it('keeps the ring on the source that cannot be tapped', () => {
    const mosque = at(getMosques(), 0, 'mosques');
    render(<MosqueLayer onSelect={noop} selectedId={mosque.id} />);
    const { sources } = sourcesAndLayers();

    const pressable = sources.filter((s) => typeof s.props.onPress === 'function');
    for (const source of pressable) {
      const owned = source.findAllByType('Layer' as never).map((l) => l.props.id);
      expect(owned).not.toContain('mosque-selected');
    }
  });
});
