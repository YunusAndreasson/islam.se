import { describe, expect, it } from '@jest/globals';

import { type Camera, mercX, mercY, worldSize } from './projection';
import { insideLabelBand, visibleLineLabel } from './visible-line-label';

const camera: Camera = { lon: 20.2, lat: 67.9, zoom: 5.4, width: 400, height: 800 };
const TOP = 100;
const BOTTOM = 180;

function line(...points: [number, number][]): Float64Array {
  const scale = worldSize(camera.zoom);
  return new Float64Array(points.flatMap(([x, y]) => [
    mercX(camera.lon) + (x - camera.width / 2) / scale,
    mercY(camera.lat) + (y - camera.height / 2) / scale,
  ]));
}

describe('visibleLineLabel', () => {
  it('retains the original anchor when it is already clear of controls', () => {
    const anchor = { x: 180, y: 300 };
    expect(visibleLineLabel(anchor, [line([100, 200], [300, 500])], camera, TOP, BOTTOM))
      .toBe(anchor);
  });

  it('moves a label below the dock onto its curved line above the dock', () => {
    const result = visibleLineLabel(
      { x: 280, y: 700 },
      [line([100, 300], [180, 500], [280, 700])],
      camera, TOP, BOTTOM,
    );
    expect(result.x).toBeCloseTo(240, 8);
    expect(result.y).toBeCloseTo(620, 8);
    // On the last segment, not merely the anchor clamped vertically to the dock.
    expect((result.x - 180) / 100).toBeCloseTo((result.y - 500) / 200, 8);
  });

  it('does not show a label for a line entirely outside the clear map', () => {
    const anchor = { x: 200, y: 720 };
    expect(visibleLineLabel(anchor, [line([50, 700], [350, 750])], camera, TOP, BOTTOM))
      .toBe(anchor);
  });

  it('finds the visible crossing even when both endpoints are outside', () => {
    const result = visibleLineLabel(
      { x: 450, y: 400 }, [line([-100, 400], [500, 400])], camera, TOP, BOTTOM,
    );
    expect(result.x).toBeCloseTo(368, 8);
    expect(result.y).toBeCloseTo(400, 8);
  });

  it('chooses the nearest visible segment across disconnected polylines', () => {
    const result = visibleLineLabel(
      { x: 300, y: 720 },
      [line([70, 200], [70, 600]), line([250, 300], [250, 600])],
      camera, TOP, BOTTOM,
    );
    expect(result.x).toBeCloseTo(250, 8);
    expect(result.y).toBeCloseTo(600, 8);
  });

  it('leaves inputs unchanged and tolerates empty or degenerate geometry', () => {
    const anchor = Object.freeze({ x: 300, y: 700 });
    const geometry = line([200, 300], [200, 300]);
    const original = geometry.slice();
    const cam = Object.freeze({ ...camera });
    const result = visibleLineLabel(anchor, [new Float64Array(), geometry], cam, TOP, BOTTOM);
    expect(result.x).toBeCloseTo(200, 8);
    expect(result.y).toBeCloseTo(300, 8);
    expect(geometry).toEqual(original);
    expect(anchor).toEqual({ x: 300, y: 700 });
    expect(cam).toEqual(camera);
  });
});

describe('insideLabelBand', () => {
  it('admits the band between the controls and the dock, inside the side margins', () => {
    expect(insideLabelBand({ x: 200, y: 400 }, camera, TOP, BOTTOM)).toBe(true);
    expect(insideLabelBand({ x: 32, y: TOP }, camera, TOP, BOTTOM)).toBe(true);
    expect(insideLabelBand({ x: 368, y: 800 - BOTTOM }, camera, TOP, BOTTOM)).toBe(true);
  });

  it('refuses the status bar, the dock and the screen edges', () => {
    expect(insideLabelBand({ x: 200, y: 10 }, camera, TOP, BOTTOM)).toBe(false);
    expect(insideLabelBand({ x: 200, y: 790 }, camera, TOP, BOTTOM)).toBe(false);
    expect(insideLabelBand({ x: 10, y: 400 }, camera, TOP, BOTTOM)).toBe(false);
    expect(insideLabelBand({ x: 395, y: 400 }, camera, TOP, BOTTOM)).toBe(false);
  });

  it('agrees with visibleLineLabel: a line crossing the band yields a label inside it', () => {
    // Anchor far above the band, line descending through it.
    const p = visibleLineLabel({ x: 200, y: 20 }, [line([200, 20], [200, 500])], camera, TOP, BOTTOM);
    expect(insideLabelBand(p, camera, TOP, BOTTOM)).toBe(true);
  });
});
