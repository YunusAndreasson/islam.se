// The app's OS-driven theme hook. Returns the active palette (light or dark) for
// the current appearance setting, so any surface can build its styles from one of
// two warm palettes that share a key set (see theme/tokens.ts).
//
// IMPORTANT — two independent "dark" axes:
//   • This hook = the user's OS appearance preference. It themes the NON-map screens
//     (Inställningar / Qibla / Om) and the menu when it's off the map.
//   • The map's day↔night is driven by the SUN (the solar `night` factor via
//     nightChrome), NOT this hook — the map is a live scene, so a daytime map stays
//     light even when the phone is in dark mode.
//
// Both palettes are module constants, so the returned reference is stable per theme
// — a `useMemo(() => makeStyles(c), [c])` only recomputes when the theme flips.
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from './tokens';

export function useColors(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkPalette : lightPalette;
}
