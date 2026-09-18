// The month grid behind the dock's date header — the second half of day navigation.
//
// The day stepper in the dock's date crown is for NEARBY days: one tap each. This is for
// "when is Fajr on the 14th", where stepping would be twelve taps. Together they cover
// both distances, which is why the plan called for both rather than either alone.
//
// Laid out the way the crown is: the Swedish month is the title, on the sheet's leading
// edge, with the Hijri months it spans quietly under it; the pager is the same stepper pill,
// at the trailing edge. The viewed day is a small soft-tinted circle rather than a solid
// accent disc — the grid is for choosing, and a full-strength fill on one number shouted
// over the moon phases that are the other reason to open it.
//
// A modal sheet owns Back, outside-tap dismissal and accessibility focus while open.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '@/lib/haptics';
import { HIJRI_MONTHS, SWEDISH_MONTHS, toHijri } from '@/lib/hijri';
import { relativeDayLabel } from '@/lib/relative-day';
import { MAX_DAY_OFFSET } from '@/lib/solar/useSolarClock';
import { addZoneDays, zonePrayerDate, zoneParts } from '@/lib/zone-time';
import { motion, type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { StepperPill } from '@/components/ui/StepperPill';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { moonPhaseAt } from '@/lib/moon/ephemeris';

// Monday-first, as Swedish calendars are. Single letters would be ambiguous (måndag and
// onsdag both start with m/o pairs that collide), so two letters — the standard Swedish
// abbreviations without the trailing period a calendar header does not need.
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];
/** Each day's moon. Big enough to read the phase at a glance — at the old 12 dp a crescent
 *  and a half moon were the same grey dot — and still well under the numeral above it. */
const MOON_PX = 20;

interface Props {
  /** Stockholm midnight of the day currently on screen. */
  dayStart: number;
  /** Stockholm midnight of the real today — drives the "i dag" ring and the rails. */
  todayStart: number;
  /** The reader's Hijri adjustment (settings.hijriOffset), so the month line under the
   *  title agrees with the Hijri date the dock prints. */
  hijriOffset?: number;
  /** Pick a day: any instant inside it. */
  onPick: (instant: number) => void;
  onClose: () => void;
}

/** Which calendar month (in the display zone) a day belongs to, and where the grid starts.
 *  Built from zoneParts rather than a local Date so a phone in another timezone
 *  cannot render a month offset by one day — the same pin the rest of the app uses. */
export interface MonthGrid {
  title: string;
  /** Stockholm midnight of the 1st. */
  first: number;
  /** Stockholm midnight of the last day. */
  last: number;
  /** Leading nulls pad the row so the 1st lands under its weekday column; trailing nulls
   *  fill the grid out to {@link GRID_CELLS}, so every month is the same six rows tall. */
  cells: (number | null)[];
}

/** Six weeks of seven days — the tallest a month can need (a 31-day month starting on a
 *  Sunday pads six leading blanks), and therefore the height EVERY month is drawn at.
 *
 *  A ragged grid moves the controls. The sheet is anchored to the dock's bottom edge and
 *  grows upward, so a five-row month sits 40 dp lower than a six-row one — and paging from
 *  one to the other slides the ‹ › ✕ row up from under the reader's finger mid-tap. The
 *  next tap then lands on the grid below the header, which PICKS a day and closes the
 *  sheet: page through the year quickly and you arrive at a date you never chose. Padding
 *  costs an empty row on short months, which is what every platform date picker does. */
export const GRID_CELLS = 42;

export function monthGrid(anchor: number): MonthGrid {
  const { y, mo, d } = zoneParts(anchor);
  // Step back to the 1st, then forward one day at a time. addZoneDays throughout
  // rather than +24 h arithmetic: a month can contain a DST transition, and a naive step
  // stalls on the 25-hour day (see zone-time).
  const first = addZoneDays(anchor, 1 - d);

  // JS getUTCDay is Sunday-0; Swedish calendars are Monday-first, so rotate.
  const firstWeekday = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
  let cursor = first;
  let last = first;
  while (zoneParts(cursor).mo === mo) {
    cells.push(cursor);
    last = cursor;
    cursor = addZoneDays(cursor, 1);
  }
  while (cells.length < GRID_CELLS) cells.push(null);
  return { title: `${SWEDISH_MONTHS[mo - 1]} ${y}`, first, last, cells };
}

/** The 1st of the next month, or the last day of the previous one — i.e. a day that is
 *  certainly IN the adjacent month.
 *
 *  Not "anchor ± 28 days", which was the first thing written here and is wrong: from the
 *  1st of a 31-day month, +28 lands on the 29th of the SAME month and the pager does
 *  nothing. Stepping off the end of the current month is the only definition that holds
 *  for every month length, February and leap years included. */
export function adjacentMonth(grid: MonthGrid, delta: 1 | -1): number {
  return delta === 1 ? addZoneDays(grid.last, 1) : addZoneDays(grid.first, -1);
}

/**
 * The Hijri month(s) a Gregorian month overlaps — "Rabīʿ al-awwal – Rabīʿ al-ākhir 1448".
 *
 * A Gregorian month always straddles two Hijri months (a lunar month is ~29.5 days) and at
 * most three; naming the first and last is the honest short form. The year is written once
 * when both ends share it and on each end when the span crosses Muḥarram. Each day goes
 * through zonePrayerDate, the same civil-noon Date the dock's own Hijri line is built from,
 * so the two can never disagree about which day is which.
 */
export function hijriSpan(grid: MonthGrid, offsetDays = 0): string {
  const a = toHijri(zonePrayerDate(grid.first), offsetDays);
  const b = toHijri(zonePrayerDate(grid.last), offsetDays);
  const name = (m: number) => HIJRI_MONTHS[m - 1];
  if (a.year === b.year && a.month === b.month) return `${name(a.month)} ${a.year}`;
  if (a.year === b.year) return `${name(a.month)} – ${name(b.month)} ${a.year}`;
  return `${name(a.month)} ${a.year} – ${name(b.month)} ${b.year}`;
}

/** "september 2026" → "September 2026": the grid title is a heading, so it opens with a
 *  capital, the way the dock's "Fredag 18 september" does. Spoken labels keep the bare
 *  lower-case month, because there it sits mid-sentence ("3 september 2026, i morgon"). */
const heading = (title: string): string => title.charAt(0).toUpperCase() + title.slice(1);

export function DayPicker({ dayStart, todayStart, hijriOffset = 0, onPick, onClose }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(c), [c]);
  const ink = useMoonInk();
  const reduceMotion = useReducedMotion();
  // The month being BROWSED, which drifts away from the selected day as the user pages.
  // Seeded from the viewed day so the sheet opens showing where they already are.
  const [anchor, setAnchor] = useState(dayStart);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  const minDay = addZoneDays(todayStart, -MAX_DAY_OFFSET);
  const maxDay = addZoneDays(todayStart, MAX_DAY_OFFSET);

  // Paging stops exactly where the range does: the adjacent month is reachable when the
  // day immediately outside this one still falls inside the rails.
  const canPageBack = adjacentMonth(grid, -1) >= minDay;
  const canPageForward = adjacentMonth(grid, 1) <= maxDay;
  // Pages off the PENDING anchor, not the rendered `grid`. Both look equivalent and are
  // not: re-rendering the sheet (42 cells) over the open dock takes long enough that taps
  // arriving during it are delivered together the moment JS frees, React batches them into
  // one render, and every call in the batch would read the same committed `grid` and ask
  // for the same neighbouring month. Twelve taps on "Nästa månad" paged TWO months
  // (measured on an emulator, 2026-08-25) — and paging a year ahead to find Ramadan is
  // exactly what this control is for. The updater stays pure: monthGrid is a plain
  // computation over the anchor, and the rails are re-checked inside it so a burst stops
  // where the range does instead of running past it.
  const monthStep = (delta: 1 | -1): void => {
    hapticSelection();
    setAnchor((prev) => {
      const next = adjacentMonth(monthGrid(prev), delta);
      return next < minDay || next > maxDay ? prev : next;
    });
  };

  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent animationType="none">
      <View
        style={[
          styles.modalRoot,
          { paddingBottom: insets.bottom + space.sm, paddingTop: insets.top + space.sm },
        ]}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessible={false}
          testID="calendar-backdrop"
        />
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
          exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
          style={[styles.wrap, { maxHeight: height - insets.top - insets.bottom - 2 * space.sm }]}
          accessibilityViewIsModal
        >
          <GlassSurface style={styles.sheet} borderRadius={radius.xl} tint={c.surface}>
            <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
              <View style={styles.head}>
                <View style={styles.titleBlock}>
                  <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
                    {heading(grid.title)}
                  </Text>
                  <Text style={styles.hijri} numberOfLines={2}>
                    {hijriSpan(grid, hijriOffset)}
                  </Text>
                </View>
                <StepperPill
                  onStep={monthStep}
                  canStepBack={canPageBack}
                  canStepForward={canPageForward}
                  backLabel="Föregående månad"
                  forwardLabel="Nästa månad"
                />
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Stäng kalendern"
                  // The disc is 36; the slop takes it to a 44 target on every side but the
                  // pill's, which is the neighbour it must not steal from.
                  hitSlop={{ top: 4, bottom: 4, right: 4 }}
                  style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                >
                  <Icon name="close" size={20} color={c.inkMuted} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={styles.weekday}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {grid.cells.map((day, i) => {
                  if (day == null) {
                    // Blanks: before the 1st, and after the last out to the fixed six rows.
                    // Keyed by index because they carry no identity of their own; they are pure
                    // layout — an empty cell holds the grid's height, nothing more.
                    // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no id
                    return <View key={`pad-${i}`} style={styles.cell} />;
                  }
                  const selected = day === dayStart;
                  const isToday = day === todayStart;
                  const outOfRange = day < minDay || day > maxDay;
                  const label = zoneParts(day).d;
                  const phase = moonPhaseAt(new Date(day + 12 * 60 * 60 * 1000));
                  return (
                    <Pressable
                      key={day}
                      disabled={outOfRange}
                      onPress={() => {
                        hapticLight();
                        onPick(day);
                      }}
                      accessibilityRole="button"
                      // The spoken label carries the relative day too, so a screen-reader user
                      // hears "14 — om 12 dagar" rather than a bare number with no anchor.
                      accessibilityLabel={`${label} ${grid.title}, ${relativeDayLabel(
                        Math.round((day - todayStart) / 86_400_000),
                      )}`}
                      accessibilityState={{ selected, disabled: outOfRange }}
                      // Distinct cells: expanding hit slop would select neighboring days.
                      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                    >
                      <View style={[styles.dayBubble, selected && styles.daySelected]}>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.6}
                          style={[
                            styles.dayText,
                            (isToday || selected) && styles.dayMarked,
                            outOfRange && styles.off,
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                      <MoonDisc
                        size={MOON_PX}
                        illumination={phase.illumination}
                        tilt={almanacTilt(phase.phaseAngle < 180)}
                        {...ink}
                        {...(outOfRange ? { lit: c.inkFaint, dark: c.paperSunken, rim: c.inkFaint } : {})}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Bottom safe-area spacing belongs to the modal, independent of the dock height.
    modalRoot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.md },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.32)' },
    wrap: { width: '100%', maxWidth: 520, alignSelf: 'center' },
    sheet: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    sheetContent: {
      padding: space.md,
      gap: space.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
    titleBlock: { flex: 1, minWidth: 0 },
    // The same pair the dock's date crown uses: 18/700 Swedish, 14 muted Hijri under it.
    title: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 0.1, color: c.ink },
    hijri: { fontSize: 14, lineHeight: 20, color: c.inkMuted, marginTop: 1 },
    close: {
      width: 36,
      height: 36,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.paperSunken,
    },
    weekRow: { flexDirection: 'row' },
    // Seven equal columns; each cell is 1/7 of the row so the grid aligns with the header
    // whatever the screen width.
    weekday: { ...type.caption, color: c.inkFaint, width: `${100 / 7}%`, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    // More air BELOW each moon than between a numeral and its own moon, so a moon reads as
    // belonging to the date above it rather than to the one below — with even spacing the
    // grid was an alternating stripe of numbers and discs that paired either way.
    cell: { width: `${100 / 7}%`, alignItems: 'center', paddingTop: 2, paddingBottom: 8, paddingHorizontal: 2 },
    // The circle is sized to the NUMERAL, not the column: at the column's full width (up to
    // 44 dp) the viewed day's disc was the largest object on the sheet, twice the height of
    // the moon under it. 32 hugs a two-digit 15 pt date with the same air a platform date
    // picker gives it, and fits the narrowest column (≈35 dp on a 320 pt phone).
    //
    // Fixed width AND height — not width: '100%' + maxWidth + aspectRatio. Yoga resolves the
    // aspect ratio from the UNCLAMPED percentage width, so that recipe drew a 32 × 46 capsule.
    dayBubble: {
      width: 32,
      height: 32,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Selection is a TINT, not a fill — the soft accent ground the app's chips wear, under an
    // accent numeral. The platform date pickers mark the chosen day the same way.
    daySelected: { backgroundColor: c.accentSoft },
    dayText: { ...type.callout, width: '100%', textAlign: 'center', color: c.ink, fontVariant: ['tabular-nums'] },
    // Today and the viewed day both set the numeral in bold accent; only the viewed day adds
    // the tint. So today reads as "marked" wherever you have browsed to, and the tinted one is
    // "where the dock is" — two states, one filled shape.
    dayMarked: { color: c.accent, fontWeight: '700' },
    off: { opacity: 0.3 },
    pressed: { opacity: 0.6 },
  });
}
