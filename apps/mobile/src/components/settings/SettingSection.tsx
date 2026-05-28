import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type SettingsColors, useSettingsColors } from './theme';

// A titled card grouping related setting rows, with an optional footnote below.
//
// The title sits INSIDE the card (a muted uppercase header row above the children),
// matching DisclosureGroup's header rhythm and the Om-appen card — so every card on
// the Inställningar screen reads as one self-contained titled unit. Earlier this
// title was rendered above the card; that mixed pattern (some sections with an
// external heading, others without) read as disorganised, hence the unification.
export function SettingSection({
  title,
  footnote,
  children,
}: {
  title: string;
  footnote?: string;
  children: ReactNode;
}) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{title.toUpperCase()}</Text>
        {children}
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 24 },
    // 13/600 muted uppercase — identical to DisclosureGroup's title style so the
    // two card types are visually indistinguishable as section headers.
    title: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    footnote: { fontSize: 12, color: colors.textMuted, marginTop: 8, marginHorizontal: 4, lineHeight: 16 },
  });
}
