// Shared onboarding frame: pinned progress/back controls, a scrolling message and
// content area, and a pinned action footer. The heading starts at the same position
// on each step, but scrolls away so large text cannot consume the controls' viewport.
// City search opens a separate modal; no VirtualizedList is nested in this ScrollView.
// The location/reminder steps own their primary action, so their footer uses quiet
// styling. The welcome step alone has a separate skip destination.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { IntroMarkProgress } from './IntroMarkProgress';
import { motion, type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

/** Paired with a 13pt label on one row, so it reads as a progress chip rather than a logo
 *  with a number beside it. */
const MARK_SIZE = 40;

interface Props {
  /** 0-based position, for the progress chip. */
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
  /** `quiet` on steps whose own content already owns a filled CTA — see the note above. */
  nextTone?: 'primary' | 'quiet';
  /** Only for a step where skipping goes somewhere ADVANCING does not — see above. That is
   *  the welcome step alone, so the label is fixed rather than a prop. */
  onSkip?: () => void;
  /** Step back one. Omitted on the first step, where there is nowhere to go — the caller
   *  decides that, so this component never has to know what step 0 means. */
  onBack?: () => void;
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
  nextTone = 'primary',
  onSkip,
  onBack,
}: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  const quiet = nextTone === 'quiet';

  const content = (
    <>
      {children}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </>
  );

  return (
    <View style={styles.wrap}>
      {/* Fixed slot, outside the animated flow — chrome, not message. Its height never
          depends on how much lead text a step has, which is what stops it hopping
          vertically between steps: same slot, same size, every step, so the eye has one
          stable anchor while everything below it is free to vary in length.

          It sits on the SAME left gutter as the title rather than centred over it. A
          centred mark above left-aligned copy shares no axis with anything below and
          floats free of the composition; on the gutter it starts the same vertical line
          the title, lead, controls and actions all sit on.

          The back control shares the row rather than taking one of its own — a second
          chrome row would reintroduce exactly the tier this design removed. */}
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            // The glyph is 24pt; the slop is what makes the target. It sits in the gutter
            // ahead of the mark, so the row's own left edge stays the page's vertical line.
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Tillbaka till föregående steg"
            style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          >
            <Icon name="back" size={24} color={c.inkFaint} />
          </Pressable>
        ) : null}
        {/* One accessibility element for the mark and its caption: they say the same thing,
            and `accessibilityValue.text` is what actually gets announced. The back button
            above is deliberately OUTSIDE this node — grouping them would swallow it. */}
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: total, now: index + 1, text: stepLabel(index, total) }}
        >
          <IntroMarkProgress index={index} total={total} size={MARK_SIZE} />
          <Text style={styles.counter}>{stepLabel(index, total)}</Text>
        </View>
      </View>

      <Animated.View
        style={styles.flow}
        entering={reduceMotion ? undefined : FadeIn.duration(motion.base)}
      >
        <ScrollView style={styles.band} contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.message}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Text style={styles.lead}>{lead}</Text>
          </View>
          <View style={styles.bandContent}>
            {content}
            <View style={styles.slack} />
          </View>
        </ScrollView>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.next,
            quiet && styles.nextQuiet,
            pressed && (quiet ? styles.pressedQuiet : styles.pressed),
          ]}
        >
          <Text style={[styles.nextLabel, quiet && styles.nextLabelQuiet]}>{nextLabel}</Text>
        </Pressable>
        {/* Height reserved on the three steps that have no skip, so the primary button
            lands under the same thumb position on all four — and where it is empty it
            simply becomes breathing room above the home indicator, which the bar needs
            anyway. One centred cell, because there is never more than one control in it:
            see the note on `onSkip` above. */}
        <View style={styles.secondary}>
          {onSkip ? (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              style={({ pressed }) => [styles.skip, pressed && styles.pressedQuiet]}
            >
              <Text style={styles.skipLabel}>Hoppa över</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function stepLabel(index: number, total: number): string {
  return `Steg ${index + 1} av ${total}`;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { flex: 1 },

    // Chrome belongs to the top EDGE, so it sits close to the safe area and far from the
    // title. The old slot had it 12pt above the title and 24pt below the inset, which read
    // as "mark and title are one group" — they are not: one is a step counter, the other
    // is what the step says. The gap that matters is the one under this row.
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      paddingTop: space.lg,
    },
    progress: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    counter: { ...type.label, color: c.inkFaint },
    // Quiet by design: this is a way back, not an invitation to take one. Same faint ink
    // as the step counter it stands beside, so the row reads as one band of chrome.
    back: { marginRight: space.xs },
    backPressed: { opacity: 0.5 },

    flow: { flex: 1 },
    message: { paddingHorizontal: space.lg, paddingTop: space.xxl },
    // Negative tracking is applied here rather than on `type.title`, which is the section
    // header on eight other screens: at 28pt bold a hero title wants the optical tightening
    // and a settings header, read once and skimmed, does not.
    title: { ...type.title, letterSpacing: -0.4, color: c.ink, marginBottom: space.sm },
    lead: { ...type.lead, color: c.inkMuted },

    band: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    // The proximity ladder, in one place: 8pt inside the message (title + lead are one
    // unit), 32pt from the message to the controls (the biggest gap on the screen — it is
    // what separates "what this is about" from "what you do about it"), 16pt from a
    // control to the footnote that explains it.
    bandContent: {
      flexGrow: 1,
      paddingHorizontal: space.lg,
      paddingTop: space.xxxl,
      paddingBottom: space.xl,
    },
    slack: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
    footnote: { ...type.caption, color: c.inkFaint, marginTop: space.lg },

    actions: {
      paddingHorizontal: space.lg,
      // A step whose content scrolls (the method step) ends this band's hairline mid-card,
      // so the primary needs visible air under that edge or the two read as touching.
      paddingTop: space.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.hairline,
    },
    // Full-width rather than a small pill in the corner: it is the one control every user
    // on every step touches, and a right-aligned pill left the bottom of the screen
    // lopsided — quiet text on one side, a bright capsule on the other, and nothing
    // holding the middle.
    next: {
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.xxl,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    // The tint alone is not enough to make this read as a button: `accentSoft` measures
    // about 1.1:1 against the light `paper` ground, so on that theme the pill vanished and
    // its label read as a bare text link. The outline is what carries the shape (WCAG's
    // non-text contrast is satisfied by a boundary, not by a fill — the same argument the
    // scrubber knob's ring makes in theme/tokens.ts), and it holds on both grounds.
    nextQuiet: { backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.accent },
    nextLabel: { ...type.bodyStrong, color: c.onAccent },
    nextLabelQuiet: { color: c.accent },
    // A fixed 44 pt whether or not it holds anything, so the primary above it never moves
    // between steps; when it does hold the skip, 44 pt is that control's own touch minimum.
    secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
    skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl },
    skipLabel: { ...type.body, color: c.inkMuted },
    pressed: { opacity: 0.85 },
    pressedQuiet: { opacity: 0.6 },
  });
}
