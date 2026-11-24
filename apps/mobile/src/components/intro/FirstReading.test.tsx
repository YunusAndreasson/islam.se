import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider, useLocation } from '@/lib/location/context';
import { getPlaces, namedPlace } from '@/lib/places/nearest';
import { computePrayerTimes, selectNextPrayer } from '@/lib/prayer-times';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { syncPrayerNotifications } from '@/lib/notifications';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { reminderPlace, saveReminderDraft } from '@/lib/first-run';
import { loadIntro } from '@/lib/intro';
import { readCachedFix } from '@/lib/location/gps-cache';
import { storage } from '@/lib/storage';
import { type SolarClock } from '@/lib/solar/useSolarClock';
import { zonePrayerDate, startOfZoneDay } from '@/lib/zone-time';
import { FirstReading } from './FirstReading';

// The full map/provider render has the same CI worker budget as screens.test.tsx.
jest.setTimeout(20_000);

const now = Date.parse('2026-11-23T09:41:00+01:00');
const clock = { now, mode: 'live', dayOffset: 0, fraction: 0.4, dayStart: startOfZoneDay(now),
  todayStart: startOfZoneDay(now), dayLength: 86400_000 } as SolarClock;
function Home({ at = now, opened = true }: { at?: number; opened?: boolean }) {
  const { settings } = useSettings();
  const { coords } = useLocation();
  const [opening, setOpening] = useState(opened);
  const times = computePrayerTimes(coords, zonePrayerDate(at), settings);
  const tomorrow = computePrayerTimes(coords, zonePrayerDate(at, 1), settings);
  return <FirstReading opening={opening} active clock={{ ...clock, now: at, todayStart: startOfZoneDay(at), dayStart: startOfZoneDay(at) }} next={selectNextPrayer(times, tomorrow, at)} times={times}
    tomorrow={tomorrow.fajr} onLive={() => undefined} onRead={() => setOpening(false)} onDismiss={() => undefined} onHeight={() => undefined} />;
}

const permission = (status: 'granted' | 'denied' | 'undetermined') => ({
  status, granted: status === 'granted', canAskAgain: status === 'undetermined', expires: 'never',
  ios: { status: status === 'granted' ? 2 : status === 'denied' ? 1 : 0 },
}) as Notifications.NotificationPermissionsStatus;

beforeEach(async () => {
  jest.clearAllMocks();
  for (const key of ['prayerSettings:v1', 'firstReadingDraft:v1', 'remindersDeclined:v1', 'introSeen:v1', 'introStep:v1', 'lastGpsCoords:v1']) await storage.removeItem(key);
  jest.spyOn(Date, 'now').mockReturnValue(now);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('undetermined'));
});
afterEach(() => { jest.restoreAllMocks(); });

async function openPreview() {
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  await fireEvent.press(screen.getByText('Malmö'));
  expect(screen.getByText('11:59')).toBeTruthy();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Påminn mig vid varje bön'));
  expect(screen.getAllByRole('switch')).toHaveLength(5);
  expect(screen.getByText('Dags för Ẓuhr', { includeHiddenElements: true })).toBeTruthy();
}

it('updates the real notification sample, then returns to the reading when all five are off', async () => {
  await openPreview();
  for (const name of ['Ẓuhr', 'ʿAṣr', 'Maghrib', 'ʿIshāʾ']) {
    await fireEvent.press(screen.getByRole('switch', { name: new RegExp('^' + name) }));
  }
  expect(screen.getByText('Klockan 05:46', { includeHiddenElements: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: /^Fajr/ }));
  await fireEvent.press(screen.getByText('Till bönetiderna'));
  expect(screen.getByText('Påminn mig vid varje bön')).toBeTruthy();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

it('keeps Malmö after a refusal and opens the widget guide only when the reader taps', async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(permission('denied'));
  await openPreview();
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText(/Vill du hellre se tiderna/)).toBeTruthy();
  const preferences = JSON.parse((await storage.getItem('prayerSettings:v1'))!);
  expect(preferences.manualLocation).toMatchObject({ name: 'Malmö', county: 'Skåne', latitude: 55.60587, longitude: 13.00073 });
  expect(preferences.notifications.enabled).toBe(false);
  await fireEvent.press(screen.getByText('Lägg till widget'));
  expect(screen.getByText('Bönetider på hemskärmen')).toBeTruthy();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it('commits the edited mask on a full grant and withholds success if the OS has no pending requests', async () => {
  await openPreview();
  await fireEvent.press(screen.getByRole('switch', { name: /^Fajr/ }));
  jest.mocked(Notifications.requestPermissionsAsync).mockImplementationOnce(async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
    return permission('granted');
  });
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue([]);
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText('Ingen framtida påminnelse är bekräftad.')).toBeTruthy();
  expect(screen.queryByText(/^Klart/)).toBeNull();
  expect(JSON.parse((await storage.getItem('prayerSettings:v1'))!).notifications).toMatchObject({
    enabled: true, prayers: { fajr: false, dhuhr: true, asr: true, maghrib: true, isha: true }, lastThird: false, fajrWindowEnd: false,
  });
});

it('confirms the first dated OS request and leaves the widget as a quiet link', async () => {
  await openPreview();
  scheduleRequests();
  // An already-granted install must reconcile silently from Continue.
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText('Klart. Vi påminner dig i dag kl. 11:59.')).toBeTruthy();
  expect(screen.getByText('Ändra påminnelser ›')).toBeTruthy();
  expect(screen.getByText('Lägg till widget ›')).toBeTruthy();
  expect(screen.queryByText(/Vill du hellre/)).toBeNull();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

// A cached or unexpectedly distant fix used to silently become the place for the first alarm.
it('keeps the default until a reader confirms a fresh fix outside the Swedish catalogue', async () => {
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
    coords: { latitude: 52.52, longitude: 13.405, accuracy: 1000 }, timestamp: now,
  } as Location.LocationObject);
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  await fireEvent.press(screen.getByText('Sök ort'));
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Använd min plats'));
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText('Din plats ligger utanför Sverige. Använd den för bönetider?')).toBeTruthy();
  expect(await readCachedFix()).toBeNull();
  await fireEvent.press(screen.getByText('Använd den här platsen'));
  expect(await readCachedFix()).toEqual({ latitude: 52.52, longitude: 13.405 });
  expect(screen.getByText('Din plats')).toBeTruthy();
  expect(screen.getByText('Påminn mig vid varje bön')).toBeTruthy();
});

it('preserves the fresh opening before the calculation detour can write settings', async () => {
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  await fireEvent.press(screen.getByText('Ändra'));
  await storage.setItem('prayerSettings:v1', JSON.stringify({ calculationMethod: 'Turkey' }));
  expect(await loadIntro()).toMatchObject({ status: 'pending', step: 0 });
});
it('preserves the handoff if the granted manual selection cannot reach disk', async () => {
  await openPreview();
  for (const key of ['Ẓuhr', 'ʿAṣr', 'Maghrib', 'ʿIshāʾ']) await fireEvent.press(screen.getByRole('switch', { name: new RegExp('^' + key) }));
  const write = storage.setItem;
  const failedSave = jest.spyOn(storage, 'setItem').mockImplementation((key, value) =>
    key === 'prayerSettings:v1' && JSON.parse(value).notifications.enabled ? Promise.reject(new Error('disk busy')) : write(key, value));
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(JSON.parse(await storage.getItem('firstReadingDraft:v1') ?? 'null')).toMatchObject({ prayers: { fajr: true, dhuhr: false } });
  await screen.unmount();
  failedSave.mockRestore();
  // Completion was already saved, so recovery must also run without the intro mounted.
  await render(<SettingsProvider>{null}</SettingsProvider>);
  const restored = JSON.parse((await storage.getItem('prayerSettings:v1'))!);
  expect(restored.notifications).toMatchObject({ enabled: true, prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false } });
  expect(await storage.getItem('firstReadingDraft:v1')).toBeNull();
});

function scheduleRequests(omitFirstDhuhr = false) {
  const requests = new Map<string, Notifications.NotificationRequest>();
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { requests.delete(id); });
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...requests.values()].filter(r => !omitFirstDhuhr || r.content.data?.key !== 'dhuhr' || r.content.data.prayerDate !== '2026-11-23'));
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async request => {
    const { timezone, ...date } = request.trigger as Notifications.CalendarTriggerInput;
    const identifier = request.identifier!;
    requests.set(identifier, { identifier, content: request.content, trigger: {
      type: 'calendar', repeats: false, dateComponents: { ...date, timeZone: timezone },
    } } as Notifications.NotificationRequest);
    return identifier;
  });
}

// After a failed city change, the previous city's working queue must not hide recovery.
it('clears Stockholm alarms and offers retry when Malmö registrations all fail', async () => {
  await openPreview();
  const stockholm = namedPlace(getPlaces().find(p => p.name === 'Stockholm')!);
  const prefs = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } };
  const armed = new Map<string, Notifications.NotificationRequest>();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...armed.values()]);
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { armed.delete(id); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async request => {
    const identifier = request.identifier!;
    const { timezone, ...date } = request.trigger as Notifications.CalendarTriggerInput;
    armed.set(identifier, { identifier, content: request.content, trigger: {
      type: 'calendar', repeats: false, dateComponents: { ...date, timeZone: timezone },
    } } as Notifications.NotificationRequest);
    return identifier;
  });
  expect(await syncPrayerNotifications(stockholm, prefs)).toBe(true);
  expect(armed.size).toBe(60);
  jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValue(new Error('Registration refused'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText('Ingen framtida påminnelse är bekräftad.')).toBeTruthy();
  expect(screen.getByText('Försök igen')).toBeTruthy();
  expect(armed.size).toBe(0);
});

it('offers retry when only today’s imminent Dhuhr is missing from a rolling schedule', async () => {
  await openPreview();
  scheduleRequests(true);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText('Alla valda påminnelser kunde inte bekräftas.')).toBeTruthy();
  expect(screen.getByText('Försök igen')).toBeTruthy();
});
it('labels the next prayer date’s Fajr by its civil occurrence in Treriksröset', async () => {
  const at = Date.parse('2026-03-27T23:58:00+01:00');
  await storage.setItem('prayerSettings:v1', JSON.stringify({ ...DEFAULT_SETTINGS, locationMode: 'manual',
    manualLocation: { name: 'Treriksröset', latitude: 69.06, longitude: 20.55 }, highLatitudeRule: 'middleOfTheNight' }));
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home opened={false} at={at} /></LocationProvider></IntroProvider></SettingsProvider>);
  expect(screen.getByText(/I dag i Treriksröset/)).toBeTruthy();
});

// Process death after the grant must resume the chosen Fajr even when fresh GPS moves a metre.
it('restores the granted GPS selection with a fresh fix and no second prompt', async () => {
  const accepted = { latitude: 55.60587, longitude: 13.00073 };
  await storage.setItem('introStep:v1', 'notifications');
  await saveReminderDraft(reminderPlace(DEFAULT_SETTINGS, accepted, 'Malmö'), {
    fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false,
  });
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('granted') as never);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
    coords: { ...accepted, latitude: 55.60588, accuracy: 100 }, timestamp: now,
  } as Location.LocationObject);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home opened={false} /></LocationProvider></IntroProvider></SettingsProvider>);
  expect(JSON.parse((await storage.getItem('prayerSettings:v1'))!).notifications).toMatchObject({
    enabled: true, prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
  });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(await storage.getItem('firstReadingDraft:v1')).toBeNull();
});

it('keeps the opening visible and lets the reader retry an unsaved method detour', async () => {
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  jest.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('disk busy'));
  await fireEvent.press(screen.getByText('Ändra'));
  expect(screen.getByText('Det gick inte att spara. Försök igen.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Ändra'));
  expect(await loadIntro()).toMatchObject({ status: 'pending', step: 0 });
});

// Continue must keep the choices on screen when it cannot save the handoff before an OS prompt.
it('keeps the preview retryable when its draft write fails', async () => {
  await openPreview();
  jest.spyOn(storage, 'setItem').mockRejectedValueOnce(new Error('disk busy'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(screen.getByText('Det gick inte att spara ditt val. Försök igen.')).toBeTruthy();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce(permission('denied'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(await screen.findByText(/Vill du hellre se tiderna/)).toBeTruthy();
});

it('leaves the widget cache and reading at the default when the Berlin confirmation is closed', async () => {
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
    coords: { latitude: 52.52, longitude: 13.405, accuracy: 100 }, timestamp: now,
  } as Location.LocationObject);
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  await fireEvent.press(screen.getByText('Sök ort'));
  await fireEvent.press(screen.getByText('Använd min plats'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  expect(screen.getByText('Din plats ligger utanför Sverige. Använd den för bönetider?')).toBeTruthy();
  await fireEvent.press(screen.getByText('Stäng'));
  expect(screen.getByLabelText('Visa bönetiderna')).toBeTruthy();
  expect(screen.getByText(/förvald/)).toBeTruthy();
  expect(await readCachedFix()).toBeNull();
});

// Android reports denied/askable even when the process died before the first prompt.
it('restores the Android preview without spending the prompt or recording a refusal', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    const city = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
    const prefs = { ...DEFAULT_SETTINGS, locationMode: 'manual' as const, manualLocation: city };
    await storage.setItem('prayerSettings:v1', JSON.stringify(prefs));
    await storage.setItem('introStep:v1', 'location');
    await storage.removeItem('notificationPermissionAsked:v1');
    await saveReminderDraft(reminderPlace(prefs, city, 'Malmö'), {
      fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false,
    });
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ ...permission('denied'), canAskAgain: true });
    await render(<SettingsProvider><IntroProvider><LocationProvider><Home opened={false} /></LocationProvider></IntroProvider></SettingsProvider>);
    expect(screen.getByRole('switch', { name: /^Fajr/ }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('switch', { name: /^Ẓuhr/ }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('Fortsätt')).toBeTruthy();
    expect(await storage.getItem('remindersDeclined:v1')).toBeNull();
    expect(await loadIntro()).toMatchObject({ status: 'pending' });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

it('keeps an unconfirmed Berlin fix out of the cache after leaving the intro', async () => {
  const fix = { latitude: 52.52, longitude: 13.405, accuracy: 100 };
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: fix, timestamp: now } as Location.LocationObject);
  const mount = await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  await fireEvent.press(screen.getByText('Sök ort'));
  await fireEvent.press(screen.getByText('Använd min plats'));
  await fireEvent.press(screen.getByText('Fortsätt'));
  await fireEvent.press(screen.getByText('Stäng'));
  expect(await readCachedFix()).toBeNull();
  await fireEvent.press(screen.getByLabelText('Visa bönetiderna'));
  await fireEvent.press(screen.getByLabelText('Stäng tidtabellen'));
  expect((await loadIntro()).status).toBe('done');
  expect(await readCachedFix()).toBeNull();
  await mount.unmount();
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  expect(await readCachedFix()).toBeNull();
});
it('requires a durable marker from the default timetable before changing method', async () => {
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home /></LocationProvider></IntroProvider></SettingsProvider>);
  const save = storage.setItem;
  const failure = jest.spyOn(storage, 'setItem').mockImplementation((key, value) =>
    key === 'introStep:v1' ? Promise.reject(new Error('disk unavailable')) : save(key, value));
  await fireEvent.press(screen.getByLabelText('Visa bönetiderna'));
  failure.mockRestore();
  await fireEvent.press(screen.getByText('Ändra'));
  expect(router.push).toHaveBeenCalledWith('/berakning');
  await storage.setItem('prayerSettings:v1', JSON.stringify({ calculationMethod: 'Turkey' }));
  expect((await loadIntro()).status).toBe('pending');
});

// A full OS grant for Malmö must not silently accept Berlin on a resumed lookup.
it.each([
  ['Berlin', { latitude: 52.52, longitude: 13.405 }, 'Din plats ligger utanför Sverige. Använd den för bönetider?'],
  ['Göteborg', { latitude: 57.71, longitude: 11.97 }, 'Din plats har ändrats. Använd den för bönetider?'],
] as const)('requires confirmation of %s when resuming a Malmö GPS grant', async (_city, candidate, question) => {
  const accepted = { latitude: 55.60587, longitude: 13.00073 };
  await storage.setItem('lastGpsCoords:v1', JSON.stringify(accepted));
  await storage.setItem('introStep:v1', 'notifications');
  await saveReminderDraft(reminderPlace(DEFAULT_SETTINGS, accepted, 'Malmö'), {
    fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false,
  });
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('granted') as never);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
    coords: { ...candidate, accuracy: 100 }, timestamp: now,
  } as Location.LocationObject);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted'));
  await render(<SettingsProvider><IntroProvider><LocationProvider><Home opened={false} /></LocationProvider></IntroProvider></SettingsProvider>);
  const prefs = JSON.parse(await storage.getItem('prayerSettings:v1') ?? 'null');
  expect(await readCachedFix()).toEqual(accepted);
  expect(prefs?.notifications?.enabled ?? false).toBe(false);
  expect(screen.getByText(question)).toBeTruthy();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Använd den här platsen'));
  expect(await readCachedFix()).toEqual(candidate);
  expect(JSON.parse((await storage.getItem('prayerSettings:v1'))!).notifications).toMatchObject({
    enabled: true, prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false },
  });
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

// On Android, percentage sizes inside the padded preview stopped at the content
// edges. The image must resolve all four edges against the rounded frame itself.
it('fills the rounded photo frame independently of the card padding', async () => {
  await openPreview();
  const image = screen.getByTestId('reminder-preview-photo', { includeHiddenElements: true });
  expect(image.props.resizeMode).toBe('cover');
  expect(StyleSheet.flatten(image.props.style)).toMatchObject({
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: 'auto', height: 'auto',
  });
  const frame = StyleSheet.flatten(image.parent!.props.style);
  expect(frame.overflow).toBe('hidden');
  expect(frame.borderRadius).toBeGreaterThan(0);
  expect(frame.padding ?? 0).toBe(0);
});
