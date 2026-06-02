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
