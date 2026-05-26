import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

// A vertical single-select list. The chosen row shows a check; the whole row is a
// 44pt+ touch target. Generic over the value union so callers stay type-safe.
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.textWrap}>
              <Text style={styles.label}>{opt.label}</Text>
              {opt.description ? <Text style={styles.description}>{opt.description}</Text> : null}
            </View>
            {selected ? (
              <MaterialIcons name="check" size={22} color={colors.accent} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  pressed: { backgroundColor: colors.accentSoft },
  textWrap: { flex: 1 },
  label: { fontSize: 16, color: colors.text },
  description: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
