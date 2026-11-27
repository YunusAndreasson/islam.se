// Settings-screen colours, now OS-theme-aware. `useSettingsColors()` maps the active
// palette (light or dark, via useColors) onto the named shape the settings rows were
// written against — so the settings/qibla/om screens follow the device appearance
// setting. The returned object is memoised on the (stable) palette reference, so a
// `makeStyles(colors)` only rebuilds when the theme flips. See theme/tokens.ts.
import { useMemo } from 'react';
import type { TextStyle } from 'react-native';

import { space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function useSettingsColors() {
  const c = useColors();
  return useMemo(
    () => ({
      bg: c.paper,
      card: c.surface,
      border: c.border,
      text: c.ink,
      textMuted: c.inkMuted,
      textFaint: c.inkFaint,
      accent: c.accent,
      onAccent: c.onAccent,
      accentSoft: c.accentSoft,
      onAccentSoft: c.onAccentSoft,
      separator: c.separator,
      // The quiet body/edge of a control that must still be found (see tokens.ts).
      handle: c.handle,
      // Brass "next" emphasis, kept consistent with the dock + map.
      highlight: c.highlight,
      highlightText: c.highlightText,
      highlightSoft: c.highlightSoft,
    }),
    [c],
  );
}

export type SettingsColors = ReturnType<typeof useSettingsColors>;

/**
 * The label that heads a card, or a group inside one: `type.label` in muted ink, at the
 * rows' own 16 dp inset, 14 above and 4 below.
 *
 * One definition because there were three (SettingSection's title, the sub-group titles on
 * Påminnelser, SegmentedChoice's label), each a hand-copy with a comment saying it mirrored
 * the others. The 14 is the one off-scale number in it and is deliberate: with the label's
 * own line it puts the first row's text the same distance under the card's top edge as a
 * 48 dp row puts its own.
 */
export function cardHeaderStyle(colors: Pick<SettingsColors, 'textMuted'>): TextStyle {
  return {
    ...type.label,
    color: colors.textMuted,
    paddingHorizontal: space.lg,
    paddingTop: 14,
    paddingBottom: space.xs,
  };
}
