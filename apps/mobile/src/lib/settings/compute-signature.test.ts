// The grid-rebuild signature is a silent-failure trap: if a NEW time-affecting setting is
// added to PrayerSettings but not wired into COMPUTE_KEYS, the Bönetider map keeps rendering
// the OLD grid after the user changes it — wrong prayer lines, no error, no crash. These
// tests pin two contracts: (1) the signature reacts to exactly the time-affecting fields and
// nothing else, and (2) every PrayerSettings field is consciously classified as either
// time-affecting or cosmetic — so adding a field forces a decision here. Same anti-drift
// philosophy as options.test.ts.
import { describe, expect, it } from '@jest/globals';

import { COMPUTE_KEYS, computeSignature } from './compute-signature';
import { DEFAULT_SETTINGS, type PrayerSettings } from './types';

// Hand-listed authoritative classifications, written independently of COMPUTE_KEYS so the
// test catches drift in both directions.
const TIME_AFFECTING_KEYS = [
  'calculationMethod',
  'madhab',
  'highLatitudeRule',
  'polarCircleResolution',
  'shafaq',
  'adjustments',
  'rounding',
] as const satisfies readonly (keyof PrayerSettings)[];

const COSMETIC_KEYS = [
  'hijriOffset',
  'notifications',
  'locationMode',
  'manualLocation',
  'theme',
  'mapStyle',
  'haptics',
] as const satisfies readonly (keyof PrayerSettings)[];

// A settings object that differs from DEFAULT_SETTINGS in EVERY field, so flipping any one
// field onto the default is a real change. Each value is a valid member of its type.
const ALT: PrayerSettings = {
  calculationMethod: 'Egyptian',
  madhab: 'hanafi',
  highLatitudeRule: 'twilightAngle',
  polarCircleResolution: 'unresolved',
  shafaq: 'ahmer',
  adjustments: { fajr: 7, sunrise: 1, dhuhr: 2, asr: 3, maghrib: 4, isha: 5 },
  rounding: 'up',
  hijriOffset: 1,
  notifications: {
    enabled: true,
    leadMinutes: 15,
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
  },
  locationMode: 'manual',
  manualLocation: { name: 'Test', latitude: 60, longitude: 15 },
  theme: 'dark',
  mapStyle: 'standard',
  haptics: false,
};

describe('computeSignature — reacts to time-affecting fields only', () => {
  it('changes when any time-affecting field changes', () => {
    const base = computeSignature(DEFAULT_SETTINGS);
    for (const key of TIME_AFFECTING_KEYS) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(computeSignature(mutated)).not.toBe(base);
    }
  });

  it('does NOT change when a cosmetic field changes (avoids needless grid rebuilds)', () => {
    const base = computeSignature(DEFAULT_SETTINGS);
    for (const key of COSMETIC_KEYS) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(computeSignature(mutated)).toBe(base);
    }
  });
});

describe('completeness — every setting is classified, and COMPUTE_KEYS matches', () => {
  it('COMPUTE_KEYS is exactly the time-affecting set', () => {
    // If a field is added to COMPUTE_KEYS but not to the hand-list (or vice versa), this
    // fails — the signature must include precisely the time-affecting fields.
    expect([...COMPUTE_KEYS].sort()).toEqual([...TIME_AFFECTING_KEYS].sort());
  });

  it('classifies every PrayerSettings field (a new field forces a decision)', () => {
    // The strong drift guard: a new field added to the type + DEFAULT_SETTINGS but left out
    // of BOTH lists fails here, forcing the author to decide whether it affects the grid.
    const classified = [...TIME_AFFECTING_KEYS, ...COSMETIC_KEYS].sort();
    expect(classified).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    // No key counted twice.
    expect(new Set(classified).size).toBe(classified.length);
  });
});
