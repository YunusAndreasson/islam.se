// The map clock spans the SWEDISH day, not the device's, and the day's REAL length
// (23/24/25 h across DST). These guard the two bugs that motivated the Stockholm-local
// model: a device-timezone day boundary (wrong day's prayer field abroad) and a fixed
// 86_400_000 day length (scrubber marks drift an hour on the two DST-transition days).
//
// We freeze only the Date (timers stay real) so the hook's initial `Date.now()` and its
// startOfStockholmDay() are deterministic regardless of the machine's own timezone — that
// device-independence is exactly the property under test.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useSolarClock } from './useSolarClock';

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
  it('anchors dayStart to Stockholm-local midnight, not device-local', () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = renderHook(() => useSolarClock());
    // Whatever the host timezone, dayStart must read 00:00:00 in Stockholm.
    expect(stockholmClock(result.current.dayStart)).toBe('00:00:00');
  });

  it('reports the real day length across DST: 24 h normally, 23 h spring-forward, 25 h fall-back', () => {
    // Sweden's 2026 transitions: forward 2026-03-29 (23 h), back 2026-10-25 (25 h).
    freeze('2026-07-01T15:00:00Z');
    expect(renderHook(() => useSolarClock()).result.current.dayLength).toBe(24 * HOUR);

    freeze('2026-03-29T15:00:00Z');
    expect(renderHook(() => useSolarClock()).result.current.dayLength).toBe(23 * HOUR);

    freeze('2026-10-25T15:00:00Z');
    expect(renderHook(() => useSolarClock()).result.current.dayLength).toBe(25 * HOUR);
  });

  it('places `now` at its fraction of the real day (17:00 local on a 24 h summer day)', () => {
    freeze('2026-07-01T15:00:00Z'); // 17:00 in Stockholm (CEST = UTC+2)
    const { result } = renderHook(() => useSolarClock());
    expect(result.current.fraction).toBeCloseTo(17 / 24, 4);
  });

  it('scrubbing to a fraction maps back through the real day length (no DST clamp)', () => {
    // The 25 h fall-back day is the one a fixed 24 h model broke: f = 1 must reach the
    // next local midnight (dayStart + 25 h), and the last local hour must be reachable.
    freeze('2026-10-25T15:00:00Z');
    const { result } = renderHook(() => useSolarClock());
    const { dayStart, dayLength } = result.current;

    act(() => result.current.setFraction(1));
    expect(result.current.now).toBe(dayStart + dayLength); // exactly next local midnight
    expect(result.current.mode).toBe('scrub');
    expect(stockholmClock(result.current.now)).toBe('00:00:00');

    act(() => result.current.setFraction(0.5));
    expect(result.current.fraction).toBeCloseTo(0.5, 6);
  });
});

describe('useSolarClock setInstant', () => {
  it('lands `now` on the EXACT instant (no fraction round-trip) and enters scrub mode', () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = renderHook(() => useSolarClock());
    // An odd-millisecond target mid-day: setFraction would round-trip-drift off it, which is
    // what made a tapped prayer land a sub-ms past its time and the NEXT prayer highlight.
    const target = result.current.dayStart + 13 * HOUR + 47 * 60_000 + 123;
    act(() => result.current.setInstant(target));
    expect(result.current.now).toBe(target);
    expect(result.current.mode).toBe('scrub');
  });

  it('clamps an instant outside the viewed day to the day bounds', () => {
    freeze('2026-07-01T15:00:00Z');
    const { result } = renderHook(() => useSolarClock());
    const { dayStart, dayLength } = result.current;
    act(() => result.current.setInstant(dayStart - 5 * HOUR));
    expect(result.current.now).toBe(dayStart);
    act(() => result.current.setInstant(dayStart + dayLength + 5 * HOUR));
    expect(result.current.now).toBe(dayStart + dayLength);
  });
});

// Day navigation. The clock gained a viewed DAY that moves independently of `mode`, and
// the two must stay orthogonal: `mode` answers "is `now` the real now?", the day answers
// "which day?". A user has to be able to scrub within a day that is not today, which is
// why there is no third 'day' mode — see the ClockMode comment.
describe('useSolarClock day navigation', () => {
  const AUGUST = '2026-08-01T12:00:00Z';

  it('starts on today with a zero offset', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    expect(result.current.dayOffset).toBe(0);
    expect(result.current.dayStart).toBe(result.current.todayStart);
  });

  it('steps forward and back, and reports the offset', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(1);
    expect(result.current.dayStart).toBe(today + 24 * HOUR);

    act(() => result.current.stepDay(-2));
    expect(result.current.dayOffset).toBe(-1);
    expect(result.current.dayStart).toBe(today - 24 * HOUR);
  });

  // The scrubber thumb must not jump under the user's finger when the day changes, so a
  // step preserves the FRACTION through the day rather than the wall-clock time.
  it('keeps the time of day when stepping', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    act(() => result.current.setFraction(0.25));
    const fractionBefore = result.current.fraction;
    const wallClockBefore = stockholmClock(result.current.now);

    act(() => result.current.stepDay(3));
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
  it('spans the real length of the day it lands on (both DST directions)', () => {
    freeze('2026-03-28T12:00:00Z'); // the day before the 23 h day
    const spring = renderHook(() => useSolarClock());
    act(() => spring.result.current.stepDay(1));
    expect(spring.result.current.dayLength).toBe(23 * HOUR);
    expect(spring.result.current.dayStart - spring.result.current.todayStart).toBe(24 * HOUR);

    freeze('2026-10-24T12:00:00Z'); // the day before the 25 h day
    const autumn = renderHook(() => useSolarClock());
    act(() => autumn.result.current.stepDay(1));
    expect(autumn.result.current.dayLength).toBe(25 * HOUR);
    // The offset is still exactly 1 even though the midnights are 24 h apart in real time
    // here and 25 h apart on the next step — dayOffset rounds, and ±1 h cannot reach a day.
    expect(autumn.result.current.dayOffset).toBe(1);
    act(() => autumn.result.current.stepDay(1));
    expect(autumn.result.current.dayOffset).toBe(2);
  });

  // Anchoring each step on todayStart + offset rather than accumulating from dayStart is
  // what makes this exact. Accumulating would drift by an hour per transition crossed, so
  // a user who paged forward and back across a DST boundary would not land on today.
  it('round-trips to exactly today after paging to the rail and back', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    for (let i = 0; i < 365; i++) act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(365);
    for (let i = 0; i < 365; i++) act(() => result.current.stepDay(-1));

    expect(result.current.dayOffset).toBe(0);
    expect(result.current.dayStart).toBe(today);
  });

  it('clamps at the rails instead of wandering off', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    act(() => result.current.stepDay(9999));
    expect(result.current.dayOffset).toBe(365);
    act(() => result.current.stepDay(1));
    expect(result.current.dayOffset).toBe(365);

    act(() => result.current.stepDay(-99_999));
    expect(result.current.dayOffset).toBe(-365);
  });

  it('jumps to an arbitrary day, from anywhere in that day', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    const today = result.current.todayStart;

    // Any instant inside the target day selects that day — the date picker hands over
    // whatever the tapped cell means, not a midnight.
    act(() => result.current.goToDay(today + 10 * 24 * HOUR + 17 * HOUR));
    expect(result.current.dayOffset).toBe(10);

    act(() => result.current.goToDay(today));
    expect(result.current.dayOffset).toBe(0);
  });

  // THE INVARIANT the whole "no third mode" decision rests on: live always means today.
  // Everything downstream — the arrival bloom, the countdown, the intro gate — reads
  // `mode === 'live'` and would be wrong on another day if this could be violated.
  it('never stays live on another day, and never re-enters live by stepping back', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    expect(result.current.mode).toBe('live');

    act(() => result.current.stepDay(1));
    expect(result.current.mode).toBe('scrub');

    // Stepping back ONTO today does not resume live: the user is at 12:00 today, not now.
    act(() => result.current.stepDay(-1));
    expect(result.current.dayOffset).toBe(0);
    expect(result.current.mode).toBe('scrub');

    // Only the explicit return does.
    act(() => result.current.reset());
    expect(result.current.mode).toBe('live');
    expect(result.current.dayOffset).toBe(0);
  });

  // Scrubbing while on another day must move within THAT day. If a refactor re-pinned the
  // clamps to today, dragging the slider on a future day would silently snap back.
  it('scrubs within the VIEWED day, not today', () => {
    freeze(AUGUST);
    const { result } = renderHook(() => useSolarClock());
    act(() => result.current.stepDay(5));
    const viewed = result.current.dayStart;

    act(() => result.current.setFraction(0.75));
    expect(result.current.now).toBe(viewed + 0.75 * result.current.dayLength);

    // And setInstant clamps to the viewed day's bounds, not today's.
    act(() => result.current.setInstant(viewed - 10 * HOUR));
    expect(result.current.now).toBe(viewed);
    act(() => result.current.setInstant(viewed + 40 * HOUR));
    expect(result.current.now).toBe(viewed + result.current.dayLength);
  });

  // Real midnight passing while a day is parked. The viewed day must HOLD (the user chose
  // it) while todayStart advances, so what was "i morgon" becomes "i dag" on its own
  // rather than the dock going on mislabelling it for the rest of the session.
  // Driven through the active gate so the effect's immediate sync() fires deterministically,
  // without waiting out a real 30 s interval.
  it('re-labels a parked day when real midnight passes underneath it', () => {
    freeze('2026-08-01T21:00:00Z'); // 23:00 Stockholm, an hour before midnight
    const { result, rerender } = renderHook<ReturnType<typeof useSolarClock>, { active: boolean }>(
      ({ active }) => useSolarClock(active),
      { initialProps: { active: true } },
    );
    act(() => result.current.stepDay(1));
    const parked = result.current.dayStart;
    expect(result.current.dayOffset).toBe(1);

    // Pause the clock, let real time cross midnight, then resume — the resume path runs
    // sync() immediately.
    rerender({ active: false });
    freeze('2026-08-01T23:00:00Z'); // 01:00 Stockholm, the next day
    act(() => rerender({ active: true }));

    // The viewed day did not move; its NAME did.
    expect(result.current.dayStart).toBe(parked);
    expect(result.current.dayOffset).toBe(0);
  });
});
