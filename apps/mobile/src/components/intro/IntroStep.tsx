// The frame every introduction step is poured into: a progress mark, a heading, a lead
// paragraph, the step's own controls, and one footer row.
//
// Written as a shell rather than five near-identical screens so the rhythm is identical
// everywhere — same heading size, same gap under the lead, same footer height whether the
// step holds two buttons or a 2,100-row city list. A wizard whose furniture shifts
// between steps reads as five screens someone happened to put in a row.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { IntroMarkProgress } from './IntroMarkProgress';
import { motion, type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

interface Props {
  /** 0-based position, for the progress mark. */
  index: number;
  total: number;
  title: string;
  /** The one paragraph that says why this step exists. */
  lead: string;
  /** A quiet line under the controls — the reassurance, not the instruction. */
  footnote?: string;
  children?: ReactNode;
  /** Label of the primary action. */
  nextLabel: string;
  onNext: () => void;
  /** Omitted on the last step, where "Visa bönetider" is the only way out. */
  onSkip?: () => void;
  skipLabel?: string;
  /** Steps whose content scrolls itself (the city list) opt out of the ScrollView, which
   *  must never wrap a VirtualizedList. */
  scroll?: boolean;
}

export function IntroStep({
  index,
  total,
  title,
  lead,
  footnote,
  children,
  nextLabel,
  onNext,
  onSkip,
  skipLabel = 'Hoppa över',
  scroll = true,
}: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();

  const body = (
    <Animated.View style={styles.body} entering={reduceMotion ? undefined : FadeIn.duration(motion.base)}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.lead}>{lead}</Text>
      {children}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </Animated.View>
  );

  return (
    <View style={styles.wrap}>
      {/* Fixed slot, not inside `body` — chrome (brand + progress), not message. Its
          height never depends on how much lead text a step has, which is what stops it
          hopping vertically between steps the way it would if it sat in the scrollable
          flow: same slot, same size, every step, so the eye has one stable anchor while
          everything below it is free to vary in length. */}
      <View style={styles.markSlot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <IntroMarkProgress index={index} total={total} />
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flexContent}>{body}</View>
      )}
      <View style={styles.footer}>
        {onSkip ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            style={({ pressed }) => [styles.skip, pressed && styles.pressedQuiet]}
          >
            <Text style={styles.skipLabel}>{skipLabel}</Text>
          </Pressable>
        ) : (
          // Holds the primary button on the right even with no skip action, so it never
          // jumps sideways between steps.
          <View style={styles.skip} />
        )}
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          style={({ pressed }) => [styles.next, pressed && styles.pressed]}
        >
          <Text style={styles.nextLabel}>{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    // Same asymmetric padding the old dots carried (more air above than below), so the
    // safe area reads as a calm margin rather than the mark hugging the status bar /
    // notch. `paddingBottom` here is the gap between the mark and the title below it —
    // deliberately smaller than the top margin, so the two read as one group (chrome
    // sitting just above the message) rather than two evenly-spaced, unrelated rows.
    markSlot: {
      alignItems: 'center',
      paddingTop: space.xxl,
      paddingBottom: space.md,
    },
    scrollContent: {
      paddingHorizontal: space.lg,
      paddingBottom: space.xl,
    },
    // The TITLE stays top-anchored, not centered — centering the whole block was tried
    // and reverted because it made the title's own vertical position hop between steps
    // (see git history). Now that the mark lives in its own fixed slot above, "top" means
    // the same pixel on every step, so this holds for free.
    flexContent: { flex: 1, paddingHorizontal: space.lg },
    // Gives PlacePicker's own `flex: 1` FlatList (rendered as `children` once the location
    // step switches to city search) a bounded box to grow into inside `flexContent`.
    body: { flex: 1 },
    title: { ...type.title, color: c.ink, marginBottom: space.sm },
    lead: { ...type.body, color: c.inkMuted, marginBottom: space.xl },
    footnote: { ...type.caption, color: c.inkFaint, marginTop: space.lg },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.lg,
      paddingTop: space.md,
      paddingBottom: space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.hairline,
    },
    // 44 pt minimums on both actions — the footer is the one row every user touches.
    skip: { minHeight: 44, justifyContent: 'center', paddingRight: space.lg },
    skipLabel: { ...type.body, color: c.inkMuted },
    next: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: space.xxl,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    nextLabel: { ...type.bodyStrong, color: c.onAccent },
    pressed: { opacity: 0.85 },
    pressedQuiet: { opacity: 0.6 },
  });
}
