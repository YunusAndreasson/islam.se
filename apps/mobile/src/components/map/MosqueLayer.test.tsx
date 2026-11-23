// The mosque layer is native MapLibre, so what is testable in JS is its DECLARATION: which
// sources exist, which of them can be tapped, and how native state reveals the ring.
// Those are exactly the properties two real bugs turned on (see the file's ⚠️ header), so
// they are worth pinning even though no map is rendered here.
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { getMosques } from '@/lib/mosques';
import { at } from '@/test-utils/at';
import { hostsOfType } from '@/test-utils/rendered';
import { MosqueLayer } from './MosqueLayer';

/** The binding is string-mocked in jest.setup, so its components are host elements and can
 *  be read back by element type. */
function sourcesAndLayers() {
  return {
    sources: hostsOfType('GeoJSONSource'),
    layers: hostsOfType('Layer'),
  };
}

describe('MosqueLayer selection ring', () => {
  // THE BUG THIS GUARDS: the ring used to mount only when a mosque was selected. A layer
  // added at runtime is APPENDED to the top of the style — MLRNLayer.add() calls
  // style.addLayer with no anchor and MLRNMapView.layerAdded does no reordering — so the ring
  // painted OVER the mosque glyph and its label halo instead of around them, exactly
  // contradicting the file's own header. Mounting it with the rest of the style is what makes
  // the declaration order hold at runtime, so "always present" is the invariant, not a detail.
  it('is mounted with the style even when no card is open, drawing nothing until one is', async () => {
    await render(<MosqueLayer />);
    const { layers } = sourcesAndLayers();

    const ring = at(
      layers.filter((l) => l.props.id === 'mosque-selected'),
      0,
      'selection ring',
    );
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
  });

  it('keeps the ring paint independent of selection, controlled by native feature state', async () => {
    const mosque = at(getMosques(), 0, 'mosques');
    await render(<MosqueLayer selectedId={mosque.id} />);
    const { layers } = sourcesAndLayers();

    const ring = at(
      layers.filter((l) => l.props.id === 'mosque-selected'),
      0,
      'selection ring',
    );
    expect(ring.props.filter).toBeUndefined();
    expect(ring.props.paint['circle-stroke-opacity']).toEqual(
      ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
    );
    // A ring, not a dot: the fill stays transparent so the basemap and the twilight wash
    // read straight through it.
    expect(ring.props.paint['circle-opacity']).toBe(0);
    expect(ring.props.paint['circle-stroke-width']).toBeGreaterThan(0);
    // No minzoom — zooming out to the national view with the card open must still show
    // where its mosque is.
    expect(ring.props.minzoom).toBeUndefined();
  });

  // A native source press would query dust and ring geometry on the UI thread.
  // The screen's single glyph-only query is exercised in screens.test.tsx.
  it('leaves the selection ring and dust inert even when a card is open', async () => {
    await render(<MosqueLayer selectedId={at(getMosques(), 0, 'mosques').id} />);
    const { sources } = sourcesAndLayers();
    const source = at(sources, 0, 'mosque source');
    expect(source.props.onPress).toBeUndefined();
    expect(source.queryAll((node) => node.type === 'Layer').map((layer) => layer.props.id))
      .toEqual(expect.arrayContaining(['mosque-selected', 'mosque-dust']));
  });
});
