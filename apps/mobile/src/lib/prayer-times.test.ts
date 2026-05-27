import { describe, expect, it } from '@jest/globals';
import { Coordinates, HighLatitudeRule, Madhab } from 'adhan';

import { buildParams, computePrayerTimes, formatTime } from './prayer-times';
import { DEFAULT_SETTINGS, type PrayerAdjustments, type PrayerSettings } from './settings/types';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
// A spring day where every prayer is computable at Stockholm — stable reference.
const SPRING_DAY = new Date(2026, 2, 20); // 20 Mar 2026

type Overrides = Partial<Omit<PrayerSettings, 'adjustments'>> & {
  adjustments?: Partial<PrayerAdjustments>;
};

function settings(overrides: Overrides = {}): PrayerSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    adjustments: { ...DEFAULT_SETTINGS.adjustments, ...(overrides.adjustments ?? {}) },
  };
}

describe('buildParams', () => {
  it('maps madhab to the adhan enum', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    expect(buildParams(settings({ madhab: 'shafi' }), coords).madhab).toBe(Madhab.Shafi);
    expect(buildParams(settings({ madhab: 'hanafi' }), coords).madhab).toBe(Madhab.Hanafi);
  });

  it("resolves 'auto' high-latitude rule via HighLatitudeRule.recommended()", () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    const expected = HighLatitudeRule.recommended(coords);
    expect(buildParams(settings({ highLatitudeRule: 'auto' }), coords).highLatitudeRule).toBe(expected);
  });

  it('passes an explicit high-latitude rule through unchanged', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    expect(buildParams(settings({ highLatitudeRule: 'middleOfTheNight' }), coords).highLatitudeRule).toBe(
      HighLatitudeRule.MiddleOfTheNight,
    );
  });

  it('forwards manual minute adjustments onto the params', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    const params = buildParams(settings({ adjustments: { fajr: 5, isha: -3 } }), coords);
    expect(params.adjustments.fajr).toBe(5);
    expect(params.adjustments.isha).toBe(-3);
  });
});

describe('computePrayerTimes', () => {
  it('produces six ordered, valid times for Stockholm in spring', () => {
    const pt = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings());
    const order = [pt.fajr, pt.sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha];
    for (const t of order) {
      expect(t instanceof Date).toBe(true);
      expect(Number.isNaN(t.getTime())).toBe(false);
    }
    // Times must be strictly increasing across the day.
    for (let i = 1; i < order.length; i++) {
      expect(order[i].getTime()).toBeGreaterThan(order[i - 1].getTime());
    }
  });

  it('reflects a manual +10 min Fajr adjustment', () => {
    const base = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings());
    const adjusted = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings({ adjustments: { fajr: 10 } }));
    const deltaMin = (adjusted.fajr.getTime() - base.fajr.getTime()) / 60000;
    expect(Math.round(deltaMin)).toBe(10);
  });

  // The reason this whole feature needs PolarCircleResolution: above the Arctic
  // Circle in midsummer, angle-based Fajr/Isha have no solution. 'unresolved'
  // yields Invalid Date; 'aqrabBalad' must recover real times — regressing this
  // would silently blank prayer times for northern Sweden.
  it('keeps Kiruna midsummer times derivable only with a polar resolution', () => {
    const midsummer = new Date(2026, 5, 21); // 21 Jun 2026
    const unresolved = computePrayerTimes(KIRUNA, midsummer, settings({ polarCircleResolution: 'unresolved' }));
    expect(Number.isNaN(unresolved.isha.getTime())).toBe(true);

    const aqrabBalad = computePrayerTimes(KIRUNA, midsummer, settings({ polarCircleResolution: 'aqrabBalad' }));
    expect(Number.isNaN(aqrabBalad.isha.getTime())).toBe(false);
    expect(Number.isNaN(aqrabBalad.fajr.getTime())).toBe(false);
  });
});

describe('formatTime', () => {
  it('renders 24h times in Europe/Stockholm and a dash for uncomputable times', () => {
    // 20 Mar 2026 is before DST starts, so Europe/Stockholm = CET (UTC+1). Sweden uses
    // the 24-hour clock exclusively, so there is no 12-hour path to format.
    const noon = new Date(Date.UTC(2026, 2, 20, 11, 0)); // 12:00 local
    expect(formatTime(noon)).toMatch(/^12[:.]00$/);
    const afternoon = new Date(Date.UTC(2026, 2, 20, 13, 0)); // 14:00 local — never "2"
    expect(formatTime(afternoon)).toMatch(/14[:.]00/);
    expect(formatTime(new Date(NaN))).toBe('—');
  });
});
