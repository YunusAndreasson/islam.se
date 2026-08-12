// The introduction's twelve year-frames.
//
// The load-bearing fact here is not what a frame contains but what building one must NOT
// touch. The map's lattice cache (./grid-cache) holds three days and is keyed by the
// viewed day; if the demo built its frames through it, twelve months would evict today's
// grid and hand the map screen a 200–600 ms JS-thread rebuild the instant the intro
// finished — a stutter on the very first impression of the app, caused by the screen that
// was supposed to sell it. Cheap to reintroduce (one import), invisible in review, and
// impossible to notice on a fast desktop. Hence a test.
//
// `buildGrid` is stubbed to a 2×2 lattice, and that costs this file nothing it wanted:
// every value asserted below — the anchor instant, its fraction of the day, the labels —
// comes from computePrayerTimes on Stockholm, not from the lattice. The lattice only
// feeds `lines`. Building real ones here would be twelve × ~6 s under Jest's transform
// (measured; the same call is ~40 ms in plain Node and a few tens of ms on device, so
// this is a test-environment cost, not a device one) for no extra assertion.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { computeSignature } from '@/lib/settings/compute-signature';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { __resetDemoCache, DEMO_FRAME_COUNT, demoDayStart, demoFrame } from './demo-year';
import { buildLines } from './field';
import { __resetGridCache, gridForDay } from './grid-cache';

jest.mock('./field', () => {
  const actual: typeof import('./field') = jest.requireActual('./field');
  return {
    ...actual,
    buildGrid: jest.fn(() => ({
      lats: [55, 69],
      lons: [11, 24],
      pt: [
        [zeroTimes(), zeroTimes()],
        [zeroTimes(), zeroTimes()],
      ],
    })),
    // Spied, not stubbed — the zeroed lattice above never produces a real contour, so
    // most tests below get the real buildLines running over it (empty lines/labels, same
    // as before this spy existed). Only the two tests that care about `avoid`/`labels`
    // read `.mock.calls` / override the return value.
    buildLines: jest.fn(actual.buildLines),
  };
  function zeroTimes() {
    return { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, sunset: 0 };
  }
});

jest.mock('./grid-cache', () => {
  const actual: typeof import('./grid-cache') = jest.requireActual('./grid-cache');
  return { ...actual, gridForDay: jest.fn(actual.gridForDay) };
});

const SIG = computeSignature(DEFAULT_SETTINGS);
// A fixed instant so the twelve sampled dates never depend on when the suite runs.
const TODAY = Date.UTC(2026, 5, 1, 12, 0, 0);

describe('demoFrame', () => {
  beforeEach(() => {
    __resetDemoCache();
    __resetGridCache();
    jest.clearAllMocks();
  });

  it('never goes through the map screen’s grid cache', () => {
    for (let month = 0; month < DEMO_FRAME_COUNT; month++) {
      demoFrame(month, TODAY, DEFAULT_SETTINGS, SIG);
    }
    expect(gridForDay).not.toHaveBeenCalled();
  });

  it('returns the same frame object on a repeat visit to a month', () => {
    // The month slider is a drag: without a cache, sweeping back and forth across
    // December would rebuild a lattice per crossing.
    const first = demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);
    const second = demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);
    expect(second).toBe(first);
  });

  it('rebuilds when a compute-affecting setting changes', () => {
    const shafi = demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);
    const hanafiSettings = { ...DEFAULT_SETTINGS, madhab: 'hanafi' as const };
    const hanafi = demoFrame(5, TODAY, hanafiSettings, computeSignature(hanafiSettings));
    expect(hanafi).not.toBe(shafi);
  });

  it('anchors every month on a real Maghrib, inside its own day', () => {
    for (let month = 0; month < DEMO_FRAME_COUNT; month++) {
      const frame = demoFrame(month, TODAY, DEFAULT_SETTINGS, SIG);
      expect(Number.isFinite(frame.instant)).toBe(true);
      // A fraction outside 0..1 would put the wash shader on the wrong side of midnight.
      expect(frame.fraction).toBeGreaterThan(0);
      expect(frame.fraction).toBeLessThan(1);
      expect(frame.timeLabel).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('shows the year actually moving — sunset in Stockholm is hours apart', () => {
    // The whole point of the demo. December's Maghrib is mid-afternoon; June's is late
    // evening. If these ever converge the lesson has silently stopped teaching anything,
    // and a frame builder accidentally pinned to one date would still pass every other
    // test in this file.
    const december = demoFrame(11, TODAY, DEFAULT_SETTINGS, SIG);
    const june = demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);
    const hoursInto = (f: { fraction: number }) => f.fraction * 24;
    expect(hoursInto(june) - hoursInto(december)).toBeGreaterThan(5);
  });

  it('samples mid-month, so no frame lands on a solstice edge case', () => {
    const dayStart = demoDayStart(2026, 0);
    expect(new Date(dayStart + 12 * 3_600_000).getUTCDate()).toBe(15);
  });

  it('carries buildLines\' labels through, not just the lines', () => {
    // The zeroed lattice above never produces a real contour, so the frame's `labels`
    // would be an empty array either way here — this asserts the FIELD is wired at all
    // (bonetider.tsx reads it to drive MapMarkersOverlay while the lesson is up), by
    // forcing buildLines to return one and checking it survives onto the frame unchanged.
    const label = { prayer: 'maghrib' as const, lngLat: [18, 59] as [number, number], tangent: [1, 0] as [number, number] };
    jest.mocked(buildLines).mockReturnValueOnce({ lines: { type: 'FeatureCollection', features: [] }, labels: [label] });

    const frame = demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);

    expect(frame.labels).toEqual([label]);
  });

  it('forwards avoid to buildLines, so a lesson pill can clear the user\'s real dot', () => {
    const avoid: [number, number] = [18.0686, 59.3293];
    demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG, avoid);

    expect(buildLines).toHaveBeenCalledWith(expect.anything(), expect.any(Number), avoid);
  });

  it('omits avoid by default, for a standalone demo with no dot on screen', () => {
    demoFrame(5, TODAY, DEFAULT_SETTINGS, SIG);

    expect(buildLines).toHaveBeenCalledWith(expect.anything(), expect.any(Number), undefined);
  });
});
