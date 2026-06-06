// The app's single design source of truth. Every surface speaks one Nordic
// language: a calm warm-paper / cool-navy ground (light / dark), a single solar
// night-indigo accent, hairline structure, and a restrained type scale. Settings
// screens consume these via `useSettingsColors()`; map and screens directly via
// `useColors()`.
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
// app read as family with the islam.se website. The dark palette is a COOL deep
// navy: when the OS is dark the Bönetider basemap also goes deep navy (Apple
// Maps-style), so the screens, sheets and modal backdrops share the basemap's
// temperature — that's what makes the screen→map handoff coherent instead of a
// warm-dark island sitting on a cool-dark map (or vice versa).
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
  paper: '#f6f3ed', //        screen background — warm neutral parchment
  paperSunken: '#eee9df', //  insets / pressed grouping
  surface: '#fffdf8', //      opaque cards — warm white
  cardGlass: 'rgba(255,253,248,0.90)', // translucent card over the living map

  // Ink — warm charcoal, web-aligned. Muted/faint are deepened vs the old cool
  // greys so secondary text actually reads (the old #8b94a0 was the "faint" feel).
  ink: '#1a1712',
  inkMuted: '#6f6456',
  inkFaint: '#978c7b',

  // Structure — warm borders, hairline opacity bumped 0.08 → 0.10 so edges show.
  border: '#e4ddce',
  separator: '#eee9df',
  hairline: 'rgba(26,23,18,0.10)',

  // Accent — Prussian night-indigo (isha). Structure / interactive / "now".
  // 2026 refinement: shifted from `#3a4684` toward Prussian/sapphire (H 230°→226°,
  // L 37%→34%) — the May 2026 "refined jewel tone" centre, away from periwinkle.
  accent: '#33437a',
  accentDeep: '#26315e',
  accentSoft: '#e7e8f1',

  // Highlight — warm brass-gold. The "live right now" emphasis (next prayer, qibla
  // lock). `highlightText` is the legible brass foreground on light surfaces; `onHighlight`
  // is the legible text/icon colour on a brass fill.
  highlight: '#b8862f',
  highlightSoft: '#f1e7d0',
  highlightText: '#805b1f',
  onAccent: '#ffffff', //     text/icon on an indigo fill
  onHighlight: '#1a1712', //  text/icon on a brass fill

  // Slider / track + the scrubber knob and the dock's grab handle.
  track: 'rgba(26,23,18,0.14)',
  trackFill: 'rgba(51,67,122,0.40)',
  thumb: '#fffdf8', //        scrubber knob (warm white)
  handle: 'rgba(26,23,18,0.20)', // dock grab handle

  // Glass fallback (Android / iOS < 26, where expo-glass-effect is a plain View)
  glass: 'rgba(255,253,248,0.85)',
  glassRim: 'rgba(255,255,255,0.55)',

  // Map prayer-pill surface. Opaque on purpose: the pills float over the changing
  // wash and basemap, so a translucent border composites unevenly behind the rounded
  // caps and they read as ragged. Opaque fill + opaque border = uniform smooth edge.
  // `pillNextBorder` is the brass ring around the next prayer — same brass the dock
  // countdown carries, so "what's next" reads in one colour across dock and map.
  pillSurface: '#fffdf8',
  pillBorder: 'rgba(26,23,18,0.10)',
  pillNextBorder: '#805b1f',

  shadow: '#1c150b', //       warm shadow (was cool #0b1220)
  white: '#ffffff',
} as const;

/** The shared shape both palettes satisfy — every surface reads these names. */
export type Palette = { readonly [K in keyof typeof lightPalette]: string };

// Cool dark — paired with the new dark Bönetider basemap (Apple Maps-inspired
// navy land). Grounds are a slightly blue-tinted deep navy so screens, sheets,
// modal backdrops and the basemap LAND share temperature — the screen→map
// handoff reads as one continuous world instead of a warm-dark island over a
// cool-dark map. We keep the WARM pale ink: the warm-on-cool tension is the
// app's visual signature, and the contrast is high. The 2026 May Prussian /
// brass jewel-tones stay; accent matches solar isha for both modes.
export const darkPalette: Palette = {
  paper: '#161a26', //          cool deep navy ground (was warm #181613)
  paperSunken: '#0f121b', //    deeper sunken navy
  surface: '#1d2233', //        opaque cards — matches basemap LAND so cards over a dark map sit nearly invisibly raised
  cardGlass: 'rgba(29,34,51,0.90)', // translucent card over the night map

  ink: '#e8e3d8', //            warm pale ink (deliberate warm/cool tension)
  inkMuted: '#a8acba', //       cool muted — neutral on navy
  inkFaint: '#7a8094', //       cool faint label tier

  border: '#2a3045',
  separator: '#222840',
  hairline: 'rgba(225,232,255,0.12)',

  // Dark accent mirrors the light token's Prussian shift (green-ward, not just dimmer),
  // so light↔dark sits on one hue axis. Soft tint kept unchanged (drift is invisible).
  accent: '#94a2dd',
  accentDeep: '#7888ca',
  accentSoft: 'rgba(148,162,221,0.16)',

  // 2026 refinement: muted from `#d8a94e` toward Cloud Dancer calm; still WCAG-AA
  // against the night map (≈5.5:1), so the next-prayer signal stays legible.
  highlight: '#c89a48',
  highlightSoft: 'rgba(200,154,72,0.16)',
  highlightText: '#c89a48',
  onAccent: '#161a26',
  onHighlight: '#161a26',

  track: 'rgba(225,232,255,0.16)',
  trackFill: 'rgba(148,162,221,0.45)',
  thumb: '#e8e3d8',
  handle: 'rgba(225,232,255,0.32)',

  glass: 'rgba(29,34,51,0.85)',
  glassRim: 'rgba(225,232,255,0.14)',

  // Map prayer-pill surface (dark). A touch LIGHTER than `paper`/`surface` so pills lift
  // off the night basemap as discrete elements; opaque so their rounded caps stay smooth
  // over the changing wash. Pill border is a soft navy line; `pillNextBorder` is the
  // muted dark brass — same hue as the dock's "next prayer" countdown.
  pillSurface: '#222840',
  pillBorder: '#4e5878',
  pillNextBorder: '#c89a48',

  shadow: '#000000',
  white: '#ffffff',
};

/** The static (light) palette, kept for non-themed call-sites (map cartography,
    shadow presets, anything sun-driven rather than OS-driven). Theme-aware screens
    reach for `useColors()` instead. */
export const palette = lightPalette;

// Type scale. System font (SF / Roboto — both clean and Nordic-friendly) with a
// disciplined hierarchy: a few sizes, deliberate weights, generous line-height on
// reading text, and a quiet sentence-case label for section headers. No arrays here so
// the object can be `as const` (literal weights) and spread straight into styles;
// tabular figures live in `mono` below.
export const type = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: 0, lineHeight: 40 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: 0, lineHeight: 34 },
  headline: { fontSize: 20, fontWeight: '700', letterSpacing: 0, lineHeight: 26 },
  bodyStrong: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  callout: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  // Settings section header. Sentence-case (not uppercase) — a calm Linear/Notion-style
  // header that whispers the group name rather than shouting it. Paired with a muted ink
  // colour at the call-site; the near-zero tracking keeps it quiet next to 16pt body rows.
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
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
  // A whisper of shadow for quiet map annotations (the prayer pills float over the
  // changing wash, so they want presence without a visible drop). Lighter than `thumb`.
  dot: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} satisfies Record<string, ViewStyle>;

/** Motion. Durations in ms; one spring for every snap so the app feels of a piece. */
export const motion = {
  // `quick` (110) sits below `fast` on purpose: it's the sensor-tracking easing for
  // the Qibla compass, which must follow the magnetometer near 1:1 or it feels laggy.
  quick: 110,
  fast: 160,
  base: 240,
  slow: 350,
  spring: { damping: 20, stiffness: 200, mass: 0.6 },
} as const;
