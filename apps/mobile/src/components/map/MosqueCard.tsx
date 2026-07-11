// The mosque detail card — a compact glass callout that slides up from the bottom
// when a mosque POI is tapped, floating just above the collapsed PrayerDock. It is
// deliberately NOT a full-screen modal: it names the place and offers the one action
// that matters (directions), then gets out of the way. Same glass material and round
// close disc as the rest of the app's chrome (GlassSurface / GlassRoundButton), so it
// reads as one family with the dock and nav.
//
// What it shows comes straight from the vendored dataset: name, "kommun · län", how
// far it is from you, and — only when known — the year it opened and its huvudman.
// There is no denomination, phone or website in the data (by design), so the card
// never promises more than the dataset holds. Directions hand off to the native maps
// app (see ../../lib/mosques/directions).
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';

import { hapticLight } from '../../lib/haptics';
import { type Mosque, formatMosqueDistance, locationLabel } from '../../lib/mosques';
import { openDirections } from '../../lib/mosques/directions';
import { haversineKm } from '../../lib/places/nearest';
import type { LatLng } from '../../lib/prayer-times';
import { motion, mono, type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from '../nav/GlassRoundButton';
import { GlassSurface } from '../ui/GlassSurface';

interface Props {
  mosque: Mosque;
  /** The user's location — the origin for the distance readout. */
  userCoords: LatLng;
  /** Distance in dp from the screen bottom, so the card floats above the dock. */
  bottom: number;
  onClose: () => void;
}

export function MosqueCard({ mosque, userCoords, bottom, onClose }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();

  const distance = formatMosqueDistance(
    haversineKm(userCoords.latitude, userCoords.longitude, mosque.lat, mosque.lng),
  );

  // "Öppnad 2007" and "Huvudman: …" only when the dataset actually has them.
  const meta: string[] = [];
  if (mosque.opened) meta.push(`Öppnad ${mosque.opened}`);
  if (mosque.organisation) meta.push(`Huvudman: ${mosque.organisation}`);

  return (
    <Animated.View
      // A quiet slide-up on open / down on dismiss; skipped under Reduce Motion.
      entering={reduceMotion ? undefined : FadeInDown.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(motion.fast)}
      style={[styles.wrap, { bottom }]}
      pointerEvents="box-none"
    >
      <GlassSurface style={styles.card} borderRadius={radius.xl} tint={c.cardGlass}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={2}>
              {mosque.name}
            </Text>
            <Text style={styles.location} numberOfLines={1}>
              {locationLabel(mosque)}
              <Text style={styles.distance}>{`   ${distance}`}</Text>
            </Text>
          </View>
          <GlassRoundButton
            onPress={onClose}
            accessibilityLabel="Stäng"
            tint={c.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <MaterialIcons name="close" size={18} color={c.inkMuted} />
          </GlassRoundButton>
        </View>

        {meta.length > 0 && (
          <Text style={styles.meta} numberOfLines={2}>
            {meta.join('  ·  ')}
          </Text>
        )}

        <Pressable
          onPress={() => {
            // A command whose result lands synchronously under the finger — the
            // haptics policy's one allowed tap tick (opening a screen is silent).
            hapticLight();
            openDirections(mosque);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Vägbeskrivning till ${mosque.name}`}
          style={({ pressed }) => [styles.directions, pressed && styles.directionsPressed]}
        >
          <MaterialIcons name="directions" size={18} color={c.onAccent} />
          <Text style={styles.directionsText}>Vägbeskrivning</Text>
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
  });
}
