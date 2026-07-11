// Persistence for PrayerSettings. Settings are a small JSON blob, so a single
// AsyncStorage key is enough — no need for a heavier store.
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_SETTINGS,
  HIJRI_OFFSET_MAX,
  HIJRI_OFFSET_MIN,
  NOTIFICATION_LEAD_MAX,
  NOTIFICATION_LEAD_MIN,
  PRAYER_ADJUSTMENT_MAX,
  PRAYER_ADJUSTMENT_MIN,
  type CalculationMethodKey,
  type HighLatitudeRuleKey,
  type LocationMode,
  type Madhab,
  type MapStyleId,
  type PolarCircleResolutionKey,
  type PrayerAdjustments,
  type PrayerSettings,
  type Rounding,
  type Shafaq,
  type ThemePreference,
} from './types';

// Bump the version suffix if the shape changes incompatibly; loadSettings merges
// over defaults so additive changes need no migration.
const STORAGE_KEY = 'prayerSettings:v1';

const CALCULATION_METHODS = [
  'MuslimWorldLeague',
  'Egyptian',
  'Karachi',
  'UmmAlQura',
  'Dubai',
  'Qatar',
  'Kuwait',
  'MoonsightingCommittee',
  'Singapore',
  'Turkey',
  'Tehran',
  'NorthAmerica',
  'Other',
] as const satisfies readonly CalculationMethodKey[];
const MADHABS = ['shafi', 'hanafi'] as const satisfies readonly Madhab[];
const HIGH_LAT_RULES = [
  'auto',
  'middleOfTheNight',
  'seventhOfTheNight',
  'twilightAngle',
] as const satisfies readonly HighLatitudeRuleKey[];
const POLAR_RESOLUTIONS = ['aqrabBalad', 'aqrabYaum', 'unresolved'] as const satisfies readonly PolarCircleResolutionKey[];
const SHAFAQS = ['general', 'ahmer', 'abyad'] as const satisfies readonly Shafaq[];
const ROUNDINGS = ['nearest', 'up', 'none'] as const satisfies readonly Rounding[];
const LOCATION_MODES = ['gps', 'manual'] as const satisfies readonly LocationMode[];
const THEMES = ['system', 'light', 'dark'] as const satisfies readonly ThemePreference[];
const MAP_STYLES = ['nordic', 'standard', 'satellite'] as const satisfies readonly MapStyleId[];
const ADJUSTMENT_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumberValue(value: unknown, fallback: number, min: number, max: number): number {
  const n = numberValue(value, fallback);
  return Math.max(min, Math.min(max, n));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function validLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90;
}

function validLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180;
}

function sanitizeAdjustments(value: unknown): PrayerAdjustments {
  const raw = isRecord(value) ? value : {};
  const out = { ...DEFAULT_SETTINGS.adjustments };
  for (const key of ADJUSTMENT_KEYS) {
    out[key] = boundedNumberValue(
      raw[key],
      DEFAULT_SETTINGS.adjustments[key],
      PRAYER_ADJUSTMENT_MIN,
      PRAYER_ADJUSTMENT_MAX,
    );
  }
  return out;
}

function sanitizeSettings(parsed: unknown): PrayerSettings {
  const raw = isRecord(parsed) ? parsed : {};
  const rawNotifications = isRecord(raw.notifications) ? raw.notifications : {};
  const rawPrayers = isRecord(rawNotifications.prayers) ? rawNotifications.prayers : {};
  const rawManualLocation = isRecord(raw.manualLocation) ? raw.manualLocation : null;

  return {
    calculationMethod: enumValue(raw.calculationMethod, CALCULATION_METHODS, DEFAULT_SETTINGS.calculationMethod),
    madhab: enumValue(raw.madhab, MADHABS, DEFAULT_SETTINGS.madhab),
    highLatitudeRule: enumValue(raw.highLatitudeRule, HIGH_LAT_RULES, DEFAULT_SETTINGS.highLatitudeRule),
    polarCircleResolution: enumValue(raw.polarCircleResolution, POLAR_RESOLUTIONS, DEFAULT_SETTINGS.polarCircleResolution),
    shafaq: enumValue(raw.shafaq, SHAFAQS, DEFAULT_SETTINGS.shafaq),
    adjustments: sanitizeAdjustments(raw.adjustments),
    rounding: enumValue(raw.rounding, ROUNDINGS, DEFAULT_SETTINGS.rounding),
    hijriOffset: boundedNumberValue(
      raw.hijriOffset,
      DEFAULT_SETTINGS.hijriOffset,
      HIJRI_OFFSET_MIN,
      HIJRI_OFFSET_MAX,
    ),
    notifications: {
      enabled: booleanValue(rawNotifications.enabled, DEFAULT_SETTINGS.notifications.enabled),
      leadMinutes: boundedNumberValue(
        rawNotifications.leadMinutes,
        DEFAULT_SETTINGS.notifications.leadMinutes,
        NOTIFICATION_LEAD_MIN,
        NOTIFICATION_LEAD_MAX,
      ),
      prayers: {
        fajr: booleanValue(rawPrayers.fajr, DEFAULT_SETTINGS.notifications.prayers.fajr),
        dhuhr: booleanValue(rawPrayers.dhuhr, DEFAULT_SETTINGS.notifications.prayers.dhuhr),
        asr: booleanValue(rawPrayers.asr, DEFAULT_SETTINGS.notifications.prayers.asr),
        maghrib: booleanValue(rawPrayers.maghrib, DEFAULT_SETTINGS.notifications.prayers.maghrib),
        isha: booleanValue(rawPrayers.isha, DEFAULT_SETTINGS.notifications.prayers.isha),
      },
    },
    locationMode: enumValue(raw.locationMode, LOCATION_MODES, DEFAULT_SETTINGS.locationMode),
    manualLocation:
      rawManualLocation &&
      typeof rawManualLocation.name === 'string' &&
      validLatitude(rawManualLocation.latitude) &&
      validLongitude(rawManualLocation.longitude)
        ? {
            name: rawManualLocation.name,
            latitude: rawManualLocation.latitude,
            longitude: rawManualLocation.longitude,
          }
        : DEFAULT_SETTINGS.manualLocation,
    theme: enumValue(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    mapStyle: enumValue(raw.mapStyle, MAP_STYLES, DEFAULT_SETTINGS.mapStyle),
    showMosques: booleanValue(raw.showMosques, DEFAULT_SETTINGS.showMosques),
    haptics: booleanValue(raw.haptics, DEFAULT_SETTINGS.haptics),
  };
}

/**
 * Read persisted settings, merging over DEFAULT_SETTINGS so fields added in a
 * later app version still get a value. Missing or corrupt data falls back to
 * defaults rather than throwing — a bad blob must never brick the settings tab.
 */
export async function loadSettings(): Promise<PrayerSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: PrayerSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
