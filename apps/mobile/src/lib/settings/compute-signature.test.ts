// The grid-rebuild signature is a silent-failure trap: if a NEW time-affecting setting is
// added to PrayerSettings but not wired into COMPUTE_KEYS, the Bönetider map keeps rendering
// the OLD grid after the user changes it — wrong prayer lines, no error, no crash. These
// tests pin two contracts: (1) the signature reacts to exactly the time-affecting fields and
// nothing else, and (2) every PrayerSettings field is consciously classified as either
// time-affecting or cosmetic — so adding a field forces a decision here. Same anti-drift
// philosophy as options.test.ts.
import { describe, expect, it } from '@jest/globals';

import {
  COMPUTE_KEYS,
  computeSignature,
  notificationSignature,
  widgetSignature,
} from './compute-signature';
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
  'showMosques',
  // Cosmetic, deliberately: the qibla arc is a fixed direction drawn over the map. It
  // reads no prayer time and changes none, so toggling it must NOT rebuild the 3752-point
  // grid — that would be a 40–70 ms JS-thread stall to hide one thin line.
  'showQibla',
  // Cosmetic for the same reason: the night's midpoint and last third are derived from
  // the day adhan has ALREADY computed for the user's own position (see lib/night-times),
  // never from the country-wide lattice the signature invalidates. Revealing them changes
  // what is listed, not what is calculated.
  'showNightTimes',
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
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    fajrWindowEnd: true,
    lead: { fajr: 15, sunrise: 30, dhuhr: 15, asr: 15, maghrib: 15, isha: 15 },
    sound: {
      fajr: 'silent',
      sunrise: 'silent',
      dhuhr: 'silent',
      asr: 'silent',
      maghrib: 'silent',
      isha: 'silent',
    },
    lastThird: true,
    lastThirdSound: 'silent',
  },
  locationMode: 'manual',
  manualLocation: { name: 'Test', latitude: 60, longitude: 15 },
  theme: 'dark',
  showMosques: false,
  showQibla: false,
  showNightTimes: true,
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

describe('notificationSignature', () => {
  it('changes for prayer-time settings and notification settings', () => {
    const base = notificationSignature(DEFAULT_SETTINGS);
    for (const key of TIME_AFFECTING_KEYS) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(notificationSignature(mutated)).not.toBe(base);
    }
    expect(notificationSignature({ ...DEFAULT_SETTINGS, notifications: ALT.notifications })).not.toBe(base);
  });

  // notificationSignature hashes `s.notifications` WHOLESALE, so the per-prayer lead,
  // the per-prayer sound and the Fajr-window flag are all covered automatically today.
  // These pins exist so that a future "optimisation" to a curated field list cannot
  // silently stop re-scheduling when a user changes a sound — a failure with no error,
  // no crash, and alerts that keep arriving with the old setting until something else
  // happens to change.
  it('re-syncs when a per-prayer lead, a per-prayer sound, or the window flag changes', () => {
    const base = notificationSignature(DEFAULT_SETTINGS);
    const n = DEFAULT_SETTINGS.notifications;

    const lead: PrayerSettings = {
      ...DEFAULT_SETTINGS,
      notifications: { ...n, lead: { ...n.lead, fajr: n.lead.fajr + 10 } },
    };
    expect(notificationSignature(lead)).not.toBe(base);

    const sound: PrayerSettings = {
      ...DEFAULT_SETTINGS,
      notifications: { ...n, sound: { ...n.sound, fajr: 'silent' } },
    };
    expect(notificationSignature(sound)).not.toBe(base);

    const windowEnd: PrayerSettings = {
      ...DEFAULT_SETTINGS,
      notifications: { ...n, fajrWindowEnd: !n.fajrWindowEnd },
    };
    expect(notificationSignature(windowEnd)).not.toBe(base);
  });

  it('ignores settings that cannot affect notification scheduling', () => {
    const base = notificationSignature(DEFAULT_SETTINGS);
    for (const key of ['hijriOffset', 'locationMode', 'manualLocation', 'theme', 'showMosques', 'haptics'] as const) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(notificationSignature(mutated)).toBe(base);
    }
  });
});

describe('widgetSignature', () => {
  it('changes for prayer-time settings and Hijri display settings', () => {
    const base = widgetSignature(DEFAULT_SETTINGS);
    for (const key of TIME_AFFECTING_KEYS) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(widgetSignature(mutated)).not.toBe(base);
    }
    expect(widgetSignature({ ...DEFAULT_SETTINGS, hijriOffset: ALT.hijriOffset })).not.toBe(base);
  });

  it('changes for the appearance preference — the widget renders it too', () => {
    // `theme` is not a time-affecting setting, but it IS copied into every
    // WidgetPayload and the widget honours an explicit light/dark lock rather than
    // WidgetKit's colour scheme. This signature is what re-pushes the timeline, so
    // when it ignored `theme` (as it once did, and as the sibling test below used to
    // assert) switching Utseende re-themed the app instantly while the home-screen
    // widget kept the old palette until the app was next backgrounded and reopened.
    expect(widgetSignature({ ...DEFAULT_SETTINGS, theme: ALT.theme })).not.toBe(
      widgetSignature(DEFAULT_SETTINGS),
    );
  });

  it('ignores settings that cannot affect the widget payload', () => {
    const base = widgetSignature(DEFAULT_SETTINGS);
    for (const key of ['notifications', 'locationMode', 'manualLocation', 'haptics'] as const) {
      const mutated: PrayerSettings = { ...DEFAULT_SETTINGS, [key]: ALT[key] };
      expect(widgetSignature(mutated)).toBe(base);
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
