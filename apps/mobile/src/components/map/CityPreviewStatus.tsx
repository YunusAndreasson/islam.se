import { useEffect, useEffectEvent, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { motion, radius, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { useCardInsets } from '@/theme/window-layout';

export function CityPreviewStatus({ name, arriving, fajr, top, reduceMotion, onClose }: {
  name: string;
  arriving: boolean;
  fajr: string;
  top: number;
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const c = useColors();
  const sky = useSkyGlass();
  const insets = useCardInsets(space.md);
  const status = useRef<ViewInstance>(null);
  const focus = useEffectEvent(() => {
    if (status.current) AccessibilityInfo.sendAccessibilityEvent(status.current, 'focus');
  });
  useEffect(() => {
    if (arriving) return;
    const frame = requestAnimationFrame(() => focus());
    return () => cancelAnimationFrame(frame);
  }, [arriving, name]);

  const label = arriving ? `Flyttar till ${name}` : `Visar ${name}`;
  return (
    <Animated.View
      style={[styles.wrap, insets, { top }]}
      pointerEvents="box-none"
      entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
    >
      <GlassSurface style={styles.card} tint={sky.cardGlass} borderRadius={radius.lg}>
        <View style={styles.row}>
          <Icon name="place" size={17} color={c.accent} accessibilityElementsHidden importantForAccessibility="no" />
          <View ref={status} accessible accessibilityRole="text" testID="city-preview-status"
            accessibilityLabel={arriving ? label : `${label}, Fajr ${fajr}`}
            onAccessibilityEscape={onClose} style={styles.label}>
            <Text style={[type.callout, { color: c.ink }]}>{label}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tillbaka till kartan"
            testID="city-preview-close"
            onPress={onClose}
            onAccessibilityEscape={onClose}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Icon name="close" size={20} color={c.ink} />
          </Pressable>
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  card: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', columnGap: space.sm, paddingStart: space.md },
  label: { flexShrink: 1, paddingVertical: space.sm },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
