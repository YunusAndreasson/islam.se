import { afterEach, expect, it, jest } from '@jest/globals';
import * as Expo from 'expo-notifications';
import { Platform } from 'react-native';

import * as alertCopy from './alert-copy';
import legacyAlerts from './__tests__/fixtures/malmo-store-alarms.json';
import { resetSyncStateForTests, syncPrayerNotifications, verifyPrayerSchedule } from './notifications';
import { getPlaces, namedPlace } from './places/nearest';
import { DEFAULT_SETTINGS, PRAYER_SLOT_KEYS, type NotificationSettings, type PrayerSettings } from './settings/types';
import { COMPUTE_KEYS, notificationSignature } from './settings/compute-signature';
import { storage } from './storage';
import * as zoneTime from './zone-time';

type OS = 'ios' | 'android';
type Outcome = 'success' | 'failure' | 'partial';
type Alarm = { key: string; date: string; at: number; id: string };
const paths = ['cold sync', 'store upgrade', 'place change', 'GPS drift', 'method change', 'prayer toggle', 'master toggle', 'no Fajr time'] as const;
const table = (['ios', 'android'] as const).flatMap(os => paths.flatMap(path =>
  (['success', 'failure', 'partial'] as const).map(outcome => ({ os, path, outcome }))));
const originalOS = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
afterEach(() => { Object.defineProperty(Platform, 'OS', originalOS); jest.restoreAllMocks(); });

function civilDate(at: number) {
  const { y, mo, d } = zoneTime.zoneParts(at);
  return [y, mo, d].join('-');
}

async function nativeQueue(os: OS) {
  const armed = new Map<string, Alarm>();
  const observed = new Map<string, Alarm>();
  let onCancel: (id: string) => void = () => {};
  const records = new Map<string, Expo.NotificationRequest>();
  let seq = 0;
  let peak = 0;
  let outcome: Outcome = 'success';
  resetSyncStateForTests();
  for (const key of ['prayerNotificationIds:v1', 'prayerScheduleContext:v1', 'prayerNotificationSync:v1']) await storage.removeItem(key);
  jest.mocked(Expo.getPermissionsAsync).mockResolvedValue({ granted: true, status: 'granted', ios: { status: 2 } } as Expo.NotificationPermissionsStatus);
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => {
    for (const [id, alarm] of armed) if (records.has(id)) observed.set(id, alarm);
    return [...records.values()];
  });
  jest.mocked(Expo.cancelScheduledNotificationAsync).mockImplementation(async id => {
    onCancel(id);
    records.delete(id);
    armed.delete(id);
  });
  jest.mocked(Expo.scheduleNotificationAsync).mockImplementation(async request => {
    const t = request.trigger as Expo.CalendarTriggerInput;
    const at = request.trigger && 'date' in request.trigger ? Number(request.trigger.date)
      : Date.UTC(t.year!, t.month! - 1, t.day, t.hour, t.minute, t.second);
    const key = String(request.content.data?.key);
    const id = request.identifier ?? 'native-' + ++seq;
    const trigger = os === 'android' ? { type: 'date', value: at, channelId: t.channelId } :
      { type: 'calendar', repeats: false, dateComponents: { ...t, timeZone: 'UTC' } };
    const record = { identifier: id, content: request.content, trigger } as Expo.NotificationRequest;
    if (os === 'android') records.set(id, record); // Expo's durable write precedes AlarmManager.
    if (outcome === 'failure' || (outcome === 'partial' && key !== 'asr')) throw new Error('Registration rejected');
    records.set(id, record);
    armed.set(id, { id, key, at, date: String(request.content.data?.prayerDate) });
    peak = Math.max(peak, armed.size);
    return id;
  });
  return { armed, records, observed, peak: () => peak, reject: (next: Outcome) => { outcome = next; },
    beforeCancel: (check: typeof onCancel) => { onCancel = check; } };
}

// Compare the complete native set to the clean-install schedule for the new preferences.
// Only a correct prior request survives rejection. A withdrawn slot has no survivor.
it.each(table)('$os $path with $outcome registrations', async ({ os, path, outcome }) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const now = path === 'no Fajr time' ? Date.parse('2026-06-01T09:41:00+02:00') : Date.parse('2026-11-23T09:41:00+01:00');
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  const from = city(path === 'no Fajr time' ? 'Kiruna' : 'Malmö');
  const to = path === 'place change' ? city('Stockholm') : path === 'GPS drift' ? { ...from, latitude: from.latitude + 0.00001 } : from;
  const old: PrayerSettings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } };
  if (path === 'place change' || path === 'no Fajr time') { old.locationMode = 'manual'; old.manualLocation = from; }
  if (path === 'no Fajr time') old.notifications.prayers = { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false };
  const next = { ...old, notifications: { ...old.notifications } };
  if (path === 'place change') next.manualLocation = to;
  if (path === 'method change') next.calculationMethod = 'Egyptian';
  if (path === 'no Fajr time') next.polarCircleResolution = 'unresolved';
  if (path === 'master toggle') next.notifications.enabled = false;
  if (path === 'prayer toggle') next.notifications.prayers = { ...old.notifications.prayers, fajr: false };
  const later = path === 'prayer toggle' ? now + 86_400_000 : now;

  const clean = await nativeQueue(os);
  clock.mockReturnValue(later);
  expect(await syncPrayerNotifications(to, next)).toBe(true);
  const desired = [...clean.armed.values()];
  if (path === 'no Fajr time' || path === 'master toggle') expect(desired).toHaveLength(0);
  clock.mockReturnValue(now);
  const queue = await nativeQueue(os);
  if (path === 'store upgrade') {
    // 1.3.8 DATE triggers read back as relative intervals on iOS. Their original
    // absolute fire times are in the store identities captured in this fixture.
    for (const [index, identity] of legacyAlerts.slice(0, os === 'ios' ? 60 : 149).entries()) {
      const [key, at] = identity;
      if (typeof key !== 'string' || typeof at !== 'number') throw new Error('Invalid store alarm fixture');
      const id = 'store-' + index;
      queue.armed.set(id, { id, key, at, date: civilDate(at) });
      queue.records.set(id, { identifier: id, content: { title: null, subtitle: null, body: null, threadIdentifier: null, sound: 'default',
        categoryIdentifier: 'prayer-reminder', data: { key, source: 'prayer-times', alertIdentity: JSON.stringify(identity) } },
        trigger: os === 'ios' ? { type: 'timeInterval', seconds: (at - now) / 1000, repeats: false } :
          { type: 'date', value: at, channelId: 'prayers-default-v2' } } as Expo.NotificationRequest);
    }
    await storage.setItem('prayerNotificationSync:v1', JSON.stringify(['2026-11-23', 'Europe/Stockholm', notificationSignature(old), '55.606,13.001', 'exact']));
    expect(queue.armed.size).toBe(os === 'ios' ? 60 : 149);
    await storage.setItem('prayerNotificationIds:v1', JSON.stringify([...queue.armed.keys()]));
  } else expect(await syncPrayerNotifications(from, old)).toBe(true);
  if (path === 'no Fajr time') expect(queue.armed.size).toBe(22);
  clock.mockReturnValue(later);
  for (const [id, alarm] of queue.armed) if (alarm.at <= later) { queue.records.delete(id); queue.armed.delete(id); }
  const slot = (a: Alarm) => a.date + '/' + a.key;
  const before = new Map([...queue.armed.values()].map(a => [slot(a), a]));
  if (os === 'android' && path === 'prayer toggle') expect([...before.values()].filter(a => a.key === 'fajr')).toHaveLength(28);
  if (['cold sync', 'store upgrade', 'GPS drift'].includes(path)) resetSyncStateForTests();
  const targets = new Map(desired.map(a => [slot(a), a]));
  const sameContext = !['place change', 'method change'].includes(path);
  const premature: Alarm[] = [];
  queue.beforeCancel(id => {
    const prior = queue.armed.get(id);
    const target = prior && targets.get(slot(prior));
    if (!prior || !target || !sameContext || Math.abs(prior.at - target.at) > 60_000) return;
    // A final count alone can hide a brief loss of every alarm during an upgrade.
    const confirmed = [...queue.armed.values()].some(a => a.id !== id && slot(a) === slot(target) &&
      a.at === target.at && queue.observed.get(a.id) === a);
    if (!confirmed) premature.push(prior);
  });
  queue.reject(outcome);
  await syncPrayerNotifications(to, next);
  expect(premature).toEqual([]);
  if (path === 'place change' && outcome === 'failure') {
    expect(queue.armed.size).toBe(0);
    expect((await verifyPrayerSchedule(to, next)).alerts).toEqual([]);
  }
  const expected: string[] = [];
  const signature = (a: Alarm) => slot(a) + '/' + a.at;
  for (const target of desired) {
    const prior = before.get(slot(target));
    if (outcome === 'success' || (outcome === 'partial' && target.key === 'asr')) {
      expected.push(signature(target));
      if (prior && ['store upgrade', 'place change', 'method change'].includes(path)) {
        expect(queue.armed.has(prior.id)).toBe(false);
      }
    } else if (prior && sameContext && Math.abs(target.at - prior.at) <= 60_000) {
      expect(queue.armed.get(prior.id)).toEqual(prior);
      expected.push(signature(prior));
    }
  }
  expect([...queue.armed.values()].map(signature).sort()).toEqual(expected.sort());
  if (os === 'ios') expect(queue.peak()).toBeLessThanOrEqual(64);
});

// Unreadable native triggers must not earn confirmation or accumulate a second ID.
it.each(['ios', 'android'] as const)('%s preserves a working request until a trigger repair can be verified', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T09:41:00+01:00'));
  const place = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
  const settings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } };
  const queue = await nativeQueue(os);
  expect(await syncPrayerNotifications(place, settings)).toBe(true);
  const before = [...queue.armed.values()];
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () =>
    [...queue.records.values()].map(r => ({ ...r, trigger: null })));
  expect(await syncPrayerNotifications(place, settings)).toBe(false);
  expect([...queue.armed.values()]).toEqual(before);
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => [...queue.records.values()]);
  expect(await syncPrayerNotifications(place, settings)).toBe(true);
  expect(queue.armed.size).toBe(before.length);
  if (os === 'ios') expect(queue.peak()).toBeLessThanOrEqual(64);
});

// The reviewer interrupted Stockholm's first batch while 60 Malmö requests and
// four replacements occupied all 64 iOS slots.
const city = (name: string) => namedPlace(getPlaces().find(place => place.name === name)!);
const malmo = city('Malmö');
const prefs = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } };

async function reviewQueue(os: OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T09:41:00+01:00'));
  return nativeQueue(os);
}

it('can still change the iOS city after another location supersedes an in-progress replacement', async () => {
  const gothenburg = city('Göteborg');
  const control = await reviewQueue('ios');
  expect(await syncPrayerNotifications(gothenburg, prefs)).toBe(true);
  const queue = await nativeQueue('ios');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  let successor: Promise<boolean> | undefined;
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => {
    if (!successor && queue.records.size === 64) successor = syncPrayerNotifications(gothenburg, prefs);
    return [...queue.records.values()];
  });
  expect(await syncPrayerNotifications(city('Stockholm'), prefs)).toBe(false);
  expect(await successor).toBe(true);
  expect(await syncPrayerNotifications(gothenburg, prefs)).toBe(true);
  expect(queue.peak()).toBeLessThanOrEqual(64);
  expect(queue.armed).toEqual(control.armed);
});

// Unreadable Dhuhr triggers used to add 30 copies with every verification retry.
it('keeps every native ID and fire time through three unreadable Dhuhr retries and recovery', async () => {
  const queue = await reviewQueue('android');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  expect(original.size).toBe(149);
  const read = jest.mocked(Expo.getAllScheduledNotificationsAsync);
  read.mockImplementation(async () => [...queue.records.values()].map(r =>
    r.content.data?.key === 'dhuhr' ? { ...r, trigger: null } : r));
  for (let attempt = 0; attempt < 3; attempt++) {
    const proof = await verifyPrayerSchedule(malmo, prefs);
    expect(proof.alerts.some(a => a.key === 'dhuhr')).toBe(false);
    expect(queue.armed).toEqual(original);
  }
  read.mockImplementation(async () => [...queue.records.values()]);
  expect((await verifyPrayerSchedule(malmo, prefs)).alerts.some(a => a.key === 'dhuhr')).toBe(true);
  expect(queue.armed).toEqual(original);
});

// At each one-metre move, only the second (post-write) native read rejects.
it('arms one request per prayer and date after each of three interrupted GPS readbacks', async () => {
  const queue = await reviewQueue('android');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const slots = () => [...queue.armed.values()].map(a => a.key + '/' + a.date).sort();
  const original = slots();
  expect(new Set(original).size).toBe(149);
  for (let step = 1; step <= 3; step++) {
    let reads = 0;
    jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => {
      if (++reads === 2) throw new Error('Transient native readback failure');
      return [...queue.records.values()];
    });
    // Cold Android verification must actually re-arm even when GPS stays in the same place.
    resetSyncStateForTests();
    expect(await syncPrayerNotifications({ ...malmo, latitude: malmo.latitude + step * 0.00001 }, prefs)).toBe(false);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(slots()).toEqual(original);
  }
});

// Imported duplicate requests must disappear before readback can credit an occurrence.
it.each(['android', 'ios'] as const)('%s collapses pre-existing duplicates before verification', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  const alarm = [...original.values()][0]!;
  for (const id of ['old-copy-1', 'old-copy-2']) {
    queue.armed.set(id, { ...alarm, id });
    queue.records.set(id, { ...queue.records.get(alarm.id)!, identifier: id });
  }
  const proof = await verifyPrayerSchedule(malmo, prefs);
  expect(proof.alerts.some(a => a.key === alarm.key)).toBe(true);
  expect(queue.armed).toEqual(original);
});

// Stable identities must survive a different city and a JS restart.
it.each(['android', 'ios'] as const)('%s reuses the same Malmö identifiers after a round trip', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  expect(await syncPrayerNotifications(city('Stockholm'), prefs)).toBe(true);
  resetSyncStateForTests();
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  expect(queue.armed).toEqual(original);
});

// Android updates its stored trigger before a rejected AlarmManager registration.
// Even a one-minute offset change invalidates the old request identity.
it.each(['ios', 'android'] as const)('%s removes the old alarm after both one-minute and two-minute offset changes', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  queue.reject('failure');
  for (const lead of [1, 2]) {
    resetSyncStateForTests();
    const next = { ...prefs, notifications: { ...prefs.notifications, lead: { ...prefs.notifications.lead, dhuhr: lead } } };
    expect(await syncPrayerNotifications(malmo, next)).toBe(false);
    const expected = new Map([...original].filter(([, alarm]) => alarm.key !== 'dhuhr'));
    expect(queue.armed).toEqual(expected);
  }
});

// A failed cleanup cannot earn a bell for a prayer still armed under two native IDs.
it('withholds verification until a previously duplicated prayer can be cancelled', async () => {
  const queue = await reviewQueue('ios');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const alarm = [...queue.armed.values()][0]!;
  queue.records.set('duplicate', { ...queue.records.get(alarm.id)!, identifier: 'duplicate' });
  queue.armed.set('duplicate', { ...alarm, id: 'duplicate' });
  jest.mocked(Expo.cancelScheduledNotificationAsync).mockRejectedValueOnce(new Error('Notification center unavailable'));
  const rejected = await verifyPrayerSchedule(malmo, prefs);
  expect(rejected.alerts.some(a => a.fireAt.getTime() === alarm.at)).toBe(false);
  const recovered = await verifyPrayerSchedule(malmo, prefs);
  expect(recovered.alerts.some(a => a.fireAt.getTime() === alarm.at)).toBe(true);
  expect(queue.armed.has('duplicate')).toBe(false);
});

// A successful retime replaces the stale alarm. A later cold rejection must keep
// that now-correct replacement, even though Android is unable to refresh it.
it('retains a successfully retimed Android alarm through a rejected cold re-arm', async () => {
  const queue = await reviewQueue('android');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const next = { ...prefs, notifications: { ...prefs.notifications, lead: { ...prefs.notifications.lead, dhuhr: 15 } } };
  expect(await syncPrayerNotifications(malmo, next)).toBe(true);
  const retimed = new Map(queue.armed);
  resetSyncStateForTests();
  queue.reject('failure');
  expect(await syncPrayerNotifications(malmo, next)).toBe(false);
  expect(queue.armed).toEqual(retimed);
});

// Final review #26: native readback hid every Dhuhr trigger while the original alarms
// were still armed. Rejected in-place repairs previously erased the entire prayer.
it.each(['android', 'ios'] as const)('%s keeps every wanted alarm when unreadable Dhuhr repairs fail', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  const dhuhr = [...original.values()].filter(a => a.key === 'dhuhr');
  expect(dhuhr).toHaveLength(os === 'android' ? 30 : 12);
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => [...queue.records.values()].map(r =>
    r.content.data?.key === 'dhuhr' ? { ...r, trigger: null } : r));
  queue.reject('failure');
  for (let attempt = 0; attempt < 2; attempt++) {
    const schedule = jest.mocked(Expo.scheduleNotificationAsync);
    schedule.mockClear();
    const proof = await verifyPrayerSchedule(malmo, prefs);
    expect(proof.alerts.some(a => a.key === 'dhuhr')).toBe(false);
    expect(schedule.mock.calls).toHaveLength(dhuhr.length);
    expect(new Set(schedule.mock.calls.map(([r]) => r.identifier))).toEqual(new Set(dhuhr.map(a => a.id)));
    expect(queue.armed).toEqual(original);
  }
});

// With no readable triggers or content, only the native IDs distinguish a retained
// Malmö queue from a switch to Stockholm. Neither can earn a delivery promise.
it.each(['android', 'ios'] as const)('%s preserves unreadable IDs only while their city is wanted', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const original = new Map(queue.armed);
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () => [...queue.records.values()].map(r =>
    ({ ...r, content: { ...r.content, data: {} }, trigger: null })));
  queue.reject('failure');
  expect(await verifyPrayerSchedule(malmo, prefs)).toMatchObject({ alerts: [], pending: 'unknown' });
  expect(queue.armed).toEqual(original);
  expect((await verifyPrayerSchedule(city('Stockholm'), prefs)).alerts).toEqual([]);
  expect(queue.armed.size).toBe(0);
});

// Review #27: Expo overwrote the Android trigger record before rejecting the
// on-time replacement. A readable retry then mistook the 30-minute alarm for it.
it.each(['android', 'ios'] as const)('%s retires every 30-minute warning despite unreadable triggers and a rejected on-time replacement', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const slot = (alarm: Alarm) => alarm.date + '/' + alarm.key;
  const onTime = new Map([...queue.armed.values()].map(a => [slot(a), a.at]));
  const early = { ...prefs, notifications: { ...prefs.notifications, lead: {
    ...prefs.notifications.lead, fajr: 30, dhuhr: 30, asr: 30, maghrib: 30, isha: 30,
  } } };
  expect(await syncPrayerNotifications(malmo, early)).toBe(true);
  expect(queue.armed.size).toBe(os === 'android' ? 149 : 60);
  for (const alarm of queue.armed.values()) expect(alarm.at + 30 * 60_000).toBe(onTime.get(slot(alarm)));
  const read = jest.mocked(Expo.getAllScheduledNotificationsAsync);
  read.mockImplementation(async () => [...queue.records.values()].map(r => ({ ...r, trigger: null })));
  queue.reject('failure');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(false);
  const afterChange = queue.armed.size;
  read.mockImplementation(async () => [...queue.records.values()]);
  const proof = await verifyPrayerSchedule(malmo, prefs);
  expect({ afterChange, afterReadableRetry: queue.armed.size, verified: proof.alerts.length })
    .toEqual({ afterChange: 0, afterReadableRetry: 0, verified: 0 });
});

// Every scheduling field needs a failure case. The exhaustive maps also catch
// optional fields that Object.keys(DEFAULT_SETTINGS) could never see.
type Change = { label: string; change: (s: PrayerSettings) => PrayerSettings; affected?: string; editRuntime?: () => void };
const notificationChanges = {
  enabled: [{ label: 'master', change: s => ({ ...s, notifications: { ...s.notifications, enabled: false } }) }],
  prayers: PRAYER_SLOT_KEYS.filter(k => k !== 'sunrise').map(key => ({ label: key + ' switch', affected: key,
    change: s => ({ ...s, notifications: { ...s.notifications, prayers: { ...s.notifications.prayers, [key]: false } } }) })),
  lead: PRAYER_SLOT_KEYS.map(key => ({ label: key + ' offset', affected: key,
    change: s => ({ ...s, notifications: { ...s.notifications, lead: { ...s.notifications.lead, [key]: 1 } } }) })),
  sound: PRAYER_SLOT_KEYS.map(key => ({ label: key + ' sound/channel', affected: key,
    change: s => ({ ...s, notifications: { ...s.notifications, sound: { ...s.notifications.sound, [key]: 'silent' } } }) })),
  fajrWindowEnd: [{ label: 'sunrise switch', affected: 'sunrise', change: s => ({ ...s, notifications: { ...s.notifications, fajrWindowEnd: false } }) }],
  lastThird: [{ label: 'night switch', affected: 'lastThird', change: s => ({ ...s, notifications: { ...s.notifications, lastThird: false } }) }],
  lastThirdSound: [{ label: 'night sound', affected: 'lastThird', change: s => ({ ...s, notifications: { ...s.notifications, lastThirdSound: 'silent' } }) }],
  alarmClock: [{ label: 'alarm clock', change: s => ({ ...s, notifications: { ...s.notifications, alarmClock: true } }) }],
} satisfies Record<keyof NotificationSettings, Change[]>;

const calculationChanges = {
  calculationMethod: [{ label: 'calculation method', change: s => ({ ...s, calculationMethod: 'Egyptian' }) }],
  madhab: [{ label: 'school', change: s => ({ ...s, madhab: 'hanafi' }) }],
  highLatitudeRule: [{ label: 'latitude rule', change: s => ({ ...s, highLatitudeRule: 'twilightAngle' }) }],
  polarCircleResolution: [{ label: 'polar rule', change: s => ({ ...s, polarCircleResolution: 'unresolved' }) }],
  shafaq: [{ label: 'twilight', change: s => ({ ...s, shafaq: 'ahmer' }) }],
  rounding: [{ label: 'rounding', change: s => ({ ...s, rounding: 'up' }) }],
  adjustments: PRAYER_SLOT_KEYS.map(key => ({ label: key + ' calculation adjustment',
    change: s => ({ ...s, adjustments: { ...s.adjustments, [key]: 2 } }) })),
} satisfies Record<typeof COMPUTE_KEYS[number], Change[]>;

const changes: Change[] = [...Object.values(notificationChanges).flat(), ...Object.values(calculationChanges).flat(),
  { label: 'place name', change: s => ({ ...s, manualLocation: { ...malmo, name: 'Different town' } }) },
  { label: 'county', change: s => ({ ...s, manualLocation: { ...malmo, county: 'Different county' } }) },
  { label: 'latitude', change: s => ({ ...s, manualLocation: { ...malmo, latitude: malmo.latitude + 0.01 } }) },
  { label: 'longitude', change: s => ({ ...s, manualLocation: { ...malmo, longitude: malmo.longitude + 0.01 } }) },
  { label: 'rendered notification text', affected: 'dhuhr', change: s => s, editRuntime: () => {
    const render = alertCopy.alertContent;
    jest.spyOn(alertCopy, 'alertContent').mockImplementation((key, at, lead) => {
      const copy = render(key, at, lead);
      return key === 'dhuhr' ? { ...copy, title: copy.title + ' i dag' } : copy;
    });
  } },
  { label: 'display time zone', change: s => s,
    editRuntime: () => { jest.spyOn(zoneTime, 'getDisplayZone').mockReturnValue('UTC'); } },
  { label: 'text version', change: s => s,
    editRuntime: () => { jest.replaceProperty(alertCopy, 'NOTIFICATION_TEXT_VERSION', alertCopy.NOTIFICATION_TEXT_VERSION + 1); } },
];
it.each((['android', 'ios'] as const).flatMap(os => changes.map(c => ({ ...c, os }))))
  ('$os retires obsolete IDs for $label with unreadable triggers and rejected writes', async ({ os, change, affected, editRuntime }) => {
    const queue = await reviewQueue(os);
    const start: PrayerSettings = { ...prefs, locationMode: 'manual', manualLocation: malmo,
      notifications: { ...prefs.notifications, fajrWindowEnd: true, lastThird: true } };
    expect(await syncPrayerNotifications(malmo, start)).toBe(true);
    const before = [...queue.armed.values()];
    const stale = before.filter(a => !affected || a.key === affected);
    const unaffected = before.filter(a => affected && a.key !== affected);
    expect(stale.length).toBeGreaterThan(0);
    const read = jest.mocked(Expo.getAllScheduledNotificationsAsync);
    read.mockImplementation(async () => [...queue.records.values()].map(r => ({ ...r, trigger: null })));
    queue.reject('failure');
    editRuntime?.();
    const next = change(start);
    await syncPrayerNotifications(next.manualLocation!, next);
    expect(stale.filter(a => queue.armed.has(a.id))).toHaveLength(0);
    read.mockImplementation(async () => [...queue.records.values()]);
    await syncPrayerNotifications(next.manualLocation!, next);
    expect(stale.filter(a => queue.armed.has(a.id))).toHaveLength(0);
    for (const alarm of unaffected) expect(queue.armed.get(alarm.id)).toEqual(alarm);
  });

// Android fixes the delivery mode at registration, even for the same fire time.
it('withdraws exact Android alarms when only inexact delivery is available and the replacement fails', async () => {
  const queue = await reviewQueue('android');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  expect(queue.armed.size).toBe(149);
  const read = jest.mocked(Expo.getAllScheduledNotificationsAsync);
  read.mockImplementation(async () => [...queue.records.values()].map(r => ({ ...r, trigger: null })));
  queue.reject('failure');
  const exact = jest.mocked(Expo.getExactAlarmPermissionsAsync);
  const denied = { ...await exact(), granted: false };
  exact.mockResolvedValueOnce(denied);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(false);
  expect(queue.armed.size).toBe(0);
  read.mockImplementation(async () => [...queue.records.values()]);
  exact.mockResolvedValueOnce(denied);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(false);
  expect(queue.armed.size).toBe(0);
});

// Crossing a civil date must retire yesterday's opaque IDs without disturbing
// the remaining dates for the same prayers when the horizon cannot be extended.
it.each(['ios', 'android'] as const)('%s retires expired dates and keeps the remaining unreadable occurrences', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const tomorrow = Date.parse('2026-11-24T00:00:00+01:00');
  const remaining = new Map([...queue.armed].filter(([, alarm]) => alarm.at >= tomorrow));
  expect(remaining.size).toBeLessThan(queue.armed.size);
  expect(remaining.size).toBeGreaterThan(0);
  jest.spyOn(Date, 'now').mockReturnValue(tomorrow);
  queue.reject('failure');
  jest.mocked(Expo.getAllScheduledNotificationsAsync).mockImplementation(async () =>
    [...queue.records.values()].map(r => ({ ...r, trigger: null })));
  expect(await verifyPrayerSchedule(malmo, prefs)).toMatchObject({ pending: 'unknown', alerts: [] });
  expect(queue.armed).toEqual(remaining);
});

// A payload can be copied under another ID. Only the requested native ID can
// identify a current-format alarm, even when the copied text and time both match.
it.each(['ios', 'android'] as const)('%s retires a copied request with an unwanted native ID after rejection', async os => {
  const queue = await reviewQueue(os);
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(true);
  const alarm = [...queue.armed.values()][0]!;
  const request = queue.records.get(alarm.id)!;
  queue.records.delete(alarm.id);
  queue.armed.delete(alarm.id);
  const copy = 'copied-request';
  queue.records.set(copy, { ...request, identifier: copy });
  queue.armed.set(copy, { ...alarm, id: copy });
  queue.reject('failure');
  expect(await syncPrayerNotifications(malmo, prefs)).toBe(false);
  expect(queue.armed.has(copy)).toBe(false);
  expect(queue.armed.has(alarm.id)).toBe(false);
});
