// The frame every introduction step is poured into. Four bands, top to bottom:
//
//   header    progress chip (mark + "Steg 2 av 4") — chrome, pinned to the top edge
//   message   title + lead — top-anchored, the same pixel on every step
//   band      the step's own controls — FLEXIBLE, and where the slack goes
//   actions   one primary, and beneath it a quiet row: back on the left, skip centred
//
// Written as a shell rather than four near-identical screens so the rhythm is identical
// everywhere — same heading size, same gaps, same action geometry whether the step holds
// three lines of copy or a 2,100-row city list. A wizard whose furniture shifts between
// steps reads as four screens someone happened to put in a row.
//
// ── Where the empty space lives ───────────────────────────────────────────────────────
// The first cut stacked everything in one top-anchored column, which meant a short step
// (welcome, location) put its whole message in the top 45% of the screen and left a single
// dead half below it, with the actions marooned at the bottom. `band` fixes that: it is
// flex:1 and CENTRES its content, so the slack is split above and below the controls
// instead of pooling in one hole. When the content is taller than the band (the method
// step's two option lists) `flexGrow: 1` has nothing to grow into, centring becomes a
// no-op and it simply scrolls — the same style covers both cases.
//
// ── One filled accent per screen ──────────────────────────────────────────────────────
// `nextTone` exists because the footer is NOT the primary action on every step. On the
// location and reminder steps the recommended action is the step's own filled CTA ("Använd
// min plats", "Slå på påminnelser") and the footer only means "move on" — two identically
// filled accent pills on one screen ask the user to rank them, which is the frame's job,
// not theirs. So those steps pass `quiet` and the footer drops to a tinted pill: still
// obviously the way forward, no longer competing for the eye.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

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
  /** Omitted on the last step, where "Visa bönetider" is the only way out. */
  onSkip?: () => void;
  skipLabel?: string;
  /** Step back. Omitted on the first step, where there is nowhere to go — absent rather
   *  than disabled, because a greyed control that never becomes usable is a dead end the
   *  user has to test to understand. */
  onBack?: () => void;
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
  nextTone = 'primary',
  onSkip,
  skipLabel = 'Hoppa över',
  onBack,
  scroll = true,
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

          One accessibility element, not two: the wedge and its caption say the same
          thing, and `accessibilityValue.text` is what actually gets announced. */}
      <View
        style={styles.header}
        accessible
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: index + 1, text: stepLabel(index, total) }}
      >
        <IntroMarkProgress index={index} total={total} size={MARK_SIZE} />
        <Text style={styles.counter}>{stepLabel(index, total)}</Text>
      </View>

      <Animated.View
        style={styles.flow}
        entering={reduceMotion ? undefined : FadeIn.duration(motion.base)}
      >
        {/* The message stays top-anchored, not centred — centring the whole block was
            tried and reverted because it made the title's own vertical position hop
            between steps (see git history). It is the one thing on the screen that must
            not move. */}
        <View style={styles.message}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.lead}>{lead}</Text>
        </View>

        {scroll ? (
          <ScrollView
            style={styles.band}
            contentContainerStyle={styles.bandContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Two unequal spacers rather than `justifyContent: 'center'`: dead centre put
                the welcome step's three lines adrift halfway down the screen, a good 200pt
                below the sentence they belong to. 2:3 lands them on the optical centre —
                near enough to the message to still read as part of it, far enough from the
                actions that the screen has a middle. Both collapse to nothing when the
                content is taller than the band (the method step), so they cost that step
                no scroll length. */}
            <View style={styles.slackTop} />
            {content}
            <View style={styles.slackBottom} />
          </ScrollView>
        ) : (
          // Gives PlacePicker's own `flex: 1` FlatList (rendered as `children` once the
          // location step switches to city search) a bounded box to grow into — which is
          // also why this branch centres instead of using the spacers above: a flex child
          // competing with them for the slack would be squeezed into a quarter of the band.
          <View style={[styles.band, styles.bandContent, styles.bandCentred]}>{content}</View>
        )}
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
        {/* The secondary line's height is reserved even on the step that has neither of
            its controls, so the primary button lands under the same thumb position on all
            four — and on that last step the reserved line simply becomes breathing room
            above the home indicator, which it needs anyway.

            BACK LIVES HERE, not as a chevron in the top-left. This screen is a
            fullScreenModal with no navigation bar, so a lone chevron up there would be
            new chrome with nothing to belong to, sharing the top edge with the progress
            chip and competing with it — and any room made for it would come out of a
            vertical rhythm this file spends three paragraphs getting right. Down here it
            joins the band that is already the screen's navigation zone, within reach of
            the thumb that just pressed "Nästa", and costs no layout at all.

            Three cells rather than two so the skip stays on the exact optical centre
            whether or not a back control is present: the flexible side cells are equal,
            so adding back on step 2 does not nudge "Hoppa över" sideways from where it
            sat on step 1. */}
        <View style={styles.secondary}>
          <View style={styles.secondarySide}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Tillbaka till föregående steg"
                style={({ pressed }) => [styles.back, pressed && styles.pressedQuiet]}
              >
                <Text style={styles.backLabel}>Tillbaka</Text>
              </Pressable>
            ) : null}
          </View>
          {onSkip ? (
            <Pressable
              onPress={onSkip}
              accessibilityRole="button"
              style={({ pressed }) => [styles.skip, pressed && styles.pressedQuiet]}
            >
              <Text style={styles.skipLabel}>{skipLabel}</Text>
            </Pressable>
          ) : null}
          <View style={styles.secondarySide} />
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
    counter: { ...type.label, color: c.inkFaint },

    flow: { flex: 1 },
    message: { paddingHorizontal: space.lg, paddingTop: space.xxl },
    // Negative tracking is applied here rather than on `type.title`, which is the section
    // header on eight other screens: at 28pt bold a hero title wants the optical tightening
    // and a settings header, read once and skimmed, does not.
    title: { ...type.title, letterSpacing: -0.4, color: c.ink, marginBottom: space.sm },
    lead: { ...type.lead, color: c.inkMuted },

    band: { flex: 1 },
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
    bandCentred: { justifyContent: 'center' },
    slackTop: { flexGrow: 2, flexShrink: 1, flexBasis: 0 },
    slackBottom: { flexGrow: 3, flexShrink: 1, flexBasis: 0 },
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
    // 44 pt minimums on every action — this is the row every user touches.
    secondary: { height: 44, flexDirection: 'row', alignItems: 'center' },
    // Equal flexible cells flanking the skip. `flexShrink` lets them give way rather than
    // push the skip off centre on a narrow screen.
    secondarySide: { flex: 1, flexShrink: 1 },
    skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xl },
    skipLabel: { ...type.body, color: c.inkMuted },
    // Aligned to the start of its cell so the label sits on the same left gutter as the
    // title, lead and primary button. Quieter than the skip: going back is a correction,
    // not one of the two things the step is asking. Padding is narrower than the skip's so
    // the two cannot collide on a small screen.
    back: {
      minHeight: 44,
      alignSelf: 'flex-start',
      justifyContent: 'center',
      paddingRight: space.md,
    },
    backLabel: { ...type.body, color: c.inkFaint },
    pressed: { opacity: 0.85 },
    pressedQuiet: { opacity: 0.6 },
  });
}
