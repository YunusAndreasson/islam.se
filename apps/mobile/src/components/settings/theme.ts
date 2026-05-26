// Settings-screen colours, now derived from the unified design tokens in `@/theme`
// (kept as a named `colors` object so existing imports stay unchanged). One palette
// across the whole app — see theme/tokens.ts.
import { palette } from '../../theme/tokens';

export const colors = {
  bg: palette.paper,
  card: palette.surface,
  border: palette.border,
  text: palette.ink,
  textMuted: palette.inkMuted,
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  separator: palette.separator,
};
