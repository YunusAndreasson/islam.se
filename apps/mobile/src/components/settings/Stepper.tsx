import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { radius, space, type } from '../../theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

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
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  // Light impact only when the clamped value actually moves — a discrete step snap.
  // No buzz at min/max (the button is also `disabled` there, so it's double-guarded).
  const stepBy = (delta: number) => {
    const next = clamp(value + delta);
    if (next !== value) hapticLight();
    onChange(next);
  };
  const display = format ? format(value) : String(value);
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.control}>
        <Pressable
          onPress={() => stepBy(-step)}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`Minska ${label}`}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, value <= min && styles.disabled]}
        >
          <MaterialIcons name="remove" size={20} color={value <= min ? colors.textMuted : colors.accent} />
        </Pressable>
        <Text style={styles.value}>{display}</Text>
        <Pressable
          onPress={() => stepBy(step)}
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

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    row: {
      minHeight: 48, // comfortable touch target — kept fixed
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    label: { ...type.body, color: colors.text, flex: 1 },
    control: { flexDirection: 'row', alignItems: 'center' },
    btn: {
      width: 44, // 44pt touch target — kept fixed
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.xl,
    },
    pressed: { backgroundColor: colors.accentSoft },
    disabled: { opacity: 0.5 },
    value: {
      ...type.body,
      color: colors.text,
      minWidth: 64, // holds width as the digits change so the +/- buttons don't shift
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
  });
}
