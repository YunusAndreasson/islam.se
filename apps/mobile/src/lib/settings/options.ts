// The selectable options for every prayer-time setting, plus small helpers that
// reverse-look-up the *current* value's label for a collapsed group's summary line.
// Extracted from the settings screen so the screen file stays thin and either an
// inline control or (later) a sub-screen can share one source of truth.
import type { Option } from '@/components/settings/OptionGroup';

import type {
  CalculationMethodKey,
  HighLatitudeRuleKey,
  LocationMode,
  Madhab,
  MapStyleId,
  PolarCircleResolutionKey,
  PrayerSettings,
  Rounding,
  Shafaq,
  ThemePreference,
} from './types';

// GPS vs manual city pick on the Plats section. Hoisted here with the other
// *_OPTIONS so the Inställningar screen passes a stable reference (the inline literal
// was rebuilt on every screen render — including the per-minute clock tick).
export const LOCATION_MODE_OPTIONS: readonly Option<LocationMode>[] = [
  { value: 'gps', label: 'GPS (min plats)', icon: 'crosshairs-gps' },
  { value: 'manual', label: 'Välj stad', icon: 'city' },
];

// Sweden-first and Sweden-only by intent: a Swedish-Muslim user is realistically
// served by one of Diyanet / MWL / Umm al-Qura / Egyptian / Moonsighting / ISNA.
// Region-specific presets (Karachi, Dubai, Qatar, Kuwait, Singapore, Tehran) are
// NOT shown — they are noise in a Sweden-focused list this important. They remain
// in CalculationMethodKey for back-compat: a user with an older saved value still
// computes correctly via adhan; they just can't re-pick that method from the picker.
export const METHOD_OPTIONS: readonly Option<CalculationMethodKey>[] = [
  { value: 'Turkey', label: 'Turkiet (Diyanet)', description: 'Fajr 18°, Isha 17° · appens standard' },
  {
    value: 'MuslimWorldLeague',
    label: 'Muslim World League',
    description: 'Fajr 18°, Isha 17° · vanlig i bönetidstjänster',
  },
  { value: 'UmmAlQura', label: 'Umm al-Qura (Mecka)', description: 'Fajr 18,5°, Isha 90 min efter Maghrib' },
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
  { value: 'nearest', label: 'Närmaste minut' },
  { value: 'up', label: 'Uppåt' },
  { value: 'none', label: 'Ingen' },
];

// Theme override. 'System' is first + recommended — the Apple Maps default,
// following the OS Display setting. The locked options are quiet escape hatches
// for users who keep their phone on the other mode (a dark-phone reader who
// still wants the warm parchment basemap for the daytime map, or vice versa).
export const THEME_OPTIONS: readonly Option<ThemePreference>[] = [
  // "Följ system" already says it tracks the OS automatically, so the description only
  // carries the one extra signal — that this is the default to pick when unsure.
  { value: 'system', label: 'Följ system', description: 'Rekommenderad' },
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
];

// One app-owned basemap keeps the Swedish label policy deterministic. Remote stock
// styles own their place labels and would reintroduce Copenhagen unless we added a
// second/custom label layer, which this map intentionally avoids.
export const MAP_STYLE_OPTIONS: readonly Option<MapStyleId>[] = [
  { value: 'nordic', label: 'Nordisk', description: 'Lugn karta i appens palett (rekommenderad)' },
];

/** Stepper display formatter: a signed minute offset, e.g. "+5 min" / "−3 min".
 *  NBSP before the unit so the number and "min" stay on one line. */
export const signedMinutes = (v: number) => `${v > 0 ? '+' : ''}${v} min`;

// --- Summary helpers: the current value's label, for a collapsed group's header. ---

const labelOf = <T extends string>(options: readonly Option<T>[], value: T): string =>
  options.find((o) => o.value === value)?.label ?? '';

export const methodLabel = (s: PrayerSettings): string =>
  labelOf(METHOD_OPTIONS, s.calculationMethod);

export const madhabLabel = (s: PrayerSettings): string => labelOf(MADHAB_OPTIONS, s.madhab);

export const calculationSummary = (s: PrayerSettings): string => {
  const method = methodLabel(s) || s.calculationMethod;
  const parts = [method, madhabLabel(s)];
  if (s.highLatitudeRule !== 'auto') parts.push(labelOf(HIGHLAT_OPTIONS, s.highLatitudeRule));
  return parts.filter(Boolean).join(' · ');
};

/** Collapsed-header summary for the "Utseende och format" disclosure group: the AREAS
 *  it covers, not their values. Showing only the rounding label ("Närmaste minut") made
 *  the group look like it did just that, hiding Tema / Karttyp / Hijri — so instead we
 *  name the scope and let the values live inside the card. The topics are listed in the
 *  same order as the sub-sections render inside the card (Tema, Karttyp, Avrundning,
 *  Hijri) and capitalised consistently so the summary reads as a list of section names.
 *  Value-independent on purpose: the group's breadth is the point. "Karttyp" is listed
 *  only when a MapTiler key bundles the basemap picker (else that sub-section is absent). */
export const visningSummary = (): string => {
  const topics = ['Tema'];
  if (MAP_STYLE_OPTIONS.length > 1) topics.push('Karttyp');
  topics.push('Avrundning', 'Hijri');
  return topics.join(' · ');
};
