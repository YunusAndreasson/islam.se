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
// useColors() — NOT the map's sun-driven day↔night. This is deliberate: chrome (dock +
// menu + every screen) stays consistent regardless of where the sun is, which is why the
// dock can read bright over a night (post-Isha) map when the phone is in light mode. An
// earlier sun-driven dock was tried and rejected (it made the chrome "look different per
// screen"). The map CANVAS (wash, pills, markers) is the sun-driven layer (see nightChrome).
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '../../lib/haptics';
import { formatGregorian, formatHijri } from '../../lib/hijri';
import { formatTime, PRAYER_LABELS, PRAYER_ORDER, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import type { SolarClock } from '../../lib/solar/useSolarClock';
import { shadow } from '../../theme/tokens';
import { GlassSurface } from '../ui/GlassSurface';
import { type NightChrome, nightChrome } from './nightChrome';

const DAY_MS = 86_400_000;
const HOUR_TICKS = ['00', '06', '12', '18', '24'];
const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

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
export const DOCK_EXPANDED_BASE = 368;

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
  /** 0 day → 1 deep night. The dock is the map's own surface, so it blends with the map:
      light glass over a day map, dark indigo glass over the night map (text flips with it,
      so it stays readable). NOT the OS theme — this surface only exists on the map. */
  night: number;
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
  night,
  onExpandedChange,
}: Props) {
  const insets = useSafeAreaInsets();
  // The dock floats ON the living map, so it blends with it: nightChrome slides every
  // surface/ink from warm light glass on a day map to dark indigo glass on the night map
  // (and the steep dusk/dawn remap keeps it decisively light or dark — never a muddy
  // grey-on-grey). `surface` is the translucent glass for the GlassSurface fill.
  const c = useMemo(() => nightChrome(night), [night]);
  const styles = useMemo(() => makeStyles(c), [c]);

  // Card heights are the card itself; the float + safe-area inset live in the
  // position (bottom), so the card sits clear above the gesture bar.
  const COLLAPSED = DOCK_COLLAPSED_BASE;
  const EXPANDED = DOCK_EXPANDED_BASE;
  const MID = (COLLAPSED + EXPANDED) / 2;

  const height = useSharedValue(COLLAPSED);
  const startHeight = useSharedValue(COLLAPSED);
  const [expanded, setExpanded] = useState(false);

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

  const pan = Gesture.Pan()
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

  const gesture = Gesture.Exclusive(pan, tap);

  const heightStyle = useAnimatedStyle(() => ({ height: height.value }));
  // The date header leads the reveal — it's the first thing to settle as the dock
  // opens, before the schedule rows cascade in beneath it.
  const dateReveal = useAnimatedStyle(() => {
    const p = (height.value - COLLAPSED) / (EXPANDED - COLLAPSED);
    const local = Math.max(0, Math.min(1, p / 0.35));
    return { opacity: local, transform: [{ translateY: (1 - local) * 8 }] };
  });

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
        {/* borderWidth:0 suppresses GlassSurface's own (square, fixed-bright) fallback
            rim — the dock's rim is the night-themed one on the rounded `clip` above. */}
        <GlassSurface
          style={[StyleSheet.absoluteFill, styles.glassFill]}
          interactive
          fallbackColor={c.surface}
        />

        {/* The card floats above the gesture bar (see DOCK_FLOAT), so the content only
            needs its own internal breathing here — no system-inset clearance. */}
        <View style={[styles.content, { paddingBottom: 10 }]} pointerEvents="box-none">
          {/* Revealed when expanded: the full day's schedule + transport. The rows
              and controls fade/slide in with the dock height, so nothing peeks while
              collapsed. Tap a row to ease the scrubber to it. */}
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
                  />
                );
              })}
            </View>
          </View>

          {/* Persistent summary, never moves. Collapsed it's the whole story: prayer
              (no "Nästa" — the countdown beside it makes that plain), time-left, then a
              quiet clock-time · place line. Expanded, the schedule above already names
              the prayer and its time, so it slims to just what the list can't say —
              time-left and place — instead of repeating the row. */}
          <View style={styles.hero}>
            {expanded ? (
              <View style={styles.heroTop}>
                {next ? (
                  <>
                    {/* When the next prayer is TOMORROW's (we're past Isha), it isn't in
                        today's schedule above, so no row is highlighted — name it here so
                        the countdown has a referent. For a today prayer the list already
                        names it, so we stay slim (countdown only). */}
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
            ) : (
              <>
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
              </>
            )}
          </View>

          <SolarTimeline
            styles={styles}
            fraction={clock.fraction}
            marks={marks}
            nextKey={next && !next.tomorrow ? next.key : null}
            onScrub={clock.setFraction}
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

// One schedule row. Self-reveals from the dock height with an index-based stagger,
// so as the dock grows the rows cascade in (and fold away on close) on the UI
// thread — no mount churn, and it tracks a half-open drag rather than snapping.
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
}) {
  const valid = date instanceof Date && Number.isFinite(date.getTime());
  const reveal = useAnimatedStyle(() => {
    const p = (dockHeight.value - collapsed) / (expanded - collapsed);
    const start = (index / total) * 0.45;
    const local = Math.max(0, Math.min(1, (p - start) / 0.55));
    return { opacity: local, transform: [{ translateY: (1 - local) * 10 }] };
  });

  return (
    <Animated.View style={reveal}>
      <Pressable
        disabled={!valid}
        onPress={onPress}
        style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${PRAYER_LABELS[prayerKey]} ${valid ? formatTime(date) : 'okänd'}`}
      >
        <View style={[styles.listDot, { backgroundColor: PRAYER_COLORS[prayerKey] }]} />
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
  nextKey,
  onScrub,
}: {
  styles: DockStyles;
  fraction: number;
  marks: DayMark[];
  nextKey: PrayerKey | null;
  onScrub: (f: number) => void;
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
        >
          <View style={styles.trackBase} />
          {/* Plain-style `width` first so the freshly-mounted fill already spans to the
              live position; the animated style (which can apply a frame late on mount)
              then takes over. Without it the fill flashes empty — same mount glitch the
              thumb's plain `left` below fixes. */}
          <Animated.View style={[styles.trackFill, { width: fraction * trackW }, fillStyle]} />
          {/* Prayer landmarks sit on the axis. Each colour-coded dot rides in a glass
              halo so it stays a clear figure even over the filled (elapsed) portion of
              the track; the next prayer gets a brass ring + extra size and is drawn last
              (zIndex) so a summer cluster can't occlude it, and the thumb (zIndex above
              all) reads cleanly when it passes over. */}
          {trackW > 0 &&
            marks.map((m) => {
              const isNext = nextKey === m.key;
              const isPast = m.fraction <= fraction;
              return (
                <View
                  key={m.key}
                  pointerEvents="none"
                  style={[
                    styles.markHalo,
                    isNext && styles.markHaloNext,
                    { left: m.fraction * trackW - (isNext ? 8 : 7) },
                  ]}
                >
                  <View
                    style={[
                      styles.mark,
                      isPast && styles.markPast,
                      isNext && styles.markNext,
                      { backgroundColor: PRAYER_COLORS[m.key] },
                    ]}
                  />
                </View>
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

// Styles built from the night-blended map chrome (see nightChrome). Layout is fixed; only
// colours come from `c` (where `surface` is the translucent glass).
function makeStyles(c: NightChrome) {
  return StyleSheet.create({
    shadowWrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      borderRadius: 22,
      ...shadow.card,
    },
    // The rim lives on this rounded, overflow-clipped container — NOT on the
    // GlassSurface backing (a square absoluteFill, see below). A border on the
    // square child gets corner-clipped by this radius so it can't trace the
    // rounding; on the rounded container it follows the corners exactly. And it's
    // the night-themed `c.hairline` (day: faint dark@0.08, night: soft white@0.13),
    // so it stays a subtle rim in both modes — unlike the fixed white@0.55 glass rim,
    // which was near-invisible on the light dock but a glaring bright edge on the dark one.
    clip: {
      flex: 1,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    glassFill: { borderWidth: 0 },
    // paddingTop clears the grab-handle zone (handleHit is 34 tall) plus a gap, so
    // the topmost content (the date header / hero) never sits cramped under the handle.
    content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 36 },

    dateHeader: { marginBottom: 12 },
    dateHijri: { fontSize: 16, fontWeight: '700', color: c.ink, letterSpacing: 0.2 },
    dateGreg: { fontSize: 12.5, color: c.inkMuted, marginTop: 1 },

    list: { marginBottom: 8 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 7,
    },
    listRowPressed: { opacity: 0.55 },
    listDot: { width: 8, height: 8, borderRadius: 4 },
    listLabel: { flex: 1, fontSize: 15, color: c.ink },
    listTime: { fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] },
    // The next prayer = brass everywhere (here, the countdown, the map pill), so
    // "what's coming" reads in one colour across the dock and the map.
    nextEmphasis: { color: c.highlight, fontWeight: '700' },

    pressed: { opacity: 0.6 },

    // Hero, two tiers. Top: prayer name + countdown (the glance). Sub: time · place (quiet).
    hero: { marginBottom: 4 },
    heroTop: { flexDirection: 'row', alignItems: 'center' },
    heroPrayer: { fontSize: 19, fontWeight: '700', color: c.ink, letterSpacing: 0.2 },
    // Expanded hero: a touch smaller than collapsed (the date header leads the open dock),
    // shown only when the next prayer is tomorrow's and thus absent from today's list.
    heroPrayerExpanded: { fontSize: 16, fontWeight: '700', color: c.ink, letterSpacing: 0.2 },
    heroTomorrow: { fontSize: 14, fontWeight: '400', color: c.inkMuted },
    heroNone: { fontSize: 16, color: c.inkMuted },
    countdown: { marginLeft: 8, fontSize: 18, fontWeight: '700', color: c.highlight, fontVariant: ['tabular-nums'] },
    countdownPrefix: { fontSize: 13, fontWeight: '400', color: c.inkMuted },
    // Unit ("t" / "min") at ~65% of the digit size, medium-weight, same brass.
    // Flush against the digit (no inter-character space) — the hierarchy +
    // proximity that the old equal-weight string lacked.
    countdownUnit: { fontSize: 12, fontWeight: '600', color: c.highlight },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8, flexShrink: 1, minWidth: 0 },
    subTime: { fontSize: 13, color: c.inkMuted, fontVariant: ['tabular-nums'] },
    subSep: { fontSize: 13, color: c.inkMuted },
    subPlace: { fontSize: 11.5, color: c.inkFaint, flexShrink: 1 },

    flex: { flex: 1 },
    previewBadge: {
      marginLeft: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: c.accentSoft,
    },
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
    // Mark on the axis: a colour-coded dot in a glass halo. The halo (surface fill +
    // hairline) lifts the dot off the track and the elapsed-fill beneath it, so every
    // prayer stays a distinct figure regardless of what it sits over.
    markHalo: {
      position: 'absolute',
      bottom: 8,
      width: 14,
      height: 14,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
    },
    markHaloNext: {
      width: 16,
      height: 16,
      borderRadius: 8,
      bottom: 7,
      borderColor: c.highlight,
      borderWidth: 1.5,
      backgroundColor: c.highlightSoft,
      zIndex: 2,
    },
    mark: { width: 7, height: 7, borderRadius: 4, opacity: 0.88 },
    markPast: { opacity: 1 },
    markNext: { width: 9, height: 9, borderRadius: 5, opacity: 1 },
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
