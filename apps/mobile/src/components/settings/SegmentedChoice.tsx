// Native segmented choices when the available width and text size fit their labels.
// Compact screens and large text use full-width radio rows with wrapping labels.
// iOS uses SwiftUI Picker; Android uses Material 3 SingleChoiceSegmentedButtonRow.
//
// ⚠️ THE HOST MUST BE TOLD WHICH SCHEME TO PAINT IN. A Host renders real SwiftUI / Compose,
// and left to itself that content reads the PHONE's appearance — not the app's Utseende
// override, which is the very setting this control exists to change. Lock the app to "Ljust"
// on a phone in dark mode and Material 3 picks its dark-scheme on-surface ink, a pale
// #a1a2ac, and paints it on the app's light paper: measured at 2.50:1, against 16.9:1 when
// the two agree. The unselected labels are legible only if you know what they say.
//
// It is the same failure as the navigation bar in app/_layout, from the same cause — a
// native surface defaulting to the OS while the app is somewhere else — and it will happen
// to every @expo/ui control added to this app. Pass `colorScheme`.
//
// A DESCRIPTION, IF AN OPTION CARRIES ONE, is rendered below the control and follows the
// selection — the segmented-control-plus-footnote pattern — because a segment fits a word
// and nothing else. No option set passed here has one today (Utseende's three labels say
// everything they need to). The branch stays because the alternative is worse than dead
// code: `Option.description` is the shared type OptionGroup renders, so a set that does
// carry descriptions — MADHAB_OPTIONS, say, where the line is what tells a reader which
// madhhab they are choosing — would lose them silently rather than visibly.
import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { Host as SwiftHost, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { space, type } from '@/theme/tokens';
import { useActiveScheme } from '@/theme/useColors';
import { OptionGroup, type Option } from './OptionGroup';
import { useCompactLayout } from './useCompactLayout';
import { type SettingsColors, useSettingsColors } from './theme';

/** Native Host needs an explicit height. Large-text layouts use OptionGroup instead. */
const CONTROL_HEIGHT = 44;

export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the control when the card it sits in holds more than this one thing.
   *  A segmented row is the one control here that cannot label itself — the section
   *  title used to do that job, and on a shared card there is no longer a title per
   *  control. Same `type.label` header shape the in-card SubGroups on Påminnelser use,
   *  so a labelled segment and a labelled sound list read as one family. */
  label?: string;
}) {
  const colors = useSettingsColors();
  const compact = useCompactLayout();
  const scheme = useActiveScheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const description = options.find((o) => o.value === value)?.description;

  // NO haptic here, deliberately — see lib/haptics' policy block. OptionGroup ticks because
  // it is a control this app drew and must therefore feed back itself; a SwiftUI segmented
  // Picker and a Material 3 SingleChoiceSegmentedButtonRow already produce the platform's
  // own selection feedback, and adding ours on top would double it. Same exclusion the
  // Switch inside Toggle falls under.
  const select = (next: T): void => {
    if (next === value) return;
    onChange(next);
  };

  // Native segments cannot grow vertically or wrap their labels reliably. Use
  // the same choice rows as other settings when text needs more room. The label rides
  // along: the rows name the OPTIONS, never the setting they belong to.
  if (compact) {
    return (
      <>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <OptionGroup options={options} value={value} onChange={select} />
      </>
    );
  }

  return (
    <>
      {/* Outside `wrap`, which carries its own horizontal inset — nesting the label in it
          would indent the header one step further than every other card header. */}
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.wrap}>
      {Platform.OS === 'ios' ? (
        <SwiftHost
          style={styles.host}
          colorScheme={scheme}
          matchContents={{ vertical: false, horizontal: false }}
          // The host is a fixed CONTROL_HEIGHT and the segmented picker is shorter. Since
          // @expo/ui 58 a Host top-aligns its content by default, which would leave the
          // segments riding the top edge with the slack below them.
          alignment="center"
        >
          <Picker
            selection={value}
            onSelectionChange={(next) => select(next)}
            modifiers={[pickerStyle('segmented')]}
          >
            {options.map((option) => (
              <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftText>
            ))}
          </Picker>
        </SwiftHost>
      ) : (
        <Host style={styles.host} colorScheme={scheme}>
          <SingleChoiceSegmentedButtonRow>
            {options.map((option) => (
              <SegmentedButton
                key={option.value}
                selected={option.value === value}
                onClick={() => select(option.value)}
              >
                {/* The Label slot is a Compose SLOT, not a React text node: a bare string
                    child renders nothing and trips React Native's "Text strings must be
                    rendered within a <Text> component" — which on a device looks like a
                    segmented control with three blank segments. Caught on the emulator;
                    the types accept the string, so only running it says so. */}
                <SegmentedButton.Label>
                  <ComposeText>{option.label}</ComposeText>
                </SegmentedButton.Label>
              </SegmentedButton>
            ))}
          </SingleChoiceSegmentedButtonRow>
        </Host>
      )}
      {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    // Matches OptionGroup's row inset so a section mixing the two keeps one left edge.
    wrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },
    // Mirrors SettingSection's own card header (type.label) and the in-card SubGroup
    // titles on Påminnelser, so a labelled control inside a shared card sits at the same
    // rhythm as a titled one.
    label: {
      ...type.label,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: 14,
      paddingBottom: space.xs,
    },
    host: { height: CONTROL_HEIGHT },
    description: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  });
}
