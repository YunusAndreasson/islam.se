import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { readPrayerEvidence, readReminderAuthorization, verifyPrayerSchedule, syncPrayerNotifications, resetSyncStateForTests } from './notifications';
import { DEFAULT_SETTINGS } from './settings/types';
import { reminderSelection } from './first-run';
import { namedPlace, getPlaces, placeTitle } from './places/nearest';
import { getDisplayZone } from './zone-time';
import { formatTime } from './prayer-times';

const places = getPlaces().filter(p => p.name === 'Berg');
const coords = namedPlace(places.find(p => p.county === 'Västernorrland')!);
const settings = { ...DEFAULT_SETTINGS, locationMode: 'manual' as const, manualLocation: coords, notifications: reminderSelection(DEFAULT_SETTINGS.notifications.prayers) };
type Request = Notifications.NotificationRequest;
type Input = Parameters<typeof Notifications.scheduleNotificationAsync>[0];
let pending: Request[];
let snapshot: (requests: Request[]) => Request[];
const full = { granted: true, canAskAgain: true, status: 'granted', expires: 'never', ios: { status: 2 } } as Notifications.NotificationPermissionsStatus;

beforeEach(() => {
  resetSyncStateForTests();
  pending = [];
  snapshot = r => r;
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { pending = pending.filter(r => r.identifier !== id); });
  jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue({ importance: Notifications.AndroidImportance.DEFAULT } as Notifications.NotificationChannel);
  jest.mocked(Notifications.getNotificationChannelGroupAsync).mockResolvedValue({ isBlocked: false } as Notifications.NotificationChannelGroup);
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T09:41:00+01:00'));
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(full);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => snapshot(pending));
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async (r: Input) => {
    const t = r.trigger as Notifications.CalendarTriggerInput & { date?: Date };
    const trigger = Platform.OS === 'ios'
      ? { type: 'calendar', repeats: false, dateComponents: { ...t, timeZone: t.timezone } }
      : { type: 'date', value: t.date!.getTime(), channelId: (r.trigger as Notifications.DateTriggerInput).channelId };
    const identifier = r.identifier!;
    pending = pending.filter(item => item.identifier !== identifier);
    pending.push({ identifier, trigger, content: r.content } as Request);
    return identifier;
  });
});
afterEach(() => { jest.restoreAllMocks(); });

it.each(['ios', 'android'] as const)('confirms the real OS date for the selected Berg on %s', async os => {
  const old = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    expect(placeTitle(coords)).toBe('Berg, Västernorrland');
    const { alerts } = await verifyPrayerSchedule(coords, settings);
    expect(alerts[0]?.key).toBe('dhuhr');
    expect(formatTime(alerts[0]?.fireAt)).toBe('11:38');
    expect(alerts.find(a => a.key === 'fajr')?.fireAt.getTime()).toBeGreaterThan(Date.parse('2026-11-24T00:00:00+01:00'));
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: old }); }
});

// The old confirmation inferred bells from enabled switches even with an empty pending queue.
it.each(['empty', 'wrong time', 'wrong ID', 'wrong place', 'stale prayer', 'revoked', 'provisional'] as const)('withholds confirmation for %s', async reason => {
  snapshot = items => {
    if (reason === 'empty') return [];
    return items.map(r => {
      if (reason === 'wrong ID') return { ...r, identifier: 'superseded-' + r.identifier };
      if (reason === 'wrong time') return { ...r, trigger: null };
      if (reason === 'wrong place' || reason === 'stale prayer') return { ...r, content: {
        ...r.content, data: { ...r.content.data, ...(reason === 'wrong place' ? { context: 'other' } : { prayerAt: 0 }) },
      } };
      return r;
    });
  };
  if (reason === 'revoked' || reason === 'provisional') {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce(full).mockResolvedValue({
      ...full, granted: reason === 'provisional', ios: { ...full.ios!, status: reason === 'provisional' ? 3 : 1 },
    });
  }
  expect((await verifyPrayerSchedule(coords, settings)).alerts).toEqual([]);
});

// A successful older reconcile used to confirm reminders after a newer choice had turned them off.
it('rejects a superseded generation and verifies only the native requests actually present', async () => {
  snapshot = items => items.filter(r => r.content.data?.key === 'asr');
  const stale = verifyPrayerSchedule(coords, settings);
  const off = verifyPrayerSchedule(coords, { ...settings, notifications: DEFAULT_SETTINGS.notifications });
  expect((await stale).alerts).toEqual([]);
  expect((await off).pending).toBe('none');
  const result = await verifyPrayerSchedule(coords, settings);
  expect(result.pending).toBe('some');
  expect([...new Set(result.alerts.map(a => a.key))]).toEqual(['asr']);
});

it('keeps native read errors separate from an observed empty queue', async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockRejectedValue(new Error('unavailable'));
  expect(await verifyPrayerSchedule(coords, settings)).toMatchObject({ auth: 'full', pending: 'unknown', alerts: [] });
});

// Expo writes its Android request record before AlarmManager accepts it.
it('never certifies failed Android registrations, cleans their records and retries them', async () => {
  const malmo = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
  const prefs = { ...settings, manualLocation: malmo };
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    let failure: 'all' | 'partial' | 'none' = 'all';
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => { pending = pending.filter(r => r.identifier !== id); });
    const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
    schedule.mockImplementation(async r => {
      const id = r.identifier ?? String(pending.length);
      const trigger = r.trigger as Notifications.DateTriggerInput;
      pending.push({ identifier: id, content: r.content, trigger: { type: 'date', value: Number(trigger.date), channelId: trigger.channelId } } as Request);
      if (failure === 'all' || (failure === 'partial' && r.content.data?.key !== 'asr')) throw new Error('AlarmManager rejected the request');
      return id;
    });
    expect(await verifyPrayerSchedule(malmo, prefs)).toMatchObject({ pending: 'none', alerts: [] });
    expect(pending).toHaveLength(0);
    failure = 'partial';
    const result = await verifyPrayerSchedule(malmo, prefs);
    expect([...new Set(result.alerts.map(a => a.key))]).toEqual(['asr']);
    expect(pending.every(r => r.content.data?.key === 'asr')).toBe(true);
    failure = 'none';
    expect((await verifyPrayerSchedule(malmo, prefs)).alerts.some(a => a.key === 'dhuhr')).toBe(true);
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

it('keeps coordinates, county, city and calculation signature out of Android notification extras', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    await verifyPrayerSchedule(coords, settings);
    expect(pending.length).toBeGreaterThan(0);
    const posted = JSON.stringify(pending.map(r => r.content.data));
    for (const privateValue of [coords.latitude, coords.longitude, coords.name, coords.county, settings.calculationMethod, getDisplayZone()]) {
      expect(posted).not.toContain(String(privateValue));
    }
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

it.each(['channel', 'group', 'unreadable'] as const)('withholds Android delivery proof for a %s block', async failure => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    if (failure === 'unreadable') jest.mocked(Notifications.getNotificationChannelAsync).mockRejectedValue(new Error('unavailable'));
    else jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue({ importance: failure === 'channel' ? Notifications.AndroidImportance.NONE : Notifications.AndroidImportance.DEFAULT, groupId: 'prayers' } as Notifications.NotificationChannel);
    jest.mocked(Notifications.getNotificationChannelGroupAsync).mockResolvedValue({ isBlocked: failure === 'group' } as Notifications.NotificationChannelGroup);
    expect(await verifyPrayerSchedule(coords, settings)).toMatchObject({ alerts: [], pending: failure === 'unreadable' ? 'unknown' : 'none' });
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

it('restores an askable Android draft to the preview after death before the OS request', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false, canAskAgain: true } as Notifications.NotificationPermissionsStatus);
    expect(await readReminderAuthorization()).toBe('undetermined');
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

// Expo's reboot receiver retains durable request records after failed native alarm registration.
it('reboot restore failure invalidates prior Android delivery proof', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    const city = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
    const prefs = { ...settings, manualLocation: city };
    const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
    const alarms = new Set<string>();
    let unavailable = false;
    function registerAlarm(id: string) {
      if (unavailable) throw new Error('AlarmManager unavailable');
      alarms.add(id);
    }
    schedule.mockImplementation(async request => {
      const identifier = request.identifier!;
      const trigger = request.trigger as Notifications.DateTriggerInput;
      pending = pending.filter(r => r.identifier !== identifier);
      pending.push({ identifier, content: request.content,
        trigger: { type: 'date', value: Number(trigger.date), channelId: trigger.channelId } } as Request);
      registerAlarm(identifier);
      return identifier;
    });
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => {
      pending = pending.filter(r => r.identifier !== id);
      alarms.delete(id);
    });
    const accepted = await verifyPrayerSchedule(city, prefs);
    expect(accepted.alerts).toHaveLength(149);
    alarms.clear();
    unavailable = true;
    for (const request of pending) expect(() => registerAlarm(request.identifier)).toThrow('AlarmManager unavailable');

    resetSyncStateForTests();
    schedule.mockClear();
    expect(await readPrayerEvidence(city, prefs)).toMatchObject({ pending: 'unknown', alerts: [] });
    expect(await verifyPrayerSchedule(city, prefs)).toMatchObject({ alerts: [] });
    expect(alarms.size).toBe(0);
    expect(schedule).toHaveBeenCalled();

    unavailable = false;
    expect((await verifyPrayerSchedule(city, prefs)).alerts).toHaveLength(149);
    expect(alarms.size).toBe(149);
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});

// An ordinary process restart keeps the OS alarms alive even when the next native write fails.
it('ordinary cold sync preserves the already armed schedule when registration is unavailable', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  try {
    const city = namedPlace(getPlaces().find(p => p.name === 'Malmö')!);
    const prefs = { ...settings, manualLocation: city };
    const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
    const alarms = new Set<string>();
    let unavailable = false;
    function registerAlarm(id: string) {
      if (unavailable) throw new Error('AlarmManager unavailable');
      alarms.add(id);
    }
    schedule.mockImplementation(async request => {
      const identifier = request.identifier!;
      const trigger = request.trigger as Notifications.DateTriggerInput;
      pending = pending.filter(r => r.identifier !== identifier);
      pending.push({ identifier, content: request.content,
        trigger: { type: 'date', value: Number(trigger.date), channelId: trigger.channelId } } as Request);
      registerAlarm(identifier);
      return identifier;
    });
    jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async id => {
      pending = pending.filter(r => r.identifier !== id);
      alarms.delete(id);
    });
    const accepted = await verifyPrayerSchedule(city, prefs);
    expect(accepted.alerts).toHaveLength(149);
    const armed = new Set(alarms);
    resetSyncStateForTests();
    unavailable = true;
    schedule.mockClear();
    expect(await syncPrayerNotifications(city, prefs)).toBe(false);
    expect(schedule).toHaveBeenCalled();
    expect(alarms).toEqual(armed);
    expect(await readPrayerEvidence(city, prefs)).toMatchObject({ pending: 'unknown', alerts: [] });
    unavailable = false;
    expect((await verifyPrayerSchedule(city, prefs)).alerts).toHaveLength(149);
    expect(alarms.size).toBe(149);
  } finally { Object.defineProperty(Platform, 'OS', { configurable: true, value: original }); }
});
