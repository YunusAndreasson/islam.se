// A settings-style row with a leading icon chip, a title + detail block, and a
// trailing chevron. Used by the Kontakt screen for rate / mail / website rows,
// and shaped to feel native to the rest of the settings sheet.
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticSelection } from '../../lib/haptics';
import { radius, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

interface Props {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
  divider?: boolean;
}

export function ContactRow({ icon, label, detail, onPress, divider = false }: Props) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
        pressed && { backgroundColor: c.accentSoft },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
        <MaterialIcons name={icon} size={18} color={c.accent} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, { color: c.ink }]}>{label}</Text>
        <Text style={[styles.detail, { color: c.inkMuted }]}>{detail}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={c.inkFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  label: type.bodyStrong,
  detail: { ...type.caption, marginTop: 1 },
});
