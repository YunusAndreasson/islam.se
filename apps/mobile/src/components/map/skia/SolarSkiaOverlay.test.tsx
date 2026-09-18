// The Skia field layer, rendered directly rather than through the map screen — so the two
// branches that only appear on certain DATES or certain SETTINGS can be exercised on any
// day, from any state, without driving MapLibre.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import * as reanimated from 'react-native-reanimated';
import { Path, Skia } from '@shopify/react-native-skia';
import { atZoom, DUST_RADIUS_STOPS } from '@/lib/map/dust';
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

// THE REPORT THIS ANSWERS: at Maghrib and ʿIshāʾ the reader could "hardly see" their own
// position or a mosque. Both are native MapLibre layers UNDER this canvas, so the dusk and
// night wash tinted them like the land. The wash is now erased (dstOut) exactly where they
// sit. The shader is a native RuntimeEffect the jest mock never builds, so each test here
// switches the wash on first — without it there is nothing to erase and nothing is drawn.
describe('keeping the reader’s dot and the mosques clear of the wash', () => {
  // On screen under CAMERA (Malmö is not: it sits below the test viewport's bottom edge).
  const UPPSALA: [number, number] = [17.6389, 59.8586];
  const LONDON: [number, number] = [-0.1276, 51.5072];

  function recordHoles(): { x: number; y: number; r: number }[] {
    const circles: { x: number; y: number; r: number }[] = [];
    jest.spyOn(Skia.PathBuilder, 'Make').mockImplementation(() => {
      const builder = {
        moveTo: () => builder,
        lineTo: () => builder,
        addCircle: (x: number, y: number, r: number) => { circles.push({ x, y, r }); return builder; },
        detach: () => ({}),
      };
      return builder as never;
    });
    return circles;
  }

  const withWash = () => jest.spyOn(Skia.RuntimeEffect, 'Make').mockReturnValue({} as never);
  const erasers = () =>
    screen.UNSAFE_root.findAll((node) => node.props.blendMode === 'dstOut' && typeof node.type !== 'string');

  it('clears the reader’s dot, wherever it is on screen', () => {
    withWash();
    renderOverlay();
    const dot = erasers().find((node) => node.props.r != null);
    expect(dot).toBeDefined();
    const at = project(STOCKHOLM[0], STOCKHOLM[1], CAMERA);
    expect(dot!.props.cx.value).toBeCloseTo(at.x, 6);
    expect(dot!.props.cy.value).toBeCloseTo(at.y, 6);
  });

  it('clears each mosque speck on screen, a little wider than the speck', () => {
    withWash();
    const holes = recordHoles();
    renderOverlay({ mosquePoints: [STOCKHOLM, UPPSALA, LONDON] });
    // London is off-frame: no hole is cut for a speck nobody can see.
    expect(holes).toHaveLength(2);
    const at = project(UPPSALA[0], UPPSALA[1], CAMERA);
    const uppsala = holes.find((h) => Math.abs(h.x - at.x) < 1e-6 && Math.abs(h.y - at.y) < 1e-6);
    expect(uppsala).toBeDefined();
    expect(uppsala!.r).toBeGreaterThan(atZoom(DUST_RADIUS_STOPS, CAMERA.zoom));
  });

  it('stops clearing once the specks have handed over to the glyphs', () => {
    // A hole past this point would uncover an empty patch of daylight, or one where
    // collision has culled a glyph.
    withWash();
    const holes = recordHoles();
    // Centred on Stockholm, so its speck WOULD be on screen — the zoom alone must stop it.
    const cityView = { ...CAMERA, lon: STOCKHOLM[0], lat: STOCKHOLM[1], zoom: 9 };
    renderOverlay({ mosquePoints: [STOCKHOLM, UPPSALA], camera: shared(cityView) });
    expect(holes).toHaveLength(0);
  });

  it('cuts no mosque holes when the reader has hidden the mosques', () => {
    withWash();
    renderOverlay({ mosquePoints: [] });
    expect(erasers().filter((node) => node.props.path != null)).toHaveLength(0);
  });

  it('draws nothing at all when there is no wash to erase', () => {
    const holes = recordHoles();
    renderOverlay({ mosquePoints: [STOCKHOLM] });
    expect(erasers()).toHaveLength(0);
    expect(holes).toHaveLength(0);
  });
});
