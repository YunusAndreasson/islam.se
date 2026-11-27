import { createContext, type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, space, type } from '@/theme/tokens';
import { cardHeaderStyle, type SettingsColors, useSettingsColors } from './theme';

/** True for anything rendered inside a SettingSection's card. A component that would
 *  otherwise draw a card of its own (DisclosureGroup) reads it and draws rows instead —
 *  a card inside a card doubles every edge and leaves stripes of the outer one between. */
export const InsideCard = createContext(false);

// A card grouping related setting rows. The title (optional) sits INSIDE the card
// as a muted sentence-case header above the children — matching DisclosureGroup's
// header rhythm so titled cards on the screen read as one family. An untitled
// section is a list-style card (think the trio at the bottom of Inställningar):
// no header row, just hairline-divided children. The optional footnote sits
// below the card in muted ink, web-style.
export function SettingSection({
  title,
  footnote,
  children,
}: {
  title?: string;
  footnote?: string;
  children: ReactNode;
}) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {title ? <Text accessibilityRole="header" style={styles.title}>{title}</Text> : null}
        <InsideCard value>{children}</InsideCard>
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { marginBottom: space.xxl },
    // The shared card header (settings/theme), with two more dp under it: this one heads a
    // whole card, so it stands a little further off its first row than a sub-group's does.
    title: { ...cardHeaderStyle(colors), paddingBottom: space.xs + 2 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    footnote: {
      ...type.caption,
      color: colors.textMuted,
      marginTop: space.sm,
      marginHorizontal: space.xs,
    },
  });
}
