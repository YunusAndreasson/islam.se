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
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { hapticLight, hapticSelection } from '@/lib/haptics';
import { HIJRI_MONTHS, hijriToGregorian } from '@/lib/hijri';
import { moonPhaseAt } from '@/lib/moon/ephemeris';
import { type DayMark, MONTH_NOTES, monthRing } from '@/lib/moon/month';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';

/** Monday-first, as Swedish calendars are — the same two-letter abbreviations DayPicker uses. */
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];

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
  const reduceMotion = useReducedMotion();

  const { cells, notes } = useMemo(() => {
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
    return {
      cells: [...Array.from({ length: lead }, () => null), ...days],
      notes: runs,
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
          the explicit "Stäng" below is the way out that gets announced. DayPicker solves the
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
          <Pressable
            onPress={() => {
              hapticLight();
              onStepMonth(-1);
            }}
            disabled={!canStepBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Föregående månad"
            accessibilityState={{ disabled: !canStepBack }}
            style={({ pressed }) => [pressed && styles.pressed, !canStepBack && styles.spent]}
          >
            <Icon name="chevronLeft" size={22} color={c.accent} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {HIJRI_MONTHS[month - 1]} {year}
          </Text>
          <Pressable
            onPress={() => {
              hapticLight();
              onStepMonth(1);
            }}
            disabled={!canStepForward}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Nästa månad"
            accessibilityState={{ disabled: !canStepForward }}
            style={({ pressed }) => [pressed && styles.pressed, !canStepForward && styles.spent]}
          >
            <Icon name="chevronRight" size={22} color={c.accent} />
          </Pressable>
        </View>

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
                style={[styles.cell, cell.day === today && styles.cellToday]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${cell.day} ${HIJRI_MONTHS[month - 1]}, ${cell.civil.getDate()}/${cell.civil.getMonth() + 1}${
                  cell.mark ? `, ${cell.mark.label}${cell.mark.fast ? `, ${FAST_TEXT[cell.mark.fast]}` : ''}` : ''
                }${cell.day === today ? ', i dag' : ''}`}
              >
                <Text style={[styles.dayNum, cell.day === today && styles.dayNumToday]}>{cell.day}</Text>
                {/* The ALMANAC tilt, not the real one: a calendar square is not the sky, and
                    thirty differently-leaning moons read as noise. Lit on the right while
                    waxing and on the left while waning is what makes the grid a lunation. */}
                <MoonDisc size={16} illumination={cell.illumination} tilt={almanacTilt(cell.waxing)} {...ink} />
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

        <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
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
        </ScrollView>

        <Pressable
          onPress={() => {
            hapticSelection();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Stäng månaden"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>Stäng</Text>
        </Pressable>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
    title: { ...type.bodyStrong, color: c.ink, flexShrink: 1, textAlign: 'center' },
    weekRow: { flexDirection: 'row', marginTop: space.md },
    weekday: { ...type.caption, color: c.inkFaint, flex: 1, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.xs },
    cell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      paddingVertical: 3,
      borderRadius: radius.sm,
    },
    cellToday: { backgroundColor: c.accentSoft },
    dayNum: { ...type.caption, color: c.ink, fontWeight: '600' },
    dayNumToday: { color: c.accent },
    civil: { ...type.caption, fontSize: 10, color: c.inkFaint },
    markDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.highlight, marginTop: 1 },
    markDotForbidden: { backgroundColor: c.accent },
    markDotSpacer: { width: 4, height: 4, marginTop: 1 },
    notes: { flex: 1, marginTop: space.sm },
    notesContent: { paddingBottom: space.sm, gap: space.xs },
    noteRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
    noteDays: { ...type.caption, color: c.highlightText, fontWeight: '700', minWidth: 40 },
    noteText: { ...type.caption, color: c.inkMuted, flexShrink: 1 },
    monthNote: { ...type.caption, color: c.inkFaint, marginTop: space.sm },
    close: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
    closeText: { ...type.bodyStrong, color: c.accent },
    pressed: { opacity: 0.6 },
    spent: { opacity: 0.25 },
  });
}
