// Drives the instant the map is showing. Two modes the user moves between:
//   live  — tracks the real clock (ticks every 30s; the default)
//   scrub — pinned to a time the user dragged to on the day slider
//
// The user sweeps the prayer lines across the country by dragging the day slider
// directly — that *is* the control, so there's no separate "play" transport to
// flood the native bridge or clutter the dock.
import { useCallback, useEffect, useMemo, useState } from 'react';

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

export function useSolarClock(): SolarClock {
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<ClockMode>('live');
  // Anchored once on mount; spanning a fixed local day keeps the slider stable.
  const dayStart = useMemo(() => startOfToday(), []);

  // Live mode follows the wall clock.
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode]);

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
  }, []);

  const fraction = clamp01((now - dayStart) / DAY_MS);

  return { now, mode, fraction, dayStart, setFraction, reset };
}
