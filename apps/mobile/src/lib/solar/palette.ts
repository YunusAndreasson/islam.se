// Visual constants for the prayer-time solar field. Kept apart from the compute
// (field.ts) and the chrome tokens (theme/tokens.ts) so the *aesthetic* of the
// twilight wash and the prayer lines lives in one tunable place. Palette is
// deliberately muted — Nordic restraint, no neon — so the map reads as a calm
// dusk/night rather than a heat-map.
//
// Apple Maps-inspired light/dark: the basemap also themes by OS (see nordicStyle.ts),
// so the wash and prayer-line colours have a `{ light, dark }` pair each — the wash
// is calibrated to drown the warm parchment in light mode (heavy NIGHT alpha) but
// to LAYER over an already-dark navy basemap in dark mode (lower alphas, hue-only
// veil). Prayer lines lift in dark mode so they stay readable on navy land — most
// keep their hue family, but Isha swaps to the periwinkle accent because its
// light-mode Prussian indigo collapses against the navy basemap.
import type { ColorSchemeName } from 'react-native';

import type { PrayerKey } from '../prayer-times';

/** [r, g, b, a] with a in 0..1. */
export type RGBA = [number, number, number, number];

/** The six wash colour stops the SkSL shader composes per pixel. */
export interface WashStops {
  /** Midday — basemap untouched. */
  DAY: RGBA;
  /** Maghrib→Isha glow (dusk warmth). */
  DUSK_WARM: RGBA;
  /** Isha→Fajr (deep night). */
  NIGHT: RGBA;
  /** Fajr→sunrise (cool dawn). */
  DAWN_COOL: RGBA;
  /** A faint same-hue tint right at the Maghrib line — so the wash begins AT the
   *  line, not far out in the band. */
  DUSK_EDGE: RGBA;
  /** Same idea at the sunrise line. */
  DAWN_EDGE: RGBA;
  /** Polar / midnight-sun fallback: a place that never reaches night keeps a pale
   *  "white night" tint rather than going black or throwing on NaN times. */
  WHITE_NIGHT: RGBA;
}

// Light wash. Alpha encodes how much the overlay dims the warm parchment basemap.
// NIGHT 0.88 is high ON PURPOSE: the basemap LAND is `#ece6d8` warm paper, so at a
// gentler alpha a third of it bleeds through and muddies the night to a slate-grey
// "dusk fog" rather than a true deep blue. At 0.88 the parchment is mostly drowned
// and night reads as a clean deep night-blue (≈#2A2D43).
export const washStopsLight: WashStops = {
  DAY: [255, 255, 255, 0],
  DUSK_WARM: [183, 78, 52, 0.5],
  NIGHT: [15, 20, 47, 0.88],
  DAWN_COOL: [102, 118, 168, 0.42],
  DUSK_EDGE: [183, 78, 52, 0.2],
  DAWN_EDGE: [102, 118, 168, 0.16],
  WHITE_NIGHT: [120, 132, 172, 0.24],
};

// Dark wash. The basemap is ALREADY dark navy (`#1d2333`), so the wash no longer
// has to do the work of darkening — it just carries hue (warm dusk / cool dawn /
// deeper night-blue). All alphas drop substantially. The dusk warmth and dawn
// coolness are slightly brighter so the temperature contrast still reads over the
// dark base. NIGHT stays the same indigo HUE but at lower alpha — it deepens the
// basemap from `#1d2333` toward `#161c2f`, an honest "this region of the sky is
// truly dark" cue without flattening the basemap to black.
export const washStopsDark: WashStops = {
  DAY: [255, 255, 255, 0],
  DUSK_WARM: [205, 108, 76, 0.32],
  NIGHT: [22, 28, 52, 0.42],
  DAWN_COOL: [134, 152, 196, 0.3],
  DUSK_EDGE: [205, 108, 76, 0.14],
  DAWN_EDGE: [134, 152, 196, 0.12],
  WHITE_NIGHT: [148, 160, 200, 0.18],
};

/** Pick the wash stops for an OS appearance. */
export function washStopsFor(scheme: ColorSchemeName): WashStops {
  return scheme === 'dark' ? washStopsDark : washStopsLight;
}

/** Per-prayer line colour, by OS theme. Same warm/cool meaning across both modes;
 *  brightness lifted in dark so the line reads on the navy basemap. Isha is the
 *  one that genuinely SWAPS hue family (the light-mode Prussian indigo `#33437a`
 *  would vanish against the navy basemap), shifted to the periwinkle that
 *  matches `darkPalette.accent`. */
export interface PrayerColors {
  light: string;
  dark: string;
}

export const PRAYER_COLORS: Record<PrayerKey, PrayerColors> = {
  fajr: { light: '#7c84ba', dark: '#a4adde' }, //     dawn violet (lifted in dark)
  sunrise: { light: '#e0a96d', dark: '#f0c089' }, //   warm gold (lifted)
  dhuhr: { light: '#b6a98d', dark: '#d4c8aa' }, //     pale neutral noon (lifted)
  asr: { light: '#cf9f63', dark: '#e6b87a' }, //       soft afternoon amber (lifted)
  maghrib: { light: '#cf7d5c', dark: '#eb9477' }, //   sunset terracotta — the hero line (lifted)
  isha: { light: '#33437a', dark: '#94a2dd' }, //      Prussian night-indigo → periwinkle in dark (matches accent)
};

/** Pick a prayer's line colour for the active OS appearance. */
export function prayerColorFor(
  prayer: PrayerKey,
  scheme: ColorSchemeName,
): string {
  return scheme === 'dark' ? PRAYER_COLORS[prayer].dark : PRAYER_COLORS[prayer].light;
}

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
