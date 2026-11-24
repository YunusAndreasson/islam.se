import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Expo from 'expo-notifications';
import { Platform } from 'react-native';

import storeAlarms from './__tests__/fixtures/malmo-store-alarms.json';
import { getPlaces, namedPlace } from './places/nearest';
import { resetSyncStateForTests, syncPrayerNotifications } from './notifications';
import { DEFAULT_SETTINGS, type PrayerSettings } from './settings/types';
import { notificationSignature } from './settings/compute-signature';
import { storage } from './storage';

const malmo = { latitude: 55.60587, longitude: 13.00073 };
const settings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } };
const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
const armed = new Map<string, number>();
const records = new Map<string, Expo.NotificationRequest>();
let rejectRegistration: (request: Expo.NotificationRequestInput) => boolean;
let readback: (records: Expo.NotificationRequest[]) => Expo.NotificationRequest[];

beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T09:41:00+01:00'));
  resetSyncStateForTests();
  armed.clear();
  records.clear();
  rejectRegistration = () => false;
  readback = items => items;
  for (const key of ['prayerScheduleContext:v1', 'prayerNotificationIds:v1', 'prayerNotificationSync:v1']) {
    await storage.removeItem(key);
  }
  jest.mocked(Expo.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true } as Expo.NotificationPermissionsStatus);
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => readback([...records.values()]));
  jest.mocked(Expo.scheduleNotificationAsync).mockImplementation(async request => {
    const id = request.identifier!;
    const trigger = request.trigger as Expo.DateTriggerInput;
    const at = Number(trigger.date);
    // Expo persists the request before AlarmManager can reject registration.
    records.set(id, { identifier: id, content: request.content,
      trigger: { type: 'date', value: at, channelId: trigger.channelId } } as Expo.NotificationRequest);
    if (rejectRegistration(request)) throw new Error('AlarmManager unavailable');
    armed.set(id, at);
    return id;
  });
  jest.mocked(Expo.cancelScheduledNotificationAsync).mockImplementation(async id => {
    records.delete(id);
    armed.delete(id);
  });
});
afterEach(() => { Object.defineProperty(Platform, 'OS', originalOS); jest.restoreAllMocks(); });

// Captured by running the 1.3.8 scheduler at the reviewer's time and coordinates.
// Replay its Android pending requests and saved IDs without requiring a git checkout.
async function restoreStoreSchedule() {
  for (const [index, identity] of storeAlarms.entries()) {
    const [key, fireAt] = identity;
    const id = 'store-' + (index + 1);
    armed.set(id, Number(fireAt));
    records.set(id, { identifier: id, content: {
      title: null, subtitle: null, body: null, threadIdentifier: null, sound: 'default', categoryIdentifier: 'prayer-reminder', data: {
      source: 'prayer-times', key, silent: false, alertIdentity: JSON.stringify(identity),
    } }, trigger: { type: 'date', value: Number(fireAt), channelId: 'prayers-default-v2' } } as Expo.NotificationRequest);
  }
  await storage.setItem('prayerNotificationSync:v1', JSON.stringify(['2026-11-23', 'Europe/Stockholm',
    notificationSignature(settings), '55.606,13.001', 'exact']));
  await storage.setItem('prayerNotificationIds:v1', JSON.stringify([...armed.keys()]));
}

// Failed replacement retains only the old alarms whose place, calculation and fire time still match.
it.each(['cold sync', 'store upgrade', 'place change', 'GPS drift', 'method change', 'settings toggle'])(
  'retains only matching Android alarms through a rejected %s and converges on retry', async scenario => {
    let firstSettings: PrayerSettings = settings;
    let nextSettings: PrayerSettings = settings;
    let nextPlace = malmo;
    if (scenario === 'place change') {
      const from = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
      const to = namedPlace(getPlaces().find(p => p.name === 'Stockholm')!);
      firstSettings = { ...settings, locationMode: 'manual', manualLocation: from };
      nextSettings = { ...firstSettings, manualLocation: to };
      nextPlace = to;
    } else if (scenario === 'method change') {
      nextSettings = { ...settings, calculationMethod: 'Egyptian' };
    } else if (scenario === 'settings toggle') {
      nextSettings = { ...settings, notifications: { ...settings.notifications, alarmClock: true } };
    } else if (scenario === 'GPS drift') {
      nextPlace = { ...malmo, latitude: 55.60588 };
    }

    if (scenario === 'store upgrade') await restoreStoreSchedule();
    else expect(await syncPrayerNotifications(malmo, firstSettings)).toBe(true);
    const original = new Map(armed);
    expect(original.size).toBe(149);
    if (['cold sync', 'store upgrade', 'GPS drift'].includes(scenario)) resetSyncStateForTests();
    rejectRegistration = () => true;
    jest.mocked(Expo.scheduleNotificationAsync).mockClear();
    expect(await syncPrayerNotifications(nextPlace, nextSettings)).toBe(false);
    expect(Expo.scheduleNotificationAsync).toHaveBeenCalled();
    if (['place change', 'method change', 'settings toggle'].includes(scenario)) expect(armed.size).toBe(0);
    else expect(armed).toEqual(original);

    rejectRegistration = () => false;
    expect(await syncPrayerNotifications(nextPlace, nextSettings)).toBe(true);
    expect(armed.size).toBe(149);
    if (scenario === 'store upgrade') expect([...armed.values()].sort((a, b) => a - b)).toEqual([...original.values()].sort((a, b) => a - b));
  });

// A resolved schedule call alone cannot authorize cancellation if readback loses the replacement.
it('keeps the store schedule through unreadable replacement triggers, then removes duplicates on retry', async () => {
  await restoreStoreSchedule();
  const original = new Map(armed);
  readback = items => items.map(r => original.has(r.identifier) ? r : { ...r, trigger: null });
  expect(await syncPrayerNotifications(malmo, settings)).toBe(false);
  for (const [id, at] of original) expect(armed.get(id)).toBe(at);
  readback = items => items;
  expect(await syncPrayerNotifications(malmo, settings)).toBe(true);
  expect([...armed.values()].sort((a, b) => a - b)).toEqual([...original.values()].sort((a, b) => a - b));
  expect([...armed.keys()].every(id => !original.has(id))).toBe(true);
});

// A successful sibling can replace only its own occurrence in a partially rejected batch.
it('retires only independently verified occurrences during a partial upgrade', async () => {
  await restoreStoreSchedule();
  const original = new Map(armed);
  rejectRegistration = request => request.content.data?.key !== 'asr';
  expect(await syncPrayerNotifications(malmo, settings)).toBe(false);
  expect(armed.size).toBe(149);
  const retired = [...original.keys()].filter(id => !armed.has(id));
  const replacements = [...armed.keys()].filter(id => !original.has(id));
  expect(replacements.length).toBe(30);
  expect(replacements.every(id => records.get(id)?.content.data?.key === 'asr')).toBe(true);
  expect(new Set(replacements.map(id => armed.get(id)))).toEqual(new Set(retired.map(id => original.get(id))));
});

// The previous method becomes stale even if the reader changes it in the middle of an upgrade.
it('clears the previous method when a rejected method change supersedes an upgrade', async () => {
  await restoreStoreSchedule();
  const original = new Map(armed);
  let newer: Promise<boolean> | undefined;
  readback = items => {
    if (items.length > original.size && !newer) {
      rejectRegistration = () => true;
      newer = syncPrayerNotifications(malmo, { ...settings, calculationMethod: 'Egyptian' });
    }
    return items;
  };
  expect(await syncPrayerNotifications(malmo, settings)).toBe(false);
  expect(await newer).toBe(false);
  expect(armed.size).toBe(0);
  rejectRegistration = () => false;
  expect(await syncPrayerNotifications(malmo, { ...settings, calculationMethod: 'Egyptian' })).toBe(true);
  expect(armed.size).toBe(149);
  // A deliberate master off needs no replacement and still clears every prayer alarm.
  expect(await syncPrayerNotifications(malmo, DEFAULT_SETTINGS)).toBe(true);
  expect(armed.size).toBe(0);
});

// Enabling another prayer adds requests to a live horizon. Failure must leave
// the reader's already-enabled prayers armed without duplicating them on retry.
it('keeps Fajr armed when every registration for a newly enabled prayer fails', async () => {
  const fajrOnly = { ...settings, notifications: { ...settings.notifications,
    prayers: { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false } } };
  expect(await syncPrayerNotifications(malmo, fajrOnly)).toBe(true);
  const before = new Map(armed);
  expect(before.size).toBeGreaterThan(0);
  const next = { ...fajrOnly, notifications: { ...fajrOnly.notifications,
    prayers: { ...fajrOnly.notifications.prayers, asr: true } } };
  rejectRegistration = () => true;
  expect(await syncPrayerNotifications(malmo, next)).toBe(false);
  expect(armed).toEqual(before);
  rejectRegistration = () => false;
  expect(await syncPrayerNotifications(malmo, next)).toBe(true);
  for (const [id, at] of before) expect(armed.get(id)).toBe(at);
  expect(armed.size).toBeGreaterThan(before.size);
});

// A store alarm with a coincidentally matching time cannot establish its own place or method.
it.each(['missing', 'wrong place', 'wrong calculation'])('removes legacy alarms with a %s store stamp on rejection', async reason => {
  await restoreStoreSchedule();
  if (reason === 'missing') await storage.removeItem('prayerNotificationSync:v1');
  else {
    const stamp = JSON.parse((await storage.getItem('prayerNotificationSync:v1'))!);
    if (reason === 'wrong place') stamp[3] = '59.329,18.069';
    else stamp[2] = notificationSignature({ ...settings, calculationMethod: 'Egyptian' });
    await storage.setItem('prayerNotificationSync:v1', JSON.stringify(stamp));
  }
  rejectRegistration = () => true;
  expect(await syncPrayerNotifications(malmo, settings)).toBe(false);
  expect(armed.size).toBe(0);
});

// A store request can have the desired fire time and still play an obsolete sound.
it('removes only the superseded store sound when every migration write fails', async () => {
  await restoreStoreSchedule();
  const otherIds = [...records.values()].filter(r => r.content.data?.key !== 'dhuhr').map(r => r.identifier);
  rejectRegistration = () => true;
  const notifications = { ...settings.notifications, sound: { ...settings.notifications.sound, dhuhr: 'silent' as const } };
  expect(await syncPrayerNotifications(malmo, { ...settings, notifications })).toBe(false);
  expect([...armed.keys()].sort()).toEqual(otherIds.sort());
});
