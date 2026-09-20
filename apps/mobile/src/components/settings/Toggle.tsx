import { useMemo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { hapticToggle } from '@/lib/haptics';
import { space, type } from '@/theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

// A labelled switch row for boolean settings (notifications on/off, per-prayer
// alerts). Matches the Stepper/OptionGroup rhythm: 48pt min height, hairline
// divider between stacked rows, the app's accent as the "on" track.
//
// THE WHOLE ROW FLIPS IT, not just the switch. This used to be a plain View, so the only
// thing that answered a tap was the switch itself — roughly 51×31 inside a 48 dp row, in
// thirteen places across the app. Everywhere else in this app a list row is pressable
// along its full width (OptionGroup, NavRow, PlacePicker), and a reader who has just
// tapped "Välj stad" on its label has been taught that rows work that way.
//
// A11Y: the row is now ONE node that declares itself a switch, and its children are
// hidden. Before, the label Text and the Switch were two nodes, so a screen reader read
// the label, then read it again as part of the switch's own accessibilityLabel. The name
// is spelled out here rather than composed from the children for the reason OptionGroup
// documents at length: composition picks up icon-font glyphs and empty fragments.
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
  const accessibilityLabel = description ? `${label}. ${description}` : label;

  // ⚠️ THE TWO PATHS FEED BACK DIFFERENTLY, ON PURPOSE.
  //
  // A tap on the Switch is swallowed by the Switch — it never reaches this Pressable's
  // onPress — and the platform control fires its own feedback. lib/haptics' policy
  // exempts exactly that case, so `onValueChange` below stays silent.
  //
  // A tap on the ROW sets the value programmatically, and a programmatic write produces
  // no platform feedback at all. That is class 4 in the policy — a control snapping under
  // direct manipulation — so the row's own press ticks. Without this, half the row would
  // buzz and half would not, which is worse than either.
  const pressRow = (): void => {
    if (disabled) return;
    hapticToggle(!value);
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={pressRow}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        disabled && styles.dim,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={styles.text}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        trackColor={{ true: colors.accent, false: colors.track }}
        thumbColor={colors.thumb}
        ios_backgroundColor={colors.track}
      />
    </Pressable>
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
    // The same tint every other pressable settings row uses under the finger.
    pressed: { backgroundColor: colors.accentSoft },
    dim: { opacity: 0.5 }, // disabled-control dimming — one step shared with Stepper's `disabled`
    text: { flex: 1 },
    label: { ...type.body, color: colors.text },
    description: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  });
}
