// App-wide navigation, freed from a bottom tab bar. A single glass hamburger sits
// top-right on every screen (mounted once, over the whole Stack); tapping it drops
// a glass popover with the three destinations. The map stays the hero — the popover
// is small and the backdrop is light, so the country is never fully hidden.
//
// Why a popover and not tabs: the map screen is the point of the app, and a
// persistent tab bar doubly occluded the bottom of the map alongside the prayer
// dock. Navigation that is out of the way until summoned (Norman: signifier when
// you need it, nothing when you don't) keeps the map uninterrupted.
import { MaterialIcons } from '@expo/vector-icons';
import { type Href, router, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mapTheme } from '../map/theme';
import { GlassSurface } from '../ui/GlassSurface';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Destination {
  href: Href;
  pathname: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const DESTINATIONS: readonly Destination[] = [
  { href: '/bonetider', pathname: '/bonetider', label: 'Bönetider', icon: 'schedule' },
  { href: '/installningar', pathname: '/installningar', label: 'Inställningar', icon: 'settings' },
  { href: '/om', pathname: '/om', label: 'Om', icon: 'info-outline' },
];

export function AppMenu() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 160 });
  }, [open, progress]);

  const close = useCallback(() => setOpen(false), []);
  const go = useCallback(
    (dest: Destination) => {
      setOpen(false);
      if (pathname !== dest.pathname) router.navigate(dest.href);
    },
    [pathname],
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const popoverStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * -8 },
      { scale: 0.96 + progress.value * 0.04 },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Light scrim that only intercepts taps while open, so the map stays visible. */}
      <AnimatedPressable
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents={open ? 'auto' : 'none'}
        onPress={close}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      />

      <View style={[styles.anchor, { top: insets.top + 10 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Meny"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
        >
          <GlassSurface style={styles.button} interactive>
            <MaterialIcons name={open ? 'close' : 'menu'} size={24} color={mapTheme.text} />
          </GlassSurface>
        </Pressable>

        <Animated.View style={[styles.popover, popoverStyle]} pointerEvents={open ? 'auto' : 'none'}>
          <GlassSurface style={styles.popoverCard}>
            {DESTINATIONS.map((dest, i) => {
              const active = pathname === dest.pathname;
              return (
                <Pressable
                  key={dest.pathname}
                  onPress={() => go(dest)}
                  style={({ pressed }) => [
                    styles.item,
                    i > 0 && styles.itemBorder,
                    pressed && styles.itemPressed,
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                >
                  <MaterialIcons
                    name={dest.icon}
                    size={20}
                    color={active ? mapTheme.accent : mapTheme.textMuted}
                  />
                  <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{dest.label}</Text>
                  {active && <View style={styles.activeDot} />}
                </Pressable>
              );
            })}
          </GlassSurface>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(11,18,32,0.18)' },
  anchor: { position: 'absolute', right: 12, alignItems: 'flex-end' },
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  popover: {
    marginTop: 8,
    borderRadius: 16,
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  popoverCard: { borderRadius: 16, overflow: 'hidden', minWidth: 212, paddingVertical: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(17,24,28,0.07)' },
  itemPressed: { backgroundColor: 'rgba(10,126,164,0.08)' },
  itemLabel: { flex: 1, fontSize: 16, color: mapTheme.text },
  itemLabelActive: { color: mapTheme.accent, fontWeight: '600' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: mapTheme.accent },
});
