// Previous / next as ONE control: a two-segment pill, the shape a stepper takes on both
// platforms (UIStepper; Material's segmented button). Used wherever the app pages through
// time one unit at a time — the dock's date crown (a day) and the calendar sheet (a month).
//
// It replaced a pair of bare chevrons either side of a centred title, which failed twice:
//
//  • Too small to read as buttons, and on iOS markedly so. Icon inks a chevron at half its
//    box (see the `ink` note in ./Icon), so a 22 pt box drew an 11 pt stroke with nothing
//    around it to say "press me".
//  • They set the title in by a 48 dp button on the left and left the forward glyph floating
//    ~13 dp in from the right margin, so the header sat on a different edge from everything
//    under it. With the pill at the end of the row the title takes the leading edge, and the
//    pill's outer edge is the row's trailing edge.
//
// No haptic here: both callers already fire their own, and a second one in the component
// would double the tick.
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type Palette, radius } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { Icon } from './Icon';

/** The pill's visible height. Each half is widened to a full touch target by slop. */
const STEPPER_PILL_H = 36;

interface Props {
  onStep: (delta: 1 | -1) => void;
  canStepBack: boolean;
  canStepForward: boolean;
  /** Spoken name of each half — "Föregående dag", "Nästa månad"… */
  backLabel: string;
  forwardLabel: string;
}

export function StepperPill({ onStep, canStepBack, canStepForward, backLabel, forwardLabel }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.pill}>
      <Half styles={styles} direction={-1} disabled={!canStepBack} label={backLabel} onStep={onStep} />
      <View style={styles.divider} />
      <Half styles={styles} direction={1} disabled={!canStepForward} label={forwardLabel} onStep={onStep} />
    </View>
  );
}

function Half({
  styles,
  direction,
  disabled,
  label,
  onStep,
}: {
  styles: ReturnType<typeof makeStyles>;
  direction: 1 | -1;
  disabled: boolean;
  label: string;
  onStep: (delta: 1 | -1) => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onStep(direction)}
      disabled={disabled}
      // The pill is 36 tall so it sits quietly beside a two-line title; the slop makes each
      // half a full 48 × 48 target (Android's minimum, and what PrayerDock.test holds the day
      // buttons to) without a taller shape. Vertical only — horizontally each half's neighbour
      // is the other half, and slop there would let one steal the other's taps.
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.half, disabled && styles.off, pressed && styles.pressed]}
    >
      <Icon name={direction === 1 ? 'chevronRight' : 'chevronLeft'} size={26} color={c.accent} />
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Soft accent ground — the tint the app's other accent chips wear — so it reads as a
    // control without shouting over the title beside it.
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      height: STEPPER_PILL_H,
      borderRadius: radius.round,
      backgroundColor: c.accentSoft,
    },
    half: { width: 48, height: STEPPER_PILL_H, alignItems: 'center', justifyContent: 'center' },
    divider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: c.hairline },
    off: { opacity: 0.3 },
    pressed: { opacity: 0.55 },
  });
}
