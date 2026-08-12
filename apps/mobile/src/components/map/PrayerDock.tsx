// The single bottom surface — it replaces both the old top StatusCard and the
// bottom TimeScrubber. One glass dock, pinned to the bottom, that grows upward.
//
// Gestalt proximity / common region: everything about *time* now lives together —
// the day scrubber, what prayer is next, and (when expanded) the full schedule.
// Progressive disclosure (Norman): collapsed it shows what's next + where you are
// + the scrubber, keeping the map the hero; a grab handle signifies it opens, and
// a drag/tap reveals the full list and transport controls. The scrubber stays put
// at the bottom in both states so the control you reach for never moves.
//
// Feel: the scrubber runs on the UI thread (gesture-handler + a shared value), so
// the thumb tracks the finger at 60fps while the heavier map recompute is throttled
// on JS. Crossing a prayer ticks a selection haptic; tapping a row in the schedule
// eases the thumb to that moment (a deliberate travel, not a teleport) so the
// time-travel reads as something you did.
//
// Theme: the dock is CHROME, so it follows the phone's OS light/dark setting via
// useColors() — Apple Maps-style. The basemap is also OS-themed (see nordicStyle.ts:
// NORDIC_LIGHT / NORDIC_DARK), so the dock and the map share temperature: light
// glass over light parchment, dark glass over deep navy. The earlier sun-driven dock
// flip was retired here — atmosphere comes from the basemap + wash, not from chrome
// flipping under the user's hands. The wash and prayer-line colours are still
// sun-driven (the map IS a live sky), but the dock stays anchored to one OS theme.
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ColorSchemeName, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { hapticLight, hapticSelection } from '@/lib/haptics';
import { formatGregorian, formatHijri } from '@/lib/hijri';
import { relativeDayLabel } from '@/lib/relative-day';
import {
  formatTime,
  PRAYER_ICONS,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
} from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { stockholmPrayerDate } from '@/lib/stockholm-time';
import { prayerColorFor } from '@/lib/solar/palette';
import { MAX_DAY_OFFSET, type SolarClock } from '@/lib/solar/useSolarClock';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { DayPicker } from './DayPicker';

const DAY_MS = 86_400_000;
/** Hours the ruler under the scrubber labels. Positioned by their true fraction of the
 *  viewed day (see tickFractions) rather than spaced evenly, so the ruler agrees with the
 *  prayer marks and thumb — which have always been placed off the REAL 23/24/25 h day. */
const HOUR_TICKS = [0, 6, 12, 18, 24];
/** Height of the band the track/thumb live in. The day chevrons take the SAME height so
 *  the row centres them on the track's centre line rather than on the whole column
 *  (track band + hour ruler) — that 13 px ruler underneath is what used to push both
 *  chevrons ~6 px below the line they flank. Track geometry is anchored to this band's
 *  BOTTOM (see trackBase/thumb), so changing it moves the band, not the line inside it. */
const TRACK_BAND_H = 30;
/** Height of the hour ruler under the track. Non-interactive labels — the pan target
 *  deliberately spans it (band + ruler ≈ 43 px) so the scrubber clears the 44 dp touch
 *  minimum without adding a pixel to the dock. See the GestureDetector below. */
const RULER_H = 13;
// The app's one canonical snap spring (tokens.motion.spring), aliased locally so the
// worklet call sites stay terse.
const SPRING = motion.spring;

// Dock heights (excluding the bottom safe-area inset, which the screen adds). The
// map reads these so it can frame Sweden *above* the dock in both states.
// The dock is a floating card: its bottom edge sits this far above the system
// gesture bar so it reads as a calm, separate surface — not welded to the screen
// edge (which feels stressful). The float + safe-area inset are added by the
// card's position, not its height.
export const DOCK_FLOAT = 6;

// Card heights (the rendered card itself, excluding the float + inset below it).
// Collapsed stays tight: a two-tier hero (prayer + countdown, then a quiet
// time · place line) over the scrubber — so the map keeps most of the screen.
// Kept as dense as the content allows (trimmed handle clearance + timeline height)
// so the card's footprint over southern Sweden is minimal.
export const DOCK_COLLAPSED_BASE = 136;
// Expanded carries a date header (Gregorian + Hijri) above the schedule, so it's a
// touch taller than the bare list needed. (No transport row — the day slider is the
// only time control, so there's nothing to play or explain away.)
// Because the content is bottom-pinned (flex-end), the date header sits at a fixed
// distance from the dock bottom; the grab handle rides the dock's TOP edge. So this
// height also sets the clearance between the handle and the date — kept generous
// enough that the date never crowds the handle (handle-to-date gap ≈ EXPANDED − Hc − 44).
const DOCK_EXPANDED_BASE = 396;

export interface NextPrayer {
  key: PrayerKey;
  at: number;
  /** True when this prayer belongs to the day AFTER the one being viewed — so it is not
   *  in the schedule list above and needs naming in the hero. Called `nextDay` rather
   *  than `tomorrow` because "tomorrow" is actively wrong once the user can view other
   *  days: past Ishaʾ on a day three ahead, this is the day FOUR ahead. */
  nextDay: boolean;
}

export interface DayMark {
  key: PrayerKey;
  /** 0..1 position within the day. */
  fraction: number;
}

interface Props {
  clock: SolarClock;
  /** The user's own prayer times for today (adhan PrayerTimes — Date per prayer). */
  times: Record<PrayerKey, Date>;
  marks: DayMark[];
  next: NextPrayer | null;
  locationLabel: string;
  /** True when `locationLabel` is the Stockholm FALLBACK rather than a place the user
   *  actually has — no GPS fix and no manual city (LocationSource 'default'). The dock
   *  then offers "Välj plats" instead of naming a city the user never chose, because a
   *  confident "Stockholm" on a phone in Malmö is a lie the map has no other way to
   *  correct. See bonetider's locationIsFallback. */
  locationIsFallback?: boolean;
  settings: PrayerSettings;
  /** Drives the launch schedule reveal: flip it true to spring the dock open (the
   *  rows stagger in off `progress` exactly as they do for a drag), false to spring it
   *  shut. The host owns the timing — see bonetider's reveal sequence. A user gesture
   *  taken mid-reveal simply overwrites `height`, so the finger always wins. */
  revealSchedule?: boolean;
  /** Optional host notification for analytics or layout hooks. The map does not refit
      on expansion; the dock opens over the current slice. */
  onExpandedChange?: (expanded: boolean, expandedHeight: number) => void;
}

// The glanceable answer: how long until the next prayer, without the "om" prefix
// (rendered separately so the duration can carry the visual weight). Each unit hugs
// its number with a narrow no-break space (proximity: "t" binds to the hours, "min"
// to the minutes), while a normal space separates the two groups — so "3 t 22 min"
// never reads as an ambiguous run of equal gaps.
// Structured so the caller can render the digits big and brass and the units
// small and snug — the previous "3 t 22 min" string had digits and units at
// the same weight, so the gaps between them all looked equal and the text read
// as four separate beats rather than two number-with-unit groups.
type Countdown = { kind: 'now' } | { kind: 'mins'; m: number } | { kind: 'hrs'; h: number; m: number };
function countdownParts(ms: number): Countdown {
  if (ms <= 0) return { kind: 'now' };
  const mins = Math.round(ms / 60_000);
  // Under 30 s the rounded count is 0, and "om 0 min" reads as broken — the honest
  // rounding of "less than half a minute away" is the same "nu" the zero case shows.
  if (mins === 0) return { kind: 'now' };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return { kind: 'mins', m };
  return { kind: 'hrs', h, m };
}

export function PrayerDock({
  clock,
  times,
  marks,
  next,
  locationLabel,
  locationIsFallback = false,
  settings,
  revealSchedule = false,
  onExpandedChange,
}: Props) {
  const insets = useSafeAreaInsets();
  // The dock is chrome, so it follows the OS theme: light glass over the parchment
  // basemap (light OS), dark glass over the navy basemap (dark OS) — see Apple
  // Maps. The wash and prayer-line colours are still sun-driven (they're map
  // canvas), but the dock stays anchored to one OS theme.
  const c = useColors();
  const scheme = useActiveScheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  // Card heights are the card itself; the float + safe-area inset live in the
  // position (bottom), so the card sits clear above the gesture bar.
  const COLLAPSED = DOCK_COLLAPSED_BASE;
  const EXPANDED = DOCK_EXPANDED_BASE;
  const MID = (COLLAPSED + EXPANDED) / 2;

  const height = useSharedValue(COLLAPSED);
  const startHeight = useSharedValue(COLLAPSED);
  const [expanded, setExpanded] = useState(false);
  // The calendar sheet. Local to the dock: it writes through clock.goToDay and holds no
  // state of its own beyond which month is being browsed.
  const [pickingDay, setPickingDay] = useState(false);

  // One open-fraction (0 collapsed → 1 expanded) that EVERY reveal reads, so the
  // whole dock unfolds off a single continuous value instead of three independent
  // recomputations swapping on a JS boolean. The spring can overshoot past EXPANDED,
  // so every interpolate() below clamps. (Reanimated's canonical bottom-sheet pattern.)
  const progress = useDerivedValue(() => (height.value - COLLAPSED) / (EXPANDED - COLLAPSED));

  // State change on the JS thread (from gesture worklets via scheduleOnRN): flip the flag,
  // tap a light haptic on a real open/close, and notify the host if it cares.
  const applyExpanded = useCallback(
    (open: boolean) => {
      if (open !== expanded) hapticLight();
      setExpanded(open);
      onExpandedChange?.(open, EXPANDED);
    },
    [expanded, onExpandedChange, EXPANDED],
  );

  // A drag that grows/shrinks the dock and snaps open/closed on release. Built by a
  // factory so the handle and the hero each get their OWN instance (gesture-handler
  // doesn't support sharing one gesture object across two GestureDetectors).
  // NOT memoised on purpose: the worklets mutate shared values (height/startHeight),
  // which react-hooks/immutability forbids inside useMemo/useCallback. Enabling React
  // Compiler is the right way to memoise these (it understands worklet mutation);
  // hand-memoising here would mean nine eslint-disables. Rebuild cost is three plain
  // objects per render.
  const makeTogglePan = () =>
    Gesture.Pan()
      .onStart(() => {
        startHeight.value = height.value;
      })
      .onUpdate((e) => {
        const nextHeight = startHeight.value - e.translationY;
        height.value = Math.min(EXPANDED, Math.max(COLLAPSED, nextHeight));
      })
      .onEnd((e) => {
        const open = e.velocityY < -350 ? true : e.velocityY > 350 ? false : height.value > MID;
        height.value = withSpring(open ? EXPANDED : COLLAPSED, SPRING);
        scheduleOnRN(applyExpanded, open);
      });

  const tap = Gesture.Tap().onEnd(() => {
    const open = height.value < MID;
    height.value = withSpring(open ? EXPANDED : COLLAPSED, SPRING);
    scheduleOnRN(applyExpanded, open);
  });

  // The launch schedule reveal: the host flips `revealSchedule` and the dock springs
  // to match, so the day's times stagger in off the SAME `progress` a drag drives — no
  // second animation to keep in sync with the first. Deliberately silent: hapticLight is
  // for a control snapping under the user's own finger (see lib/haptics), and this opens
  // on its own. The user is still free to grab the dock mid-reveal — the gesture worklets
  // assign `height` directly, overwriting this spring.
  const revealArmed = useRef(false);
  useEffect(() => {
    // Skip the mount pass: `revealSchedule` starts false and the dock is already collapsed,
    // so acting here would only fire a spurious onExpandedChange(false) at startup.
    if (!revealArmed.current) {
      revealArmed.current = true;
      if (!revealSchedule) return;
    }
    height.value = withSpring(revealSchedule ? EXPANDED : COLLAPSED, SPRING);
    setExpanded(revealSchedule);
    onExpandedChange?.(revealSchedule, EXPANDED);
    // `height` is a shared value (stable identity); listing it would re-run this on every
    // render. COLLAPSED/EXPANDED are module constants read through local aliases, and
    // onExpandedChange is the host's callback — re-running on its identity would reopen
    // the dock on an unrelated parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSchedule]);

  // Handle: drag OR tap toggles. Hero: drag-only — a Pan needs movement to activate,
  // so a tap on the hero's "Nu" chip (preview mode) still reaches its Pressable
  // instead of being stolen by a toggle-tap.
  const gesture = Gesture.Exclusive(makeTogglePan(), tap);
  const heroGesture = makeTogglePan();

  const heightStyle = useAnimatedStyle(() => ({ height: height.value }));
  // The date header CROWNS the reveal — it sits at the very top of the content, so
  // with the flex-end clip growing upward it's the last thing the edge uncovers. It
  // fades in over the final stretch (0.70→1), settling as the dock finishes opening.
  const dateReveal = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.7, 1], [8, 0], Extrapolation.CLAMP) }],
  }));

  // Exactly ONE hero layer is mounted at a time — Android kept the opacity-zero layer's
  // text in its accessibility tree, so an always-mounted cross-fade announced the place
  // and countdown twice. The consequence is that a layer mounts at the FAR end of
  // `progress`, where the old cross-fade windows (0→0.3 out, 0.18→0.55 in) both evaluate
  // to opacity 0: the card sat blank for a beat on every open while the height spring ran.
  // A mounted layer therefore fades in from its OWN mount, so whatever exists is visible.
  const heroFade = useSharedValue(1);
  useEffect(() => {
    heroFade.value = 0;
    heroFade.value = withTiming(1, { duration: motion.fast });
  }, [expanded, heroFade]);
  const heroLayerStyle = useAnimatedStyle(() => ({
    opacity: heroFade.value,
    transform: [{ translateY: interpolate(heroFade.value, [0, 1], [6, 0]) }],
  }));

  // Returning to "now" is the one action offered in two places (preview badge +
  // expanded Now button); both go through here so both confirm with a tick.
  const resetToNow = useCallback(() => {
    hapticSelection();
    clock.reset();
  }, [clock]);

  // Tapping a prayer in the list time-travels the scrubber to that prayer. The
  // thumb eases there (see Scrubber's reconcile effect), so the move is legible.
  const scrubTo = useCallback(
    (at: number) => {
      if (!Number.isFinite(at)) return;
      hapticSelection();
      // Land EXACTLY on the prayer's instant (not via a lossy fraction round-trip), so
      // the tapped prayer reads as "current" and highlights — see nextPrayerKeyAt. The
      // thumb still eases there off the derived `fraction`.
      clock.setInstant(at);
    },
    [clock],
  );

  const cd = next ? countdownParts(next.at - clock.now) : null;

  // The day being viewed (midday avoids any DST edge), labelled in both calendars.
  // The Hijri line is the point — it honours the user's `hijriOffset` so it can be
  // aligned to the local mosque's sighting. Memoised on the day + offset so the two
  // Intl/Hijri formats don't re-run on every 30 s tick or scrub frame (the dock
  // re-renders for the countdown, but the viewed DAY rarely changes).
  //
  // Both lines label the STOCKHOLM calendar day. formatGregorian pins its own time
  // zone, so the midday instant is enough; formatHijri reads local date FIELDS, so it
  // gets stockholmPrayerDate (a local Date carrying the Stockholm Y/M/D) — passing the
  // instant would read the DEVICE's calendar day and let the two lines disagree by a
  // day on a phone far from Europe/Stockholm.
  // Which day is on screen, relative to the real today. Everything below that says
  // "i dag" reads this rather than assuming the viewed day is today.
  const onToday = clock.dayOffset === 0;

  const { hijriLabel, gregorianLabel } = useMemo(
    () => {
      const midday = new Date(clock.dayStart + DAY_MS / 2);
      // The year appears only when the viewed day is in a different one. On today and its
      // neighbours it is noise; twelve months out, "26 maj" alone is actively misleading.
      const sameYear =
        midday.getFullYear() === new Date(clock.todayStart + DAY_MS / 2).getFullYear();
      return {
        hijriLabel: formatHijri(stockholmPrayerDate(clock.dayStart), settings.hijriOffset),
        gregorianLabel: formatGregorian(midday, { year: !sameYear }),
      };
    },
    [clock.dayStart, clock.todayStart, settings.hijriOffset],
  );

  // "i dag" / "i morgon" / "om 12 dagar", for the day on screen and for the day AFTER it
  // (which is where `next` lives once the viewed day's Ishaʾ has passed). The second one
  // replaces a hard-coded " i morgon" that was a mislabel on every day but today.
  const viewedDayLabel = relativeDayLabel(clock.dayOffset);
  const nextDayLabel = relativeDayLabel(clock.dayOffset + 1);
  const emptyDayLabel = onToday ? 'Inga fler böner i dag' : 'Inga fler böner den här dagen';

  // The "time left" / return-to-now control, shared by both hero layouts: live →
  // the countdown; scrubbed → a chip that taps back to now (the only such control,
  // so it's never duplicated or shown dead).
  const aside =
    clock.mode === 'live' ? (
      cd ? (
        <Text style={styles.countdown} numberOfLines={1}>
          {cd.kind !== 'now' ? <Text style={styles.countdownPrefix}>om </Text> : null}
          {cd.kind === 'now' ? (
            'nu'
          ) : cd.kind === 'hrs' ? (
            // "4t 48min" — units sit FLUSH against their digits (no inter-character
            // space) and render small + medium-weight, so the eye groups each
            // number-with-unit as one beat. A regular space separates the two
            // beats. This is the proximity/hierarchy fix for the old "4 t 48 min".
            <>
              {cd.h}
              <Text style={styles.countdownUnit}>t</Text>
              {` ${cd.m}`}
              <Text style={styles.countdownUnit}>min</Text>
            </>
          ) : (
            <>
              {cd.m}
              <Text style={styles.countdownUnit}>min</Text>
            </>
          )}
        </Text>
      ) : null
    ) : (
      // Scrubbed. The chip is the single way back, and what it PROMISES depends on how
      // far away the user is: on today it returns the time ("Nu"); on another day the
      // bigger fact is the date, so it says "I dag". Both land on live-mode now, which is
      // the same journey — only the name of the thing being restored changes.
      <Pressable
        onPress={resetToNow}
        style={({ pressed }) => [styles.previewBadge, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={onToday ? 'Återgå till nu' : 'Återgå till i dag'}
      >
        <MaterialIcons name={onToday ? 'restore' : 'today'} size={13} color={c.accent} />
        <Text style={styles.previewBadgeText}>{onToday ? 'Nu' : 'I dag'}</Text>
      </Pressable>
    );

  // The place, or — when there is no place, only the Stockholm fallback — an offer to
  // pick one. Built once and rendered in BOTH hero layers, exactly like `aside` above.
  // The hero's gesture is a Pan, which needs movement to activate, so a tap here reaches
  // this Pressable rather than being stolen by the dock toggle (same reason the "Nu"
  // chip works).
  const place = locationIsFallback ? (
    <Pressable
      onPress={() => {
        hapticLight();
        router.push('/(settings)/byt-plats');
      }}
      // The row is only caption-height, so widen the target without touching layout —
      // the hero's height is fixed at 44 and must not grow.
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => [styles.placePick, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Ingen plats vald – tryck för att välja stad"
    >
      <MaterialIcons name="place" size={13} color={c.accent} />
      <Text style={styles.placePickText} numberOfLines={1}>
        Välj plats
      </Text>
    </Pressable>
  ) : (
    <Text style={styles.subPlace} numberOfLines={1}>
      {locationLabel}
    </Text>
  );

  return (
    <Animated.View
      style={[styles.shadowWrap, { bottom: insets.bottom + DOCK_FLOAT }, heightStyle]}
      pointerEvents="box-none"
    >
      <View style={styles.clip}>
        {/* Pass borderRadius onto GlassSurface so the native Liquid Glass layer (iOS) clips
            its own corners — UIVisualEffectView does NOT honour ancestor `overflow: hidden`
            reliably, which is why the dock's corners were jagged on iOS. The tint locks the
            surface colour to the chrome's translucent card-glass so it doesn't drift with
            what the OS sampled under the glass (the same wash drift that made cog ≠ compass
            at dawn before). */}
        <GlassSurface
          style={StyleSheet.absoluteFill}
          borderRadius={radius.xl}
          interactive
          tint={c.cardGlass}
        />

        {/* The card floats above the gesture bar (see DOCK_FLOAT), so the content only
            needs its own internal breathing here — no system-inset clearance. */}
        <View style={[styles.content, { paddingBottom: space.sm }]} pointerEvents="box-none">
          {/* Revealed when expanded: the date header + full day's schedule. The rows
              fade/slide in bottom-up with the dock height (and the date crowns last),
              so nothing peeks while collapsed. Tap a row to ease the scrubber to it. */}
          <View
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          >
            {/* The date crown doubles as the way to any day: the chevrons beside the
                scrubber handle nearby dates in one tap each, this handles "the 14th"
                without twelve of them. Pressable rather than a separate button so the
                expanded dock gains no new row — see DayPicker for why the calendar is a
                sheet inside this card rather than a route. */}
            <Animated.View style={[styles.dateHeader, dateReveal]}>
              <Pressable
                onPress={() => {
                  hapticLight();
                  setPickingDay(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${gregorianLabel}. Välj dag.`}
                accessibilityHint="Öppnar en kalender – välj vilken dag du vill se."
                style={({ pressed }) => [styles.dateTap, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.dateHijri} numberOfLines={1}>
                    {hijriLabel}
                  </Text>
                  <Text style={styles.dateGreg} numberOfLines={1}>
                    {gregorianLabel}
                  </Text>
                </View>
                <MaterialIcons name="event" size={18} color={c.accent} />
              </Pressable>
            </Animated.View>

            <View style={styles.list}>
              {PRAYER_ORDER.map((key, i) => {
                const date = times[key];
                const at = date instanceof Date ? date.getTime() : Number.NaN;
                return (
                  <ScheduleRow
                    key={key}
                    styles={styles}
                    index={i}
                    total={PRAYER_ORDER.length}
                    dockHeight={height}
                    collapsed={COLLAPSED}
                    expanded={EXPANDED}
                    prayerKey={key}
                    date={date}
                    settings={settings}
                    visible={expanded}
                    isNext={next?.key === key && !next.nextDay}
                    onPress={() => scrubTo(at)}
                    iconColor={prayerColorFor(key, scheme)}
                  />
                );
              })}
            </View>
          </View>

          {/* Persistent summary, never moves — and a drag affordance (the hero opens
              the dock too, not just the handle). The collapsed headline carries
              prayer + time · place; the expanded one carries the countdown + place,
              the only facts the schedule above cannot say. Only the active layer is
              mounted: Android retained opacity-zero text in its accessibility tree,
              causing screen readers to announce the place and countdown twice. Both
              layers occupy the same fixed-height box, so the timeline never reflows. */}
          <GestureDetector gesture={heroGesture}>
            <View style={styles.hero}>
              {/* Layer A — collapsed headline. Fades/slides out first. Only ONE hero
                  layer may exist for assistive tech at a time — without the a11y
                  hiding, a screen reader announced the place + countdown twice (once
                  per layer), since visual opacity doesn't prune the a11y tree. */}
              {!expanded ? <Animated.View
                style={[styles.heroLayer, heroLayerStyle]}
                pointerEvents="auto"
              >
                <View style={styles.heroTop}>
                  {next ? (
                    <Text style={styles.heroPrayer} numberOfLines={1}>
                      {PRAYER_LABELS[next.key]}
                      {next.nextDay ? (
                        <Text style={styles.heroNextDay}> {nextDayLabel}</Text>
                      ) : null}
                    </Text>
                  ) : (
                    <Text style={styles.heroNone} numberOfLines={1}>
                      {emptyDayLabel}
                    </Text>
                  )}
                  <View style={styles.flex} />
                  {/* Unconditional, NOT `next ? aside : null`. When there is no next
                      prayer the collapsed dock previously had NO way back to now — and
                      day navigation makes that routine rather than exotic: one step onto
                      a Kiruna polar-winter day is enough. Layer B already did this. */}
                  {aside}
                </View>

                {next ? (
                  <View style={styles.heroSub}>
                    <Text style={styles.subTime}>{formatTime(new Date(next.at))}</Text>
                    <Text style={styles.subSep}>·</Text>
                    {/* The viewed day rides the sub-line rather than taking a row of its
                        own — the hero's height is fixed at 44 and must not grow. It does
                        not shrink, so a long place name truncates before the date does:
                        "Stockho…" still tells you where, "i morg…" tells you nothing. */}
                    {onToday ? null : (
                      <>
                        <Text style={styles.subDay} numberOfLines={1}>
                          {viewedDayLabel}
                        </Text>
                        <Text style={styles.subSep}>·</Text>
                      </>
                    )}
                    {place}
                  </View>
                ) : null}
              </Animated.View> : null}

              {/* Layer B — expanded facts. Fades in as the schedule appears; the list
                  already names today's prayers + times, so this slims to countdown +
                  place. When the next prayer is TOMORROW's it isn't in today's list, so
                  name it here to give the countdown a referent. Sides mirror the
                  collapsed layer (place left, brass countdown right) so the dock's
                  brightest element never jumps corners mid-crossfade — the countdown
                  holds the right edge in both states. */}
              {expanded ? <Animated.View
                style={[styles.heroLayer, heroLayerStyle]}
                pointerEvents="auto"
              >
                <View style={styles.heroTop}>
                  {next ? (
                    <>
                      {next.nextDay ? (
                        <Text style={styles.heroPrayerExpanded} numberOfLines={1}>
                          {PRAYER_LABELS[next.key]}
                          <Text style={styles.heroNextDay}> {nextDayLabel}</Text>
                        </Text>
                      ) : null}
                      <View style={styles.heroPlaceRow}>{place}</View>
                      <View style={styles.flex} />
                      {aside}
                    </>
                  ) : (
                    <Text style={styles.heroNone} numberOfLines={1}>
                      {emptyDayLabel}
                    </Text>
                  )}
                </View>
              </Animated.View> : null}
            </View>
          </GestureDetector>

          <SolarTimeline
            styles={styles}
            fraction={clock.fraction}
            marks={marks}
            dayLength={clock.dayLength}
            onScrub={clock.setFraction}
            onStepDay={clock.stepDay}
            dayOffset={clock.dayOffset}
            scheme={scheme}
          />
        </View>

        {/* Grab handle — the signifier that the dock opens. Drag or tap to toggle. */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.handleHit}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Dölj bönetider' : 'Visa alla bönetider'}
            accessibilityState={{ expanded }}
          >
            {/* A single grab handle — the modern bottom-sheet signifier. (The old
                rotating chevron was a second cue for the same gesture; one is clearer.) */}
            <View style={styles.handle} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Outside `clip`, so the sheet is not cropped by the card's rounded overflow, and
          after it, so it layers above. It is inside shadowWrap, which is the dock's own
          absolutely-positioned box — hence zero effect on the dock's height. */}
      {pickingDay && (
        <DayPicker
          dayStart={clock.dayStart}
          todayStart={clock.todayStart}
          onPick={(instant) => {
            clock.goToDay(instant);
            setPickingDay(false);
          }}
          onClose={() => setPickingDay(false)}
        />
      )}
    </Animated.View>
  );
}

type DockStyles = ReturnType<typeof makeStyles>;

// One schedule row. Self-reveals from the dock height with an index-based stagger
// that matches the GEOMETRY of the upward-growing flex-end clip: the bottom edge is
// pinned and the box grows up, so the list is uncovered bottom-up. We REVERSE the
// stagger (Isha, the bottom row, reveals first; Fajr, the top row, last) so each row
// reaches full opacity exactly as the growing edge exposes it — no row ever sits
// visible-but-blank then pops. Runs on the UI thread; tracks a half-open drag.
function ScheduleRow({
  styles,
  index,
  total,
  dockHeight,
  collapsed,
  expanded,
  prayerKey,
  date,
  settings,
  visible,
  isNext,
  onPress,
  iconColor,
}: {
  styles: DockStyles;
  index: number;
  total: number;
  dockHeight: SharedValue<number>;
  collapsed: number;
  expanded: number;
  prayerKey: PrayerKey;
  date: Date;
  settings: PrayerSettings;
  visible: boolean;
  isNext: boolean;
  onPress: () => void;
  iconColor: string;
}) {
  const valid = date instanceof Date && Number.isFinite(date.getTime());
  const reveal = useAnimatedStyle(() => {
    const p = (dockHeight.value - collapsed) / (expanded - collapsed);
    // Reversed: bottom row (highest index) starts at 0, top row last (~0.375).
    const start = ((total - 1 - index) / total) * 0.45;
    const local = interpolate(p, [start, start + 0.55], [0, 1], Extrapolation.CLAMP);
    return { opacity: local, transform: [{ translateY: interpolate(local, [0, 1], [10, 0]) }] };
  });

  const content = (
    <>
      {/* Sun-cycle glyph tinted in the prayer's solar colour — replaces the
          old 8x8 colour dot. Carries both meanings at once: shape says
          "where in the day" (dawn / noon / sunset / night), colour preserves
          the existing link with the map pills (PRAYER_COLORS, per-theme). */}
      <MaterialCommunityIcons
        name={PRAYER_ICONS[prayerKey]}
        size={18}
        color={iconColor}
        style={styles.listIcon}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.listLabel, isNext && styles.nextEmphasis]}>{PRAYER_LABELS[prayerKey]}</Text>
      <Text style={[styles.listTime, isNext && styles.nextEmphasis]}>
        {valid ? formatTime(date) : '—'}
      </Text>
    </>
  );

  return (
    // Mounted only while the dock is open. accessibilityElementsHidden +
    // no-hide-descendants is NOT enough on Android: measured on API 35, the collapsed dock
    // still exposed "Maghrib 21:01" and "ʿIshāʾ 22:02" as buttons behind the closed card,
    // so a screen reader read out a schedule that isn't on screen. Unmounting is the only
    // thing that actually prunes them. The a11y props stay as the belt to that braces.
    <Animated.View
      style={reveal}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {visible ? (
        <Pressable
          disabled={!valid}
          onPress={onPress}
          style={({ pressed }) => [styles.listRow, isNext && styles.listRowNext, pressed && styles.listRowPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${PRAYER_LABELS[prayerKey]} ${valid ? formatTime(date) : 'kan inte beräknas'}`}
          accessibilityHint="Tryck för att flytta tidslinjen till den här bönen."
        >
          {content}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

// The 24-hour day slider, presented as a restrained prayer timeline: a linear
// control for predictability, with a quiet sun arc as context only. The user's
// prayers are prominent landmarks (ring + scale, not colour alone), and the next
// prayer gets the same brass emphasis used elsewhere in the app.
//
// The thumb/fill read shared values only (dragging → `prog`, idle → `follow`), never
// the JS `fraction` prop directly. That is what kills the drag-release snap-back: a
// scrub keeps the JS thread busy rebuilding the field, so a worklet that read the
// `fraction` it captured at render would, the instant the drag ends, paint a stale
// pre-drag value for several frames before the committed time ships from JS — the
// thumb flicking back to where the drag started, then forward again. `follow` mirrors
// `fraction` from an effect and stays on the UI thread, so the handoff is seamless.
function SolarTimeline({
  styles,
  fraction,
  marks,
  dayLength,
  onScrub,
  onStepDay,
  dayOffset,
  scheme,
}: {
  styles: DockStyles;
  fraction: number;
  marks: DayMark[];
  /** Real length of the viewed Stockholm day in ms — 23/24/25 h across DST. */
  dayLength: number;
  onScrub: (f: number) => void;
  /** Move the viewed day by ±1. The chevrons flanking the track. */
  onStepDay: (delta: number) => void;
  /** Which day is on screen, so the chevrons can dim at the rails. */
  dayOffset: number;
  scheme: ColorSchemeName;
}) {
  const [trackW, setTrackW] = useState(0);
  // Where each labelled hour actually falls in the viewed day. The EU switches at
  // 02:00/03:00 local, so by 06:00 a transition day has already gained or lost its whole
  // hour — every tick from 06 on carries the full delta, and 00 is the day's start by
  // definition. On an ordinary day the delta is 0 and this is plain quarters.
  const tickFractions = useMemo(() => {
    const dayHours = dayLength / 3_600_000;
    const shift = dayHours - 24;
    return HOUR_TICKS.map((h) => (h === 0 ? 0 : (h + shift) / dayHours));
  }, [dayLength]);
  // Two disjoint shared values, by design (see also react-hooks/immutability): the
  // gesture writes ONLY `prog`/`dragging`; the reconcile effect writes ONLY `follow`.
  // `prog` is the finger position while dragging; `follow` is an eased mirror of the
  // `fraction` prop for every idle moment (live tick, tapped row, post-drag commit).
  const prog = useSharedValue(fraction);
  const follow = useSharedValue(fraction);
  const dragging = useSharedValue(false);
  const lastHaptic = useSharedValue(fraction);
  const lastSent = useSharedValue(fraction);

  const markFractions = useMemo(() => marks.map((m) => m.fraction), [marks]);

  // Mirror the clock into `follow` (eased) whenever the prop moves. Easing makes a
  // tapped row time-travel legibly; more importantly the style reads `follow` (a
  // UI-thread value), never the JS `fraction` straight — under a scrub the JS thread
  // is busy rebuilding the field, so a worklet that captured `fraction` would hold a
  // stale, pre-drag value for several frames at drag-release and snap the thumb back
  // before the committed time lands. Written only here, so no worklet mutates it.
  useEffect(() => {
    follow.value = withTiming(fraction, { duration: motion.base });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow is a stable shared-value ref
  }, [fraction]);

  // NOT memoised: the worklets mutate shared values (prog/dragging/lastHaptic/lastSent),
  // which react-hooks/immutability forbids inside useMemo. (React Compiler, once enabled,
  // is the right way to skip the per-render rebuild here.)
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true;
      scheduleOnRN(hapticLight);
      if (trackW <= 0) return;
      const f = Math.max(0, Math.min(1, e.x / trackW));
      prog.value = f;
      lastHaptic.value = f;
      lastSent.value = f;
      scheduleOnRN(onScrub, f);
    })
    .onUpdate((e) => {
      if (trackW <= 0) return;
      const f = Math.max(0, Math.min(1, e.x / trackW));
      prog.value = f;
      // Selection tick when the thumb sweeps past one of the day's prayers.
      for (let i = 0; i < markFractions.length; i++) {
        const m = markFractions[i];
        if ((lastHaptic.value < m && f >= m) || (lastHaptic.value > m && f <= m)) {
          scheduleOnRN(hapticSelection);
          break;
        }
      }
      lastHaptic.value = f;
      // Throttle the JS field recompute; the thumb above stays at 60fps.
      if (Math.abs(f - lastSent.value) >= 0.0025) {
        lastSent.value = f;
        scheduleOnRN(onScrub, f);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      scheduleOnRN(hapticLight);
      scheduleOnRN(onScrub, prog.value);
    });

  // Dragging → the finger (`prog`, 60fps on the UI thread); idle → the eased clock
  // mirror (`follow`). Both are shared values, so neither is hostage to JS-thread lag
  // the way reading `fraction` here was. trackW is captured at render, so the thumb
  // repositions when the track lays out.
  const fillStyle = useAnimatedStyle(() => {
    const f = dragging.value ? prog.value : follow.value;
    return { width: f * trackW };
  });
  const thumbStyle = useAnimatedStyle(() => {
    const f = dragging.value ? prog.value : follow.value;
    return {
      left: f * trackW - 9,
      transform: [{ scale: withSpring(dragging.value ? 1.16 : 1, SPRING) }],
    };
  });

  return (
    <View style={styles.timelineArea}>
      {/* The day stepper lives in the timeline ROW rather than anywhere else in the dock,
          for two reasons. First, geometry: the collapsed card has ~4 dp of spare vertical
          space and the expanded one is already slightly over-subscribed, so no new row
          fits — and raising DOCK_COLLAPSED_BASE would visibly zoom the whole-Sweden
          framing out, since bonetider feeds it into the initial fitBounds padding.
          Second, principle: this row is rendered once and visible in BOTH dock states, so
          the time controls stay in one place that never moves — the same reason the
          scrubber lives here.

          The chevrons are SIBLINGS of the GestureDetector, never inside it, so the pan's
          `e.x / trackW` maths and its onLayout keep measuring the track alone. On a 375 pt
          screen that track goes 319 → 247 px (≈ 5.8 min/px), which is still comfortable
          against an 18 px thumb. */}
      <View style={styles.timelineRow}>
        <DayChevron
          styles={styles}
          direction={-1}
          disabled={dayOffset <= -MAX_DAY_OFFSET}
          onPress={onStepDay}
        />
      {/* Track and ruler share ONE column so the hours land on the axis they label. The
          ruler used to be a sibling of this whole row, spanning the chevrons too: it came
          out ~10% wider than the track, which put "00" under the ‹ chevron and "24" past
          the › one — a constant stretch that read as over an hour of error at both ends
          and zero at "12". */}
      {/* The pan target is the WHOLE column — track band AND hour ruler — not just the
          band. The band alone is 30 px tall, well under the 44 dp minimum, and the dock
          has no spare height to grow into (raising DOCK_COLLAPSED_BASE zooms the map's
          initial framing out). The ruler beneath it is 13 px of non-interactive labels
          sitting exactly where a finger reaching for the knob tends to land low, so
          handing those pixels to the gesture buys ≈43 px for free. `e.x / trackW` is
          unchanged: this view has the same left edge and width as the band it replaces. */}
      <GestureDetector gesture={pan}>
        <View
          style={styles.timelineCol}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Dagens tidslinje"
          accessibilityHint="Dra för att resa genom dygnet och se bönetiderna."
        >
        <View style={styles.trackBand}>
          <View style={styles.trackBase} />
          {/* Plain-style `width` first so the freshly-mounted fill already spans to the
              live position; the animated style (which can apply a frame late on mount)
              then takes over. Without it the fill flashes empty — same mount glitch the
              thumb's plain `left` below fixes. */}
          <Animated.View style={[styles.trackFill, { width: fraction * trackW }, fillStyle]} />
          {/* Prayer landmarks sit on the axis as plain coloured dots — identical
              size and chrome for all six. The "next prayer" answer is already
              carried by the brass countdown above ("om 2t 40min"), so giving the
              same prayer a separate visual treatment on the timeline was
              redundant chrome. The past/future axis still reads: past prayers
              draw at full opacity, future ones soften. */}
          {trackW > 0 &&
            marks.map((m) => {
              const isPast = m.fraction <= fraction;
              return (
                <View
                  key={m.key}
                  pointerEvents="none"
                  style={[
                    styles.mark,
                    isPast && styles.markPast,
                    {
                      position: 'absolute',
                      left: m.fraction * trackW - 3.5,
                      backgroundColor: prayerColorFor(m.key, scheme),
                    },
                  ]}
                />
              );
            })}
          {/* Plain-style `left` first so a freshly-mounted thumb is already at the
              live position; the animated style (which can apply a frame late on mount)
              then takes over and drives the drag. Without it the thumb flashes at 0. */}
          {trackW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.thumb, { left: fraction * trackW - 9 }, thumbStyle]}
            />
          )}
        </View>
        <View style={styles.ticks} pointerEvents="none">
          {trackW > 0 &&
            HOUR_TICKS.map((h, i) => (
              <Text
                key={h}
                style={[styles.tick, { left: tickFractions[i] * trackW }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {String(h).padStart(2, '0')}
              </Text>
            ))}
        </View>
        </View>
      </GestureDetector>
        <DayChevron
          styles={styles}
          direction={1}
          disabled={dayOffset >= MAX_DAY_OFFSET}
          onPress={onStepDay}
        />
      </View>
    </View>
  );
}

/** One end of the day stepper. Accent, not inkMuted: at the two ends of a scrubber a
 *  muted glyph reads as an end-cap rather than a button, and this is the app's one
 *  "verbs are accent" rule doing its job. Dimmed and inert at the rails so the limit is
 *  visible before it is hit. */
function DayChevron({
  styles,
  direction,
  disabled,
  onPress,
}: {
  styles: DockStyles;
  direction: 1 | -1;
  disabled: boolean;
  onPress: (delta: 1 | -1) => void;
}) {
  const c = useColors();
  const forward = direction === 1;
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress(direction);
      }}
      disabled={disabled}
      // The glyph box is 22 × TRACK_BAND_H (30); hitSlop lifts the target to 44 × 54
      // without adding a pixel to the row, which would come straight out of the
      // scrubber track. Left/right are 11 for exactly 44 — 8 left it at 38, under the
      // minimum, on the two controls sitting closest to the screen edges.
      hitSlop={{ top: 12, bottom: 12, left: 11, right: 11 }}
      accessibilityRole="button"
      accessibilityLabel={forward ? 'Nästa dag' : 'Föregående dag'}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.dayStep, disabled && styles.dayStepOff, pressed && styles.pressed]}
    >
      <MaterialIcons
        name={forward ? 'chevron-right' : 'chevron-left'}
        size={22}
        color={c.accent}
      />
    </Pressable>
  );
}

// Styles built from the active OS palette. Layout geometry is fixed; colours come from
// `c`, and typography/spacing snap to the design tokens (type.* / space.* / radius.*).
function makeStyles(c: Palette) {
  return StyleSheet.create({
    shadowWrap: {
      position: 'absolute',
      left: space.md,
      right: space.md,
      borderRadius: radius.xl,
      ...shadow.card,
    },
    // The rim lives on this rounded, overflow-clipped container — NOT on the
    // GlassSurface backing (a square absoluteFill, see below). A border on the
    // square child gets corner-clipped by this radius so it can't trace the
    // rounding; on the rounded container it follows the corners exactly. The
    // OS-themed `c.hairline` (warm@0.10 in light / cool@0.12 in dark) keeps the
    // rim a subtle accent in both modes — unlike a fixed white@0.55 glass rim,
    // which was near-invisible on the light dock but glaring on the dark one.
    clip: {
      flex: 1,
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    // paddingTop clears the grab-handle zone (handleHit is 34 tall) plus a gap, so
    // the topmost content (the date header / hero) never sits cramped under the handle.
    content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingTop: 36 },

    dateHeader: { marginBottom: space.md },
    // The whole crown is the target; the row keeps the two date lines left and the
    // calendar glyph right, so the header's typography is untouched by becoming tappable.
    dateTap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
    // Date crown — bodyStrong weighted up to 700.
    dateHijri: { ...type.bodyStrong, fontWeight: '700', letterSpacing: 0.2, color: c.ink },
    dateGreg: { ...type.caption, color: c.inkMuted, marginTop: 1 }, // optical nudge

    list: { marginBottom: space.sm },
    // Rows carry a symmetric bleed (padding in, margin out) so a row background can
    // extend past the text column without shifting any text: every row's label/time
    // stay aligned with the date header above, highlighted or not.
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 7, // row touch-target height — kept (snapping would reflow the list)
      paddingHorizontal: space.sm,
      marginHorizontal: -space.sm,
      borderRadius: radius.md,
    },
    // The next prayer's row sits in a soft brass container (common region), so "what's
    // coming" reads as a place in the schedule, not just a recoloured line of text —
    // the same highlightSoft the qibla lock uses, so brass-tint still means "live now".
    listRowNext: { backgroundColor: c.highlightSoft },
    listRowPressed: { opacity: 0.55 },
    // Same 18px width the old listDot occupied (8 + 10 gap) is now the icon's
    // intrinsic size; rely on the row's `gap` for spacing.
    listIcon: { width: 18, textAlign: 'center' },
    listLabel: { ...type.callout, flex: 1, color: c.ink },
    listTime: { ...type.callout, color: c.ink, fontVariant: ['tabular-nums'] },
    // The next prayer = brass everywhere (here, the countdown, the map pill), so
    // "what's coming" reads in one colour across the dock and the map.
    nextEmphasis: { color: c.highlightText, fontWeight: '700' },

    pressed: { opacity: 0.55 }, // same pressed step as listRowPressed — one dimming voice

    // Hero holds two cross-fading layers (collapsed headline ↔ expanded facts). It has
    // a FIXED height so swapping content never reflows the timeline pinned below it;
    // both layers are absolutely positioned, so neither contributes layout height. 44
    // clears the collapsed two-tier content (19px name + gap + 15px time·place line).
    hero: { height: 44, marginBottom: space.xs, justifyContent: 'center' },
    heroLayer: { position: 'absolute', left: 0, right: 0 },
    heroTop: { flexDirection: 'row', alignItems: 'center' },
    heroPrayer: { ...type.headline, color: c.ink },
    // Expanded hero name: a touch smaller than collapsed (the date header crowns the
    // open dock), shown only when the next prayer is tomorrow's and thus absent from
    // today's list.
    heroPrayerExpanded: { ...type.bodyStrong, fontWeight: '700', letterSpacing: 0.2, color: c.ink, marginRight: space.sm },
    heroNone: { ...type.body, color: c.inkMuted },
    // ── Dock countdown numerals — intentionally bespoke, NOT on the type scale: a big
    //    tabular brass digit (18) with a flush small unit (12) and a quiet prefix (13),
    //    plus the 14px relative-day sibling. These numeric-display sizes are used nowhere
    //    else; tokenizing them would pollute the global scale for one component. ──
    heroNextDay: { fontSize: 14, fontWeight: '400', color: c.inkMuted },
    countdown: { marginLeft: space.sm, fontSize: 18, fontWeight: '700', color: c.highlightText, fontVariant: ['tabular-nums'] },
    countdownPrefix: { fontSize: 13, fontWeight: '400', color: c.inkMuted },
    // Unit ("t" / "min") at ~65% of the digit size, medium-weight, same brass.
    // Flush against the digit (no inter-character space) — the hierarchy +
    // proximity that the old equal-weight string lacked.
    countdownUnit: { fontSize: 12, fontWeight: '600', color: c.highlightText },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 }, // optical nudge
    // Sits LEFT in the expanded hero (no leading margin — it aligns with the list
    // column); when the tomorrow-name precedes it, that name carries the gap.
    heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
    subTime: { ...type.caption, color: c.inkMuted, fontVariant: ['tabular-nums'] },
    subSep: { ...type.caption, color: c.inkMuted },
    // Same caption size as the time beside it — one quiet line, ONE size; the place
    // de-emphasises through ink alone (faint vs muted), not a second tier of
    // size/weight/tracking on the same baseline (which read as a mismatch, not hierarchy).
    subPlace: { ...type.caption, color: c.inkFaint, flexShrink: 1 },
    // The viewed day, when it is not today. flexShrink: 0 on purpose — the place name
    // beside it truncates first, because "Stockho…" still says where you are while
    // "i morg…" says nothing at all. Muted rather than faint: on another day this is the
    // most important word on the line, since every time above it belongs to that day.
    subDay: { ...type.caption, color: c.inkMuted, flexShrink: 0 },
    // The stepper row: chevron | track (flex) | chevron. The track keeps `flex: 1` so it
    // absorbs whatever the two glyphs leave, on every screen width.
    //
    // THE BUG THIS FIXES: the two chevrons sat visibly below the line they flank. The row
    // centred them on the whole column — track band (30) + hour ruler (13) = 43, so their
    // centre landed at y≈21.5 while the track's is at y=15. Six px of droop, on the one
    // row where three controls are meant to read as a single instrument.
    //
    // Fixed by anchoring both chevrons to the TOP of the column and giving them exactly
    // the band's height, so `justifyContent: center` inside each one puts its glyph on
    // the band's centre — which is where the track and thumb are centred too. The two
    // heights must stay equal; that is why they are one constant.
    timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
    dayStep: { alignItems: 'center', justifyContent: 'center', width: 22, height: TRACK_BAND_H },
    dayStepOff: { opacity: 0.3 },
    // The no-location offer that replaces the place name. Accent (the app's "verbs are
    // accent" rule) and semibold, so it reads as the one thing to tap on this line —
    // against subPlace's faint ink, which reads as settled fact. Caption-sized like its
    // siblings, so swapping one for the other never changes the hero's 44 dp height.
    placePick: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
    placePickText: { ...type.caption, color: c.accent, fontWeight: '600', flexShrink: 1 },

    flex: { flex: 1 },
    previewBadge: {
      marginLeft: space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
      backgroundColor: c.accentSoft,
    },
    // Small brass-on-tint "Nu" badge — 12/700 is a deliberate compact chip label, kept local.
    previewBadgeText: { fontSize: 12, fontWeight: '700', color: c.accent },

    timelineArea: {},
    // The band the track/thumb/pips are drawn in. Every child is absolutely positioned
    // against its BOTTOM edge, so the band's height sets where the line sits in the row
    // and nothing inside it needs to change when that height does.
    trackBand: { height: TRACK_BAND_H },
    // Track + hour ruler, stacked and sharing one width between the two day chevrons.
    // flex: 1 so it takes the row's whole remaining width once the two chevrons are laid
    // out — the pan's e.x / trackW maths reads THIS element's onLayout width, and the
    // gesture covers it end to end (band + ruler) for a 44-dp-class drag target.
    timelineCol: { flex: 1 },
    trackBase: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 13,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.track,
    },
    // The elapsed-day fill is deliberately quiet (a soft tint, not a bold bar): it is
    // context, and the prayer pips above are the content. Over-saturating it inverted
    // the hierarchy — the progress bar shouted louder than the prayers it marks.
    trackFill: {
      position: 'absolute',
      left: 0,
      bottom: 13,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.trackFill,
      opacity: 0.5,
    },
    // Plain coloured dot on the axis. Same size/chrome for every prayer; past
    // dots draw at full opacity, future ones soften.
    mark: { width: 7, height: 7, borderRadius: 4, bottom: 11, opacity: 0.7 },
    markPast: { opacity: 1 },
    // The knob is the app mark in miniature: brand gold inside a brand blue ring (see
    // the scrubber block in theme/tokens.ts, which also explains why the RING is what
    // carries this control's contrast).
    thumb: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      bottom: 6,
      backgroundColor: c.scrubberKnob,
      borderColor: c.scrubberRing,
      borderWidth: 2,
      ...shadow.thumb,
      // Always the topmost layer — above the brass next-pip's zIndex — so "you are here"
      // is never covered when the thumb passes beneath a prayer pip.
      zIndex: 3,
    },
    // Sits inside timelineCol, so its width IS the track's. Each label is absolutely
    // placed at its hour's fraction and centred on it, rather than evenly distributed —
    // even spacing silently assumed 24 equal hours, which is wrong on the two DST days.
    ticks: { height: RULER_H, marginTop: 0 },
    // Hour-axis tick — 10px tabular, deliberately below `micro`; the smallest label in
    // the app and bespoke to the timeline.
    tick: {
      position: 'absolute',
      width: 28,
      marginLeft: -14,
      textAlign: 'center',
      fontSize: 10,
      color: c.inkFaint,
      fontVariant: ['tabular-nums'],
    },

    handleHit: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: c.handle },
  });
}
