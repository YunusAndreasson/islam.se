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
// The signal, in one sentence: a plain arrow turning with you → a gold arrow in a lit disc
// when you are aimed at Mecca, plus ONE haptic tap at the moment of transition (not every
// frame while held) and a small spring scale-up so the lock feels physical.
//
// Theming: OS-themed via useColors (Apple Maps-style chrome; see MapNav).
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { hapticSuccess } from '@/lib/haptics';
import { useLocation } from '@/lib/location/context';
import { qiblaBearing } from '@/lib/qibla';
import { useAim } from '@/lib/useAim';
import { useColors } from '@/theme/useColors';
import { Icon } from '@/components/ui/Icon';
import { GlassRoundButton } from './GlassRoundButton';
import { useNavMetrics } from './metrics';

// The disc and the glyph inside it both scale with the reader's text size — see
// ./metrics, which every disc in the nav row measures from so the three stay a set.
/** A crisp, slightly springy lock so the mark "snaps" when you hit the bearing. Shared
 *  with MoonButton: the two discs sit side by side and must arrive with one motion. */
export const LOCK_SPRING = { damping: 14, stiffness: 240, mass: 0.5 };

export function CompassButton({ active }: { active: boolean }) {
  const c = useColors();
  const { disc, glyph } = useNavMetrics();
  const { coords } = useLocation();
  const bearing = useMemo(() => qiblaBearing(coords), [coords]);
  // The same instrument the Qibla screen and the Moon's sky dial run on (lib/useAim), asked
  // the smallest of its questions: am I facing it, and which way is the phone pointing. It
  // does NOT prompt — passive chrome on the home screen must never throw a permission dialog
  // at a reader who only opened the map; the dedicated Qibla screen owns that question.
  //
  // `status.aligned` locks ONLY when the heading is trustworthy (calibration ≥ 2). During the
  // magnetometer's warm-up the heading can be tens of degrees off, so an ungated lock would
  // flash gold and buzz "you're facing Mecca" at the wrong orientation. The arrow still turns
  // live meanwhile — showing an uncertain direction is honest, claiming a lock is not. It also
  // brings the hysteresis this button never had: a heading sitting on the 4° edge used to
  // strobe the disc gold and re-fire the haptic every tick.
  // `countTurn: false` — like the Moon disc beside it, this reads the BAND and nothing else,
  // so it opts out of the hook's 10 Hz remaining-turn push. The arrow's smoothness is
  // untouched: that rides `rotation` on the UI thread.
  const { status, rotation, hasReading } = useAim({
    active,
    request: false,
    bearing,
    countTurn: false,
  });
  const aligned = status.aligned;
  const wasAligned = useRef(false);
  const lockScale = useSharedValue(1);
  // The scale-pop is decoration on top of a colour change that already carries the whole
  // signal, so Reduce Motion takes the spring and leaves the lock — the app-wide pattern
  // (DisclosureGroup, FaqItem). The arrow's ROTATION is untouched: that is the instrument.
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (aligned && !wasAligned.current) hapticSuccess();
    wasAligned.current = aligned;
    const target = aligned ? 1.12 : 1;
    lockScale.value = reduceMotion ? 1 : withSpring(target, LOCK_SPRING);
  }, [aligned, lockScale, reduceMotion]);

  // Point the arrow at the qibla — the bearing minus the live heading, clockwise — on the
  // UI thread, so it tracks the phone smoothly without a React render per frame. The lock
  // scale rides along in the same transform. `rotation` is the UNWRAPPED heading (see
  // lib/useAim), so crossing north eases the short way instead of spinning 359°.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing - rotation.value}deg` }, { scale: lockScale.value }],
  }));

  // ⚠️ NEUTRAL UNTIL AIMED. The resting arrow was `accent`, the app's blue, on the argument
  // that a live instrument should not wear the same ink as the settings cog it sits
  // opposite. That argument was sound while the nav was one disc against one destination.
  // It stopped being sound the day the Moon moved up beside this one, because MoonButton
  // had already settled the question the other way: neutral disc by default, `highlightSoft`
  // tint and `highlightText` mark on the one state worth calling out (the white days). Blue
  // here made the compass the only member of a row of three not speaking that vocabulary.
  //
  // It also makes the lock LOUDER, which is the part worth keeping. Blue → gold is a hue
  // shift between two saturated colours; ink → gold is neutral → saturated, and the eye
  // reads that as something happening rather than as something changing shade. What says
  // "live instrument" here was never the colour anyway — it is that the arrow TURNS.
  // `highlight` is the token reserved for "this is live right now" (see theme/tokens), and
  // spending it on the aim and nothing else is what keeps it worth anything.
  const arrowHue = aligned ? c.highlightText : c.ink;
  const tint = aligned ? c.highlightSoft : c.cardGlass;
  const rim = aligned ? c.highlightText : c.hairline;

  return (
    <GlassRoundButton
      tint={tint}
      rim={rim}
      accessibilityLabel={
        aligned
          ? 'Qibla – du är vänd mot Mecka'
          : !hasReading
            ? 'Qibla – kompassen är inte tillgänglig'
            : 'Qibla'
      }
      size={disc}
      onPress={() => router.navigate('/qibla')}
    >
      {!hasReading ? (
        // No sensor (emulator), or no heading yet. A compass ROSE, not the arrow: an
        // arrow always claims a direction, and an upright one here would claim "Mecca is
        // straight ahead" to anyone who happened to be facing north-ish. The rose says
        // "compass" while pointing nowhere, which is the honest state.
        <Icon name="compassRose" size={glyph} color={c.inkMuted} />
      ) : (
        <Animated.View style={needleStyle}>
          <Icon name="navigationArrow" size={glyph} color={arrowHue} />
        </Animated.View>
      )}
    </GlassRoundButton>
  );
}
