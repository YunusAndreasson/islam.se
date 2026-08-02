// The arc renders as a Skia draw node, which the jest mock turns into nothing — so this
// file cannot assert pixels. What it CAN assert is that every hook the component runs
// survives the positions the app can actually hand it, which is where this component's
// crashes would come from: greatCirclePoints throws on invalid coordinates, and the
// projection maths runs inside useMemo/useDerivedValue during render (the reanimated mock
// executes derived worklets once, so the path really is built here).
import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import type { Camera } from '@/lib/map/projection';
import { QiblaArc } from './QiblaArc';

const shared = <T,>(value: T) => ({ value }) as never;

function renderArc(from: [number, number], camera: Partial<Camera> = {}) {
  render(
    <QiblaArc
      camera={shared({ lon: 17.4, lat: 62.1, zoom: 4.5, width: 390, height: 780, ...camera })}
      from={from}
    />,
  );
}

describe('QiblaArc', () => {
  // The four corners of the app's world: the fallback city, the far north, the far south,
  // and the far west. All are positions resolveLocation can genuinely produce.
  it.each<[string, [number, number]]>([
    ['Stockholm', [18.0686, 59.3293]],
    ['Kiruna', [20.2253, 67.8558]],
    ['Smygehuk', [13.3594, 55.3367]],
    ['Strömstad', [11.1731, 58.9339]],
  ])('projects an arc from %s without throwing', (_name, from) => {
    expect(() => renderArc(from)).not.toThrow();
  });

  // The two extremes of the map's zoom range. At country zoom the arc leaves the screen
  // almost immediately; at street zoom the visible slice is a sliver near the head — the
  // gradient is anchored to the two real endpoints, so both must build.
  it.each([3, 18])('projects at zoom %s', (zoom) => {
    expect(() => renderArc([18.0686, 59.3293], { zoom })).not.toThrow();
  });

  // Standing on the Kaaba is the degenerate case for the great circle (no unique plane).
  // Nobody in Sweden will, but a manual city pick plus a stale GPS fix is enough to make
  // "the two points coincide" reachable, and NaN geometry draws as garbage, not nothing.
  it('survives standing exactly at the destination', () => {
    expect(() => renderArc([39.8262, 21.4225])).not.toThrow();
  });
});
