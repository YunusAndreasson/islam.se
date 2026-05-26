// Visual constants for the prayer-time solar field. Kept apart from the compute
// (field.ts) and the UI chrome (components/map/theme.ts) so the *aesthetic* of the
// twilight wash and the prayer lines lives in one tunable place. Palette is
// deliberately muted — Nordic restraint, no neon — so the map reads as a calm
// dusk/night rather than a heat-map.
import type { PrayerKey } from '../prayer-times';

/** [r, g, b, a] with a in 0..1. */
export type RGBA = [number, number, number, number];

// Wash stops. Alpha encodes how much the overlay dims the light Positron basemap:
// midday is fully clear (a=0), deep night is a heavy indigo veil. The warm dusk
// and cool dawn tints are the "sunset glow" and "first light" sweeping across.
export const DAY: RGBA = [255, 255, 255, 0]; //            midday — basemap untouched
export const DUSK_WARM: RGBA = [205, 116, 84, 0.32]; //    Maghrib→Isha glow (terracotta)
export const NIGHT: RGBA = [20, 26, 52, 0.66]; //          Isha→Fajr (deep indigo veil)
export const DAWN_COOL: RGBA = [102, 118, 168, 0.32]; //   Fajr→sunrise (cool periwinkle)
// Polar / midnight-sun fallback: a place that never reaches true night keeps a
// pale "white night" tint rather than going black or throwing on NaN times.
export const WHITE_NIGHT: RGBA = [120, 132, 172, 0.24];

/** Per-prayer line colours — the sweeping isolines. Muted, each evokes its moment. */
export const PRAYER_COLORS: Record<PrayerKey, string> = {
  fajr: '#7c84ba', //     cool dawn violet
  sunrise: '#e0a96d', //  warm gold
  dhuhr: '#b6a98d', //    pale neutral noon
  asr: '#cf9f63', //      soft afternoon amber
  maghrib: '#cf7d5c', //  sunset terracotta (the hero line)
  isha: '#46527f', //     deep night indigo
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Component-wise blend of two RGBA colours. */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
    lerp(a[3], b[3], t),
  ];
}

/** Average a set of RGBA colours (used to smooth a fill cell across its corners). */
export function average(colors: RGBA[]): RGBA {
  const n = colors.length || 1;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const c of colors) {
    r += c[0];
    g += c[1];
    b += c[2];
    a += c[3];
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), a / n];
}

export function rgbaString([r, g, b, a]: RGBA): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
