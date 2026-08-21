import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { motion, type Palette, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

// A single FAQ row: a readable question that expands to reveal its answer. It's the
// progressive-disclosure primitive for the Om screen — the same animation + a11y as
// the settings DisclosureGroup, but the header is built for a QUESTION (a prominent,
// left-aligned, possibly two-line sentence) rather than a label + right-aligned value.
//
// Several of these stack inside one card (a SettingSection), so an item draws a top
// hairline when `divider` is set — exactly how the settings rows separate.
//
// Body reveal mirrors DisclosureGroup: the answer is laid out absolutely so it never
// forces the row open, reports its natural height via onLayout, and the visible body
// height animates `open * measuredHeight`. Children stay mounted (just clipped), so
// there's no re-measure flash on first open and the collapsed answer is hidden from
// the screen reader.
export function FaqItem({
  question,
  answer,
  extra,
  divider = false,
  defaultExpanded = false,
}: {
  question: string;
  answer: string;
  /** Something the prose cannot say. Rendered under the answer, inside the same measured
   *  reveal — so it is included in the natural height onLayout reports and is hidden from
   *  the screen reader while collapsed, exactly like the text above it. Used by the map
   *  question, whose answer describes six coloured lines it cannot name the colours of. */
  extra?: ReactNode;
  divider?: boolean;
  defaultExpanded?: boolean;
}) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);

  // 0 = collapsed, 1 = expanded. Drives body height, chevron rotation.
  const open = useSharedValue(defaultExpanded ? 1 : 0);

  useEffect(() => {
    const target = expanded ? 1 : 0;
    open.value = reduceMotion ? target : withTiming(target, { duration: motion.base });
  }, [expanded, reduceMotion, open]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: open.value * contentHeight,
    opacity: open.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${open.value * 90}deg` }],
  }));

  return (
    <View style={[styles.wrap, divider && styles.divider]}>
      <Pressable
        // No haptic: revealing an answer is a content reveal, treated like navigation —
        // the animated open/close is the feedback. See the lib/haptics policy.
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={question}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        <Text style={styles.question}>{question}</Text>
        <Animated.View style={chevronStyle}>
          <Icon name="chevronRight" size={24} color={c.accent} />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={[styles.body, bodyStyle]}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <View
          style={styles.measure}
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        >
          <Text style={[styles.answer, extra ? styles.answerWithExtra : null]}>{answer}</Text>
          {extra ? <View style={styles.extra}>{extra}</View> : null}
        </View>
      </Animated.View>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { overflow: 'hidden' },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    header: {
      minHeight: 56,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
    },
    headerPressed: { backgroundColor: c.accentSoft },
    // The question is the prominent cue — readable weight, allowed to wrap, ink (not
    // muted) so it reads as a heading rather than a label.
    question: { ...type.bodyStrong, flex: 1, color: c.ink },
    body: { overflow: 'hidden' },
    // Absolute so the answer's natural height is reported via onLayout without forcing
    // the (animated) body open.
    measure: { position: 'absolute', left: 0, right: 0, top: 0 },
    answer: {
      ...type.callout,
      color: c.inkMuted,
      paddingHorizontal: space.lg,
      paddingBottom: space.lg,
    },
    // The answer keeps its own bottom padding when it is the last thing in the reveal;
    // with an extra below, that padding moves to the extra so the two sit together.
    answerWithExtra: { paddingBottom: space.md },
    extra: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  });
}
