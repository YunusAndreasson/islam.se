// Qibla — the direction of prayer. Most prayer apps bolt on a generic compass;
// this one belongs to a *map* app, so it reads as cartography: a warm Nordic dial
// on the same paper as everything else, a soft directional beam to Mecca, the
// great-circle distance, and an honest fallback when the device has no compass
// (the emulator, some tablets) — it then simply shows the qibla *from north*.
//
// The dial uses the device heading from expo-location (already a dependency — no
// new native module). The whole rose rotates by −heading on the UI thread, so the
// Kaaba needle, pinned at the qibla bearing inside the rose, ends up pointing at
// the real Mecca; line it up with the fixed index at the top and you're facing it.
//
// "Getting warmer" feedback (Don Norman): a `prox` shared value (1 at the bearing,
// 0 by 45° off) drives a graded indigo→brass transition on the beam, the Kaaba
// glow, the needle and the index — so you feel yourself closing in *before* the
// hard ≤4° lock, not just a binary on/off.
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hapticSuccess } from '../../lib/haptics';
import { useLocation } from '../../lib/location/context';
import { angleDelta, formatKm, qiblaBearing, qiblaDistanceKm } from '../../lib/qibla';
import { mono, type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

// Degrees within which we call it "facing the qibla".
const ALIGN_TOL = 4;
// Degrees within which the readout encourages "you're on your way".
const NEAR_TOL = 30;
// Over this many degrees off, proximity feedback is fully cold.
const PROX_RANGE = 45;
// Cardinal points, Swedish (Nord/Öst/Syd/Väst).
const CARDINALS: readonly { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'Ö' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'V' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

// Translucent colour from a palette hex — the beam, glow and chips tint the warm
// face without hiding it (same trick as the kiswa band's rgba white).
function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export default function Qibla() {
  const { coords, label } = useLocation();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
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
  // Proximity 0..1 (1 = pointing at the qibla). Drives the brass cross-fade and
  // glow on the UI thread, so "getting warmer" stays smooth at 60fps.
  const prox = useSharedValue(0);
  const lastRaw = useRef(0);
  const unwrapped = useRef(0);
  const wasAligned = useRef(false);

  const onHeading = useCallback(
    (raw: number) => {
      const norm = ((raw % 360) + 360) % 360;
      const delta = ((norm - lastRaw.current + 540) % 360) - 180;
      unwrapped.current += delta;
      lastRaw.current = norm;
      const p = Math.max(0, Math.min(1, 1 - angleDelta(norm, bearing) / PROX_RANGE));
      // Idiomatic reanimated: drive the shared values from JS. The compiler's
      // immutability rule can't see that a SharedValue is meant to be mutated.
      // eslint-disable-next-line react-hooks/immutability
      roseDeg.value = withTiming(-unwrapped.current, { duration: 110 });
      // eslint-disable-next-line react-hooks/immutability
      prox.value = withTiming(p, { duration: 110 });
      setHeading(norm);
      setNoCompass((v) => (v ? false : v));
    },
    [roseDeg, prox, bearing],
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

      // Errors are handled inside; `void` marks the IIFE as intentionally floating.
      void (async () => {
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

  const delta = heading != null ? angleDelta(heading, bearing) : null;
  const aligned = delta != null && delta <= ALIGN_TOL;
  const near = delta != null && !aligned && delta <= NEAR_TOL;

  // A single confirming tap the moment you line up (not on every frame while held).
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
  }, [aligned]);

  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${roseDeg.value}deg` }] }));
  // The brass layer (beam / cube fill / shaft / index / hub) fades in with proximity
  // — the one shared style reused on every "live" overlay, so they warm together.
  const brassStyle = useAnimatedStyle(() => ({ opacity: prox.value }));
  // A warm halo behind the Kaaba that grows as you close in (a faked radial glow).
  const glowStyle = useAnimatedStyle(() => ({
    opacity: prox.value,
    transform: [{ scale: 0.55 + prox.value * 0.55 }],
  }));

  const coneTop = r - 40; // beam apex at the hub, base 40px shy of the rim

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
          {/* Fixed warm face — a gentle top-down sheen gives the instrument depth.
              It does NOT rotate, so the "light" always falls from the top. */}
          <LinearGradient colors={[c.surface, c.paperSunken]} style={[styles.face, { borderRadius: r }]} />
          <View style={[styles.innerRing, { width: dial * 0.66, height: dial * 0.66, borderRadius: dial * 0.33 }]} pointerEvents="none" />
          {/* Fixed sight line from the aim index down to the hub — shows the axis the
              Kaaba must travel up to meet (the conceptual model, made visible). */}
          <View style={[styles.sightWrap, { height: r }]} pointerEvents="none">
            <LinearGradient colors={[hexToRgba(c.ink, 0.16), hexToRgba(c.ink, 0)]} style={styles.sight} />
          </View>

          {/* The rotating rose: beam, ticks, cardinals, and the qibla needle. */}
          <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
            {/* Qibla beam — a soft cone, pinned at the bearing, widening to the Kaaba.
                Indigo by default; the brass twin fades in with proximity. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.coneSlot, { height: r }]}>
                <View style={[styles.coneBase, { borderTopWidth: coneTop, borderTopColor: hexToRgba(c.accent, 0.14) }]} />
              </View>
            </View>
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.coneSlot, { height: r }]}>
                <Animated.View
                  style={[styles.coneBase, { borderTopWidth: coneTop, borderTopColor: hexToRgba(c.highlight, 0.22) }, brassStyle]}
                />
              </View>
            </View>

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

            {CARDINALS.map((card) => (
              <View key={card.label} style={[StyleSheet.absoluteFill, rot(card.deg)]} pointerEvents="none">
                <View style={styles.cardinalSlot}>
                  {/* counter-rotate so each letter is upright when the rose faces north */}
                  <Text style={[styles.cardinal, card.label === 'N' && styles.cardinalN, rotText(-card.deg)]}>
                    {card.label}
                  </Text>
                </View>
              </View>
            ))}

            {/* Qibla needle — pinned at the bearing, so the rose's −heading rotation
                lands it on the real Mecca. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing)]} pointerEvents="none">
              <View style={[styles.needleSlot, { height: r }]}>
                {/* The Kaaba — an abstract cube, fitting and quieter than any glyph,
                    over a warm glow that swells as you align. */}
                <View style={styles.kaabaWrap}>
                  <Animated.View style={[styles.glow, glowStyle]} />
                  <View style={styles.kaaba}>
                    <Animated.View style={[StyleSheet.absoluteFill, styles.kaabaBrass, brassStyle]} />
                    <View style={styles.kaabaBand} />
                  </View>
                </View>
                <View style={styles.shaftWrap}>
                  <View style={styles.needleShaft} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.needleShaftBrass, brassStyle]} />
                </View>
              </View>
            </View>

            {/* tail (south) of the needle — a quiet counterweight. Anchored to the
                slot bottom (the dial centre) so it grows out of the hub with no gap. */}
            <View style={[StyleSheet.absoluteFill, rot(bearing + 180)]} pointerEvents="none">
              <View style={[styles.needleSlot, styles.tailSlot, { height: r }]}>
                <View style={styles.needleTail} />
              </View>
            </View>
          </Animated.View>

          {/* Fixed bits that do NOT rotate: the top index you aim at, and the hub. */}
          <View style={styles.index} pointerEvents="none" />
          <Animated.View style={[styles.index, styles.indexBrass, brassStyle]} pointerEvents="none" />
          <View style={styles.hubWrap} pointerEvents="none">
            <View style={[StyleSheet.absoluteFill, styles.hub]} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.hub, styles.hubBrass, brassStyle]} />
          </View>
        </View>
      </View>

      {/* Status + readout. */}
      <View style={styles.readout}>
        <View style={[styles.statusPill, near && styles.statusPillNear, aligned && styles.statusPillOn]}>
          <MaterialIcons
            name={aligned ? 'check-circle' : noCompass ? 'explore' : 'navigation'}
            size={16}
            color={aligned ? c.onHighlight : near ? c.highlight : c.accent}
          />
          <Text style={[styles.statusText, near && styles.statusTextNear, aligned && styles.statusTextOn]}>
            {aligned
              ? 'Du är vänd mot Mecka'
              : noCompass
                ? 'Qibla räknat från norr'
                : near
                  ? 'Du är på väg…'
                  : 'Vrid tills nålen pekar uppåt'}
          </Text>
        </View>

        <View style={styles.facts}>
          <View style={styles.bearingRow}>
            <Text style={styles.bearingNum}>{Math.round(bearing)}</Text>
            <Text style={styles.bearingDeg}>°</Text>
          </View>
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

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    header: { paddingHorizontal: space.lg, paddingTop: space.xs },
    title: { ...type.title, color: c.ink },
    subtitle: { ...type.callout, color: c.inkMuted, marginTop: 2 },

    compassArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    dialWrap: { alignItems: 'center', justifyContent: 'center' },

    // Fixed face — warm gradient, a real (not hairline) border, lifted off the paper.
    face: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderWidth: 1.5,
      borderColor: c.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    innerRing: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: c.hairline,
    },
    sightWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    sight: { width: 2, height: '100%' },

    // A beam lives in a slot rotated to the bearing; flex-end puts its apex at the hub.
    coneSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end' },
    coneBase: {
      width: 0,
      height: 0,
      borderLeftWidth: 34,
      borderRightWidth: 34,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
    },

    // A tick lives at the top of a full-size, rotated slot.
    tickSlot: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
    tickMajor: { width: 2.5, height: 13, borderRadius: 1.5, backgroundColor: c.inkMuted },
    tickMinor: { width: 1.5, height: 7, borderRadius: 1, backgroundColor: c.inkFaint },

    cardinalSlot: { position: 'absolute', top: 24, left: 0, right: 0, alignItems: 'center' },
    cardinal: { fontSize: 16, fontWeight: '700', color: c.ink },
    cardinalN: { color: c.accent },

    needleSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    kaabaWrap: { marginTop: 22, width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: hexToRgba(c.highlight, 0.45) },
    kaaba: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: c.accent,
      ...shadow.thumb,
    },
    kaabaBrass: { backgroundColor: c.highlight, borderRadius: 6 },
    // A thin lighter band across the cube — the kiswa's gold belt, abstracted.
    kaabaBand: { width: 22, height: 4, backgroundColor: 'rgba(255,255,255,0.5)' },
    shaftWrap: { flex: 1, width: 3, marginBottom: 2, alignItems: 'center' },
    needleShaft: { flex: 1, width: 3, borderRadius: 2, backgroundColor: c.accent },
    needleShaftBrass: { backgroundColor: c.highlight, borderRadius: 2 },
    // Pin the tail to the centre end of the slot so it meets the hub like the shaft.
    tailSlot: { justifyContent: 'flex-end' },
    needleTail: {
      width: 3,
      height: '50%',
      marginBottom: 2,
      borderRadius: 2,
      backgroundColor: c.track,
    },

    index: {
      position: 'absolute',
      top: -11,
      width: 0,
      height: 0,
      borderLeftWidth: 9,
      borderRightWidth: 9,
      borderTopWidth: 14,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.accent,
    },
    indexBrass: { borderTopColor: c.highlight },
    hubWrap: { width: 16, height: 16 },
    hub: { borderRadius: 8, backgroundColor: c.surface, borderWidth: 3, borderColor: c.accent },
    hubBrass: { backgroundColor: 'transparent', borderColor: c.highlight },

    readout: { alignItems: 'center', paddingBottom: space.xxxl, paddingHorizontal: space.lg },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: hexToRgba(c.accent, 0.3),
      ...shadow.button,
      shadowOpacity: 0.06,
    },
    // On your way → a warm brass tint. Locked on the qibla → a solid brass pill.
    statusPillNear: { backgroundColor: c.highlightSoft, borderColor: 'transparent' },
    statusPillOn: { backgroundColor: c.highlight, borderColor: 'transparent' },
    statusText: { ...type.callout, fontWeight: '600', color: c.accent },
    statusTextNear: { color: c.ink },
    statusTextOn: { color: c.onHighlight },

    facts: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.xl },
    bearingRow: { flexDirection: 'row', alignItems: 'flex-end' },
    bearingNum: { fontSize: 54, fontWeight: '400', color: c.ink, letterSpacing: 0.5, ...mono },
    bearingDeg: { fontSize: 30, fontWeight: '400', color: c.accent, marginBottom: 7 },
    factLabel: { ...type.body, color: c.inkMuted, marginBottom: 13 },
    distance: { ...type.callout, color: c.inkMuted, marginTop: 2, ...mono },
    note: { ...type.caption, color: c.inkFaint, textAlign: 'center', marginTop: space.lg, maxWidth: 300 },
  });
}
