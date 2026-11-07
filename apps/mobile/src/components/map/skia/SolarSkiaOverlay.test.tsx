// The Skia field layer, rendered directly rather than through the map screen — so the two
// branches that only appear on certain DATES or certain SETTINGS can be exercised on any
// day, from any state, without driving MapLibre.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

import * as reanimated from 'react-native-reanimated';
import { Path, Skia } from 'react-native-skia';
import { atZoom, DUST_RADIUS_STOPS } from '@/lib/map/dust';
import { type Camera, project } from '@/lib/map/projection';
import { allOfType, allRendered } from '@/test-utils/rendered';
import { SolarSkiaOverlay } from './SolarSkiaOverlay';

const CAMERA = { lon: 17.4, lat: 62.1, zoom: 4.5, width: 390, height: 780 } satisfies Camera;
const STOCKHOLM: [number, number] = [18.0686, 59.3293];
const DAY_START = Date.UTC(2026, 7, 2, 22, 0, 0); // a Stockholm midnight, high summer
const DAY_MS = 24 * 60 * 60 * 1000;

// A shared value as the overlay's worklets read it: through get(), the React Compiler-safe
// accessor the app uses everywhere since the SDK 58 sweep. Kept readable as `.value` too, the
// shape the reanimated mock in jest.setup.js gives every useSharedValue — so the derived paths
// below really are built.
const shared = <T,>(value: T) => ({ value, get: () => value, set: () => {} }) as never;

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
  it('builds on a polar-night date', async () => {
    await expect(
      renderOverlay({ polarBoundary: { lat: 67.41, kind: 'polar-night' } }),
    ).resolves.toBeDefined();
  });

  it('builds on a midnight-sun date', async () => {
    await expect(
      renderOverlay({ polarBoundary: { lat: 66.56, kind: 'midnight-sun' } }),
    ).resolves.toBeDefined();
  });
});


afterEach(() => { jest.restoreAllMocks(); });

const LINE = [{ prayer: 'dhuhr' as const, polylines: [[[18, 59], [19, 60]]] as [number, number][][] }];
const strokes = () => allOfType(Path).filter((node) => node.props.path && node.props.strokeJoin === 'round');

describe('direct scrubbing contours', () => {
  it('shows the complete new line immediately and removes it when its time passes', async () => {
    const view = await renderOverlay({ preview: true });
    await view.rerender(overlay({ preview: true, lines: LINE }));
    expect(strokes()).toHaveLength(2); // halo + core, no decorative comet pass
    for (const node of strokes()) expect(node.props.end).toBe(1);
    await view.rerender(overlay({ preview: true, lines: [] }));
    expect(strokes()).toHaveLength(0);
    await view.rerender(overlay({ preview: true, lines: LINE }));
    expect(strokes()).toHaveLength(2);
    for (const node of strokes()) expect(node.props.end).toBe(1);
  });

  it.each([true, false].flatMap((preview) => [4.5, 14].map((zoom) => [preview, zoom] as const)))('uses exact preview geometry but preserves live drift (preview=%s, zoom=%s)', async (preview, zoom) => {
    const points: number[][] = [];
    jest.spyOn(Skia, 'Matrix').mockImplementation(() => {
      const matrix = {
        tx: 0, ty: 0,
        translate: (x: number, y: number) => { matrix.tx = x; matrix.ty = y; return matrix; },
        scale: () => matrix,
      };
      return matrix as never;
    });
    jest.spyOn(Skia.PathBuilder, 'Make').mockImplementation(() => {
      const builder = {
        moveTo: (x: number, y: number) => { points.push([x, y]); return builder; },
        lineTo: () => builder,
        addPath: (_path: unknown, matrix: { tx: number; ty: number }) => {
          points.push([matrix.tx, matrix.ty]); return builder;
        },
        detach: () => ({}),
      };
      return builder as never;
    });
    // Close in, the camera sits on the line: the precision fallback culls a line that is
    // wholly offscreen, and this test is about where a DRAWN vertex lands.
    const camera = zoom < 9 ? { ...CAMERA, zoom } : { ...CAMERA, lon: 18, lat: 59, zoom };
    await renderOverlay({ preview, camera: shared(camera), lines: LINE, geometryNow: DAY_START + DAY_MS / 2 - 45_000 });
    const exact = project(18, 59, camera);
    const expectedX = exact.x - (preview ? 0 : 512 * 2 ** camera.zoom * 45_000 / DAY_MS);
    expect(points.length).toBeGreaterThan(0);
    if (!preview && zoom < 9) {
      // The live drawing clock may lag by at most 0.05 screen pixels.
      expect(Math.abs((points.at(-1)?.[0] ?? Infinity) - expectedX)).toBeLessThan(0.05);
    } else {
      expect(points.at(-1)?.[0]).toBeCloseTo(expectedX, 6);
    }
    expect(points.at(-1)?.[1]).toBeCloseTo(exact.y, 6);
  });
});

describe('upcoming prayer entrance', () => {
  const twoLines = [...LINE, { ...LINE[0]!, prayer: 'asr' as const }];
  it('arms only the upcoming prayer; other lines are complete on their first frame', async () => {
    await renderOverlay({ lines: twoLines, nextKey: 'dhuhr' });
    const cores = strokes().filter((node) => node.props.strokeWidth === 2 || node.props.strokeWidth === 3.4);
    expect(cores).toHaveLength(2);
    expect(cores.find((node) => node.props.strokeWidth === 3.4)?.props.end.value).toBe(0);
    expect(cores.find((node) => node.props.strokeWidth === 2)?.props.end.value).toBe(1);
  });

  it('scrubbing interrupts a pending entrance and exposes the full current path', async () => {
    const view = await renderOverlay({ lines: LINE, nextKey: 'dhuhr', entranceEnabled: false });
    await view.rerender(overlay({ lines: LINE, nextKey: 'dhuhr', preview: true }));
    expect(strokes()).toHaveLength(2);
    for (const node of strokes()) expect(node.props.end).toBe(1);
  });

  it('shows the full path immediately when reduced motion is enabled', async () => {
    jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    await renderOverlay({ lines: LINE, nextKey: 'dhuhr' });
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
    allRendered((node) => node.props.blendMode === 'dstOut' && typeof node.type !== 'string');

  it('clears the reader’s dot, wherever it is on screen', async () => {
    withWash();
    await renderOverlay();
    const dot = erasers().find((node) => node.props.r != null);
    expect(dot).toBeDefined();
    const at = project(STOCKHOLM[0], STOCKHOLM[1], CAMERA);
    expect(dot!.props.cx.value).toBeCloseTo(at.x, 6);
    expect(dot!.props.cy.value).toBeCloseTo(at.y, 6);
  });

  it('clears each mosque speck on screen, a little wider than the speck', async () => {
    withWash();
    const holes = recordHoles();
    await renderOverlay({ mosquePoints: [STOCKHOLM, UPPSALA, LONDON] });
    // London is off-frame: no hole is cut for a speck nobody can see.
    expect(holes).toHaveLength(2);
    const at = project(UPPSALA[0], UPPSALA[1], CAMERA);
    const uppsala = holes.find((h) => Math.abs(h.x - at.x) < 1e-6 && Math.abs(h.y - at.y) < 1e-6);
    expect(uppsala).toBeDefined();
    expect(uppsala!.r).toBeGreaterThan(atZoom(DUST_RADIUS_STOPS, CAMERA.zoom));
  });

  it('stops clearing once the specks have handed over to the glyphs', async () => {
    // A hole past this point would uncover an empty patch of daylight, or one where
    // collision has culled a glyph.
    withWash();
    const holes = recordHoles();
    // Centred on Stockholm, so its speck WOULD be on screen — the zoom alone must stop it.
    const cityView = { ...CAMERA, lon: STOCKHOLM[0], lat: STOCKHOLM[1], zoom: 9 };
    await renderOverlay({ mosquePoints: [STOCKHOLM, UPPSALA], camera: shared(cityView) });
    expect(holes).toHaveLength(0);
  });

  it('cuts no mosque holes when the reader has hidden the mosques', async () => {
    withWash();
    await renderOverlay({ mosquePoints: [] });
    expect(erasers().filter((node) => node.props.path != null)).toHaveLength(0);
  });

  it('draws nothing at all when there is no wash to erase', async () => {
    const holes = recordHoles();
    await renderOverlay({ mosquePoints: [STOCKHOLM] });
    expect(erasers()).toHaveLength(0);
    expect(holes).toHaveLength(0);
  });
});

describe('a line fading out', () => {
  // THE BUG THIS PINS: a line that vanished kept its last contour for the 300 ms fade, but
  // measured its drift from the NEW geometryNow, so it jumped east by a tick's worth of
  // drift (~550 px at z11) at the start of every fade. It must keep drifting from the
  // instant its own contour was traced.
  it('keeps drifting from the instant its own contour was traced', async () => {
    const translations: number[] = [];
    jest.spyOn(Skia, 'Matrix').mockImplementation(() => {
      const matrix = {
        translate: (x: number) => { translations.push(x); return matrix; },
        scale: () => matrix,
      };
      return matrix as never;
    });
    const now = DAY_START + DAY_MS / 2;
    const traced = now - 45_000;
    const view = await renderOverlay({ lines: LINE, geometryNow: traced });
    const whileActive = translations.at(-1)!;
    // The next rebuild no longer has this prayer, and is traced for the present instant.
    await view.rerender(overlay({ lines: [], geometryNow: now }));
    expect(strokes().length).toBeGreaterThan(0); // still fading (the mock never finishes it)
    // Same clock, same contour, same drift: the fading line has not moved at all.
    expect(translations.at(-1)).toBeCloseTo(whileActive, 6);
    // …and that drift is real: 45 s at z4.5 is ~6 px west of the traced position.
    const ws = 512 * 2 ** CAMERA.zoom;
    expect(project(18, 59, CAMERA).x - whileActive).toBeGreaterThan(0);
    expect(Math.abs(project(18, 59, CAMERA).x - whileActive - (ws * 45_000) / DAY_MS)).toBeLessThan(0.1);
  });
});

describe('the arrival bloom', () => {
  // THE BUG THIS PINS: the bloom replayed whenever the overlay remounted (the map lesson,
  // a reset), so one arrival could bloom again minutes later.
  it('plays once per arrival, however often the overlay mounts', async () => {
    const timing = jest.spyOn(reanimated, 'withTiming');
    const blooms = () => timing.mock.calls.filter(([, config]) => config?.duration === 2400).length;
    const arrival = { prayer: 'maghrib' as const, id: DAY_START + 71_000_000 };
    const first = await renderOverlay({ arrival });
    expect(blooms()).toBe(1);
    await first.unmount();
    await renderOverlay({ arrival });
    expect(blooms()).toBe(1);
    await renderOverlay({ arrival: { ...arrival, prayer: 'isha', id: arrival.id + 5_000_000 } });
    expect(blooms()).toBe(2);
  });
});

describe('the polar boundary dashes', () => {
  // The dash pattern used to start at screen x = 0, so in a pan the dashes stood still
  // while the boundary slid under them. Phased by the ground, they travel with the map.
  it('move with the ground in a pan', async () => {
    const boundary = { lat: 67.41, kind: 'polar-night' as const };
    const phaseAt = async (lon: number) => {
      await renderOverlay({ polarBoundary: boundary, camera: shared({ ...CAMERA, lon }) });
      // The mocked Path renders nothing, so its effect is read off the element it was given
      // (by its props: the mock gives every Skia primitive the same component).
      const line = allOfType(Path).find((node) => node.props.strokeWidth === 1)!;
      const children = [line.props.children].flat() as { props?: { intervals?: number[]; phase?: { value: number } } }[];
      return children.find((child) => child?.props?.intervals)!.props!.phase!.value;
    };
    const ws = 512 * 2 ** CAMERA.zoom;
    // A pan of exactly 3 px east of the camera moves the pattern 3 px.
    const a = await phaseAt(CAMERA.lon);
    const b = await phaseAt(CAMERA.lon + (3 / ws) * 360);
    expect((b - a + 10) % 10).toBeCloseTo(3, 6);
    for (const phase of [a, b]) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(10);
    }
  });
});
