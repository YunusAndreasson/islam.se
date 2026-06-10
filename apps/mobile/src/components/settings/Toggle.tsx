import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { space, type } from '../../theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

// A labelled switch row for boolean settings (notifications on/off, per-prayer
// alerts). Matches the Stepper/OptionGroup rhythm: 48pt min height, hairline
// divider between stacked rows, the app's accent as the "on" track.
export function Toggle({
  label,
  description,
  value,
  onValueChange,
  divider = false,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  divider?: boolean;
  disabled?: boolean;
}) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accessibilityLabel = description ? `${label}, ${description}` : label;
  return (
    <View style={[styles.row, divider && styles.divider, disabled && styles.dim]}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        trackColor={{ true: colors.accent, false: colors.track }}
        thumbColor={colors.thumb}
        ios_backgroundColor={colors.track}
      />
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    row: {
      minHeight: 48,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    dim: { opacity: 0.5 }, // disabled-control dimming — one step shared with Stepper's `disabled`
    text: { flex: 1 },
    label: { ...type.body, color: colors.text },
    description: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  });
}
