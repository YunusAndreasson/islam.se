// The prayer pills ride their lines. These pin WHERE a pill lands against the camera and
// the clock, the part a screenshot would only catch at city zoom between live rebuilds.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import * as reanimated from 'react-native-reanimated';

import { driftedCamera, MAX_DRIFT_MS, solarDrift } from '@/lib/map/line-geometry';
import { type Camera, project, unproject } from '@/lib/map/projection';
import { MapMarkersOverlay } from './MapMarkersOverlay';

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
