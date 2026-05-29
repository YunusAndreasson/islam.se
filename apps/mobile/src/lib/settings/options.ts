// The selectable options for every prayer-time setting, plus small helpers that
// reverse-look-up the *current* value's label for a collapsed group's summary line.
// Extracted from the settings screen so the screen file stays thin and either an
// inline control or (later) a sub-screen can share one source of truth.
import type { Option } from '@/components/settings/OptionGroup';

import type {
  CalculationMethodKey,
  HighLatitudeRuleKey,
  Madhab,
  PolarCircleResolutionKey,
  PrayerSettings,
  Rounding,
  Shafaq,
} from './types';

// Sweden-first and Sweden-only by intent: a Swedish-Muslim user is realistically
// served by one of MWL / Diyanet / Umm al-Qura / Egyptian / Moonsighting / ISNA.
// Methods bound to specific Gulf countries (Karachi, Dubai, Qatar, Kuwait,
// Singapore, Tehran) are NOT shown — they don't fit a Swedish congregation and
// were noise in a list this important. They remain in CalculationMethodKey for
// back-compat: a user with an older saved value still computes correctly via
// adhan; they just can't re-pick that method from the picker.
export const METHOD_OPTIONS: readonly Option<CalculationMethodKey>[] = [
  {
    value: 'MuslimWorldLeague',
    label: 'Muslim World League',
    description: 'Fajr 18°, Isha 17° · rekommenderad i Sverige',
  },
  { value: 'Turkey', label: 'Turkiet (Diyanet)', description: 'Fajr 18°, Isha 17°' },
  { value: 'UmmAlQura', label: 'Umm al-Qura (Mecka)', description: 'Fajr 18,5°, Isha efter 90 min' },
  { value: 'Egyptian', label: 'Egyptiska myndigheten', description: 'Fajr 19,5°, Isha 17,5°' },
  {
    value: 'MoonsightingCommittee',
    label: 'Moonsighting Committee',
    description: 'Fajr 18°, Isha 18° (shafaq)',
  },
  { value: 'NorthAmerica', label: 'Nordamerika (ISNA)', description: 'Fajr 15°, Isha 15°' },
  { value: 'Other', label: 'Annan', description: 'Anpassad – 0° (justera manuellt)' },
];

export const MADHAB_OPTIONS: readonly Option<Madhab>[] = [
  { value: 'shafi', label: 'Standard', description: 'Shafiʿi, Maliki, Hanbali – tidigare Asr' },
  { value: 'hanafi', label: 'Hanafi', description: 'Senare Asr' },
];

export const HIGHLAT_OPTIONS: readonly Option<HighLatitudeRuleKey>[] = [
  { value: 'auto', label: 'Automatisk (rekommenderad)', description: 'Väljs efter platsens latitud' },
  { value: 'middleOfTheNight', label: 'Nattens mitt' },
  { value: 'seventhOfTheNight', label: 'Sjundedel av natten' },
  { value: 'twilightAngle', label: 'Skymningsvinkel' },
];

export const POLAR_OPTIONS: readonly Option<PolarCircleResolutionKey>[] = [
  { value: 'aqrabBalad', label: 'Närmaste lämpliga plats', description: 'Aqrab al-Balad' },
  { value: 'aqrabYaum', label: 'Närmaste lämpliga dag', description: 'Aqrab al-Yaum' },
  { value: 'unresolved', label: 'Oberäknad', description: 'Visa ingen tid när den inte kan beräknas' },
];

export const SHAFAQ_OPTIONS: readonly Option<Shafaq>[] = [
  { value: 'general', label: 'Allmän', description: 'Röd och vit skymning' },
  { value: 'ahmer', label: 'Ahmer (röd)', description: 'Tidigare Isha' },
  { value: 'abyad', label: 'Abyad (vit)', description: 'Senare Isha' },
];

export const ROUNDING_OPTIONS: readonly Option<Rounding>[] = [
  { value: 'nearest', label: 'Närmaste minut' },
  { value: 'up', label: 'Uppåt' },
  { value: 'none', label: 'Ingen' },
];

/** Stepper display formatter: a signed minute offset, e.g. "+5 min" / "−3 min". */
export const signedMinutes = (v: number) => `${v > 0 ? '+' : ''}${v} min`;

// --- Summary helpers: the current value's label, for a collapsed group's header. ---

const labelOf = <T extends string>(options: readonly Option<T>[], value: T): string =>
  options.find((o) => o.value === value)?.label ?? '';

export const methodLabel = (s: PrayerSettings): string =>
  labelOf(METHOD_OPTIONS, s.calculationMethod);

export const madhabLabel = (s: PrayerSettings): string => labelOf(MADHAB_OPTIONS, s.madhab);

/** Collapsed-header summary for the "Visning" disclosure group: the current
 *  rounding label, plus a " · Hijri ±N d" suffix when the Hijri offset is set.
 *  Per-prayer minute offsets are NOT part of this group anymore — they moved to
 *  the Beräkning screen, since they tweak the calculation output. */
export const visningSummary = (s: PrayerSettings): string => {
  const rounding = labelOf(ROUNDING_OPTIONS, s.rounding);
  if (s.hijriOffset === 0) return rounding;
  const sign = s.hijriOffset > 0 ? '+' : '';
  return `${rounding} · Hijri ${sign}${s.hijriOffset} d`;
};
