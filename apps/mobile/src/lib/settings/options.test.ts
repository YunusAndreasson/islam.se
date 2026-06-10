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
  MAP_STYLE_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  calculationSummary,
  madhabLabel,
  methodLabel,
  signedMinutes,
  visningSummary,
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
// The curated subset surfaced in METHOD_OPTIONS for a Swedish-Muslim audience.
// Karachi/Dubai/Qatar/Kuwait/Singapore/Tehran remain in the CalculationMethodKey
// type union (so a user with an older saved value keeps computing correctly via
// adhan), but are intentionally not in the picker — they're tied to specific
// regional contexts that would make the Sweden-focused picker noisy.
const SHOWN_METHOD_KEYS: readonly CalculationMethodKey[] = [
  'Turkey',
  'MuslimWorldLeague',
  'UmmAlQura',
  'Egyptian',
  'MoonsightingCommittee',
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
      keys: SHOWN_METHOD_KEYS,
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

  it('puts the app default calculation method first', () => {
    expect(METHOD_OPTIONS[0]?.value).toBe(DEFAULT_SETTINGS.calculationMethod);
  });
});

describe('label helpers', () => {
  it('round-trip the current value through to its option label', () => {
    // The contract methodLabel/madhabLabel are used for: "user opens the collapsed
    // group → sees the current method's label". A missing entry collapses to '',
    // which is the rendered failure of the silent-drift bug class above.
    // The label round-trip only applies to keys we expose in the picker. Keys
    // kept in the type for back-compat (e.g. 'Karachi') will return '' from
    // methodLabel — that's expected; the summary line just won't show their
    // name, but the prayer-time math via adhan still works.
    for (const key of SHOWN_METHOD_KEYS) {
      const s: PrayerSettings = { ...DEFAULT_SETTINGS, calculationMethod: key };
      expect(methodLabel(s).length).toBeGreaterThan(0);
    }
    for (const key of ALL_MADHAB) {
      const s: PrayerSettings = { ...DEFAULT_SETTINGS, madhab: key };
      expect(madhabLabel(s).length).toBeGreaterThan(0);
    }
  });

  it('summarises calculation settings beyond just the method', () => {
    expect(calculationSummary(DEFAULT_SETTINGS)).toBe('Turkiet (Diyanet) · Standard');
    expect(
      calculationSummary({
        ...DEFAULT_SETTINGS,
        madhab: 'hanafi',
        highLatitudeRule: 'twilightAngle',
      }),
    ).toBe('Turkiet (Diyanet) · Hanafi · Skymningsvinkel');
  });

  it('keeps a readable summary for persisted back-compat methods hidden from the picker', () => {
    expect(calculationSummary({ ...DEFAULT_SETTINGS, calculationMethod: 'Karachi' })).toBe(
      'Karachi · Standard',
    );
  });

  it('visningSummary names the group topics (scope), not their values', () => {
    // The collapsed-header summary names the AREAS the Utseende-och-format group
    // controls so it never undersells itself — the old value summary showed only
    // "Närmaste minut" and hid Tema / Karttyp / Hijri, making the group look like it
    // did just rounding. It is value-INDEPENDENT on purpose: the same scope regardless
    // of the user's choices (the values live inside the expanded card). Topics are
    // capitalised consistently (section names), so the casing is part of the contract.
    const summary = visningSummary();
    expect(summary).toContain('Tema');
    expect(summary).toContain('Avrundning');
    expect(summary).toContain('Hijri');
    // "Karttyp" is listed only when a MapTiler key bundles the basemap picker —
    // otherwise that sub-section isn't rendered, so the topic must not appear either.
    expect(summary.includes('Karttyp')).toBe(MAP_STYLE_OPTIONS.length > 1);
    // Topics appear in the same order the sub-sections render inside the card.
    const order = ['Tema', 'Karttyp', 'Avrundning', 'Hijri'].filter(
      (t) => t !== 'Karttyp' || MAP_STYLE_OPTIONS.length > 1,
    );
    expect(summary).toBe(order.join(' · '));
  });

  it('signedMinutes always shows the sign for non-zero values', () => {
    // The stepper formatter is the only place "+5 min" / "−3 min" is constructed,
    // and the leading sign is what tells the user a tweak is applied. A missing
    // "+" on positive values silently hides positive adjustments at a glance.
    // The space before "min" is NBSP (Swedish fast mellanslag) so the unit
    // never wraps away from its number.
    expect(signedMinutes(5)).toBe('+5 min');
    expect(signedMinutes(-3)).toBe('-3 min'); // adhan offsets use ASCII minus
    expect(signedMinutes(0)).toBe('0 min');
  });
});

// SWEDISH_CITIES (the curated 7) was retired when the Byt plats picker took
// over (src/app/(settings)/byt-plats.tsx). The picker now pulls from PLACES
// (src/lib/places/data.ts — ~2,100 tätorter from GeoNames SE), and the
// invariants live in src/lib/places/nearest.test.ts: every place round-trips
// to itself, no two share coords, and Markaryd-class small places work.
