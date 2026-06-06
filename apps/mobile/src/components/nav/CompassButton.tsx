// The map's LEFT navigation control: a qibla mini-compass whose mark IS the app's
// logo. The logo is a FIXED up-arrow — it does NOT rotate. It points straight up as a
// "you're aimed this way" mark, and the disc LIGHTS UP (brass) the moment the phone's
// top is pointed at Mecca. So the signal is unambiguous: glow = you're facing the
// qibla. (An earlier version rotated the logo toward Mecca as a "it's over there"
// pointer; that read as "the icon is pointing the wrong way" until you happened to be
// aligned, so it was dropped in favour of this fixed-arrow-that-glows model.)
// Tapping always opens the full Qibla screen, which owns the permission prompt.
//
// "You're facing qibla" signifier: when angleDelta(heading, bearing) ≤ ALIGN_TOL we
// (a) swap the disc tint + rim to brass (c.highlight) so it visibly "lights up", (b)
// repaint the logo in brass, (c) give it a small spring scale-up so it "locks", and
// (d) fire ONE hapticSuccess at the moment of transition (not every frame while held).
// Deliberately NO corner checkmark and NO rotating needle: a fixed pointed icon implies
// a direction it doesn't have, and the off-corner badge read as a stray "indicator" 20–30°
// off the tip — so the lock is signalled only by the logo recolouring + the haptic. The
// full Qibla screen owns the actual direction.
//
// Theming: OS-themed via useColors (Apple Maps-style chrome; see MapNav).
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticSuccess } from '../../lib/haptics';
import { useLocation } from '../../lib/location/context';
import { angleDelta, QIBLA_ALIGN_TOL, qiblaBearing } from '../../lib/qibla';
import { useHeading } from '../../lib/useHeading';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from './GlassRoundButton';

// The brand mark as a white, transparent-background silhouette — recoloured at runtime
// with tintColor so the same asset reads as ink (idle), accent (live needle), or brass
// (locked on qibla).
const LOGO = require('../../../assets/images/logo-mark.png');

// A crisp, slightly springy lock so the mark "snaps" brass when you hit the bearing.
const LOCK_SPRING = { damping: 14, stiffness: 240, mass: 0.5 };

export function CompassButton({ active }: { active: boolean }) {
  // OS-themed like the disc it sits in (see GlassRoundButton): warm light glass with a
  // dark ink glyph in light mode, dark glass with a pale ink glyph in dark mode.
  const c = useColors();
  const { coords } = useLocation();
  const bearing = useMemo(() => qiblaBearing(coords), [coords]);
  const { heading, reliable } = useHeading({ active, request: false });

  // Lock ONLY when the heading is trustworthy (accuracy ≥ 2). During the magnetometer's
  // warm-up / calibration window the heading can be tens of degrees off, so an ungated
  // lock would flash brass + buzz "you're facing Mecca" at the wrong orientation (the
  // "wrong at first, then right" the needle shows). The logo still rotates live meanwhile.
  const aligned = reliable && heading != null && angleDelta(heading, bearing) <= QIBLA_ALIGN_TOL;
  // One confirming tap the instant it locks (and again on the next re-lock after the
  // user has wandered off and returned), not on every frame while they hold the angle.
  // The same transition drives the spring scale-up that makes the lock feel physical.
  const wasAligned = useRef(false);
  const lockScale = useSharedValue(1);
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
    lockScale.value = withSpring(aligned ? 1.12 : 1, LOCK_SPRING);
  }, [aligned, lockScale]);

  // The logo stays a fixed up-arrow (no rotation) — it only POPS with a small spring
  // scale-up the instant it locks, so the lock feels physical without the mark ever
  // pointing away from straight up.
  const lockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: lockScale.value }],
  }));

  // Lock-state colours: brass-soft tint and a brass rim so the disc visibly lights up
  // when the phone is aimed at Mecca (the warmth contrasts with the cool navy / parchment
  // base, reading at a glance even peripherally). The logo mark follows: accent while
  // live-but-searching, brass on lock.
  const tint = aligned ? c.highlightSoft : c.cardGlass;
  const rim = aligned ? c.highlightText : c.hairline;
  // Neutral ink at rest — the SAME glyph colour as the settings cog (MapNav), so the two
  // nav discs read as one consistent family — and brass only on lock. No indigo
  // "searching" tint: with the fixed-arrow-glows model the one signal that matters is the
  // brass glow when you're facing the qibla.
  const logoHue = aligned ? c.highlightText : c.ink;

  return (
    <GlassRoundButton
      tint={tint}
      rim={rim}
      accessibilityLabel={aligned ? 'Qibla — du är vänd mot Mecka' : 'Qibla'}
      onPress={() => router.navigate('/qibla')}
    >
      {/* Fixed up-arrow — never rotates. Colour carries the state (ink at rest → brass on
          lock) and a small scale-pop marks the moment. No corner indicator. */}
      <Animated.View style={lockStyle}>
        <Image source={LOGO} style={[styles.logo, { tintColor: logoHue }]} />
      </Animated.View>
    </GlassRoundButton>
  );
}

const styles = StyleSheet.create({
  // The logo mark, sized to sit inside the 46dp disc with breathing room.
  logo: { width: 24, height: 24, resizeMode: 'contain' },
});
