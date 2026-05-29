// The app's theme hooks. `useActiveScheme()` is the single source of truth for
// "is the app in light or dark right now"; everything else (`useColors`, the
// basemap picker, the wash shader, prayer-line colours) reads from it.
//
// Apple Maps-style theming with a user escape hatch:
//   • Default `theme: 'system'` → follows the OS appearance setting (useColorScheme).
//   • `theme: 'light'` / `'dark'` → locked override stored in PrayerSettings, set
//     via Inställningar → Visning → Utseende.
//
// Both palettes are module constants, so the returned reference is stable per
// theme — a `useMemo(() => makeStyles(c), [c])` only recomputes when the active
// scheme flips. The shape `Palette` is shared, so any surface speaks one
// vocabulary regardless of which mode is active.
import { type ColorSchemeName, useColorScheme } from 'react-native';

import { useOptionalSettings } from '../lib/settings/context';
import { darkPalette, lightPalette, type Palette } from './tokens';

/** Resolve the active palette key (light or dark) for this render. Reads the
 *  user's saved theme preference: if `'system'` (the default) it follows the OS
 *  appearance; otherwise it returns the locked override. Returns a `'light' |
 *  'dark'` ColorSchemeName (never the loose 'unspecified' / null) so callers
 *  can pass it directly into the basemap / wash / prayer-colour helpers. */
export function useActiveScheme(): Extract<ColorSchemeName, 'light' | 'dark'> {
  const os = useColorScheme();
  const ctx = useOptionalSettings();
  // No provider (e.g. the ErrorScreen used as expo-router's app-wide boundary),
  // or still hydrating → defer to the OS scheme. Same answer as the 'system'
  // preference, so the first frame after launch doesn't flash the wrong palette.
  const preference = ctx?.loaded ? ctx.settings.theme : 'system';
  if (preference === 'light' || preference === 'dark') return preference;
  return os === 'dark' ? 'dark' : 'light';
}

export function useColors(): Palette {
  return useActiveScheme() === 'dark' ? darkPalette : lightPalette;
}
