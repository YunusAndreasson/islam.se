// The map's LEFT navigation control: a live qibla mini-compass whose needle IS the
// app's logo mark. When the device has a compass (and location permission is already
// granted) the logo turns so its peak points at Mecca — a dynamic, brand-forward
// signifier of what the button opens. Until a real heading arrives — and on devices
// with no sensor (emulators) or no permission yet — the logo sits upright and still
// (in neutral ink), so it never paints a faked direction but still reads as the brand.
// Tapping always opens the full Qibla screen, which owns the permission prompt.
//
// "You're facing qibla" signifier: when angleDelta(heading, bearing) ≤ ALIGN_TOL we
// (a) swap the disc tint + rim to brass (c.highlight) so it visibly "lights up", (b)
// repaint the logo in brass, (c) give it a small spring scale-up so it "locks", (d)
// overlay a lock checkmark in the corner, and (e) fire ONE hapticSuccess at the moment
// of transition (not every frame while held). This mirrors the dedicated Qibla screen's
// brass cross-fade — the chrome button speaks the same language so the lock reads the
// same on either surface.
//
// Theming: OS-themed via useColors (Apple Maps-style chrome; see MapNav).
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticSuccess } from '../../lib/haptics';
import { useLocation } from '../../lib/location/context';
import { angleDelta, qiblaBearing } from '../../lib/qibla';
import { useHeading } from '../../lib/useHeading';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from './GlassRoundButton';

// The brand mark as a white, transparent-background silhouette — recoloured at runtime
// with tintColor so the same asset reads as ink (idle), accent (live needle), or brass
// (locked on qibla).
const LOGO = require('../../../assets/images/logo-mark.png');

// Same tolerance the Qibla screen uses for its lock pill — one canonical "you're
// facing it" definition across the chrome and the full screen.
const ALIGN_TOL = 4;
// A crisp, slightly springy lock so the mark "snaps" brass when you hit the bearing.
const LOCK_SPRING = { damping: 14, stiffness: 240, mass: 0.5 };

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
  // The same transition drives the spring scale-up that makes the lock feel physical.
  const wasAligned = useRef(false);
  const lockScale = useSharedValue(1);
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
    lockScale.value = withSpring(aligned ? 1.12 : 1, LOCK_SPRING);
  }, [aligned, lockScale]);

  // Point the logo's peak at the qibla — bearing minus the live heading, clockwise — on
  // the UI thread so it tracks the phone smoothly without a React render per frame. The
  // lock scale rides along in the same transform.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing - rotation.value}deg` }, { scale: lockScale.value }],
  }));

  // Lock-state colours: brass-soft tint and a brass rim so the disc visibly lights up
  // when the phone is aimed at Mecca (the warmth contrasts with the cool navy / parchment
  // base, reading at a glance even peripherally). The logo mark follows: accent while
  // live-but-searching, brass on lock.
  const tint = aligned ? c.highlightSoft : c.cardGlass;
  const rim = aligned ? c.highlight : c.hairline;
  const logoHue = aligned ? c.highlight : c.accent;

  return (
    <GlassRoundButton
      tint={tint}
      rim={rim}
      accessibilityLabel={aligned ? 'Qibla — du är vänd mot Mecka' : 'Qibla'}
      onPress={() => router.navigate('/qibla')}
    >
      {heading == null ? (
        // Static fallback (emulator / no sensor / permission not yet granted): the logo
        // upright in neutral ink — the brand, with no faked direction.
        <Image source={LOGO} style={[styles.logo, { tintColor: c.ink }]} />
      ) : (
        <Animated.View style={needleStyle}>
          <Image source={LOGO} style={[styles.logo, { tintColor: logoHue }]} />
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
  // The logo needle, sized to sit inside the 46dp disc with breathing room.
  logo: { width: 24, height: 24, resizeMode: 'contain' },
  // The lock badge sits at the disc's NE corner.
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
