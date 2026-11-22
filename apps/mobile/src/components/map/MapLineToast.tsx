import { useCardInsets } from '@/theme/window-layout';
import { useEffect, useEffectEvent } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { radius, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';

const READING_TIME_MS = 6500;

export function MapLineToast({ message, top, onDismiss }: { message: string; top: number; onDismiss: () => void }) {
  const cardInsets = useCardInsets(space.md);
  const c = useColors();
  // Glass over the live map takes the sky's colour, like every other card floating on it
  // (theme/skyChrome) — the palette's own `cardGlass` is the noon value, and this toast
  // is read at every hour.
  const sky = useSkyGlass();
  const reduced = useReducedMotion();
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    // Android's “Time to take action” can extend the reading time. iOS returns the default.
    void AccessibilityInfo.getRecommendedTimeoutMillis(READING_TIME_MS)
      .catch(() => READING_TIME_MS)
      .then((duration) => {
        if (active) timer = setTimeout(dismiss, Math.max(READING_TIME_MS, duration));
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [message]);
  return <Animated.View pointerEvents="none" entering={reduced ? undefined : FadeIn.duration(180)}
    exiting={reduced ? undefined : FadeOut.duration(180)} style={[styles.wrap, cardInsets, { top }]}>
    <GlassSurface tint={sky.cardGlass} borderRadius={radius.lg} style={styles.card}>
      <Text accessibilityRole="text" style={[type.callout, { color: c.ink }]}>{message}</Text>
    </GlassSurface>
  </Animated.View>;
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  card: { padding: space.md, borderRadius: radius.lg },
});
