// Settings-screen colours, now OS-theme-aware. `useSettingsColors()` maps the active
// palette (light or dark, via useColors) onto the named shape the settings rows were
// written against — so the settings/qibla/om screens follow the device appearance
// setting. The returned object is memoised on the (stable) palette reference, so a
// `makeStyles(colors)` only rebuilds when the theme flips. See theme/tokens.ts.
import { useMemo } from 'react';

import { useColors } from '../../theme/useColors';

export function useSettingsColors() {
  const c = useColors();
  return useMemo(
    () => ({
      bg: c.paper,
      card: c.surface,
      border: c.border,
      text: c.ink,
      textMuted: c.inkMuted,
      accent: c.accent,
      accentSoft: c.accentSoft,
      separator: c.separator,
      // Brass "next" emphasis, kept consistent with the dock + map.
      highlight: c.highlight,
      highlightSoft: c.highlightSoft,
    }),
    [c],
  );
}

export type SettingsColors = ReturnType<typeof useSettingsColors>;
