// The Skia field layer, rendered directly rather than through the map screen — so the two
// branches that only appear on certain DATES or certain SETTINGS can be exercised on any
// day, from any state, without driving MapLibre.
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import type { Camera } from '@/lib/map/projection';
import { SolarSkiaOverlay } from './SolarSkiaOverlay';

// Every Skia draw node renders as null under the jest mock, so a path on the canvas is
// invisible to a query. Standing the arc in as a host view is what makes "is it drawn?"
// answerable at all — and it keeps this file about the OVERLAY's wiring. The arc's own
// geometry is covered by QiblaArc.test.tsx and lib/qibla.test.ts.
jest.mock('./QiblaArc', () => ({
  // require, not import: jest.mock factories are hoisted above the imports, so the outer
  // scope is not available to them yet.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  QiblaArc: () => require('react').createElement('qibla-arc', { testID: 'qibla-arc' }),
}));

const CAMERA = { lon: 17.4, lat: 62.1, zoom: 4.5, width: 390, height: 780 } satisfies Camera;
const STOCKHOLM: [number, number] = [18.0686, 59.3293];
const DAY_START = Date.UTC(2026, 7, 2, 22, 0, 0); // a Stockholm midnight, high summer
const DAY_MS = 24 * 60 * 60 * 1000;

// The reanimated mock returns a plain { value } object for useSharedValue, which is what
// the overlay's worklets read — so the derived paths below really are built.
const shared = <T,>(value: T) => ({ value }) as never;

function renderOverlay(overrides: Partial<Parameters<typeof SolarSkiaOverlay>[0]> = {}) {
  render(
    <SolarSkiaOverlay
      dayStart={DAY_START}
      dayLength={DAY_MS}
      nowFraction={shared(0.5)}
      geometryNow={DAY_START + DAY_MS / 2}
      camera={shared(CAMERA)}
      lines={[]}
      showQibla
      nextKey={null}
      imminentKey={null}
      userPoint={STOCKHOLM}
      arrival={null}
      polarBoundary={null}
      {...overrides}
    />,
  );
}

describe('the qibla arc on the map', () => {
  it('is drawn from the user position by default', () => {
    renderOverlay();
    expect(screen.getByTestId('qibla-arc')).toBeTruthy();
  });

  // Inställningar → Utseende → "Visa qibla-riktning". Turning it off has to remove the
  // path, not merely make it invisible: an alpha-0 stroke still costs a path rebuild on
  // every pan frame, and "off" that still draws is the kind of thing nobody notices.
  it('is gone entirely when the setting is off', () => {
    renderOverlay({ showQibla: false });
    expect(screen.queryByTestId('qibla-arc')).toBeNull();
  });
});

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
