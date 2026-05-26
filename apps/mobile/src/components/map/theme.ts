// Chrome tokens for the map overlays (cards, scrubber, legend). These now derive
// from the unified design tokens in `@/theme` — kept as a named `mapTheme` object
// so the many `import { mapTheme }` call-sites stay unchanged. Translucent so the
// living map shows through, hairline borders, soft shadow — the restrained Nordic
// language, tuned to float over a map that darkens at night.
import { palette } from '../../theme/tokens';

export const mapTheme = {
  cardBg: palette.cardGlass,
  cardBorder: palette.hairline,
  text: palette.ink,
  textMuted: palette.inkMuted,
  // The interactive / "now / next" signal — the solar palette's night-indigo (isha),
  // so the chrome speaks the same sun-arc language as the map.
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  track: palette.track,
  trackFill: palette.trackFill,
  thumb: palette.white,
  shadow: palette.shadow,
  // Glass fallback (Android / iOS < 26 — where expo-glass-effect renders a plain View).
  glassFallback: palette.glass,
  glassBorder: palette.glassRim,
} as const;
