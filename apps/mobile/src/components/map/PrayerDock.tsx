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
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight, hapticSelection } from '../../lib/haptics';
import { formatTime, PRAYER_LABELS, PRAYER_ORDER, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import type { SolarClock } from '../../lib/solar/useSolarClock';
import { GlassSurface } from '../ui/GlassSurface';
import { mapTheme } from './theme';

const DAY_MS = 86_400_000;
const HOUR_TICKS = ['00', '06', '12', '18', '24'];
const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

// Dock heights (excluding the bottom safe-area inset, which the screen adds). The
// map reads these so it can frame Sweden *above* the dock in both states.
// The dock is a floating card: its bottom edge sits this far above the system
// gesture bar so it reads as a calm, separate surface — not welded to the screen
// edge (which feels stressful). The float + safe-area inset are added by the
// card's position, not its height.
export const DOCK_FLOAT = 10;

// Card heights (the rendered card itself, excluding the float + inset below it).
// Collapsed stays tight: a two-tier hero (prayer + countdown, then a quiet
// time · place line) over the scrubber — so the map keeps most of the screen.
export const DOCK_COLLAPSED_BASE = 132;
export const DOCK_EXPANDED_BASE = 370;

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
  onPlayPause: () => void;
  onShowLegend: () => void;
  /** Reports open/closed + the dock's pixel height, so the map can lift Sweden
      above the dock when expanded instead of being covered by it. */
  onExpandedChange?: (expanded: boolean, expandedHeight: number) => void;
}

// The glanceable answer: how long until the next prayer, without the "om" prefix
// (rendered separately so the duration can carry the visual weight).
function countdownValue(ms: number): string {
  if (ms <= 0) return 'nu';
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h} t ${m} min`;
}

export function PrayerDock({
  clock,
  times,
  marks,
  next,
  locationLabel,
  settings,
  onPlayPause,
  onShowLegend,
  onExpandedChange,
}: Props) {
  const insets = useSafeAreaInsets();
  // Card heights are the card itself; the float + safe-area inset live in the
  // position (bottom), so the card sits clear above the gesture bar.
  const COLLAPSED = DOCK_COLLAPSED_BASE;
  const EXPANDED = DOCK_EXPANDED_BASE;
  const MID = (COLLAPSED + EXPANDED) / 2;

  const height = useSharedValue(COLLAPSED);
  const startHeight = useSharedValue(COLLAPSED);
  const [expanded, setExpanded] = useState(false);

  // State change on the JS thread (from gesture worklets via runOnJS): flip the
  // flag, tap a light haptic on a real open/close, and tell the map to lift so it
  // never sits behind the open dock.
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
  const chevronStyle = useAnimatedStyle(() => {
    const p = (height.value - COLLAPSED) / (EXPANDED - COLLAPSED);
    return { transform: [{ rotate: `${p * 180}deg` }] };
  });
  // The transport row reveals in the back half of the open, after the schedule
  // rows have cascaded in — height-driven, so it tracks the drag directly.
  const controlsReveal = useAnimatedStyle(() => {
    const p = (height.value - COLLAPSED) / (EXPANDED - COLLAPSED);
    const local = Math.max(0, Math.min(1, (p - 0.4) / 0.6));
    return { opacity: local, transform: [{ translateY: (1 - local) * 10 }] };
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
      clock.setFraction((at - clock.dayStart) / DAY_MS);
    },
    [clock],
  );

  const handlePlayPause = useCallback(() => {
    hapticSelection();
    onPlayPause();
  }, [onPlayPause]);

  const cd = next ? countdownValue(next.at - clock.now) : null;

  // The "time left" / return-to-now control, shared by both hero layouts: live →
  // the countdown; scrubbed → a chip that taps back to now (the only such control,
  // so it's never duplicated or shown dead).
  const aside =
    clock.mode === 'live' ? (
      cd ? (
        <Text style={styles.countdown} numberOfLines={1}>
          {cd !== 'nu' ? <Text style={styles.countdownPrefix}>om </Text> : null}
          {cd === 'nu' ? 'nu' : cd}
        </Text>
      ) : null
    ) : (
      <Pressable
        onPress={resetToNow}
        style={({ pressed }) => [styles.previewBadge, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Återgå till nu"
      >
        <MaterialIcons name="restore" size={13} color={mapTheme.accent} />
        <Text style={styles.previewBadgeText}>Nu</Text>
      </Pressable>
    );

  return (
    <Animated.View
      style={[styles.shadowWrap, { bottom: insets.bottom + DOCK_FLOAT }, heightStyle]}
      pointerEvents="box-none"
    >
      <View style={styles.clip}>
        <GlassSurface style={StyleSheet.absoluteFill} interactive />

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
            <View style={styles.list}>
              {PRAYER_ORDER.map((key, i) => {
                const date = times[key];
                const at = date instanceof Date ? date.getTime() : Number.NaN;
                return (
                  <ScheduleRow
                    key={key}
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

            {/* Transport. Returning to "now" lives only on the hero chip (and only
                when you've scrubbed away), so it isn't duplicated — or shown dead —
                here. Location is in the hero too. This row is just: play the day, and
                what the map means. */}
            <Animated.View style={[styles.controls, controlsReveal]}>
              <Pressable
                onPress={handlePlayPause}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                accessibilityLabel={clock.playing ? 'Pausa' : 'Spela upp dygnet'}
              >
                <MaterialIcons
                  name={clock.playing ? 'pause' : 'play-arrow'}
                  size={24}
                  color={mapTheme.accent}
                />
              </Pressable>
              <View style={styles.flex} />
              <Pressable
                onPress={onShowLegend}
                hitSlop={8}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                accessibilityLabel="Förklaring av kartan"
              >
                <MaterialIcons name="info-outline" size={22} color={mapTheme.accent} />
              </Pressable>
            </Animated.View>
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
                  aside
                ) : (
                  <Text style={styles.heroNone} numberOfLines={1}>
                    Inga fler böner idag
                  </Text>
                )}
                <View style={styles.flex} />
                {next ? (
                  <View style={styles.heroPlaceRow}>
                    <MaterialIcons name="place" size={11} color={mapTheme.textMuted} />
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
                      {next.tomorrow ? <Text style={styles.heroTomorrow}> imorgon</Text> : null}
                    </Text>
                  ) : (
                    <Text style={styles.heroNone} numberOfLines={1}>
                      Inga fler böner idag
                    </Text>
                  )}
                  <View style={styles.flex} />
                  {next ? aside : null}
                </View>

                {next ? (
                  <View style={styles.heroSub}>
                    <Text style={styles.subTime}>{formatTime(new Date(next.at), settings)}</Text>
                    <Text style={styles.subSep}>·</Text>
                    <MaterialIcons name="place" size={11} color={mapTheme.textMuted} />
                    <Text style={styles.subPlace} numberOfLines={1}>
                      {locationLabel}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>

          <Scrubber fraction={clock.fraction} marks={marks} onScrub={clock.setFraction} />
        </View>

        {/* Grab handle — the signifier that the dock opens. Drag or tap to toggle. */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.handleHit}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Dölj bönetider' : 'Visa alla bönetider'}
            accessibilityState={{ expanded }}
          >
            <View style={styles.handle} />
            <Animated.View style={chevronStyle}>
              <MaterialIcons name="keyboard-arrow-up" size={20} color={mapTheme.textMuted} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

// One schedule row. Self-reveals from the dock height with an index-based stagger,
// so as the dock grows the rows cascade in (and fold away on close) on the UI
// thread — no mount churn, and it tracks a half-open drag rather than snapping.
function ScheduleRow({
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
        accessibilityLabel={`${PRAYER_LABELS[prayerKey]} ${valid ? formatTime(date, settings) : 'okänd'}`}
      >
        <View style={[styles.listDot, { backgroundColor: PRAYER_COLORS[prayerKey] }]} />
        <Text style={[styles.listLabel, isNext && styles.nextEmphasis]}>{PRAYER_LABELS[prayerKey]}</Text>
        <Text style={[styles.listTime, isNext && styles.nextEmphasis]}>
          {valid ? formatTime(date, settings) : '—'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// The 24-hour day slider lifted from the old TimeScrubber: a thin track with the
// user's prayers as coloured dots and a draggable thumb. While dragging, the thumb
// rides a shared value on the UI thread (60fps), and the heavier JS recompute
// (clock.setFraction → field GeoJSON) is throttled. When not dragging it follows
// the `fraction` prop directly. The shared values are mutated only inside gesture
// worklets (never in an effect), so the thumb stays the live source of truth.
function Scrubber({
  fraction,
  marks,
  onScrub,
}: {
  fraction: number;
  marks: DayMark[];
  onScrub: (f: number) => void;
}) {
  const [trackW, setTrackW] = useState(0);
  const prog = useSharedValue(fraction);
  const dragging = useSharedValue(false);
  const lastHaptic = useSharedValue(fraction);
  const lastSent = useSharedValue(fraction);

  const markFractions = marks.map((m) => m.fraction);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true;
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
      runOnJS(onScrub)(prog.value);
    });

  // Dragging → follow the gesture (UI thread); otherwise sit at the prop's
  // fraction (live tick, playback, a tapped row). trackW + fraction are captured
  // at render, so the thumb repositions when the track lays out or the time moves.
  const fillStyle = useAnimatedStyle(() => ({
    width: (dragging.value ? prog.value : fraction) * trackW,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: (dragging.value ? prog.value : fraction) * trackW - 9,
  }));

  return (
    <View style={styles.sliderArea}>
      <GestureDetector gesture={pan}>
        <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
          <View style={styles.trackBase} />
          <Animated.View style={[styles.trackFill, fillStyle]} />
          {trackW > 0 &&
            marks.map((m) => (
              <View
                key={m.key}
                pointerEvents="none"
                style={[styles.mark, { left: m.fraction * trackW - 3, backgroundColor: PRAYER_COLORS[m.key] }]}
              />
            ))}
          {trackW > 0 && <Animated.View pointerEvents="none" style={[styles.thumb, thumbStyle]} />}
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

const styles = StyleSheet.create({
  shadowWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 22,
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  clip: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 28 },

  list: { marginBottom: 8 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  listRowPressed: { opacity: 0.55 },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  listLabel: { flex: 1, fontSize: 15, color: mapTheme.text },
  listTime: { fontSize: 15, color: mapTheme.text, fontVariant: ['tabular-nums'] },
  nextEmphasis: { color: mapTheme.accent, fontWeight: '700' },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mapTheme.accentSoft,
  },
  pressed: { opacity: 0.6 },

  // Hero, two tiers. Top: prayer name + countdown (the glance). Sub: time · place (quiet).
  hero: { marginBottom: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroPrayer: { fontSize: 19, fontWeight: '700', color: mapTheme.text, letterSpacing: 0.2 },
  heroTomorrow: { fontSize: 14, fontWeight: '400', color: mapTheme.textMuted },
  heroNone: { fontSize: 16, color: mapTheme.textMuted },
  countdown: { marginLeft: 8, fontSize: 18, fontWeight: '700', color: mapTheme.accent, fontVariant: ['tabular-nums'] },
  countdownPrefix: { fontSize: 13, fontWeight: '400', color: mapTheme.textMuted },
  heroSub: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  heroPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8, flexShrink: 1, minWidth: 0 },
  subTime: { fontSize: 13, color: mapTheme.textMuted, fontVariant: ['tabular-nums'] },
  subSep: { fontSize: 13, color: mapTheme.textMuted },
  subPlace: { fontSize: 13, color: mapTheme.textMuted, flexShrink: 1 },

  flex: { flex: 1 },
  previewBadge: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: mapTheme.accentSoft,
  },
  previewBadgeText: { fontSize: 12, fontWeight: '700', color: mapTheme.accent },

  sliderArea: {},
  track: { height: 28, justifyContent: 'center' },
  trackBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: mapTheme.track },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: mapTheme.trackFill },
  mark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, top: 11 },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    top: 5,
    backgroundColor: mapTheme.thumb,
    borderColor: mapTheme.accent,
    borderWidth: 2,
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  tick: { fontSize: 10, color: mapTheme.textMuted, fontVariant: ['tabular-nums'] },

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
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(17,24,28,0.18)' },
});
