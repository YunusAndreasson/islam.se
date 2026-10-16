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
// Theme: the dock is CHROME, so its light/dark axis follows the phone's OS setting via
// useColors() — Apple Maps-style. The earlier sun-driven dock flip was retired and stays
// retired: the THEME never follows the sun, because that axis is app-wide (the Stack ground,
// every sheet) and would override a reader who locked Utseende: Ljust.
//
// Its GROUND does follow the sun, which is a different thing. `surface` was picked as a warm
// white card on warm parchment land — true at noon, and the wash repaints that land blue for
// half the day, which left a warm slab floating on a night sky. The tint now comes from
// theme/skyChrome, one value shared with every other card on the map. Ink, accent and brass
// are untouched: only the material under them changes temperature.
import type { PrayerTimes } from 'adhan';
import { router } from 'expo-router';
import {
  type Ref,
  useImperativeHandle,
  Fragment,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type ColorSchemeName,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import {
  hapticGrab,
  hapticRelease,
  hapticSelection,
  hapticToggle,
} from '@/lib/haptics';
import { formatGregorian, formatHijri } from '@/lib/hijri';
import {
  computeNightTimes,
  NIGHT_LABELS,
  NIGHT_ORDER,
  NIGHT_SWEDISH_NAMES,
  type NightTimes,
} from '@/lib/night-times';
import { relativeDayLabel } from '@/lib/relative-day';
import {
  formatTime,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
  type NextPrayer,
} from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { zonePrayerDate } from '@/lib/zone-time';
import { prayerColorFor, prayerTextColorFor } from '@/lib/solar/palette';
import { MAX_DAY_OFFSET, type SolarClock } from '@/lib/solar/useSolarClock';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { hexToRgba } from '@/theme/rgba';
import { useSkyGlass } from '@/theme/skyChrome';
import { useActiveScheme, useColors } from '@/theme/useColors';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { DayPicker } from './DayPicker';
import { Icon } from '@/components/ui/Icon';
import { chipStyles } from '@/components/ui/chip';
import { StepperPill } from '@/components/ui/StepperPill';
import { useNavMetrics } from '@/components/nav/metrics';
import { DOCK_FOOTER_PAD, DOCK_HANDLE_H, DOCK_HERO_GAP, dockMetrics, TRACK_BAND_H } from './dock-metrics';
import { makeTimelineWarp } from '@/lib/timeline-warp';
import { scrubGrabOffset } from '@/lib/map/scrub-grab';

const DAY_MS = 86_400_000;
/** Hours the ruler under the scrubber marks; multiples of six also have labels. Positioned by their true fraction of the
 *  viewed day (see `ticks`) rather than spaced evenly, so the ruler agrees with the
 *  prayer marks and thumb — which have always been placed off the REAL 23/24/25 h day. */
const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
// The timeline declares accessibilityRole="adjustable"; these are the actions that role
// promises. Module-level so the array identity is stable across renders.
const TIMELINE_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }] as const;
/** Fallback step for the adjustable timeline where there is no further prayer to land on. */
const TIMELINE_STEP_MS = 15 * 60_000;
/** How far the finger must travel ALONG THE TRACK before a drag ships another time to the
 *  clock. ≈0.6 px on a 375 pt screen — under the eye's threshold for the readout, and the
 *  brake on how often the whole solar field is rebuilt mid-drag. */
const SCRUB_SEND_STEP = 0.0025;
// The app's one canonical snap spring (tokens.motion.spring), aliased locally so the
// worklet call sites stay terse.
const SPRING = motion.spring;
/** The scrubber knob's diameter. Its centre is what sits on the track, so every `left` that
 *  places it subtracts half of this. */
const THUMB = 16;
/** The diameter of a prayer's pip on the timeline. The schedule above it carries the same
 *  colours on the prayer NAMES, so the two read as one key without a second dot. */
const PRAYER_DOT = 7;

// How far a finger must travel before a toggle gesture counts as a DRAG rather than a press
// that wobbled. gesture-handler hands the pan priority over the tap the moment a touch clears
// its own activation slop (~10 dp), and the pan then decided the outcome by height — which for
// a barely-moved card reads "below MID, so closed", so it sprang the card back to exactly where
// it already sat, changed no state and fired no haptic. A dead press, and the reason a
// slightly-imprecise tap on the handle did nothing at all.
//
// The value is picked from what is at stake either side of it, not from feel. Guess too high
// and a small deliberate drag toggles instead of snapping back — trivially undone. Guess too
// low and the press is dead — indistinguishable, to the user, from a broken control. So it sits
// well clear of the platform's own tap threshold (8 dp on Android, ~10 pt on iOS) while staying
// an eighth of the ~200 dp the card actually travels: past this the finger has expressed a
// direction, below it the card has moved a distance nobody can see.
const TOGGLE_DRAG_SLOP = 24;
/** Past this, a release is a fling and its DIRECTION decides — below it, the card's position does. */
const FLING_VELOCITY = 350;

/**
 * How much of a pull PAST the open height the card actually travels.
 *
 * A hard stop at the limit reads as a broken control: the finger keeps moving and the card
 * refuses, which is the one thing no native sheet does. Only the TOP end stretches. The card
 * is bottom-pinned and clipped, so growing past EXPANDED simply opens a band of glass above
 * the date crown — exactly what an iOS sheet does when you pull it past its largest detent —
 * while shrinking below COLLAPSED would crop the scrubber off the bottom of its own card.
 * The floor stays hard.
 */
const OVERDRAG_RESISTANCE = 0.12;

/** Below this open-fraction the card counts as sitting on its collapsed seat. */
const MOUNT_EPSILON = 0.004;

/**
 * Where a finished toggle gesture leaves the card: `true` to open, `false` to close.
 *
 * Pure, and exported so the rule can be exercised directly — each branch below is a distinct
 * way the dock has misread a gesture, and none of them is visible from reading the caller.
 */
export function resolveToggle(g: {
  /**
   * Peak |finger travel| during the gesture, in points.
   *
   * NOT the card's travel: the card is clamped at both ends, so pushing DOWN on an
   * already-closed dock moves it zero points, and a card-travel reading would call that a tap
   * and open the very thing being pushed shut. NOT the final translation either: a drag that
   * goes up and comes back to the origin ends at zero, and the user who changed their mind
   * would have had it open on them.
   */
  travelled: number;
  /** The card's height when the finger landed. */
  startHeight: number;
  /** Its height at release. */
  height: number;
  velocityY: number;
  mid: number;
}): boolean {
  'worklet';
  // A press that merely drifted is still a press — resolve it the way `tap` does, from where
  // the gesture began rather than from a height that never meaningfully changed.
  if (g.travelled <= TOGGLE_DRAG_SLOP) return g.startHeight < g.mid;
  if (g.velocityY < -FLING_VELOCITY) return true;
  if (g.velocityY > FLING_VELOCITY) return false;
  return g.height > g.mid;
}

/** What the dock's toggle drag reads and drives. */
interface TogglePanState {
  height: SharedValue<number>;
  startHeight: SharedValue<number>;
  farthest: SharedValue<number>;
  /** The open height, on the UI thread. */
  expanded: SharedValue<number>;
  targetOpen: SharedValue<boolean>;
  collapsed: number;
  /** Worklets — each carries its own 'worklet' directive. */
  armSchedule: () => void;
  disarmScheduleIfIdle: () => void;
  /** JS-thread state change, reached through scheduleOnRN. */
  applyExpanded: (open: boolean) => void;
}

/**
 * A drag that grows/shrinks the dock and snaps open/closed on release. A hook, so the handle
 * and the hero each get their OWN gesture — gesture-handler does not allow one gesture on two
 * GestureDetectors. The callbacks are written inline in the config on purpose: that is what
 * the worklets Babel plugin recognises and workletizes for `usePanGesture`, and a config
 * assembled elsewhere and passed in would reach the UI thread as plain JS functions.
 */
function useTogglePan({
  height,
  startHeight,
  farthest,
  expanded,
  targetOpen,
  collapsed,
  armSchedule,
  disarmScheduleIfIdle,
  applyExpanded,
}: TogglePanState) {
  return usePanGesture({
    onBegin: armSchedule,
    onActivate: () => {
      startHeight.set(height.get());
      farthest.set(0);
    },
    onUpdate: (e) => {
      const ceiling = expanded.get();
      const raw = startHeight.get() - e.translationY;
      // Soft ceiling, hard floor — see OVERDRAG_RESISTANCE.
      height.set(
        raw > ceiling
          ? ceiling + (raw - ceiling) * OVERDRAG_RESISTANCE
          : Math.max(collapsed, raw),
      );
      // The FARTHEST the finger ever got, not where it ended: a gesture that goes up and
      // comes back to the origin was a drag the user changed their mind about, and reading
      // only the final translation would call it a tap and toggle the card open.
      farthest.set(Math.max(farthest.get(), Math.abs(e.translationY)));
    },
    // Runs for a cancelled drag too (`e.canceled`), deliberately: a card the system took the
    // touch away from still has to come to rest open or shut, not stop wherever it was.
    onDeactivate: (e) => {
      const ceiling = expanded.get();
      const open = resolveToggle({
        travelled: farthest.get(),
        startHeight: startHeight.get(),
        height: height.get(),
        velocityY: e.velocityY,
        mid: (collapsed + ceiling) / 2,
      });
      targetOpen.set(open);
      // Hand the finger's own momentum to the spring. gesture-handler reports velocityY in
      // POINTS PER SECOND and `height` is in points, so the only conversion needed is the
      // sign: the card grows as the finger goes up, which is negative translationY. Without
      // this the card stopped dead at the lift and the spring restarted from rest — a visible
      // stall at the exact moment the finger leaves, and the one thing that read as "not a
      // real sheet" however well the rest of the reveal tracked the drag.
      //
      // overshootClamping comes WITH it, not instead of it. Released from rest this spring
      // (ζ ≈ 0.91) overshoots by about a third of a point and nobody could see it; carrying a
      // hard flick's momentum, it has the energy to bounce a visible band of empty glass in
      // above the date crown, or to crop the scrubber at the other end. The card is clipped
      // to its own height, so there is nothing on either side for it to bounce into.
      height.set(withSpring(open ? ceiling : collapsed, {
        ...SPRING,
        velocity: -e.velocityY,
        overshootClamping: true,
      }));
      scheduleOnRN(applyExpanded, open);
    },
    onFinalize: disarmScheduleIfIdle,
  });
}

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
export const DOCK_COLLAPSED_BASE = dockMetrics(1).collapsed;
// Expanded = collapsed + the schedule block that unfolds above the hero (the date crown
// and the rows), because the content is bottom-pinned: opening the card adds exactly that
// block on top of the summary and scrubber, which never move.
//
// That block is MEASURED rather than declared. It was a constant (396 for the card, +108
// while the night group was on), and a constant cannot know the reader's text size: at
// Android's 1.5× the rows grew, the whole block slid up past the card's top edge, and the
// Hijri date — the line the crown exists for — was clipped away entirely while "Tisdag 25
// augusti" collided with the grab handle. Measuring also retires the night-group constant
// and covers a longer month name in any future locale.
//
// The fallback is only for the frame before the first onLayout: the six rows and the two
// date lines at the default text size, night group included when it is on (rule 12 + 4,
// caption 18 + 4, two compact rows of 30 — see listRowCompact).
const SCHEDULE_FALLBACK = 260;
const NIGHT_GROUP_FALLBACK = 98;
/** Stable identity so the `night` memo doesn't hand a fresh object down every render
 *  while the group is off. */
const EMPTY_NIGHT: NightTimes = { middleOfNight: null, lastThird: null };

// Re-exported, not redeclared: `selectNextPrayer` in lib/prayer-times is what BUILDS this
// value, so the shape belongs beside it — as two structurally-identical declarations they were
// bound only by inference, and a field added on one side would have surfaced at bonetider's
// annotation rather than at the function that produces it. The name stays exported from here
// because the dock's props are what call sites read.
//
// Spelled with the `from` clause rather than as `export type { NextPrayer }` over the local
// import. The two are equivalent to tsc, but the bare form needs the imported binding to still
// exist when the export is checked — and a type-only import is erased — so it is one babel
// config away from "Export 'NextPrayer' is not defined". Metro said exactly that during an edit
// that had added the export a moment before the import.
export type { NextPrayer } from '@/lib/prayer-times';

export interface DayMark {
  key: PrayerKey;
  /** 0..1 position within the day. */
  fraction: number;
}

export interface PrayerDockHandle {
  /** Returns true when this tap dismissed an open dock. */
  collapse: () => boolean;
}

interface Props {
  /** Other entry points open the dock's own calendar instead of a second picker. */
  calendarRequested?: boolean;
  onCalendarClose?: () => void;
  ref?: Ref<PrayerDockHandle>;
  clock: SolarClock;
  /** The user's own prayer times for the viewed day, straight from adhan. Typed as the
   *  library's own object rather than a `Record<PrayerKey, Date>` projection because the
   *  night group derives from the whole day (SunnahTimes needs the coordinates and
   *  parameters that ride along on it), and every caller already has one. */
  times: PrayerTimes;
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
  ref,
  calendarRequested = false,
  onCalendarClose,
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
  // Ink, accent and brass: the OS theme's, never the sun's (see the header).
  const c = useColors();
  const scheme = useActiveScheme();
  // The card's own ground follows the sky it floats on (see theme/skyChrome); everything
  // else about the dock — ink, accent, brass — stays on the palette.
  const sky = useSkyGlass();
  const { fontScale, width: screenWidth, height: screenHeight } = useWindowDimensions();
  const roomyDate = screenWidth < 360 || fontScale > 1.3;
  const stackedSummary = fontScale > 1.3;
  const metrics = dockMetrics(fontScale);
  const { laneTop } = useNavMetrics();
  const styles = useMemo(() => makeStyles(c, fontScale), [c, fontScale]);

  // Card heights are the card itself; the float + safe-area inset live in the
  // position (bottom), so the card sits clear above the gesture bar.
  const COLLAPSED = metrics.collapsed;
  const scheduleRoom = Math.max(96, screenHeight - insets.top - insets.bottom - DOCK_FLOAT - laneTop - 12 - COLLAPSED);
  // The night group is opt-in, so the open card grows only for the readers who asked for
  // it. Everyone else sees the dock they had.
  const showNight = settings.showNightTimes;

  const [expanded, setExpanded] = useState(false);
  // Whether the schedule subtree is in the tree AT ALL — deliberately not `expanded`. The
  // rows reveal off `height` on the UI thread (see ScheduleRow), which can only track a
  // half-open drag if they already exist while the finger is moving. Keyed to `expanded`
  // they did not: the card grew an EMPTY box under the thumb and the whole list popped in at
  // release, so the dock never finished opening until you let go of it. Driven by the
  // reaction further down, off the card's own height.
  const [mounted, setMounted] = useState(false);
  // The gate the schedule actually renders behind. `expanded` alone is too LATE — it only
  // flips at release, which is the whole bug this pair exists to fix — and `mounted` alone is
  // too narrow, since it comes off a reaction that only speaks while the height is moving.
  // Either one opens the window: the reaction opens it early, under the finger, and holds it
  // through the closing spring; `expanded` guarantees it for every path that never animates
  // at all (assistive-tech activation of the handle, and the test renderer).
  const showSchedule = expanded || mounted;

  // What the schedule block actually measures, once it has laid out. Rounded up to whole
  // points: onLayout reports fractional heights, and letting that jitter through would
  // re-render (and re-spring) the card for a third of a pixel.
  const [scheduleHeight, setScheduleHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(64);
  const onHeaderLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setHeaderHeight((previous) => previous === h ? previous : h);
  };
  const onScheduleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // ONLY a layout with the rows actually in it describes the open card. Before the first
      // open the rows are absent, and accepting that empty layout would set
      // EXPANDED to a height with no schedule inside it: the card opened to a sliver, sat
      // there under the thumb, and jumped to its real height only once release mounted the
      // rows. That two-stage open is most of why the dock read as waiting for the finger to
      // come off it. Gated on the same `showSchedule` the rows render behind, so the callback
      // that receives a layout is always the one that was current for the render producing it.
      if (!showSchedule) return;
      const h = Math.ceil(e.nativeEvent.layout.height);
      setScheduleHeight((prev) => (prev === h ? prev : h));
    },
    [showSchedule],
  );
  const EXPANDED =
    COLLAPSED + Math.min(scheduleRoom, scheduleHeight === null ? SCHEDULE_FALLBACK + (showNight ? NIGHT_GROUP_FALLBACK : 0) : headerHeight + scheduleHeight);

  /**
   * EXPANDED as the GESTURES see it, and the reason it is a shared value rather than the plain
   * constant they used to close over.
   *
   * gesture-handler will not swap a handler's config once it has begun, so a touch that is
   * already in flight keeps the worklet it started with — including whatever EXPANDED was at
   * that moment. That used to be harmless, because the schedule only mounted once the card was
   * already moving and the measurement therefore landed after the gesture was over. Arming the
   * mount at touch-down (see armSchedule) moves the first measurement INTO the gesture: the
   * rows mount, the block lays out, EXPANDED jumps from the fallback to what it really is, and
   * the finger lifts into a worklet still holding the old number. Measured on the emulator, the
   * first open then settled ~50 dp short and stayed there — the date crown clipped under the
   * grab handle — while every open after it was correct.
   *
   * Reading the target at spring time fixes that at the root, and covers the same staleness for
   * the night group being toggled while a finger is down.
   */
  const expandedSV = useSharedValue(EXPANDED);

  const height = useSharedValue(COLLAPSED);
  const startHeight = useSharedValue(COLLAPSED);
  // Peak finger travel within one toggle gesture — see TOGGLE_DRAG_SLOP.
  const farthest = useSharedValue(0);
  // The calendar sheet. Local to the dock: it writes through clock.goToDay and holds no
  // state of its own beyond which month is being browsed.
  const [pickingDay, setPickingDay] = useState(false);

  // One open-fraction (0 collapsed → 1 expanded) that EVERY reveal reads, so the
  // whole dock unfolds off a single continuous value instead of three independent
  // recomputations swapping on a JS boolean. The spring can overshoot past EXPANDED,
  // so every interpolate() below clamps. (Reanimated's canonical bottom-sheet pattern.)
  const progress = useDerivedValue(() => (height.value - COLLAPSED) / (EXPANDED - COLLAPSED));

  // The mounted flag follows the card's own height rather than any gesture callback, because
  // the height is the one thing a drag, a tap, a fling and the launch reveal all agree on —
  // and because a gesture that arms a flag has no matching event to disarm it (a tap cancels
  // the pan that would have; a spring outlives the release that started it). The mirrors are
  // a shared value so the worklet never reads React state.
  const mountedSV = useSharedValue(false);
  // Where the card is HEADED — which is not what its height says for the frame right after a
  // release, because a spring that has just been handed a target has not moved yet. Only the
  // disarm below reads it, and only to tell "this touch is over and the card is staying shut"
  // from "this touch just aimed it open".
  const targetOpen = useSharedValue(false);

  // Mounting the schedule is the most expensive render the dock does, and keying it to the
  // card's height meant paying it WHILE the finger was already dragging — on the very frames
  // the gesture is judged by. `onBegin` fires when the pan starts receiving touches, before it
  // has activated, so the rows go into the tree during the ~10 dp of travel gesture-handler
  // needs before it will even call onUpdate. Nothing appears any earlier: the reveal is still
  // driven entirely by `height`, and at rest every row interpolates to opacity 0.
  const armSchedule = () => {
    'worklet';
    if (mountedSV.value) return;
    mountedSV.value = true;
    scheduleOnRN(setMounted, true);
  };
  // ...and give the rows back when that touch turns out not to have moved the card. The
  // reaction below is the normal unmount path, but it only speaks when the height CHANGES, so
  // a touch that never became a drag and never toggled anything — a tap on the hero's own "Nu"
  // chip, a system-cancelled touch — would otherwise strand a full schedule behind a closed
  // card, which is precisely the tree a screen reader must not find (see ScheduleRow).
  const disarmScheduleIfIdle = () => {
    'worklet';
    if (!mountedSV.value || targetOpen.value || progress.value > MOUNT_EPSILON) return;
    mountedSV.value = false;
    scheduleOnRN(setMounted, false);
  };

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      // In the tree as soon as the card is off its seat (~1px of the travel), out again once
      // it has settled back onto it — so rows are never torn out from under a moving edge.
      const wantMounted = p > MOUNT_EPSILON;
      if (wantMounted !== mountedSV.value) {
        mountedSV.value = wantMounted;
        scheduleOnRN(setMounted, wantMounted);
      }

    },
  );

  // State change on the JS thread (from gesture worklets via scheduleOnRN): flip the flag,
  // tap a light haptic on a real open/close, and notify the host if it cares.
  const applyExpanded = useCallback(
    (open: boolean) => {
      if (open !== expanded) hapticToggle(open);
      // The spring is already running on the UI thread. Treat the settled flags as
      // non-urgent so React can yield instead of making that animation wait behind them.
      startTransition(() => {
        setExpanded(open);
      });
      onExpandedChange?.(open, EXPANDED);
    },
    [expanded, onExpandedChange, EXPANDED],
  );

  const togglePan = {
    height,
    startHeight,
    farthest,
    expanded: expandedSV,
    targetOpen,
    collapsed: COLLAPSED,
    armSchedule,
    disarmScheduleIfIdle,
    applyExpanded,
  };

  // No velocity handoff here, and none in the two paths below: a tap, the launch reveal and an
  // assistive-tech activation all start the card from rest, which is what the bare token means.
  const tap = useTapGesture({
    onDeactivate: (e) => {
      if (e.canceled) return;
      const ceiling = expandedSV.value;
      const open = height.value < (COLLAPSED + ceiling) / 2;
      targetOpen.value = open;
      // Re-arm rather than trust the pan's. useExclusiveGestures lets this tap win only once
      // the pan has FAILED, so the pan's onFinalize — and with it the disarm — has already run
      // by the time we get here, on a card still sitting at its collapsed height. Without this
      // the tap-to-open path would unmount the schedule and mount it again one frame later,
      // spending the render onBegin exists to move out of the way.
      armSchedule();
      height.value = withSpring(open ? ceiling : COLLAPSED, SPRING);
      scheduleOnRN(applyExpanded, open);
    },
  });

  // The launch schedule reveal: the host flips `revealSchedule` and the dock springs
  // to match, so the schedule reveals off the SAME `progress` a drag drives — no
  // second animation to keep in sync with the first. Deliberately silent: hapticToggle is
  // for a control snapping under the user's own finger (see lib/haptics), and this opens
  // on its own. The user is still free to grab the dock mid-reveal — the gesture worklets
  // assign `height` directly, overwriting this spring.
  const revealArmed = useRef(false);
  // Only `revealSchedule` should retrigger the reveal; onExpandedChange is the host's
  // callback, and re-running on ITS identity would reopen the dock on an unrelated parent
  // render. The Effect Event always calls the LATEST onExpandedChange without being a
  // dependency, so the effect below can list just [revealSchedule].
  // Springs the card to `open`'s height and tells the host, WITHOUT touching React state —
  // so it can also serve the height re-sync below, where the open/closed flag is already
  // correct and setting it again would only cascade a render.
  const springTo = useEffectEvent((open: boolean) => {
    targetOpen.value = open;
    height.value = withSpring(open ? EXPANDED : COLLAPSED, SPRING);
    onExpandedChange?.(open, EXPANDED);
  });
  const onReveal = useEffectEvent((open: boolean) => {
    springTo(open);
    startTransition(() => {
      setExpanded(open);
    });
  });
  useEffect(() => {
    // Skip the mount pass: `revealSchedule` starts false and the dock is already collapsed,
    // so acting here would only fire a spurious onExpandedChange(false) at startup.
    if (!revealArmed.current) {
      revealArmed.current = true;
      if (!revealSchedule) return;
    }
    onReveal(revealSchedule);
  }, [revealSchedule]);

  // `height` is a shared value seeded once, so a schedule that measures a different height —
  // the night group being switched on under an open card, the reader's text size, or simply
  // the very first measurement replacing SCHEDULE_FALLBACK — would leave the card at the old
  // height and clip (or strand blank space under) the new rows. Re-aim it.
  //
  // On the UI thread, off `targetOpen`, because that is the only account of where the card is
  // headed that is already true when a gesture has just aimed it. A card that is closed or on
  // its way closed wants no re-aim at all — which is also what keeps the first open quiet: the
  // rows mount at touch-down now, so the measurement lands while the finger is still on the
  // card, and `targetOpen` is still false until the release decides.
  useAnimatedReaction(
    () => expandedSV.value,
    (next, prev) => {
      if (prev === null || next === prev) return;
      if (!targetOpen.value) return;
      height.set(withSpring(next, SPRING));
    },
  );
  // Tell the host too, whose map padding is keyed to the expanded height.
  const onExpandedHeightChange = useEffectEvent(() => {
    // Publish the new target, and nothing else. Re-aiming the card is the reaction above —
    // this effect cannot do it, because the one case that needs it most is the case it cannot
    // see: on the first open the measurement lands in the same breath as the gesture, and
    // `expanded` is set inside a startTransition, so React is free to commit this render before
    // that low-priority one. Gate the re-aim on the state here and it is false exactly when it
    // matters, leaving the card at the pre-measurement fallback — ~50 dp short, date crown
    // clipped under the grab handle. Measured on an emulator, every time.
    expandedSV.set(EXPANDED);
    if (expanded) onExpandedChange?.(true, EXPANDED);
  });
  useEffect(() => {
    onExpandedHeightChange();
    // `expanded` as well as EXPANDED, and for the same reason the re-aim had to leave this
    // effect: on the first open the two land in the wrong order. The measurement fires this
    // effect while `expanded` is still false, so the report above is skipped — and the report
    // that DID reach the host came from the applyExpanded instance the in-flight gesture
    // captured, which closed over the pre-measurement fallback. Keyed on EXPANDED alone,
    // nothing ever corrects it: by the time the transition commits `expanded`, EXPANDED has
    // stopped changing. So the card landed on the measured height while the host was still
    // padding its map for a dock ~50 dp shorter. Listing `expanded` costs one duplicate report
    // per open — same value, on every path but that one — and buys a host that is never wrong.
  }, [EXPANDED, expanded]);

  useEffect(() => {
    if (!targetOpen.get()) height.set(COLLAPSED);
  }, [COLLAPSED, height, targetOpen]);

  // Handle: drag OR tap toggles. Hero: drag-only — a Pan needs movement to activate,
  // so a tap on the hero's "Nu" chip (preview mode) still reaches its Pressable
  // instead of being stolen by a toggle-tap.
  //
  // Making the hero itself tappable was tried and reverted (2026-08-19). Wrapping its
  // layers in a Pressable inside this GestureDetector does not give the nested chip and
  // "Välj plats" button the touch the way plain nested Pressables would: on Android a tap
  // on the chip fired BOTH — the clock returned to live AND the dock toggled — while taps
  // on the hero's own empty spacer registered inconsistently. Doing it properly needs a
  // native gesture on each nested button plus a hero tap that blocks them, which is a lot
  // of arbitration to hang on the dock's two most delicate controls. The handle above
  // remains the toggle.
  const handlePan = useTogglePan(togglePan);
  const gesture = useExclusiveGestures(handlePan, tap);
  const heroGesture = useTogglePan(togglePan);

  useImperativeHandle(ref, () => ({
    collapse() {
      if (!targetOpen.get() && !expanded) return false;
      targetOpen.set(false);
      height.set(withSpring(COLLAPSED, SPRING));
      applyExpanded(false);
      return true;
    },
  }));

  const heightStyle = useAnimatedStyle(() => ({ height: height.value }));
  // One reversible reveal for the whole schedule. The summary never fades or swaps.
  const scheduleReveal = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], Extrapolation.CLAMP),
  }));

  // Returning to "now" is the one action offered in two places (preview badge +
  // expanded Now button); both go through here so both confirm with a tick.
  const resetClock = clock.reset;
  const resetToNow = useCallback(() => {
    hapticSelection();
    resetClock();
  }, [resetClock]);

  // Tapping a prayer in the list time-travels the scrubber to that prayer. The
  // thumb eases there (see Scrubber's reconcile effect), so the move is legible.
  const setClockInstant = clock.setInstant;
  const scrubTo = useCallback(
    (at: number) => {
      if (!Number.isFinite(at)) return;
      hapticSelection();
      // Land EXACTLY on the prayer's instant (not via a lossy fraction round-trip), so
      // the tapped prayer reads as "current" and highlights — see nextPrayerKeyAt. The
      // thumb still eases there off the derived `fraction`.
      setClockInstant(at);
    },
    [setClockInstant],
  );

  // The night that BEGINS on the viewed day. Derived from the same `times` object the
  // rows above render, so the two can never disagree; computeNightTimes returns null where
  // the values would be meaningless (see lib/night-times.ts). Skipped entirely when the
  // group is off, so a reader who never asked pays nothing for it.
  const night = useMemo(
    () => (showNight ? computeNightTimes(times) : EMPTY_NIGHT),
    [showNight, times],
  );
  // Which calendar day each row's time actually falls on, relative to the day the card is
  // headed with: −1 the evening before, 0 this day, +1 after midnight — and, per row, whether
  // the list crosses a boundary just above it. See DayBreak for why the distinction has to be
  // drawn at all.
  //
  // Plain arithmetic off the clock's own two numbers rather than a startOfZoneDay per row:
  // every slot sits within ±14 h of its own solar noon, so there is at most one boundary each
  // side, and this stays free of Intl. Memoised on the day rather than computed in the render
  // body because the dock re-renders every 30 s for the countdown while the schedule beneath
  // it changes only when the viewed day does.
  const daySides = useMemo(() => {
    const dayEnd = clock.dayStart + clock.dayLength;
    let lastSide: number | null = null;
    // Keyed by prayer rather than by position: the rows are rendered from PRAYER_ORDER, and a
    // Record makes that lookup total where an array index would be `| undefined`.
    const out = {} as Record<PrayerKey, { at: number; valid: boolean; side: number | null; crosses: boolean }>;
    for (const key of PRAYER_ORDER) {
      const date = times[key];
      const at = date instanceof Date ? date.getTime() : Number.NaN;
      const valid = Number.isFinite(at);
      const side = valid ? (at < clock.dayStart ? -1 : at >= dayEnd ? 1 : 0) : null;
      // Only a real time can move the boundary: a "–" belongs to no day.
      const crosses = side !== null && lastSide !== null && side !== lastSide;
      if (side !== null) lastSide = side;
      out[key] = { at, valid, side, crosses };
    }
    return out;
  }, [times, clock.dayStart, clock.dayLength]);

  const cd = next ? countdownParts(next.at - clock.now) : null;

  // The day being viewed (midday avoids any DST edge), labelled in both calendars.
  // The Hijri line is the point — it honours the user's `hijriOffset` so it can be
  // aligned to the local mosque's sighting. Memoised on the day + offset so the two
  // Intl/Hijri formats don't re-run on every 30 s tick or scrub frame (the dock
  // re-renders for the countdown, but the viewed DAY rarely changes).
  //
  // Both lines label the STOCKHOLM calendar day. formatGregorian pins its own time
  // zone, so the midday instant is enough; formatHijri reads local date FIELDS, so it
  // gets zonePrayerDate (a local Date carrying the Stockholm Y/M/D) — passing the
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
        hijriLabel: formatHijri(zonePrayerDate(clock.dayStart), settings.hijriOffset),
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
  // Shared with the timeline's spoken value: one formatting pass per clock update.
  const viewedTime = formatTime(new Date(clock.now));
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
      <View style={styles.previewControls}>
        <Text style={styles.previewTime} testID="prayer-preview-time" numberOfLines={1}
          accessibilityLabel={`Visad tid ${viewedTime}`}>
          {viewedTime}
        </Text>
        <Pressable
          onPress={resetToNow}
          // This chip is the ONLY way out of scrub mode, and it is an 11 pt label in a hero
          // whose height is fixed (dockMetrics' `hero`) and must not grow — so the target is bought with
          // slop, which costs no layout. Same reach as the "Välj plats" offer below.
          hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          style={({ pressed }) => [styles.previewBadge, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={onToday ? 'Återgå till nu' : 'Återgå till i dag'}
        >
          <Icon name={onToday ? 'restore' : 'today'} size={13} color={c.accent} />
          <Text style={styles.previewBadgeText}>{onToday ? 'Nu' : 'I dag'}</Text>
        </Pressable>
      </View>
    );

  // The place, or — when there is no place, only the Stockholm fallback — an offer to
  // pick one. Built once and rendered in BOTH hero layers, exactly like `aside` above.
  // The hero's gesture is a Pan, which needs movement to activate, so a tap here reaches
  // this Pressable rather than being stolen by the dock toggle (same reason the "Nu"
  // chip works).
  const place = locationIsFallback ? (
    <Pressable
      // Navigation to byt-plats — no haptic (lib/haptics policy), same as PlaceHeader's link.
      onPress={() => router.push('/(settings)/byt-plats')}
      // The row is only caption-height, so widen the target without touching layout —
      // the hero shares a stable height between its two states. Kept at 10: reaching further
      // up sends this button's slop into `heroTop`, where the "Nu" chip sits, and heroSub
      // is the later sibling — so wherever the two line up horizontally on a narrow screen
      // a tap meant for the chip would land here and navigate away instead. The chip is
      // the only way out of scrub mode; it does not lose ties to a place picker.
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      style={({ pressed }) => [styles.placePick, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Ingen plats vald – tryck för att välja stad"
    >
      <Icon name="place" size={13} color={c.accent} />
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
          tint={hexToRgba(sky.surface, 0.97)}
        />

        {/* The card floats above the gesture bar (see DOCK_FLOAT), so the content only
            needs its own internal breathing here — no system-inset clearance. */}
        <View style={[styles.content, { paddingBottom: space.sm }]} pointerEvents="box-none">
          {/* A native viewport clips every intermediate frame above the fixed summary. */}
          <View testID="dock-schedule-viewport" style={[styles.scheduleViewport, { bottom: COLLAPSED - DOCK_HANDLE_H }]}>
            <Animated.View
              style={[{ maxHeight: scheduleRoom, flexShrink: 0 }, scheduleReveal]}
              pointerEvents={expanded ? 'auto' : 'none'}
              accessibilityElementsHidden={!expanded}
              importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
            >
              {/* Date left, stepper right — NOT a chevron either side of the date. Flanking it
                  pushed both date lines in by a 48 dp button, so the crown sat on a different
                  leading edge from every row beneath it and the forward glyph floated 13 dp in
                  from the times' right edge: a card that looked misaligned at both margins.
                  Now the date, the rows, the hero and the sub-line all start on the same
                  edge, and the stepper's pill ends where the time column does. */}
              <View style={[styles.dateHeader, roomyDate && styles.dateHeaderRoomy]} testID="dock-calendar-header" onLayout={onHeaderLayout}>
                <Pressable
                  // Opens the day picker sheet — navigation, so no haptic (lib/haptics policy).
                  onPress={() => setPickingDay(true)}
                  testID="prayer-dock-date"
                  accessibilityRole="button"
                  // ⚠️ BOTH DATES, in the order they are printed. This label once named only
                  // the Gregorian one, so a screen reader user heard "Lördag 22 augusti" and
                  // never once heard "8 Rabīʿ al-awwal 1448". The Hijri date is the second
                  // line now, but it is still on the card, so it is still in the label.
                  accessibilityLabel={`${gregorianLabel}, ${hijriLabel}. Välj dag.`}
                  accessibilityHint="Öppnar en kalender – välj vilken dag du vill se."
                  style={({ pressed }) => [styles.dateTap, roomyDate && styles.dateTapRoomy, pressed && styles.pressed]}
                >
                  {/* Swedish date on top. The stepper beside it and the calendar it opens
                      both move through CIVIL days, so the date they change is the headline;
                      the Hijri date is the quiet line under it.

                      The disclosure chevron rides the title it opens, the way a picker title
                      does on both platforms. It replaced a calendar glyph at the far end of
                      the row, which put three accent glyphs side by side once the stepper
                      moved over there. */}
                  <View style={styles.dateTitle}>
                    <Text style={styles.dateGreg} numberOfLines={roomyDate ? undefined : 1}>
                      {gregorianLabel}
                    </Text>
                    <Icon
                      name="chevronDown"
                      size={20}
                      color={c.accent}
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                  </View>
                  <Text style={styles.dateHijri} numberOfLines={roomyDate ? undefined : 2}>
                    {hijriLabel}
                  </Text>
                </Pressable>
                <StepperPill
                  onStep={(delta) => {
                    hapticSelection();
                    clock.stepDay(delta);
                  }}
                  canStepBack={clock.dayOffset > -MAX_DAY_OFFSET}
                  canStepForward={clock.dayOffset < MAX_DAY_OFFSET}
                  backLabel="Föregående dag"
                  forwardLabel="Nästa dag"
                />
              </View>
              <ScrollView
                testID="dock-schedule-scroll"
                style={{ maxHeight: Math.max(48, scheduleRoom - headerHeight), flexGrow: 0, flexShrink: 0, marginHorizontal: -space.sm }}
                contentContainerStyle={{ paddingHorizontal: space.sm }}
                nestedScrollEnabled
                scrollEnabled={expanded}
              >
                <View style={styles.list} testID="dock-schedule" onLayout={onScheduleLayout}>
                  {PRAYER_ORDER.map((key) => {
                    const { at, valid, side, crosses } = daySides[key];
                    // One Intl pass per row. This map runs again when the dock opens/closes,
                    // and formatting the same Date separately for the visible time and the
                    // spoken label doubled that work across all six rows.
                    const time = valid ? formatTime(times[key]) : '–';
                    return (
                      <Fragment key={key}>
                        {crosses ? (
                          <DayBreak
                            styles={styles}
                            mounted={showSchedule}
                          />
                        ) : null}
                        <ScheduleRow
                          styles={styles}
                          label={PRAYER_LABELS[key]}
                          time={time}
                          // Shurūq closes Fajr's window; nobody prays it. It takes the same
                          // quieter ink as the night landmarks — the one tier that says "not an
                          // obligation" now that no glyph is there to say it (a sunrise icon
                          // used to). Same rule as the settings preview and the widget.
                          muted={key === 'sunrise'}
                          nameColor={valid ? prayerTextColorFor(key, scheme) : undefined}
                          mounted={showSchedule}
                          visible={expanded}
                          isNext={next?.key === key && !next.nextDay}
                          // The brass row is the answer to "which prayer is next" for a sighted
                          // reader; without this it was the one thing the label never carried.
                          // A row past midnight says so in words: the rule above it is silent to
                          // a screen reader, and "00:36" alone is exactly the ambiguity it exists
                          // to remove.
                          accessibilityLabel={`${PRAYER_LABELS[key]} ${valid ? time : 'kan inte beräknas'}${
                            side === 1 ? ', efter midnatt' : side === -1 ? ', kvällen innan' : ''
                          }${next?.key === key && !next.nextDay ? ', nästa bön' : ''}`}
                          // Only rows that land INSIDE the viewed day can be scrubbed to:
                          // clock.setInstant clamps to that day, so tapping a 00:36 Maghrib
                          // parked the thumb on the far rail at 24:00 and — where two slots sit
                          // past midnight, as at Luleå in mid-June — lit up the EARLIER one as
                          // current. The same reasoning already keeps the night landmarks
                          // unpressable; see NightGroup.
                          at={valid && side === 0 ? at : undefined}
                          onSelect={scrubTo}
                        />
                      </Fragment>
                    );
                  })}

                  {/* The night's two voluntary landmarks, when asked for. Set apart by a rule
                      and a caption rather than merged into the list above: a reader glancing
                      at this card must be able to see where the obligations stop. */}
                  {showNight ? (
                    <NightGroup
                      styles={styles}
                      night={night}
                      mounted={showSchedule}
                      visible={expanded}
                    />
                  ) : null}
                </View>
              </ScrollView>
              <View style={styles.scheduleDivider} pointerEvents="none" />
            </Animated.View>
          </View>

          <View testID="dock-footer" style={styles.footer}>
            {/* One persistent summary anchors both states and remains a drag affordance. */}
            <GestureDetector gesture={heroGesture}>
              <View style={styles.hero} testID="dock-summary">
                <View style={styles.heroLayer} pointerEvents="auto">
                  <View style={[styles.heroTop, stackedSummary && styles.heroTopStacked]}>
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
                    {!stackedSummary && <View style={styles.flex} />}
                    {/* Unconditional, NOT `next ? aside : null`. When there is no next
                        prayer the collapsed dock previously had NO way back to now — and
                        day navigation makes that routine rather than exotic: one step onto
                        a Kiruna polar-winter day is enough. */}
                    {aside}
                  </View>

                  {next ? (
                    <View style={styles.heroSub}>
                      <Text style={styles.subTime}>{formatTime(new Date(next.at))}</Text>
                      <Text style={styles.subSep}>·</Text>
                      {/* The viewed day rides the sub-line rather than taking a row of its
                          own — the hero shares a stable height between its two states. It does
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
                </View>

              </View>
            </GestureDetector>

            <SolarTimeline
              styles={styles}
              fraction={clock.fraction}
              marks={marks}
              dayLength={clock.dayLength}
              onScrub={clock.setFraction}
              viewedTime={viewedTime}
              scheme={scheme}
            />
          </View>
        </View>

        {/* Grab handle — the signifier that the dock opens. Drag or tap to toggle. */}
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.handleHit}
            accessible
            testID="prayer-dock-toggle"
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Dölj bönetider' : 'Visa alla bönetider'}
            accessibilityState={{ expanded }}
            onAccessibilityTap={() => {
              targetOpen.set(!expanded);
              height.set(withSpring(expanded ? COLLAPSED : EXPANDED, SPRING));
              applyExpanded(!expanded);
            }}
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
      {(pickingDay || calendarRequested) && (
        <DayPicker
          dayStart={clock.dayStart}
          todayStart={clock.todayStart}
          hijriOffset={settings.hijriOffset}
          onPick={(instant) => {
            clock.goToDay(instant);
            setPickingDay(false);
            onCalendarClose?.();
          }}
          onClose={() => {
            setPickingDay(false);
            onCalendarClose?.();
          }}
        />
      )}
    </Animated.View>
  );
}

type DockStyles = ReturnType<typeof makeStyles>;

// Rows share the parent schedule reveal, keeping their own layout and hit targets stable.
const ScheduleRow = memo(function ScheduleRow({
  styles,
  label,
  time,
  muted,
  compact,
  nameColor,
  mounted,
  visible,
  isNext,
  at,
  onSelect,
  accessibilityLabel,
}: {
  styles: DockStyles;
  label: string;
  time: string;
  /** Render the row in the muted ink tier: this row is not an obligation. */
  muted?: boolean;
  /** Drop the 44 dp tap-target pitch. Only for rows that are never pressable AND sit in a
   *  group of their own — the night landmarks. See listRowCompact. */
  compact?: boolean;
  /** The prayer's hue, worn by its NAME (PRAYER_TEXT_COLORS, not the raw line colour).
   *  Omitted where there is nothing to connect to: the night landmarks (no line, no pip)
   *  and a time that cannot be computed — those rows keep plain ink. */
  nameColor?: string;
  /** In the tree at all — true from the first pixel of a drag, so `reveal` above has
   *  something to uncover. See `mounted` in PrayerDock. */
  mounted: boolean;
  /** Open: drives touch and assistive tech only, never the mount. */
  visible: boolean;
  isNext?: boolean;
  /** Omitted = the row is not pressable. The night landmarks pass nothing (see NightGroup). */
  at?: number;
  onSelect?: (at: number) => void;
  accessibilityLabel: string;
}) {
  // No glyph column. The label starts on the card's own leading edge, the same one the date
  // crown above and the hero below use, so the open card reads as one column of type rather
  // than a gutter of icons with the words set in from it. What the glyphs said about RANK is
  // carried by ink: brass for the next prayer, muted for the rows nobody is obliged to pray
  // (Shurūq and the night group).
  //
  // What they said about IDENTITY went with them, and that was a loss (user, 2026-09-19:
  // "now there is no natural connection"). Each glyph was tinted in its prayer's colour — the
  // colour of that prayer's line on the map, its pill, and its pip on the timeline just below
  // this list — and that tint was the list's only link to all three.
  //
  // It came back first as a dot beside the time, and that lasted one evening (user: "isn't it
  // better UI to have the prayer name colored and remove the dot?"). It is: the dot was a
  // legend swatch parked mid-row, so the reader had to tie a colour to the word beside it,
  // while the MAP had already solved this — a prayer line's pill wears the prayer's name in
  // the prayer's colour (MapMarkersOverlay). The list now says it the same way, and the row
  // loses an element instead of gaining one.
  //
  // Three voices, one each: COLOUR is identity (the name, in PRAYER_TEXT_COLORS — never the
  // raw line colour, which fails as small text); BRASS + bold + the soft ground is "next"
  // (the same brass as the collapsed countdown, and it lands on the TIME, so emphasis never
  // costs a name its identity — the rule the pills settled first); MUTED ink is "not an
  // obligation" and now lives on the time, leaving Shurūq's name its own gold.
  const content = (
    <>
      <Text
        testID="dock-row-name"
        style={[
          styles.listLabel,
          // No colour to wear (night landmarks, an uncomputable time) → the old ink tiers.
          nameColor ? { color: nameColor } : muted && styles.listLabelMuted,
          isNext && styles.nextWeight,
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.listTime, muted && styles.listLabelMuted, isNext && styles.nextEmphasis]}>
        {time}
      </Text>
    </>
  );

  return (
    // Mounted while the card is off its collapsed height — which INCLUDES a drag still under
    // the thumb, so the reveal above uncovers rows instead of an empty box.
    // accessibilityElementsHidden + no-hide-descendants is NOT enough on Android: measured on
    // API 35, the collapsed dock still exposed "Maghrib 21:01" and "ʿIshāʾ 22:02" as buttons
    // behind the closed card, so a screen reader read out a schedule that isn't on screen.
    // Unmounting is the only thing that actually prunes them, and `mounted` goes back to false
    // the moment the closing spring lands. The a11y props stay as the belt to that braces.
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {mounted ? (
        at !== undefined && onSelect ? (
          <Pressable
            onPress={() => onSelect(at)}
            style={({ pressed }) => [styles.listRow, isNext && styles.listRowNext, pressed && styles.listRowPressed]}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint="Tryck för att flytta tidslinjen till den här bönen."
          >
            {content}
          </Pressable>
        ) : (
          // Not every row can be scrubbed to. A plain View (rather than a disabled
          // Pressable) is what stops a screen reader announcing "knapp, inaktiverad" for a
          // row that was never meant to be one.
          //
          // It still carries `listRowNext`. That used to be unreachable — every valid prayer
          // row was pressable, so only the branch above ever needed it — and the moment
          // post-midnight rows stopped being pressable it became the common case: at Kiruna
          // in June the next prayer IS the 00:36 Maghrib for most of the evening. Without it
          // the row got `nextEmphasis` on its text and no brass ground under it, which reads
          // as a half-painted row rather than as the answer to "what's next".
          <View
            accessible
            accessibilityLabel={accessibilityLabel}
            style={[styles.listRow, compact && styles.listRowCompact, isNext && styles.listRowNext]}
          >
            {content}
          </View>
        )
      ) : null}
    </View>
  );
});

/**
 * The hairline where the schedule crosses midnight.
 *
 * At these latitudes a prayer routinely lands on a different calendar day than the card is
 * headed with, and the printed time gives no hint of it: at Kiruna on 14 June the sun does not
 * set at all, adhan's substitution puts Maghrib at 00:36 the following morning, and the row
 * read "Maghrib 00:36" directly under "ʿAṣr 17:41" — a number that looks like the small hours
 * already gone, twelve hours before it actually arrives. Default settings, 179 Maghrib-days
 * and 210 ʿIshāʾ-days a year across northern Sweden, and the same thing in reverse for a Fajr
 * that falls before midnight (Karesuando, 17 July: Fajr 23:58 above Shurūq 00:21).
 *
 * A rule and a caption rather than a per-row marker, and the caption says only what it can
 * defend. The three alternatives tried for the night group are all worse here for the same
 * reasons they were worse there (see NightGroup): a bare "+1" presumes the reader knows what
 * is incremented, a per-row weekday is noise on five rows to serve one, and naming the date
 * puts a second weekday on a card that already carries one. "Efter midnatt" is true of every
 * row below it in both directions — the ones that crossed forward, and the Fajr the rest of
 * the list crossed away from — and contradicts nothing above it.
 *
 * Deliberately invisible to a screen reader: it is a visual grouping of rows that each carry
 * the same fact in their own label, and announcing it as a heading would insert "efter
 * midnatt" twice into one row's reading.
 */
function DayBreak({
  styles,
  mounted,
}: {
  styles: DockStyles;
  mounted: boolean;
}) {
  return (
    <View
      style={styles.dayBreak}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {mounted ? <Text style={styles.dayBreakCaption}>Efter midnatt</Text> : null}
    </View>
  );
}

/**
 * The night's midpoint and last third, below the six prayers and visibly apart from them.
 *
 * Three deliberate departures from the rows above, each of which a later refactor would
 * plausibly "tidy" back into a bug:
 *
 *  1. **Not pressable.** Every prayer row scrubs the timeline to its instant, but
 *     `clock.setInstant` clamps to the VIEWED day (see useSolarClock). The last third
 *     routinely falls after midnight, so a tap would silently land the scrubber on 23:59
 *     of the wrong day and light up ʿIshāʾ as "current" — a lie with no visible cause.
 *  2. **Muted ink.** These are voluntary. Painting them at the same strength as the five
 *     obligations is the one thing this group must never do.
 *  3. **Nothing marks the midnight crossing — and these rows do NOT get the DayBreak rule the
 *     six prayers above them now use.** That is an asymmetry, so it is worth stating plainly
 *     rather than leaving to be discovered: these times routinely land after midnight under a
 *     card headed with the evening's date, and three ways of saying so were tried and removed
 *     (a bare "+1", which presumes the reader knows what is incremented; a per-row weekday;
 *     and a "Natten mot måndag" heading, which puts two weekdays on one card and reads as a
 *     contradiction). What settles it is the group heading: "Natten" has already told the
 *     reader these belong to the night, so 01:31 needs no further gloss — whereas a Maghrib
 *     of 00:36 sits in a list of daytime obligations with nothing framing it, which is exactly
 *     the ambiguity DayBreak exists to remove. The rule marks a crossing the reader cannot
 *     otherwise see; here the caption above the group has already marked it.
 *
 *     If that ever stops feeling right, the fix is to feed NIGHT_ORDER through the same
 *     `daySides` computation rather than to bolt a second mechanism on beside it.
 */
function NightGroup({
  styles,
  night,
  mounted,
  visible,
}: {
  styles: DockStyles;
  night: NightTimes;
  mounted: boolean;
  visible: boolean;
}) {
  return (
    <>
      {/* Announced as a heading, so a screen reader hears where the obligations stop —
          but only while the dock is open. The caption is unmounted when it is not, for the
          same measured reason ScheduleRow unmounts its rows: on Android the a11y props
          alone do not prune text behind a closed card. */}
      <View
        style={styles.nightRule}
        pointerEvents="none"
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      >
        {mounted ? (
          <Text style={styles.nightCaption} accessibilityRole="header">
            Natten
          </Text>
        ) : null}
      </View>
      {NIGHT_ORDER.map((key) => {
        const at = night[key];
        const time = formatTime(at);
        return (
          <ScheduleRow
            key={key}
            styles={styles}
            label={NIGHT_LABELS[key]}
            time={at === null ? '–' : time}
            muted
            compact
            mounted={mounted}
            visible={visible}
            accessibilityLabel={
              at === null
                ? `${NIGHT_SWEDISH_NAMES[key]}, kan inte beräknas`
                : `${NIGHT_SWEDISH_NAMES[key]} ${time}`
            }
          />
        );
      })}
    </>
  );
}

// The 24-hour day slider, presented as a restrained prayer timeline: one absolute
// control — every instant has one place on the track and the thumb is always under the
// finger — with a quiet sun arc as context only. The axis is not uniform: the minutes
// around each prayer are given more of the track than the empty hours, because at 5.8
// min/px a finger's wobble was a twenty-minute jump exactly where the reader was aiming.
// lib/timeline-warp.ts holds that map and the reasoning; here, the rule is simply that
// EVERYTHING positioned on the track goes through `warp.toTrack` — fill, marks, thumb and
// the hour ruler alike — and the pan reads back through `warp.toTime`. The user's
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
  viewedTime,
  scheme,
}: {
  styles: DockStyles;
  fraction: number;
  marks: DayMark[];
  /** Real length of the viewed Stockholm day in ms — 23/24/25 h across DST. */
  dayLength: number;
  /** Shared visible/spoken time, formatted once by the dock. */
  viewedTime: string;
  onScrub: (f: number) => void;
  scheme: ColorSchemeName;
}) {
  const [trackW, setTrackW] = useState(0);
  // Where each ruler hour actually falls in the viewed day. The EU switches at
  // 02:00/03:00 local, so by 03:00 a transition day has already gained or lost its whole
  // hour — every tick from 03 on carries the full delta, and 00 is the day's start by
  // definition. On an ordinary day the delta is 0 and these are three-hour intervals.
  // Each labelled hour carries its own fraction rather than living in a second array
  // read back by index at render. Two arrays walked by a shared `i` is a standing
  // invitation: if they ever fall out of step the read is `undefined`, `undefined *
  // trackW` is NaN, and a NaN `left` is a layout value React Native does not reject —
  // the ruler simply stops being where it says it is. One array, no index to keep
  // honest.
  const ticks = useMemo(() => {
    const dayHours = dayLength / 3_600_000;
    const shift = dayHours - 24;
    return HOUR_TICKS.map((hour) => ({
      hour,
      fraction: hour === 0 ? 0 : (hour + shift) / dayHours,
    }));
  }, [dayLength]);
  const markFractions = useMemo(() => marks.map((m) => m.fraction), [marks]);
  // Rebuilt once per viewed day (marks and length are memoised upstream), not per frame:
  // it integrates a density over 1024 samples, which is nothing once a day and would be
  // waste at 60 fps.
  const warp = useMemo(
    () => makeTimelineWarp(markFractions, dayLength),
    [markFractions, dayLength],
  );
  /** Where the committed time sits ON THE TRACK. Every position in the render and every
   *  mount-time plain style reads this; `fraction` stays the time and is what goes back to
   *  the clock. Mixing the two up is the whole bug class this pair of names exists to stop. */
  const trackFraction = warp.toTrack(fraction);
  /** The prayers' track positions, precomputed so the gesture — which lives in track space
   *  from end to end — never calls the JS-side warp from a worklet. */
  const markTracks = useMemo(
    () => markFractions.map((f) => warp.toTrack(f)),
    [markFractions, warp],
  );
  // The gesture speaks track positions; the clock speaks time. One conversion at the
  // hand-off, on the JS thread — which is why the warp never has to be a worklet.
  const scrubToTrack = useCallback((x: number) => onScrub(warp.toTime(x)), [onScrub, warp]);

  // Two disjoint shared values, by design (see also react-hooks/immutability): the
  // gesture writes ONLY `prog`/`dragging`; the reconcile effect writes ONLY `follow`.
  // `prog` is the finger position while dragging; `follow` is an eased mirror of the
  // committed time for every idle moment (live tick, tapped row, post-drag commit).
  // Both are TRACK positions, like everything else the UI thread touches here.
  const prog = useSharedValue(trackFraction);
  const follow = useSharedValue(trackFraction);
  const dragging = useSharedValue(false);
  const lastHaptic = useSharedValue(trackFraction);
  const lastSent = useSharedValue(trackFraction);
  const grabOffset = useSharedValue(0);

  // The role was declared and then not honoured: an "adjustable" with no accessibilityValue
  // and no actions announces a control whose increment/decrement gestures do nothing and
  // whose position is never spoken — while the map it drives is itself hidden from assistive
  // tech. The value is the time being viewed; the steps walk the day's prayers, which are the
  // landmarks a listener is actually navigating between, and fall back to a quarter-hour past
  // the last one. Both go through the same `onScrub` the finger uses.
  const stepTime = useCallback(
    (dir: 1 | -1) => {
      const ordered = markFractions.filter(Number.isFinite).sort((a, b) => a - b);
      const epsilon = 1e-4;
      const landing =
        dir === 1
          ? ordered.find((f) => f > fraction + epsilon)
          : ordered.reverse().find((f) => f < fraction - epsilon);
      const target = landing ?? fraction + dir * (TIMELINE_STEP_MS / dayLength);
      hapticSelection();
      onScrub(Math.max(0, Math.min(1, target)));
    },
    [markFractions, fraction, dayLength, onScrub],
  );

  // Mirror the clock into `follow` (eased) whenever the prop moves. Easing makes a
  // tapped row time-travel legibly; more importantly the style reads `follow` (a
  // UI-thread value), never the JS `fraction` straight — under a scrub the JS thread
  // is busy rebuilding the field, so a worklet that captured `fraction` would hold a
  // stale, pre-drag value for several frames at drag-release and snap the thumb back
  // before the committed time lands. Written only here, so no worklet mutates it.
  useEffect(() => {
    follow.value = withTiming(trackFraction, { duration: motion.base });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow is a stable shared-value ref
  }, [trackFraction]);

  // The hook takes this config afresh on every render, so the worklets below always see the
  // current `trackW` and `markTracks` — the same guarantee the per-render builder used to give.
  const pan = usePanGesture({
    minDistance: 0,
    // Down to the card's bottom edge, so the drag target is band + ruler + this = 48 dp
    // (see TRACK_BAND_H). Downward only: above the band is the summary, which carries the
    // dock's own toggle pan.
    hitSlop: { bottom: DOCK_FOOTER_PAD },
    onBegin: (e) => {
      dragging.value = true;
      scheduleOnRN(hapticGrab);
      if (trackW <= 0) return;
      grabOffset.value = scrubGrabOffset(e.x, follow.value * trackW);
      const f = Math.max(0, Math.min(1, (e.x + grabOffset.value) / trackW));
      prog.value = f;
      lastHaptic.value = f;
      lastSent.value = f;
      scheduleOnRN(scrubToTrack, f);
    },
    onUpdate: (e) => {
      if (trackW <= 0) return;
      const f = Math.max(0, Math.min(1, (e.x + grabOffset.value) / trackW));
      prog.value = f;
      // Selection tick when the thumb sweeps past one of the day's prayers. Compared in
      // track space: `f` is where the finger is, and a prayer's place on the track is not
      // its fraction of the day any more.
      for (let i = 0; i < markTracks.length; i++) {
        const m = markTracks[i];
        if (m === undefined) continue;
        if ((lastHaptic.value < m && f >= m) || (lastHaptic.value > m && f <= m)) {
          scheduleOnRN(hapticSelection);
          break;
        }
      }
      lastHaptic.value = f;
      // Throttle the JS field recompute; the thumb above stays at 60fps. The step is in
      // TRACK space (≈0.6 px), so the recompute cadence is tied to how far the finger has
      // travelled rather than to how much time passed under it — which is the whole point
      // of the warp: inside a prayer's well the same 0.6 px is a minute and a half, and a
      // step measured in day-fractions would have stopped updating exactly there.
      if (Math.abs(f - lastSent.value) >= SCRUB_SEND_STEP) {
        lastSent.value = f;
        scheduleOnRN(scrubToTrack, f);
      }
    },
    onFinalize: () => {
      dragging.value = false;
      scheduleOnRN(hapticRelease);
      scheduleOnRN(scrubToTrack, prog.value);
    },
  });

  // Dragging → the finger (`prog`, 60fps on the UI thread); idle → the eased clock
  // mirror (`follow`). Both are shared values, so neither is hostage to JS-thread lag
  // the way reading `fraction` here was. trackW is captured at render, so the thumb
  // repositions when the track lays out.
  //
  // Both move by TRANSFORM, never by `width`/`left`. Those are layout properties, and a
  // layout property animated on the UI thread costs a layout pass per frame (Reanimated's
  // performance guide: prefer transform/opacity over top/left/width, which "require an
  // additional step of layout recalculation on each animation frame") — paid here on every
  // frame of a drag, while the JS thread is already busy rebuilding the field. The fill is
  // a full-width bar slid left inside a clipping band (see trackFillClip), so its rounded
  // end stays round instead of being squashed by a scaleX.
  const fillStyle = useAnimatedStyle(() => {
    const f = dragging.value ? prog.value : follow.value;
    return { transform: [{ translateX: (f - 1) * trackW }] };
  });
  const thumbStyle = useAnimatedStyle(() => {
    const f = dragging.value ? prog.value : follow.value;
    return {
      transform: [
        { translateX: f * trackW - THUMB / 2 },
        { scale: withSpring(dragging.value ? 1.16 : 1, SPRING) },
      ],
    };
  });

  return (
    <View style={styles.timelineArea}>
      <View style={styles.timelineRow}>
      {/* The ruler and track share a width, so every hour stays on its real position. */}
      <GestureDetector gesture={pan}>
        <View
          style={styles.timelineCol}
          accessible
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Dagens tidslinje"
          accessibilityHint="Dra för att resa genom dygnet och se bönetiderna."
          accessibilityValue={{ text: viewedTime }}
          accessibilityActions={TIMELINE_ACTIONS}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') stepTime(1);
            else if (e.nativeEvent.actionName === 'decrement') stepTime(-1);
          }}
        >
        <View style={styles.trackBand}>
          <View style={styles.trackBase} />
          {/* Plain-style transform first so the freshly-mounted fill already spans to the
              live position; the animated style (which can apply a frame late on mount)
              then takes over. Without it the fill flashes empty — same mount glitch the
              thumb's plain transform below fixes. */}
          <View style={styles.trackFillClip} pointerEvents="none">
            <Animated.View
              style={[
                styles.trackFill,
                { transform: [{ translateX: (trackFraction - 1) * trackW }] },
                fillStyle,
              ]}
            />
          </View>
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
                      left: warp.toTrack(m.fraction) * trackW - PRAYER_DOT / 2,
                      backgroundColor: prayerColorFor(m.key, scheme),
                    },
                  ]}
                />
              );
            })}
          {/* Plain-style transform first so a freshly-mounted thumb is already at the
              live position; the animated style (which can apply a frame late on mount)
              then takes over and drives the drag. Without it the thumb flashes at 0. */}
          {trackW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.thumb,
                { transform: [{ translateX: trackFraction * trackW - THUMB / 2 }] },
                thumbStyle,
              ]}
            />
          )}
        </View>
        <View style={styles.ticks} pointerEvents="none">
          {trackW > 0 &&
            ticks.map(({ hour, fraction: tickFraction }) => hour % 6 !== 0 ? (
              <View
                key={hour}
                style={[styles.minorTick, { left: warp.toTrack(tickFraction) * trackW }]}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : (
              <Text
                key={hour}
                style={
                  hour === 0
                    ? [styles.tick, styles.tickStart]
                    : hour === 24
                      ? [styles.tick, styles.tickEnd]
                      : [styles.tick, { left: warp.toTrack(tickFraction) * trackW }]
                }
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {String(hour).padStart(2, '0')}
              </Text>
            ))}
        </View>
        </View>
      </GestureDetector>
      </View>
    </View>
  );
}

/** Calendar day stepper, disabled at the supported date limits. */
// Styles built from the active OS palette. Layout geometry is fixed; colours come from
// `c`, and typography/spacing snap to the design tokens (type.* / space.* / radius.*).
function makeStyles(c: Palette, fontScale = 1) {
  const metrics = dockMetrics(fontScale);
  const chip = chipStyles(c);
  // The hairline both list divisions draw. Shared so a theme change to it cannot reach one
  // and miss the other — see nightRule / dayBreak below for what each adds on top.
  const GROUP_RULE = {
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  } as const;
  // Both captions LABEL the rows beneath them, so both must sit closer to those rows than to
  // the ones they were separated from. They did the opposite. Measured on the open card: the
  // midnight caption had ~8 dp of air above it (marginTop 4 + paddingTop 4) and ~11 dp below
  // (marginBottom 4 + the next row's paddingVertical 7) — so by proximity it read as a footer
  // on the row above, which is exactly backwards, and worst on the day it matters most: when
  // the row above is the brass next-prayer row, its filled container draws a hard edge that
  // pulls the caption further up still. Zero margin below is not tight — `type.caption` leads
  // 18 over 13, so ~2.5 dp of that line box sits under the glyphs before the row's own 7 dp
  // of padding begins. The two rules keep their 4 dp difference in air above (see nightRule /
  // dayBreak); that gap is the whole visual distinction between "a new group" and "the list
  // continues", and it survives unchanged. Net height cost of the correction: zero.
  // (The night caption has since moved off this zero: its rows lost the 44 dp pitch whose
  // padding the zero relies on — see nightCaption.)
  const GROUP_CAPTION_BOTTOM = 0;
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
    // Reserve the handle's clearance (DOCK_HANDLE_H) above the content.
    content: { flex: 1 },
    // Leave room for the rows' 8dp highlight padding inside the clipping boundary.
    scheduleViewport: {
      position: 'absolute', top: DOCK_HANDLE_H,
      left: space.lg - space.sm, right: space.lg - space.sm,
      paddingHorizontal: space.sm,
      overflow: 'hidden', justifyContent: 'flex-end',
    },
    footer: { position: 'absolute', bottom: DOCK_FOOTER_PAD, left: space.lg, right: space.lg },

    dateHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.md },
    // Large text or a narrow phone: the stepper drops under the date instead of squeezing it.
    dateHeaderRoomy: { flexDirection: 'column', alignItems: 'flex-start', gap: space.sm },
    dateTapRoomy: { alignSelf: 'stretch', flex: 0 },
    scheduleDivider: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: c.hairline },
    // Both date lines are the target, so the header's typography is untouched by being tappable.
    dateTap: { flex: 1, justifyContent: 'center', minHeight: 44 },
    dateTitle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    // Date crown. 18/700 — a step under the hero's 20 so the two bold lines on the open card
    // don't compete, and a clear step over the 15 pt rows it heads. The Hijri line under it is
    // one size up from `caption`: it is still read, not skimmed past.
    dateGreg: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 0.1, color: c.ink, flexShrink: 1 },
    dateHijri: { fontSize: 14, lineHeight: 20, color: c.inkMuted, marginTop: 1 }, // optical nudge

    list: { paddingBottom: space.sm },
    // Rows carry a symmetric bleed (padding in, margin out) so a row background can
    // extend past the text column without shifting any text: every row's label/time
    // stay aligned with the date header above, highlighted or not.
    // 44 is the row PITCH and therefore each row's whole touch target (a tap scrubs the
    // timeline to that prayer, and the rows sit edge to edge, so slop has nowhere to go). With
    // the glyph column gone 48 read as air between lines of text; 44 is the floor to keep.
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: 6,
      minHeight: 44,
      paddingHorizontal: space.sm,
      marginHorizontal: -space.sm,
      borderRadius: radius.md,
    },
    // The next prayer's row sits in a soft brass container (common region), so "what's
    // coming" reads as a place in the schedule, not just a recoloured line of text —
    // the same highlightSoft the qibla lock uses, so brass-tint still means "live now".
    listRowNext: { backgroundColor: c.highlightSoft },
    // The night rows. 44 is a TAP-TARGET pitch, and these two are the rows nobody can tap
    // (see NightGroup) — so at 44 they were paying for touch they never get, and the price
    // was the group's shape: ~29 dp of air between the two times against ~17 dp between the
    // caption and the first, so "Natten" and nattens mitt read as a pair and the last third
    // floated alone under them (user report, 2026-09-19). At 4 dp a side the pitch is 30 —
    // still a full 2× leading on 15 pt type — and the gap between the times (~15 dp) now
    // matches the caption's own (see nightCaption). Shurūq and the post-midnight prayer rows
    // are unpressable too, but they sit INSIDE the prayer list's rhythm and keep its pitch.
    listRowCompact: { minHeight: 0, paddingVertical: space.xs },
    listRowPressed: { opacity: 0.55 },
    // The default ink is for rows with no prayer hue to wear; the five obligations and
    // Shurūq override the colour per row (see ScheduleRow's nameColor).
    listLabel: { ...type.callout, flex: 1, color: c.ink },
    listTime: { ...type.callout, color: c.ink, fontVariant: ['tabular-nums'] },
    // Voluntary rows step down one ink tier. That difference IS the hierarchy: the five
    // obligations keep `ink`, everything the reader is not obliged to pray reads quieter.
    listLabelMuted: { color: c.inkMuted },

    // The night group's separator. Its own rule + caption rather than another list row,
    // so a glance can tell where the obligations stop and the voluntary times begin.
    // One hairline-and-caption pair, used at both places the list is divided: above the night
    // group (a change of CATEGORY — obligation to voluntary) and at the midnight crossing (the
    // same list, a later day). Only the space above them differs, and that difference is the
    // whole visual distinction between "a new group" and "the list continues".
    nightRule: { ...GROUP_RULE, marginTop: space.md },
    // space.xs under it, where the midnight caption has none: that caption heads 44 dp rows
    // whose own padding supplies the air, while these head compact ones. With it, caption →
    // first time and time → time are the same ~15 dp, so the group reads as one even block.
    nightCaption: { ...type.caption, color: c.inkFaint, marginBottom: space.xs },
    // The midnight crossing takes the same rule with less air above it: it interrupts a single
    // list rather than introducing a new group, so the rows either side must still read as one
    // block. Composed from nightRule so a change to the hairline reaches both.
    dayBreak: { ...GROUP_RULE, marginTop: space.sm },
    dayBreakCaption: { ...type.caption, color: c.inkFaint, marginBottom: GROUP_CAPTION_BOTTOM },
    // The next prayer = brass everywhere (here, the countdown, the map pill), so
    // "what's coming" reads in one colour across the dock and the map.
    nextEmphasis: { color: c.highlightText, fontWeight: '700' },
    // The name's half of "next": weight only, so the prayer keeps its own colour. Brass is
    // the time's job (nextEmphasis above), where it answers "what's next" without costing
    // the name the hue that says WHICH prayer it is.
    nextWeight: { fontWeight: '700' as const },

    pressed: { opacity: 0.55 }, // same pressed step as listRowPressed — one dimming voice

    // Both hero states reserve the same font-scaled height, keeping the slider stationary.
    hero: { height: metrics.hero, marginBottom: DOCK_HERO_GAP, justifyContent: 'center' },
    heroLayer: { position: 'absolute', left: 0, right: 0 },
    heroTop: { flexDirection: 'row', alignItems: 'center' },
    heroTopStacked: { flexDirection: 'column', alignItems: 'flex-start' },
    // One step under `headline` (20/26): the collapsed card's lead line, sized so the whole
    // summary fits the 42 dp hero with the same proportions it had at 48. The open card's
    // date crown is also 18/700, so the two bold lines on the open card match.
    heroPrayer: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: c.ink, flexShrink: 1 },
    // Expanded hero name: a touch smaller than collapsed (the date header crowns the
    heroNone: { ...type.callout, color: c.inkMuted },
    // ── Dock countdown numerals — intentionally bespoke, NOT on the type scale: a big
    //    tabular brass digit (16) with a flush small unit (11) and a quiet prefix (12),
    //    plus the 13px relative-day sibling — each a step down from 18/12/13/14 with the
    //    prayer name, so the digit still outranks its unit by the same ratio. These numeric-display sizes are used nowhere
    //    else; tokenizing them would pollute the global scale for one component. ──
    heroNextDay: { fontSize: 13, fontWeight: '400', color: c.inkMuted },
    countdown: { marginLeft: fontScale > 1.3 ? 0 : space.sm, fontSize: 16, fontWeight: '700', color: c.highlightText, fontVariant: ['tabular-nums'] },
    countdownPrefix: { fontSize: 12, fontWeight: '400', color: c.inkMuted },
    // Unit ("t" / "min") at ~65% of the digit size, medium-weight, same brass.
    // Flush against the digit (no inter-character space) — the hierarchy +
    // proximity that the old equal-weight string lacked.
    countdownUnit: { fontSize: 11, fontWeight: '600', color: c.highlightText },
    heroSub: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 1 }, // optical nudge
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
    // The three touch targets share the track's centreline. The ruler grows with text.
    timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
    // The no-location offer that replaces the place name. Accent (the app's "verbs are
    // accent" rule) and semibold, so it reads as the one thing to tap on this line —
    // against subPlace's faint ink, which reads as settled fact. Caption-sized like its
    // siblings, so swapping one for the other never changes the hero's height.
    placePick: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, minWidth: 0 },
    placePickText: { ...type.caption, color: c.accent, fontWeight: '600', flexShrink: 1 },

    flex: { flex: 1 },
    previewControls: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, marginLeft: fontScale > 1.3 ? 0 : space.sm },
    previewTime: { minWidth: 44, textAlign: 'right', fontSize: 15, fontWeight: '600', color: c.ink, fontVariant: ['tabular-nums'] },
    // The "Nu" / "I dag" badge: the app's one small status chip (components/ui/chip, shared
    // with the settings "Standard" tag), laid out here as an icon-and-label row.
    previewBadge: {
      ...chip.box,
      marginLeft: space.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
    },
    previewBadgeText: chip.text,

    timelineArea: {},
    // The band the track/thumb/pips are drawn in. Every child is absolutely positioned
    // against its BOTTOM edge, so the band's height sets where the line sits in the row
    // and nothing inside it needs to change when that height does.
    trackBand: { height: TRACK_BAND_H },
    // Track + hour ruler, stacked and sharing one width between the two day chevrons.
    // flex: 1 so it takes the row's whole remaining width once the two chevrons are laid
    // out — the pan's e.x / trackW maths reads THIS element's onLayout width, and the
    // gesture covers it end to end (band + ruler) for a 44-dp-class drag target.
    // zIndex so the track is on top of BOTH chevrons, not just the one it happens to be
    // rendered after. Without it the fix depends on sibling order — move the forward chevron
    // above the GestureDetector in the JSX for any unrelated reason and the right-hand end
    // silently starts stealing touches again, which is precisely how it got there.
    timelineCol: { flex: 1, zIndex: 1 },
    // Band geometry (TRACK_BAND_H = 28): everything is centred on a line 16 dp above the
    // band's bottom edge — the knob spans 8–24, the 4 dp track 14–18, the 7 dp pips 12.5–19.5 —
    // leaving 4 dp of air over the knob and 8 dp under it before the hour ruler.
    trackBase: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 14,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.track,
    },
    // The elapsed-day fill is deliberately quiet (a soft tint, not a bold bar): it is
    // context, and the prayer pips above are the content. Over-saturating it inverted
    // the hierarchy — the progress bar shouted louder than the prayers it marks.
    //
    // The band the fill is slid inside: the track's own rectangle, clipped. The fill is
    // always the full track width and is translated left by the unelapsed part, so the
    // drag animates a transform rather than a `width` (see fillStyle), and the clip's
    // left corner is what rounds the fill's start.
    trackFillClip: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 14,
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
    },
    trackFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      borderRadius: 2,
      backgroundColor: c.trackFill,
      opacity: 0.5,
    },
    // Plain coloured dot on the axis. Same size/chrome for every prayer; past
    // dots draw at full opacity, future ones soften.
    mark: { width: PRAYER_DOT, height: PRAYER_DOT, borderRadius: PRAYER_DOT / 2, bottom: 12.5, opacity: 0.7 },
    markPast: { opacity: 1 },
    // The knob is the app mark in miniature: brand gold inside a brand blue ring (see
    // the scrubber block in theme/tokens.ts, which also explains why the RING is what
    // carries this control's contrast).
    // Placed by transform from the track's left edge (see thumbStyle), so `left` stays 0.
    thumb: {
      position: 'absolute',
      left: 0,
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      bottom: 8,
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
    ticks: { height: metrics.ruler, marginTop: 0 },
    minorTick: {
      position: 'absolute',
      top: 4,
      width: 1,
      height: 6,
      marginLeft: -0.5,
      borderRadius: 0.5,
      backgroundColor: c.inkMuted,
      opacity: 0.45,
    },
    // Hour-axis tick — 10px tabular, deliberately below `micro`; the smallest label in
    // the app and bespoke to the timeline.
    tick: {
      position: 'absolute',
      width: 44,
      marginLeft: -22,
      textAlign: 'center',
      fontSize: 11,
      lineHeight: 14,
      color: c.inkMuted,
      fontVariant: ['tabular-nums'],
    },
    // The two ends align INWARD rather than centring on their hour. Centred, "00" and "24"
    // hung half their width past the track's ends — ~9.5 dp from the card's edge while every
    // other line in the dock keeps 16, and down in the band where the 22 dp corner radius
    // curves in, so the digits all but touched the rim (user report, 2026-09-19). Flush with
    // the track's ends they sit on the same leading and trailing edge as the date crown, the
    // rows and the hero. They still mark the right place: the track itself starts at 00 and
    // ends at 24, on every day including the two DST days (both fractions are 0 and 1 by
    // definition). The inner hours keep centring, since each marks a point along the line.
    tickStart: { left: 0, marginLeft: 0, textAlign: 'left' },
    tickEnd: { right: 0, marginLeft: 0, textAlign: 'right' },

    handleHit: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: DOCK_HANDLE_H,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: c.handle },
  });
}
