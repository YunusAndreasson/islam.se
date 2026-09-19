// The Hijri month, laid out. The dial's ring says where in the month we are; this says what
// the month IS — which day is ʿĀshūrāʾ, which square is the 27th, and what the Moon looked
// like on each of them.
//
// A SEVEN-COLUMN GRID, Monday-first, exactly like DayPicker's. A Hijri month is not a whole
// number of weeks, so the columns do not line up from month to month — and that is precisely
// what makes the grid worth drawing rather than a plain list of thirty numbers. The one
// question a reader brings here is "which day of the week does it fall on", and only a grid
// answers it at a glance.
//
// The moons in the squares take the ALMANAC tilt, not the real one — lit on the right while
// waxing, on the left while waning (see MoonDisc's almanacTilt). Everywhere else in this
// feature the Moon leans the way it leans over the reader's own horizon; a calendar square
// is not the sky, and a grid of thirty differently-tilted moons reads as noise. Drawn all
// lit-side-up instead, which was the first attempt, the two halves of the month come out as
// identical drawings and the grid reads as a disc filling from one end.
//
// Laid out like DayPicker's sheet, on purpose: title on the leading edge with the OTHER
// calendar's months quietly under it, the same stepper pill and round ✕ at the trailing
// edge, today as a small tinted circle behind the numeral, moons at the same 20 dp. Here the
// title is the Hijri month — this sheet pages through Hijri months, and the date a control
// changes is the one that heads it, which is the same rule that puts the Swedish date first
// in the dock's crown.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { StepperPill } from '@/components/ui/StepperPill';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { hapticSelection } from '@/lib/haptics';
import { HIJRI_MONTHS, hijriToGregorian, SWEDISH_MONTHS } from '@/lib/hijri';
import { moonPhaseAt } from '@/lib/moon/ephemeris';
import { type DayMark, MONTH_NOTES, monthRing } from '@/lib/moon/month';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';

/** Monday-first, as Swedish calendars are — the same two-letter abbreviations DayPicker uses. */
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];
/** Same moon size as DayPicker's grid. */
const MOON_PX = 20;

/** The civil month(s) a Hijri month spans — "Februari – mars 2026". A lunar month always
 *  straddles two, so the first and last day's months are the whole answer; the year is written
 *  once unless the span crosses New Year. Capitalised because it opens a line. */
function civilSpan(first: Date, last: Date): string {
  const m = (d: Date) => SWEDISH_MONTHS[d.getMonth()];
  const text =
    first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
      ? `${m(first)} ${first.getFullYear()}`
      : first.getFullYear() === last.getFullYear()
        ? `${m(first)} – ${m(last)} ${last.getFullYear()}`
        : `${m(first)} ${first.getFullYear()} – ${m(last)} ${last.getFullYear()}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What each fasting standing looks like. `forbidden` is deliberately the loudest of the
 *  three: it is the only one where acting on the wrong colour is acting wrongly. */
const FAST_TEXT: Record<NonNullable<DayMark['fast']>, string> = {
  fard: 'fasta',
  sunna: 'sunna att fasta',
  forbidden: 'fasta är inte tillåten',
};

interface Props {
  /** The Hijri month on screen. */
  year: number;
  month: number;
  /** Today's Hijri date, so the grid can ring it — null when today is in another month. */
  today: number | null;
  /** The reader's Hijri day offset, so the civil dates in the squares match the dock's. */
  offsetDays: number;
  onStepMonth: (step: 1 | -1) => void;
  /** False at the ends of the range the caller allows. A chevron that does nothing is worse
   *  than one that is visibly spent. */
  canStepBack: boolean;
  canStepForward: boolean;
  onClose: () => void;
  c: Palette;
}

export function MoonMonthSheet({
  year,
  month,
  today,
  offsetDays,
  onStepMonth,
  canStepBack,
  canStepForward,
  onClose,
  c,
}: Props) {
  const styles = useMemo(() => makeStyles(c), [c]);
  // ⚠️ THE INSETS ARE READ HERE AND NOT INHERITED. This sheet is absolutely positioned, and
  // an absolutely-positioned child does not get the padding its SafeAreaView parent applies —
  // so a flat `top: space.xxl` put the month header ABOVE the screen's own ✕, up under the
  // status bar, where Android's system UI swallows the touches. The chevrons rendered
  // perfectly, reported themselves as enabled to the accessibility tree, and did nothing at
  // all when pressed. DayPicker never hit this because its sheet lives inside the dock card,
  // nowhere near an inset.
  const insets = useSafeAreaInsets();
  const ink = useMoonInk();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const reduceMotion = useReducedMotion();

  const { cells, notes, span } = useMemo(() => {
    const ring = monthRing(year, month);
    // Each day's civil date, its weekday column, and the Moon it had. Noon is used for the
    // phase because a day has one square and one moon, and midday is the least arbitrary
    // instant in it.
    const days = ring.map(({ day, mark }) => {
      const g = hijriToGregorian({ year, month, day }, offsetDays);
      const civil = new Date(g.year, g.month - 1, g.day, 12);
      const phase = moonPhaseAt(civil);
      return {
        day,
        mark,
        civil,
        // JS getDay is Sunday-0; Swedish calendars are Monday-first, so rotate.
        column: (civil.getDay() + 6) % 7,
        illumination: phase.illumination,
        waxing: phase.phaseAngle < 180,
      };
    });
    const lead = days[0]?.column ?? 0;
    // The month's marked days, collapsed into runs, so "13, 14, 15 Vita dagarna" is one line
    // rather than three identical ones.
    const runs: { from: number; to: number; mark: DayMark }[] = [];
    for (const d of days) {
      if (!d.mark) continue;
      const last = runs.at(-1);
      if (last && last.mark.kind === d.mark.kind && last.to === d.day - 1) last.to = d.day;
      else runs.push({ from: d.day, to: d.day, mark: d.mark });
    }
    const first = days[0]?.civil;
    const last = days.at(-1)?.civil;
    return {
      cells: [...Array.from({ length: lead }, () => null), ...days],
      notes: runs,
      span: first && last ? civilSpan(first, last) : '',
    };
  }, [year, month, offsetDays]);

  const monthNote = MONTH_NOTES[month];

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.quick)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.quick)}
      style={StyleSheet.absoluteFill}
      // Same modal semantics DayPicker's sheet uses: while this is up, the screen behind it
      // is not part of the swipe order.
      accessibilityViewIsModal
    >
      {/* Tap-outside-to-close, for a thumb. Hidden from assistive tech on purpose: a
          full-screen invisible button ahead of the grid is a trap for a screen reader, and
          the header's ✕ ("Stäng månaden") is the way out that gets announced. DayPicker solves the
          same problem by having no backdrop at all; this one covers more, so it keeps the
          convenience and drops it from the tree. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {/* OPAQUE, not glass. DayPicker's sheet floats over a map, where a translucent card
          is the whole point; this one covers a screenful of text, and at cardGlass's 0.90
          the readout underneath showed straight through the calendar — the year, the phase
          line and the notes all legible behind the grid. A month is a thing you read. */}
      <GlassSurface
        style={[
          styles.sheet,
          { top: insets.top + space.sm, bottom: Math.max(space.xxl, insets.bottom + space.sm) },
        ]}
        borderRadius={radius.xl}
        tint={c.surface}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {HIJRI_MONTHS[month - 1]} {year}
            </Text>
            {span ? <Text style={styles.subtitle}>{span}</Text> : null}
          </View>
          <StepperPill
            onStep={(step) => {
              // Stepping through months: class 3, the same tick as DayPicker's month step.
              hapticSelection();
              onStepMonth(step);
            }}
            canStepBack={canStepBack}
            canStepForward={canStepForward}
            backLabel="Föregående månad"
            forwardLabel="Nästa månad"
          />
          {/* The way out, in the header where DayPicker's is. It used to be a "Stäng" text
              button under the notes; one close control per sheet, in the same place on both
              sheets, is what makes the second one familiar. */}
          <Pressable
            // Dismissal — no haptic (lib/haptics policy).
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Stäng månaden"
            hitSlop={{ top: 4, bottom: 4, right: 4 }}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Icon name="close" size={20} color={c.inkMuted} />
          </Pressable>
        </View>

        <ScrollView style={styles.body}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((d) => (
            <Text key={d} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell, i) =>
            cell === null ? (
              <View key={`pad${i}`} style={styles.cell} />
            ) : (
              <View
                key={cell.day}
                style={[styles.cell, cell.civil.getTime() < todayStart && { opacity: 0.52 }]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${cell.day} ${HIJRI_MONTHS[month - 1]}, ${cell.civil.getDate()}/${cell.civil.getMonth() + 1}${
                  cell.mark ? `, ${cell.mark.label}${cell.mark.fast ? `, ${FAST_TEXT[cell.mark.fast]}` : ''}` : ''
                }${cell.day === today ? ', i dag' : ''}`}
              >
                <View style={[styles.dayBubble, cell.day === today && styles.dayBubbleToday]}>
                  <Text style={[styles.dayNum, cell.day === today && styles.dayNumToday]}>{cell.day}</Text>
                </View>
                {/* The ALMANAC tilt, not the real one: a calendar square is not the sky, and
                    thirty differently-leaning moons read as noise. Lit on the right while
                    waxing and on the left while waning is what makes the grid a lunation. */}
                <MoonDisc size={MOON_PX} illumination={cell.illumination} tilt={almanacTilt(cell.waxing)} {...(cell.civil.getTime() < todayStart ? { lit: c.inkFaint, dark: c.paperSunken, rim: c.inkFaint } : ink)} />
                <Text style={styles.civil}>{cell.civil.getDate()}</Text>
                {cell.mark ? (
                  <View
                    style={[styles.markDot, cell.mark.fast === 'forbidden' && styles.markDotForbidden]}
                  />
                ) : (
                  <View style={styles.markDotSpacer} />
                )}
              </View>
            ),
          )}
        </View>

        <View style={[styles.notes, styles.notesContent]}>
          {notes.map((run) => (
            <View key={`${run.mark.kind}${run.from}`} style={styles.noteRow}>
              <Text style={styles.noteDays}>{run.from === run.to ? run.from : `${run.from}–${run.to}`}</Text>
              <Text style={styles.noteText}>
                {run.mark.label}
                {run.mark.arabic && run.mark.arabic !== run.mark.label ? ` · ${run.mark.arabic}` : ''}
                {run.mark.fast ? ` · ${FAST_TEXT[run.mark.fast]}` : ''}
              </Text>
            </View>
          ))}
          {monthNote ? <Text style={styles.monthNote}>{monthNote}</Text> : null}
          {/* Said once, on the surface that lists the month's days, because it is the thing
              that decides them. The arithmetic below every square is an aid; the month begins
              with the sighting of the crescent, or by completing thirty days. */}
          <Text style={styles.monthNote}>
            Månaden börjar när nymånen ses, eller när föregående månad fyllt trettio dagar. Datumen
            här är räknade – följ din moské, och justera vid behov Hijri-datum i Inställningar.
          </Text>
        </View>
        </ScrollView>
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      // top/bottom are set at the call site from the safe-area insets — see the note there.
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: space.md,
      overflow: 'hidden',
      ...shadow.card,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    titleBlock: { flex: 1, minWidth: 0 },
    // The same pair DayPicker's title uses: 18/700 over a 14 muted line.
    title: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 0.1, color: c.ink },
    subtitle: { fontSize: 14, lineHeight: 20, color: c.inkMuted, marginTop: 1 },
    close: {
      width: 36,
      height: 36,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.paperSunken,
    },
    weekRow: { flexDirection: 'row', marginTop: space.md },
    weekday: { ...type.caption, color: c.inkFaint, flex: 1, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
    // More air under each square's contents than inside it, so the moon and civil date read as
    // belonging to the Hijri numeral above them rather than to the row below.
    cell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      paddingTop: 2,
      paddingBottom: 8,
    },
    // Today: a small tinted circle behind the numeral, as in DayPicker — not the whole square,
    // which tinted the moon and the civil date too and made today the largest object on the
    // sheet. Fixed 32 × 32; see DayPicker's dayBubble for why not an aspect ratio.
    dayBubble: { width: 32, height: 32, borderRadius: radius.round, alignItems: 'center', justifyContent: 'center' },
    dayBubbleToday: { backgroundColor: c.accentSoft },
    dayNum: { ...type.callout, color: c.ink, fontVariant: ['tabular-nums'] },
    dayNumToday: { color: c.accent, fontWeight: '700' },
    civil: { ...type.micro, fontWeight: '400', letterSpacing: 0, color: c.inkFaint, marginTop: 2 },
    markDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.highlight, marginTop: 1 },
    markDotForbidden: { backgroundColor: c.accent },
    markDotSpacer: { width: 4, height: 4, marginTop: 1 },
    body: { flex: 1 },
    notes: { marginTop: space.sm },
    notesContent: { paddingBottom: space.sm, gap: space.xs },
    noteRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
    noteDays: { ...type.caption, color: c.highlightText, fontWeight: '700', minWidth: 40 },
    noteText: { ...type.caption, color: c.inkMuted, flexShrink: 1 },
    monthNote: { ...type.caption, color: c.inkFaint, marginTop: space.sm },
    pressed: { opacity: 0.6 },
  });
}
