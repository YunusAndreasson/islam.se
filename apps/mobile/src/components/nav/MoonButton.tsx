// The map's second left-hand instrument: tonight's Moon, at tonight's phase, tilted the way
// it actually leans over the reader's own horizon. Tapping opens Månen.
//
// It sits BESIDE the qibla compass, so the left row reads as the pair of instruments and
// the right-hand cog stays alone as the way out of the map. (It used to sit under it; see
// MapNav for what that cost the "Återställ" chip, and how it was paid.)
//
// The disc turns brass on the white days, the 13th to the 15th, and only then — see
// components/moon/moonInk, which owns that rule and the reason the Moon's colours are the
// one thing in the app that does not follow the semantic palette. That pattern — neutral
// disc by default, `highlightSoft` tint and a brass mark on the one state worth calling
// out — is the one CompassButton now follows for its own aim lock.
import { router } from 'expo-router';

import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { formatHijri, toHijri } from '@/lib/hijri';
import { useLocation } from '@/lib/location/context';
import { dayMark } from '@/lib/moon/month';
import { PHASE_NAMES, phaseKey } from '@/lib/moon/phase';
import { useCoarseNow, useMoonAppearance } from '@/lib/moon/useMoon';
import { useSettings } from '@/lib/settings/context';
import { zonePrayerDate } from '@/lib/zone-time';
import { useColors } from '@/theme/useColors';
import { GLYPH } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';

export function MoonButton() {
  const c = useColors();
  const { coords } = useLocation();
  const { settings } = useSettings();
  // One clock for both halves of this control. It is also the reason the date is not read
  // from Date.now() in the render: a bare clock read never changes, so the disc would still
  // be labelled with yesterday's date at breakfast — and on the one surface where the dock's
  // date crown is visible at the same time, disagreeing with it.
  const at = useCoarseNow();
  // The drawing-only half: this disc shows a phase and a tilt and never the Moon's age, and
  // the age is the expensive part (a walk over conjunctions, more than half the work). It is
  // on the map, which is the app's home screen, so that cost would land on first paint.
  const sky = useMoonAppearance(coords, at);

  // Read through the display zone exactly as the dock's date crown does.
  const today = zonePrayerDate(at);
  const hijri = toHijri(today, settings.hijriOffset);
  const white = dayMark(hijri.month, hijri.day)?.kind === 'white';
  const ink = useMoonInk(white);

  return (
    <GlassRoundButton
      tint={white ? c.highlightSoft : c.cardGlass}
      rim={white ? c.highlightText : c.hairline}
      accessibilityLabel={`Månen – ${PHASE_NAMES[phaseKey(sky.phaseAngle)].toLowerCase()}, ${formatHijri(today, settings.hijriOffset)}`}
      onPress={() => router.navigate('/manen')}
    >
      <MoonDisc size={GLYPH} illumination={sky.illumination} tilt={sky.limbAngle} {...ink} />
    </GlassRoundButton>
  );
}
