// The map's second left-hand instrument: tonight's Moon, at tonight's phase, tilted the way
// it actually leans over the reader's own horizon. Tapping opens Månen.
//
// It sits BESIDE the qibla compass, so the left row reads as the pair of instruments and
// the right-hand cog stays alone as the way out of the map. (It used to sit under it; see
// MapNav for what that cost the "Återställ" chip, and how it was paid.)
//
// IT LIGHTS UP WHEN YOU FACE THE MOON, exactly as the compass beside it lights when you
// face Mecca — same instrument (lib/useAim), same tolerance, same lit disc. A reader who has
// learnt one of these two discs has learnt the other, which is the whole argument for the
// pair sitting side by side.
//
// ⚠️ ONLY WHEN THE MOON IS ACTUALLY UP. It is under the horizon for about half of every
// day, and lighting the disc for a direction with nothing in it is the one claim this
// control must not make — it is a promise the reader can check by looking, and find false.
// The Månen screen makes the same distinction in words ("Månen är hitåt – men under
// horisonten"); a 46 dp chip has no room for the qualification, so it stays dark instead.
//
// ⚠️ TWO SIGNALS, TWO CHANNELS, and they must not be merged. The MARK says what the Moon
// IS: brass on the white days, the 13th to the 15th, and only then — see
// components/moon/moonInk, which owns that rule and the reason the Moon's colours are the
// one thing in the app that does not follow the semantic palette. The DISC says where the
// phone is POINTING. They used to share the tint, which was fine while the disc had nothing
// of its own to say; putting the aim on it too would have made the lock invisible on exactly
// the three nights of the month when someone goes out to look at the Moon.
//
// NO HAPTIC, deliberately, like the map's compass beside it; only the Qibla screen buzzes
// on a lock. A reader there is aiming — the buzz confirms something they set out to do.
// Nobody sets out to point a map at the Moon; they are holding the phone and it happens to
// sweep past. lib/haptics' class 1 is an outcome
// the reader CAUSED, and an unbidden buzz from a home-screen chip is exactly the routine
// transition the policy's NO list is about.
import { router } from 'expo-router';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { formatHijri, toHijri } from '@/lib/hijri';
import { useLocation } from '@/lib/location/context';
import { dayMark } from '@/lib/moon/month';
import { PHASE_NAMES, phaseKey } from '@/lib/moon/phase';
import { useCoarseNow, useMoonAppearance } from '@/lib/moon/useMoon';
import { useSettings } from '@/lib/settings/context';
import { useAim } from '@/lib/useAim';
import { zonePrayerDate } from '@/lib/zone-time';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { LOCK_SPRING } from './CompassButton';
import { useNavMetrics } from './metrics';
import { GlassRoundButton } from './GlassRoundButton';

/** How often this disc re-reads where the Moon is. See the note at the call site: it is an
 *  aiming instrument now, so it cannot run on the drawing clock's ten-minute bucket. */
const AIM_TICK_MS = 60_000;

export function MoonButton({ active }: { active: boolean }) {
  const c = useColors();
  const glass = useSkyGlass();
  const { disc, glyph } = useNavMetrics();
  const { coords } = useLocation();
  const { settings } = useSettings();
  // One clock for both halves of this control. It is also the reason the date is not read
  // from Date.now() in the render: a bare clock read never changes, so the disc would still
  // be labelled with yesterday's date at breakfast — and on the one surface where the dock's
  // date crown is visible at the same time, disagreeing with it.
  //
  // ⚠️ A MINUTE, NOT THE DEFAULT TEN. The ten-minute bucket in lib/moon/useMoon was sized for
  // a DRAWING — that file's own note says the illuminated fraction and the tilt barely move in
  // that time, and that anything wanting a live instrument should take it from the compass
  // instead. This disc now aims: `sky.azimuth` is checked against a 4° lock, and the Moon's
  // azimuth can cross that in ten minutes (much faster near the meridian), so a stale bearing
  // would light the disc and claim "du ser mot månen" several degrees off the real Moon.
  // `sky.altitude > 0` is the same story at the horizon: ten minutes of lighting for a Moon
  // that has set, and refusing for one that has risen. One ephemeris pass a minute is a
  // millisecond or two; the claim is worth more than that.
  const at = useCoarseNow(AIM_TICK_MS, active);
  // The drawing-only half: this disc shows a phase and a tilt and never the Moon's age, and
  // the age is the expensive part (a walk over conjunctions, more than half the work). It is
  // on the map, which is the app's home screen, so that cost would land on first paint.
  const sky = useMoonAppearance(coords, at);

  // Read through the display zone exactly as the dock's date crown does.
  const today = zonePrayerDate(at);
  const hijri = toHijri(today, settings.hijriOffset);
  const white = dayMark(hijri.month, hijri.day)?.kind === 'white';
  const ink = useMoonInk(white);

  // The same hook the compass runs on, aimed at the Moon's own azimuth. `request: false` —
  // passive chrome on the home screen never raises a permission dialog; the Månen screen is
  // where that question is asked. The lock carries the calibration gate with it, so a
  // warming-up magnetometer cannot light this disc at the wrong orientation.
  //
  // `countTurn: false`: this disc reads the BAND and nothing else. Left on, the hook's 10 Hz
  // remaining-turn push would re-render this component — and with it `toHijri`, `formatHijri`,
  // `dayMark` and the drawn `MoonDisc` — ten times a second while the reader turns the phone
  // over the map, to deliver a number it never looks at.
  const { status } = useAim({ active, request: false, bearing: sky.azimuth, countTurn: false });
  const aimed = status.aligned && sky.altitude > 0;

  // A small spring pop so the lock feels physical, the compass's twin. Reduce Motion takes
  // the spring and leaves the colour, which carries the whole signal on its own.
  const lockScale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    lockScale.set(reduceMotion ? 1 : withSpring(aimed ? 1.12 : 1, LOCK_SPRING));
  }, [aimed, lockScale, reduceMotion]);
  const lockStyle = useAnimatedStyle(() => ({ transform: [{ scale: lockScale.get() }] }));

  const phase = PHASE_NAMES[phaseKey(sky.phaseAngle)].toLowerCase();
  return (
    <GlassRoundButton
      tint={aimed ? c.highlightSoft : glass.surface}
      tintOpacity={aimed ? undefined : 0.86}
      rim={aimed ? c.highlightText : c.hairline}
      accessibilityLabel={
        aimed
          ? `Månen – du ser mot månen, ${phase}, ${formatHijri(today, settings.hijriOffset)}`
          : `Månen – ${phase}, ${formatHijri(today, settings.hijriOffset)}`
      }
      size={disc}
      onPress={() => router.navigate('/manen')}
    >
      <Animated.View style={lockStyle}>
        <MoonDisc size={glyph} illumination={sky.illumination} tilt={sky.limbAngle} {...ink} />
      </Animated.View>
    </GlassRoundButton>
  );
}
