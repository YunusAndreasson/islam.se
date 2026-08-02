// The map's LEFT navigation control: a live qibla mini-compass. The arrow ROTATES with
// the phone so it always points at Mecca, and the whole disc LIGHTS UP in brass the
// moment you are facing it. Tapping opens the full Qibla screen, which owns the
// permission prompt.
//
// History worth keeping, because this has now been round the loop twice. The mark used to
// be the brand logo, rotated as a needle; when the brand became two concentric circles
// that stopped working — a radially symmetric mark has no direction to point — so it was
// frozen upright and the lock was signalled by colour alone. That lost the thing people
// actually used it for: a direction that tracks as you turn. The fix is not to rotate the
// logo again but to use a glyph that MEANS direction. An arrow reads correctly at every
// angle, including pointing back at you; the old peaked mark just looked broken upside
// down, which is what made the rotating version feel wrong rather than the rotation itself.
//
// The signal, in one sentence: blue arrow turning with you → gold arrow in a lit disc
// when you are aimed at Mecca, plus ONE haptic tap at the moment of transition (not every
// frame while held) and a small spring scale-up so the lock feels physical.
//
// Theming: OS-themed via useColors (Apple Maps-style chrome; see MapNav).
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticSuccess } from '@/lib/haptics';
import { useLocation } from '@/lib/location/context';
import { angleDelta, QIBLA_ALIGN_TOL, qiblaBearing } from '@/lib/qibla';
import { useHeading } from '@/lib/useHeading';
import { useColors } from '@/theme/useColors';
import { GlassRoundButton } from './GlassRoundButton';

/** Glyph size inside the 46 dp disc. */
const GLYPH = 22;
// A crisp, slightly springy lock so the arrow "snaps" gold when you hit the bearing.
const LOCK_SPRING = { damping: 14, stiffness: 240, mass: 0.5 };

export function CompassButton({ active }: { active: boolean }) {
  const c = useColors();
  const { coords } = useLocation();
  const bearing = useMemo(() => qiblaBearing(coords), [coords]);
  const { heading, reliable, rotation } = useHeading({ active, request: false });

  // Lock ONLY when the heading is trustworthy (accuracy ≥ 2). During the magnetometer's
  // warm-up the heading can be tens of degrees off, so an ungated lock would flash gold
  // and buzz "you're facing Mecca" at the wrong orientation. The arrow still turns live
  // meanwhile — showing an uncertain direction is honest, claiming a lock is not.
  const aligned = reliable && heading != null && angleDelta(heading, bearing) <= QIBLA_ALIGN_TOL;
  const wasAligned = useRef(false);
  const lockScale = useSharedValue(1);
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
    lockScale.value = withSpring(aligned ? 1.12 : 1, LOCK_SPRING);
  }, [aligned, lockScale]);

  // Point the arrow at the qibla — the bearing minus the live heading, clockwise — on the
  // UI thread, so it tracks the phone smoothly without a React render per frame. The lock
  // scale rides along in the same transform. `rotation` is the UNWRAPPED heading (see
  // useHeading), so crossing north eases the short way instead of spinning 359°.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing - rotation.value}deg` }, { scale: lockScale.value }],
  }));

  // The brand pair, through the theme-aware tokens rather than the raw mark hexes:
  // `accent` is the app's blue (#33437a light / #adbcf8 dark) and `highlightText` its
  // gold. Reaching for `brand.blue` here — the mark's own #2a557f — would go nearly
  // invisible on the dark chrome, which is exactly the split tokens.ts draws between the
  // MARK's colours and the functional ones. This deliberately breaks the old "same ink as
  // the settings cog" pairing — the cog is a destination, this is a live instrument, and
  // it should look like one.
  const arrowHue = aligned ? c.highlightText : c.accent;
  const tint = aligned ? c.highlightSoft : c.cardGlass;
  const rim = aligned ? c.highlightText : c.hairline;

  return (
    <GlassRoundButton
      tint={tint}
      rim={rim}
      accessibilityLabel={
        aligned
          ? 'Qibla — du är vänd mot Mecka'
          : heading == null
            ? 'Qibla — riktningen är inte tillgänglig'
            : 'Qibla'
      }
      onPress={() => router.navigate('/qibla')}
    >
      {heading == null ? (
        // No sensor (emulator), or no heading yet. A compass ROSE, not the arrow: an
        // arrow always claims a direction, and an upright one here would claim "Mecca is
        // straight ahead" to anyone who happened to be facing north-ish. The rose says
        // "compass" while pointing nowhere, which is the honest state.
        <MaterialIcons name="explore" size={GLYPH} color={c.inkMuted} />
      ) : (
        <Animated.View style={needleStyle}>
          <MaterialIcons name="navigation" size={GLYPH} color={arrowHue} />
        </Animated.View>
      )}
    </GlassRoundButton>
  );
}
