// The month grid behind the dock's date header — the second half of day navigation.
//
// The day stepper in the dock's date crown is for NEARBY days: one tap each. This is for
// "when is Fajr on the 14th", where stepping would be twelve taps. Together they cover
// both distances, which is why the plan called for both rather than either alone.
//
// Laid out the way the crown is: the Swedish month is the title, on the sheet's leading
// edge, with the Hijri months it spans quietly under it; the pager is the same stepper pill,
// at the trailing edge. Today has an outline; the selected date has a filled circle.
// Moon phases remain equally legible for past and future dates; only past numerals are muted.
//
// A modal sheet owns Back, outside-tap dismissal and accessibility focus while open.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSelection } from '@/lib/haptics';
import { HIJRI_MONTHS, SWEDISH_MONTHS, toHijri } from '@/lib/hijri';
import { relativeDayLabel } from '@/lib/relative-day';
import { MAX_DAY_OFFSET } from '@/lib/solar/useSolarClock';
import { addZoneDays, zonePrayerDate, zoneParts } from '@/lib/zone-time';
import { motion, type Palette, radius, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { useCompactLayout } from '@/components/settings/useCompactLayout';
import { Icon } from '@/components/ui/Icon';
import { StepperPill } from '@/components/ui/StepperPill';
import { almanacTilt, MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { moonPhaseAt } from '@/lib/moon/ephemeris';

// Monday-first, as Swedish calendars are. Single letters would be ambiguous (måndag and
// onsdag both start with m/o pairs that collide), so two letters — the standard Swedish
// abbreviations without the trailing period a calendar header does not need.
const WEEKDAYS = ['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'];
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

/**
 * The month sheet over the map. Mounted while `open`, and for one fade after it closes: the
 * Modal has to outlive its content, or the sheet's exit animation has nothing to play in.
 * The dock used to unmount the whole picker on close, so the sheet and its backdrop vanished
 * in one frame while the fade-out written for them never ran. Closed, this renders nothing
 * and builds no month.
 */
export function DayPicker({ open = true, onClose, ...rest }: Props & { open?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  const [present, setPresent] = useState(open);
  // Opening is adopted in render (no frame of nothing), and so is closing when there is no
  // fade to wait for; otherwise closing waits out the fade below.
  if (open && !present) setPresent(true);
  if (!open && present && reduceMotion) setPresent(false);
  useEffect(() => {
    if (open || !present) return;
    const timer = setTimeout(() => setPresent(false), motion.fast);
    return () => clearTimeout(timer);
  }, [open, present, reduceMotion]);
  if (!present) return null;
  return (
    // Back during the fade-out must not close it a second time.
    <Modal transparent visible onRequestClose={open ? onClose : undefined} statusBarTranslucent animationType="none">
      <View
        style={[
          styles.modalRoot,
          { paddingBottom: insets.bottom + space.sm, paddingTop: insets.top + space.sm },
        ]}
      >
        {open && <DayPickerSheet {...rest} onClose={onClose} />}
      </View>
    </Modal>
  );
}

function DayPickerSheet({ dayStart, todayStart, hijriOffset = 0, onPick, onClose }: Props) {
  const c = useColors();
  // The sheet opens out of the dock and sits in its slot over the map, so its ground is the
  // dock's — the sky-tinted surface every card on the map shares (theme/skyChrome) — not
  // the palette's noon card. Off the map (the Moon sheet's own picker, tests) there is no
  // provider and this is exactly `c.surface`.
  const sky = useSkyGlass();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = useCompactLayout();
  const ink = useMoonInk();
  const styles = useMemo(() => makeStyles(c), [c]);
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
    <>
      {/* The dim fades with the sheet, both ways, instead of cutting in and out under it. */}
      <Animated.View
        style={styles.backdrop}
        entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
        exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          testID="calendar-backdrop"
        />
      </Animated.View>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
        exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
        style={[styles.wrap, { maxHeight: height - insets.top - insets.bottom - 2 * space.sm }]}
        accessibilityViewIsModal
      >
        <GlassSurface style={styles.sheet} borderRadius={radius.xl} tint={sky.surface}>
          <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
            <View style={[styles.head, compact && styles.headStacked]}>
              <View style={[styles.titleBlock, compact && styles.titleBlockStacked]}>
                <Text style={styles.title} accessibilityRole="header">
                  {heading(grid.title)}
                </Text>
                <Text style={styles.hijri}>
                  {hijriSpan(grid, hijriOffset)}
                </Text>
              </View>
              <View style={styles.controls}>
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
                      // Picking one day from the grid is a selection (class 3), like
                      // PlacePicker's city — the tick lands before the sheet closes.
                      hapticSelection();
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
                        style={[
                          styles.dayText,
                          day < todayStart && styles.dayPast,
                          isToday && styles.dayMarked,
                          selected && styles.daySelectedText,
                          outOfRange && styles.off,
                        ]}
                      >
                        {label}
                      </Text>
                      {isToday && !selected ? <View pointerEvents="none" style={styles.dayToday} /> : null}
                    </View>
                    <MoonDisc
                      staticIcon
                      size={MOON_PX}
                      illumination={phase.illumination}
                      tilt={almanacTilt(phase.phaseAngle < 180)}
                      {...ink}
                    />
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </GlassSurface>
      </Animated.View>
    </>
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
    headStacked: { flexDirection: 'column', alignItems: 'stretch' },
    titleBlock: { flex: 1, minWidth: 0 },
    titleBlockStacked: { flex: 0 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.sm },
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
    // Keep the moon close to its date, with more space between calendar rows.
    cell: { width: `${100 / 7}%`, alignItems: 'center', paddingTop: 2, paddingBottom: 8, paddingHorizontal: 2 },
    dayBubble: {
      width: 32,
      height: 32,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayToday: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.round, borderWidth: 1, borderColor: c.accent },
    daySelected: { backgroundColor: c.accent },
    dayPast: { color: c.inkMuted },
    daySelectedText: { color: c.onAccent, fontWeight: '700' },
    // Let dayBubble center the natural text height. A full-height Text stays top-aligned
    // on iOS, where Android's textAlignVertical has no effect.
    dayText: { fontSize: type.callout.fontSize, fontWeight: type.callout.fontWeight, width: '100%', includeFontPadding: false, textAlign: 'center', color: c.ink, fontVariant: ['tabular-nums'] },
    dayMarked: { color: c.accent, fontWeight: '700' },
    off: { opacity: 0.3 },
    pressed: { opacity: 0.6 },
  });
}
