// The Moon, on a slow clock.
//
// A full moonSky() is a handful of ephemeris searches — about a millisecond and a half on a
// desktop, so a few on a phone. That is nothing once, and it is far too much every frame,
// which is what a naive `moonSky(coords, new Date())` inside a render would amount to on the
// map screen. So the instant that feeds it advances in coarse steps.
//
// Ten minutes is not a compromise, it is generous: the Moon's illuminated fraction moves
// about a tenth of a per cent in that time, and its tilt in the sky by under a degree.
// Nothing on screen can show the difference, and the screens that want a live-feeling
// instrument get it from the compass heading, which is a sensor and updates at sensor speed.
//
// Re-anchored on foreground because a suspended app's timers do not fire on iOS: without it
// a phone picked up the next evening would draw yesterday afternoon's sky until the first
// tick came round.
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';

import { moonAppearance, type MoonAppearance, moonSky, type MoonSky } from './ephemeris';

const DEFAULT_PERIOD_MS = 10 * 60_000;

/** An instant that advances in `periodMs` steps and jumps to now on every foreground. */
export function useCoarseNow(periodMs: number = DEFAULT_PERIOD_MS, active = true): number {
  // Quantised so the value is stable between ticks even if a re-render lands mid-period —
  // which is what makes the useMemo below actually hold rather than recompute on every
  // parent render that happens to arrive at a new millisecond.
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / periodMs));
  useEffect(() => {
    if (!active) return;
    const sync = () => setBucket(Math.floor(Date.now() / periodMs));
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      sync();
      timer = setInterval(sync, periodMs);
    };
    // A mounted route can remain behind another screen, and a focused route can
    // remain mounted while the app is backgrounded. Neither needs a lunar clock.
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [periodMs, active]);
  return bucket * periodMs;
}

/**
 * Where the Moon stands over `coords` at `at`, recomputed only when that instant changes.
 *
 * The clock is the CALLER's, passed in rather than started here, because every caller needs
 * the same instant for something else as well — the nav disc for today's Hijri date, the
 * screen for its moonrise and its month. A hook that started its own interval would leave
 * each of them running two, ticking a few milliseconds apart, and would put the date and the
 * Moon on two different clocks on the one surface that shows them side by side.
 */
export function useMoonSky(coords: LatLng, at: number): MoonSky {
  // Keyed on the coordinate's NUMBERS, not the object: the location context hands out a
  // fresh object on every GPS fix, and keying on identity would re-run the ephemeris for a
  // position that moved two metres.
  const { latitude, longitude } = coords;
  return useMemo(() => moonSky({ latitude, longitude }, new Date(at)), [latitude, longitude, at]);
}

/** The drawing-only half, for surfaces that never show the Moon's age — currently the map's
 *  nav disc, which sits on the home screen and should not pay for a conjunction search it
 *  has no use for. Same clock discipline as {@link useMoonSky}. */
export function useMoonAppearance(coords: LatLng, at: number): MoonAppearance {
  const { latitude, longitude } = coords;
  return useMemo(() => moonAppearance({ latitude, longitude }, new Date(at)), [latitude, longitude, at]);
}
