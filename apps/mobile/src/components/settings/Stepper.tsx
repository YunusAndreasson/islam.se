import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

// A labelled −/value/+ stepper row for integer settings (minute adjustments,
// Hijri day offset). Clamps to [min, max]; buttons are 44pt touch targets.
export function Stepper({
  label,
  value,
  onChange,
  min = -120,
  max = 120,
  step = 1,
  format,
  divider = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  divider?: boolean;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const display = format ? format(value) : String(value);
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.control}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`Minska ${label}`}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, value <= min && styles.disabled]}
        >
          <MaterialIcons name="remove" size={20} color={value <= min ? colors.textMuted : colors.accent} />
        </Pressable>
        <Text style={styles.value}>{display}</Text>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`Öka ${label}`}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, value >= max && styles.disabled]}
        >
          <MaterialIcons name="add" size={20} color={value >= max ? colors.textMuted : colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  label: { fontSize: 16, color: colors.text, flex: 1 },
  control: { flexDirection: 'row', alignItems: 'center' },
  btn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  pressed: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.5 },
  value: { fontSize: 16, color: colors.text, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
