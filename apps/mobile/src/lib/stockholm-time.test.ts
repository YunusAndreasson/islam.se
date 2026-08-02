// Stockholm calendar-day arithmetic. Everything the app calls "a day" — the solar field,
// the scrubber's 0→1 range, the dock's schedule, the day stepper — is anchored to a
// Stockholm midnight, and Sweden has two days a year that are not 24 hours long. Those two
// days are where day arithmetic goes wrong, so they are what this file is mostly about.
import { describe, expect, it } from '@jest/globals';

import {
  addStockholmDays,
  startOfStockholmDay,
  stockholmDayLength,
  stockholmParts,
} from './stockholm-time';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The Stockholm calendar date of an instant, as "YYYY-MM-DD" — how a test says which
 *  day it landed on without depending on the UTC offset that day happens to have. */
function stockholmDate(epoch: number): string {
  const { y, mo, d } = stockholmParts(epoch);
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Sweden switches on the last Sunday of March and October, at 01:00 UTC.
//   2026-03-29 — clocks go 02:00 → 03:00. A 23-hour day.
//   2026-10-25 — clocks go 03:00 → 02:00. A 25-hour day.
const SPRING_FORWARD = startOfStockholmDay(Date.UTC(2026, 2, 29, 12));
const FALL_BACK = startOfStockholmDay(Date.UTC(2026, 9, 25, 12));
const ORDINARY = startOfStockholmDay(Date.UTC(2026, 6, 15, 12));

describe('stockholmDayLength', () => {
  it('reports 23, 24 and 25 hours across the two transitions', () => {
    expect(stockholmDayLength(ORDINARY)).toBe(24 * HOUR);
    expect(stockholmDayLength(SPRING_FORWARD)).toBe(23 * HOUR);
    expect(stockholmDayLength(FALL_BACK)).toBe(25 * HOUR);
  });
});

describe('addStockholmDays', () => {
  it('steps to the next and previous calendar day', () => {
    expect(stockholmDate(addStockholmDays(ORDINARY, 1))).toBe('2026-07-16');
    expect(stockholmDate(addStockholmDays(ORDINARY, -1))).toBe('2026-07-14');
    expect(stockholmDate(addStockholmDays(ORDINARY, 0))).toBe('2026-07-15');
  });

  it('always lands exactly on a Stockholm midnight', () => {
    for (const days of [-400, -31, -1, 0, 1, 31, 400]) {
      const stepped = addStockholmDays(ORDINARY, days);
      expect(startOfStockholmDay(stepped)).toBe(stepped);
      expect(stockholmParts(stepped).h).toBe(0);
    }
  });

  // THE REGRESSION GUARD. On the 25-hour day, `dayStart + 86_400_000` lands at 23:00 of
  // the SAME calendar day — so a naive step forward moves nothing at all, and the day
  // stepper appears frozen once a year with no error and no crash. Written as a direct
  // comparison against the naive expression so the failure message names the bug.
  it('crosses the 25-hour autumn day, where a naive +24 h does not', () => {
    expect(stockholmDate(FALL_BACK)).toBe('2026-10-25');
    // What a naive implementation would compute: still 25 October.
    expect(stockholmDate(startOfStockholmDay(FALL_BACK + DAY))).toBe('2026-10-25');
    // What this function computes: 26 October.
    expect(stockholmDate(addStockholmDays(FALL_BACK, 1))).toBe('2026-10-26');
    // And the step is 25 hours of real time, not 24 — the length of that actual day.
    expect(addStockholmDays(FALL_BACK, 1) - FALL_BACK).toBe(25 * HOUR);
  });

  it('crosses the 23-hour spring day, stepping only 23 hours of real time', () => {
    expect(stockholmDate(SPRING_FORWARD)).toBe('2026-03-29');
    expect(stockholmDate(addStockholmDays(SPRING_FORWARD, 1))).toBe('2026-03-30');
    expect(addStockholmDays(SPRING_FORWARD, 1) - SPRING_FORWARD).toBe(23 * HOUR);
  });

  it('steps back onto a transition day just as cleanly', () => {
    expect(stockholmDate(addStockholmDays(FALL_BACK, -1))).toBe('2026-10-24');
    expect(stockholmDate(addStockholmDays(addStockholmDays(FALL_BACK, 1), -1))).toBe('2026-10-25');
    expect(stockholmDate(addStockholmDays(addStockholmDays(SPRING_FORWARD, 1), -1))).toBe(
      '2026-03-29',
    );
  });

  // The property the day stepper's rails depend on: stepping n days forward and n back
  // must return the exact same instant, whatever transitions are crossed on the way. If
  // it drifted, a user who paged a year forward and back would not land on today.
  it('round-trips exactly across a whole year of both transitions', () => {
    for (const anchor of [ORDINARY, SPRING_FORWARD, FALL_BACK]) {
      for (const days of [1, 7, 200, 365]) {
        expect(addStockholmDays(addStockholmDays(anchor, days), -days)).toBe(anchor);
      }
    }
  });

  // Anchoring on today and adding an OFFSET (what stepDay does) must agree with walking
  // one day at a time. This is what makes stepping idempotent and drift-free.
  it('agrees with repeated single steps', () => {
    let walked = FALL_BACK;
    for (let i = 0; i < 10; i++) walked = addStockholmDays(walked, 1);
    expect(addStockholmDays(FALL_BACK, 10)).toBe(walked);
  });

  it('crosses month and year boundaries', () => {
    const newYearsEve = startOfStockholmDay(Date.UTC(2026, 11, 31, 12));
    expect(stockholmDate(addStockholmDays(newYearsEve, 1))).toBe('2027-01-01');
    expect(stockholmDate(addStockholmDays(newYearsEve, -365))).toBe('2025-12-31');
    const endOfFebruary = startOfStockholmDay(Date.UTC(2028, 1, 28, 12)); // 2028 is a leap year
    expect(stockholmDate(addStockholmDays(endOfFebruary, 1))).toBe('2028-02-29');
  });
});
