// The almanac — everything the ephemeris knows about tonight and the weeks around it, on the
// other side of one tap.
//
// WHY IT IS A DOOR AND NOT A LIST. The readout under the dial used to print every note the
// almanac produced: moonrise and moonset, the next full and new moon, an eclipse up to four
// months out, the crescent forecast, and the calendar-versus-sky observation. Five rows on a
// good day, stacked under a hero numeral, a status pill and a phase line — on the one screen
// whose whole argument is a single drawing of the Moon. Every one of those sentences is true
// and none of them is what the reader came for, which is exactly the case progressive
// disclosure was named for: the answer stays on the surface, the reference moves one tap
// away, and nothing is deleted.
//
// What still reaches the surface is decided in lib/moon/readout by the note's `tier` — the
// night the reader is standing in, and anything that asks them to do something tonight. This
// sheet shows the WHOLE list in the almanac's own order, including those rows, because a
// door that hides what you already saw is a door you cannot trust.
//
// A BOTTOM CARD, not the month sheet's full-screen overlay, and not an inline reveal. Inline
// was the first instinct and it is wrong here: the dial is sized from the room the readout
// leaves it, so unfolding four rows in the flow would have shrunk the instrument by a third
// every time someone opened this — the very jump this pass exists to remove. An overlay
// reflows nothing at all.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonNoteRow } from '@/components/moon/MoonNoteRow';
import { useMoonInk } from '@/components/moon/moonInk';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { hapticSelection } from '@/lib/haptics';
import type { MoonNote } from '@/lib/moon/readout';
import { mono, motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';

export function MoonAlmanacSheet({
  notes,
  facts,
  onAction,
  onClose,
  c,
}: {
  notes: readonly MoonNote[];
  /** "73 % belyst · 9 dygn" — the numbers behind the phase name the screen prints. */
  facts: string;
  onAction: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const styles = useMemo(() => makeStyles(c), [c]);
  // Read here, not inherited: this card is absolutely positioned, and an absolutely
  // positioned child gets none of the padding its SafeAreaView parent applies — the same
  // trap MoonMonthSheet documents, with the same fix.
  const insets = useSafeAreaInsets();
  const ink = useMoonInk();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.quick)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.quick)}
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
    >
      {/* Tap-outside-to-close, for a thumb. Hidden from assistive tech: a full-screen
          invisible button ahead of the rows is a trap for a screen reader, and the explicit
          "Stäng" below is the way out that gets announced. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {/* OPAQUE, for the reason the month sheet is: this covers the readout, and at any
          translucency the hero numeral and the phase line read straight through the rows. */}
      <GlassSurface
        style={[styles.sheet, { bottom: Math.max(space.lg, insets.bottom + space.sm) }]}
        borderRadius={radius.xl}
        tint={c.surface}
      >
        <Text style={styles.title}>Almanacka</Text>
        <Text style={styles.facts}>{facts}</Text>
        <View style={styles.rows}>
          {notes.map((note) => (
            <MoonNoteRow
              key={note.text}
              note={note}
              ink={ink}
              c={c}
              // Only the drift row is a door in here. The tonight row IS a door on the
              // screen — it is what opened this — and repeating that would send the reader
              // in a circle.
              onPress={note.action ? onAction : undefined}
              hint="Öppnar Inställningar."
            />
          ))}
        </View>
        {/* NO CAVEAT HERE. A draft of this card closed with "Månaden börjar när nymånen ses
            – följ din moské", which is the month sheet's line, said a second time, two taps
            apart, over a list of moonrise times it is not even about. The month sheet says
            it once because that is the surface that draws the days; repeating it here would
            only teach the reader to stop reading it. */}
        <Pressable
          onPress={() => {
            hapticSelection();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Stäng almanackan"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>Stäng</Text>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Bottom-anchored and sized by its content — there are between two and five rows in
    // here, and a card that reserved a screenful for them would be a worse answer than the
    // list it replaced.
    sheet: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      // `bottom` is set at the call site from the safe-area inset — see the note there.
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: space.lg,
      overflow: 'hidden',
      ...shadow.card,
    },
    title: { ...type.label, color: c.inkMuted },
    facts: { ...type.callout, color: c.ink, marginTop: 2, ...mono },
    rows: { marginTop: space.md, gap: space.sm, marginBottom: space.sm },
    close: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, marginTop: space.xs },
    closeText: { ...type.bodyStrong, color: c.accent },
    pressed: { opacity: 0.6 },
  });
}
