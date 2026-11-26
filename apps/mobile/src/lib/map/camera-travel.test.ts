// The camera's own travel time: one rule for the flight in and the fit back out, so the
// same journey lasts the same in both directions and a small correction stays quick.
import { describe, expect, it } from '@jest/globals';

import {
  cameraTravelMs,
  cityCameraTarget,
  cityFlightMs,
  cityIsInView,
  MS_PER_SCREEN_WIDTH,
  MS_PER_ZOOM_LEVEL,
  TRAVEL_MAX_MS,
  TRAVEL_MIN_MS,
  reachedCameraTarget,
} from './camera-travel';
import { type Camera, project, unproject } from './projection';

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

describe('city preview camera', () => {
  const malmo = { lon: 13.0038, lat: 55.605, zoom: 9.3 };
  const lund = { lon: 13.191, lat: 55.7058, zoom: 9.3 };
  const kiruna = { lon: 20.225, lat: 67.8557, zoom: 9.3 };
  const top = 104;
  const bottom = 220;

  it('centres the city in the map exposed between the nav and dock', () => {
    const target = cityCameraTarget(HOME, malmo, top, bottom);
    const projected = project(malmo.lon, malmo.lat, target);
    expect(projected.x).toBeCloseTo(HOME.width / 2);
    expect(projected.y).toBeCloseTo((HOME.height - bottom + top) / 2);
    expect(target.zoom).toBe(malmo.zoom);
  });

  it('only eases to visible cities clear of the top, side and bottom chrome', () => {
    const from = cityCameraTarget(HOME, malmo, top, bottom);
    expect(cityIsInView(from, lund, top, bottom)).toBe(true);
    expect(cityIsInView(from, kiruna, top, bottom)).toBe(false);
    for (const [x, y] of [[8, 400], [380, 400], [200, 20], [200, 820]] as const) {
      expect(cityIsInView(from, unproject(x, y, from), top, bottom)).toBe(false);
    }
  });

  it('scales and bounds the arc in both directions', () => {
    expect(cityFlightMs(malmo, malmo)).toBe(800);
    expect(cityFlightMs(malmo, lund)).toBeLessThan(900);
    expect(cityFlightMs(malmo, kiruna)).toBe(1800);
    expect(cityFlightMs(kiruna, malmo)).toBe(cityFlightMs(malmo, kiruna));
  });

  it('rejects an intermediate settle at the wrong zoom or location', () => {
    const target = cityCameraTarget(HOME, malmo, top, bottom);
    expect(reachedCameraTarget(target, target)).toBe(true);
    expect(reachedCameraTarget({ ...target, zoom: target.zoom - 0.1 }, target)).toBe(false);
    expect(reachedCameraTarget({ ...target, lon: target.lon + 1 }, target)).toBe(false);
  });
});
