// Coordinate-validation contract. A GPS fix can arrive as NaN (no lock yet) and a corrupt
// or hand-edited manual location can be out of range. Those must degrade to an honest "—",
// NEVER to a confidently-WRONG time: out-of-range-but-finite coordinates (e.g. latitude
// 200°) feed adhan numbers that yield plausible-looking but meaningless times, which is
// worse than showing nothing. This pins that every downstream consumer of bad coordinates
// stays graceful — no throw, no `NaN`/`Invalid Date` leaking to the UI.
import { describe, expect, it } from '@jest/globals';

import { computePrayerTimes, formatTime, PRAYER_ORDER, selectNextPrayer } from './prayer-times';
import { qiblaBearing, qiblaDistanceKm } from './qibla';
import { nearestPlace } from './places/nearest';
import { DEFAULT_SETTINGS } from './settings/types';
import { startOfZoneDay, zonePrayerDate } from './zone-time';

const DAY = new Date(2026, 5, 21, 12, 0, 0);
const STOCKHOLM_COORDS = { latitude: 59.32938, longitude: 18.06871 };
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

describe('computePrayerTimes — an unplaceable slot only ever invalidates ITSELF', () => {
  // Second emulator QA pass, 2026-08-25. The ordering guard above was a left-to-right chain,
  // so it always blamed the LATER slot of a bad pair — and above the Arctic Circle the
  // wanderer is usually an EARLY one, which meant a single bad value took the rest of the
  // evening down with it. Anchoring on Ẓuhr (solar transit: no search, no twilight angle, no
  // substitution, and therefore the only slot that is never wrong) fixes the direction of
  // blame. See the guard's own comment for the full reasoning.
  const KIRUNA = { latitude: 67.85572, longitude: 20.22513 };
  const HANAFI = { ...DEFAULT_SETTINGS, madhab: 'hanafi' as const };
  const UNRESOLVED = { ...DEFAULT_SETTINGS, polarCircleResolution: 'unresolved' as const };
  const hhmm = /^\d{2}[:.]\d{2}$/;

  it('a runaway ʿAṣr no longer takes Maghrib and ʿIshāʾ down with it (Kiruna, 9 Jan 2026, hanafi)', () => {
    // The exact case seen on screen: the shadow ratio never occurs in polar winter, so adhan's
    // ʿAṣr search fell through and returned 30 January — three weeks out. The old chain made
    // that the high-water mark, so the day's REAL Maghrib (13:03) and ʿIshāʾ (16:01) were both
    // blanked for "regressing" past it, and the dock showed "ʿAṣr 06:51" under "Ẓuhr 11:51"
    // with two empty evening rows. On a Kiruna day with barely two hours of sun those are the
    // two times a reader most needs, and they were correct all along.
    const times = computePrayerTimes(KIRUNA, new Date(2026, 0, 9, 12, 0, 0), HANAFI);
    expect(formatTime(times.asr)).toBe('–');
    expect(formatTime(times.maghrib)).toMatch(hhmm);
    expect(formatTime(times.isha)).toMatch(hhmm);
  });

  it('a bogus Sunrise cannot unseat Ẓuhr (Kiruna, 11 Dec 2026, polar resolution "unresolved")', () => {
    // On the day the sun stops rising, adhan's solver returns roots that are not of this day:
    // Sunrise 14:18 — AFTER that day's own solar noon of 11:37 — beside a Maghrib of 01:03,
    // in the small hours before it. The old chain took Sunrise as its opening high-water mark
    // and blanked Ẓuhr and Maghrib to protect it, leaving "Shurūq 14:18" above an empty Ẓuhr.
    const times = computePrayerTimes(KIRUNA, new Date(2026, 11, 11, 12, 0, 0), UNRESOLVED);
    expect(formatTime(times.dhuhr)).toMatch(hhmm);
    expect(formatTime(times.sunrise)).toBe('–');
  });

  it('keeps invalidating ʿIshāʾ when it truly precedes its own Maghrib (Kiruna, 14 Jun 2026)', () => {
    // The original polar regression, unchanged by the re-anchoring: midsummer gives Maghrib
    // 00:36 and ʿIshāʾ 00:32, four minutes earlier. ʿIshāʾ rides the twilight rule and Maghrib
    // is geometry, so ʿIshāʾ is the one that goes.
    const times = computePrayerTimes(KIRUNA, new Date(2026, 5, 14, 12, 0, 0), DEFAULT_SETTINGS);
    expect(formatTime(times.maghrib)).toMatch(hhmm);
    expect(formatTime(times.isha)).toBe('–');
  });

  it('shows a Maghrib on every single day of the year, at every latitude in Sweden', () => {
    // Sunset is geometry, and under the default aqrabBalad adhan always has an answer for it.
    // Before the re-anchoring this was FALSE — Maghrib went missing on the runaway-ʿAṣr days,
    // which is how the bug was found — so this is the assertion that would catch a return to
    // any guard that lets one slot invalidate another after it.
    for (const [name, coords] of [
      ['Kiruna', KIRUNA],
      ['Karesuando', { latitude: 68.43959, longitude: 22.47047 }],
    ] as const) {
      for (const s of [DEFAULT_SETTINGS, HANAFI]) {
        for (let i = 0; i < 365; i++) {
          const day = new Date(2026, 0, 1 + i, 12);
          const times = computePrayerTimes(coords, day, s);
          if (Number.isNaN(times.maghrib.getTime()))
            throw new Error(`${name} has no Maghrib on ${day.toDateString()} (madhab ${s.madhab})`);
        }
      }
    }
  });

  it('what the READER sees never reads backwards — the printed hh:mm, in row order', () => {
    // Deliberately NOT the instant comparison the sibling test above makes. A time reaches the
    // reader as a bare "06:51", so comparing timestamps proves nothing about the screen: ʿAṣr
    // 06:51 under Ẓuhr 11:51 WAS 30 January, genuinely later than 9 January, and still nonsense
    // to read. So this compares the formatted strings — which, being zero-padded HH:MM, sort
    // exactly as the clock does — walking the six rows in the order the dock renders them.
    //
    // Slots that legitimately fall outside the displayed day are skipped rather than failed: a
    // Maghrib after midnight is real at these latitudes (Kiruna, 14 June: 00:36) and the dock
    // marks it as another day instead of hiding it. The window comes from startOfZoneDay, not
    // from `new Date(2026, 0, n)`: formatTime renders in getDisplayZone() (Europe/Stockholm),
    // while a bare Date constructor is MACHINE-local — on a UTC CI runner the two would
    // disagree by an hour or two and this would skip the wrong rows.
    //
    // Unlike the four cases above this does not fail on the pre-fix code — the old chain
    // reached these rows by BLANKING Ẓuhr, ʿAṣr and Maghrib rather than by mis-ordering them,
    // which is what the bogus-Sunrise test pins. It stands as the invariant every future change
    // to the guard has to keep, stated in the terms the reader actually experiences. UNRESOLVED
    // is in the list because it is a real Beräkning setting and produces the strangest values.
    const backwards: string[] = [];
    for (const coords of [KIRUNA, { latitude: 68.43959, longitude: 22.47047 }]) {
      for (const s of [DEFAULT_SETTINGS, HANAFI, UNRESOLVED]) {
        for (let i = 0; i < 365; i++) {
          const dayStart = startOfZoneDay(new Date(2026, 0, 1 + i, 12).getTime());
          const dayEnd = startOfZoneDay(dayStart + 26 * 3600_000);
          const times = computePrayerTimes(coords, zonePrayerDate(dayStart), s);
          let lastShown = '';
          let lastKey = '';
          for (const key of PRAYER_ORDER) {
            const at = times[key].getTime();
            if (Number.isNaN(at) || at < dayStart || at >= dayEnd) continue;
            const shown = formatTime(times[key]);
            if (shown < lastShown) {
              backwards.push(
                `${coords.latitude}/${s.madhab}/${s.polarCircleResolution} day ${i + 1}: ` +
                  `${lastKey} ${lastShown} then ${key} ${shown}`,
              );
            }
            lastShown = shown;
            lastKey = key;
          }
        }
      }
    }
    // Collected and asserted once. Called per row this would be ~13 000 expect() invocations,
    // and the assertion machinery — not the astronomy — is what makes that slow.
    expect(backwards).toEqual([]);
  });

  it('never shows an ʿAṣr that outlasts the night it is supposed to precede', () => {
    const unbounded: string[] = [];
    for (const s of [DEFAULT_SETTINGS, HANAFI]) {
      for (let i = 0; i < 365; i++) {
        const times = computePrayerTimes(KIRUNA, new Date(2026, 0, 1 + i, 12), s);
        const asr = times.asr.getTime();
        if (Number.isNaN(asr)) continue;
        // Whichever boundary the day has, ʿAṣr sits inside it.
        const night = Number.isNaN(times.maghrib.getTime())
          ? times.isha.getTime()
          : times.maghrib.getTime();
        if (Number.isNaN(night) || asr > night || asr < times.dhuhr.getTime())
          unbounded.push(`${s.madhab} day ${i + 1}: asr ${formatTime(times.asr)} night ${formatTime(new Date(night))}`);
      }
    }
    expect(unbounded).toEqual([]);
  });
});

describe('selectNextPrayer — the countdown never points backwards', () => {
  // The dock renders any gap ≤ 0 as "nu" (see countdownParts), so a `next` in the past is not
  // a small numeric error — it pins the hero on "nu" at an instant when nothing is due, with
  // nothing on screen admitting it.
  const TRERIKSROSET = { latitude: 69.0601, longitude: 20.5486 };
  const MIDNIGHT_RULE = { ...DEFAULT_SETTINGS, highLatitudeRule: 'middleOfTheNight' as const };

  it('drops a next-day Fajr that falls before the viewed instant (Treriksröset, 28 Mar 2026)', () => {
    // Under the middle-of-the-night rule Fajr sits at the middle of the night, and this far
    // north around the equinox that lands just BEFORE midnight: the Fajr belonging to 28 March
    // falls at 23:59 on the 27th. The reader is at 00:00 on the 28th, so it is a minute in the
    // past — and it used to be handed to the dock unchecked.
    const times = computePrayerTimes(TRERIKSROSET, new Date(2026, 2, 27, 12), MIDNIGHT_RULE);
    const nextFajr = computePrayerTimes(TRERIKSROSET, new Date(2026, 2, 28, 12), MIDNIGHT_RULE).fajr.getTime();
    const now = new Date(2026, 2, 28, 0, 0, 0).getTime();
    // Guard the guard: if adhan stops placing it before midnight, the assertion below is vacuous.
    expect(nextFajr).toBeLessThan(now);
    expect(selectNextPrayer(times, nextFajr, now)).toBeNull();
  });

  it('still hands over a next-day Fajr that is genuinely ahead', () => {
    // The ordinary evening case, which must not be caught by the range check.
    const times = computePrayerTimes(STOCKHOLM_COORDS, new Date(2026, 5, 21, 12), DEFAULT_SETTINGS);
    const nextFajr = computePrayerTimes(STOCKHOLM_COORDS, new Date(2026, 5, 22, 12), DEFAULT_SETTINGS).fajr.getTime();
    const lateEvening = new Date(2026, 5, 21, 23, 55, 0).getTime();
    const picked = selectNextPrayer(times, nextFajr, lateEvening);
    expect(picked).toEqual({ key: 'fajr', at: nextFajr, nextDay: true });
  });

  it('prefers the viewed day own slot, inclusively, over the next-day fallback', () => {
    // Landing EXACTLY on a prayer selects that prayer — the behaviour the dock's tap-to-scrub
    // depends on, restated here because selectNextPrayer is now the thing the screen calls.
    const times = computePrayerTimes(STOCKHOLM_COORDS, new Date(2026, 5, 21, 12), DEFAULT_SETTINGS);
    const dhuhrAt = times.dhuhr.getTime();
    expect(selectNextPrayer(times, null, dhuhrAt)).toEqual({ key: 'dhuhr', at: dhuhrAt, nextDay: false });
  });

  it('never returns a prayer in the past, swept over a year at every latitude and rule', () => {
    // The property the three examples above are instances of. Sampled every 20 minutes across
    // each day, which is what the scrubber can land on. Offenders are collected and asserted
    // ONCE: an expect() per sample is ~50 000 calls, and the assertion machinery rather than
    // the astronomy is what would make that slow.
    const backwards: string[] = [];
    for (const coords of [STOCKHOLM_COORDS, TRERIKSROSET, { latitude: 67.85572, longitude: 20.22513 }]) {
      for (const s of [DEFAULT_SETTINGS, MIDNIGHT_RULE]) {
        for (let i = 0; i < 365; i += 3) {
          const dayStart = startOfZoneDay(new Date(2026, 0, 1 + i, 12).getTime());
          const times = computePrayerTimes(coords, zonePrayerDate(dayStart), s);
          const nextFajr = computePrayerTimes(coords, zonePrayerDate(dayStart, 1), s).fajr.getTime();
          for (let t = dayStart; t <= dayStart + 24 * 3600_000; t += 20 * 60_000) {
            const picked = selectNextPrayer(times, Number.isFinite(nextFajr) ? nextFajr : null, t);
            if (picked && picked.at < t)
              backwards.push(`${coords.latitude}/${s.highLatitudeRule} day ${i + 1}: ${picked.key} is ${((t - picked.at) / 60_000).toFixed(0)} min in the past`);
          }
        }
      }
    }
    expect(backwards).toEqual([]);
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
