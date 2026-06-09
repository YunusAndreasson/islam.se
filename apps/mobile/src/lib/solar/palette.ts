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

/** The five wash colour stops the SkSL shader composes per pixel. */
export interface WashStops {
  /** Midday — basemap untouched. */
  DAY: RGBA;
  /** Maghrib→Isha glow (dusk warmth). */
  DUSK_WARM: RGBA;
  /** Isha→Fajr (deep night). */
  NIGHT: RGBA;
  /** Fajr→sunrise (cool dawn). */
  DAWN_COOL: RGBA;
  /** Golden-hour kiss right at the sunrise horizon — a warm gold that blooms in the
   *  lowest few degrees of depression on the MORNING side only, fading up into
   *  DAWN_COOL above. Golden hour is symmetric (the rising sun is warm too), so this
   *  gives Shurūq its own warm signature. Kept subtler than DUSK_WARM so Maghrib
   *  stays the hero — a dawn whisper, not a second sunset. */
  DAWN_WARM: RGBA;
}

// Light wash. Alpha encodes how much the overlay dims the warm parchment basemap.
// NIGHT 0.88 is high ON PURPOSE: the basemap LAND is `#ece6d8` warm paper, so at a
// gentler alpha a third of it bleeds through and muddies the night to a slate-grey
// "dusk fog" rather than a true deep blue. At 0.88 the parchment is mostly drowned
// and night reads as a clean deep night-blue (≈#2A2D43).
export const washStopsLight: WashStops = {
  DAY: [255, 255, 255, 0],
  DUSK_WARM: [183, 78, 52, 0.5],
  // The deep night is a touch more saturated-blue (b 47→54) so it reads as a true
  // indigo night, not a slate, once the 0.88 alpha drowns the warm parchment.
  NIGHT: [13, 20, 54, 0.88],
  // Dawn was a pale, desaturated periwinkle — next to the vivid terracotta dusk it
  // barely registered as a colour. Deepened to a richer cool cornflower and lifted
  // a touch in alpha (0.42→0.48) so the Fajr→sunrise band glows as a real BLUE,
  // the cool twin of the Maghrib warmth. (Parchment is warm, so a cool wash mutes
  // against it — hence the extra saturation/alpha to land an honest blue.)
  DAWN_COOL: [80, 110, 186, 0.48],
  // Warm golden sunrise, more yellow/luminous than the dusk terracotta and at a lower
  // alpha (0.36 < 0.5) — a dawn gold that reads next to the cool blue without upstaging
  // Maghrib's red.
  DAWN_WARM: [226, 156, 94, 0.36],
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
  // Slightly more blue chroma (b 52→60) so the deep night deepens the navy basemap
  // with hue, not just darkness. Alpha unchanged (stays well under the light NIGHT).
  NIGHT: [20, 28, 60, 0.42],
  // Richer, bluer dawn lifted for the navy basemap — the cool twin of dusk, now a
  // distinct cornflower rather than a grey-blue. Alpha (0.34) stays below the light
  // mode's (0.48) per the gentler-dark-wash rule.
  DAWN_COOL: [120, 146, 210, 0.34],
  // Lifted golden sunrise for the navy basemap; alpha (0.26) below both the dark dusk
  // (0.32) and the light dawn-warm (0.36), per the gentler-dark-wash rule.
  DAWN_WARM: [236, 174, 110, 0.26],
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
