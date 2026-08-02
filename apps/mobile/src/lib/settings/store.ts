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
  type NotificationSoundKey,
  type PerPrayerSlot,
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
// The six computed slots. Shared by all three per-slot records (adjustments, notification
// lead, notification sound) — they are keyed identically by construction (PerPrayerSlot).
const PRAYER_SLOT_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
const NOTIFICATION_SOUNDS = [
  'default',
  'silent',
  'adhan',
] as const satisfies readonly NotificationSoundKey[];

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
  for (const key of PRAYER_SLOT_KEYS) {
    out[key] = boundedNumberValue(
      raw[key],
      DEFAULT_SETTINGS.adjustments[key],
      PRAYER_ADJUSTMENT_MIN,
      PRAYER_ADJUSTMENT_MAX,
    );
  }
  return out;
}

/**
 * Per-slot heads-up minutes, carrying the ONE migration this shape needs.
 *
 * Before per-prayer lead times the blob held a single scalar
 * `notifications.leadMinutes` that applied to all five prayers. Seed every PRAYER key
 * from it so an upgrading user keeps the heads-up they chose. The `sunrise` key did not
 * exist then, so it takes the app default instead — that alert is off by default anyway,
 * and inheriting someone's 30-minute prayer lead as the Fajr-window warning would be a
 * guess, not a migration.
 *
 * A partial new-shape `lead` object still falls back to the legacy seed per key, so a
 * half-written blob cannot strand one prayer on 0 while the others keep their value.
 */
function sanitizeNotificationLead(value: unknown, legacyScalar: unknown): PerPrayerSlot<number> {
  const raw = isRecord(value) ? value : {};
  const seed = boundedNumberValue(
    legacyScalar,
    DEFAULT_SETTINGS.notifications.lead.fajr,
    NOTIFICATION_LEAD_MIN,
    NOTIFICATION_LEAD_MAX,
  );
  const out = { ...DEFAULT_SETTINGS.notifications.lead };
  for (const key of PRAYER_SLOT_KEYS) {
    const fallback = key === 'sunrise' ? DEFAULT_SETTINGS.notifications.lead.sunrise : seed;
    out[key] = boundedNumberValue(raw[key], fallback, NOTIFICATION_LEAD_MIN, NOTIFICATION_LEAD_MAX);
  }
  return out;
}

/**
 * Per-slot sound choice. An UNAVAILABLE key ('adhan' in a build with no bundled audio)
 * is preserved on purpose: availability is resolved at scheduling time in
 * ../notifications.ts, not here, so re-installing a build that HAS the file restores the
 * user's choice rather than having silently rewritten it to 'default'.
 */
function sanitizeNotificationSounds(value: unknown): PerPrayerSlot<NotificationSoundKey> {
  const raw = isRecord(value) ? value : {};
  const out = { ...DEFAULT_SETTINGS.notifications.sound };
  for (const key of PRAYER_SLOT_KEYS) {
    out[key] = enumValue(raw[key], NOTIFICATION_SOUNDS, DEFAULT_SETTINGS.notifications.sound[key]);
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
      fajrWindowEnd: booleanValue(
        rawNotifications.fajrWindowEnd,
        DEFAULT_SETTINGS.notifications.fajrWindowEnd,
      ),
      // The legacy scalar is read but never written back, so it evaporates on the first
      // load-then-save cycle. No storage-key bump needed.
      lead: sanitizeNotificationLead(rawNotifications.lead, rawNotifications.leadMinutes),
      sound: sanitizeNotificationSounds(rawNotifications.sound),
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
    showMosques: booleanValue(raw.showMosques, DEFAULT_SETTINGS.showMosques),
    showQibla: booleanValue(raw.showQibla, DEFAULT_SETTINGS.showQibla),
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
