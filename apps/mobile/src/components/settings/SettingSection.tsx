import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, type } from '../../theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

// A card grouping related setting rows. The title (optional) sits INSIDE the card
// as a muted uppercase header above the children — matching DisclosureGroup's
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
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { marginBottom: space.xxl },
    // type.label is the design-token uppercase rhythm (12.5/600 with letterSpacing
    // 0.8 and textTransform: 'uppercase'). Single source of truth for every card
    // header; DisclosureGroup mirrors this style.
    title: {
      ...type.label,
      color: colors.textMuted,
      paddingTop: 14,
      paddingHorizontal: space.lg,
      paddingBottom: space.xs + 2,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
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
