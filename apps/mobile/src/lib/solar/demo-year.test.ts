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
import { computePrayerTimes, PRAYER_LABELS, PRAYER_ORDER } from '@/lib/prayer-times';
import {
  __resetDemoCache,
  DEMO_FRAME_COUNT,
  demoDayStart,
  demoFrame,
  MAP_LESSON_EXAMPLES,
} from './demo-year';
import { buildLines } from './field';
import { __resetGridCache, gridForDay, lineGridSettings } from './grid-cache';
import { polarBoundaryFor } from './sun';

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

describe('MAP_LESSON_EXAMPLES', () => {
  // MapLessonCard prints each frame's date and clock time as a caption directly above the
  // fact. The December fact once read "Maghrib kan komma redan
  // vid 15" under a caption reading "Maghrib i Stockholm 14:54": the same news twice, the
  // second copy rounded the wrong way. The caption follows the reader's method; a static
  // string cannot, so a fact must never carry a clock time at all.
  it.each(MAP_LESSON_EXAMPLES)('month $month states no clock time — the caption owns it', ({ fact }) => {
    expect(fact).not.toMatch(/\b\d{1,2}[:.]\d{2}\b|\bvid \d{1,2}\b/);
  });

  // The lesson is for someone who has never seen prayer times on a map. The June fact once
  // named three prayers in one sentence on top of a caption naming a fourth; each fact now
  // carries one idea, and the pills on the map are what name the lines.
  it.each(MAP_LESSON_EXAMPLES)('month $month names at most one prayer', ({ fact }) => {
    const named = PRAYER_ORDER.filter((key) => fact.includes(PRAYER_LABELS[key]));
    expect(named.length).toBeLessThanOrEqual(1);
  });

  // The December fact is a physical claim — the north gets Maghrib first, Umeå nearly two
  // hours before Malmö — so it is checked against the same maths the map draws with. If
  // the month or the towns change, this is what says the sentence stopped being true.
  it('keeps the December claim true: Umeå’s Maghrib nearly two hours before Malmö’s', () => {
    const december = MAP_LESSON_EXAMPLES.find((e) => e.month === 11);
    expect(december?.fact).toMatch(/Umeå nästan två timmar före Malmö/);

    const day = new Date(demoDayStart(2026, 11) + 12 * 3_600_000);
    const umea = computePrayerTimes({ latitude: 63.8258, longitude: 20.263 }, day, DEFAULT_SETTINGS);
    const malmo = computePrayerTimes({ latitude: 55.605, longitude: 13.0038 }, day, DEFAULT_SETTINGS);
    const minutes = (malmo.maghrib.getTime() - umea.maghrib.getTime()) / 60_000;

    expect(minutes).toBeGreaterThanOrEqual(95);
    expect(minutes).toBeLessThan(120);
  });

  // The June fact is a physical claim too: Kiruna lies beyond the dashed midnight-sun line
  // the frame draws, and there, with the settings the map's lines are built from, none of
  // the three night prayers resolves. A draft of this fact claimed the prayer LINES end at
  // that boundary; they do not (at the frame's instant there is no Fajr line at all), which
  // is exactly the kind of claim this checks against the maths instead of the eye.
  it('keeps the June claim true: Kiruna is past the midnight-sun line, with no night there', () => {
    const june = MAP_LESSON_EXAMPLES.find((e) => e.month === 5);
    expect(june?.fact).toMatch(/Kiruna ligger norr om den streckade linjen/);

    const dayStart = demoDayStart(2026, 5);
    const boundary = polarBoundaryFor(new Date(dayStart + 12 * 3_600_000));
    const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
    expect(boundary?.kind).toBe('midnight-sun');
    expect(boundary!.lat).toBeLessThan(KIRUNA.latitude);

    const times = computePrayerTimes(
      KIRUNA,
      new Date(dayStart + 12 * 3_600_000),
      lineGridSettings(DEFAULT_SETTINGS),
    );
    for (const key of ['maghrib', 'isha', 'fajr'] as const) {
      expect(Number.isNaN(times[key].getTime())).toBe(true);
    }
  });
});
