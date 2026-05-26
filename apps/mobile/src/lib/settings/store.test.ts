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
    const custom = { ...DEFAULT_SETTINGS, madhab: 'hanafi' as const, timeFormat: '12h' as const };
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
});
