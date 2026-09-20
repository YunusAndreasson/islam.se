import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { space, type } from '@/theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';
import { useCompactLayout } from './useCompactLayout';

/**
 * The one row that leads somewhere.
 *
 * This shape — a label on the left, sometimes the current value on the right, a glyph
 * saying what kind of leaving it is — had been written out six times: the Stad row, the
 * Beräkning card and the Påminnelser row on Inställningar, that screen's own LinkRow, a
 * SECOND LinkRow declared again inside Om, and the system-settings rows on Påminnelser.
 *
 * They had drifted, and the drift was visible. The chevron was 22 in four of them and 18
 * in one. `accessibilityRole` was "link" in Om and "button" for the same outward jump on
 * Inställningar. Worst, the two overflow policies were opposite: the Stad row clamped its
 * value to one line and truncated, while the Beräkning row let `calculationSummary` —
 * which grows to five segments once a reader changes the madhab, the polar rule, rounding
 * and a few offsets — wrap into a ragged right-aligned block beside a label that could
 * not shrink. One row shape cannot have two answers to "what happens when the value is
 * long", so it has one here: the value takes at most two lines and then truncates.
 *
 * Variants, by what the trailing glyph promises:
 *   • 'push'     — chevron. Opens another screen inside the app.
 *   • 'external' — open-in-new arrow. Leaves the app: the system settings, a website.
 *   • 'action'   — no glyph by default. A verb that acts in place.
 *
 * `role` is separate from the glyph on purpose, because "leaves the app" and "is a link"
 * are not the same claim. Opening iOS's own Settings is a BUTTON — it performs an action
 * on this device, and VoiceOver's link trait promises a document. Only a row that opens a
 * URL (Om's "Besök islam.se") is a link. The two had drifted apart across the screens;
 * the glyph now says where you are going and the role says what kind of control it is.
 *
 * `tone` picks the ink: 'label' is a noun the row is ABOUT (ink), 'action' is a verb the
 * row DOES (accent). That split is the screen's own rule — see installningar's styles.
 */
export type NavRowVariant = 'push' | 'external' | 'action';

export function NavRow({
  label,
  value,
  onPress,
  variant = 'push',
  tone = variant === 'push' ? 'label' : 'action',
  divider = false,
  accessibilityLabel,
  role = 'button',
  leadingIcon,
  trailing,
}: {
  label: string;
  /** The current setting, shown muted on the right. */
  value?: string;
  onPress: () => void;
  variant?: NavRowVariant;
  tone?: 'label' | 'action';
  /** 'link' only for a row that opens a URL. See the note above. */
  role?: 'button' | 'link';
  divider?: boolean;
  /** Spelled out when the row says more than its label — "Stad: Malmö. Tryck för att
   *  byta." The icons are decorative and hidden, so nothing composes it for us. */
  accessibilityLabel?: string;
  /** A glyph before the label, in the same ink as the label. The momentary "Uppdaterad ✓"
   *  confirmation after a GPS fix is the only one today: it takes over the verb slot, so
   *  the swap reads as that verb's success state rather than as a new row. */
  leadingIcon?: IconName;
  /** A caller-drawn trailing element, replacing the glyph. */
  trailing?: React.ReactNode;
}) {
  const colors = useSettingsColors();
  const compact = useCompactLayout();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Label over value when the screen is short of room, so a long place name or a
  // five-segment calculation summary gets the full card width instead of fighting the
  // label for one line.
  const stacked = compact && value !== undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}: ${value}` : label)}
      style={({ pressed }) => [
        styles.row,
        stacked && styles.stackedRow,
        divider && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.leading}>
        {leadingIcon ? (
          <Icon
            name={leadingIcon}
            size={18}
            color={tone === 'action' ? colors.accent : colors.text}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : null}
        <Text
          style={[tone === 'action' ? styles.action : styles.label, stacked && styles.stackedLabel]}
        >
          {label}
        </Text>
      </View>
      <View style={[styles.trailing, stacked && styles.stackedTrailing]}>
        {value !== undefined ? (
          <Text style={[styles.value, stacked && styles.stackedValue]} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
        {trailing ??
          (variant === 'action' ? null : (
            <Icon
              name={variant === 'external' ? 'externalLink' : 'chevronRight'}
              size={variant === 'external' ? 20 : 22}
              color={variant === 'external' ? colors.accent : colors.textMuted}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ))}
      </View>
    </Pressable>
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
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    pressed: { backgroundColor: colors.accentSoft },
    leading: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
    label: { ...type.body, color: colors.text, flexShrink: 0 },
    action: { ...type.body, color: colors.accent, flexShrink: 0 },
    // The value yields before the label, and `row.gap` keeps them from joining into
    // "Uppdatera platsDin plats" when both are long.
    value: { ...type.body, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
    trailing: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
    stackedRow: { flexDirection: 'column', alignItems: 'stretch', gap: space.xs },
    stackedLabel: { flexShrink: 1 },
    stackedTrailing: { justifyContent: 'space-between' },
    stackedValue: { flex: 1, textAlign: 'left' },
  });
}
