import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

// A titled card grouping related setting rows, with an optional footnote below
// (used to explain non-obvious options, e.g. polar-circle behaviour).
export function SettingSection({
  title,
  footnote,
  children,
}: {
  title: string;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
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
