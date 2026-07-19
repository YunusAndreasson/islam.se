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

  it('migrates legacy stock map styles to Nordic so label policy cannot be bypassed', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ mapStyle: 'satellite' }));
    expect((await loadSettings()).mapStyle).toBe('nordic');
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
    expect(loaded.notifications.leadMinutes).toBe(NOTIFICATION_LEAD_MIN);

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
    expect(reloaded.notifications.leadMinutes).toBe(NOTIFICATION_LEAD_MAX);
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
        mapStyle: 'missing',
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
    expect(loaded.notifications.leadMinutes).toBe(DEFAULT_SETTINGS.notifications.leadMinutes);
    expect(loaded.notifications.prayers.fajr).toBe(false);
    expect(loaded.notifications.prayers.dhuhr).toBe(DEFAULT_SETTINGS.notifications.prayers.dhuhr);
    expect(loaded.locationMode).toBe('manual');
    expect(loaded.manualLocation).toBe(DEFAULT_SETTINGS.manualLocation);
    expect(loaded.theme).toBe('dark');
    expect(loaded.mapStyle).toBe(DEFAULT_SETTINGS.mapStyle);
    expect(loaded.haptics).toBe(false);
  });
});
