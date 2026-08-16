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

import type { NightKey } from '@/lib/night-times';
import type { PrayerKey } from '@/lib/prayer-times';

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
 * The night's two voluntary landmarks. A table of their own, NOT two more entries in
 * PRAYER_COLORS — that record is keyed by PrayerKey and drives the map's contour lines,
 * and neither of these is a solar event that can be drawn as an isoline (see
 * lib/night-times.ts).
 *
 * Both sit in the same indigo→violet corridor as the prayers that bracket them —
 * ʿIshāʾ (#33437a / #94a2dd) at the night's start, Fajr (#7c84ba / #a4adde) at its end —
 * with the midpoint deeper and the last third lifted toward the dawn. So the pair DRAWS
 * the night's progression, and reads as one group that belongs between those two rather
 * than as a seventh and eighth prayer colour.
 *
 * They are used as GLYPHS, not text: the dock renders each row's label in the chrome ink
 * and only tints the icon, which is what keeps the voluntary rows quieter than the five.
 * So the floor they must clear is the graphics tier (APCA Lc 45), the same one
 * PRAYER_COLORS targets — pinned in palette.test.ts.
 */
export const NIGHT_COLORS: Record<NightKey, PrayerColors> = {
  middleOfNight: { light: '#4c5286', dark: '#9ba1ce' }, // deep indigo — the night at its darkest
  lastThird: { light: '#66699c', dark: '#b3b2de' }, //     lifted toward Fajr's dawn violet
};

/** Pick a night landmark's glyph colour for the active OS appearance. */
export function nightColorFor(key: NightKey, scheme: ColorSchemeName): string {
  return scheme === 'dark' ? NIGHT_COLORS[key].dark : NIGHT_COLORS[key].light;
}

/**
 * The same prayer hues, made legible as TEXT on the map pill's surface.
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
 * moves. They land within 0.563 ± 0.007 L of each other, which is why the six labels read
 * as one family rather than six unrelated inks.
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
  fajr: { light: '#6971a5', dark: '#b6c0f2' }, //     L 0.628 → 0.563 · dark Lc 55 → 65
  sunrise: { light: '#9c692c', dark: '#e9b982' }, //  L 0.773 → 0.564 · dark Lc 69 → 65
  dhuhr: { light: '#7f7358', dark: '#cdc1a3' }, //    L 0.738 → 0.559 · dark Lc 69 → 65
  asr: { light: '#986b2e', dark: '#e8ba7c' }, //      L 0.734 → 0.563 · dark Lc 64 → 65
  maghrib: { light: '#ae5f3e', dark: '#ffae90' }, //  L 0.670 → 0.570 · dark Lc 52 → 65
  isha: { light: '#33437a', dark: '#adbcf8' }, //     light already at Lc 90 · dark Lc 49 → 65
};

/** A prayer's colour for LABEL TEXT. See {@link PRAYER_TEXT_COLORS}. */
export function prayerTextColorFor(prayer: PrayerKey, scheme: ColorSchemeName): string {
  return scheme === 'dark' ? PRAYER_TEXT_COLORS[prayer].dark : PRAYER_TEXT_COLORS[prayer].light;
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
