import { describe, expect, it } from '@jest/globals';

import { setAllPrayerLeads, setAllSounds } from '@/lib/settings/options';
import { DEFAULT_SETTINGS, type NotificationSettings } from '@/lib/settings/types';

import {
  isoDay,
  notificationSettingChanges,
  remindersState,
  superPropertiesFor,
  usesAdhan,
} from './properties';

const base: NotificationSettings = DEFAULT_SETTINGS.notifications;
const on = (patch: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...base,
  enabled: true,
  ...patch,
});

describe('remindersState', () => {
  it('is on only when the switch is on AND the OS lets the reminders through', () => {
    // The switch turns on whatever the OS answers (lib/notifications-permission), so the
    // setting alone overstates who can be reached: a refusal is 'blocked', not 'on'.
    expect(remindersState(false, 'granted')).toBe('off');
    expect(remindersState(true, 'granted')).toBe('on');
    expect(remindersState(true, 'denied')).toBe('blocked');
    expect(remindersState(true, 'undetermined')).toBe('blocked');
    expect(remindersState(true, 'unknown')).toBe('blocked');
  });
});

describe('usesAdhan', () => {
  it('is false in a build that cannot play the adhan, whatever was chosen', () => {
    expect(usesAdhan(on({ sound: { ...base.sound, fajr: 'adhan' } }), false)).toBe(false);
  });

  it('counts only reminders that will fire', () => {
    const fajrAdhan = { ...base.sound, fajr: 'adhan' as const };
    expect(usesAdhan(on({ sound: fajrAdhan }), true)).toBe(true);
    // The master switch off: no reminder plays anything.
    expect(usesAdhan({ ...base, sound: fajrAdhan }, true)).toBe(false);
    // Fajr's own reminder off.
    expect(usesAdhan(on({ sound: fajrAdhan, prayers: { ...base.prayers, fajr: false } }), true)).toBe(false);
    // The sunrise marker's sound counts only with the marker on.
    const sunriseAdhan = { ...base.sound, sunrise: 'adhan' as const };
    expect(usesAdhan(on({ sound: sunriseAdhan }), true)).toBe(false);
    expect(usesAdhan(on({ sound: sunriseAdhan, fajrWindowEnd: true }), true)).toBe(true);
    // The night's last third has its own scalar sound.
    expect(usesAdhan(on({ lastThirdSound: 'adhan' }), true)).toBe(false);
    expect(usesAdhan(on({ lastThird: true, lastThirdSound: 'adhan' }), true)).toBe(true);
  });
});

describe('superPropertiesFor', () => {
  it('describes the setup in coarse states only: flags, a count and how the location is set', () => {
    const props = superPropertiesFor({
      notifications: on({ fajrWindowEnd: true }),
      permission: 'granted',
      locationSource: 'manual',
      introHistory: 'skipped',
      adhanPlayable: false,
    });
    expect(props).toEqual({
      notifications_enabled: true,
      reminders_per_day: 6,
      adhan_sound: false,
      location_source: 'manual',
      intro_status: 'skipped',
    });
    // The owner's line: the place, the calculation method and the madhab never leave the
    // device. Every value is a primitive, so a settings object cannot ride along whole.
    for (const value of Object.values(props)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value);
    }
  });

  it('reports no reminders per day while the switch is off, and leaves intro_status out until it is known', () => {
    const props = superPropertiesFor({
      notifications: base,
      permission: 'undetermined',
      locationSource: 'default',
      introHistory: null,
      adhanPlayable: true,
    });
    expect(props).toEqual({
      notifications_enabled: false,
      reminders_per_day: 0,
      adhan_sound: false,
      location_source: 'default',
    });
  });
});

describe('isoDay', () => {
  it("is the device's own calendar day, so a just-after-midnight install is not dated the day before", () => {
    // The suite runs in Europe/Stockholm (jest.global-setup.js): 00:30 local is 23:30 UTC.
    expect(isoDay(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
    expect(isoDay(new Date(2026, 10, 21, 23, 59))).toBe('2026-11-21');
  });
});

describe('notificationSettingChanges', () => {
  it('names one per-prayer change by its slot, with the new value only', () => {
    expect(notificationSettingChanges(base, { ...base, prayers: { ...base.prayers, asr: false } })).toEqual([
      { setting: 'prayer', prayer: 'asr', value: false },
    ]);
    expect(notificationSettingChanges(base, { ...base, lead: { ...base.lead, fajr: 20 } })).toEqual([
      { setting: 'lead', prayer: 'fajr', value: 20 },
    ]);
    expect(notificationSettingChanges(base, { ...base, sound: { ...base.sound, isha: 'silent' } })).toEqual([
      { setting: 'sound', prayer: 'isha', value: 'silent' },
    ]);
  });

  it('reports a "Gäller alla" control as one change for all, not five', () => {
    expect(notificationSettingChanges(base, { ...base, lead: setAllPrayerLeads(base.lead, 10) })).toEqual([
      { setting: 'lead', prayer: 'all', value: 10 },
    ]);
    expect(notificationSettingChanges(base, { ...base, sound: setAllSounds(base.sound, 'silent') })).toEqual([
      { setting: 'sound', prayer: 'all', value: 'silent' },
    ]);
  });

  it('names the two markers by the slot their alert carries, and alarm-clock delivery by none', () => {
    expect(notificationSettingChanges(base, { ...base, fajrWindowEnd: true })).toEqual([
      { setting: 'fajr_window_end', prayer: 'sunrise', value: true },
    ]);
    expect(notificationSettingChanges(base, { ...base, lastThird: true, lastThirdSound: 'silent' })).toEqual([
      { setting: 'last_third', prayer: 'lastThird', value: true },
      { setting: 'last_third_sound', prayer: 'lastThird', value: 'silent' },
    ]);
    expect(notificationSettingChanges(base, { ...base, alarmClock: true })).toEqual([
      { setting: 'alarm_clock', value: true },
    ]);
  });

  it('is empty when nothing changed, and leaves the master switch to Reminders Toggled', () => {
    expect(notificationSettingChanges(base, { ...base })).toEqual([]);
    expect(notificationSettingChanges(base, { ...base, enabled: true })).toEqual([]);
  });
});
