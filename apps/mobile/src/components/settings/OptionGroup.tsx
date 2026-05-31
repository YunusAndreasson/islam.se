import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticSelection } from '../../lib/haptics';
import { space, type } from '../../theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Optional leading MaterialCommunityIcons glyph — adds semantic
   *  differentiation when a value choice carries visual meaning (e.g. GPS vs
   *  city selector on Plats). Plain text-only rows omit this. */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
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
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              // A selection tick only on an actual change — matches the scrubber's
              // landmark-crossing feel and avoids buzzing on re-tapping the current row.
              if (opt.value !== value) hapticSelection();
              onChange(opt.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
          >
            {opt.icon ? (
              <MaterialCommunityIcons
                name={opt.icon}
                size={20}
                color={colors.textMuted}
                style={styles.icon}
              />
            ) : null}
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

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    row: {
      minHeight: 48, // comfortable touch target — kept fixed
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    pressed: { backgroundColor: colors.accentSoft },
    icon: { width: 20, marginRight: space.xs, textAlign: 'center' },
    textWrap: { flex: 1 },
    label: { ...type.body, color: colors.text },
    description: { ...type.caption, color: colors.textMuted, marginTop: 2 }, // optical nudge
  });
}
