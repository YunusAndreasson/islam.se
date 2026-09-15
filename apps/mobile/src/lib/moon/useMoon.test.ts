import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useSolarClock } from '@/lib/solar/useSolarClock';
import { useCoarseNow } from './useMoon';

const MINUTE = 60_000;
let listeners: Set<(state: AppStateStatus) => void>;
let originalState: AppStateStatus;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  originalState = AppState.currentState;
  AppState.currentState = 'active';
  listeners = new Set();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    listeners.add(listener);
    return { remove: () => { listeners.delete(listener); } };
  });
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.restoreAllMocks();
  jest.useRealTimers();
});
function changeState(state: AppStateStatus) {
  act(() => {
    AppState.currentState = state;
    for (const listener of listeners) listener(state);
  });
}

describe('visible clocks', () => {
  it('removes 10 lunar updates per 10 hidden minutes, resynchronizing on focus', () => {
    const { result, rerender } = renderHook<number, { active: boolean }>(
      ({ active }) => useCoarseNow(MINUTE, active),
      { initialProps: { active: true } },
    );
    let updates = 0;
    let previous = result.current;
    const tenMinutes = () => {
      for (let i = 0; i < 10; i++) {
        act(() => jest.advanceTimersByTime(MINUTE));
        if (result.current !== previous) updates++;
        previous = result.current;
      }
    };
    tenMinutes();
    expect(updates).toBe(10);
    rerender({ active: false });
    updates = 0;
    tenMinutes();
    expect(updates).toBe(0);
    rerender({ active: true });
    expect(result.current).toBe(Date.now());
  });

  it('stops in background, avoids duplicate foreground timers, and cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useCoarseNow(MINUTE));
    const before = result.current;
    changeState('background');
    act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current).toBe(before);
    expect(jest.getTimerCount()).toBe(0);
    changeState('active');
    expect(result.current).toBe(Date.now());
    changeState('active');
    expect(jest.getTimerCount()).toBe(1);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('starts no lunar timer when mounted in background', () => {
    AppState.currentState = 'background';
    const { result } = renderHook(() => useCoarseNow(MINUTE));
    const before = result.current;
    act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current).toBe(before);
    expect(jest.getTimerCount()).toBe(0);
    changeState('active');
    expect(result.current).toBe(Date.now());
  });

  it('removes 20 solar ticks per 10 inactive minutes and preserves a parked scrub', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useSolarClock>, { active: boolean }>(
      ({ active }) => useSolarClock(active),
      { initialProps: { active: true } },
    );
    let updates = 0;
    let previous = result.current.now;
    for (let i = 0; i < 20; i++) {
      act(() => jest.advanceTimersByTime(MINUTE / 2));
      if (result.current.now !== previous) updates++;
      previous = result.current.now;
    }
    expect(updates).toBe(20);
    rerender({ active: false });
    act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current.now).toBe(previous);
    expect(jest.getTimerCount()).toBe(0);
    rerender({ active: true });
    expect(result.current.now).toBe(Date.now());
    act(() => result.current.setFraction(0.25));
    const parked = result.current.now;
    rerender({ active: false });
    act(() => jest.advanceTimersByTime(10 * MINUTE));
    rerender({ active: true });
    expect(result.current.now).toBe(parked);
    expect(result.current.mode).toBe('scrub');
  });
});
