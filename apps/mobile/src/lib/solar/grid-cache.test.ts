// The per-day grid cache. Its contract is a PERFORMANCE one, which makes it unusually
// easy to break silently: a cache that quietly misses still renders a perfectly correct
// map, just with a 200–600 ms JS-thread stall on every day step. So the assertions are
// about identity (did we get the same object back?) rather than about values.
import { beforeEach, describe, expect, it } from '@jest/globals';

import { computeSignature } from '../settings/compute-signature';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../settings/types';
import { addStockholmDays, startOfStockholmDay } from '../stockholm-time';
import { __resetGridCache, gridForDay } from './grid-cache';

const TODAY = startOfStockholmDay(Date.UTC(2026, 6, 15, 12));
const SIG = computeSignature(DEFAULT_SETTINGS);

const day = (offset: number) => addStockholmDays(TODAY, offset);

beforeEach(() => {
  __resetGridCache();
});

describe('gridForDay', () => {
  it('returns the very same grid for a repeated day', () => {
    const first = gridForDay(TODAY, DEFAULT_SETTINGS, SIG);
    expect(gridForDay(TODAY, DEFAULT_SETTINGS, SIG)).toBe(first);
  });

  // The two halves of the contract, in one walk (each buildGrid costs ~0.5 s of real
  // adhan work, so the file earns its keep by not repeating them): a different day is a
  // different grid, and coming back to the first is free. That second half is the whole
  // reason the module exists — stepping forward and back is the stepper's commonest
  // gesture, and it must not pay 200–600 ms of blocked JS twice.
  it('builds per day, and makes stepping away and back free', () => {
    const today = gridForDay(TODAY, DEFAULT_SETTINGS, SIG);
    const tomorrow = gridForDay(day(1), DEFAULT_SETTINGS, SIG);

    expect(tomorrow).not.toBe(today);
    // Not just a different object — different TIMES. A cache keyed wrongly (say, on the
    // signature alone) would hand back the same object and the map would show one day's
    // prayer lines for every date.
    expect(tomorrow.pt[0][0].fajr).not.toBe(today.pt[0][0].fajr);

    expect(gridForDay(TODAY, DEFAULT_SETTINGS, SIG)).toBe(today);
  });

  // Three entries = the viewed day and its two neighbours, which is what a stepper walks.
  // The eviction ORDER is the half that matters: a hit re-inserts, so the day the user
  // keeps coming back to stays warm instead of ageing out underneath them.
  it('holds three days and evicts the least recently USED, not the oldest inserted', () => {
    const g0 = gridForDay(day(0), DEFAULT_SETTINGS, SIG);
    const g1 = gridForDay(day(1), DEFAULT_SETTINGS, SIG);
    gridForDay(day(2), DEFAULT_SETTINGS, SIG);

    // Exactly at the limit, so day 0 is still there — and touching it makes it the most
    // recently used, leaving day 1 as the eviction candidate.
    expect(gridForDay(day(0), DEFAULT_SETTINGS, SIG)).toBe(g0);

    gridForDay(day(3), DEFAULT_SETTINGS, SIG);

    // Day 1 went; day 0 survived despite having been inserted FIRST. Without the
    // re-insert-on-hit this is the wrong way round.
    expect(gridForDay(day(1), DEFAULT_SETTINGS, SIG)).not.toBe(g1);
    expect(gridForDay(day(0), DEFAULT_SETTINGS, SIG)).toBe(g0);
  });

  it('drops every day when a compute-affecting setting changes', () => {
    const before = gridForDay(TODAY, DEFAULT_SETTINGS, SIG);

    const hanafi: PrayerSettings = { ...DEFAULT_SETTINGS, madhab: 'hanafi' };
    const hanafiSig = computeSignature(hanafi);
    expect(hanafiSig).not.toBe(SIG);
    const after = gridForDay(TODAY, hanafi, hanafiSig);

    expect(after).not.toBe(before);
    // ʿAsr is the prayer the madhab moves, so a stale cache would show visibly wrong lines.
    expect(after.pt[0][0].asr).not.toBe(before.pt[0][0].asr);

    // And going back re-builds rather than resurrecting the old object — the whole map is
    // cleared on a signature change, not just the entry that was asked for.
    expect(gridForDay(TODAY, DEFAULT_SETTINGS, SIG)).not.toBe(before);
  });
});

// The override this module owns. It used to live inline at the bonetider call site, where
// day navigation could have made a cached day and a freshly-built one disagree about it.
describe('the grid is always unresolved and unrounded', () => {
  // The polar zone must be NaN, not a borrowed neighbouring latitude. aqrabBalad (Sweden's
  // default) is discontinuous across the lattice, which made the Maghrib/Ishaʾ isolines
  // jagged and drew confident prayer lines through perpetual twilight.
  it('leaves the polar zone unresolved even when the user chose aqrabBalad', () => {
    const winter = startOfStockholmDay(Date.UTC(2026, 11, 21, 12));
    const aqrab: PrayerSettings = { ...DEFAULT_SETTINGS, polarCircleResolution: 'aqrabBalad' };
    const grid = gridForDay(winter, aqrab, computeSignature(aqrab));

    // The northernmost row on a polar-night date has no sunrise anywhere along it.
    const top = grid.pt[grid.pt.length - 1];
    expect(top.every((p) => Number.isNaN(p.sunrise))).toBe(true);
  });

  // Rounding is a DISPLAY convention; on the grid it quantises the field into plateaus and
  // the contour stair-steps along their edges.
  it('keeps sub-minute precision even when the user chose minute rounding', () => {
    const rounded: PrayerSettings = { ...DEFAULT_SETTINGS, rounding: 'up' };
    const grid = gridForDay(TODAY, rounded, computeSignature(rounded));

    // At least one sampled time must carry seconds — a rounded grid would have none.
    const dhuhr = grid.pt.flat().map((p) => p.dhuhr).filter((t) => !Number.isNaN(t));
    expect(dhuhr.some((t) => t % 60_000 !== 0)).toBe(true);
  });
});
