import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticSelection } from '@/lib/haptics';
import { space, type } from '@/theme/tokens';
import { chipStyles } from '@/components/ui/chip';
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
//
// `standard` puts a "Standard" tag on the row the app ships with. The default used to be
// named only inside a grey description ("Fajr 18°, Isha 17° · appens standard"), where
// nobody found it — and the check could not say it either, because the check marks the
// CURRENT value: an install from before the default moved from Muslim World League to
// Diyanet (2026-06) still has MWL saved, so the check sat on row two and read as "the
// standard is row two". The tag and the check answer different questions, so they are
// different marks. Callers pass DEFAULT_SETTINGS' value, so the tag cannot drift from
// the default the way a hand-written caption could.
export function OptionGroup<T extends string>({
  options,
  value,
  onChange,
  standard,
}: {
  options: readonly Option<T>[];
  /** `null` selects nothing — the MIXED state a bulk control shows when the values it
   *  writes to disagree (see the "Gäller alla" sound picker in (settings)/notiser). The
   *  selected check already renders off an equality test, so null simply matches none. */
  value: T | null;
  onChange: (value: T) => void;
  /** The app's default for this setting; that row carries a "Standard" tag. */
  standard?: T;
}) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const isStandard = opt.value === standard;
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
            //
            // Label, tag and description are joined with a parenthesis and a full stop, not
            // commas: a label can itself be a comma list ("Shafiʿi, Maliki, Hanbali"), and
            // "…, Hanbali, standard, Tidigare Asr" was heard as a fourth school and a fifth.
            accessibilityLabel={
              (isStandard ? `${opt.label} (standard)` : opt.label) +
              (opt.description ? `. ${opt.description}` : '')
            }
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
              {isStandard ? (
                // Wraps rather than shrinks: a label too long for one line takes the full
                // width and the tag drops under it instead of squeezing the name.
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{opt.label}</Text>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>Standard</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.label}>{opt.label}</Text>
              )}
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
  const chip = chipStyles(colors);
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
    labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm },
    // The app's one small status chip, shared with the dock's "Nu" badge.
    tag: chip.box,
    tagText: chip.text,
    description: { ...type.caption, color: colors.textMuted, marginTop: 2 }, // optical nudge
  });
}
