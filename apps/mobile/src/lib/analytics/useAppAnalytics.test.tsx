// App Opened, First Open and the super properties, driven the way the OS drives them:
// through AppState. The thing worth pinning is what does NOT count — an iOS background
// launch mounts this whole tree for the notification refresh, and an open counted at mount
// is how "active users" came out inflated in the app that did it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { afterAppOpen, analytics } from '@/lib/analytics';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';

import { FIRST_OPEN_KEY, resetAppAnalyticsForTests, useAppAnalytics } from './useAppAnalytics';

const SETTINGS_KEY = 'prayerSettings:v1';
const GPS_CACHE_KEY = 'lastGpsCoords:v1';

function Probe() {
  useAppAnalytics();
  return null;
}

// The preset's AppState mock: currentState is settable, and addEventListener records the
// listeners without ever removing them, so `emit` calls every one registered so far.
const appState = AppState as unknown as { currentState: unknown };
const originalState = appState.currentState;

let now = 1_000_000;
let log: string[] = [];
let tracked: [string, unknown][] = [];
let registered: Record<string, unknown>[] = [];
let registeredOnce: Record<string, unknown>[] = [];

async function emit(state: 'active' | 'background' | 'inactive'): Promise<void> {
  appState.currentState = state;
  const listeners = jest
    .mocked(AppState)
    .addEventListener.mock.calls.filter(([type]) => type === 'change')
    .map(([, listener]) => listener);
  await act(async () => {
    for (const listener of listeners) listener(state);
  });
  await act(async () => {});
}

async function launch(state: 'active' | 'background') {
  appState.currentState = state;
  const view = await render(
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>
          <Probe />
        </LocationProvider>
      </IntroProvider>
    </SettingsProvider>,
  );
  await act(async () => {});
  await act(async () => {});
  return view;
}

const permission = (status: 'granted' | 'denied' | 'undetermined') => ({
  status,
  granted: status === 'granted',
  canAskAgain: status !== 'denied',
  expires: 'never',
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  resetAppAnalyticsForTests();
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  log = [];
  tracked = [];
  registered = [];
  registeredOnce = [];
  jest.spyOn(analytics, 'track').mockImplementation(async (event, properties) => {
    log.push(event);
    tracked.push([event, properties]);
  });
  jest.spyOn(analytics, 'register').mockImplementation((properties) => {
    registered.push(properties);
  });
  jest.spyOn(analytics, 'registerOnce').mockImplementation((properties) => {
    registeredOnce.push(properties);
  });
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('undetermined') as never);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('undetermined') as never);
});

afterEach(() => {
  appState.currentState = originalState;
  jest.restoreAllMocks();
});

const events = (): string[] => tracked.map(([event]) => event);

describe('App Opened', () => {
  it('sends nothing during a background launch, and the cold open when the reader opens the app', async () => {
    await launch('background');
    // A screen the background launch redirected to, waiting for the open.
    afterAppOpen(() => log.push('Screen Viewed'));
    expect(events()).toEqual([]);
    expect(log).toEqual([]);

    now += 6 * 3_600_000;
    await emit('active');

    // A fresh install (nothing stored: the introduction is pending) is 'new'. First Open
    // comes first, then the open, and only then what waited for it.
    expect(tracked).toEqual([
      ['First Open', { install_kind: 'new' }],
      ['App Opened', { launch: 'cold' }],
    ]);
    expect(log).toEqual(['First Open', 'App Opened', 'Screen Viewed']);
  });

  it('opens at mount when the app is already in the foreground, and warm only after 30 s away', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ calculationMethod: 'Turkey' }));
    await launch('active');
    expect(tracked).toEqual([
      // Settings on disk and no intro record: an install that predates the introduction.
      ['First Open', { install_kind: 'existing' }],
      ['App Opened', { launch: 'cold' }],
    ]);

    await emit('background');
    now += 10_000;
    await emit('active');
    expect(events()).toEqual(['First Open', 'App Opened']);

    await emit('background');
    now += 31_000;
    await emit('active');
    expect(tracked.at(-1)).toEqual(['App Opened', { launch: 'warm' }]);
    expect(events()).toHaveLength(3);
  });
});

describe('First Open', () => {
  it('is sent once per install, and its kind is registered again on every later launch', async () => {
    const first = await launch('active');
    expect(events()).toEqual(['First Open', 'App Opened']);
    expect(JSON.parse((await AsyncStorage.getItem(FIRST_OPEN_KEY)) as string)).toEqual({ install_kind: 'new' });
    await first.unmount();

    // The next cold start. The introduction has been finished meanwhile, so an install_kind
    // re-derived from the gate would now say 'existing'; it must stay what First Open said.
    await AsyncStorage.setItem('introSeen:v1', JSON.stringify({ completed: true, outcome: 'completed' }));
    resetAppAnalyticsForTests();
    tracked = [];
    registeredOnce = [];
    await launch('active');
    expect(events()).toEqual(['App Opened']);
    expect(registeredOnce).toEqual([{ install_date: '2026-05-28', install_kind: 'new' }]);
  });
});

describe('super properties', () => {
  it('count reminders as enabled only when the OS lets them through', async () => {
    // The switch turns on whatever the OS answers, so the setting alone would put a reader
    // who refused the dialog in the "can be reached" half of every retention split.
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('denied') as never);
    await launch('active');
    expect(registered.at(-1)).toMatchObject({ notifications_enabled: false, reminders_per_day: 5 });
  });

  it('read a GPS user with a fix on disk as gps, not as the Stockholm fallback, at the cold open', async () => {
    // The provider reports 'default' until its own read of the cached fix lands. Taken at
    // face value, every cold open of a GPS user would have counted as "stuck on Stockholm".
    await AsyncStorage.setItem(GPS_CACHE_KEY, JSON.stringify({ latitude: 57.7089, longitude: 11.9746 }));
    await launch('active');
    expect(registered[0]).toMatchObject({ location_source: 'gps' });
  });

  it('say default when nothing has set the location, and name the intro only once it is known', async () => {
    await launch('active');
    expect(registered.at(-1)).toEqual({
      notifications_enabled: false,
      reminders_per_day: 0,
      adhan_sound: false,
      location_source: 'default',
    });
  });

  it('are re-read on a short return too: the reader may have just allowed notifications in system settings', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('denied') as never);
    await launch('active');
    expect(registered.at(-1)).toMatchObject({ notifications_enabled: false });

    await emit('background');
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted') as never);
    now += 5_000;
    await emit('active');
    expect(registered.at(-1)).toMatchObject({ notifications_enabled: true });
    // A five-second trip is not a new visit.
    expect(tracked.filter(([event]) => event === 'App Opened')).toHaveLength(1);
  });
});
