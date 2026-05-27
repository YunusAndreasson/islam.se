// Drives the instant the map is showing. Two modes the user moves between:
//   live  — tracks the real clock (ticks every 30s; the default)
//   scrub — pinned to a time the user dragged to on the day slider
//
// The user sweeps the prayer lines across the country by dragging the day slider
// directly — that *is* the control, so there's no separate "play" transport to
// flood the native bridge or clutter the dock.
import { useCallback, useEffect, useState } from 'react';

const DAY_MS = 86_400_000;
const LIVE_TICK_MS = 30_000;

export type ClockMode = 'live' | 'scrub';

export interface SolarClock {
  /** The instant being visualised (ms epoch). */
  now: number;
  mode: ClockMode;
  /** Position of `now` within today, 0..1 — drives the scrubber thumb. */
  fraction: number;
  /** Local midnight that the day slider spans from. */
  dayStart: number;
  /** Jump to a fraction (0..1) of today; enters scrub mode. */
  setFraction: (f: number) => void;
  /** Return to following the real clock. */
  reset: () => void;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
  // The local midnight the day slider spans from. Re-anchored at the live midnight
  // (and on reset) so the view rolls over to the new day on its own — otherwise an
  // app left running across midnight keeps rendering yesterday: slider pinned at the
  // far right, stale times, "i morgon" mislabelling today's Fajr.
  const [dayStart, setDayStart] = useState(() => startOfToday());

  // Live mode follows the wall clock, re-anchoring the day when it rolls over — but
  // only while `active`. Off-screen the tick is paused (no background field rebuild);
  // the immediate `sync()` on (re)activation jumps straight to now so returning to the
  // map never shows the instant the user left frozen until the first interval. Scrub
  // mode is untouched, so a scrubbed time survives navigating away and back.
  useEffect(() => {
    if (mode !== 'live' || !active) return;
    const sync = () => {
      setNow(Date.now());
      const today = startOfToday();
      setDayStart((prev) => (prev === today ? prev : today));
    };
    sync();
    const id = setInterval(sync, LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode, active]);

  const setFraction = useCallback(
    (f: number) => {
      setMode('scrub');
      setNow(dayStart + clamp01(f) * DAY_MS);
    },
    [dayStart],
  );

  const reset = useCallback(() => {
    setMode('live');
    setNow(Date.now());
    // Re-anchor in case the day rolled over while the user was scrubbing.
    setDayStart(startOfToday());
  }, []);

  const fraction = clamp01((now - dayStart) / DAY_MS);

  return { now, mode, fraction, dayStart, setFraction, reset };
}
