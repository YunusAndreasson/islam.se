import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { getDisplayZone, setDisplayZone } from '@/lib/zone-time';
import * as timeline from './timeline';
import { createPrayerWidgetSync, WIDGET_REFRESH_INTERVAL_MS } from './sync';

const coords = { latitude: 59.3293, longitude: 18.0686 };
const now = Date.parse('2026-10-18T10:00:00Z');
const originalPlatform = Platform.OS;
const originalZone = getDisplayZone();

function platform(value: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value });
}

function setup() {
  const ios = { updateTimeline: jest.fn<(entries: timeline.WidgetTimelineEntry[]) => void>() };
  const android = {
    updateSnapshot: jest.fn<(snapshot: import('./android-snapshot').AndroidWidgetSnapshot) => void>(),
    reload: jest.fn<() => void>(),
  };
  const loaders = {
    ios: jest.fn(async () => ios),
    android: jest.fn(async () => android),
  };
  return { ios, android, loaders, sync: createPrayerWidgetSync(loaders) };
}

beforeEach(() => {
  platform('ios');
  setDisplayZone('Europe/Stockholm');
});
afterEach(() => {
  jest.restoreAllMocks();
  platform(originalPlatform);
  setDisplayZone(originalZone);
});

describe('prayer widget refresh coalescing', () => {
  // Permission dialogs and overlapping foreground/background callers used to each
  // rebuild and push the same five-day schedule, consuming native reload budget.
  it('builds and pushes once for rapid concurrent and sequential refreshes', async () => {
    const build = jest.spyOn(timeline, 'buildTimeline');
    const { sync, ios, loaders } = setup();
    await Promise.all(Array.from({ length: 8 }, (_, i) =>
      sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + i * 1000)));
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + 60_000);
    expect(build).toHaveBeenCalledTimes(1);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(1);
    expect(loaders.ios).toHaveBeenCalledTimes(1);
    expect(loaders.android).not.toHaveBeenCalled();
  });

  it('replenishes the horizon after the interval without extending it on skipped calls', async () => {
    const { sync, ios } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + WIDGET_REFRESH_INTERVAL_MS - 1);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(1);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + WIDGET_REFRESH_INTERVAL_MS);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(2);
    expect(ios.updateTimeline.mock.calls[1]?.[0][0]?.date.getTime()).toBe(now + WIDGET_REFRESH_INTERVAL_MS);
  });

  it('immediately applies changed calculations, appearance, Hijri offset, coordinates and label', async () => {
    const { sync, ios } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, { ...DEFAULT_SETTINGS, madhab: 'hanafi' }, 'Stockholm', now);
    await sync(coords, { ...DEFAULT_SETTINGS, theme: 'dark' }, 'Stockholm', now);
    await sync(coords, { ...DEFAULT_SETTINGS, hijriOffset: 1 }, 'Stockholm', now);
    await sync({ ...coords, latitude: coords.latitude + 0.01 }, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Solna', now);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(6);
    expect(ios.updateTimeline.mock.lastCall?.[0][0]?.props.location).toBe('Solna');
  });

  it('does not refresh for settings the widget does not render', async () => {
    const { sync, ios } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, { ...DEFAULT_SETTINGS, haptics: !DEFAULT_SETTINGS.haptics }, 'Stockholm', now);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(1);
  });

  it('immediately rebuilds after a timezone change or a clock moving backwards', async () => {
    const { sync, ios } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    setDisplayZone('Asia/Riyadh');
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + 1000);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now - 1000);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(3);
  });

  it('starts fresh in a new app session', async () => {
    const first = setup();
    await first.sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    const second = setup();
    await second.sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + 1000);
    expect(second.ios.updateTimeline).toHaveBeenCalledTimes(1);
  });

  it('uses the zone in force after a delayed native import', async () => {
    const { loaders, ios } = setup();
    let release!: () => void;
    loaders.ios.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return ios;
    });
    const sync = createPrayerWidgetSync(loaders);
    const pending = sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await Promise.resolve();
    setDisplayZone('Asia/Riyadh');
    release();
    await pending;
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + 1000);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(1);
    expect(ios.updateTimeline.mock.lastCall?.[0]).toEqual(
      timeline.buildTimeline(coords, DEFAULT_SETTINGS, 'Stockholm', now),
    );
  });

  it('serializes changed inputs behind a pending import so the latest data wins', async () => {
    const { loaders, ios } = setup();
    let release!: () => void;
    loaders.ios.mockImplementationOnce(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return ios;
    });
    const sync = createPrayerWidgetSync(loaders);
    const first = sync(coords, DEFAULT_SETTINGS, 'First', now);
    await Promise.resolve();
    const second = sync(coords, DEFAULT_SETTINGS, 'Latest', now + 1000);
    expect(ios.updateTimeline).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(ios.updateTimeline.mock.calls.map(([entries]) => entries[0]?.props.location)).toEqual(['First', 'Latest']);
  });

  it('retries failed imports and native writes without poisoning the cache or queue', async () => {
    const { sync, loaders, ios } = setup();
    loaders.ios.mockRejectedValueOnce(new Error('extension unavailable'));
    ios.updateTimeline.mockImplementationOnce(() => { throw new Error('write failed'); });
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    expect(loaders.ios).toHaveBeenCalledTimes(3);
    expect(ios.updateTimeline).toHaveBeenCalledTimes(2);
  });

  it('leaves unsupported platforms alone', async () => {
    platform('web');
    const { sync, loaders } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    expect(loaders.ios).not.toHaveBeenCalled();
    expect(loaders.android).not.toHaveBeenCalled();
  });

  it('reloads Android across a prayer boundary without rebuilding or rewriting its snapshot', async () => {
    platform('android');
    const build = jest.spyOn(timeline, 'buildTimeline');
    const { sync, android, loaders } = setup();
    // Locate a real prayer boundary independently of the coordinator's reload decision.
    const nextAt = timeline.buildTimeline(coords, DEFAULT_SETTINGS, 'Stockholm', now)[0]!.props.nextAtMs!;
    build.mockClear();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', nextAt - 60_000);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', nextAt - 30_000);
    expect(android.reload).not.toHaveBeenCalled();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', nextAt + 1000);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', nextAt + 2000);
    expect(android.reload).toHaveBeenCalledTimes(1);
    expect(android.updateSnapshot).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(loaders.ios).not.toHaveBeenCalled();
  });

  it('reloads Android at midnight and retries a failed boundary reload', async () => {
    platform('android');
    const { sync, android } = setup();
    const midnight = Date.parse('2026-10-18T22:00:00Z');
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', midnight - 60_000);
    android.reload.mockImplementationOnce(() => { throw new Error('reload unavailable'); });
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', midnight + 1000);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', midnight + 2000);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', midnight + 3000);
    expect(android.reload).toHaveBeenCalledTimes(2);
    expect(android.updateSnapshot).toHaveBeenCalledTimes(1);
  });

  it('replenishes Android snapshots at the refresh interval too', async () => {
    platform('android');
    const { sync, android } = setup();
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now);
    await sync(coords, DEFAULT_SETTINGS, 'Stockholm', now + WIDGET_REFRESH_INTERVAL_MS);
    expect(android.updateSnapshot).toHaveBeenCalledTimes(2);
    expect(android.reload).not.toHaveBeenCalled();
  });
});
