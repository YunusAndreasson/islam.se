import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import { syncPrayerLiveActivity } from './live-activity';
import { usePrayerActivitySync } from './usePrayerActivitySync';

jest.mock('./live-activity', () => ({
  LIVE_ACTIVITY_WINDOW_MS: 3_600_000,
  syncPrayerLiveActivity: jest.fn(async () => {}),
}));
jest.mock('./android-ongoing', () => ({ syncAndroidPrayerNotification: jest.fn(async () => {}) }));
jest.mock('@/lib/device-zone', () => ({ useDisplayZone: () => 'Europe/Stockholm' }));
const coords = { latitude: 59.3293, longitude: 18.0686 };
const times = oracleTimes(coords, new Date(2026, 2, 20));
const at = times.asr.getTime();
const sync = jest.mocked(syncPrayerLiveActivity);
let stateListener: ((state: AppStateStatus) => void) | undefined;
const originalPlatform = Platform.OS;

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.useFakeTimers({ now: at - 30 * 60_000 });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    stateListener = listener;
    return { remove: jest.fn() };
  });
  sync.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});
const mount = () => renderHook(() => usePrayerActivitySync(coords, DEFAULT_SETTINGS, 'Stockholm', true));

describe('foreground Live Activity boundaries', () => {
  it('skips cosmetic changes but reconciles changed prayer calculations', async () => {
    const hook = await renderHook(
      ({ settings }: { settings: PrayerSettings }) => usePrayerActivitySync(coords, settings, 'Stockholm', true),
      { initialProps: { settings: DEFAULT_SETTINGS } },
    );
    expect(sync).toHaveBeenCalledTimes(1);
    const cosmetic = { ...DEFAULT_SETTINGS, theme: 'dark' as const, hijriOffset: 1 };
    await hook.rerender({ settings: cosmetic });
    expect(sync).toHaveBeenCalledTimes(1);
    const changed = { ...cosmetic, madhab: 'hanafi' as const };
    await hook.rerender({ settings: changed });
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenLastCalledWith(coords, changed, 'Stockholm', expect.any(Number), { canStart: true });
    await hook.unmount();
  });
  it('reconciles after the prayer without requiring another foreground event', async () => {
    const hook = await mount();
    expect(sync).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(30 * 60_000 + 1000); });
    expect(sync).toHaveBeenLastCalledWith(coords, DEFAULT_SETTINGS, 'Stockholm', at + 1000, { canStart: true });
    await hook.unmount();
  });
  it('enters the one-hour window while the app remains open', async () => {
    jest.setSystemTime(at - 90 * 60_000);
    const hook = await mount();
    await act(async () => { jest.advanceTimersByTime(30 * 60_000); });
    expect(sync).toHaveBeenLastCalledWith(coords, DEFAULT_SETTINGS, 'Stockholm', at - 60 * 60_000, { canStart: true });
    await hook.unmount();
  });
  it('stops the foreground timer while suspended and refreshes on return', async () => {
    const hook = await mount();
    await act(async () => { stateListener?.('background'); });
    expect(sync).toHaveBeenLastCalledWith(coords, DEFAULT_SETTINGS, 'Stockholm', expect.any(Number), { canStart: false });
    const count = sync.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(35 * 60_000); });
    expect(sync).toHaveBeenCalledTimes(count);
    await act(async () => { stateListener?.('active'); });
    expect(sync).toHaveBeenLastCalledWith(coords, DEFAULT_SETTINGS, 'Stockholm', expect.any(Number), { canStart: true });
    await hook.unmount();
  });
});
