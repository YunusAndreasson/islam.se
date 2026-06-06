// The independent reference for the prayer-time B-layer tests.
//
// It invokes adhan DIRECTLY with parameters written out by hand from the documented
// DEFAULT_SETTINGS — and deliberately never calls buildParams (the unit under test).
// So if the app mis-wires a setting (swaps the madhab, drops the high-latitude rule,
// maps a method to the wrong preset), the app's times diverge from this reference and
// the test fails. The expected value comes from the library + the spec, never from
// running the app and pasting back what it produced. `overrides` cover the single
// setting a given test varies.
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

import type { LatLng } from '../lib/prayer-times';

export interface OracleOverrides {
  method?: () => CalculationParameters;
  // Madhab is an enum-like value object, so its value type is indexed (cf. the
  // HIGH_LAT_RULE typing in prayer-times.ts), not the bare `Madhab`.
  madhab?: (typeof Madhab)[keyof typeof Madhab];
}

export function oracleTimes(
  coords: LatLng,
  date: Date,
  overrides: OracleOverrides = {},
): PrayerTimes {
  const c = new Coordinates(coords.latitude, coords.longitude);
  const params = (overrides.method ?? CalculationMethod.Turkey)();
  params.madhab = overrides.madhab ?? Madhab.Shafi; // DEFAULT_SETTINGS.madhab = 'shafi'
  params.highLatitudeRule = HighLatitudeRule.recommended(c); // DEFAULT_SETTINGS uses 'auto'
  params.polarCircleResolution = PolarCircleResolution.AqrabBalad;
  params.shafaq = Shafaq.General;
  params.rounding = Rounding.Nearest;
  params.adjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  return new PrayerTimes(c, date, params);
}
