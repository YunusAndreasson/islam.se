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
// Maghrib→Isha glow. A deep, saturated sunset terracotta (not the lighter amber it
// used to be, which read too close to the Asr line's hue) carried at a heavier alpha so
// the dusk band darkens noticeably as the Maghrib line sweeps in.
export const DUSK_WARM: RGBA = [183, 78, 52, 0.5]; //      Maghrib→Isha glow (deep sunset)
// Isha→Fajr. A deep indigo night carried at a heavyish alpha ON PURPOSE: the basemap land
// is warm parchment (#ece6d8), so at the old 0.66 a third of that warm paper bled straight
// through and neutralised the cool indigo to a muddy ~#5D5F6C slate — "dusk fog", not
// night. At 0.88 the parchment is mostly drowned and night reads as a true deep night-blue
// (≈ #2A2D43) without going so heavy it reads as a flat black void, while the cooler water
// still ghosts a touch darker so the coastline whispers through. The shader adds gentle
// screen-space depth on top (nightVeil()).
export const NIGHT: RGBA = [15, 20, 47, 0.88]; //          Isha→Fajr (deep indigo night)
export const DAWN_COOL: RGBA = [102, 118, 168, 0.42]; //   Fajr→sunrise (cool periwinkle)
// The wash's LEADING EDGE right at the Maghrib / sunrise line. Without it the dusk/dawn
// ramp starts fully transparent at the line, so the colour only becomes visible far
// out in the band — the line and its gradient look disconnected. A faint, same-hue tint
// at the line makes the wash begin AT the line (under the glow) and deepen outward.
export const DUSK_EDGE: RGBA = [183, 78, 52, 0.2]; //      at the Maghrib line
export const DAWN_EDGE: RGBA = [102, 118, 168, 0.16]; //   at the sunrise line
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
  isha: '#33437a', //     Prussian night indigo (matches the app accent)
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

export function rgbaString([r, g, b, a]: RGBA): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}
