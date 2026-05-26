import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hapticLight } from '../../lib/haptics';
import { motion } from '../../theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

// A collapsible card for advanced settings. Collapsed, it shows its category title
// plus a one-line SUMMARY of the current value (recognition over recall) — so the
// user reads the state at a glance and only opens what they need. This is the
// progressive-disclosure primitive that keeps the settings screen welcoming:
// essentials stay visible above, everything technical folds away in here.
//
// The reveal mirrors the dock's shared-value technique (PrayerDock), but height is
// MEASURED from the children rather than a fixed constant: the body content is laid
// out absolutely so it never forces the card open, reports its natural height via
// onLayout, and the visible body height is animated `open * measuredHeight`. Keeping
// children mounted (just clipped) means a collapsed group is still hidden from the
// screen reader but its rows exist — no re-measure flash on first open.
export function DisclosureGroup({
  title,
  summary,
  defaultExpanded = false,
  children,
}: {
  title: string;
  summary: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReducedMotion();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [contentHeight, setContentHeight] = useState(0);

  // 0 = collapsed, 1 = expanded. Drives body height, chevron rotation, summary fade.
  const open = useSharedValue(defaultExpanded ? 1 : 0);

  useEffect(() => {
    const target = expanded ? 1 : 0;
    open.value = reduceMotion ? target : withTiming(target, { duration: motion.base });
  }, [expanded, reduceMotion, open]);

  // contentHeight is captured by these worklets at render; a layout change re-renders
  // and reanimated re-evaluates the style with the new height (snaps to fit).
  const bodyStyle = useAnimatedStyle(() => ({
    height: open.value * contentHeight,
    opacity: open.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${open.value * 90}deg` }],
  }));
  // The collapsed value cross-fades out as the real controls appear, so it never
  // duplicates what's shown expanded.
  const summaryStyle = useAnimatedStyle(() => ({ opacity: 1 - open.value }));

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Pressable
          onPress={() => {
            hapticLight();
            setExpanded((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}, ${summary}`}
          style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        >
          <Text style={styles.title}>{title.toUpperCase()}</Text>
          <Animated.Text style={[styles.summary, summaryStyle]} numberOfLines={1}>
            {summary}
          </Animated.Text>
          <Animated.View style={chevronStyle}>
            <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
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
            {children}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    header: {
      minHeight: 56,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerPressed: { backgroundColor: colors.accentSoft },
    // The category label (muted uppercase) rhymes with the always-visible section
    // titles elsewhere on the screen; the value beside it is the prominent cue.
    title: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
    summary: { flex: 1, fontSize: 15, color: colors.text, textAlign: 'right' },
    body: { overflow: 'hidden' },
    // Absolute so the children's natural height is reported via onLayout without
    // forcing the (animated) body open. A hairline divides header from content.
    measure: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
  });
}
