// Qibla — the direction of prayer. Most prayer apps bolt on a generic compass;
// this one belongs to a *map* app, so it reads as cartography: a calm Nordic dial
// on the same paper as everything else, a single accent needle to Mecca, the
// great-circle distance, and an honest fallback when the device has no compass
// (the emulator, some tablets) — it then simply shows the qibla *from north*.
//
// The dial uses the device heading from expo-location (already a dependency — no
// new native module). The whole rose rotates by −heading on the UI thread, so the
// Kaaba needle, pinned at the qibla bearing inside the rose, ends up pointing at
// the real Mecca; line it up with the fixed index at the top and you're facing it.
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hapticSuccess } from '../../lib/haptics';
import { useLocation } from '../../lib/location/context';
import { angleDelta, formatKm, qiblaBearing, qiblaDistanceKm } from '../../lib/qibla';
import { mono, palette, radius, shadow, space, type } from '../../theme/tokens';

// Degrees within which we call it "facing the qibla".
const ALIGN_TOL = 4;
// Cardinal points, Swedish (Nord/Öst/Syd/Väst).
const CARDINALS: readonly { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'Ö' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'V' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

export default function Qibla() {
  const { coords, label } = useLocation();
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');
  const { width } = useWindowDimensions();
  const dial = Math.min(width - space.xxl * 2, 320);
  const r = dial / 2;

  const bearing = qiblaBearing(coords);
  const distanceKm = qiblaDistanceKm(coords);

  const [heading, setHeading] = useState<number | null>(null);
  const [noCompass, setNoCompass] = useState(false);

  // Continuous (unwrapped) rotation so 359°→1° eases the short way instead of
  // spinning 358° backwards. The rose's rotation lives on the UI thread.
  const roseDeg = useSharedValue(0);
  const lastRaw = useRef(0);
  const unwrapped = useRef(0);
  const wasAligned = useRef(false);

  const onHeading = useCallback(
    (raw: number) => {
      const norm = ((raw % 360) + 360) % 360;
      const delta = ((norm - lastRaw.current + 540) % 360) - 180;
      unwrapped.current += delta;
      lastRaw.current = norm;
      // Idiomatic reanimated: drive the shared value from JS. The compiler's
      // immutability rule can't see that a SharedValue is meant to be mutated.
      // eslint-disable-next-line react-hooks/immutability
      roseDeg.value = withTiming(-unwrapped.current, { duration: 110 });
      setHeading(norm);
      setNoCompass((v) => (v ? false : v));
    },
    [roseDeg],
  );

  // Subscribe to the magnetometer only while the screen is focused (battery), and
  // fall back to a north-up dial if no heading arrives (emulator / no sensor).
  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      let gotEvent = false;
      const timer = setTimeout(() => {
        if (!gotEvent) setNoCompass(true);
      }, 2500);

      (async () => {
        try {
          await Location.requestForegroundPermissionsAsync();
          const s = await Location.watchHeadingAsync((h) => {
            const raw = h.trueHeading != null && h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
            if (raw == null || Number.isNaN(raw)) return;
            gotEvent = true;
            onHeading(raw);
          });
          if (cancelled) s.remove();
          else sub = s;
        } catch {
          setNoCompass(true);
        }
      })();

      return () => {
        cancelled = true;
        clearTimeout(timer);
        sub?.remove();
      };
    }, [onHeading]),
  );

  const aligned = heading != null && angleDelta(heading, bearing) <= ALIGN_TOL;

  // A single confirming tap the moment you line up (not on every frame while held).
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
  }, [aligned]);

  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${roseDeg.value}deg` }] }));
  const needleColor = aligned ? palette.accentDeep : palette.accent;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Qibla</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {placeLabel}
        </Text>
      </View>

      <View style={styles.compassArea}>
        <View style={[styles.dialWrap, { width: dial, height: dial }]}>
          {/* The rotating rose: ring, ticks, cardinals, and the qibla needle. */}
          <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
            <View style={[styles.ring, { borderRadius: r }]} />

            {TICKS.map((deg) => {
              const major = deg % 90 === 0;
              return (
                <View key={`t${deg}`} style={[StyleSheet.absoluteFill, rot(deg)]} pointerEvents="none">
                  <View style={styles.tickSlot}>
                    <View style={major ? styles.tickMajor : styles.tickMinor} />
                  </View>
                </View>
              );
            })}

            {CARDINALS.map((c) => (
              <View key={c.label} style={[StyleSheet.absoluteFill, rot(c.deg)]} pointerEvents="none">
                <View style={styles.cardinalSlot}>
                  {/* counter-rotate so each letter is upright when the rose faces north */}
                  <Text style={[styles.cardinal, c.label === 'N' && styles.cardinalN, rotText(-c.deg)]}>
                    {c.label}
                  </Text>
                </View>
              </View>
            ))}

            {/* Qibla needle — pinned at the bearing, so the rose's −heading rotation
                lands it on the real Mecca. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.needleSlot, { height: r }]}>
                {/* The Kaaba — an abstract cube, fitting and quieter than any glyph. */}
                <View style={[styles.kaaba, { backgroundColor: needleColor }]}>
                  <View style={styles.kaabaBand} />
                </View>
                <View style={[styles.needleShaft, { backgroundColor: needleColor }]} />
              </View>
            </View>

            {/* tail (south) of the needle — a quiet counterweight */}
            <View style={[StyleSheet.absoluteFill, rot(bearing + 180)]} pointerEvents="none">
              <View style={[styles.needleSlot, { height: r }]}>
                <View style={styles.needleTail} />
              </View>
            </View>
          </Animated.View>

          {/* Fixed bits that do NOT rotate: the top index you aim at, and the hub. */}
          <View style={styles.index} pointerEvents="none" />
          <View style={[styles.hub, aligned && styles.hubAligned]} pointerEvents="none" />
        </View>
      </View>

      {/* Status + readout. */}
      <View style={styles.readout}>
        <View style={[styles.statusPill, aligned && styles.statusPillOn]}>
          <MaterialIcons
            name={aligned ? 'check-circle' : 'navigation'}
            size={16}
            color={aligned ? palette.white : palette.accent}
          />
          <Text style={[styles.statusText, aligned && styles.statusTextOn]}>
            {aligned ? 'Du är vänd mot Mecka' : 'Vrid tills nålen pekar uppåt'}
          </Text>
        </View>

        <View style={styles.facts}>
          <Text style={styles.bearing}>{Math.round(bearing)}°</Text>
          <Text style={styles.factLabel}>från norr</Text>
        </View>
        <Text style={styles.distance}>Mecka · {formatKm(distanceKm)}</Text>

        {noCompass ? (
          <Text style={styles.note}>
            Ingen kompass på den här enheten – nålen visar qibla räknat från norr.
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const rot = (deg: number) => ({ transform: [{ rotate: `${deg}deg` }] });
const rotText = (deg: number) => ({ transform: [{ rotate: `${deg}deg` }] });

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.paper },
  header: { paddingHorizontal: space.lg, paddingTop: space.xs },
  title: { ...type.title, color: palette.ink },
  subtitle: { ...type.callout, color: palette.inkMuted, marginTop: 2 },

  compassArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialWrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: palette.hairline,
    backgroundColor: palette.surface,
    ...shadow.card,
  },

  // A tick lives at the top of a full-size, rotated slot.
  tickSlot: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  tickMajor: { width: 2, height: 12, borderRadius: 1, backgroundColor: palette.inkFaint },
  tickMinor: { width: 1.5, height: 7, borderRadius: 1, backgroundColor: palette.hairline },

  cardinalSlot: { position: 'absolute', top: 22, left: 0, right: 0, alignItems: 'center' },
  cardinal: { fontSize: 15, fontWeight: '700', color: palette.inkMuted },
  cardinalN: { color: palette.accent },

  needleSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  kaaba: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    ...shadow.thumb,
  },
  // A thin lighter band around the cube — the kiswa's gold belt, abstracted.
  kaabaBand: {
    width: 20,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  needleShaft: { width: 3, flex: 1, marginBottom: 2, borderRadius: 2 },
  needleTail: {
    width: 3,
    height: '54%',
    marginTop: 40,
    borderRadius: 2,
    backgroundColor: palette.track,
  },

  index: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: palette.accent,
  },
  hub: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.surface, borderWidth: 3, borderColor: palette.accent },
  hubAligned: { borderColor: palette.accentDeep },

  readout: { alignItems: 'center', paddingBottom: space.xxxl, paddingHorizontal: space.lg },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.round,
    backgroundColor: palette.accentSoft,
  },
  statusPillOn: { backgroundColor: palette.accent },
  statusText: { ...type.callout, fontWeight: '600', color: palette.accent },
  statusTextOn: { color: palette.white },

  facts: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.xl },
  bearing: { fontSize: 52, fontWeight: '300', color: palette.ink, letterSpacing: 0.5, ...mono },
  factLabel: { ...type.body, color: palette.inkMuted, marginBottom: 12 },
  distance: { ...type.callout, color: palette.inkMuted, marginTop: 2, ...mono },
  note: { ...type.caption, color: palette.inkFaint, textAlign: 'center', marginTop: space.lg, maxWidth: 300 },
});
