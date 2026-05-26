// Persistence for PrayerSettings. Settings are a small JSON blob, so a single
// AsyncStorage key is enough — no need for a heavier store.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_SETTINGS, type PrayerSettings } from './types';

// Bump the version suffix if the shape changes incompatibly; loadSettings merges
// over defaults so additive changes need no migration.
const STORAGE_KEY = 'prayerSettings:v1';

/**
 * Read persisted settings, merging over DEFAULT_SETTINGS so fields added in a
 * later app version still get a value. Missing or corrupt data falls back to
 * defaults rather than throwing — a bad blob must never brick the settings tab.
 */
export async function loadSettings(): Promise<PrayerSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PrayerSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // adjustments is nested, so a shallow spread would drop default keys when
      // an older/partial blob only carried some of them — merge it explicitly.
      adjustments: { ...DEFAULT_SETTINGS.adjustments, ...(parsed.adjustments ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PrayerSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
