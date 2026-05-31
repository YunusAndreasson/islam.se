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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ColorSchemeName, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '../../lib/haptics';
import { formatGregorian, formatHijri } from '../../lib/hijri';
import {
  formatTime,
  PRAYER_ICONS,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
} from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import { prayerColorFor } from '../../lib/solar/palette';
import type { SolarClock } from '../../lib/solar/useSolarClock';
import { motion, type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useActiveScheme, useColors } from '../../theme/useColors';
import { GlassSurface } from '../ui/GlassSurface';

const DAY_MS = 86_400_000;
const HOUR_TICKS = ['00', '06', '12', '18', '24'];
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
  tomorrow: boolean;
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
  settings: PrayerSettings;
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
  settings,
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

  // One open-fraction (0 collapsed → 1 expanded) that EVERY reveal reads, so the
  // whole dock unfolds off a single continuous value instead of three independent
  // recomputations swapping on a JS boolean. The spring can overshoot past EXPANDED,
  // so every interpolate() below clamps. (Reanimated's canonical bottom-sheet pattern.)
  const progress = useDerivedValue(() => (height.value - COLLAPSED) / (EXPANDED - COLLAPSED));

  // State change on the JS thread (from gesture worklets via runOnJS): flip the flag,
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
        runOnJS(applyExpanded)(open);
      });

  const tap = Gesture.Tap().onEnd(() => {
    const open = height.value < MID;
    height.value = withSpring(open ? EXPANDED : COLLAPSED, SPRING);
    runOnJS(applyExpanded)(open);
  });

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

  // The hero cross-fades between two stacked layers instead of hard-swapping on the
  // `expanded` boolean (which flipped mid-spring and made the big name + time pop).
  // Layer A (collapsed headline) fades OUT first; Layer B (expanded facts) fades IN,
  // their windows overlapping (0.18–0.30) for a true dissolve with no blank frame.
  const collapsedLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0, 0.3], [0, -10], Extrapolation.CLAMP) }],
  }));
  const expandedLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.18, 0.55], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [0.18, 0.55], [8, 0], Extrapolation.CLAMP) }],
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
      // Fraction of the real Stockholm day (matches the scrubber + day marks).
      clock.setFraction((at - clock.dayStart) / clock.dayLength);
    },
    [clock],
  );

  const cd = next ? countdownParts(next.at - clock.now) : null;

  // The day being viewed (midday avoids any DST edge), labelled in both calendars.
  // The Hijri line is the point — it honours the user's `hijriOffset` so it can be
  // aligned to the local mosque's sighting.
  const viewDate = new Date(clock.dayStart + DAY_MS / 2);
  const hijriLabel = formatHijri(viewDate, settings.hijriOffset);
  const gregorianLabel = formatGregorian(viewDate);

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
      <Pressable
        onPress={resetToNow}
        style={({ pressed }) => [styles.previewBadge, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Återgå till nu"
      >
        <MaterialIcons name="restore" size={13} color={c.accent} />
        <Text style={styles.previewBadgeText}>Nu</Text>
      </Pressable>
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
          borderRadius={22}
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
            <Animated.View style={[styles.dateHeader, dateReveal]}>
              <Text style={styles.dateHijri} numberOfLines={1}>
                {hijriLabel}
              </Text>
              <Text style={styles.dateGreg} numberOfLines={1}>
                {gregorianLabel}
              </Text>
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
                    isNext={next?.key === key && !next.tomorrow}
                    onPress={() => scrubTo(at)}
                    iconColor={prayerColorFor(key, scheme)}
                  />
                );
              })}
            </View>
          </View>

          {/* Persistent summary, never moves — and a drag affordance (the hero opens
              the dock too, not just the handle). Two stacked layers cross-fade off
              `progress` so nothing pops on release: Layer A (collapsed headline:
              prayer name + time · place) fades out as Layer B (expanded facts:
              countdown + place, the only things the schedule above can't say) fades
              in. Both are absolutely positioned inside a FIXED-height box, so the
              timeline below never reflows when the content swaps. */}
          <GestureDetector gesture={heroGesture}>
            <View style={styles.hero}>
              {/* Layer A — collapsed headline. Fades/slides out first. */}
              <Animated.View
                style={[styles.heroLayer, { opacity: 1 }, collapsedLayerStyle]}
                pointerEvents={expanded ? 'none' : 'auto'}
              >
                <View style={styles.heroTop}>
                  {next ? (
                    <Text style={styles.heroPrayer} numberOfLines={1}>
                      {PRAYER_LABELS[next.key]}
                      {next.tomorrow ? <Text style={styles.heroTomorrow}> i morgon</Text> : null}
                    </Text>
                  ) : (
                    <Text style={styles.heroNone} numberOfLines={1}>
                      Inga fler böner i dag
                    </Text>
                  )}
                  <View style={styles.flex} />
                  {next ? aside : null}
                </View>

                {next ? (
                  <View style={styles.heroSub}>
                    <Text style={styles.subTime}>{formatTime(new Date(next.at))}</Text>
                    <Text style={styles.subSep}>·</Text>
                    <MaterialIcons name="place" size={11} color={c.highlight} />
                    <Text style={styles.subPlace} numberOfLines={1}>
                      {locationLabel}
                    </Text>
                  </View>
                ) : null}
              </Animated.View>

              {/* Layer B — expanded facts. Fades in as the schedule appears; the list
                  already names today's prayers + times, so this slims to countdown +
                  place. When the next prayer is TOMORROW's it isn't in today's list, so
                  name it here to give the countdown a referent. */}
              <Animated.View
                style={[styles.heroLayer, { opacity: 0 }, expandedLayerStyle]}
                pointerEvents={expanded ? 'auto' : 'none'}
              >
                <View style={styles.heroTop}>
                  {next ? (
                    <>
                      {next.tomorrow ? (
                        <Text style={styles.heroPrayerExpanded} numberOfLines={1}>
                          {PRAYER_LABELS[next.key]}
                          <Text style={styles.heroTomorrow}> i morgon</Text>
                        </Text>
                      ) : null}
                      {aside}
                    </>
                  ) : (
                    <Text style={styles.heroNone} numberOfLines={1}>
                      Inga fler böner i dag
                    </Text>
                  )}
                  <View style={styles.flex} />
                  {next ? (
                    <View style={styles.heroPlaceRow}>
                      <MaterialIcons name="place" size={11} color={c.highlight} />
                      <Text style={styles.subPlace} numberOfLines={1}>
                        {locationLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            </View>
          </GestureDetector>

          <SolarTimeline
            styles={styles}
            fraction={clock.fraction}
            marks={marks}
            onScrub={clock.setFraction}
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

  return (
    <Animated.View style={reveal}>
      <Pressable
        disabled={!valid}
        onPress={onPress}
        style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${PRAYER_LABELS[prayerKey]} ${valid ? formatTime(date) : 'okänd'}`}
        accessibilityHint="Tryck för att flytta tidslinjen till den här bönen."
      >
        {/* Sun-cycle glyph tinted in the prayer's solar colour — replaces the
            old 8x8 colour dot. Carries both meanings at once: shape says
            "where in the day" (dawn / noon / sunset / night), colour preserves
            the existing link with the map pills (PRAYER_COLORS, per-theme). */}
        <MaterialCommunityIcons
          name={PRAYER_ICONS[prayerKey]}
          size={18}
          color={iconColor}
          style={styles.listIcon}
        />
        <Text style={[styles.listLabel, isNext && styles.nextEmphasis]}>{PRAYER_LABELS[prayerKey]}</Text>
        <Text style={[styles.listTime, isNext && styles.nextEmphasis]}>
          {valid ? formatTime(date) : '—'}
        </Text>
      </Pressable>
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
  onScrub,
  scheme,
}: {
  styles: DockStyles;
  fraction: number;
  marks: DayMark[];
  onScrub: (f: number) => void;
  scheme: ColorSchemeName;
}) {
  const [trackW, setTrackW] = useState(0);
  // Two disjoint shared values, by design (see also react-hooks/immutability): the
  // gesture writes ONLY `prog`/`dragging`; the reconcile effect writes ONLY `follow`.
  // `prog` is the finger position while dragging; `follow` is an eased mirror of the
  // `fraction` prop for every idle moment (live tick, tapped row, post-drag commit).
  const prog = useSharedValue(fraction);
  const follow = useSharedValue(fraction);
  const dragging = useSharedValue(false);
  const lastHaptic = useSharedValue(fraction);
  const lastSent = useSharedValue(fraction);

  const markFractions = marks.map((m) => m.fraction);

  // Mirror the clock into `follow` (eased) whenever the prop moves. Easing makes a
  // tapped row time-travel legibly; more importantly the style reads `follow` (a
  // UI-thread value), never the JS `fraction` straight — under a scrub the JS thread
  // is busy rebuilding the field, so a worklet that captured `fraction` would hold a
  // stale, pre-drag value for several frames at drag-release and snap the thumb back
  // before the committed time lands. Written only here, so no worklet mutates it.
  useEffect(() => {
    follow.value = withTiming(fraction, { duration: 240 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow is a stable shared-value ref
  }, [fraction]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true;
      runOnJS(hapticLight)();
      if (trackW <= 0) return;
      const f = Math.max(0, Math.min(1, e.x / trackW));
      prog.value = f;
      lastHaptic.value = f;
      lastSent.value = f;
      runOnJS(onScrub)(f);
    })
    .onUpdate((e) => {
      if (trackW <= 0) return;
      const f = Math.max(0, Math.min(1, e.x / trackW));
      prog.value = f;
      // Selection tick when the thumb sweeps past one of the day's prayers.
      for (let i = 0; i < markFractions.length; i++) {
        const m = markFractions[i];
        if ((lastHaptic.value < m && f >= m) || (lastHaptic.value > m && f <= m)) {
          runOnJS(hapticSelection)();
          break;
        }
      }
      lastHaptic.value = f;
      // Throttle the JS field recompute; the thumb above stays at 60fps.
      if (Math.abs(f - lastSent.value) >= 0.0025) {
        lastSent.value = f;
        runOnJS(onScrub)(f);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      runOnJS(hapticLight)();
      runOnJS(onScrub)(prog.value);
    });

  // Dragging → the finger (`prog`, 60fps on the UI thread); idle → the eased clock
  // mirror (`follow`). Both are shared values, so neither is hostage to JS-thread lag
  // the way reading `fraction` here was. trackW is captured at render, so the thumb
  // repositions when the track lays out.
  const fillStyle = useAnimatedStyle(() => ({
    width: (dragging.value ? prog.value : follow.value) * trackW,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: (dragging.value ? prog.value : follow.value) * trackW - 9,
    transform: [{ scale: withSpring(dragging.value ? 1.16 : 1, SPRING) }],
  }));

  return (
    <View style={styles.timelineArea}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.timelineHit}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Dagens tidslinje"
          accessibilityHint="Dra för att resa genom dygnet och se bönetiderna."
        >
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
      </GestureDetector>
      <View style={styles.ticks}>
        {HOUR_TICKS.map((t) => (
          <Text key={t} style={styles.tick}>
            {t}
          </Text>
        ))}
      </View>
    </View>
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
    // Date crown — bodyStrong weighted up to 700.
    dateHijri: { ...type.bodyStrong, fontWeight: '700', letterSpacing: 0.2, color: c.ink },
    dateGreg: { ...type.caption, color: c.inkMuted, marginTop: 1 }, // optical nudge

    list: { marginBottom: space.sm },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 7, // row touch-target height — kept (snapping would reflow the list)
    },
    listRowPressed: { opacity: 0.55 },
    // Same 18px width the old listDot occupied (8 + 10 gap) is now the icon's
    // intrinsic size; rely on the row's `gap` for spacing.
    listIcon: { width: 18, textAlign: 'center' },
    listLabel: { ...type.callout, flex: 1, color: c.ink },
    listTime: { ...type.callout, color: c.ink, fontVariant: ['tabular-nums'] },
    // The next prayer = brass everywhere (here, the countdown, the map pill), so
    // "what's coming" reads in one colour across the dock and the map.
    nextEmphasis: { color: c.highlight, fontWeight: '700' },

    pressed: { opacity: 0.6 },

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
    heroPrayerExpanded: { ...type.bodyStrong, fontWeight: '700', letterSpacing: 0.2, color: c.ink },
    heroNone: { ...type.body, color: c.inkMuted },
    // ── Dock countdown numerals — intentionally bespoke, NOT on the type scale: a big
    //    tabular brass digit (18) with a flush small unit (12) and a quiet prefix (13),
    //    plus the 14px "i morgon" sibling. These numeric-display sizes are used nowhere
    //    else; tokenizing them would pollute the global scale for one component. ──
    heroTomorrow: { fontSize: 14, fontWeight: '400', color: c.inkMuted },
    countdown: { marginLeft: space.sm, fontSize: 18, fontWeight: '700', color: c.highlight, fontVariant: ['tabular-nums'] },
    countdownPrefix: { fontSize: 13, fontWeight: '400', color: c.inkMuted },
    // Unit ("t" / "min") at ~65% of the digit size, medium-weight, same brass.
    // Flush against the digit (no inter-character space) — the hierarchy +
    // proximity that the old equal-weight string lacked.
    countdownUnit: { fontSize: 12, fontWeight: '600', color: c.highlight },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 }, // optical nudge
    heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginLeft: space.sm, flexShrink: 1, minWidth: 0 },
    subTime: { ...type.caption, color: c.inkMuted, fontVariant: ['tabular-nums'] },
    subSep: { ...type.caption, color: c.inkMuted },
    subPlace: { ...type.micro, color: c.inkFaint, flexShrink: 1 },

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
    timelineHit: { height: 30, justifyContent: 'flex-end', paddingBottom: 6 },
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
    thumb: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      bottom: 6,
      backgroundColor: c.thumb,
      borderColor: c.accent,
      borderWidth: 2,
      ...shadow.thumb,
      // Always the topmost layer — above the brass next-pip's zIndex — so "you are here"
      // is never covered when the thumb passes beneath a prayer pip.
      zIndex: 3,
    },
    ticks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 0 },
    // Hour-axis tick — 10px tabular, deliberately below `micro`; the smallest label in
    // the app and bespoke to the timeline.
    tick: { fontSize: 10, color: c.inkFaint, fontVariant: ['tabular-nums'] },

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
