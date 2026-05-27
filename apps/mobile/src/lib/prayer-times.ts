// Bridges PrayerSettings (our serialisable shape) onto adhan's CalculationParameters
// and computes the day's prayer times. Kept UI-free so any screen can call it.
import {
  type CalculationParameters,
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Rounding,
  Shafaq,
} from 'adhan';

import type {
  CalculationMethodKey,
  HighLatitudeRuleKey,
  PolarCircleResolutionKey,
  PrayerSettings,
} from './settings/types';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Each preset key → its adhan factory. Drives both compute and the settings UI. */
const METHOD_FACTORY: Record<CalculationMethodKey, () => CalculationParameters> = {
  MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
  Egyptian: CalculationMethod.Egyptian,
  Karachi: CalculationMethod.Karachi,
  UmmAlQura: CalculationMethod.UmmAlQura,
  Dubai: CalculationMethod.Dubai,
  Qatar: CalculationMethod.Qatar,
  Kuwait: CalculationMethod.Kuwait,
  MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
  Singapore: CalculationMethod.Singapore,
  Turkey: CalculationMethod.Turkey,
  Tehran: CalculationMethod.Tehran,
  NorthAmerica: CalculationMethod.NorthAmerica,
  Other: CalculationMethod.Other,
};

const HIGH_LAT_RULE: Record<
  Exclude<HighLatitudeRuleKey, 'auto'>,
  (typeof HighLatitudeRule)[keyof typeof HighLatitudeRule]
> = {
  middleOfTheNight: HighLatitudeRule.MiddleOfTheNight,
  seventhOfTheNight: HighLatitudeRule.SeventhOfTheNight,
  twilightAngle: HighLatitudeRule.TwilightAngle,
};

const POLAR_RESOLUTION: Record<
  PolarCircleResolutionKey,
  (typeof PolarCircleResolution)[keyof typeof PolarCircleResolution]
> = {
  aqrabBalad: PolarCircleResolution.AqrabBalad,
  aqrabYaum: PolarCircleResolution.AqrabYaum,
  unresolved: PolarCircleResolution.Unresolved,
};

const ROUNDING = {
  nearest: Rounding.Nearest,
  up: Rounding.Up,
  none: Rounding.None,
} as const;

const SHAFAQ = {
  general: Shafaq.General,
  ahmer: Shafaq.Ahmer,
  abyad: Shafaq.Abyad,
} as const;

/** Translate settings into a configured adhan CalculationParameters for `coords`. */
export function buildParams(settings: PrayerSettings, coords: Coordinates): CalculationParameters {
  const params = METHOD_FACTORY[settings.calculationMethod]();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  // 'auto' defers to adhan's latitude-aware recommendation; otherwise honour the
  // explicit choice. recommended() needs the coordinate, hence resolved here.
  params.highLatitudeRule =
    settings.highLatitudeRule === 'auto'
      ? HighLatitudeRule.recommended(coords)
      : HIGH_LAT_RULE[settings.highLatitudeRule];
  params.polarCircleResolution = POLAR_RESOLUTION[settings.polarCircleResolution];
  params.shafaq = SHAFAQ[settings.shafaq];
  params.adjustments = { ...params.adjustments, ...settings.adjustments };
  params.rounding = ROUNDING[settings.rounding];
  return params;
}

export function computePrayerTimes(
  coords: LatLng,
  date: Date,
  settings: PrayerSettings,
): PrayerTimes {
  const c = new Coordinates(coords.latitude, coords.longitude);
  return new PrayerTimes(c, date, buildParams(settings, c));
}

/** The six daily prayers plus sunrise, in chronological order, with Swedish labels. */
export const PRAYER_ORDER = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
] as const;
export type PrayerKey = (typeof PRAYER_ORDER)[number];

export const PRAYER_LABELS: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  sunrise: 'Soluppgång',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

// adhan's Prayer enum values are plain strings ('fajr' | … | 'none'); map the
// current/next-prayer result onto our key, returning null for 'none'.
export function prayerToKey(prayer: string): PrayerKey | null {
  return (PRAYER_ORDER as readonly string[]).includes(prayer) ? (prayer as PrayerKey) : null;
}

// Swedish locations all sit in Europe/Stockholm; formatting there (rather than the
// device zone) keeps times correct even on an emulator pinned to another zone.
const TIME_ZONE = 'Europe/Stockholm';

/**
 * Format a prayer-time Date for display, in 24-hour Europe/Stockholm time (Sweden
 * uses the 24-hour clock exclusively). Returns '—' for slots adhan could not
 * compute (Invalid Date), which happens above the Arctic Circle when polar
 * resolution is 'unresolved'.
 */
export function formatTime(date: Date | null | undefined): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    // Hermes without full Intl tz data: fall back to a fixed Swedish offset.
    return fallbackFormat(date);
  }
}

// Crude fixed-offset fallback (CET/CEST by month) — only used if Intl timeZone
// support is missing. Good enough to never show a raw UTC string to the user.
function fallbackFormat(date: Date): string {
  const month = date.getUTCMonth(); // 0-indexed
  const isSummer = month >= 2 && month <= 9; // rough DST window (Apr–Oct-ish)
  const offsetHours = isSummer ? 2 : 1;
  const shifted = new Date(date.getTime() + offsetHours * 3600_000);
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
