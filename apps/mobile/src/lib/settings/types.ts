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

/** Appearance preference for the whole app (basemap, chrome, screens). `'system'`
 *  follows the OS (Settings → Display) and is the default — Apple Maps-style.
 *  `'light'` / `'dark'` lock the app to one palette regardless of the OS. */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * The six computed time slots in chronological order — the five obligatory prayers plus
 * the sunrise marker. These are the keys adhan exposes, declared HERE rather than in
 * ../prayer-times so this module stays framework-agnostic: prayer-times imports FROM
 * types, never the other way round.
 *
 * This is the ONE list. `PRAYER_ORDER` / `PrayerKey` (../prayer-times), `PerPrayerSlot`
 * below, the store's slot sanitiser and `NOTIFY_PRAYERS` (../notifications) are all
 * derived from it. They used to be four hand-written copies that had to agree with
 * nothing checking that they did, and the way that fails is quiet: a seventh slot added
 * to PRAYER_ORDER alone would leave `PerPrayerSlot` without a place to persist it and
 * `NOTIFY_PRAYERS` without an alert for it — no type error, just a prayer that never
 * notifies. Derivation makes the disagreement unrepresentable rather than merely
 * discouraged.
 */
export const PRAYER_SLOT_KEYS = [
  'fajr',
  'sunrise',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
] as const;

/** One of the six computed time slots. `PrayerKey` in ../prayer-times is this type. */
export type PrayerSlotKey = (typeof PRAYER_SLOT_KEYS)[number];

/** One value per computed time slot. */
export type PerPrayerSlot<T> = Record<PrayerSlotKey, T>;

/**
 * The five obligatory prayers — every slot except Shurūq, which is a MARKER closing
 * Fajr's window rather than a prayer. Derived by exclusion rather than re-listed, so
 * adding a slot cannot leave a prayer with no toggle and no alert. `NotifyPrayerKey` in
 * ../notifications is this type.
 */
export type ObligatoryPrayerKey = Exclude<PrayerSlotKey, 'sunrise'>;

/** The six computed prayer slots plus sunrise, used as adjustment keys. */
export type PrayerAdjustments = PerPrayerSlot<number>;

/**
 * Which sound an alert plays.
 *
 * `'adhan'` is only SELECTABLE in builds that bundle the audio file (see
 * ADHAN_SOUND_FILE in ../notifications.ts) — the union carries it unconditionally so a
 * persisted choice survives a build that lacks it, the same back-compat contract
 * CalculationMethodKey has with METHOD_OPTIONS. Availability is resolved at scheduling
 * time, never at load time, so re-installing a build that has the file restores the
 * user's choice instead of having silently rewritten it.
 */
export type NotificationSoundKey = 'default' | 'silent' | 'adhan';

export const PRAYER_ADJUSTMENT_MIN = -60;
export const PRAYER_ADJUSTMENT_MAX = 60;
export const NOTIFICATION_LEAD_MIN = 0;
export const NOTIFICATION_LEAD_MAX = 60;
export const HIJRI_OFFSET_MIN = -2;
export const HIJRI_OFFSET_MAX = 2;

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
  prayers: Record<ObligatoryPrayerKey, boolean>;
  /** Shurūq is a MARKER, not a prayer — it closes Fajr's window. That framing is why it
   *  is not a sixth key in `prayers` and why NOTIFY_PRAYERS still lists five. This is the
   *  one non-prayer alert: an opt-in warning that time for Fajr is running out. Its lead
   *  and sound live in the `sunrise` slot of the records below. */
  fajrWindowEnd: boolean;
  /** Minutes before each time to fire its alert (0 = exactly at the time). A heads-up so
   *  you can leave for the mosque before the adhan — and it is per-slot because the
   *  useful lead genuinely differs (a long warning before Fajr, none before Maghrib).
   *
   *  This REPLACES the old scalar `notifications.leadMinutes`. It is deliberately a NEW
   *  key rather than the old one made polymorphic: the app ships OTA with
   *  runtimeVersion.policy "appVersion", so an `eas update:rollback` can put older JS in
   *  front of newer persisted data. Old code doing `Math.max(0, {}) * 60_000` yields NaN
   *  → `new Date(NaN)` → every alert silently dropped. With a new key, old code reads a
   *  missing scalar → 0 → alerts fire at prayer time. Degrade, don't fail silently.
   *  See sanitizeNotificationLead in ./store.ts for the migration. */
  lead: PerPrayerSlot<number>;
  /** Which sound each alert plays. Per-slot for the same reason as `lead`. */
  sound: PerPrayerSlot<NotificationSoundKey>;
  /** Opt-in reminder at the start of the night's last third — the time the scholars single
   *  out for the voluntary night prayer. Off by default.
   *
   *  Its sound is a SCALAR beside it rather than a seventh slot in the records above.
   *  Widening PerPrayerSlot would have dragged in PRAYER_SLOT_KEYS, all three of its
   *  instantiations, setAllSounds and the literal objects in a dozen tests — for a slot
   *  that is not a prayer and is not covered by the "Gäller alla" bulk controls anyway.
   *  There is deliberately no `lead`: a warning BEFORE the last third begins is not a thing
   *  anyone wants, and leaving it out is one control fewer to explain. */
  lastThird: boolean;
  lastThirdSound: NotificationSoundKey;
}

export interface PrayerSettings {
  calculationMethod: CalculationMethodKey;
  madhab: Madhab;
  highLatitudeRule: HighLatitudeRuleKey;
  polarCircleResolution: PolarCircleResolutionKey;
  shafaq: Shafaq;
  adjustments: PrayerAdjustments;
  rounding: Rounding;
  /** Day offset applied to the Hijri-date display, to match local moon-sighting. */
  hijriOffset: number;
  notifications: NotificationSettings;
  locationMode: LocationMode;
  /** Chosen city/coordinate when locationMode is 'manual'. */
  manualLocation: NamedLocation | null;
  /** Appearance preference. `'system'` follows the OS (default); `'light'` and
   *  `'dark'` lock the app's basemap, wash, prayer-line and chrome palettes. */
  theme: ThemePreference;
  /** Show Sweden's mosques as quiet POIs on the map (revealed as you zoom into a
   *  city). On by default; off gives a pure solar field. See src/components/map/
   *  MosqueLayer.tsx. */
  showMosques: boolean;
  /** Draw the great-circle direction to Mecca from your position on the map. On by
   *  default: it is useful indoors where the magnetometer is unreliable, and it is an
   *  independent check on the compass sheet. Purely cosmetic — it changes nothing that
   *  is computed, which is why it belongs to COSMETIC_KEYS in ./compute-signature.
   *  See src/components/map/skia/QiblaArc.tsx. */
  showQibla: boolean;
  /** Show the night's two voluntary landmarks — its midpoint and the start of its last
   *  third — as a separate group under the six prayer rows. Off by default: they are not
   *  prayer times, and a reader who has not asked for them should not have them appear in
   *  a list of obligations. Cosmetic in the COMPUTE_KEYS sense — the times it reveals are
   *  derived from the same adhan day the map already computes, so nothing is invalidated.
   *  See src/lib/night-times.ts. */
  showNightTimes: boolean;
  /** Haptic feedback (selection ticks, snaps, the qibla-lock confirm). On by
   *  default; turning it off silences every haptic app-wide via the haptics
   *  wrapper's module flag (see src/lib/haptics.ts + ./context.tsx). */
  haptics: boolean;
}

export const DEFAULT_SETTINGS: PrayerSettings = {
  calculationMethod: 'Turkey',
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
  hijriOffset: 0,
  // Off by default: enabling it is what asks the OS for permission.
  notifications: {
    enabled: false,
    prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
    fajrWindowEnd: false,
    // Prayers alert at the time itself (the long-standing behaviour). The Fajr-window
    // warning is the exception: it only has a point AS a warning, so firing it at the
    // exact moment the window shuts would be useless — a quarter-hour of grace instead.
    lead: { fajr: 0, sunrise: 15, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    sound: {
      fajr: 'default',
      sunrise: 'default',
      dhuhr: 'default',
      asr: 'default',
      maghrib: 'default',
      isha: 'default',
    },
    lastThird: false,
    lastThirdSound: 'default',
  },
  locationMode: 'gps',
  manualLocation: null,
  theme: 'system',
  showMosques: true,
  showQibla: true,
  showNightTimes: false,
  haptics: true,
};

/** Fallback coordinate when GPS is unavailable and no manual location is set.
    The Byt plats picker (src/app/(settings)/byt-plats.tsx) writes its own
    NamedLocation when the user chooses a place — the picker pool is the bundled
    PLACES dataset, see src/lib/places/data.ts. */
export const DEFAULT_COORDS: NamedLocation = {
  name: 'Stockholm',
  latitude: 59.3293,
  longitude: 18.0686,
};

/** Deep value-equality across the settings shape (plain objects, primitives, null — the
 *  blob has no arrays). Deliberately NOT `JSON.stringify(a) === JSON.stringify(b)`: that
 *  compares key ORDER too, and the order of a blob rehydrated from AsyncStorage is
 *  whatever the writer happened to use. A harmless reshuffle would then read as "the user
 *  changed something". */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      kb.includes(k) &&
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
};

/** Is every preference still at the app's default?
 *
 *  Drives whether "Återställ appens standard" renders at all on Inställningar. An action
 *  that cannot change anything is better absent than present-and-inert, and absence is
 *  the strongest form of error prevention there is: the one destructive control on the
 *  screen simply isn't on the path of a user who has never changed a setting. Mirrors
 *  the `hasAdjustments` guard behind Beräkning's "Återställ alla". */
export const isDefaultSettings = (s: PrayerSettings): boolean => sameValue(s, DEFAULT_SETTINGS);
