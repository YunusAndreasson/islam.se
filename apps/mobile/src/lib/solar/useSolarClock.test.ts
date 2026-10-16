// The map clock spans the SWEDISH day, not the device's, and the day's REAL length
// (23/24/25 h across DST). These guard the two bugs that motivated the Stockholm-local
// model: a device-timezone day boundary (wrong day's prayer field abroad) and a fixed
// 86_400_000 day length (scrubber marks drift an hour on the two DST-transition days).
//
// We freeze only the Date (timers stay real) so the hook's initial `Date.now()` and its
// startOfZoneDay() are deterministic regardless of the machine's own timezone — that
// device-independence is exactly the property under test.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { LIVE_TICK_MS, MAX_DAY_OFFSET, useSolarClock } from './useSolarClock';
import { DEFAULT_ZONE, setDisplayZone, startOfZoneDay } from '@/lib/zone-time';

const HOUR = 60 * 60 * 1000;

// The Stockholm wall-clock rendering of an instant — used to assert dayStart is local
// midnight without hard-coding the UTC offset (which differs winter vs summer).
function stockholmClock(epoch: number): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(epoch));
}

function freeze(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

beforeEach(() => {
  // Fake only Date; real timers keep the live-tick interval and RNTL behaving normally.
  jest.useFakeTimers({
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSolarClock spans the Stockholm day', () => {
  it('anchors dayStart to Stockholm-local midnight, not device-local', async () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = await renderHook(() => useSolarClock());
    // Whatever the host timezone, dayStart must read 00:00:00 in Stockholm.
    expect(stockholmClock(result.current.dayStart)).toBe('00:00:00');
  });

  it('reports the real day length across DST: 24 h normally, 23 h spring-forward, 25 h fall-back', async () => {
    // Sweden's 2026 transitions: forward 2026-03-29 (23 h), back 2026-10-25 (25 h).
    freeze('2026-07-01T15:00:00Z');
    expect((await renderHook(() => useSolarClock())).result.current.dayLength).toBe(24 * HOUR);

    freeze('2026-03-29T15:00:00Z');
    expect((await renderHook(() => useSolarClock())).result.current.dayLength).toBe(23 * HOUR);

    freeze('2026-10-25T15:00:00Z');
    expect((await renderHook(() => useSolarClock())).result.current.dayLength).toBe(25 * HOUR);
  });

  it('places `now` at its fraction of the real day (17:00 local on a 24 h summer day)', async () => {
    freeze('2026-07-01T15:00:00Z'); // 17:00 in Stockholm (CEST = UTC+2)
    const { result } = await renderHook(() => useSolarClock());
    expect(result.current.fraction).toBeCloseTo(17 / 24, 4);
  });

  it('scrubbing to a fraction maps back through the real day length (no DST clamp)', async () => {
    // The 25 h fall-back day is the one a fixed 24 h model broke: f = 1 must reach the
    // next local midnight (dayStart + 25 h), and the last local hour must be reachable.
    freeze('2026-10-25T15:00:00Z');
    const { result } = await renderHook(() => useSolarClock());
    const { dayStart, dayLength } = result.current;

    await act(() => result.current.setFraction(1));
    expect(result.current.now).toBe(dayStart + dayLength); // exactly next local midnight
    expect(result.current.mode).toBe('scrub');
    expect(stockholmClock(result.current.now)).toBe('00:00:00');

    await act(() => result.current.setFraction(0.5));
    expect(result.current.fraction).toBeCloseTo(0.5, 6);
  });
});

describe('useSolarClock setInstant', () => {
  it('lands `now` on the EXACT instant (no fraction round-trip) and enters scrub mode', async () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = await renderHook(() => useSolarClock());
    // An odd-millisecond target mid-day: setFraction would round-trip-drift off it, which is
    // what made a tapped prayer land a sub-ms past its time and the NEXT prayer highlight.
    const target = result.current.dayStart + 13 * HOUR + 47 * 60_000 + 123;
    await act(() => result.current.setInstant(target));
    expect(result.current.now).toBe(target);
    expect(result.current.mode).toBe('scrub');
  });

  it('clamps an instant outside the viewed day to the day bounds', async () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = await renderHook(() => useSolarClock());
    const { dayStart, dayLength } = result.current;
    await act(() => result.current.setInstant(dayStart - 5 * HOUR));
    expect(result.current.now).toBe(dayStart);
    await act(() => result.current.setInstant(dayStart + dayLength + 5 * HOUR));
    expect(result.current.now).toBe(dayStart + dayLength);
  });
});

// Day navigation. The clock gained a viewed DAY that moves independently of `mode`, and
// the two must stay orthogonal: `mode` answers "is `now` the real now?", the day answers
// "which day?". A user has to be able to scrub within a day that is not today, which is
// why there is no third 'day' mode — see the ClockMode comment.
describe('useSolarClock day navigation', () => {
  const AUGUST = '2026-08-01T12:00:00Z';

  it('starts on today with a zero offset', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    expect(result.current.dayOffset).toBe(0);
    expect(result.current.dayStart).toBe(result.current.todayStart);
  });

  it('steps forward and back, and reports the offset', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    await act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(1);
    expect(result.current.dayStart).toBe(today + 24 * HOUR);

    await act(() => result.current.stepDay(-2));
    expect(result.current.dayOffset).toBe(-1);
    expect(result.current.dayStart).toBe(today - 24 * HOUR);
  });

  // REGRESSION (found on an emulator, 2026-08-25): tapping the day chevron ten times in a
  // row advanced the dock four days, not ten. Every tap DID reach the handler — the field
  // rebuild blocks JS for a few hundred ms, so the taps that land during it are delivered
  // together the moment it frees up, and React batches them into ONE render. Each call in
  // that batch read the SAME committed `dayOffset` and asked for `dayOffset + 1`, so a
  // burst of four taps moved the day by one.
  //
  // Two steps in a single act() is that burst: the hook must count the calls, not the
  // renders. Nothing in the earlier tests catches it — they all wrap each step in its own
  // act(), which commits in between and hides the staleness.
  it('counts every step in a batch, not just the last one', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    await act(() => {
      result.current.stepDay(1);
      result.current.stepDay(1);
      result.current.stepDay(1);
    });
    expect(result.current.dayOffset).toBe(3);
    expect(result.current.dayStart).toBe(today + 3 * 24 * HOUR);

    // Backwards through the same batching, and mixed directions cancel exactly.
    await act(() => {
      result.current.stepDay(-1);
      result.current.stepDay(-1);
    });
    expect(result.current.dayOffset).toBe(1);

    await act(() => {
      result.current.stepDay(1);
      result.current.stepDay(-1);
    });
    expect(result.current.dayOffset).toBe(1);
  });

  // The rails still hold when the burst runs past them, and a batch that overshoots does
  // not leave a "debt" the next backward tap has to pay off before the day moves.
  it('clamps a batch at the rail and steps straight back off it', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());

    await act(() => {
      for (let i = 0; i < MAX_DAY_OFFSET + 5; i++) result.current.stepDay(1);
    });
    expect(result.current.dayOffset).toBe(MAX_DAY_OFFSET);

    await act(() => result.current.stepDay(-1));
    expect(result.current.dayOffset).toBe(MAX_DAY_OFFSET - 1);
  });

  // A jump and a step in the same batch: the step must build on the jump, not on the day
  // that was committed before it. (The date picker closes and the user taps the chevron.)
  it('steps from the day a batched jump selected', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    await act(() => {
      result.current.goToDay(today + 10 * 24 * HOUR);
      result.current.stepDay(1);
    });
    expect(result.current.dayOffset).toBe(11);

    // …and "Nu" wins over a step queued behind it, because reset is the user asking for
    // today explicitly.
    await act(() => {
      result.current.stepDay(1);
      result.current.reset();
    });
    expect(result.current.dayOffset).toBe(0);
    await act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(1);
  });

  // The scrubber thumb must not jump under the user's finger when the day changes, so a
  // step preserves the FRACTION through the day rather than the wall-clock time.
  it('keeps the time of day when stepping', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    await act(() => result.current.setFraction(0.25));
    const fractionBefore = result.current.fraction;
    const wallClockBefore = stockholmClock(result.current.now);

    await act(() => result.current.stepDay(3));
    expect(result.current.fraction).toBeCloseTo(fractionBefore, 9);
    // Between two ordinary 24-hour days, preserving the fraction also preserves the wall
    // clock exactly — 06:00 stays 06:00. (The DST days are the deliberate exception; see
    // the test below.)
    expect(stockholmClock(result.current.now)).toBe(wallClockBefore);
  });

  // On the 23-hour day there is no 02:30 at all, so "the same clock time" is undefined
  // there while "the same point through the day" always exists. Preserving the fraction
  // therefore shifts the wall clock by up to an hour across a transition — the deliberate
  // trade, pinned here so nobody "fixes" it into a hole in the 23-hour day.
  it('spans the real length of the day it lands on (both DST directions)', async () => {
    freeze('2026-03-28T12:00:00Z'); // the day before the 23 h day
    const spring = await renderHook(() => useSolarClock());
    await act(() => spring.result.current.stepDay(1));
    expect(spring.result.current.dayLength).toBe(23 * HOUR);
    expect(spring.result.current.dayStart - spring.result.current.todayStart).toBe(24 * HOUR);

    freeze('2026-10-24T12:00:00Z'); // the day before the 25 h day
    const autumn = await renderHook(() => useSolarClock());
    await act(() => autumn.result.current.stepDay(1));
    expect(autumn.result.current.dayLength).toBe(25 * HOUR);
    // The offset is still exactly 1 even though the midnights are 24 h apart in real time
    // here and 25 h apart on the next step — dayOffset rounds, and ±1 h cannot reach a day.
    expect(autumn.result.current.dayOffset).toBe(1);
    await act(() => autumn.result.current.stepDay(1));
    expect(autumn.result.current.dayOffset).toBe(2);
  });

  // Anchoring each step on todayStart + offset rather than accumulating from dayStart is
  // what makes this exact. Accumulating would drift by an hour per transition crossed, so
  // a user who paged forward and back across a DST boundary would not land on today.
  it('round-trips to exactly today after paging to the rail and back', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    for (let i = 0; i < 365; i++) await act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(365);
    for (let i = 0; i < 365; i++) await act(() => result.current.stepDay(-1));

    expect(result.current.dayOffset).toBe(0);
    expect(result.current.dayStart).toBe(today);
  });

  it('clamps at the rails instead of wandering off', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    await act(() => result.current.stepDay(9999));
    expect(result.current.dayOffset).toBe(365);
    await act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(365);

    await act(() => result.current.stepDay(-99_999));
    expect(result.current.dayOffset).toBe(-365);
  });

  it('jumps to an arbitrary day, from anywhere in that day', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    // Any instant inside the target day selects that day — the date picker hands over
    // whatever the tapped cell means, not a midnight.
    await act(() => result.current.goToDay(today + 10 * 24 * HOUR + 17 * HOUR));
    expect(result.current.dayOffset).toBe(10);

    await act(() => result.current.goToDay(today));
    expect(result.current.dayOffset).toBe(0);
  });

  // THE INVARIANT the whole "no third mode" decision rests on: live always means today.
  // Everything downstream — the arrival bloom, the countdown, the intro gate — reads
  // `mode === 'live'` and would be wrong on another day if this could be violated.
  it('never stays live on another day, and never re-enters live by stepping back', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    expect(result.current.mode).toBe('live');

    await act(() => result.current.stepDay(1));
    expect(result.current.mode).toBe('scrub');

    // Stepping back ONTO today does not resume live: the user is at 12:00 today, not now.
    await act(() => result.current.stepDay(-1));
    expect(result.current.dayOffset).toBe(0);
    expect(result.current.mode).toBe('scrub');

    // Only the explicit return does.
    await act(() => result.current.reset());
    expect(result.current.mode).toBe('live');
    expect(result.current.dayOffset).toBe(0);
  });

  // Scrubbing while on another day must move within THAT day. If a refactor re-pinned the
  // clamps to today, dragging the slider on a future day would silently snap back.
  it('scrubs within the VIEWED day, not today', async () => {
    freeze(AUGUST);
    const { result } = await renderHook(() => useSolarClock());
    await act(() => result.current.stepDay(5));
    const viewed = result.current.dayStart;

    await act(() => result.current.setFraction(0.75));
    expect(result.current.now).toBe(viewed + 0.75 * result.current.dayLength);

    // And setInstant clamps to the viewed day's bounds, not today's.
    await act(() => result.current.setInstant(viewed - 10 * HOUR));
    expect(result.current.now).toBe(viewed);
    await act(() => result.current.setInstant(viewed + 40 * HOUR));
    expect(result.current.now).toBe(viewed + result.current.dayLength);
  });

  // Real midnight passing while a day is parked. The viewed day must HOLD (the user chose
  // it) while todayStart advances, so what was "i morgon" becomes "i dag" on its own
  // rather than the dock going on mislabelling it for the rest of the session.
  // Driven through the active gate so the effect's immediate sync() fires deterministically,
  // without waiting out a real 30 s interval.
  it('re-labels a parked day when real midnight passes underneath it', async () => {
    freeze('2026-08-01T21:00:00Z'); // 23:00 Stockholm, an hour before midnight
    const { result, rerender } = await renderHook<ReturnType<typeof useSolarClock>, { active: boolean }>(
      ({ active }) => useSolarClock(active),
      { initialProps: { active: true } },
    );
    await act(() => result.current.stepDay(1));
    const parked = result.current.dayStart;
    expect(result.current.dayOffset).toBe(1);

    // Pause the clock, let real time cross midnight, then resume — the resume path runs
    // sync() immediately.
    await rerender({ active: false });
    freeze('2026-08-01T23:00:00Z'); // 01:00 Stockholm, the next day
    await act(async () => await rerender({ active: true }));

    // The viewed day did not move; its NAME did.
    expect(result.current.dayStart).toBe(parked);
    expect(result.current.dayOffset).toBe(0);
  });
});

// A live tick is not free: it rebuilds the whole-country prayer field (six prayers over
// ~3752 cells, marching squares, chaining, smoothing, Catmull-Rom) and re-renders the map
// screen, all on the JS thread — the same thread that forwards each camera frame to the
// Skia overlay. Landing mid-pan, that shows up as the overlay stalling against the basemap
// while the finger keeps moving. So the map can ask for a tick to be held, and collect it
// when the camera comes to rest.
//
// Full fake timers here (the file's default leaves the interval real), so the 30 s tick can
// be made to fire on demand — advanceTimersByTime moves Date.now() with it.
describe('useSolarClock defers a tick while the map is moving', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    freeze('2026-07-01T12:00:00Z');
  });

  /** Renders the clock with a caller-controlled "am I moving?" flag. */
  async function movingClock() {
    const state = { moving: false };
    const { result } = await renderHook(() => useSolarClock(true, () => state.moving));
    return { result, state };
  }

  it('holds the tick back while the map moves, and flush collects it', async () => {
    const { result, state } = await movingClock();
    const before = result.current.now;

    state.moving = true;
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));
    // Held. The overlay carries the sun in the meantime (driftMerc), so nothing on screen
    // is wrong — the lines simply hold position for the length of the gesture.
    expect(result.current.now).toBe(before);

    state.moving = false;
    await act(() => result.current.flush());
    expect(result.current.now).toBe(before + LIVE_TICK_MS);
  });

  // THE FAILURE THIS FORBIDS: a caller whose "moving" flag sticks true — an interrupted
  // gesture, a screen torn down mid-fling — would otherwise freeze the displayed time for
  // the rest of the session, on a map whose whole job is to say what time it is now. At most
  // one tick in a row may be held, so the clock always heals itself.
  it('never holds two ticks in a row, even if the caller stays "moving" forever', async () => {
    const { result, state } = await movingClock();
    const before = result.current.now;
    state.moving = true;

    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));
    expect(result.current.now).toBe(before);

    // Still moving — and the tick goes through anyway.
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));
    expect(result.current.now).toBe(before + 2 * LIVE_TICK_MS);
  });

  // The map calls flush on EVERY settled camera event, which is every pan, fling and pinch.
  // If flush synced unconditionally it would rebuild the field each time the map came to
  // rest — a cost the deferral was supposed to remove, paid on every gesture instead.
  it('flushes nothing when no tick was held back', async () => {
    const { result } = await movingClock();
    const before = result.current.now;

    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));
    const ticked = result.current.now;
    expect(ticked).toBe(before + LIVE_TICK_MS);

    await act(() => jest.advanceTimersByTime(5_000));
    await act(() => result.current.flush());
    expect(result.current.now).toBe(ticked);
  });

  it('ticks normally for callers that ask for no deferral at all', async () => {
    const { result } = await renderHook(() => useSolarClock(true));
    const before = result.current.now;
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));
    expect(result.current.now).toBe(before + LIVE_TICK_MS);
  });
});

// ── A zone change must move BOTH anchors, in every mode ──────────────────────────────────
//
// The clock carries two midnights: `todayStart` (the real today) and `dayStart` (the day
// being viewed). The tick re-anchors `todayStart` in every mode but `dayStart` only while
// live — correct while there is one zone, and quietly wrong the moment there are two. A
// reader scrubbed to another day who lands in a new timezone would come back to today's
// midnight measured in one zone and the viewed day's in another, and every value derived
// from the gap between them is then nonsense at once.
//
// Full fake timers so the tick can be made to fire on demand.
describe('useSolarClock across a display-zone change', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    freeze('2026-07-15T12:00:00Z');
  });

  afterEach(() => setDisplayZone(DEFAULT_ZONE));

  it('keeps the viewed day when the zone moves under a scrubbed view', async () => {
    const { result } = await renderHook(() => useSolarClock());
    await act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(1);

    setDisplayZone('Asia/Riyadh');
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));

    // Still tomorrow — the reader chose an OFFSET; only the instants expressing it move.
    expect(result.current.dayOffset).toBe(1);
    // And both anchors are now midnights in the new zone, which is what makes every
    // derived value (dayLength, fraction, the DayPicker's cell equality) sound again.
    expect(startOfZoneDay(result.current.dayStart)).toBe(result.current.dayStart);
    expect(startOfZoneDay(result.current.todayStart)).toBe(result.current.todayStart);
    expect(result.current.dayLength).toBe(24 * HOUR);
  });

  it('survives a shift big enough to round dayOffset to the wrong day', async () => {
    // The failure that makes this more than cosmetic. Stockholm→Midway is a 13 h swing, so
    // a stale pair sits 13 h apart — and Math.round(11/24) is 0, i.e. the dock would label
    // TOMORROW "i dag" while showing tomorrow's times.
    const { result } = await renderHook(() => useSolarClock());
    await act(() => result.current.stepDay(1));

    setDisplayZone('Pacific/Midway');
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));

    expect(result.current.dayOffset).toBe(1);
  });

  it('re-anchors a live view too, without stranding `now` outside the day', async () => {
    const { result } = await renderHook(() => useSolarClock());
    expect(result.current.mode).toBe('live');

    setDisplayZone('Asia/Riyadh');
    await act(() => jest.advanceTimersByTime(LIVE_TICK_MS));

    expect(result.current.dayOffset).toBe(0);
    expect(result.current.now).toBeGreaterThanOrEqual(result.current.dayStart);
    expect(result.current.now).toBeLessThanOrEqual(result.current.dayStart + result.current.dayLength);
  });
});
