// The Skia field layer, rendered directly rather than through the map screen — so the two
// branches that only appear on certain DATES or certain SETTINGS can be exercised on any
// day, from any state, without driving MapLibre.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import * as reanimated from 'react-native-reanimated';
import { Path, Skia } from '@shopify/react-native-skia';
import { type Camera, project } from '@/lib/map/projection';
import { SolarSkiaOverlay } from './SolarSkiaOverlay';

const CAMERA = { lon: 17.4, lat: 62.1, zoom: 4.5, width: 390, height: 780 } satisfies Camera;
const STOCKHOLM: [number, number] = [18.0686, 59.3293];
const DAY_START = Date.UTC(2026, 7, 2, 22, 0, 0); // a Stockholm midnight, high summer
const DAY_MS = 24 * 60 * 60 * 1000;

// The reanimated mock returns a plain { value } object for useSharedValue, which is what
// the overlay's worklets read — so the derived paths below really are built.
const shared = <T,>(value: T) => ({ value }) as never;

function overlay(overrides: Partial<Parameters<typeof SolarSkiaOverlay>[0]> = {}) {
  return (
    <SolarSkiaOverlay
      dayStart={DAY_START}
      dayLength={DAY_MS}
      nowFraction={shared(0.5)}
      geometryNow={DAY_START + DAY_MS / 2}
      camera={shared(CAMERA)}
      lines={[]}
      nextKey={null}
      imminentKey={null}
      userPoint={STOCKHOLM}
      arrival={null}
      polarBoundary={null}
      {...overrides}
    />
  );
}

function renderOverlay(overrides: Partial<Parameters<typeof SolarSkiaOverlay>[0]> = {}) {
  return render(overlay(overrides));
}

// THE regression this exists to prevent, and it is a seasonal one: polarBoundaryFor
// returns null through the summer half of the year and a real boundary from roughly
// mid-November, so the boundary branch below is simply never reached by a suite run in
// August. It reaches for Skia's `vec` inline in its JSX — which was missing from the
// jest mock — meaning the map screens would have passed all summer and thrown
// "vec is not a function" in December. Rendering the branch explicitly makes the suite's
// coverage of it independent of the date it happens to run on.
describe('the polar boundary line', () => {
  it('builds on a polar-night date', () => {
    expect(() =>
      renderOverlay({ polarBoundary: { lat: 67.41, kind: 'polar-night' } }),
    ).not.toThrow();
  });

  it('builds on a midnight-sun date', () => {
    expect(() =>
      renderOverlay({ polarBoundary: { lat: 66.56, kind: 'midnight-sun' } }),
    ).not.toThrow();
  });
});


afterEach(() => { jest.restoreAllMocks(); });

const LINE = [{ prayer: 'dhuhr' as const, polylines: [[[18, 59], [19, 60]]] as [number, number][][] }];
const strokes = () => screen.UNSAFE_queryAllByType(Path).filter((node) => node.props.path && node.props.strokeJoin === 'round');

describe('direct scrubbing contours', () => {
  it('shows the complete new line immediately and removes it when its time passes', () => {
    const view = renderOverlay({ preview: true });
    view.rerender(overlay({ preview: true, lines: LINE }));
    expect(strokes()).toHaveLength(2); // halo + core, no decorative comet pass
    for (const node of strokes()) expect(node.props.end).toBe(1);
    view.rerender(overlay({ preview: true, lines: [] }));
    expect(strokes()).toHaveLength(0);
    view.rerender(overlay({ preview: true, lines: LINE }));
    expect(strokes()).toHaveLength(2);
    for (const node of strokes()) expect(node.props.end).toBe(1);
  });

  it.each([true, false])('uses exact preview geometry but preserves live drift (preview=%s)', (preview) => {
    const points: number[][] = [];
    jest.spyOn(Skia.PathBuilder, 'Make').mockImplementation(() => {
      const builder = {
        moveTo: (x: number, y: number) => { points.push([x, y]); return builder; },
        lineTo: () => builder,
        detach: () => ({}),
      };
      return builder as never;
    });
    const camera = { ...CAMERA, zoom: 10 };
    renderOverlay({ preview, camera: shared(camera), lines: LINE, geometryNow: DAY_START + DAY_MS / 2 - 45_000 });
    const exact = project(18, 59, camera);
    const expectedX = exact.x - (preview ? 0 : 512 * 2 ** camera.zoom * 45_000 / DAY_MS);
    expect(points.length).toBeGreaterThan(0);
    expect(points[0]?.[0]).toBeCloseTo(expectedX, 6);
    expect(points[0]?.[1]).toBeCloseTo(exact.y, 6);
  });
});

describe('upcoming prayer entrance', () => {
  const twoLines = [...LINE, { ...LINE[0]!, prayer: 'asr' as const }];
  it('arms only the upcoming prayer; other lines are complete on their first frame', () => {
    renderOverlay({ lines: twoLines, nextKey: 'dhuhr' });
    const cores = strokes().filter((node) => node.props.strokeWidth === 2 || node.props.strokeWidth === 3.4);
    expect(cores).toHaveLength(2);
    expect(cores.find((node) => node.props.strokeWidth === 3.4)?.props.end.value).toBe(0);
    expect(cores.find((node) => node.props.strokeWidth === 2)?.props.end.value).toBe(1);
  });

  it('scrubbing interrupts a pending entrance and exposes the full current path', () => {
    const view = renderOverlay({ lines: LINE, nextKey: 'dhuhr', entranceEnabled: false });
    view.rerender(overlay({ lines: LINE, nextKey: 'dhuhr', preview: true }));
    expect(strokes()).toHaveLength(2);
    for (const node of strokes()) expect(node.props.end).toBe(1);
  });

  it('shows the full path immediately when reduced motion is enabled', () => {
    jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    renderOverlay({ lines: LINE, nextKey: 'dhuhr' });
    expect(strokes()).toHaveLength(2);
    for (const node of strokes()) expect(node.props.end.value).toBe(1);
  });
});
