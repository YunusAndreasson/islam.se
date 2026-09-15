// The month grid behind the dock's date header — the second half of day navigation.
//
// The chevrons either side of the scrubber are for NEARBY days: one tap each. This is for
// "when is Fajr on the 14th", where stepping would be twelve taps. Together they cover
// both distances, which is why the plan called for both rather than either alone.
//
// A modal sheet owns Back, outside-tap dismissal and accessibility focus while open.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '@/lib/haptics';
import { relativeDayLabel } from '@/lib/relative-day';
import { MAX_DAY_OFFSET } from '@/lib/solar/useSolarClock';
import { addZoneDays, zoneParts } from '@/lib/zone-time';
import { motion, type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { moonPhaseAt } from '@/lib/moon/ephemeris';

// Monday-first, as Swedish calendars are. Single letters would be ambiguous (måndag and
// onsdag both start with m/o pairs that collide), so two letters — the standard Swedish
// abbreviations without the trailing period a calendar header does not need.
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];
const MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

interface Props {
  /** Stockholm midnight of the day currently on screen. */
  dayStart: number;
  /** Stockholm midnight of the real today — drives the "i dag" ring and the rails. */
  todayStart: number;
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
  return { title: `${MONTHS[mo - 1]} ${y}`, first, last, cells };
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

export function DayPicker({ dayStart, todayStart, onPick, onClose }: Props) {
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
                <Text style={[styles.title, { textAlign: 'left' }]} accessibilityRole="header">Välj dag</Text>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Stäng kalendern"
                  style={({ pressed }) => [styles.pager, pressed && styles.pressed]}>
                  <Icon name="close" size={22} color={c.inkMuted} />
                </Pressable>
              </View>
              <View style={styles.head}>
                <Pressable
                  onPress={() => monthStep(-1)}
                  disabled={!canPageBack}
                  accessibilityRole="button"
                  accessibilityLabel="Föregående månad"
                  accessibilityState={{ disabled: !canPageBack }}
                  style={({ pressed }) => [styles.pager, !canPageBack && styles.off, pressed && styles.pressed]}
                >
                  <Icon name="chevronLeft" size={22} color={c.accent} />
                </Pressable>
                <Text style={styles.title} numberOfLines={2}>
                  {grid.title}
                </Text>
                <Pressable
                  onPress={() => monthStep(1)}
                  disabled={!canPageForward}
                  accessibilityRole="button"
                  accessibilityLabel="Nästa månad"
                  accessibilityState={{ disabled: !canPageForward }}
                  style={({ pressed }) => [styles.pager, !canPageForward && styles.off, pressed && styles.pressed]}
                >
                  <Icon name="chevronRight" size={22} color={c.accent} />
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
                            isToday && styles.dayToday,
                            selected && styles.daySelectedText,
                            outOfRange && styles.off,
                          ]}
                        >
                          {label}
                        </Text>
                      </View>
                      <MoonDisc
                        size={12}
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
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    pager: { width: 48, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    title: { ...type.bodyStrong, color: c.ink, flex: 1, textAlign: 'center' },
    weekRow: { flexDirection: 'row' },
    // Seven equal columns; each cell is 1/7 of the row so the grid aligns with the header
    // whatever the screen width.
    weekday: { ...type.caption, color: c.inkFaint, width: `${100 / 7}%`, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4, paddingHorizontal: 3, gap: 2, minHeight: 56 },
    // Fit the selection circle and its text inside the available calendar column.
    dayBubble: {
      width: '100%',
      maxWidth: 44,
      aspectRatio: 1,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    daySelected: { backgroundColor: c.accent },
    dayText: { ...type.caption, width: '100%', textAlign: 'center', color: c.ink, fontVariant: ['tabular-nums'] },
    // Today is marked by WEIGHT and accent ink, not a second filled bubble — one filled
    // bubble on the grid means "the day you are looking at", and two fills would compete.
    dayToday: { color: c.accent, fontWeight: '700' },
    daySelectedText: { color: c.onAccent, fontWeight: '700' },
    off: { opacity: 0.3 },
    pressed: { opacity: 0.6 },
  });
}
