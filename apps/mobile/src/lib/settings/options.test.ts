// The settings screen renders OPTIONS lists for each typed key, and falls back to '' (a
// blank summary line) when a value has no matching option. So a key added to the type
// union but not to the OPTIONS list breaks SILENTLY: a user picks the new method, the
// Beräkning row's summary shows nothing, and there is no runtime error to notice.
// These tests force every typed key to be representable, and pin the few specific
// defaults the rest of the app's UX depends on.
import { describe, expect, it } from '@jest/globals';

import {
  HIGHLAT_OPTIONS,
  LEAD_CHOICES,
  leadOptions,
  sunriseLeadOptions,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  calculationSummary,
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
// The curated subset surfaced in METHOD_OPTIONS for a Swedish-Muslim audience.
// Karachi/Dubai/Qatar/Kuwait/Singapore/Tehran/Other remain in the CalculationMethodKey
// type union (so a user with an older saved value keeps computing correctly via
// adhan). The regional presets stay out to keep this Sweden-focused picker quiet;
// Other stays out because the app has no angle controls with which to configure it.
const SHOWN_METHOD_KEYS: readonly CalculationMethodKey[] = [
  'Turkey',
  'MuslimWorldLeague',
  'UmmAlQura',
  'Egyptian',
  'MoonsightingCommittee',
  'NorthAmerica',
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

  it('leaves naming the default to the Standard tag, not to a label or caption', () => {
    // The default was once named only in a grey caption ("· appens standard") and the
    // madhab default was LABELLED "Standard" — so the word meant two things on one screen
    // and users could not tell which row was the default. OptionGroup's `standard` tag,
    // fed from DEFAULT_SETTINGS, is now the one place that says it; a caption that says
    // it too will drift the day the default moves again (it did once: MWL → Diyanet).
    const groups = [METHOD_OPTIONS, MADHAB_OPTIONS, HIGHLAT_OPTIONS, POLAR_OPTIONS, SHAFAQ_OPTIONS, ROUNDING_OPTIONS];
    for (const o of groups.flat()) {
      expect(`${o.label} ${o.description ?? ''}`).not.toMatch(/standard|rekommenderad/i);
    }
  });

  it('tells the two 18°/17° methods apart in their descriptions', () => {
    // Diyanet and Muslim World League share their angles; what differs is Diyanet's
    // temkin minutes. Two rows reading "Fajr 18°, Isha 17°" and nothing else look like a
    // duplicate, and the reader cannot choose between them.
    const [diyanet, mwl] = METHOD_OPTIONS;
    expect(diyanet?.value).toBe('Turkey');
    expect(mwl?.value).toBe('MuslimWorldLeague');
    expect(diyanet?.description).not.toBe(mwl?.description);
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

  it('summarises the method, then only what differs from the default', () => {
    // The default madhab used to be LABELLED "Standard", so the summary read "Turkiet
    // (Diyanet) · Standard" — which said nothing about Asr. Its row is now named by school,
    // and the summary names the madhab only when it is the one a reader chose.
    expect(calculationSummary(DEFAULT_SETTINGS)).toBe('Turkiet (Diyanet)');
    expect(
      calculationSummary({
        ...DEFAULT_SETTINGS,
        madhab: 'hanafi',
        highLatitudeRule: 'twilightAngle',
      }),
    ).toBe('Turkiet (Diyanet) · Hanafi · Skymningsvinkel');
  });

  it('never reads like a fresh install while any Beräkning control is off its default', () => {
    // It once named only the method, madhab and high-latitude rule, so a reader with Fajr
    // +10 min and rounding "up" saw "Turkiet (Diyanet)" — the same text as a fresh install
    // — on the row that is meant to say what their times are built from.
    const changed: Partial<PrayerSettings>[] = [
      { polarCircleResolution: 'aqrabYaum' },
      { rounding: 'up' },
      { adjustments: { ...DEFAULT_SETTINGS.adjustments, fajr: 10 } },
      { calculationMethod: 'MoonsightingCommittee', shafaq: 'ahmer' },
    ];
    for (const patch of changed) {
      const summary = calculationSummary({ ...DEFAULT_SETTINGS, ...patch });
      const method = methodLabel({ ...DEFAULT_SETTINGS, ...patch });
      expect(summary).not.toBe(method);
    }
    expect(
      calculationSummary({
        ...DEFAULT_SETTINGS,
        rounding: 'up',
        adjustments: { ...DEFAULT_SETTINGS.adjustments, fajr: 10, isha: -5 },
      }),
    ).toBe('Turkiet (Diyanet) · Avrundning uppåt · 2 justerade tider');
    // Shafaq is hidden, and has no effect, under every other method: it must not be listed.
    expect(calculationSummary({ ...DEFAULT_SETTINGS, shafaq: 'abyad' })).toBe('Turkiet (Diyanet)');
  });

  it('keeps a readable summary for persisted back-compat methods hidden from the picker', () => {
    expect(calculationSummary({ ...DEFAULT_SETTINGS, calculationMethod: 'Karachi' })).toBe(
      'Karachi',
    );
  });

  // THE MIGRATION THIS GUARDS: "Påminn i förväg" used to be a stepper over 0–60 in
  // steps of five, so installs exist sitting on 20, 25, 45 or 60. sanitizeSettings still
  // accepts every one of them. If the new list only ever offered its own five values, a
  // reader on 25 would open the screen to a group with NOTHING checked and have their
  // choice silently rewritten by the first tap they made.
  it('carries a persisted lead time that is not one of the offered five', () => {
    const values = leadOptions(25).map((o) => Number(o.value));

    expect(values).toContain(25);
    expect(values).toEqual([...values].sort((a, b) => a - b)); // in time order, not appended
    expect(new Set(values).size).toBe(values.length);
  });

  it('offers exactly the five choices when the saved value is already one of them', () => {
    expect(leadOptions(15).map((o) => Number(o.value))).toEqual([...LEAD_CHOICES]);
    // 0 is a real choice, not a missing value — it must not add a sixth row.
    expect(leadOptions(0).map((o) => Number(o.value))).toEqual([...LEAD_CHOICES]);
  });

  // Zero means two different moments. At a prayer it is the prayer time; at the Fajr
  // window it is sunrise, the moment the window SHUTS — "Vid bönetid" there would name a
  // prayer that is already over.
  it('names the zero lead for what it is on each list', () => {
    expect(leadOptions(0).find((o) => o.value === '0')?.label).toBe('Vid bönetid');
    expect(sunriseLeadOptions(0).find((o) => o.value === '0')?.label).toBe('Vid soluppgången');
    // Every other row is the same in both lists.
    expect(sunriseLeadOptions(0).find((o) => o.value === '15')?.label).toBe(
      leadOptions(0).find((o) => o.value === '15')?.label,
    );
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
