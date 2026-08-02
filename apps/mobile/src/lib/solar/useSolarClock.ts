// Drives the instant the map is showing. Two modes the user moves between:
//   live  — tracks the real clock (ticks every 30s; the default)
//   scrub — pinned to a time the user dragged to on the day slider
//
// The user sweeps the prayer lines across the country by dragging the day slider
// directly — that *is* the control, so there's no separate "play" transport to
// flood the native bridge or clutter the dock.
//
// The DAY this clock spans is the SWEDISH day (Europe/Stockholm), not the device's.
// This is a Sweden prayer-times map and every displayed time is Stockholm-local, so the
// day boundary and the slider must be too: on a phone/emulator set to another zone, a
// device-local day would render the wrong day's prayer field for part of the day and
// shift every scrubber mark by the zone offset. We also span the *real* day length
// (23/24/25 h) rather than a fixed 86_400_000, so the slider stays aligned on the two
// DST-transition days each year (otherwise the 25 h day clamps its last hour at the far
// right and the 23 h day's "24:00" lands at 01:00 the next day).
import { useCallback, useEffect, useMemo, useState } from 'react';

import { addStockholmDays, startOfStockholmDay, stockholmDayLength } from '../stockholm-time';

/** Live-mode tick interval. Exported so the map can glide the displayed instant
 *  CONTINUOUSLY between ticks (a linear ease toward the predicted next tick) instead
 *  of stepping the wash and prayer lines every 30 s. */
export const LIVE_TICK_MS = 30_000;

/** How far the day stepper may travel from today, in either direction. A year is far past
 *  any real use (nobody plans Fajr 14 months out) and keeps the rails somewhere a user can
 *  understand having reached, rather than letting a stuck finger wander into 2190 where
 *  adhan's accuracy is a fiction. */
export const MAX_DAY_OFFSET = 365;

/**
 * There are exactly TWO modes, and adding a third ('day') would be a mistake worth naming:
 * `mode` answers "is `now` the real now?", while the viewed day answers "which day?". They
 * are orthogonal — the user must be able to scrub WITHIN a day that is not today, which a
 * 'day' mode makes ambiguous. Every `mode === 'live'` check in the app (the arrival bloom,
 * the nowFraction glide, the intro gate, the countdown) keeps its exact meaning this way.
 */
export type ClockMode = 'live' | 'scrub';

export interface SolarClock {
  /** The instant being visualised (ms epoch). */
  now: number;
  mode: ClockMode;
  /** Position of `now` within the viewed day, 0..1 — drives the scrubber thumb. */
  fraction: number;
  /** Stockholm-local midnight that the day slider spans from (ms epoch). */
  dayStart: number;
  /** Length of the viewed Stockholm day in ms — 23/24/25 h across DST. Use this, not a
   *  fixed 24 h, to convert between an instant and its fraction of the day. */
  dayLength: number;
  /** Stockholm midnight of the REAL today. Tracked even while a past/future day is being
   *  viewed, so parking on "i morgon" across real midnight self-corrects to "i dag". */
  todayStart: number;
  /** Which day is being viewed, relative to today: 0 = today, +1 = tomorrow, −1 = yesterday.
   *  Exact, because two Stockholm midnights differ by n·24 h ± 1 h — never enough for the
   *  rounding to reach the next whole day. */
  dayOffset: number;
  /** Move the viewed day by `delta` calendar days, keeping the time of day. Clamped to
   *  ±{@link MAX_DAY_OFFSET} from today. Does NOT re-enter live mode — see below. */
  stepDay: (delta: number) => void;
  /** View the day containing `instant`, keeping the current time of day. Same rails. */
  goToDay: (instant: number) => void;
  /** Jump to a fraction (0..1) of the viewed day; enters scrub mode. */
  setFraction: (f: number) => void;
  /** Jump to an EXACT instant (ms epoch), clamped to the viewed day; enters scrub mode.
   *  Unlike setFraction this carries no fraction round-trip, so landing on a prayer time
   *  lands `now` on it to the millisecond — which is what lets the tapped prayer (not the
   *  one after it) read as current. */
  setInstant: (ms: number) => void;
  /** Return to following the real clock. */
  reset: () => void;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * @param active Whether the owning screen is on-screen. When false (the map is
 * behind another route), the live tick is paused so the whole-country solar field
 * isn't rebuilt every 30 s in the background; on re-activation the clock snaps to the
 * real now. Defaults to true so non-navigated callers (and tests) behave as before.
 */
export function useSolarClock(active = true): SolarClock {
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<ClockMode>('live');
  // The Stockholm midnight the day slider spans from. Re-anchored at the live midnight
  // (and on reset) so the view rolls over to the new day on its own — otherwise an app
  // left running across midnight keeps rendering yesterday: slider pinned at the far
  // right, stale times, "i morgon" mislabelling today's Fajr.
  const [dayStart, setDayStart] = useState(() => startOfStockholmDay(Date.now()));
  // The REAL today, tracked separately from the day being viewed. Without it "i dag" is
  // whatever day the app was opened on: park the view on tomorrow, leave the phone on the
  // table past midnight, and the dock would go on calling a day that is now today
  // "i morgon". It is also the anchor stepDay measures offsets from.
  const [todayStart, setTodayStart] = useState(() => startOfStockholmDay(Date.now()));

  // The true length of the day starting at dayStart: probe ~26 h ahead to land firmly
  // inside the next calendar day (even a 25 h fall-back day is only 25 h), snap to ITS
  // midnight, and take the gap — 23 h, 24 h or 25 h. Recomputed only when the day rolls
  // over (dayStart changes), so the Intl work is once per day, not per render.
  const dayLength = useMemo(() => stockholmDayLength(dayStart), [dayStart]);

  // Live mode follows the wall clock, re-anchoring the day when it rolls over — but
  // only while `active`. Off-screen the tick is paused (no background field rebuild);
  // the immediate `sync()` on (re)activation jumps straight to now so returning to the
  // map never shows the instant the user left frozen until the first interval. Scrub
  // mode is untouched, so a scrubbed time survives navigating away and back.
  //
  // It no longer early-returns on scrub: `todayStart` is tracked in EVERY mode, and only
  // `now`/`dayStart` are re-anchored while live. The cost is one startOfStockholmDay per
  // 30 s in scrub mode (the Intl formatter is cached) plus a state update React bails out
  // of on all but one tick a day. What it buys is that parking on "i morgon" across real
  // midnight self-corrects to "i dag" instead of quietly lying. The `!active` pause — the
  // thing that actually protects the battery, by stopping the field rebuild — is untouched.
  useEffect(() => {
    if (!active) return;
    const sync = () => {
      const t = Date.now();
      const today = startOfStockholmDay(t);
      setTodayStart((prev) => (prev === today ? prev : today));
      if (mode !== 'live') return;
      setNow(t);
      setDayStart((prev) => (prev === today ? prev : today));
    };
    sync();
    const id = setInterval(sync, LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode, active]);

  const setFraction = useCallback(
    (f: number) => {
      setMode('scrub');
      setNow(dayStart + clamp01(f) * dayLength);
    },
    [dayStart, dayLength],
  );

  const setInstant = useCallback(
    (ms: number) => {
      setMode('scrub');
      const end = dayStart + dayLength;
      setNow(ms < dayStart ? dayStart : ms > end ? end : ms);
    },
    [dayStart, dayLength],
  );

  const reset = useCallback(() => {
    setMode('live');
    const t = Date.now();
    setNow(t);
    // Re-anchor in case the day rolled over while the user was scrubbing — or in case they
    // are on another day entirely, which is now the ordinary case.
    const today = startOfStockholmDay(t);
    setDayStart(today);
    setTodayStart(today);
  }, []);

  const fraction = clamp01((now - dayStart) / dayLength);

  // Exact: two Stockholm midnights n days apart differ by n·24 h ± 1 h, and ±1 h can never
  // round to another whole day. So this is integer arithmetic in disguise, not an estimate.
  const dayOffset = Math.round((dayStart - todayStart) / 86_400_000);

  // Move to another day, keeping the time of day the user is looking at.
  //
  // Preserving the FRACTION (not the wall-clock time) is deliberate: on the 23-hour day
  // there is no 02:30 at all, so "same clock time" is undefined there, while "the same
  // point through the day" always exists. The visible consequence is that stepping onto a
  // transition day shifts the wall clock by up to an hour — the right trade, and it keeps
  // the scrubber thumb from jumping under the user's finger.
  //
  // The target is anchored on todayStart + offset, NOT dayStart + delta, which is what
  // makes stepping idempotent: 365 steps forward and 365 back land on today exactly,
  // because every step recomputes an absolute offset rather than accumulating.
  const goToOffset = useCallback(
    (offset: number) => {
      const clamped = offset < -MAX_DAY_OFFSET ? -MAX_DAY_OFFSET : offset > MAX_DAY_OFFSET ? MAX_DAY_OFFSET : offset;
      const nextStart = addStockholmDays(todayStart, clamped);
      const f = clamp01((now - dayStart) / dayLength);
      // Deliberately does NOT return to live mode, even when landing back on today: the
      // user is at 18:00 today, not at now. The dock's "Nu" chip is one tap away.
      setMode('scrub');
      setDayStart(nextStart);
      setNow(nextStart + f * stockholmDayLength(nextStart));
    },
    [todayStart, dayStart, dayLength, now],
  );

  const stepDay = useCallback(
    (delta: number) => goToOffset(dayOffset + delta),
    [goToOffset, dayOffset],
  );

  const goToDay = useCallback(
    (instant: number) =>
      goToOffset(Math.round((startOfStockholmDay(instant) - todayStart) / 86_400_000)),
    [goToOffset, todayStart],
  );

  // Stable object identity: `clock` is read by several downstream memos/callbacks
  // (bonetider's userTimes/next/marks, PrayerDock's scrubTo/resetToNow useCallbacks).
  // A fresh literal every render would invalidate all of them on any unrelated parent
  // re-render; this keeps the reference steady whenever the underlying values are.
  return useMemo(
    () => ({
      now,
      mode,
      fraction,
      dayStart,
      dayLength,
      todayStart,
      dayOffset,
      setFraction,
      setInstant,
      stepDay,
      goToDay,
      reset,
    }),
    [
      now,
      mode,
      fraction,
      dayStart,
      dayLength,
      todayStart,
      dayOffset,
      setFraction,
      setInstant,
      stepDay,
      goToDay,
      reset,
    ],
  );
}
