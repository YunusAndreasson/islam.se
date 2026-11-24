// The prayer pills ride their lines. These pin WHERE a pill lands against the camera and
// the clock, the part a screenshot would only catch at city zoom between live rebuilds.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as reanimated from 'react-native-reanimated';

import { driftedCamera, MAX_DRIFT_MS, solarDrift } from '@/lib/map/line-geometry';
import * as projection from '@/lib/map/projection';
import { type Camera, project, unproject } from '@/lib/map/projection';
import { FirstCityLabel, MapMarkersOverlay } from './MapMarkersOverlay';
import { type PrayerLineData, SolarSkiaOverlay } from './skia/SolarSkiaOverlay';

const DAY_START = Date.UTC(2026, 7, 2, 22, 0, 0);
const DAY_MS = 86_400_000;
const NOW = DAY_START + DAY_MS / 2;
// City zoom over Stockholm, where a tick's drift is hundreds of pixels.
const CITY: Camera = { lon: 18.07, lat: 59.33, zoom: 11, width: 390, height: 780 };
const ANCHOR: [number, number] = [18.07, 59.33];

const shared = <T,>(value: T) => ({ value, get: () => value, set: () => {} }) as never;

afterEach(() => { jest.restoreAllMocks(); });

/** Runs the pill's UI-thread style once, as Reanimated would, and returns its translate. */
async function pillAt(
  geometryNow: number,
  preview: boolean,
  polylines: [number, number][][] = [[[18.07, 59.0], [18.07, 59.7]]],
  labelAt: [number, number] = ANCHOR,
) {
  jest.spyOn(reanimated, 'useAnimatedStyle').mockImplementation(((fn: () => object) => fn()) as never);
  await render(
    <MapMarkersOverlay
      camera={shared(CITY)}
      dayStart={DAY_START}
      dayLength={DAY_MS}
      nowFraction={shared((NOW - DAY_START) / DAY_MS)}
      geometryNow={geometryNow}
      preview={preview}
      labels={[{ prayer: 'maghrib', lngLat: labelAt, tangent: [0, 1] }]}
      lines={[{ prayer: 'maghrib', polylines }]}
      topInset={0}
      bottomInset={0}
      nextKey={null}
      polarBoundary={null}
    />,
  );
  const pill = screen.getByText('Maghrib');
  // The anchor view is the pill's grandparent: anchor → chip → label.
  const anchor = pill.parent!.parent!;
  const style = [anchor.props.style].flat(3).find((s) => s && 'transform' in s) as {
    transform: [{ translateX: number }, { translateY: number }];
  };
  const chip = [pill.parent!.props.style].flat(3).find((s) => s && 'opacity' in s) as { opacity: number };
  return { x: style.transform[0].translateX, y: style.transform[1].translateY, opacity: chip.opacity };
}

describe('a prayer pill between live rebuilds', () => {
  // THE BUG THIS PINS: only the Skia line applied the sun's drift, so for up to 45 s after
  // each rebuild the pill stayed where its line HAD been. At z11 that is ~550 px: the pill
  // named a line that was no longer under it.
  it('sits where its line is drawn, drift included', async () => {
    const built = NOW - MAX_DRIFT_MS;
    const at = await pillAt(built, false);
    const drawn = project(ANCHOR[0], ANCHOR[1], driftedCamera(CITY, solarDrift(NOW, built, false)));
    expect(Math.abs(at.x - drawn.x)).toBeLessThan(0.5);
    expect(at.y).toBeCloseTo(drawn.y, 6);
    // The drift is not negligible here; a pill on the undrifted anchor would be far off.
    expect(project(ANCHOR[0], ANCHOR[1], CITY).x - at.x).toBeGreaterThan(400);
  });

  it('sits on the exact anchor in a scrub preview, as the lines do', async () => {
    const at = await pillAt(NOW - MAX_DRIFT_MS, true);
    const exact = project(ANCHOR[0], ANCHOR[1], CITY);
    expect(at.x).toBeCloseTo(exact.x, 6);
    expect(at.y).toBeCloseTo(exact.y, 6);
  });
});

it.each(['field first', 'pills first'])('projects each new scrub contour once for the field and pill (%s)', async (order) => {
  // The field and its pill used to each project every vertex of the same immutable
  // contour when scrubbing. Count a vertex distinct from the camera and label anchor.
  const mercY = jest.spyOn(projection, 'mercY');
  const firstLatitude = 59.123;
  const nextLatitude = 59.456;
  const camera = shared(CITY);
  const nowFraction = shared(0.5);
  function overlays(latitude: number, geometryNow: number) {
    const lines: PrayerLineData[] = [{ prayer: 'maghrib', polylines: [[[18, latitude], [18.2, 59.7]]] }];
    const common = {
      camera, nowFraction, dayStart: DAY_START, dayLength: DAY_MS, geometryNow,
      preview: true, lines, nextKey: null, polarBoundary: null,
    };
    const field = <SolarSkiaOverlay {...common} userPoint={ANCHOR} imminentKey={null} arrival={null} />;
    const pills = (
      <MapMarkersOverlay {...common}
        labels={[{ prayer: 'maghrib', lngLat: ANCHOR, tangent: [0, 1] }]}
        topInset={0} bottomInset={0}
      />
    );
    return order === 'field first' ? <>{field}{pills}</> : <>{pills}{field}</>;
  }
  const view = await render(overlays(firstLatitude, NOW));
  await view.rerender(overlays(nextLatitude, NOW + 30_000));
  const contourSamples = mercY.mock.calls.map(([lat]) => lat)
    .filter((lat) => lat === firstLatitude || lat === nextLatitude);
  expect(contourSamples).toEqual([firstLatitude, nextLatitude]);
});

describe('a prayer pill whose line misses the label band', () => {
  // THE BUG THIS PINS (seen on the emulator, Maghrib on 7 November): the line crossed only
  // the top corner of the screen, above the nav discs. visibleLineLabel found no stretch of
  // it in the band and fell back to the raw anchor, so the pill stood under the status bar,
  // cut off at the screen's edge. It must not be drawn there at all.
  it('is hidden instead of standing on its raw anchor outside the band', async () => {
    // A short east-west line 15 px below the top of the screen: on screen, but above the
    // label band (the test's top inset is 0, so the band is bounded by its side margins;
    // the line runs between x = 4 and 20, left of the 32 px margin).
    const a = unproject(4, 15, CITY);
    const b = unproject(20, 15, CITY);
    const at = await pillAt(NOW, true, [[[a.lon, a.lat], [b.lon, b.lat]]], [a.lon, a.lat]);
    expect(at.x).toBeLessThan(32);
    expect(at.opacity).toBe(0);
  });

  it('is shown when its line crosses the band', async () => {
    expect((await pillAt(NOW, true)).opacity).toBe(1);
  });
});

// Polarnatt used to sit under Android's status icons. Its two-line caption
// grows with system text, so visibility depends on the measured text height.
it('shows the polar caption only when its full height clears the top inset', async () => {
  jest.spyOn(reanimated, 'useAnimatedStyle').mockImplementation(((fn: () => object) => fn()) as never);
  const overlay = (lineY: number) => <MapMarkersOverlay camera={shared({ ...CITY, lon: 16 })} dayStart={DAY_START}
    dayLength={DAY_MS} nowFraction={shared(0.5)} geometryNow={NOW} labels={[]} lines={[]}
    headerBottom={40} topInset={150} bottomInset={0} nextKey={null}
    polarBoundary={{ kind: 'polar-night', lat: unproject(140, lineY, CITY).lat }} />;
  const view = await render(overlay(80));
  const wrap = () => screen.getByText('Polarnatt', { includeHiddenElements: true }).parent!;
  await fireEvent(wrap(), 'layout', { nativeEvent: { layout: { width: 85, height: 35 } } });
  await view.rerender(overlay(81));
  expect(wrap().parent).toHaveStyle({ opacity: 0 });
  await view.rerender(overlay(110));
  expect(wrap().parent).toHaveStyle({ opacity: 1 });
});

// The old text painted a second point and a white rectangle over the native pin.
it('places one bare, haloed city name beside the pin without needing basemap tiles', async () => {
  jest.spyOn(reanimated, 'useAnimatedStyle').mockImplementation(((fn: () => object) => fn()) as never);
  await render(<FirstCityLabel camera={shared(CITY)} point={ANCHOR} name="Stockholm" />);
  const name = screen.getByText('Stockholm', { exact: true });
  expect(screen.queryByText(/●/)).toBeNull();
  const style = StyleSheet.flatten(name.props.style);
  expect(style.fontWeight).toBe('700');
  expect(style.textShadowRadius).toBeGreaterThan(0);
  expect(style.textShadowColor).toBeTruthy();
  expect(style.backgroundColor).toBeUndefined();
  expect(name.parent).toHaveStyle({ transform: [{ translateX: CITY.width / 2 + 12 }, { translateY: CITY.height / 2 }] });
});

// Android clipped the translated Text against its untranslated parent, cutting
// away the tops of the letters. The native box must contain the entire name.
it.each([
  ['Stockholm', 4.5, 74, 24, 195], ['Malmö', 12, 150, 66, 365],
] as const)('keeps the full measured %s label on screen at zoom %s', async (name, zoom, width, height, x) => {
  jest.spyOn(reanimated, 'useAnimatedStyle').mockImplementation(((fn: () => object) => fn()) as never);
  const camera = { ...CITY, zoom };
  const point = unproject(x, 330, camera);
  const label = () => <FirstCityLabel camera={shared(camera)} point={[point.lon, point.lat]} name={name} />;
  const view = await render(label());
  const text = () => screen.getByText(name, { includeHiddenElements: true });
  await fireEvent(text().parent!, 'layout', { nativeEvent: { layout: { width, height } } });
  await view.rerender(label());
  expect(StyleSheet.flatten(text().props.style).transform).toBeUndefined();
  const box = StyleSheet.flatten(text().parent!.props.style);
  const [dx, dy] = box.transform;
  expect(dy.translateY + height / 2).toBeCloseTo(330);
  expect(dx.translateX).toBeGreaterThanOrEqual(0);
  expect(dx.translateX + width).toBeLessThanOrEqual(camera.width);
  expect(box.opacity).toBe(1);
});

// During the flyover a caption could be above the status inset yet overlap the
// title, or sit inside the reading sheet. Check the entire measured caption.
it('hides the polar caption as either edge crosses the visible map band', async () => {
  jest.spyOn(reanimated, 'useAnimatedStyle').mockImplementation(((fn: () => object) => fn()) as never);
  const cam = { ...CITY, lon: 16 };
  const overlay = (bottom: number) => <MapMarkersOverlay camera={shared(cam)} dayStart={DAY_START}
    dayLength={DAY_MS} nowFraction={shared(0.5)} geometryNow={NOW} labels={[]} lines={[]}
    headerBottom={160} topInset={150} bottomInset={300} nextKey={null}
    polarBoundary={{ kind: 'polar-night', lat: unproject(195, bottom + 18, cam).lat }} />;
  const view = await render(overlay(260));
  const wrap = () => screen.getByText('Polarnatt', { includeHiddenElements: true }).parent!;
  await fireEvent(wrap(), 'layout', { nativeEvent: { layout: { width: 100, height: 50 } } });
  for (const [bottom, opacity] of [[180, 0], [260, 1], [481, 0]] as const) {
    await view.rerender(overlay(bottom));
    expect(wrap().parent).toHaveStyle({ opacity });
  }
});
