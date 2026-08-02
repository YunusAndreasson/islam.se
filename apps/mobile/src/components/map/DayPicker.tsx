// The month grid behind the dock's date header — the second half of day navigation.
//
// The chevrons either side of the scrubber are for NEARBY days: one tap each. This is for
// "when is Fajr on the 14th", where stepping would be twelve taps. Together they cover
// both distances, which is why the plan called for both rather than either alone.
//
// It is a SHEET INSIDE THE DOCK, absolutely positioned over the card, not a route. Two
// reasons. Geometry: absolute positioning costs zero dock height, and the dock has ~4 dp
// of spare vertical space collapsed and none expanded. Ownership: the clock lives inside
// bonetider, so a separate route would need a shared store to reach it — a lot of new
// machinery to move one number.
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { hapticLight, hapticSelection } from '../../lib/haptics';
import { relativeDayLabel } from '../../lib/relative-day';
import { MAX_DAY_OFFSET } from '../../lib/solar/useSolarClock';
import { addStockholmDays, stockholmParts } from '../../lib/stockholm-time';
import { motion, type Palette, radius, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';
import { GlassSurface } from '../ui/GlassSurface';

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

/** Which Stockholm calendar month a day belongs to, and where in the grid it starts.
 *  Built from stockholmParts rather than a local Date so a phone in another timezone
 *  cannot render a month offset by one day — the same pin the rest of the app uses. */
export interface MonthGrid {
  title: string;
  /** Stockholm midnight of the 1st. */
  first: number;
  /** Stockholm midnight of the last day. */
  last: number;
  /** Leading nulls pad the row so the 1st lands under its weekday column. */
  cells: (number | null)[];
}

export function monthGrid(anchor: number): MonthGrid {
  const { y, mo, d } = stockholmParts(anchor);
  // Step back to the 1st, then forward one day at a time. addStockholmDays throughout
  // rather than +24 h arithmetic: a month can contain a DST transition, and a naive step
  // stalls on the 25-hour day (see stockholm-time).
  const first = addStockholmDays(anchor, 1 - d);

  // JS getUTCDay is Sunday-0; Swedish calendars are Monday-first, so rotate.
  const firstWeekday = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;

  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
  let cursor = first;
  let last = first;
  while (stockholmParts(cursor).mo === mo) {
    cells.push(cursor);
    last = cursor;
    cursor = addStockholmDays(cursor, 1);
  }
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
  return delta === 1 ? addStockholmDays(grid.last, 1) : addStockholmDays(grid.first, -1);
}

export function DayPicker({ dayStart, todayStart, onPick, onClose }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  // The month being BROWSED, which drifts away from the selected day as the user pages.
  // Seeded from the viewed day so the sheet opens showing where they already are.
  const [anchor, setAnchor] = useState(dayStart);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  const minDay = addStockholmDays(todayStart, -MAX_DAY_OFFSET);
  const maxDay = addStockholmDays(todayStart, MAX_DAY_OFFSET);

  // Paging stops exactly where the range does: the adjacent month is reachable when the
  // day immediately outside this one still falls inside the rails.
  const canPageBack = adjacentMonth(grid, -1) >= minDay;
  const canPageForward = adjacentMonth(grid, 1) <= maxDay;
  const monthStep = (delta: 1 | -1): void => {
    hapticSelection();
    setAnchor(adjacentMonth(grid, delta));
  };

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(motion.fast)}
      exiting={reduceMotion ? undefined : FadeOut.duration(motion.fast)}
      style={styles.wrap}
      accessibilityViewIsModal
    >
      <GlassSurface style={styles.sheet} borderRadius={radius.xl} tint={c.cardGlass}>
        <View style={styles.head}>
          <Pressable
            onPress={() => monthStep(-1)}
            disabled={!canPageBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Föregående månad"
            accessibilityState={{ disabled: !canPageBack }}
            style={({ pressed }) => [styles.pager, !canPageBack && styles.off, pressed && styles.pressed]}
          >
            <MaterialIcons name="chevron-left" size={22} color={c.accent} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {grid.title}
          </Text>
          <Pressable
            onPress={() => monthStep(1)}
            disabled={!canPageForward}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Nästa månad"
            accessibilityState={{ disabled: !canPageForward }}
            style={({ pressed }) => [styles.pager, !canPageForward && styles.off, pressed && styles.pressed]}
          >
            <MaterialIcons name="chevron-right" size={22} color={c.accent} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Stäng kalendern"
            style={({ pressed }) => [styles.pager, pressed && styles.pressed]}
          >
            <MaterialIcons name="close" size={20} color={c.inkMuted} />
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
              // Leading blanks before the 1st. Keyed by index because they carry no
              // identity of their own; they are pure layout.
              // biome-ignore lint/suspicious/noArrayIndexKey: padding cells have no id
              return <View key={`pad-${i}`} style={styles.cell} />;
            }
            const selected = day === dayStart;
            const isToday = day === todayStart;
            const outOfRange = day < minDay || day > maxDay;
            const label = stockholmParts(day).d;
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
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
              >
                <View style={[styles.dayBubble, selected && styles.daySelected]}>
                  <Text
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
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Absolute over the dock card, anchored to its bottom so it grows upward the way the
    // dock itself does — and so it costs the dock no height at all.
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    sheet: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: space.lg,
      gap: space.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    pager: { width: 28, alignItems: 'center', justifyContent: 'center', minHeight: 28 },
    title: { ...type.bodyStrong, color: c.ink, flex: 1, textAlign: 'center' },
    weekRow: { flexDirection: 'row' },
    // Seven equal columns; each cell is 1/7 of the row so the grid aligns with the header
    // whatever the screen width.
    weekday: { ...type.caption, color: c.inkFaint, width: `${100 / 7}%`, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
    // 34 keeps a 7-column grid comfortable on a 320 dp screen while staying a real target
    // once the row padding is counted.
    dayBubble: {
      width: 34,
      height: 34,
      borderRadius: radius.round,
      alignItems: 'center',
      justifyContent: 'center',
    },
    daySelected: { backgroundColor: c.accent },
    dayText: { ...type.caption, color: c.ink, fontVariant: ['tabular-nums'] },
    // Today is marked by WEIGHT and accent ink, not a second filled bubble — one filled
    // bubble on the grid means "the day you are looking at", and two fills would compete.
    dayToday: { color: c.accent, fontWeight: '700' },
    daySelectedText: { color: c.onAccent, fontWeight: '700' },
    off: { opacity: 0.3 },
    pressed: { opacity: 0.6 },
  });
}
