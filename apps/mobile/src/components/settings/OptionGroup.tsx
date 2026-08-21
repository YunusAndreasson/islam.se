import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticSelection } from '@/lib/haptics';
import { space, type } from '@/theme/tokens';
import { Icon, type IconName } from '@/components/ui/Icon';
import { type SettingsColors, useSettingsColors } from './theme';

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
  /** Optional leading glyph — adds semantic differentiation when a value choice
   *  carries visual meaning (e.g. GPS vs city selector on Plats). Plain text-only
   *  rows omit this. */
  icon?: IconName;
}

// A vertical single-select list. The chosen row shows a check; the whole row is a
// 44pt+ touch target. Generic over the value union so callers stay type-safe.
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  /** `null` selects nothing — the MIXED state a bulk control shows when the values it
   *  writes to disagree (see the "Gäller alla" sound picker in (settings)/notiser). The
   *  selected check already renders off an equality test, so null simply matches none. */
  value: T | null;
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
            // A radio's selected value is exposed as `checked`, not `selected`.
            // Android otherwise announces every option identically even though the
            // trailing checkmark gives sighted users clear state feedback.
            accessibilityState={{ checked: selected }}
            // Spell the name out instead of letting Android compose it from the children:
            // the leading icon and the trailing check are icon-font Text nodes, so the
            // composed name came out as "󰆤, GPS (min plats), " — a private-use codepoint
            // read aloud as an unknown symbol, plus an empty fragment for the checkmark.
            accessibilityLabel={opt.description ? `${opt.label}, ${opt.description}` : opt.label}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
          >
            {opt.icon ? (
              <Icon
                name={opt.icon}
                size={20}
                color={colors.textMuted}
                style={styles.icon}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : null}
            <View style={styles.textWrap}>
              <Text style={styles.label}>{opt.label}</Text>
              {opt.description ? <Text style={styles.description}>{opt.description}</Text> : null}
            </View>
            {selected ? (
              <Icon
                name="check"
                size={22}
                color={colors.accent}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
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
