// The settings screen renders OPTIONS lists for each typed key, and falls back to '' (a
// blank summary line) when a value has no matching option. So a key added to the type
// union but not to the OPTIONS list breaks SILENTLY: a user picks the new method, the
// disclosure group's header shows nothing, and there is no runtime error to notice.
// These tests force every typed key to be representable, and pin the few specific
// defaults the rest of the app's UX depends on.
import { describe, expect, it } from '@jest/globals';

import {
  HIGHLAT_OPTIONS,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  adjustmentsSummary,
  madhabLabel,
  methodLabel,
  signedMinutes,
} from './options';
import {
  type CalculationMethodKey,
  DEFAULT_SETTINGS,
  type HighLatitudeRuleKey,
  type Madhab,
  type PolarCircleResolutionKey,
  type PrayerSettings,
  type Rounding,
  type Shafaq,
} from './types';

// Hand-listed authoritative key sets — written out independently of the OPTIONS lists,
// so the test catches drift in BOTH directions (key added to type but missing from
// options, OR a typo in an option value that doesn't actually satisfy the union).
const ALL_METHOD_KEYS: readonly CalculationMethodKey[] = [
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
];
const ALL_MADHAB: readonly Madhab[] = ['shafi', 'hanafi'];
const ALL_HIGHLAT: readonly HighLatitudeRuleKey[] = [
  'auto',
  'middleOfTheNight',
  'seventhOfTheNight',
  'twilightAngle',
];
const ALL_POLAR: readonly PolarCircleResolutionKey[] = ['aqrabBalad', 'aqrabYaum', 'unresolved'];
const ALL_SHAFAQ: readonly Shafaq[] = ['general', 'ahmer', 'abyad'];
const ALL_ROUNDING: readonly Rounding[] = ['nearest', 'up', 'none'];

describe('OPTIONS — every typed key has exactly one labelled entry', () => {
  // The shared invariant for every union → OPTIONS table: every key appears once and
  // only once, with a non-empty user-facing label. A duplicate or missing entry is
  // the failure mode that silently blanks the summary line in the disclosure group.
  const SOURCES: { name: string; keys: readonly string[]; values: readonly string[] }[] = [
    {
      name: 'METHOD_OPTIONS',
      keys: ALL_METHOD_KEYS,
      values: METHOD_OPTIONS.map((o) => o.value),
    },
    { name: 'MADHAB_OPTIONS', keys: ALL_MADHAB, values: MADHAB_OPTIONS.map((o) => o.value) },
    { name: 'HIGHLAT_OPTIONS', keys: ALL_HIGHLAT, values: HIGHLAT_OPTIONS.map((o) => o.value) },
    { name: 'POLAR_OPTIONS', keys: ALL_POLAR, values: POLAR_OPTIONS.map((o) => o.value) },
    { name: 'SHAFAQ_OPTIONS', keys: ALL_SHAFAQ, values: SHAFAQ_OPTIONS.map((o) => o.value) },
    {
      name: 'ROUNDING_OPTIONS',
      keys: ALL_ROUNDING,
      values: ROUNDING_OPTIONS.map((o) => o.value),
    },
  ];

  for (const { name, keys, values } of SOURCES) {
    it(`${name} covers exactly its union, with no duplicates`, () => {
      // Sort both sides — order within a list is presentational, not contractual.
      const sortedKeys = [...keys].sort();
      const sortedValues = [...values].sort();
      expect(sortedValues).toEqual(sortedKeys);
      // Set size === list length ⇒ no duplicates.
      expect(new Set(values).size).toBe(values.length);
    });
  }

  it('every option label is a non-empty user-facing string', () => {
    // A label of "" renders an invisible chip; the disclosure-group summary would
    // collapse to whitespace and the picker row would have no caption.
    const allOptions = [
      ...METHOD_OPTIONS,
      ...MADHAB_OPTIONS,
      ...HIGHLAT_OPTIONS,
      ...POLAR_OPTIONS,
      ...SHAFAQ_OPTIONS,
      ...ROUNDING_OPTIONS,
    ];
    for (const o of allOptions) {
      expect(typeof o.label).toBe('string');
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('label helpers', () => {
  it('round-trip the current value through to its option label', () => {
    // The contract methodLabel/madhabLabel are used for: "user opens the collapsed
    // group → sees the current method's label". A missing entry collapses to '',
    // which is the rendered failure of the silent-drift bug class above.
    for (const key of ALL_METHOD_KEYS) {
      const s: PrayerSettings = { ...DEFAULT_SETTINGS, calculationMethod: key };
      expect(methodLabel(s).length).toBeGreaterThan(0);
    }
    for (const key of ALL_MADHAB) {
      const s: PrayerSettings = { ...DEFAULT_SETTINGS, madhab: key };
      expect(madhabLabel(s).length).toBeGreaterThan(0);
    }
  });

  it('adjustmentsSummary reports zero, singular and plural correctly', () => {
    // The summary is Swedish: "Inga justeringar" / "1 justerad" / "2 justerade".
    // The plural suffix ("e") flips at >1; pin the boundary so a future i18n PR
    // doesn't silently re-introduce "1 justerade".
    const zero = adjustmentsSummary(DEFAULT_SETTINGS);
    expect(zero).toBe('Inga justeringar');

    const one: PrayerSettings = {
      ...DEFAULT_SETTINGS,
      adjustments: { ...DEFAULT_SETTINGS.adjustments, fajr: 5 },
    };
    expect(adjustmentsSummary(one)).toBe('1 justerad');

    const two: PrayerSettings = {
      ...DEFAULT_SETTINGS,
      adjustments: { ...DEFAULT_SETTINGS.adjustments, fajr: 5, isha: -3 },
    };
    expect(adjustmentsSummary(two)).toBe('2 justerade');
  });

  it('signedMinutes always shows the sign for non-zero values', () => {
    // The stepper formatter is the only place "+5 min" / "−3 min" is constructed,
    // and the leading sign is what tells the user a tweak is applied. A missing
    // "+" on positive values silently hides positive adjustments at a glance.
    expect(signedMinutes(5)).toBe('+5 min');
    expect(signedMinutes(-3)).toBe('-3 min'); // adhan offsets use ASCII minus
    expect(signedMinutes(0)).toBe('0 min');
  });
});

// SWEDISH_CITIES (the curated 7) was retired when the Byt plats picker took
// over (src/app/(settings)/byt-plats.tsx). The picker now pulls from PLACES
// (src/lib/places/data.ts — ~2,100 tätorter from GeoNames SE), and the
// invariants live in src/lib/places/nearest.test.ts: every place round-trips
// to itself, no two share coords, and Markaryd-class small places work.
