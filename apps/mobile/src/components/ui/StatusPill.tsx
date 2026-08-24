// The one-line verdict under a dial.
//
// Both instruments carry the same object: a rounded pill holding one mark and one sentence,
// announced politely so a screen reader re-reads it the moment the state changes. It exists
// as a component because the two screens had drifted a little already — one bordered in
// accent, one in hairline — and because the thing it must NEVER do is easy to undo by
// accident and impossible to see in a diff.
//
// ⚠️ THE TEXT MUST BE BANDED. This is an `accessibilityLiveRegion`, so a value that moves
// with the sensor — a degree count at 10 Hz, an altitude rolling over every few minutes —
// would have TalkBack announcing continuously at a reader who has not touched anything.
// Magnitude belongs in the caption underneath, which is read on demand. Pass `a11yLabel`
// when the spoken form should differ from the printed one (that is what it is for: dropping
// the churning half, not paraphrasing).
import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { hexToRgba } from '@/theme/rgba';

/** How loud the pill is.
 *  `quiet`   a statement of fact — the Moon's phase, where it stands. No instruction in it.
 *  `neutral` an instruction, or a state the reader can act on. Accent border, accent ink.
 *  `near`    closing in: a warm brass tint, the "getting warmer" band made discrete.
 *  `on`      you are pointing at it. Solid brass. */
export type PillTone = 'quiet' | 'neutral' | 'near' | 'on';

interface Props {
  /** A glyph, for the states the icon set has a word for. */
  icon?: IconName;
  /** Anything else in the icon's place — the Moon dial puts a small drawn Moon here. */
  leading?: ReactNode;
  text: string;
  tone: PillTone;
  /** Spoken form, when it should differ from the printed one. See the warning above.
   *  Defaults to `text` — never to nothing: see the note at the call site. */
  a11yLabel?: string;
  c: Palette;
}

export function StatusPill({ icon, leading, text, tone, a11yLabel, c }: Props) {
  // Memoized on the palette, like every other makeStyles in the app — and here it is not
  // hygiene. Both host screens re-render up to ten times a second while the reader turns the
  // phone (useAim's TURN_PUSH_MS), and an unmemoized StyleSheet.create would register six
  // fresh style objects on every one of those, on the screens whose whole job is smoothness.
  const styles = useMemo(() => makeStyles(c), [c]);
  const on = tone === 'on';
  const near = tone === 'near';
  // The mark and the words are not always the same ink. On the warm `near` tint the glyph
  // takes the brass that names the band while the sentence stays plain ink — brass words on
  // `highlightSoft` sit under the text floor (see theme/tokens' highlight/highlightText split).
  const markColor = on ? c.onHighlight : near ? c.highlightText : tone === 'quiet' ? c.ink : c.accent;
  const textColor = on ? c.onHighlight : near || tone === 'quiet' ? c.ink : c.accent;
  return (
    <View
      style={[
        styles.pill,
        tone === 'quiet' && styles.pillQuiet,
        near && styles.pillNear,
        on && styles.pillOn,
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      // ⚠️ ALWAYS AN EXPLICIT LABEL, falling back to the printed text. Left unset, this
      // `accessible` node composes its own from its children — and the leading glyph
      // contributes an empty description, so TalkBack read the pill out as
      // ", Vrid åt vänster": a pause and a comma before every instruction on both screens.
      // Caught on a device; the composed form is invisible in a screenshot and in a render
      // test that queries by text.
      accessibilityLabel={a11yLabel ?? text}
    >
      {icon ? <Icon name={icon} size={16} color={markColor} /> : leading}
      <Text
        style={[styles.text, { color: textColor }]}
        numberOfLines={2}
      >
        {text}
      </Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: hexToRgba(c.accent, 0.3),
      // The longest line ("Kalibrera – rör telefonen i en åtta") ran off a narrow screen at
      // large text sizes. Cap the pill and let the text wrap inside it instead.
      maxWidth: '100%',
      ...shadow.button,
      shadowOpacity: 0.06,
    },
    // A fact, not an instruction: it should not wear the ink the app spends on things to act
    // on. The Moon's phase line sits here for all but three nights a month.
    pillQuiet: { borderColor: c.hairline },
    pillNear: { backgroundColor: c.highlightSoft, borderColor: 'transparent' },
    pillOn: { backgroundColor: c.highlight, borderColor: 'transparent' },
    text: { ...type.callout, fontWeight: '600', flexShrink: 1 },
  });
}
