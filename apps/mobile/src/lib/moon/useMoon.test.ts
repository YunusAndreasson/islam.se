import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useSolarClock } from '@/lib/solar/useSolarClock';
import { useCoarseNow } from './useMoon';

const MINUTE = 60_000;
let listeners: Set<(state: AppStateStatus) => void>;
let originalState: typeof AppState.currentState;

/** setInterval timers the code under test has started and not yet cleared. Counted directly
 *  rather than through jest.getTimerCount(): since React 19.3 / RNTL 14 the renderer keeps
 *  timers of its own under fake timers (three after a bare render), so the global count no
 *  longer says anything about the clock hooks, which tick with setInterval. */
let liveIntervals: Set<unknown>;

beforeEach(() => {
  jest.useFakeTimers();
  liveIntervals = new Set();
  const startInterval = globalThis.setInterval;
  const stopInterval = globalThis.clearInterval;
  jest.spyOn(globalThis, 'setInterval').mockImplementation((...args: Parameters<typeof setInterval>) => {
    const id = startInterval(...args);
    liveIntervals.add(id);
    return id;
  });
  jest.spyOn(globalThis, 'clearInterval').mockImplementation((id?: Parameters<typeof clearInterval>[0]) => {
    liveIntervals.delete(id);
    stopInterval(id);
  });
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
async function changeState(state: AppStateStatus) {
  await act(() => {
    AppState.currentState = state;
    for (const listener of listeners) listener(state);
  });
}

describe('visible clocks', () => {
  it('removes 10 lunar updates per 10 hidden minutes, resynchronizing on focus', async () => {
    const { result, rerender } = await renderHook<number, { active: boolean }>(
      ({ active }) => useCoarseNow(MINUTE, active),
      { initialProps: { active: true } },
    );
    let updates = 0;
    let previous = result.current;
    const tenMinutes = async () => {
      for (let i = 0; i < 10; i++) {
        await act(() => jest.advanceTimersByTime(MINUTE));
        if (result.current !== previous) updates++;
        previous = result.current;
      }
    };
    await tenMinutes();
    expect(updates).toBe(10);
    await rerender({ active: false });
    updates = 0;
    await tenMinutes();
    expect(updates).toBe(0);
    await rerender({ active: true });
    expect(result.current).toBe(Date.now());
  });

  it('stops in background, avoids duplicate foreground timers, and cleans up on unmount', async () => {
    const { result, unmount } = await renderHook(() => useCoarseNow(MINUTE));
    const before = result.current;
    await changeState('background');
    await act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current).toBe(before);
    expect(liveIntervals.size).toBe(0);
    await changeState('active');
    expect(result.current).toBe(Date.now());
    await changeState('active');
    expect(liveIntervals.size).toBe(1);
    await unmount();
    expect(liveIntervals.size).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it('starts no lunar timer when mounted in background', async () => {
    AppState.currentState = 'background';
    const { result } = await renderHook(() => useCoarseNow(MINUTE));
    const before = result.current;
    await act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current).toBe(before);
    expect(liveIntervals.size).toBe(0);
    await changeState('active');
    expect(result.current).toBe(Date.now());
  });

  it('removes 20 solar ticks per 10 inactive minutes and preserves a parked scrub', async () => {
    const { result, rerender } = await renderHook<ReturnType<typeof useSolarClock>, { active: boolean }>(
      ({ active }) => useSolarClock(active),
      { initialProps: { active: true } },
    );
    let updates = 0;
    let previous = result.current.now;
    for (let i = 0; i < 20; i++) {
      await act(() => jest.advanceTimersByTime(MINUTE / 2));
      if (result.current.now !== previous) updates++;
      previous = result.current.now;
    }
    expect(updates).toBe(20);
    await rerender({ active: false });
    await act(() => jest.advanceTimersByTime(10 * MINUTE));
    expect(result.current.now).toBe(previous);
    expect(liveIntervals.size).toBe(0);
    await rerender({ active: true });
    expect(result.current.now).toBe(Date.now());
    await act(() => result.current.setFraction(0.25));
    const parked = result.current.now;
    await rerender({ active: false });
    await act(() => jest.advanceTimersByTime(10 * MINUTE));
    await rerender({ active: true });
    expect(result.current.now).toBe(parked);
    expect(result.current.mode).toBe('scrub');
  });
});
