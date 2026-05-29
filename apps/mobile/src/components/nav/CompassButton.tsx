// The map's LEFT navigation control: a live qibla mini-compass. When the device has a
// compass (and location permission is already granted) a small needle points at Mecca
// and turns as the phone turns — a dynamic signifier of what the button opens, not a
// dead icon. Until a real heading arrives — and on devices with no sensor (emulators)
// or no permission yet — it shows a static `explore` glyph instead, so it never paints
// a faked direction. Tapping always opens the full Qibla screen, which owns the prompt.
//
// "You're facing qibla" signifier: when angleDelta(heading, bearing) ≤ ALIGN_TOL we
// (a) swap the disc tint + rim to brass (c.highlight) so it visibly "lights up", (b)
// repaint the needle in brass, (c) overlay a small lock checkmark glyph in the corner,
// and (d) fire ONE hapticSuccess at the moment of transition (not on every frame while
// held). This mirrors the dedicated Qibla screen's brass-cross-fade — the chrome button
// uses the same language so the user reads the lock the same way on either surface.
//
// Theming: OS-themed via useColors (Apple Maps-style chrome; see MapNav).
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { hapticSuccess } from '../../lib/haptics';
import { useLocation } from '../../lib/location/context';
import { angleDelta, qiblaBearing } from '../../lib/qibla';
import { useHeading } from '../../lib/useHeading';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from './GlassRoundButton';

// Same tolerance the Qibla screen uses for its lock pill — one canonical "you're
// facing it" definition across the chrome and the full screen.
const ALIGN_TOL = 4;

export function CompassButton({ active }: { active: boolean }) {
  // OS-themed like the disc it sits in (see GlassRoundButton): warm light glass with a
  // dark ink glyph in light mode, dark glass with a pale ink glyph in dark mode.
  const c = useColors();
  const { coords } = useLocation();
  const bearing = useMemo(() => qiblaBearing(coords), [coords]);
  const { rotation, heading } = useHeading({ active, request: false });

  const aligned = heading != null && angleDelta(heading, bearing) <= ALIGN_TOL;
  // One confirming tap the instant it locks (and again on the next re-lock after the
  // user has wandered off and returned), not on every frame while they hold the angle.
  const wasAligned = useRef(false);
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
  }, [aligned]);

  // Point the needle at the qibla — bearing minus the live heading, clockwise — on the
  // UI thread so it tracks the phone smoothly without a React render per frame.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing - rotation.value}deg` }],
  }));

  // Lock-state colours: brass-soft tint and a brass rim, so the disc visibly lights up
  // when the phone is aimed at Mecca (the warmth contrasts with the cool navy / parchment
  // base, reading at a glance even peripherally). Needle tip + tail follow.
  const tint = aligned ? c.highlightSoft : c.cardGlass;
  const rim = aligned ? c.highlight : c.hairline;
  const needleHue = aligned ? c.highlight : c.accent;
  const tailHue = aligned ? c.highlight : c.inkFaint;

  return (
    <GlassRoundButton
      tint={tint}
      rim={rim}
      accessibilityLabel={aligned ? 'Qibla — du är vänd mot Mecka' : 'Qibla'}
      onPress={() => router.navigate('/qibla')}
    >
      {heading == null ? (
        // Static fallback (emulator / no sensor / permission not yet granted): a light
        // OUTLINE compass — the filled `explore` glyph read as a heavy black disc next to
        // the thin cog. Outline matches the cog's weight and the live needle below.
        <MaterialCommunityIcons name="compass-outline" size={24} color={c.ink} />
      ) : (
        <Animated.View style={[styles.needleBox, needleStyle]}>
          <View style={[styles.tip, { borderBottomColor: needleHue }]} />
          <View style={[styles.tail, { backgroundColor: tailHue }]} />
        </Animated.View>
      )}
      {/* Lock badge — a tiny check-circle pinned to the top-right corner of the disc
          when the phone is aimed at Mecca. A second, redundant signifier on top of the
          brass tint so the lock is unmistakable for a colour-blind user too. */}
      {aligned ? (
        <View style={styles.lockBadge} pointerEvents="none">
          <MaterialIcons name="check-circle" size={14} color={c.highlight} />
        </View>
      ) : null}
    </GlassRoundButton>
  );
}

const styles = StyleSheet.create({
  needleBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  // Arrowhead (points at the qibla) over a quiet tail — a compass needle, abstracted.
  tip: {
    position: 'absolute',
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 5.5,
    borderRightWidth: 5.5,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tail: { position: 'absolute', top: 13, width: 2.5, height: 11, borderRadius: 1.5 },
  // The lock badge sits just outside the needle, anchored to the disc's NE corner.
  lockBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
