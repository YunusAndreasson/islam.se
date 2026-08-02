import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadSettings, saveSettings } from './store';
import {
  DEFAULT_SETTINGS,
  HIJRI_OFFSET_MAX,
  HIJRI_OFFSET_MIN,
  NOTIFICATION_LEAD_MAX,
  NOTIFICATION_LEAD_MIN,
  PRAYER_ADJUSTMENT_MAX,
  PRAYER_ADJUSTMENT_MIN,
} from './types';

const STORAGE_KEY = 'prayerSettings:v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('settings store', () => {
  it('returns defaults when nothing is persisted', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved settings', async () => {
    const custom = { ...DEFAULT_SETTINGS, madhab: 'hanafi' as const, rounding: 'up' as const };
    await saveSettings(custom);
    expect(await loadSettings()).toEqual(custom);
  });

  it('merges over defaults so fields absent from an older blob are filled', async () => {
    // Simulate a blob written by an earlier version missing several keys.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ calculationMethod: 'Egyptian' }));
    const loaded = await loadSettings();
    expect(loaded.calculationMethod).toBe('Egyptian');
    expect(loaded.madhab).toBe(DEFAULT_SETTINGS.madhab);
    // Nested adjustments must be fully populated even if the blob omitted them.
    expect(loaded.adjustments).toEqual(DEFAULT_SETTINGS.adjustments);
  });

  it('preserves a valid persisted method instead of migrating it to the new default', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ calculationMethod: 'MuslimWorldLeague' }));
    const loaded = await loadSettings();
    expect(loaded.calculationMethod).toBe('MuslimWorldLeague');
  });

  it('deep-merges a partial adjustments object', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ adjustments: { fajr: 7 } }));
    const loaded = await loadSettings();
    expect(loaded.adjustments.fajr).toBe(7);
    expect(loaded.adjustments.isha).toBe(0); // default preserved
  });

  it('clamps persisted finite numeric settings to the UI-supported ranges', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        adjustments: {
          fajr: PRAYER_ADJUSTMENT_MAX + 1,
          sunrise: PRAYER_ADJUSTMENT_MIN - 1,
          dhuhr: 12,
        },
        hijriOffset: HIJRI_OFFSET_MAX + 10,
        notifications: {
          leadMinutes: NOTIFICATION_LEAD_MIN - 5,
        },
      }),
    );

    const loaded = await loadSettings();
    expect(loaded.adjustments.fajr).toBe(PRAYER_ADJUSTMENT_MAX);
    expect(loaded.adjustments.sunrise).toBe(PRAYER_ADJUSTMENT_MIN);
    expect(loaded.adjustments.dhuhr).toBe(12);
    expect(loaded.hijriOffset).toBe(HIJRI_OFFSET_MAX);
    expect(loaded.notifications.lead.fajr).toBe(NOTIFICATION_LEAD_MIN);

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hijriOffset: HIJRI_OFFSET_MIN - 10,
        notifications: {
          leadMinutes: NOTIFICATION_LEAD_MAX + 5,
        },
      }),
    );

    const reloaded = await loadSettings();
    expect(reloaded.hijriOffset).toBe(HIJRI_OFFSET_MIN);
    expect(reloaded.notifications.lead.fajr).toBe(NOTIFICATION_LEAD_MAX);
  });

  it('falls back to defaults on a corrupt blob rather than throwing', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitizes malformed persisted values field-by-field', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        calculationMethod: 'Bogus',
        madhab: 'hanafi',
        highLatitudeRule: 'wrong',
        rounding: 'up',
        adjustments: { fajr: 7, isha: 'late' },
        notifications: {
          enabled: true,
          leadMinutes: 'soon',
          prayers: { fajr: false, dhuhr: 'yes' },
        },
        locationMode: 'manual',
        manualLocation: { name: 'Nowhere', latitude: 999, longitude: 18 },
        theme: 'dark',
        haptics: false,
      }),
    );

    const loaded = await loadSettings();
    expect(loaded.calculationMethod).toBe(DEFAULT_SETTINGS.calculationMethod);
    expect(loaded.madhab).toBe('hanafi');
    expect(loaded.highLatitudeRule).toBe(DEFAULT_SETTINGS.highLatitudeRule);
    expect(loaded.rounding).toBe('up');
    expect(loaded.adjustments.fajr).toBe(7);
    expect(loaded.adjustments.isha).toBe(DEFAULT_SETTINGS.adjustments.isha);
    expect(loaded.notifications.enabled).toBe(true);
    expect(loaded.notifications.lead.fajr).toBe(DEFAULT_SETTINGS.notifications.lead.fajr);
    expect(loaded.notifications.prayers.fajr).toBe(false);
    expect(loaded.notifications.prayers.dhuhr).toBe(DEFAULT_SETTINGS.notifications.prayers.dhuhr);
    expect(loaded.locationMode).toBe('manual');
    expect(loaded.manualLocation).toBe(DEFAULT_SETTINGS.manualLocation);
    expect(loaded.theme).toBe('dark');
    expect(loaded.haptics).toBe(false);
  });
});

// Per-prayer lead times and sounds replaced a single scalar `notifications.leadMinutes`.
// The blob on an upgrading user's device still carries that scalar, so the sanitizer has
// to seed the new record from it — otherwise everyone who had set a heads-up silently
// loses it on the update, which for this app means alerts arriving later than they chose.
describe('notification lead + sound migration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('seeds every prayer from the retired scalar leadMinutes', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { enabled: true, leadMinutes: 20 } }),
    );

    const loaded = await loadSettings();
    expect(loaded.notifications.lead.fajr).toBe(20);
    expect(loaded.notifications.lead.isha).toBe(20);
    // Sunrise did not exist as an alert then, so inheriting someone's prayer lead for it
    // would be a guess, not a migration — it takes the app default instead.
    expect(loaded.notifications.lead.sunrise).toBe(DEFAULT_SETTINGS.notifications.lead.sunrise);
  });

  it('drops the legacy key once the migrated shape is written back', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { enabled: true, leadMinutes: 20 } }),
    );
    await saveSettings(await loadSettings());

    const raw = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect('leadMinutes' in raw.notifications).toBe(false);
    expect(raw.notifications.lead.fajr).toBe(20);
  });

  it('lets an explicit per-prayer lead win while the scalar still fills the gaps', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { enabled: true, leadMinutes: 20, lead: { fajr: 5 } } }),
    );

    const loaded = await loadSettings();
    expect(loaded.notifications.lead.fajr).toBe(5);
    // A half-written blob must not strand the other prayers on 0.
    expect(loaded.notifications.lead.dhuhr).toBe(20);
  });

  it('clamps each per-prayer lead into the range the UI offers', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        notifications: {
          lead: { fajr: NOTIFICATION_LEAD_MAX + 5, isha: NOTIFICATION_LEAD_MIN - 5, asr: 'soon' },
        },
      }),
    );

    const loaded = await loadSettings();
    expect(loaded.notifications.lead.fajr).toBe(NOTIFICATION_LEAD_MAX);
    expect(loaded.notifications.lead.isha).toBe(NOTIFICATION_LEAD_MIN);
    expect(loaded.notifications.lead.asr).toBe(DEFAULT_SETTINGS.notifications.lead.asr);
  });

  it('falls back wholesale when lead or sound is not an object at all', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { lead: 'nope', sound: 42 } }),
    );

    const loaded = await loadSettings();
    expect(loaded.notifications.lead).toEqual(DEFAULT_SETTINGS.notifications.lead);
    expect(loaded.notifications.sound).toEqual(DEFAULT_SETTINGS.notifications.sound);
  });

  it('rejects an unknown sound but keeps a valid sibling', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { sound: { fajr: 'trumpet', asr: 'silent' } } }),
    );

    const loaded = await loadSettings();
    expect(loaded.notifications.sound.fajr).toBe(DEFAULT_SETTINGS.notifications.sound.fajr);
    expect(loaded.notifications.sound.asr).toBe('silent');
  });

  // Availability is resolved when the alert is SCHEDULED, never at load time, so
  // reinstalling a build that bundles the audio restores the choice rather than having
  // silently rewritten it to 'default' behind the user's back.
  it('preserves a sound this build cannot play', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { sound: { isha: 'adhan' } } }),
    );

    expect((await loadSettings()).notifications.sound.isha).toBe('adhan');
  });

  it('defaults the Fajr-window alert to off and accepts a persisted true', async () => {
    expect(DEFAULT_SETTINGS.notifications.fajrWindowEnd).toBe(false);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notifications: { fajrWindowEnd: true } }),
    );
    expect((await loadSettings()).notifications.fajrWindowEnd).toBe(true);
  });
});
