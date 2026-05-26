// User-tunable prayer-time settings and their defaults. These map onto adhan's
// CalculationParameters (see ../prayer-times.ts) but stay framework-agnostic so
// they can be JSON-serialised straight into AsyncStorage (see ./store.ts).

/** The 13 adhan calculation-method presets, keyed by their CalculationMethod factory name. */
export type CalculationMethodKey =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'Qatar'
  | 'Kuwait'
  | 'MoonsightingCommittee'
  | 'Singapore'
  | 'Turkey'
  | 'Tehran'
  | 'NorthAmerica'
  | 'Other';

export type Madhab = 'shafi' | 'hanafi';

/** 'auto' resolves to adhan's HighLatitudeRule.recommended(coords) at compute time. */
export type HighLatitudeRuleKey =
  | 'auto'
  | 'middleOfTheNight'
  | 'seventhOfTheNight'
  | 'twilightAngle';

export type PolarCircleResolutionKey = 'aqrabBalad' | 'aqrabYaum' | 'unresolved';

/** Only meaningful for the MoonsightingCommittee method. */
export type Shafaq = 'general' | 'ahmer' | 'abyad';

export type Rounding = 'nearest' | 'up' | 'none';

export type TimeFormat = '24h' | '12h';

/** The six computed prayer slots plus sunrise, used as adjustment keys. */
export interface PrayerAdjustments {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

export interface NamedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export type LocationMode = 'gps' | 'manual';

/** Local prayer-time alerts. Off by default — turning it on triggers the OS
    permission prompt. Per-prayer toggles cover the five obligatory prayers. */
export interface NotificationSettings {
  enabled: boolean;
  /** Minutes before the prayer time to fire the alert (0 = exactly at the time).
      A heads-up so you can leave for the mosque before the adhan. */
  leadMinutes: number;
  prayers: {
    fajr: boolean;
    dhuhr: boolean;
    asr: boolean;
    maghrib: boolean;
    isha: boolean;
  };
}

export interface PrayerSettings {
  calculationMethod: CalculationMethodKey;
  madhab: Madhab;
  highLatitudeRule: HighLatitudeRuleKey;
  polarCircleResolution: PolarCircleResolutionKey;
  shafaq: Shafaq;
  adjustments: PrayerAdjustments;
  rounding: Rounding;
  timeFormat: TimeFormat;
  /** Day offset applied to the Hijri-date display, to match local moon-sighting. */
  hijriOffset: number;
  notifications: NotificationSettings;
  locationMode: LocationMode;
  /** Chosen city/coordinate when locationMode is 'manual'. */
  manualLocation: NamedLocation | null;
}

export const DEFAULT_SETTINGS: PrayerSettings = {
  calculationMethod: 'MuslimWorldLeague',
  madhab: 'shafi',
  // 'auto' (recommended) picks SeventhOfTheNight for most of Sweden — the right
  // default at these latitudes rather than the library's bare MiddleOfTheNight.
  highLatitudeRule: 'auto',
  // AqrabBalad keeps Fajr/Isha derivable north of the Arctic Circle (e.g. Kiruna
  // under the midnight sun), where 'unresolved' would return Invalid Date.
  polarCircleResolution: 'aqrabBalad',
  shafaq: 'general',
  adjustments: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  rounding: 'nearest',
  timeFormat: '24h',
  hijriOffset: 0,
  // Off by default: enabling it is what asks the OS for permission.
  notifications: {
    enabled: false,
    leadMinutes: 0,
    prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  },
  locationMode: 'gps',
  manualLocation: null,
};

/** Fallback coordinate when GPS is unavailable and no manual location is set. */
export const DEFAULT_COORDS: NamedLocation = {
  name: 'Stockholm',
  latitude: 59.3293,
  longitude: 18.0686,
};

/** Manual-mode picker list. Kiruna is included to exercise polar-circle handling. */
export const SWEDISH_CITIES: readonly NamedLocation[] = [
  { name: 'Stockholm', latitude: 59.3293, longitude: 18.0686 },
  { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 },
  { name: 'Malmö', latitude: 55.605, longitude: 13.0038 },
  { name: 'Uppsala', latitude: 59.8586, longitude: 17.6389 },
  { name: 'Umeå', latitude: 63.8258, longitude: 20.263 },
  { name: 'Luleå', latitude: 65.5848, longitude: 22.1547 },
  { name: 'Kiruna', latitude: 67.8558, longitude: 20.2253 },
] as const;
