// Drives the instant the map is showing. Three modes the user moves between:
//   live  — tracks the real clock (ticks every 30s; the default)
//   scrub — pinned to a time the user dragged to on the day slider
//   play  — animates through the day so the prayer lines visibly sweep across
//
// No animation library needed: we step a plain state value on an interval and let
// MapLibre re-render the (cheap) GeoJSON. Play runs at a modest fps so the native
// bridge isn't flooded — the sweep still reads as smooth motion.
import { useCallback, useEffect, useMemo, useState } from 'react';

const DAY_MS = 86_400_000;
const LIVE_TICK_MS = 30_000;
const PLAY_FPS = 10;
const PLAY_DAY_SECONDS = 24; // a full day plays through in ~24 s

export type ClockMode = 'live' | 'scrub';

export interface SolarClock {
  /** The instant being visualised (ms epoch). */
  now: number;
  mode: ClockMode;
  playing: boolean;
  /** Position of `now` within today, 0..1 — drives the scrubber thumb. */
  fraction: number;
  /** Local midnight that the day slider spans from. */
  dayStart: number;
  /** Jump to a fraction (0..1) of today; enters scrub mode and stops playback. */
  setFraction: (f: number) => void;
  play: () => void;
  pause: () => void;
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
  const [playing, setPlaying] = useState(false);
  // Anchored once on mount; spanning a fixed local day keeps the slider stable.
  const dayStart = useMemo(() => startOfToday(), []);

  // Live mode follows the wall clock.
  useEffect(() => {
    if (mode !== 'live' || playing) return;
    const id = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode, playing]);

  // Play mode advances `now` across the day and loops back to dawn-of-day.
  useEffect(() => {
    if (!playing) return;
    const step = (DAY_MS / (PLAY_DAY_SECONDS * 1000)) * (1000 / PLAY_FPS);
    const id = setInterval(() => {
      setNow((prev) => {
        const base = prev < dayStart || prev > dayStart + DAY_MS ? dayStart : prev;
        const next = base + step;
        return next > dayStart + DAY_MS ? dayStart : next;
      });
    }, 1000 / PLAY_FPS);
    return () => clearInterval(id);
  }, [playing, dayStart]);

  const setFraction = useCallback(
    (f: number) => {
      setPlaying(false);
      setMode('scrub');
      setNow(dayStart + clamp01(f) * DAY_MS);
    },
    [dayStart],
  );

  const play = useCallback(() => {
    setMode('scrub');
    setPlaying(true);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const reset = useCallback(() => {
    setPlaying(false);
    setMode('live');
    setNow(Date.now());
  }, []);

  const fraction = clamp01((now - dayStart) / DAY_MS);

  return { now, mode, playing, fraction, dayStart, setFraction, play, pause, reset };
}
