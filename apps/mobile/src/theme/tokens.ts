// The app's single design source of truth. Until now the visual language lived in
// three scattered files (components/map/theme.ts, components/settings/theme.ts,
// lib/solar/palette.ts) with ad-hoc spacing and no type scale. These tokens unify
// it so every surface speaks one Nordic language: a calm cool-paper ground, a
// single solar night-indigo accent, hairline structure, and a restrained type
// scale. The two legacy theme files now re-export from here (back-compat), so
// existing imports keep working while new code reaches for `@/theme`.
import type { TextStyle, ViewStyle } from 'react-native';

/** 4/8-based spacing scale — the only gaps/paddings the app should use. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Corner radii. `xl` is the floating-card radius; `round` for pills/circles. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  round: 999,
} as const;

// Colour. Two palettes — light + dark — sharing one key set, so `useColors()`
// (theme/useColors.ts) can hand a surface the active one and every component reads
// the same names. The light palette is a WARM editorial parchment that makes the
// app read as family with the islam.se website (warm off-white grounds, warm
// charcoal ink), deliberately de-faint: deeper inks, stronger hairlines. The dark
// palette is the website's warm dark world, not an inversion.
//
// Two accents, by design (the visual hierarchy):
//   • `accent` — a deepened night-indigo. The workhorse interactive / structure /
//     "now" signal. It's the solar palette's isha hue, so the chrome speaks the
//     same sun-arc language as the living map.
//   • `highlight` — a warm brass-gold. Reserved for the single "this is live right
//     now" element on a surface (the NEXT prayer, the qibla lock). Used sparingly,
//     so it always means "look here". Brass already lives in the prayer-line palette
//     (sunrise/asr), so it isn't foreign — and it bridges to the website's warmth.
export const lightPalette = {
  // Grounds & surfaces
  paper: '#f4f0e8', //        screen background — warm parchment
  paperSunken: '#ece6da', //  insets / pressed grouping
  surface: '#fffdf8', //      opaque cards — warm white
  cardGlass: 'rgba(255,253,248,0.90)', // translucent card over the living map

  // Ink — warm charcoal, web-aligned. Muted/faint are deepened vs the old cool
  // greys so secondary text actually reads (the old #8b94a0 was the "faint" feel).
  ink: '#1a1712',
  inkMuted: '#6f6456',
  inkFaint: '#978c7b',

  // Structure — warm borders, hairline opacity bumped 0.08 → 0.10 so edges show.
  border: '#e4ddce',
  separator: '#ece6da',
  hairline: 'rgba(26,23,18,0.10)',

  // Accent — deepened night-indigo (isha). Structure / interactive / "now".
  accent: '#3a4684',
  accentDeep: '#2b3566',
  accentSoft: '#e7e8f1',

  // Highlight — warm brass-gold. The "live right now" emphasis (next prayer, qibla
  // lock). `onHighlight` is the legible text/icon colour on a brass fill.
  highlight: '#b8862f',
  highlightSoft: '#f1e7d0',
  onAccent: '#ffffff', //     text/icon on an indigo fill
  onHighlight: '#1a1712', //  text/icon on a brass fill

  // Slider / track + the scrubber knob and the dock's grab handle.
  track: 'rgba(26,23,18,0.14)',
  trackFill: 'rgba(58,70,132,0.40)',
  thumb: '#fffdf8', //        scrubber knob (warm white)
  handle: 'rgba(26,23,18,0.20)', // dock grab handle

  // Glass fallback (Android / iOS < 26, where expo-glass-effect is a plain View)
  glass: 'rgba(255,253,248,0.85)',
  glassRim: 'rgba(255,255,255,0.55)',

  shadow: '#1c150b', //       warm shadow (was cool #0b1220)
  white: '#ffffff',
} as const;

/** The shared shape both palettes satisfy — every surface reads these names. */
export type Palette = { readonly [K in keyof typeof lightPalette]: string };

// Warm dark — the website's dark family (warm near-black grounds, warm pale ink),
// a brighter periwinkle indigo and brass so they hold their meaning on the dark
// paper. NOT used for the map (the map darkens by the SUN, see nightChrome); this
// themes the non-map screens + the menu when it's off the map.
export const darkPalette: Palette = {
  paper: '#181613',
  paperSunken: '#110f0d',
  surface: '#232019',
  cardGlass: 'rgba(35,32,25,0.90)',

  ink: '#e8e3d8',
  inkMuted: '#a89e8e',
  inkFaint: '#7c7263',

  border: '#322d24',
  separator: '#2a261f',
  hairline: 'rgba(245,240,230,0.12)',

  accent: '#9aa6e2',
  accentDeep: '#7e8bcf',
  accentSoft: 'rgba(154,166,226,0.16)',

  highlight: '#d8a94e',
  highlightSoft: 'rgba(216,169,78,0.16)',
  onAccent: '#181613',
  onHighlight: '#181613',

  track: 'rgba(245,240,230,0.16)',
  trackFill: 'rgba(154,166,226,0.45)',
  thumb: '#e8e3d8',
  handle: 'rgba(245,240,230,0.32)',

  glass: 'rgba(35,32,25,0.85)',
  glassRim: 'rgba(255,250,240,0.14)',

  shadow: '#000000',
  white: '#ffffff',
};

/** The static (light) palette, kept for non-themed call-sites (map cartography,
    shadow presets, anything sun-driven rather than OS-driven). Theme-aware screens
    reach for `useColors()` instead. */
export const palette = lightPalette;

// Type scale. System font (SF / Roboto — both clean and Nordic-friendly) with a
// disciplined hierarchy: a few sizes, deliberate weights, generous line-height on
// reading text, and uppercase tracking on labels. No arrays here so the object can
// be `as const` (literal weights) and spread straight into styles; tabular figures
// live in `mono` below.
export const type = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: 0.2, lineHeight: 40 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: 0.2, lineHeight: 34 },
  headline: { fontSize: 20, fontWeight: '700', letterSpacing: 0.2, lineHeight: 26 },
  bodyStrong: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 23 },
  callout: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  label: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
} as const;

/** Tabular figures — for clocks, countdowns, ticks (kept apart from `type` so the
    array doesn't force the scale readonly). Spread alongside a size from `type`. */
export const mono: TextStyle = { fontVariant: ['tabular-nums'] };

/** Elevation presets — soft, low, Nordic (never a hard drop shadow). */
export const shadow = {
  card: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  button: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  thumb: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
} satisfies Record<string, ViewStyle>;

/** Motion. Durations in ms; one spring for every snap so the app feels of a piece. */
export const motion = {
  fast: 160,
  base: 240,
  slow: 350,
  spring: { damping: 20, stiffness: 200, mass: 0.6 },
} as const;
