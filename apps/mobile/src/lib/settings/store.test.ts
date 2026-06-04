import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadSettings, saveSettings } from './store';
import { DEFAULT_SETTINGS } from './types';

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

  it('deep-merges a partial adjustments object', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ adjustments: { fajr: 7 } }));
    const loaded = await loadSettings();
    expect(loaded.adjustments.fajr).toBe(7);
    expect(loaded.adjustments.isha).toBe(0); // default preserved
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
