// The selectable options for every prayer-time setting, plus small helpers that
// reverse-look-up the *current* value's label for a collapsed group's summary line.
// Extracted from the settings screen so the screen file stays thin and either an
// inline control or (later) a sub-screen can share one source of truth.
import type { Option } from '@/components/settings/OptionGroup';
import { HAS_MAPTILER } from '@/lib/map/nordicStyle';

import type {
  CalculationMethodKey,
  HighLatitudeRuleKey,
  Madhab,
  MapStyleId,
  PolarCircleResolutionKey,
  PrayerSettings,
  Rounding,
  Shafaq,
  ThemePreference,
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

// Basemap picker. Nordic is the custom warm-parchment / cool-navy cartography —
// the visual identity. Standard is MapTiler's classic OSM streets style for users
// who want full road + address detail. Satellit is aerial imagery for landmark
// recognition. The solar wash + prayer-line + city overlays render on top of every
// basemap. The two MapTiler options are hidden when no key is bundled (otherwise
// the picker would show choices that silently fall back to Nordic).
export const MAP_STYLE_OPTIONS: readonly Option<MapStyleId>[] = HAS_MAPTILER
  ? [
      { value: 'nordic', label: 'Nordic', description: 'Lugn karta i appens palett (rekommenderad)' },
      { value: 'standard', label: 'Standard', description: 'Gator, transit och adresser' },
      { value: 'satellite', label: 'Satellit', description: 'Flygfoto för platsigenkänning' },
    ]
  : [
      { value: 'nordic', label: 'Nordic', description: 'Lugn karta i appens palett (rekommenderad)' },
    ];

/** Stepper display formatter: a signed minute offset, e.g. "+5 min" / "−3 min". */
export const signedMinutes = (v: number) => `${v > 0 ? '+' : ''}${v} min`;

// --- Summary helpers: the current value's label, for a collapsed group's header. ---

const labelOf = <T extends string>(options: readonly Option<T>[], value: T): string =>
  options.find((o) => o.value === value)?.label ?? '';

export const methodLabel = (s: PrayerSettings): string =>
  labelOf(METHOD_OPTIONS, s.calculationMethod);

export const madhabLabel = (s: PrayerSettings): string => labelOf(MADHAB_OPTIONS, s.madhab);

/** Collapsed-header summary for the "Utseende och format" disclosure group: the AREAS
 *  it covers, not their values. Showing only the rounding label ("Närmaste minut") made
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
