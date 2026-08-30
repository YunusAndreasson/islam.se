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
import { startTransition, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { addZoneDays, getDisplayZone, startOfZoneDay, zoneDayLength } from '@/lib/zone-time';

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
  /** Run a tick that `shouldDefer` held back, and nothing otherwise. The caller that
   *  deferred is the one that must call this — see the `shouldDefer` parameter. */
  flush: () => void;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The instant being shown and the Stockholm midnight it is measured from.
 *
 *  ONE state, not two, and that is load-bearing. Every operation here derives one from the
 *  other — a step keeps the fraction through the day, a scrub is an offset from the day's
 *  start — so an updater has to see BOTH previous values, which two separate `useState`s
 *  can never give it. As two, `stepDay` had to read the committed render's day and add to
 *  it, and a burst of chevron taps (delivered together once the field rebuild frees the JS
 *  thread, then batched into one render) all read the same day and asked for the same next
 *  one: ten taps moved the dock four days, measured on an emulator on 2026-08-25. As one,
 *  every change is a pure function of the pending value, and a batch simply composes. */
interface View {
  now: number;
  dayStart: number;
}

/**
 * @param active Whether the owning screen is on-screen. When false (the map is
 * behind another route), the live tick is paused so the whole-country solar field
 * isn't rebuilt every 30 s in the background; on re-activation the clock snaps to the
 * real now. Defaults to true so non-navigated callers (and tests) behave as before.
 *
 * @param shouldDefer Asked at each tick whether this is a bad moment to advance. The map
 * says yes while the camera is moving: a tick rebuilds the whole-country field (six
 * prayers over ~3752 cells, then marching squares, chaining, smoothing and Catmull-Rom)
 * and re-renders the screen, all on the JS thread — which is the same thread that must
 * forward the next camera frame to the Skia overlay, so a tick landing mid-pan shows up as
 * the overlay stalling against the basemap. Deferring is cheap because the overlay already
 * carries the sun between rebuilds (see driftMerc in SolarSkiaOverlay): the lines simply
 * hold their position for the length of the pan instead of drifting wrongly.
 *
 * At most ONE tick in a row is ever held back. That bounds the worst case at one skipped
 * rebuild — 60 s between fields rather than 30 — and, more importantly, means a caller
 * whose "am I moving?" flag somehow sticks true cannot freeze the clock: the very next tick
 * goes through regardless. Call {@link SolarClock.flush} when the moment passes to collect
 * the held-back tick immediately; a flush with nothing held back does nothing, which is
 * what keeps an ordinary pan from rebuilding the field on every settle.
 */
export function useSolarClock(active = true, shouldDefer?: () => boolean): SolarClock {
  const [mode, setMode] = useState<ClockMode>('live');
  // `dayStart` is re-anchored at the live midnight (and on reset) so the view rolls over to
  // the new day on its own — otherwise an app left running across midnight keeps rendering
  // yesterday: slider pinned at the far right, stale times, "i morgon" mislabelling today's
  // Fajr.
  const [view, setView] = useState<View>(() => {
    const t = Date.now();
    return { now: t, dayStart: startOfZoneDay(t) };
  });
  const { now, dayStart } = view;
  // The REAL today, tracked separately from the day being viewed. Without it "i dag" is
  // whatever day the app was opened on: park the view on tomorrow, leave the phone on the
  // table past midnight, and the dock would go on calling a day that is now today
  // "i morgon". It is also the anchor stepDay measures offsets from.
  const [todayStart, setTodayStart] = useState(() => startOfZoneDay(Date.now()));
  // Which zone the two anchors above were computed in.
  //
  // ⚠️ THEY MUST NEVER BE MIDNIGHTS IN DIFFERENT ZONES, and without this they can be.
  // `syncClock` re-anchors `todayStart` in EVERY mode but `dayStart` only while live, so a
  // reader who is scrubbed to another day when the device zone changes (they land, the
  // phone moves the clock, they reopen the app) ends up with today's midnight in Riyadh and
  // the viewed day's midnight in Stockholm. Everything downstream is derived from the gap
  // between them, so everything downstream breaks at once: `dayOffset` becomes round(23/24)
  // — and for a shift of 13 h or more it rounds to zero, so the dock labels tomorrow
  // "i dag"; `dayLength` measures 21 or 27 hours, so the scrubber's fraction clamps to a
  // rail; and DayPicker builds its cells with `addZoneDays(todayStart, n)`, so none of them
  // equals `dayStart` and the calendar shows no day selected at all.
  const anchorZone = useRef(getDisplayZone());

  // The true length of the day starting at dayStart: probe ~26 h ahead to land firmly
  // inside the next calendar day (even a 25 h fall-back day is only 25 h), snap to ITS
  // midnight, and take the gap — 23 h, 24 h or 25 h. Recomputed only when the day rolls
  // over (dayStart changes), so the Intl work is once per day, not per render.
  const dayLength = useMemo(() => zoneDayLength(dayStart), [dayStart]);

  // Live mode follows the wall clock, re-anchoring the day when it rolls over — but
  // only while `active`. Off-screen the tick is paused (no background field rebuild);
  // the immediate `sync()` on (re)activation jumps straight to now so returning to the
  // map never shows the instant the user left frozen until the first interval. Scrub
  // mode is untouched, so a scrubbed time survives navigating away and back.
  //
  // It no longer early-returns on scrub: `todayStart` is tracked in EVERY mode, and only
  // `now`/`dayStart` are re-anchored while live. The cost is one startOfZoneDay per
  // 30 s in scrub mode (the Intl formatter is cached) plus a state update React bails out
  // of on all but one tick a day. What it buys is that parking on "i morgon" across real
  // midnight self-corrects to "i dag" instead of quietly lying. The `!active` pause — the
  // thing that actually protects the battery, by stopping the field rebuild — is untouched.
  // React 19.2's Effect Event lets every tick read the latest mode without tearing down
  // and recreating the native interval when the user starts or stops scrubbing.
  // True when a tick was held back and is waiting for `flush`. A ref, not state: holding a
  // tick must not itself cause the render the deferral exists to avoid.
  const heldBack = useRef(false);

  const syncClock = useEffectEvent(() => {
    const t = Date.now();
    const today = startOfZoneDay(t);
    // The zone moved under us. Re-anchor BOTH midnights together, in every mode, keeping the
    // day the reader is actually looking at: the offset is what they chose, the instants
    // expressing it are ours. Done before anything else so no derived value is ever read
    // from a mismatched pair.
    const zone = getDisplayZone();
    if (zone !== anchorZone.current) {
      anchorZone.current = zone;
      // Effect Events see the latest committed state, so this is the current anchor.
      const wasToday = todayStart;
      setTodayStart(today);
      setView((v) => ({
        dayStart: addZoneDays(today, Math.round((v.dayStart - wasToday) / 86_400_000)),
        now: mode === 'live' ? t : v.now,
      }));
      return;
    }
    // Tracked in EVERY mode and NEVER deferred: this is the cheap half (React bails out on
    // all but one tick a day) and it is what re-labels a parked day when real midnight
    // passes. Holding it back would let the dock go on calling today "i morgon" for the
    // length of a pan, to save nothing.
    setTodayStart((prev) => (prev === today ? prev : today));
    if (mode !== 'live') return;
    // The expensive half — a new `now` rebuilds the whole-country field and re-renders the
    // map screen. One tick in a row may be held back; see the `shouldDefer` docs for why the
    // bound matters.
    if (!heldBack.current && shouldDefer?.() === true) {
      heldBack.current = true;
      return;
    }
    heldBack.current = false;
    setView((v) => (v.now === t && v.dayStart === today ? v : { now: t, dayStart: today }));
  });

  useEffect(() => {
    if (!active) return;
    syncClock();
    const id = setInterval(syncClock, LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  // All three of these read the PENDING view rather than the rendered one, so a jump and a
  // step landing in the same React batch compose instead of the second overwriting the
  // first. `zoneDayLength` is re-derived inside the updater for the same reason: the memo
  // below belongs to the committed day, which may not be the one being replaced.
  const setFraction = useCallback((f: number) => {
    setMode('scrub');
    setView((v) => ({ ...v, now: v.dayStart + clamp01(f) * zoneDayLength(v.dayStart) }));
  }, []);

  const setInstant = useCallback((ms: number) => {
    setMode('scrub');
    setView((v) => {
      const end = v.dayStart + zoneDayLength(v.dayStart);
      return { ...v, now: ms < v.dayStart ? v.dayStart : ms > end ? end : ms };
    });
  }, []);

  const reset = useCallback(() => {
    setMode('live');
    const t = Date.now();
    // Re-anchor in case the day rolled over while the user was scrubbing — or in case they
    // are on another day entirely, which is now the ordinary case. "Nu" is the user naming
    // a day outright, so it REPLACES the view rather than deriving from it: a step queued
    // behind it in the same batch is meant to be overruled.
    const today = startOfZoneDay(t);
    setView({ now: t, dayStart: today });
    setTodayStart(today);
  }, []);

  // Collecting a held-back tick goes through a state token rather than calling `syncClock`
  // directly. That is not ceremony: `syncClock` is an Effect Event, and an Effect Event may
  // only be called from an Effect (or another Effect Event) in the same component — calling
  // it from a callback the MAP holds would reach across both of those lines. Bumping a token
  // and letting an Effect do the call keeps the rule intact and keeps `flush` stable, which
  // is what lets the map's settled-camera handler depend on it without being rebuilt on
  // every tick.
  //
  // Deliberately does nothing when no tick was held back: that handler fires on every pan and
  // zoom, and syncing unconditionally would rebuild the whole-country field each time the map
  // came to rest — the very cost the deferral exists to avoid.
  const [flushToken, setFlushToken] = useState(0);
  const flush = useCallback(() => {
    if (heldBack.current) setFlushToken((n) => n + 1);
  }, []);
  useEffect(() => {
    // Skips the mount pass; from then on every bump is a tick somebody asked for.
    if (flushToken === 0) return;
    syncClock();
  }, [flushToken]);

  const fraction = clamp01((now - dayStart) / dayLength);

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
  //
  // `resolve` is handed the PENDING view, so a step counts CALLS and not renders. Reading
  // the rendered `dayOffset` and adding to it looks equivalent and is not: the field
  // rebuild blocks JS for a few hundred milliseconds, the chevron taps that land during it
  // are delivered together the moment it frees, and React batches them into one render
  // where every call would see the same committed day. Ten taps moved the dock four days
  // (measured on an emulator, 2026-08-25); a batched goToDay + step lost the jump entirely.
  const goToOffset = useCallback(
    (resolve: (v: View) => number) => {
      // Deliberately does NOT return to live mode, even when landing back on today: the
      // user is at 18:00 today, not at now. The dock's "Nu" chip is one tap away.
      // A day change invalidates the dock, prayer field, and map overlay together. It is
      // interruptible work: rapid chevron taps should keep counting immediately instead
      // of waiting behind a render for an intermediate day the user has already left.
      startTransition(() => {
        setMode('scrub');
        setView((v) => {
          const offset = resolve(v);
          const clamped =
            offset < -MAX_DAY_OFFSET ? -MAX_DAY_OFFSET : offset > MAX_DAY_OFFSET ? MAX_DAY_OFFSET : offset;
          const nextStart = addZoneDays(todayStart, clamped);
          const f = clamp01((v.now - v.dayStart) / zoneDayLength(v.dayStart));
          return { dayStart: nextStart, now: nextStart + f * zoneDayLength(nextStart) };
        });
      });
    },
    [todayStart],
  );

  /** The offset a view sits at, measured from the real today. Exact: two Stockholm
   *  midnights n days apart differ by n·24 h ± 1 h, and ±1 h can never round to another
   *  whole day — so this is integer arithmetic in disguise, not an estimate. */
  const offsetOf = (start: number): number => Math.round((start - todayStart) / 86_400_000);

  /** Which day is being VIEWED, relative to today. */
  const dayOffset = offsetOf(dayStart);

  const stepDay = useCallback(
    (delta: number) => goToOffset((v) => offsetOf(v.dayStart) + delta),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offsetOf is (todayStart) in disguise
    [goToOffset, todayStart],
  );

  const goToDay = useCallback(
    (instant: number) => goToOffset(() => offsetOf(startOfZoneDay(instant))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offsetOf is (todayStart) in disguise
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
      flush,
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
      flush,
    ],
  );
}
