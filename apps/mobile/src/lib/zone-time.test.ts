// Calendar-day arithmetic in the app's display zone. Everything the app calls "a day" — the
// solar field, the scrubber's 0→1 range, the dock's schedule, the day stepper — is anchored
// to a midnight in that zone, and a zone with DST has two days a year that are not 24 hours
// long. Those two days are where day arithmetic goes wrong, so they are what this file is
// mostly about.
//
// EVERYTHING DOWN TO THE "display zone" BLOCK RUNS IN THE DEFAULT ZONE, Europe/Stockholm,
// and that is a deliberate choice rather than a leftover from before the rename: the DST
// cases below are named, dated Swedish transitions (29 March, 25 October 2026) and they
// assert real facts about a real calendar. Rewriting them zone-agnostically would turn
// concrete, checkable dates into a tautology. The zone being a variable at all is what the
// final block tests.
import { afterEach, describe, expect, it } from '@jest/globals';

import {
  addZoneDays,
  DEFAULT_ZONE,
  getDisplayZone,
  setDisplayZone,
  startOfZoneDay,
  zoneDayLength,
  zoneParts,
} from './zone-time';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The Stockholm calendar date of an instant, as "YYYY-MM-DD" — how a test says which
 *  day it landed on without depending on the UTC offset that day happens to have. */
function zoneDate(epoch: number): string {
  const { y, mo, d } = zoneParts(epoch);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Sweden switches on the last Sunday of March and October, at 01:00 UTC.
//   2026-03-29 — clocks go 02:00 → 03:00. A 23-hour day.
//   2026-10-25 — clocks go 03:00 → 02:00. A 25-hour day.
const SPRING_FORWARD = startOfZoneDay(Date.UTC(2026, 2, 29, 12));
const FALL_BACK = startOfZoneDay(Date.UTC(2026, 9, 25, 12));
const ORDINARY = startOfZoneDay(Date.UTC(2026, 6, 15, 12));

describe('zoneDayLength', () => {
  it('reports 23, 24 and 25 hours across the two transitions', () => {
    expect(zoneDayLength(ORDINARY)).toBe(24 * HOUR);
    expect(zoneDayLength(SPRING_FORWARD)).toBe(23 * HOUR);
    expect(zoneDayLength(FALL_BACK)).toBe(25 * HOUR);
  });
});

describe('addZoneDays', () => {
  it('steps to the next and previous calendar day', () => {
    expect(zoneDate(addZoneDays(ORDINARY, 1))).toBe('2026-07-16');
    expect(zoneDate(addZoneDays(ORDINARY, -1))).toBe('2026-07-14');
    expect(zoneDate(addZoneDays(ORDINARY, 0))).toBe('2026-07-15');
  });

  it('always lands exactly on a midnight in the display zone', () => {
    for (const days of [-400, -31, -1, 0, 1, 31, 400]) {
      const stepped = addZoneDays(ORDINARY, days);
      expect(startOfZoneDay(stepped)).toBe(stepped);
      expect(zoneParts(stepped).h).toBe(0);
    }
  });

  // THE REGRESSION GUARD. On the 25-hour day, `dayStart + 86_400_000` lands at 23:00 of
  // the SAME calendar day — so a naive step forward moves nothing at all, and the day
  // stepper appears frozen once a year with no error and no crash. Written as a direct
  // comparison against the naive expression so the failure message names the bug.
  it('crosses the 25-hour autumn day, where a naive +24 h does not', () => {
    expect(zoneDate(FALL_BACK)).toBe('2026-10-25');
    // What a naive implementation would compute: still 25 October.
    expect(zoneDate(startOfZoneDay(FALL_BACK + DAY))).toBe('2026-10-25');
    // What this function computes: 26 October.
    expect(zoneDate(addZoneDays(FALL_BACK, 1))).toBe('2026-10-26');
    // And the step is 25 hours of real time, not 24 — the length of that actual day.
    expect(addZoneDays(FALL_BACK, 1) - FALL_BACK).toBe(25 * HOUR);
  });

  it('crosses the 23-hour spring day, stepping only 23 hours of real time', () => {
    expect(zoneDate(SPRING_FORWARD)).toBe('2026-03-29');
    expect(zoneDate(addZoneDays(SPRING_FORWARD, 1))).toBe('2026-03-30');
    expect(addZoneDays(SPRING_FORWARD, 1) - SPRING_FORWARD).toBe(23 * HOUR);
  });

  it('steps back onto a transition day just as cleanly', () => {
    expect(zoneDate(addZoneDays(FALL_BACK, -1))).toBe('2026-10-24');
    expect(zoneDate(addZoneDays(addZoneDays(FALL_BACK, 1), -1))).toBe('2026-10-25');
    expect(zoneDate(addZoneDays(addZoneDays(SPRING_FORWARD, 1), -1))).toBe(
      '2026-03-29',
    );
  });

  // The property the day stepper's rails depend on: stepping n days forward and n back
  // must return the exact same instant, whatever transitions are crossed on the way. If
  // it drifted, a user who paged a year forward and back would not land on today.
  it('round-trips exactly across a whole year of both transitions', () => {
    for (const anchor of [ORDINARY, SPRING_FORWARD, FALL_BACK]) {
      for (const days of [1, 7, 200, 365]) {
        expect(addZoneDays(addZoneDays(anchor, days), -days)).toBe(anchor);
      }
    }
  });

  // Anchoring on today and adding an OFFSET (what stepDay does) must agree with walking
  // one day at a time. This is what makes stepping idempotent and drift-free.
  it('agrees with repeated single steps', () => {
    let walked = FALL_BACK;
    for (let i = 0; i < 10; i++) walked = addZoneDays(walked, 1);
    expect(addZoneDays(FALL_BACK, 10)).toBe(walked);
  });

  it('crosses month and year boundaries', () => {
    const newYearsEve = startOfZoneDay(Date.UTC(2026, 11, 31, 12));
    expect(zoneDate(addZoneDays(newYearsEve, 1))).toBe('2027-01-01');
    expect(zoneDate(addZoneDays(newYearsEve, -365))).toBe('2025-12-31');
    const endOfFebruary = startOfZoneDay(Date.UTC(2028, 1, 28, 12)); // 2028 is a leap year
    expect(zoneDate(addZoneDays(endOfFebruary, 1))).toBe('2028-02-29');
  });
});

// ── The zone is no longer a constant ─────────────────────────────────────────────────────
//
// Everything above is about Sweden's calendar and is written against the DEFAULT zone. This
// block is about the fact that there is a default at all: prayer times are computed from
// coordinates, so a reader on umrah gets Mecka's times — and used to get them printed on a
// Stockholm clock, with a "today" that ended at 01:00. What follows pins the two things
// that must move with the zone (the day boundary and the wall-clock parts) and the two that
// must not (an unusable zone name, and the default itself).
describe('display zone', () => {
  it('does not reuse a day length from another zone for the same epoch', () => {
    setDisplayZone(DEFAULT_ZONE);
    expect(zoneDayLength(SPRING_FORWARD)).toBe(23 * HOUR);
    setDisplayZone('UTC');
    expect(zoneDayLength(SPRING_FORWARD)).toBe(
      startOfZoneDay(SPRING_FORWARD + 26 * HOUR) - SPRING_FORWARD,
    );
    setDisplayZone(DEFAULT_ZONE);
    expect(zoneDayLength(SPRING_FORWARD)).toBe(23 * HOUR);
  });
  afterEach(() => setDisplayZone(DEFAULT_ZONE));

  it('defaults to Sweden', () => {
    expect(getDisplayZone()).toBe('Europe/Stockholm');
  });

  it('moves the day boundary to the new zone', () => {
    // 2026-07-15T23:30Z is already the 16th in Riyadh (UTC+3) and still the 16th in
    // Stockholm (UTC+2 in summer) — so pick an instant where the two genuinely disagree:
    // 21:30Z is the 15th in Stockholm (23:30) and the 16th in Riyadh (00:30).
    const instant = Date.UTC(2026, 6, 15, 21, 30);
    const inSweden = zoneDate(startOfZoneDay(instant));

    setDisplayZone('Asia/Riyadh');

    expect(inSweden).toBe('2026-07-15');
    expect(zoneDate(startOfZoneDay(instant))).toBe('2026-07-16');
  });

  it('reports the new zone\'s wall clock', () => {
    const noonUTC = Date.UTC(2026, 6, 15, 12);
    expect(zoneParts(noonUTC).h).toBe(14); // CEST, UTC+2

    setDisplayZone('Asia/Riyadh');
    expect(zoneParts(noonUTC).h).toBe(15); // AST, UTC+3, no DST
  });

  it('has no short or long days in a zone that does not observe DST', () => {
    setDisplayZone('Asia/Riyadh');
    // The same two dates that are 23 and 25 hours long in Sweden.
    expect(zoneDayLength(startOfZoneDay(Date.UTC(2026, 2, 29, 12)))).toBe(24 * HOUR);
    expect(zoneDayLength(startOfZoneDay(Date.UTC(2026, 9, 25, 12)))).toBe(24 * HOUR);
  });

  it('refuses a zone it cannot use rather than falling through to UTC', () => {
    // The lazy formatter degrades to raw UTC when Intl cannot build it, and UTC is nobody's
    // local time. A typo in a zone name must therefore land on the default, not on that.
    setDisplayZone('Mars/Olympus_Mons');
    expect(getDisplayZone()).toBe('Europe/Stockholm');
    expect(zoneParts(Date.UTC(2026, 6, 15, 12)).h).toBe(14);
  });

  it('treats an absent or blank zone as the default', () => {
    setDisplayZone('Asia/Riyadh');
    setDisplayZone(undefined);
    expect(getDisplayZone()).toBe('Europe/Stockholm');

    setDisplayZone('Asia/Riyadh');
    setDisplayZone('   ');
    expect(getDisplayZone()).toBe('Europe/Stockholm');
  });
});
