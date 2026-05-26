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

// Colour. One palette for the whole app. The neutrals are a soft, cool Nordic
// paper rather than flat iOS gray; the accent is the solar palette's own
// night-indigo (isha) so the chrome speaks the same sun-arc language as the map —
// warm dots carry prayer identity, this cool indigo carries "what's live".
export const palette = {
  // Grounds & surfaces
  paper: '#eef1f5', //        screen background — airy cool paper
  paperSunken: '#e7ebf1', //  insets / pressed grouping
  surface: '#ffffff', //      opaque cards
  cardGlass: 'rgba(252,252,254,0.90)', // translucent card over the living map

  // Ink
  ink: '#11181c',
  inkMuted: '#5b6470',
  inkFaint: '#8b94a0',

  // Structure
  border: '#e3e3e8',
  separator: '#ececf0',
  hairline: 'rgba(17,24,28,0.08)',

  // Accent — solar night-indigo (isha). The single interactive / "now" signal.
  accent: '#46527f',
  accentDeep: '#363f64',
  accentSoft: '#e9ebf5',

  // Slider / track
  track: 'rgba(17,24,28,0.12)',
  trackFill: 'rgba(70,82,127,0.35)',

  // Glass fallback (Android / iOS < 26, where expo-glass-effect is a plain View)
  glass: 'rgba(250,251,253,0.85)',
  glassRim: 'rgba(255,255,255,0.55)',

  shadow: '#0b1220',
  white: '#ffffff',
} as const;

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
