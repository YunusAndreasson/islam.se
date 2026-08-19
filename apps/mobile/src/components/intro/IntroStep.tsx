// The frame every introduction step is poured into. Four bands, top to bottom:
//
//   header    progress chip (mark + "Steg 2 av 4") — chrome, pinned to the top edge
//   message   title + lead — top-anchored, the same pixel on every step
//   band      the step's own controls — FLEXIBLE, and where the slack goes
//   actions   one primary, and beneath it at most ONE quiet way past
//
// Written as a shell rather than four near-identical screens so the rhythm is identical
// everywhere — same heading size, same gaps, same action geometry whether the step holds
// three lines of copy or a 2,100-row city list. A wizard whose furniture shifts between
// steps reads as four screens someone happened to put in a row.
//
// ── Where the empty space lives ───────────────────────────────────────────────────────
// `band` is flex:1, so on a short step (welcome, location, reminders) it holds a lot of
// slack. All of it sits BELOW the content, and that is a grouping decision rather than a
// taste one.
//
// Space between two things says they are different things. The gap below the controls
// separates them from the action bar — genuinely different, so space belongs there. A gap
// above them would separate them from the question they answer, which is the one thing on
// the screen they must NOT be separated from: an earlier cut split the slack above and
// below, and it put "Slå på påminnelser" a third of a screen beneath "Ska vi påminna dig?",
// far enough that the button stopped reading as the answer and started reading as the next
// item on a page. So the controls hang from the message at one fixed 32pt gap — the same
// 32pt on every step, scrolling or not — and the screen's remaining air pools once, at the
// bottom, where it reads as the margin it is.
//
// When the content is taller than the band (the method step's two option lists) there is no
// slack to place, the spacer collapses, and it simply scrolls — one rule, both cases.
//
// ── One filled accent per screen ──────────────────────────────────────────────────────
// `nextTone` exists because the footer is NOT the primary action on every step. On the
// location and reminder steps the recommended action is the step's own filled CTA ("Använd
// min plats", "Slå på påminnelser") and the footer is the quiet alternative — two identically
// filled accent pills on one screen ask the user to rank them, which is the frame's job,
// not theirs. So those steps pass `quiet` and the footer drops to a tinted pill: still
// obviously the way forward, no longer competing for the eye.
//
// ── One way forward, and it is never drawn twice ──────────────────────────────────────
// `onSkip` is for a step where skipping is a DIFFERENT destination from advancing — on the
// welcome step it abandons the introduction outright. The location and reminder steps used
// to render it too, beside the footer action, where both controls called the same function: one
// action, two labels, two weights, stacked one above the other, asking the reader to tell
// apart two things that were never different. They now pass no `onSkip` at all, so those
// steps offer exactly one way on.
//
// Going back is NOT a third tier in the action bar. A "Tillbaka" beside "Nästa" was tried
// and removed: it stacked a second word under an action row that already had too many and,
// on the last step, left a lone grey word marooned in an otherwise empty row.
//
// But removing it left the way back on the Android hardware gesture alone (see
// app/valkommen.tsx), and iOS has no equivalent — the screen is a fullScreenModal with
// gestureEnabled false, so there was no way back on iOS AT ALL. "Every answer has a
// permanent home in Inställningar" is true and is why this can be quiet furniture rather
// than loud, but it is not a reason for the same introduction to be reversible on one
// platform and one-way on the other.
//
// So the control lives in the chrome row at the top, next to the progress mark that
// already says where the reader is — the one place on the screen whose job is already
// "where am I", and the only slot that costs no new tier. It renders only when there is a
// step to go back to, so the first step is unchanged.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  /** Only for a step where skipping goes somewhere ADVANCING does not — see above. That is
   *  the welcome step alone, so the label is fixed rather than a prop. */
  onSkip?: () => void;
  /** Step back one. Omitted on the first step, where there is nowhere to go — the caller
   *  decides that, so this component never has to know what step 0 means. */
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
            <MaterialIcons name="arrow-back" size={24} color={c.inkFaint} />
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
            {/* ALL the slack goes below the content — see the note on where empty space
                belongs, above. It collapses to nothing when the content is taller than the
                band (the method step), so that step pays no scroll length for it. */}
            {content}
            <View style={styles.slack} />
          </ScrollView>
        ) : (
          // Gives PlacePicker's own `flex: 1` FlatList (rendered as `children` once the
          // location step switches to city search) a bounded box to grow into. No spacer
          // here: a flex child would compete with it for the slack and end up squeezed into
          // a fraction of the band, and none is needed — the picker grows to fill on its
          // own, and this step's small "ask" content hangs from the same 32pt gap under the
          // message that every other step's does.
          <View style={[styles.band, styles.bandContent]}>{content}</View>
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
