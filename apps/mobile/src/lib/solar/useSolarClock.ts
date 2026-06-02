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

const LIVE_TICK_MS = 30_000;
const STOCKHOLM = 'Europe/Stockholm';

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

// The viewed instant's Stockholm wall-clock fields. Goes through Intl (already used for
// every displayed time) so no timezone database is bundled.
function stockholmParts(epoch: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
} {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: STOCKHOLM,
      hour12: false,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(new Date(epoch));
  } catch {
    // Hermes without full ICU data throws on a zoned formatter. Fall back to the UTC
    // wall clock: the day boundary and scrubber then track UTC instead of Stockholm — a
    // couple of hours off at the day edges, but the map keeps working instead of
    // white-screening. (Sweden is UTC+1/+2, so the degradation is small and bounded.)
    const u = new Date(epoch);
    return {
      y: u.getUTCFullYear(),
      mo: u.getUTCMonth() + 1,
      d: u.getUTCDate(),
      h: u.getUTCHours(),
      mi: u.getUTCMinutes(),
      s: u.getUTCSeconds(),
    };
  }
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  // Intl can render midnight as the 24th hour; fold it back to 0 so Date.UTC stays on day.
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

// Offset (ms) to ADD to a UTC instant to reach the Stockholm wall clock at that instant:
// +1 h in winter (CET), +2 h in summer (CEST).
function stockholmOffsetMs(epoch: number): number {
  const p = stockholmParts(epoch);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - epoch;
}

// Epoch ms of Stockholm-local midnight for the calendar day containing `epoch`. We take
// that day's wall-clock midnight, read it as if it were UTC, then subtract the zone
// offset to land on the real instant. The offset is re-evaluated at the result so the two
// DST days resolve exactly (midnight itself never falls inside the 02–03 transition hour,
// so a single correction is enough).
function startOfStockholmDay(epoch: number): number {
  const { y, mo, d } = stockholmParts(epoch);
  const wallMidnightAsUTC = Date.UTC(y, mo - 1, d, 0, 0, 0);
  const approx = wallMidnightAsUTC - stockholmOffsetMs(wallMidnightAsUTC);
  return wallMidnightAsUTC - stockholmOffsetMs(approx);
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

  // The true length of the day starting at dayStart: probe ~26 h ahead to land firmly
  // inside the next calendar day (even a 25 h fall-back day is only 25 h), snap to ITS
  // midnight, and take the gap — 23 h, 24 h or 25 h. Recomputed only when the day rolls
  // over (dayStart changes), so the Intl work is once per day, not per render.
  const dayLength = useMemo(
    () => startOfStockholmDay(dayStart + 26 * 60 * 60 * 1000) - dayStart,
    [dayStart],
  );

  // Live mode follows the wall clock, re-anchoring the day when it rolls over — but
  // only while `active`. Off-screen the tick is paused (no background field rebuild);
  // the immediate `sync()` on (re)activation jumps straight to now so returning to the
  // map never shows the instant the user left frozen until the first interval. Scrub
  // mode is untouched, so a scrubbed time survives navigating away and back.
  useEffect(() => {
    if (mode !== 'live' || !active) return;
    const sync = () => {
      const t = Date.now();
      setNow(t);
      const today = startOfStockholmDay(t);
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
    // Re-anchor in case the day rolled over while the user was scrubbing.
    setDayStart(startOfStockholmDay(t));
  }, []);

  const fraction = clamp01((now - dayStart) / dayLength);

  return { now, mode, fraction, dayStart, dayLength, setFraction, setInstant, reset };
}
