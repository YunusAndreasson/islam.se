// The single bottom surface — it replaces both the old top StatusCard and the
// bottom TimeScrubber. One glass dock, pinned to the bottom, that grows upward.
//
// Gestalt proximity / common region: everything about *time* now lives together —
// the day scrubber, what prayer is next, and (when expanded) the full schedule.
// Progressive disclosure (Norman): collapsed it shows only what's next + the
// scrubber, keeping the map the hero; a grab handle signifies it opens, and a
// drag/tap reveals the full list, transport controls and the legend. The scrubber
// stays put at the bottom in both states so the control you reach for never moves.
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
export const DOCK_COLLAPSED_BASE = 116;
export const DOCK_EXPANDED_BASE = 372;

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

function countdown(ms: number): string {
  if (ms <= 0) return 'nu';
  const mins = Math.round(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `om ${m} min`;
  return `om ${h} t ${m} min`;
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
  const COLLAPSED = DOCK_COLLAPSED_BASE + insets.bottom;
  const EXPANDED = DOCK_EXPANDED_BASE + insets.bottom;
  const MID = (COLLAPSED + EXPANDED) / 2;

  const height = useSharedValue(COLLAPSED);
  const startHeight = useSharedValue(COLLAPSED);
  const [expanded, setExpanded] = useState(false);

  // State change on the JS thread (from gesture worklets via runOnJS): update the
  // local flag and tell the map to lift, so it never sits behind the open dock.
  const applyExpanded = useCallback(
    (open: boolean) => {
      setExpanded(open);
      onExpandedChange?.(open, EXPANDED);
    },
    [onExpandedChange, EXPANDED],
  );

  const pan = Gesture.Pan()
    .onStart(() => {
      startHeight.value = height.value;
    })
    .onUpdate((e) => {
      const next = startHeight.value - e.translationY;
      height.value = Math.min(EXPANDED, Math.max(COLLAPSED, next));
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
  // Fade the expandable content in as the dock grows, so nothing peeks above the
  // collapsed summary and the schedule reveals smoothly on the way up.
  const revealStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, (height.value - COLLAPSED) / 72)),
  }));

  // Tapping a prayer in the list time-travels the scrubber to that prayer.
  const scrubTo = useCallback(
    (at: number) => {
      if (!Number.isFinite(at)) return;
      clock.setFraction((at - clock.dayStart) / DAY_MS);
    },
    [clock],
  );

  return (
    <Animated.View style={[styles.shadowWrap, { bottom: 0 }, heightStyle]} pointerEvents="box-none">
      <View style={styles.clip}>
        <GlassSurface style={StyleSheet.absoluteFill} interactive />

        <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
          {/* Revealed when expanded: the full day's schedule + transport. Fades with
              the dock height so it never peeks while collapsed. Tap a row to jump to it. */}
          <Animated.View
            style={revealStyle}
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          >
          <View style={styles.list}>
            {PRAYER_ORDER.map((key) => {
              const date = times[key];
              const at = date instanceof Date ? date.getTime() : Number.NaN;
              const valid = Number.isFinite(at);
              const isNext = next?.key === key && !next.tomorrow;
              return (
                <Pressable
                  key={key}
                  disabled={!valid}
                  onPress={() => scrubTo(at)}
                  style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${PRAYER_LABELS[key]} ${valid ? formatTime(date, settings) : 'okänd'}`}
                >
                  <View style={[styles.listDot, { backgroundColor: PRAYER_COLORS[key] }]} />
                  <Text style={[styles.listLabel, isNext && styles.nextEmphasis]}>
                    {PRAYER_LABELS[key]}
                  </Text>
                  <Text style={[styles.listTime, isNext && styles.nextEmphasis]}>
                    {valid ? formatTime(date, settings) : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Transport + context. */}
          <View style={styles.controls}>
            <Pressable
              onPress={onPlayPause}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityLabel={clock.playing ? 'Pausa' : 'Spela upp dygnet'}
            >
              <MaterialIcons
                name={clock.playing ? 'pause' : 'play-arrow'}
                size={24}
                color={mapTheme.accent}
              />
            </Pressable>
            <Pressable
              onPress={clock.reset}
              disabled={clock.mode === 'live'}
              style={({ pressed }) => [
                styles.nowBtn,
                clock.mode === 'live' && styles.nowBtnDisabled,
                pressed && styles.pressed,
              ]}
              accessibilityLabel="Återgå till nu"
            >
              <Text style={[styles.nowText, clock.mode === 'live' && styles.nowTextDisabled]}>Nu</Text>
            </Pressable>
            <Text style={styles.location} numberOfLines={1}>
              {locationLabel}
            </Text>
            <Pressable
              onPress={onShowLegend}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              accessibilityLabel="Förklaring av kartan"
            >
              <MaterialIcons name="info-outline" size={22} color={mapTheme.accent} />
            </Pressable>
          </View>
          </Animated.View>

          {/* Always visible: what's next (relative to the shown instant) + the scrubber. */}
          <View style={styles.summaryRow}>
            {next ? (
              <Text style={styles.summaryText} numberOfLines={1}>
                <Text style={styles.summaryMuted}>Nästa </Text>
                <Text style={styles.summaryPrayer}>{PRAYER_LABELS[next.key]}</Text>
                {next.tomorrow ? <Text style={styles.summaryMuted}> imorgon</Text> : null}
                <Text style={styles.summaryTime}>{`  ${formatTime(new Date(next.at), settings)}`}</Text>
              </Text>
            ) : (
              <Text style={styles.summaryMuted}>Inga fler böner idag</Text>
            )}
            <View style={styles.flex} />
            {clock.mode === 'live' ? (
              next ? (
                <Text style={styles.summaryMuted}>{countdown(next.at - clock.now)}</Text>
              ) : null
            ) : (
              // Preview mode: the chip both signals it and taps back to "now",
              // so returning to live never requires expanding the dock.
              <Pressable
                onPress={clock.reset}
                style={({ pressed }) => [styles.previewBadge, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Återgå till nu"
              >
                <MaterialIcons name="restore" size={13} color={mapTheme.accent} />
                <Text style={styles.previewBadgeText}>Nu</Text>
              </Pressable>
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

// The 24-hour day slider lifted from the old TimeScrubber: a thin track with the
// user's prayers as coloured dots and a draggable thumb. Drag scrubs the whole
// visualisation; the dots show where the day's prayers fall.
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

  // No refs: close over the measured width + onScrub directly. The responder is
  // rebuilt only when the track is laid out or onScrub changes (both rare/stable),
  // so each gesture maps the touch x to a 0..1 fraction against the current width.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (trackW > 0) onScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW)));
        },
        onPanResponderMove: (e) => {
          if (trackW > 0) onScrub(Math.max(0, Math.min(1, e.nativeEvent.locationX / trackW)));
        },
      }),
    [trackW, onScrub],
  );

  return (
    <View style={styles.sliderArea}>
      <View
        style={styles.track}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
      >
        <View style={styles.trackBase} />
        <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
        {trackW > 0 &&
          marks.map((m) => (
            <View
              key={m.key}
              pointerEvents="none"
              style={[styles.mark, { left: m.fraction * trackW - 3, backgroundColor: PRAYER_COLORS[m.key] }]}
            />
          ))}
        {trackW > 0 && (
          <View pointerEvents="none" style={[styles.thumb, { left: fraction * trackW - 9 }]} />
        )}
      </View>
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
  nowBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mapTheme.accentSoft,
  },
  nowBtnDisabled: { backgroundColor: 'rgba(17,24,28,0.05)' },
  nowText: { fontSize: 15, fontWeight: '700', color: mapTheme.accent },
  nowTextDisabled: { color: mapTheme.textMuted },
  pressed: { opacity: 0.6 },
  location: { flex: 1, fontSize: 13, color: mapTheme.textMuted, textAlign: 'right' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  summaryText: { fontSize: 16, color: mapTheme.text },
  summaryMuted: { fontSize: 13, color: mapTheme.textMuted },
  summaryPrayer: { fontSize: 16, fontWeight: '700', color: mapTheme.text },
  summaryTime: { fontSize: 16, color: mapTheme.text, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
  previewBadge: {
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
