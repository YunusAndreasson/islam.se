// A native segmented control for the short, mutually-exclusive choices.
//
// The app's own OptionGroup — a vertical list with a check on the chosen row — is the right
// shape for the long ones: Beräkningsmetod has twelve entries whose per-row descriptions ARE
// the feature, and a segmented control could show none of them. It is the wrong shape for a
// three-way switch like Utseende, which every reader has already used a hundred times as a
// segmented control, in Inställningar, in Safari, in Photos. Rendering our own approximation
// of it costs the platform's touch behaviour, its selection animation, its Dynamic Type
// handling and its VoiceOver semantics, in exchange for a look we did not need to control.
//
// So this is the platform's real control on both: SwiftUI's `Picker` with `.segmented` on
// iOS, Material 3's `SingleChoiceSegmentedButtonRow` on Android.
//
// ⚠️ THE DESCRIPTION IS NOT DROPPED. A segment fits a word, and some of these options carry
// a line that tells the reader which one they are ("Rekommenderad"). That line moves BELOW
// the control and follows the selection — the segmented-control-plus-footnote pattern — so
// choosing still explains itself. A version of this that silently discarded `description`
// would read as tidier and would be a straight information loss.
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
import type { Option } from './OptionGroup';
import { type SettingsColors, useSettingsColors } from './theme';

/** Tall enough for the control at the largest text size the settings sheet allows without
 *  clipping, and the same on both platforms so the section's rhythm does not shift. Host
 *  needs a real height — SwiftUI is handed a proposed size, not measured from its content. */
const CONTROL_HEIGHT = 44;

export function SegmentedChoice<T extends string>({
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

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? (
        <SwiftHost style={styles.host} matchContents={{ vertical: false, horizontal: false }}>
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
        <Host style={styles.host}>
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
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    // Matches OptionGroup's row inset so a section mixing the two keeps one left edge.
    wrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },
    host: { height: CONTROL_HEIGHT },
    description: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  });
}
