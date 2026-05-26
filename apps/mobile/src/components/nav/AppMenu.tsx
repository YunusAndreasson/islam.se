// App-wide navigation, freed from a bottom tab bar. A single glass hamburger sits
// top-right on every screen (mounted once, over the whole Stack); tapping it drops
// a glass popover with the destinations. The map stays the hero — the popover is
// small and the backdrop is light, so the country is never fully hidden.
//
// Why a popover and not tabs: the map screen is the point of the app, and a
// persistent tab bar doubly occluded the bottom of the map alongside the prayer
// dock. Navigation that is out of the way until summoned (Norman: signifier when
// you need it, nothing when you don't) keeps the map uninterrupted.
//
// Theme: the menu always follows the phone's light/dark setting (useColors), on
// EVERY screen — so the one hamburger button looks identical wherever it's opened.
// (It deliberately does NOT track the map's day↔night the way the time-dock does:
// having the same control look different per screen was confusing. The dock still
// dims with the night map — that's the living map's own chrome, not navigation.)
import { MaterialIcons } from '@expo/vector-icons';
import { type Href, router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '../../lib/haptics';
import { useColors } from '../../theme/useColors';
import { mapTheme } from '../map/theme';
import { GlassSurface } from '../ui/GlassSurface';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The subset of chrome the menu paints with, mapped from the active OS-theme palette.
interface MenuChrome {
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  hairline: string;
}

interface Destination {
  href: Href;
  pathname: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const DESTINATIONS: readonly Destination[] = [
  { href: '/bonetider', pathname: '/bonetider', label: 'Bönetider', icon: 'schedule' },
  { href: '/qibla', pathname: '/qibla', label: 'Qibla', icon: 'explore' },
  { href: '/installningar', pathname: '/installningar', label: 'Inställningar', icon: 'settings' },
  { href: '/om', pathname: '/om', label: 'Om', icon: 'info-outline' },
];

export function AppMenu() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  // One chrome source for every screen: the phone's light/dark theme. The menu is a
  // navigation control, so it looks identical wherever it's opened — it does NOT
  // track the map's day↔night (that confused: same button, two looks). The map's own
  // time-dock + wash still animate with the sun; the menu just isn't part of that.
  const themed = useColors();
  const c = useMemo<MenuChrome>(
    () => ({
      surface: themed.cardGlass,
      ink: themed.ink,
      inkMuted: themed.inkMuted,
      accent: themed.accent,
      accentSoft: themed.accentSoft,
      hairline: themed.hairline,
    }),
    [themed],
  );
  const styles = useMemo(() => makeStyles(c), [c]);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration: 160 });
  }, [open, progress]);

  const toggle = useCallback(() => {
    hapticLight();
    setOpen((v) => !v);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const go = useCallback(
    (dest: Destination) => {
      hapticSelection();
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
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel="Meny"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
        >
          <GlassSurface
            style={styles.button}
            interactive
            fallbackColor={c.surface}
            fallbackBorderColor={c.hairline}
          >
            <MaterialIcons name={open ? 'close' : 'menu'} size={24} color={c.ink} />
          </GlassSurface>
        </Pressable>

        <Animated.View style={[styles.popover, popoverStyle]} pointerEvents={open ? 'auto' : 'none'}>
          <GlassSurface style={styles.popoverCard} fallbackColor={c.surface} fallbackBorderColor={c.hairline}>
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
                  <MaterialIcons name={dest.icon} size={20} color={active ? c.accent : c.inkMuted} />
                  <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{dest.label}</Text>
                </Pressable>
              );
            })}
          </GlassSurface>
        </Animated.View>
      </View>
    </View>
  );
}

function makeStyles(c: MenuChrome) {
  return StyleSheet.create({
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
    itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
    itemPressed: { backgroundColor: c.accentSoft },
    itemLabel: { flex: 1, fontSize: 16, color: c.ink },
    itemLabelActive: { color: c.accent, fontWeight: '600' },
  });
}
