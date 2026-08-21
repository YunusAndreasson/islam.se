// The map lesson — a bottom card that steps through a few real moments on the actual map
// to teach what the sweeping prayer-time lines mean. Shown once, in place of PrayerDock,
// on the one landing right after onboarding finishes (see lib/intro-context's
// mapLessonPending). Same visual family as MosqueCard/LocationHint (GlassSurface, round
// close disc, slide up/down).
//
// The stepper chevrons deliberately use the SAME GlassRoundButton as the close X beside
// them, not PrayerDock's bare-icon DayChevron — this card is the one first-impression
// surface where nobody has learned yet that the icon alone means "tap me", so all three
// controls in the header/stepper row read as one obviously-tappable family instead of one
// clear button (the X) and two quiet ones.
//
// Purely presentational: bonetider.tsx owns which example is showing (it needs the index
// itself, to build the demoFrame that feeds the map's own overlay while this card is up)
// and dismissal — there is no autoplay, so every example on screen is one the user tapped
// to. This component only renders what it's handed and reports taps upward.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { GlassRoundButton } from '@/components/nav/GlassRoundButton';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { hapticSelection } from '@/lib/haptics';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { PrayerLegend } from './PrayerLegend';

interface Props {
  fact: string;
  /** "15 juni" */
  monthLabel: string;
  /** "22:13" — Maghrib i Stockholm, the instant on show. */
  timeLabel: string;
  index: number;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Always available — "every step can be skipped" applies here too. Also what the
   *  last example's forward control calls, so reaching the end and bailing early land
   *  in the same place. */
  onDismiss: () => void;
  /** Distance in dp from the screen bottom — the same slot PrayerDock occupies. */
  bottom: number;
}

export function MapLessonCard({
  fact,
  monthLabel,
  timeLabel,
  index,
  total,
  atStart,
  atEnd,
  onPrev,
  onNext,
  onDismiss,
  bottom,
}: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      // A quiet slide-up on open / down on dismiss; skipped under Reduce Motion — same
      // as MosqueCard.
      entering={reduceMotion ? undefined : FadeInDown.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(motion.fast)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <GlassSurface style={styles.card} borderRadius={radius.xl} tint={c.cardGlass}>
        <View style={styles.header}>
          <Text style={styles.caption}>
            {monthLabel} · Maghrib i Stockholm {timeLabel}
          </Text>
          <GlassRoundButton
            onPress={onDismiss}
            // "Stäng", not "Hoppa över" — every other X in the app (MosqueCard,
            // LocationHint, NotificationHint) says "Stäng", and a screen reader user who
            // has learned that mapping elsewhere should not hit a different word here for
            // the identical icon. The ACTION is a skip; the LABEL matches the glyph.
            accessibilityLabel="Stäng"
            tint={c.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <Icon name="close" size={18} color={c.inkMuted} />
          </GlassRoundButton>
        </View>

        <View style={styles.stepper}>
          <GlassRoundButton
            onPress={() => {
              hapticSelection();
              onPrev();
            }}
            disabled={atStart}
            accessibilityLabel="Föregående exempel"
            tint={c.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <Icon name="chevronLeft" size={20} color={c.accent} />
          </GlassRoundButton>

          <Text
            style={styles.fact}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Exempel ${index + 1} av ${total}: ${fact}`}
          >
            {fact}
          </Text>

          <GlassRoundButton
            onPress={() => {
              hapticSelection();
              if (atEnd) onDismiss();
              else onNext();
            }}
            accessibilityLabel={atEnd ? 'Klart' : 'Nästa exempel'}
            tint={c.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <Icon name={atEnd ? 'check' : 'chevronRight'} size={20} color={c.accent} />
          </GlassRoundButton>
        </View>

        {/* Small step dots — decorative only: the fact text's own accessibilityLabel
            above already carries "Exempel X av Y" for a screen reader, so this is hidden
            from it rather than read out as "circle circle". (The wizard's own progress
            indicator, IntroMarkProgress, moved to the app's mark split into wedges —
            this card's own three-step sequence stays simple dots.) */}
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>

        <PrayerLegend />
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Floats above the safe area, inset from the screen edges — a callout, not a bar
    // welded to the bottom. box-none on the wrapper so taps outside the card reach the
    // map (the same convention MosqueCard/LocationHint use).
    wrap: {
      position: 'absolute',
      left: space.lg,
      right: space.lg,
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: space.lg,
      gap: space.md,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    caption: {
      ...type.caption,
      color: c.inkMuted,
      // Tabular figures so the clock doesn't jitter the caption's width example to
      // example.
      fontVariant: ['tabular-nums'],
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    fact: { ...type.body, color: c.ink, flex: 1, textAlign: 'center' },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: space.sm,
    },
    dot: { width: 7, height: 7, borderRadius: radius.round, backgroundColor: c.track },
    dotOn: { backgroundColor: c.accent },
  });
}
