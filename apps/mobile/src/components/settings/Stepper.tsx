import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticSelection } from '@/lib/haptics';
import { radius, space, type } from '@/theme/tokens';
import { Icon } from '@/components/ui/Icon';
import { type SettingsColors, useSettingsColors } from './theme';
import { useCompactLayout } from './useCompactLayout';

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
  const stacked = useCompactLayout();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  // A step counts TAPS, not renders. Recomputing from the `value` prop looks equivalent
  // and is not: the settings screens recompute a live prayer preview on every write, so a
  // burst of taps arrives together once JS frees up, React batches them into one render,
  // and every call in that batch reads the same `value`. Ten taps on "Öka Fajr" moved the
  // offset four minutes (measured on an emulator, 2026-08-25).
  //
  // So the base is the value last ASKED for, remembered next to the `value` it was asked
  // from: while that mark still matches we are inside one batch and the taps accumulate;
  // once the prop moves, the parent's value is the truth again.
  const requested = useRef({ value, from: value });
  // A selection tick only when the clamped value actually moves — stepping through discrete
  // values is class 3 in lib/haptics, the same tick as every other stepper in the app.
  // No buzz at min/max (the button is also `disabled` there, so it's double-guarded).
  const stepBy = (delta: number) => {
    const base = requested.current.from === value ? requested.current.value : value;
    const next = clamp(base + delta);
    requested.current = { value: next, from: value };
    if (next !== base) hapticSelection();
    onChange(next);
  };
  const display = format ? format(value) : String(value);
  return (
    // The value lives in its own Text node, so pressing "Öka Fajr" changed a number the
    // screen reader never spoke — the buttons announce the ACTION, nothing announced the
    // RESULT. Naming the row and exposing the formatted value gives that reading back.
    <View
      style={[styles.row, stacked && styles.stackedRow, divider && styles.divider]}
      accessibilityLabel={label}
      accessibilityValue={{ text: display }}
    >
      <Text style={[styles.label, stacked && styles.stackedLabel]}>{label}</Text>
      <View style={[styles.control, stacked && styles.stackedControl]}>
        <Pressable
          onPress={() => stepBy(-step)}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={`Minska ${label}`}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, value <= min && styles.disabled]}
        >
          <Icon name="remove" size={20} color={value <= min ? colors.textMuted : colors.accent} />
        </Pressable>
        <Text style={[styles.value, stacked && styles.stackedValue]}>{display}</Text>
        <Pressable
          onPress={() => stepBy(step)}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={`Öka ${label}`}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed, value >= max && styles.disabled]}
        >
          <Icon name="add" size={20} color={value >= max ? colors.textMuted : colors.accent} />
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
    stackedRow: { flexDirection: 'column', alignItems: 'stretch', gap: space.xs },
    stackedLabel: { flex: 0 },
    stackedControl: { alignSelf: 'stretch' },
    stackedValue: { flex: 1, minWidth: 0 },
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
