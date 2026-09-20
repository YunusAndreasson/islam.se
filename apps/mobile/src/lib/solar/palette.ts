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

import type { PrayerKey } from '@/lib/prayer-times';

import type { PolarBoundary } from './sun';

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

// Light wash. Alpha encodes how much the overlay dims the warm parchment basemap —
// and therefore how much of the basemap SURVIVES, which is the constraint that sets
// every value here. The Skia canvas is a sibling native view above MapLibre, so the
// only compositing available is straight alpha: there is no multiply/darken to reach
// for. Whatever alpha this wash spends, it spends on the cartography.
//
// NIGHT used to be [13,20,54] @ 0.88, on the argument that anything gentler let the
// warm paper bleed through and muddied night into a slate-grey "dusk fog". The
// argument was right about the mud and wrong about the cause. At 0.88 only 12% of the
// basemap survived, so land/sea contrast, hillshade and place labels all collapsed
// into one flat slab (≈#282d49) — and that slab is within a few points of the DARK
// theme's night composite (#191f37), which left the light theme dark everywhere but
// its chrome.
//
// The lever against mud is SATURATION, not alpha. DUSK_WARM and DAWN_COOL already
// prove it: both sit near 0.5 over the same parchment and both land on real colour
// (≈#d19a86 and ≈#9bacca), because a saturated stop does not pass through grey on its
// way in. So NIGHT is now a deep, saturated blue at an alpha in that same family: the
// parchment reads through as texture rather than as a wash-out, night still composites
// deeper and bluer than the dawn band either side of it, and a light-themed app stays
// light-themed after sunset.
//
// ⚠️ ALPHA IS ALSO WHAT THE PLACE LABELS CAN AFFORD, and that is the tightest of the three
// constraints. Labels are basemap SYMBOL layers, so they sit UNDER this wash — the Skia
// canvas is one view above the whole map and nothing in the style can be drawn over it. A
// wash of alpha `a` covers a label and the land beneath it alike, so the difference between
// them survives only as `(1 − a)`: at 0.88 the city names kept 12% of their contrast and
// went unreadable, at 0.6 they keep 40% and read cleanly. Raising this again without moving
// the labels somewhere the wash cannot reach takes them straight back down.
export const washStopsLight: WashStops = {
  DAY: [255, 255, 255, 0],
  DUSK_WARM: [183, 78, 52, 0.5],
  // Deep saturated indigo rather than a near-black, at an alpha that leaves 40% of the
  // basemap — and of its place labels — reading through. Composites to ≈#7a82a9 over
  // `#ece6d8` land: darker and bluer than DAWN_COOL's ≈#9bacca, so the night band is still
  // the deepest part of the cycle, without erasing the map under it.
  NIGHT: [46, 64, 138, 0.6],
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

// Dark wash. The basemap is ALREADY dark navy (`#1d2233`), so the wash no longer
// has to do the work of darkening — it just carries hue (warm dusk / cool dawn /
// deeper night-blue). All alphas drop substantially. The dusk warmth and dawn
// coolness are slightly brighter so the temperature contrast still reads over the
// dark base. NIGHT stays the same indigo HUE but at lower alpha — it deepens the
// basemap from `#1d2233` toward `#191f37`, an honest "this region of the sky is
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
 *  would vanish against the navy basemap), shifted to a dark periwinkle.
 *
 *  These are LINES on a map — graphics, which need Lc 45, and which the muted-Nordic
 *  brief wants quiet. They deliberately sit lower than the chrome accent and the pill
 *  LABELS that share their hue (`darkPalette.accent` / PRAYER_TEXT_COLORS, both at
 *  Lc 65): same hue family, lightness tuned per substrate. Do not "resync" them to one
 *  value — a line bright enough to be read as text would shout across the whole map. */
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
  isha: { light: '#33437a', dark: '#94a2dd' }, //      Prussian night-indigo → periwinkle in dark (accent's hue, line-quiet)
};

/** Pick a prayer's line colour for the active OS appearance. */
export function prayerColorFor(
  prayer: PrayerKey,
  scheme: ColorSchemeName,
): string {
  return scheme === 'dark' ? PRAYER_COLORS[prayer].dark : PRAYER_COLORS[prayer].light;
}

/**
 * The same prayer hues, made legible as TEXT — on the map pill, and on the dock's schedule,
 * where since 2026-09-19 the prayer's NAME wears this colour and there is no swatch.
 *
 * Why a second table rather than reusing PRAYER_COLORS. Those are LINE colours, tuned to
 * glow over the basemap — measured as small text on the light pill (`#fffdf8`) they fail
 * badly: sunrise 2.05:1, dhuhr 2.28:1, asr 2.35:1, maghrib 3.06:1, fajr 3.52:1, against
 * the 4.5:1 that text under 18 pt needs. (Isha's Prussian indigo is the one that already
 * passes, at 9.29:1.) Painting a label with its raw line colour would have made five of
 * six pills unreadable in daylight — the exact opposite of a legibility fix.
 *
 * The light values below are each derived from the line colour in OKLab by lowering L
 * ONLY, keeping a and b — so the hue and chroma are the line's, and just the lightness
 * moves. They land within 0.535 ± 0.001 L of each other, which is why the six labels read
 * as one family rather than six unrelated inks.
 *
 * THE LIGHT SET WENT A STEP DEEPER (0.563 → 0.535) on 2026-09-19, when the dock's schedule
 * started colouring prayer NAMES. The pill is one fixed cream (#fffdf8); the dock's card is
 * not — its surface follows the sun through 27 distinct tints (see lib/solar/sky-chrome), and
 * the dimmest of them left the old values at 4.12:1, just under the 4.5:1 that text needs.
 * One shared L for all five keeps the family, and a darker label only helps the pill it also
 * still sits on (now Lc 75 there). palette.test.ts measures both surfaces.
 *
 * DARK USED TO SKIP THIS STEP, and it was wrong to. The rule here was "every line colour
 * already clears 5.8:1 on the dark pill, so the label wears the line colour verbatim" —
 * true by WCAG, and misleading, because WCAG 2 systematically flatters light-on-dark. By
 * APCA those six labels measured Lc 49–69: sunrise and dhuhr were fine at 69, but isha
 * came in at 49, maghrib 52 and fajr 55, all under the Lc 60 floor for text. They were
 * also 20 Lc apart from each other, so the dark pills never read as one family the way
 * the light ones do.
 *
 * Dark now gets the SAME treatment as light — lightness moved, hue and chroma held (all
 * six stayed within 1.9° of hue) — onto a common Lc 65. Note this LOWERS sunrise and
 * dhuhr slightly rather than brightening everything: the goal is one family above the
 * floor, not a louder map. Nordic restraint survives.
 *
 * palette.test.ts asserts both measures, so a future hue tweak cannot silently drop a
 * label below either threshold.
 */
export const PRAYER_TEXT_COLORS: Record<PrayerKey, PrayerColors> = {
  fajr: { light: '#61699c', dark: '#b6c0f2' }, //     L 0.628 → 0.535 · dark Lc 55 → 65
  sunrise: { light: '#936123', dark: '#e9b982' }, //  L 0.773 → 0.535 · dark Lc 69 → 65
  dhuhr: { light: '#786c51', dark: '#cdc1a3' }, //    L 0.738 → 0.535 · dark Lc 69 → 65
  asr: { light: '#8f6325', dark: '#e8ba7c' }, //      L 0.734 → 0.534 · dark Lc 64 → 65
  maghrib: { light: '#a25534', dark: '#ffae90' }, //  L 0.670 → 0.535 · dark Lc 52 → 65
  isha: { light: '#33437a', dark: '#adbcf8' }, //     light already at Lc 91 · dark Lc 49 → 65
};

/** A prayer's colour for LABEL TEXT. See {@link PRAYER_TEXT_COLORS}. */
export function prayerTextColorFor(prayer: PrayerKey, scheme: ColorSchemeName): string {
  return scheme === 'dark' ? PRAYER_TEXT_COLORS[prayer].dark : PRAYER_TEXT_COLORS[prayer].light;
}

/**
 * The polar daylight boundary's colours: the dashed line the Skia overlay draws at the
 * latitude past which the four polar prayers cease to exist, and the caption the marker
 * layer sets just above it ("Midnattssol · solen går inte ner"). Warm gold for the midnight
 * sun, cool blue for the polar night — each phenomenon's own light.
 *
 * ONE table for the line and its caption, because they were two. The line's rgb lived in
 * SolarSkiaOverlay and the caption's rgba in MapMarkersOverlay, as literals, and nothing held
 * a retune of one to the other: the two files could disagree about what colour "polar night"
 * is and no test would say so. The caption is the line's hue a step deeper (light) or
 * brighter (dark), as small text over the basemap has to be — the same relation
 * PRAYER_TEXT_COLORS has to PRAYER_COLORS. palette.test.ts pins both halves.
 */
export interface PolarBoundaryColors {
  /** The dashed line's hue as an rgb triplet — painted at `lineAlpha` through the middle of
   *  the screen and faded to alpha 0 at its edges, which is why it is not a finished colour. */
  line: [number, number, number];
  lineAlpha: number;
  /** The caption's finished colour. */
  text: string;
}

export const POLAR_BOUNDARY_COLORS: Record<
  PolarBoundary['kind'],
  { light: PolarBoundaryColors; dark: PolarBoundaryColors }
> = {
  'midnight-sun': {
    light: { line: [150, 108, 34], lineAlpha: 0.42, text: 'rgba(120,86,24,0.78)' },
    // Caption alphas in dark were 0.62 / 0.66 and measured Lc 45 / 41 over the navy land —
    // the polar-night one under APCA's floor for anything meant to be read at all. Lifted
    // to sit together near Lc 50: still a whisper next to the light captions' 55 / 62, but
    // a whisper that can be made out. Measured by palette.test.ts as composited, at alpha.
    dark: { line: [255, 224, 168], lineAlpha: 0.34, text: 'rgba(255,224,168,0.70)' },
  },
  'polar-night': {
    light: { line: [56, 92, 150], lineAlpha: 0.42, text: 'rgba(48,80,134,0.82)' },
    dark: { line: [150, 196, 255], lineAlpha: 0.34, text: 'rgba(170,206,255,0.76)' },
  },
};

/** The boundary's line and caption colours for a phenomenon and the active appearance. */
export function polarBoundaryColorFor(
  kind: PolarBoundary['kind'],
  scheme: ColorSchemeName,
): PolarBoundaryColors {
  const pair = POLAR_BOUNDARY_COLORS[kind];
  return scheme === 'dark' ? pair.dark : pair.light;
}
