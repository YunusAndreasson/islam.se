import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

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
        trackColor={{ true: colors.accent, false: colors.separator }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.separator}
      />
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    row: {
      minHeight: 48,
      paddingVertical: 8,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    dim: { opacity: 0.45 },
    text: { flex: 1 },
    label: { fontSize: 16, color: colors.text },
    description: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  });
}
