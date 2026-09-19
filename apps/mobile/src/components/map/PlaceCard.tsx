// The detail card a tapped map place opens — shared by MosqueCard and BurialGroundCard. A
// compact glass callout that slides up from the bottom, floating just above the collapsed
// PrayerDock. It is deliberately NOT a full-screen modal: it names the place and offers the
// one action that matters (directions), then gets out of the way. Same glass material and
// round close disc as the rest of the app's chrome (GlassSurface / GlassRoundButton), so it
// reads as one family with the dock and nav.
//
// Top to bottom: the name; the line that tells a reader at the kerb they are at the right
// place (the street for a mosque, the section for a burial ground); "kommun · län" with the
// distance; a meta line only when the record has facts for one; the directions button; and
// ONE quiet text link under it. The card keeps one primary action, and the link reads as
// subordinate to it — a second button would split the card's attention in two.
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { formatMosqueDistance } from '@/lib/mosques';
import { haversineKm } from '@/lib/places/nearest';
import type { LatLng } from '@/lib/prayer-times';
import { motion, mono, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { GlassRoundButton } from '@/components/nav/GlassRoundButton';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';

interface Props {
  title: string;
  /** The line under the name that identifies the place on the ground. Null hides it. */
  subtitle: string | null;
  /** "kommun · län". */
  location: string;
  /** Where the place is — the destination of the distance readout. */
  at: { readonly lat: number; readonly lng: number };
  /** The user's location — the origin for the distance readout. */
  userCoords: LatLng;
  /** Facts the record holds for only some places ("Öppnad 2007"). Null hides the line. */
  meta: string | null;
  /** Distance in dp from the screen bottom, so the card floats above the dock. */
  bottom: number;
  onClose: () => void;
  onDirections: () => void;
  /** The one quiet link under the directions button. */
  secondary: { label: string; accessibilityLabel: string; onPress: () => void };
}

export function PlaceCard({
  title,
  subtitle,
  location,
  at,
  userCoords,
  meta,
  bottom,
  onClose,
  onDirections,
  secondary,
}: Props) {
  const c = useColors();
  const sky = useSkyGlass();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();

  const distance = formatMosqueDistance(
    haversineKm(userCoords.latitude, userCoords.longitude, at.lat, at.lng),
  );

  return (
    <Animated.View
      // A quiet slide-up on open / down on dismiss; skipped under Reduce Motion.
      entering={reduceMotion ? undefined : FadeInDown.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(motion.fast)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <GlassSurface style={styles.card} borderRadius={radius.xl} tint={sky.cardGlass}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={2}>
              {title}
            </Text>
            {/* The identifying line first, then kommun — the order a Swedish address is
                written in, and the order the question is asked in: is this the place, and
                is that the municipality I think I am in. */}
            {subtitle != null && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            <Text style={styles.location} numberOfLines={1}>
              {location}
              <Text style={styles.distance}>{`   ${distance}`}</Text>
            </Text>
          </View>
          <GlassRoundButton
            onPress={onClose}
            accessibilityLabel="Stäng"
            tint={sky.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <Icon name="close" size={18} color={c.inkMuted} />
          </GlassRoundButton>
        </View>

        {meta != null && (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        )}

        <Pressable
          // No haptic: directions hand the reader off to a maps app, which is navigation
          // out of this one (lib/haptics policy).
          onPress={onDirections}
          accessibilityRole="button"
          accessibilityLabel={`Vägbeskrivning till ${title}`}
          style={({ pressed }) => [styles.directions, pressed && styles.directionsPressed]}
        >
          <Icon name="directions" size={18} color={c.onAccent} />
          <Text style={styles.directionsText}>Vägbeskrivning</Text>
        </Pressable>

        {/* No haptic: this opens a screen or a page, and navigation is silent feedback
            under the lib/haptics policy — the transition is the confirmation. */}
        <Pressable
          onPress={secondary.onPress}
          accessibilityRole="button"
          accessibilityLabel={secondary.accessibilityLabel}
          hitSlop={8}
          style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
        >
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Floats above the dock, inset from the screen edges — a callout, not a bar welded
    // to the bottom. box-none on the wrapper so taps outside the card reach the map.
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
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: space.md,
    },
    headerText: { flex: 1, gap: 2 },
    name: { ...type.headline, color: c.ink },
    // A tier above `location`: this line is what identifies the place in front of you,
    // the kommun only confirms you are in the right town.
    subtitle: { ...type.callout, color: c.ink },
    location: { ...type.caption, color: c.inkMuted },
    // Distance rides the end of the location line, tabular + a tier fainter.
    distance: { ...type.caption, ...mono, color: c.inkFaint },
    meta: { ...type.caption, color: c.inkFaint },
    // Filled indigo action — the app's interactive accent. Text/icon use onAccent so
    // the label reads on the fill in both themes.
    directions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      minHeight: 44,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    directionsPressed: { opacity: 0.85 },
    directionsText: { ...type.bodyStrong, color: c.onAccent },
    // Tertiary: no fill, no border, muted ink. Centred under the primary action so the
    // card still reads as one column with a single emphasised control. The negative
    // margin claws back part of the card's `gap` — the link wants to sit closer to the
    // button it qualifies than the button does to the meta line above it.
    secondary: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 32,
      marginTop: -space.xs,
      marginBottom: -space.xs,
    },
    secondaryPressed: { opacity: 0.6 },
    secondaryText: { ...type.caption, color: c.inkMuted },
  });
}
