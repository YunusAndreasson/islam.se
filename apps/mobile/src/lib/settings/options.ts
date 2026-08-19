// The selectable options for every prayer-time setting, plus small helpers that
// reverse-look-up the *current* value's label for a collapsed group's summary line.
// Extracted from the settings screen so the screen file stays thin and either an
// inline control or (later) a sub-screen can share one source of truth.
import type { Option } from '@/components/settings/OptionGroup';

import { HAS_ADHAN_SOUND, NOTIFY_PRAYERS } from '@/lib/notifications';
import type {
  CalculationMethodKey,
  HighLatitudeRuleKey,
  LocationMode,
  Madhab,
  NotificationSettings,
  NotificationSoundKey,
  PerPrayerSlot,
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
  // The app never renders seconds, so adhan's Rounding.None is not "unrounded" on screen —
  // dropping the seconds field IS a floor. Labelling it "Ingen" invited a user who wanted
  // the exact time to pick the one option that shows every prayer up to a minute EARLY,
  // Maghrib included, which is the direction that matters when it ends a fast. Named for
  // what the user sees; the persisted VALUE stays 'none', so this is copy, not a migration.
  { value: 'none', label: 'Nedåt', description: 'Alltid till föregående hela minut' },
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

/** Stepper display formatter: a signed minute offset, e.g. "+5 min" / "−3 min".
 *  NBSP before the unit so the number and "min" stay on one line. */
export const signedMinutes = (v: number) => `${v > 0 ? '+' : ''}${v} min`;

// --- Notification alerts: sounds, lead times, and the bulk ("gäller alla") helpers. ---

// The non-breaking space (U+00A0) the app's unit labels use, so a numeral can never wrap
// away from its unit. Named here because these labels are assembled from fragments;
// elsewhere the character is written inline (see signedMinutes below, and the literal
// NBSPs the notification tests assert on).
const NBSP = ' ';

/** The sound choices, mirroring the METHOD_OPTIONS pattern: the TYPE carries every key
 *  ever offered, this list only the ones THIS BUILD can play. "Adhan" appears solely
 *  when an audio file is bundled — which needs an `eas build`, not an OTA update. */
export const SOUND_OPTIONS: readonly Option<NotificationSoundKey>[] = [
  {
    value: 'default',
    label: 'Systemets standardljud',
    description: 'Samma ton som dina andra notiser',
  },
  { value: 'silent', label: 'Tyst', description: 'Visas utan ljud' },
  ...(HAS_ADHAN_SOUND
    ? [{ value: 'adhan' as const, label: 'Adhan', description: 'Ett kort böneutrop' }]
    : []),
];

/** Stepper formatter for a prayer's heads-up. */
export const leadLabel = (v: number): string =>
  v === 0 ? 'Vid bönetid' : `${v}${NBSP}min innan`;

/** Same, for the Fajr-window marker — "vid bönetid" would be wrong there, since the
 *  sunrise slot marks a window CLOSING rather than a prayer beginning. */
export const sunriseLeadLabel = (v: number): string =>
  v === 0 ? 'Vid soluppgången' : `${v}${NBSP}min innan`;

/** Shown by a bulk control when the per-prayer values disagree. */
export const MIXED_LABEL = 'Blandat';

export const soundLabel = (key: NotificationSoundKey): string =>
  SOUND_OPTIONS.find((o) => o.value === key)?.label ?? 'Systemets standardljud';

/** Do the five obligatory prayers disagree about their heads-up? Drives the bulk
 *  stepper's "Blandat" display. Sunrise is excluded — it is the Fajr-window marker with
 *  its own control, and its different default would otherwise read as "mixed" always. */
export const mixedPrayerLead = (n: NotificationSettings): boolean =>
  new Set(NOTIFY_PRAYERS.map((k) => n.lead[k])).size > 1;

/** The value a bulk stepper should show: the shared lead, or — when they disagree — the
 *  lowest, so stepping from it still moves every prayer somewhere sensible. */
export const commonPrayerLead = (n: NotificationSettings): number =>
  Math.min(...NOTIFY_PRAYERS.map((k) => n.lead[k]));

/** Write one heads-up across all five prayers, leaving the sunrise marker's own lead
 *  alone (it is configured separately, under "Fajr-fönstret"). */
export const setAllPrayerLeads = (
  lead: PerPrayerSlot<number>,
  minutes: number,
): PerPrayerSlot<number> => {
  const next = { ...lead };
  for (const key of NOTIFY_PRAYERS) next[key] = minutes;
  return next;
};

/** Write one sound across every slot — unlike lead times, a user picking "Tyst" means
 *  every prayer alert, the Fajr-window warning included. */
export const setAllSounds = (value: NotificationSoundKey): PerPrayerSlot<NotificationSoundKey> => ({
  fajr: value,
  sunrise: value,
  dhuhr: value,
  asr: value,
  maghrib: value,
  isha: value,
});

/** The common sound across every slot, or null when they disagree (the OptionGroup then
 *  renders no selection — see its `T | null` value prop). */
export const commonSound = (n: NotificationSettings): NotificationSoundKey | null => {
  const all = new Set(Object.values(n.sound));
  return all.size === 1 ? ([...all][0] as NotificationSoundKey) : null;
};

/** The Inställningar → Påminnelser row's value. Recognition over recall: how many
 *  prayers, and how early — the two facts a user checks at a glance. */
export const notificationSummary = (s: PrayerSettings): string => {
  const n = s.notifications;
  const on = NOTIFY_PRAYERS.filter((k) => n.prayers[k]).length;
  const prayers = on === 5 ? 'Alla böner' : on === 0 ? 'Inga böner' : `${on} av 5 böner`;
  if (on === 0) return prayers;
  const lead = mixedPrayerLead(n) ? 'blandade tider' : leadLabel(commonPrayerLead(n)).toLowerCase();
  return `${prayers} · ${lead}`;
};

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
