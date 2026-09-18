// The camera's own travel time: one rule for the flight in and the fit back out, so the
// same journey lasts the same in both directions and a small correction stays quick.
import { describe, expect, it } from '@jest/globals';

import {
  cameraTravelMs,
  MS_PER_SCREEN_WIDTH,
  MS_PER_ZOOM_LEVEL,
  TRAVEL_MAX_MS,
  TRAVEL_MIN_MS,
} from './camera-travel';
import type { Camera } from './projection';

// The whole-Sweden home frame on a phone, near enough, and Stockholm at street scale.
const HOME: Camera = { lon: 17.4, lat: 62.5, zoom: 4.5, width: 393, height: 852 };
const STOCKHOLM = { lon: 18.0686, lat: 59.3293, zoom: 11 };

describe('cameraTravelMs', () => {
  it('sends the flight in and the reset out at the same pace', () => {
    const inbound = cameraTravelMs(HOME, STOCKHOLM);
    const outbound = cameraTravelMs({ ...HOME, ...STOCKHOLM }, HOME);
    expect(inbound).toBe(outbound);
    // Six and a half zoom levels is the long way: it gets the full time and no more.
    expect(inbound).toBe(TRAVEL_MAX_MS);
  });

  it('keeps a small correction quick', () => {
    // A reader who nudged the map a little and pressed Återställ.
    const nudged = { ...HOME, zoom: HOME.zoom + 0.2, lon: HOME.lon + 0.4 };
    const ms = cameraTravelMs(nudged, HOME);
    expect(ms).toBeGreaterThanOrEqual(TRAVEL_MIN_MS);
    expect(ms).toBeLessThan(TRAVEL_MIN_MS + 2 * MS_PER_ZOOM_LEVEL);
  });

  it('never goes below the floor or above the ceiling', () => {
    expect(cameraTravelMs(HOME, HOME)).toBe(TRAVEL_MIN_MS);
    expect(cameraTravelMs(HOME, { lon: -10, lat: 40, zoom: 14 })).toBe(TRAVEL_MAX_MS);
  });

  it('charges for a pan at the same zoom, by screen widths at that zoom', () => {
    // One full screen width east at home zoom: the pan term alone, on top of the floor.
    const ws = 512 * 2 ** HOME.zoom;
    const oneScreenEast = { ...HOME, lon: HOME.lon + (HOME.width / ws) * 360 };
    expect(cameraTravelMs(oneScreenEast, HOME)).toBe(
      Math.round(TRAVEL_MIN_MS + MS_PER_SCREEN_WIDTH),
    );
  });

  it('grows with the zoom span', () => {
    const one = cameraTravelMs(HOME, { ...HOME, zoom: HOME.zoom + 1 });
    const two = cameraTravelMs(HOME, { ...HOME, zoom: HOME.zoom + 2 });
    expect(two - one).toBe(MS_PER_ZOOM_LEVEL);
  });
});
