// Coordinate-validation contract. A GPS fix can arrive as NaN (no lock yet) and a corrupt
// or hand-edited manual location can be out of range. Those must degrade to an honest "—",
// NEVER to a confidently-WRONG time: out-of-range-but-finite coordinates (e.g. latitude
// 200°) feed adhan numbers that yield plausible-looking but meaningless times, which is
// worse than showing nothing. This pins that every downstream consumer of bad coordinates
// stays graceful — no throw, no `NaN`/`Invalid Date` leaking to the UI.
import { describe, expect, it } from '@jest/globals';

import { computePrayerTimes, formatTime, PRAYER_ORDER } from './prayer-times';
import { qiblaBearing, qiblaDistanceKm } from './qibla';
import { nearestPlace } from './places/nearest';
import { DEFAULT_SETTINGS } from './settings/types';

const DAY = new Date(2026, 5, 21, 12, 0, 0);
const BAD_COORDS = [
  { latitude: Number.NaN, longitude: 18 },
  { latitude: 59, longitude: Number.NaN },
  { latitude: 200, longitude: 18 }, // out of range but finite — the dangerous case
  { latitude: 59, longitude: 999 },
  { latitude: Number.POSITIVE_INFINITY, longitude: Number.NEGATIVE_INFINITY },
  // Just past the valid bounds — pins that the range check is exactly ±90 / ±180 (a loosened
  // bound like ≤91 / ≤181 would let these through to adhan).
  { latitude: 90.5, longitude: 18 },
  { latitude: 59, longitude: 180.5 },
];

describe('computePrayerTimes — invalid coordinates degrade to "—", never a wrong time', () => {
  for (const coords of BAD_COORDS) {
    it(`renders every slot as "—" for ${JSON.stringify(coords)}`, () => {
      const times = computePrayerTimes(coords, DAY, DEFAULT_SETTINGS);
      for (const key of PRAYER_ORDER) {
        const shown = formatTime(times[key]);
        // The only acceptable output for garbage input is the em-dash placeholder. A real
        // HH:MM here would mean adhan computed a meaningless time from out-of-range input.
        expect(shown).toBe('–');
      }
    });
  }

  it('still computes real times for valid coordinates (the guard does not over-reach)', () => {
    const times = computePrayerTimes({ latitude: 59.33, longitude: 18.07 }, DAY, DEFAULT_SETTINGS);
    for (const key of PRAYER_ORDER) {
      expect(formatTime(times[key])).toMatch(/^\d{2}[:.]\d{2}$/);
    }
  });

  it('preserves the user resolver for valid polar coords — Kiruna midsummer Fajr/Isha resolve', () => {
    // The guard only swaps in the no-op Unresolved resolver for INVALID coords. For valid
    // far-north coords under the default aqrabBalad, adhan must still resolve Fajr and Isha
    // (borrowing the nearest real night) — they must NOT come back as "—". This pins that the
    // guard doesn't over-reach and force Unresolved on good input.
    const kiruna = computePrayerTimes({ latitude: 67.86, longitude: 20.23 }, DAY, DEFAULT_SETTINGS);
    expect(formatTime(kiruna.fajr)).toMatch(/^\d{2}[:.]\d{2}$/);
    expect(formatTime(kiruna.isha)).toMatch(/^\d{2}[:.]\d{2}$/);
  });
});

describe('computePrayerTimes — chronological order never inverts (Kiruna polar season)', () => {
  // Found live in the app (emulator QA pass, 2026-08-25): with the default settings
  // (Turkey/Diyanet, highLatitudeRule 'auto', polarCircleResolution 'aqrabBalad'), adhan's
  // AqrabBalad substitution resolves each of the six slots independently and can borrow a
  // DIFFERENT reference day per slot. At Kiruna in the depth of polar night this produced
  // 'Aṣr landing on 2026-01-07 while the same call's Fajr/Ẓuhr/Maghrib landed on 2026-01-09
  // — 'Aṣr two days before its own Fajr. A year-long sweep at Kiruna found 37 of 365 days
  // with some inversion (mostly 'Aṣr vs. Ẓuhr, or 'Ishāʾ vs. Maghrib, by minutes rather than
  // days). Any of these renders as an impossible schedule ("Isha 00:32" before "Maghrib
  // 00:36") if shown raw — worse than a "–" gap, because it makes the whole screen look
  // untrustworthy, not just the one slot.
  const KIRUNA = { latitude: 67.85572, longitude: 20.22513 };

  it("does not show 'Aṣr before its own Ẓuhr (the exact regression: Kiruna, 9 Jan 2026)", () => {
    const times = computePrayerTimes(KIRUNA, new Date(2026, 0, 9, 12, 0, 0), DEFAULT_SETTINGS);
    const dhuhrAt = times.dhuhr.getTime();
    const asrAt = times.asr.getTime();
    // Either 'Aṣr was invalidated (honest gap) or it truly falls at/after Ẓuhr — never both
    // real AND earlier, which is what shipped before this guard.
    expect(Number.isNaN(asrAt) || asrAt >= dhuhrAt).toBe(true);
  });

  it('keeps every slot that IS shown in non-decreasing chronological order, across a full polar-season sweep', () => {
    // Property, not a fixed example: for any date this library can be asked about, whatever
    // subset of the six slots comes back as a real time must read left-to-right on the clock.
    for (let month = 0; month < 12; month++) {
      for (const day of [1, 9, 15, 25]) {
        const times = computePrayerTimes(KIRUNA, new Date(2026, month, day, 12, 0, 0), DEFAULT_SETTINGS);
        let last = Number.NEGATIVE_INFINITY;
        for (const key of PRAYER_ORDER) {
          const at = times[key].getTime();
          if (Number.isNaN(at)) continue; // an honest gap breaks no invariant
          expect(at).toBeGreaterThanOrEqual(last);
          last = at;
        }
      }
    }
  });
});

describe('qibla & nearestPlace — bad coordinates fail explicitly', () => {
  it('qiblaBearing / qiblaDistanceKm reject NaN/out-of-range input instead of returning NaN', () => {
    for (const coords of BAD_COORDS) {
      expect(() => qiblaBearing(coords)).toThrow(RangeError);
      expect(() => qiblaDistanceKm(coords)).toThrow(RangeError);
    }
  });

  it('nearestPlace rejects NaN instead of silently returning the first dataset entry', () => {
    expect(() => nearestPlace(Number.NaN, Number.NaN)).toThrow(RangeError);
  });
});
