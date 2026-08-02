import {
  Camera,
  type CameraRef,
  Map,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import {
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { hapticLight, hapticSuccess } from '../lib/haptics';

import {
  type DayMark,
  DOCK_COLLAPSED_BASE,
  DOCK_FLOAT,
  type NextPrayer,
  PrayerDock,
} from '../components/map/PrayerDock';
import { MapMarkersOverlay } from '../components/map/MapMarkersOverlay';
import { MosqueCard } from '../components/map/MosqueCard';
import { LocationHint } from '../components/map/LocationHint';
import { MosqueLayer } from '../components/map/MosqueLayer';
import { NotificationHint } from '../components/map/NotificationHint';
import {
  type PrayerArrival,
  type PrayerLineData,
  SolarSkiaOverlay,
} from '../components/map/skia/SolarSkiaOverlay';
import { MapNav } from '../components/nav/MapNav';
import {
  GlassBackdropProvider,
  GlassBackdropTarget,
  GlassSurface,
} from '../components/ui/GlassSurface';
import { useLocation } from '../lib/location/context';
import { getLocationPermissionState } from '../lib/location/permission';
import {
  noteLocationLaunch,
  noteLocationShown,
  shouldShowLocationHint,
} from '../lib/location-hint';
import { type Camera as MapCamera, invMercY, mercY } from '../lib/map/projection';
import type { Mosque } from '../lib/mosques';
import { mapStyleFor } from '../lib/map/nordicStyle';
import { noteLaunch, noteShown, shouldShowHint } from '../lib/notification-hint';
import { getNotificationPermissionState } from '../lib/notifications';
import { computePrayerTimes, nextPrayerKeyAt, PRAYER_ORDER, type PrayerKey } from '../lib/prayer-times';
import { computeSignature } from '../lib/settings/compute-signature';
import { useSettings } from '../lib/settings/context';
import type { LocationMode } from '../lib/settings/types';
import { buildLines, type PrayerLineLabel } from '../lib/solar/field';
import { gridForDay } from '../lib/solar/grid-cache';
import { polarBoundaryFor } from '../lib/solar/sun';
import { LIVE_TICK_MS, useSolarClock } from '../lib/solar/useSolarClock';
import { stockholmPrayerDate } from '../lib/stockholm-time';
import { motion, radius, space, type } from '../theme/tokens';
import { useActiveScheme, useColors } from '../theme/useColors';

// Sweden bounding box, flat [west, south, east, north] (MapLibre GL JS style).
// Tightened 2026-05-29 so the initial framing zooms in a notch — the previous
// box was generous around every edge (Norway/Denmark/Finland sea on three sides),
// which made the country read smaller than it had to. Bounds are still chosen so
// that with the bottom dock-padding (DOCK_MARGIN), Malmö's south coast lands
// CLEARLY above the dock — never tucked under it.
//   • WEST  11.15 — at Strömstad (11.17°), Göteborg (11.97°) safe inside
//   • SOUTH 55.35 — just at Smygehuk (55.34°), Malmö (55.61°) sits above the dock
//   • EAST  23.7 — past Stockholm's archipelago + Haparanda's main coast
//   • NORTH 69.00 — a hair below Treriksröset (69.06°), invisible at country zoom
const WEST = 11.15;
const SOUTH = 55.35;
const EAST = 23.7;
const NORTH = 69.0;
const SWEDEN_BOUNDS: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];

// The furthest the camera may wander. SWEDEN_BOUNDS is the FIT target (what "Visa hela
// Sverige" returns to); this is the leash, and it is deliberately continental. A user
// looking across the Öresund at Denmark, up into Finnmark, over to Åland or down to the
// Mediterranean is doing something reasonable — the solar geometry is correct
// everywhere, so there is no cartographic reason to pen them into Sweden.
//
// What it stops is the far end of that freedom: nothing prevented a fling from parking
// the camera in the Pacific, where the overlay dutifully projects Sweden's prayer lines
// over open ocean and the reset chip is the only way home. A hard stop is kinder than a
// chip, and cheaper — off-bounds panning still fetched tiles for a view nobody wants.
//
// WHY SO WIDE — this is sized against the SCREEN, not taste. maxBounds constrains the
// viewport, so if the box is shorter than the visible map at MIN_ZOOM, MapLibre has to
// clamp every frame and the map fights the finger. At z3 the tallest supported phone
// (956 pt) shows 0.233 of the world vertically; this box spans 0.284, so it always has
// room. Narrowing it means raising MIN_ZOOM to match — check both together.
const MAX_BOUNDS: [number, number, number, number] = [-20.0, 35.0, 60.0, 80.0];
// Floor only. The ceiling stays open: the mosque layer and the qibla arc are drawn for
// city zoom, and the projection handles zoom exactly.
const MIN_ZOOM = 3;

// The lat/lon at the geometric centre of the visible viewport, derived from the
// reported bounds. We use this — NOT `event.nativeEvent.center` — because in
// maplibre-react-native v11 (aligned with MapLibre GL JS) `center` is the camera's
// TARGET, which is shifted by any active Camera padding (e.g. our initial fitBounds
// reserves space at the bottom for the dock, so the reported `center` is ~135 px
// north of the actual viewport centre). Our Skia + RN-marker projections both anchor
// cam.lat/cam.lon at (width/2, height/2) — using the padded centre put every city
// ~50 svenska mil south of where the basemap actually rendered it (the user's
// report). Bounds are unpadded and unambiguous.
function viewportCentreFromBounds(
  west: number, south: number, east: number, north: number,
): { lon: number; lat: number } {
  return {
    lon: (west + east) / 2,
    lat: invMercY((mercY(north) + mercY(south)) / 2),
  };
}
// Extra breathing room (dp) reserved above the dock, so the south coast sits
// clearly above it rather than pressed against its top edge. Only needs to clear
// the tile-rendered Malmö label now — 16dp is the floor that still leaves the
// halo readable above the dock's top edge.
const DOCK_MARGIN = space.lg;

// How close (ms) the next prayer must be before its line starts breathing — the
// "prayer is about to begin" signal. Ten minutes: matches the common adhan-reminder
// horizon, long enough to be noticed, short enough that the breath stays special.
const IMMINENT_WINDOW_MS = 10 * 60_000;

// Stable empty collections handed to the overlays while the daybreak intro plays: the
// name PILLS are held back and appear as the sweep settles (their moving labels would be
// a blur during the fast replay). The prayer LINES, by contrast, now replay through the
// day (see introLines below). Module-scope so their identity is steady across renders.
const EMPTY_LINES: PrayerLineData[] = [];
const EMPTY_LABELS: PrayerLineLabel[] = [];

// Daybreak intro (see the block in Bonetider). Sweep length: long enough to read as a
// deliberate daybreak — and now to let the day's prayer lines visibly sweep past — short
// enough it never feels like a loading screen. Tunable; every intro timing rides this.
const INTRO_SWEEP_MS = 3800;
// The prayer lines replay through the day by rebuilding their contours at the swept
// instant every this-much of a DAY fraction (position between rebuilds is carried
// smoothly by the overlay's UI-thread drift, so this only governs how often the SHAPE
// refreshes — coarser = fewer JS rebuilds, staler shape between). ~1/48 → ≈24 rebuilds
// across a midnight→noon sweep.
const INTRO_LINE_STEP = 1 / 48;
// Plays ONCE PER COLD LAUNCH. A module-scope flag survives component remounts within a JS
// context but resets when the process is cold-started, so a resume from background (same
// JS context, flag still true) never replays it — exactly "every cold launch, not resume".
let introConsumed = false;

// The post-intro introduction, in three beats: the day's prayer times reveal themselves,
// they hold long enough to be read, and only then does the notification hint ask whether
// to be reminded of them. Sequencing it this way is the point — the offer lands as the
// natural next step after seeing the times, not as an interruption of the sweep.
//
// Beat 1: the pause after the lines settle before the dock opens. Not just politeness —
// `introPlaying` also flips false the instant the user TAPS to skip (see skipIntro), so
// with no delay the dock would fly open under the finger that just dismissed something.
// It also covers Reduce Motion, where the intro never runs and introPlaying is false from
// the first frame; the sequence still starts into a settled screen rather than at t=0.
const REVEAL_DELAY_MS = 300;
// Beat 2: how long the schedule stays open. Long enough to read six times, short enough
// that the map isn't hidden for what feels like a loading screen.
const REVEAL_HOLD_MS = 2500;
// Beat 3: the gap between the dock springing shut and the hint fading in, so the two
// animations never overlap — the times land, the map returns, then the question arrives.
const HINT_AFTER_REVEAL_MS = 700;
// The hint clears the two 46 dp MapNav discs (pinned at insets.top + 10) by a gap. It
// must not land at insets.top + space.lg either — that row belongs to the Återställ chip.
const HINT_TOP_OFFSET = 10 + 46 + space.md;
// The basemap-failure notice shares the Återställ chip's centred row, so it is pushed
// one chip-height + gap below it: both states can be true at once (a failed style does
// not stop the user panning), and stacked is the only arrangement where neither hides
// the other.
const MAP_ERROR_OFFSET = 34 + space.sm;

/** The offer queue's decision, as one async function so the gate effect below reads as a
 *  sequence rather than a nest of conditionals. Returns null when this launch has nothing
 *  worth asking.
 *
 *  Both branches ask the same three questions in the same order: is the feature still
 *  worth offering, has the OS been asked yet, and does this hint's own frequency policy
 *  allow another showing? 'undetermined' ONLY for the permission — a granted user needs no
 *  card, and a hard-denied one can no longer be prompted (iOS spends its single dialog
 *  once), so offering a button that would silently do nothing is worse than staying quiet.
 *  Both cases keep to Inställningar, which has the system-settings door. */
async function pickOffer(
  locationMode: LocationMode,
  notificationsEnabled: boolean,
): Promise<'location' | 'notifications' | null> {
  // Location first — see the gate. Skipped entirely in manual mode: the user has already
  // named their city, and asking for GPS on top of that second-guesses them.
  if (locationMode === 'gps' && (await getLocationPermissionState()) === 'undetermined') {
    if (shouldShowLocationHint(await noteLocationLaunch())) return 'location';
  }
  // Reminders already on — there is nothing to offer, so nothing to introduce.
  if (!notificationsEnabled && (await getNotificationPermissionState()) === 'undetermined') {
    if (shouldShowHint(await noteLaunch())) return 'notifications';
  }
  return null;
}

export default function Bonetider() {
  const scheme = useActiveScheme();
  const colors = useColors();
  const cameraRef = useRef<CameraRef>(null);
  // The initial framing — captured from the first settled region event after the
  // fitBounds-on-mount. Used as the comparison anchor for "has the user moved the
  // map?" (so the Reset chip appears when they have) and as the target the Reset
  // button restores. The user is otherwise free to pan/zoom anywhere they like.
  const initialFrame = useRef<{ lon: number; lat: number; zoom: number } | undefined>(undefined);

  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Space the floating dock occupies from the screen bottom = card height + the
  // safe-area inset + the float gap beneath it. The map reserves this much so
  // southern Sweden (Malmö) is never hidden behind the dock.
  const collapsedDock = DOCK_COLLAPSED_BASE + insets.bottom + DOCK_FLOAT;

  const { settings, loaded: settingsLoaded, update } = useSettings();
  const { coords, label, source } = useLocation();
  // The mosque whose detail card is open (tapped on the mosque POI layer), or null.
  const [selectedMosque, setSelectedMosque] = useState<Mosque | null>(null);
  // The dock glance only needs the place — drop status qualifiers like "(standard)"
  // or "(GPS)" that matter on the Inställningar screen but are noise here.
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');
  // 'default' means NO location was resolved — no GPS fix and no manual city — so the
  // times are Stockholm's by fallback, not by the user's choice. Stripping the
  // "(standard)" qualifier above then made the dock read a bare, confident "Stockholm"
  // to someone standing in Malmö, with times ~20 min wrong and nothing on the map
  // saying so (the only hint lived in an Inställningar footnote). Tell the dock, so it
  // offers "Välj plats" instead of naming a city the user never picked.
  const locationIsFallback = source === 'default';
  // Pause the clock's live tick while another route is on top, so the map's field
  // isn't rebuilt in the background (e.g. every 30 s while the user is on Inställningar).
  const isFocused = useIsFocused();
  const clock = useSolarClock(isFocused);

  // The map camera, mirrored from MapLibre's region events. BOTH overlays — the Skia
  // field canvas and the RN marker/pill layer — now read the `cam` shared value and
  // project on the UI thread, so a live pan moves them without a React render. camState
  // survives only as the seed/settled mirror that carries the rendered width/height (see
  // onLayout) into `cam`; we update it on the SETTLED region event and mirror it into cam
  // in an effect — the lint-approved way to write a shared value (mutating one inside a
  // plain JS callback trips react-hooks/immutability).
  // Camera state is seeded with the window dims so the first paint isn't blank, and the
  // Map's onLayout below replaces width/height with the actual rendered viewport so the
  // Skia overlay's projection matches the basemap (on iOS the Stack screen content area
  // can be smaller than the window — see the onLayout for why this matters).
  const cam = useSharedValue<MapCamera>({ lon: 17.4, lat: 62.1, zoom: 4, width: screenW, height: screenH });
  const [camState, setCamState] = useState<MapCamera>({
    lon: 17.4,
    lat: 62.1,
    zoom: 4,
    width: screenW,
    height: screenH,
  });
  // Gate the overlay (Skia field + RN markers) until the FIRST settled region event
  // lands — projecting against the seed camera (lat=62.1, zoom=4) puts every city far
  // off where the basemap actually rendered after fitBounds. By waiting for the first
  // settled event, the overlay never paints against a stale camera.
  const [cameraReady, setCameraReady] = useState(false);

  // The basemap style is fetched over the network at runtime (vector tiles + glyphs from
  // OpenFreeMap/MapTiler, elevation from the DEM host), so it can simply fail — offline,
  // captive portal, provider outage, expired key. Until now that failure was completely
  // silent: MapLibre renders nothing, the Skia wash and the prayer lines carry on
  // painting perfectly over the void, and the screen reads as "the map is broken" with
  // no way to tell whether it's the app or the network.
  //
  // The overlay is deliberately NOT gated on this. Its geometry comes from the solar
  // engine, not from tiles — the prayer lines are still true without a basemap under
  // them, and hiding them would turn a degraded map into a dead screen. We say what
  // happened instead, and let the rest keep working.
  const [styleFailed, setStyleFailed] = useState(false);

  // Flips true as soon as the user has noticeably panned or zoomed away from the
  // initial framing. Drives the floating "Visa hela Sverige" reset chip.
  const [moved, setMoved] = useState(false);

  const publishCamera = useCallback(
    (next: MapCamera, syncReact = true) => {
      // Keep the Skia overlay glued to MapLibre immediately. React state is still
      // updated for the RN marker/label layer, but the GPU wash/lines no longer wait
      // for a React render before receiving live camera coordinates.
      // eslint-disable-next-line react-hooks/immutability
      cam.value = next;
      if (syncReact) setCamState(next);
    },
    [cam],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    cam.value = camState;
  }, [camState, cam]);

  // The displayed instant as a fraction of the Stockholm day, on the UI thread, so the
  // wash shader redraws as the day is scrubbed without a React render or basemap re-tile.
  //
  // Live mode GLIDES instead of stepping: each 30 s tick re-anchors at the true now and
  // eases linearly toward the PREDICTED next tick (now + LIVE_TICK), so the wash (per
  // pixel) and the prayer lines (worklet drift in SolarSkiaOverlay) move at the sun's
  // real rate continuously. Because each segment's target is exactly where the next
  // tick lands, consecutive segments join seamlessly — withTiming animates from the
  // current value, so no snap is needed tick-to-tick. A value left STALE (returning
  // from scrub or a paused background clock) is snapped first, then glides. Scrub mode
  // pins the value directly — the finger is the clock there.
  const nowFraction = useSharedValue(clock.fraction);

  // ── Daybreak intro ──────────────────────────────────────────────────────────────────
  // On a cold launch, greet the user by sweeping the wash — and the dock thumb — from
  // Stockholm midnight (fraction 0) to now. It OWNS nowFraction while playing, so the live
  // glide below stands down; the prayer lines/pills are held (EMPTY_* above) and pour in
  // via their existing reveal as the sweep settles. Wash-only by design: the line CONTOUR
  // geometry (clock.now) stays put and its UI-thread drift is clamped, so sweeping
  // nowFraction alone can't drag the lines across the day — hence holding them here.
  const reduceMotion = useReducedMotion();
  const introActive = useSharedValue(false);
  const [introPlaying, setIntroPlaying] = useState(false);
  const introStarted = useRef(false);
  // The day's prayer lines, replayed during the intro: their contours REBUILT at the
  // swept instant (introGeometryNow) as the sweep advances, so each prayer's line sweeps
  // in and past on the way to now (a fast time-lapse of the day). Between rebuilds the
  // overlay's drift glides them at the sun's rate. Outside the intro the live prayerLines
  // take over. introStep throttles the rebuilds to INTRO_LINE_STEP grid (UI thread).
  const [introLines, setIntroLines] = useState<PrayerLineData[]>(EMPTY_LINES);
  const [introGeometryNow, setIntroGeometryNow] = useState(clock.now);
  const introStep = useSharedValue(-1);

  const finishIntro = useCallback(() => {
    // Only flip the React state here. introActive (the UI-thread drift-clamp flag) is cleared
    // by the main nowFraction effect on the NEXT render — once introPlaying is false and the
    // overlay has swapped geometryNow from the coarse (≤30 min stale) intro instant to the live
    // clock.now. Clearing it here, before that render, would re-arm the clamp for one frame
    // against the stale geometry and snap the lines back ~30 min: the end-of-intro "flick".
    setIntroPlaying(false);
  }, []);

  const skipIntro = useCallback(() => {
    if (!introStarted.current) return;
    // Just end it: flipping introPlaying off re-runs the live glide below, whose
    // stale-value branch snaps nowFraction from mid-sweep to the real "now" (a raw assign,
    // which also cancels the in-flight timing) and resumes gliding. No write needed here —
    // keeping nowFraction's mutations confined to effects is what keeps the compiler happy.
    finishIntro();
  }, [finishIntro]);

  // Grabbing the slider mid-intro (clock → scrub) bails to the user's scrub — the finger
  // is the clock from that point on.
  useEffect(() => {
    if (introPlaying && clock.mode === 'scrub') skipIntro();
  }, [introPlaying, clock.mode, skipIntro]);

  // The post-intro introduction: reveal the day's prayer times, then ask the ONE question
  // this launch has earned the right to ask. Both beats are gated on the SAME decision —
  // if no card is going to be offered, the dock must not open itself either. That's what
  // keeps this an introduction rather than an animation a daily user sits through on every
  // cold launch: it plays on exactly the launches where an offer is still live.
  //
  // 'idle' → 'reveal' (dock open, times staggering in) → 'settling' (dock shut, map back)
  // → 'hint-location' | 'hint-notifications' (the offer) → 'done'. Split across two effects
  // on purpose: the GATE below may be torn down freely by an unrelated change (opening a
  // mosque card flips armOffer), but once the sequence starts the TIMELINE runs off `phase`
  // alone — so a mid-reveal mosque tap can't strand the dock open with no card arriving.
  const [phase, setPhase] = useState<
    'idle' | 'reveal' | 'settling' | 'hint-location' | 'hint-notifications' | 'done'
  >('idle');
  // Once played (or the card dismissed/answered) the sequence must not restart this
  // session, even though the gate conditions below all go on being true.
  const introOfferDone = useRef(false);
  // Which card the gate picked, carried across the reveal beats. A ref, not state: it is
  // decided once and never re-read until the timeline hands off to a 'hint-*' phase, so
  // it must not be able to trigger a render of its own.
  const pendingOffer = useRef<'location' | 'notifications' | null>(null);
  // The offer belongs to the app's opening moment, not to time travel. Gating on the
  // viewed day means a user who steps to next Friday never gets an unprompted card there
  // — and, because the gate effect's cleanup runs before the 300 ms timer fires, stepping
  // during that window ABORTS before noteShown(), so no showing is spent on a card nobody
  // saw. (day-navigation.test.tsx asserts the record stays at shown: 0.)
  const armOffer =
    cameraReady &&
    !introPlaying &&
    !selectedMosque &&
    settingsLoaded &&
    clock.dayOffset === 0 &&
    clock.mode === 'live';
  const { locationMode } = settings;
  const notificationsEnabled = settings.notifications.enabled;

  // The gate: which offer — if any — may this launch make?
  //
  // The app has two soft asks and they share one screen, so they form an ORDERED QUEUE
  // with room for at most one card per launch. Two unprompted cards must never stack, and
  // showing them back-to-back in one session would read as an interrogation. Location goes
  // first because it is a prerequisite for the other being worth anything: a reminder for
  // the wrong city's Fajr is a reminder at the wrong time. Each hint keeps its OWN launch
  // counter (see lib/hints), so the notification card's one retry is not burned by the
  // launches the location card took — the queue defers it rather than consuming it.
  useEffect(() => {
    if (!armOffer || introOfferDone.current) return;
    let alive = true;
    const start = setTimeout(() => {
      void (async () => {
        const offer = await pickOffer(locationMode, notificationsEnabled);
        if (!alive || !offer) return;
        // Nothing may await between that liveness check and the hand-off: the user only
        // ever gets two showings, and recording one that a teardown then cancelled would
        // spend a showing on a sequence nobody saw. Commit first, persist afterwards.
        introOfferDone.current = true;
        pendingOffer.current = offer;
        setPhase('reveal');
        await (offer === 'location' ? noteLocationShown() : noteShown());
      })();
    }, REVEAL_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(start);
    };
  }, [armOffer, locationMode, notificationsEnabled]);

  // The timeline: hold the open schedule, shut it, then ask. Depends on `phase` only.
  useEffect(() => {
    if (phase === 'reveal') {
      const t = setTimeout(() => setPhase('settling'), REVEAL_HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'settling') {
      const t = setTimeout(
        () => setPhase(pendingOffer.current === 'location' ? 'hint-location' : 'hint-notifications'),
        HINT_AFTER_REVEAL_MS,
      );
      return () => clearTimeout(t);
    }
    // 'idle' / 'hint-*' / 'done' have no timer of their own — the card retires itself.
    return undefined;
  }, [phase]);

  // The single owner of nowFraction: the daybreak intro on cold launch, then the live
  // glide. Keeping every nowFraction write in ONE effect is deliberate — the React
  // Compiler forbids mutating a shared value across multiple effects.
  useEffect(() => {
    // Intro: fire once when the map is first framed, on a cold launch, with motion on.
    // The intro sweeps midnight → NOW, so it is meaningless on a day that is not today.
    // In practice cameraReady lands long before anyone could step, but the gate is cheap
    // and the alternative is a sweep to an instant the user is not looking at.
    if (
      !introStarted.current &&
      !introConsumed &&
      !reduceMotion &&
      cameraReady &&
      clock.mode === 'live'
    ) {
      introStarted.current = true;
      introConsumed = true;
      introActive.value = true;
      setIntroPlaying(true);
      // Seed the line replay at midnight: no lines yet, geometry anchored at the day's
      // start so the first drift frame reads ~0 (the reaction below rebuilds as it sweeps).
      setIntroLines(EMPTY_LINES);
      setIntroGeometryNow(clock.dayStart);
      // Jump to midnight, then glide to now (assigning 0 cancels any in-flight glide).
      nowFraction.value = 0;
      nowFraction.value = withTiming(
        clock.fraction,
        { duration: INTRO_SWEEP_MS, easing: Easing.inOut(Easing.cubic) },
        (fin) => {
          'worklet';
          // `fin` is true ONLY when the sweep completes naturally — i.e. it lands on
          // "now". A skip reassigns nowFraction, cancelling this with fin=false, so the
          // arrival cue never fires on a skip (skipping isn't arriving). Reaching the
          // present moment is a "landed it" outcome → hapticSuccess, the same tier as
          // the qibla lock; once per cold launch keeps it a meaningful, rare cue.
          if (fin) {
            scheduleOnRN(hapticSuccess);
            scheduleOnRN(finishIntro);
          }
        },
      );
      return;
    }
    if (introPlaying) return; // the intro owns nowFraction until it settles on now
    // First pass after the intro ends: the overlay has now swapped to the live geometryNow
    // (dt≈0), so it's finally safe to re-arm the drift clamp. Deferring the clear to here —
    // rather than doing it in finishIntro before this render — is what removes the end-of-intro
    // flick (a stale-geometry clamp would otherwise snap the lines back for a frame).
    if (introActive.value) introActive.value = false;
    // Live mode GLIDES instead of stepping: each 30 s tick re-anchors at the true now and
    // eases linearly toward the PREDICTED next tick, so the wash and lines move at the
    // sun's real rate. A stale value (from a paused/backgrounded clock, or the intro
    // handoff) is snapped first, then glides. Scrub mode pins the value directly.
    if (clock.mode === 'live') {
      const staleBy = Math.abs(nowFraction.value - clock.fraction);
      if (staleBy > (2 * LIVE_TICK_MS) / clock.dayLength) nowFraction.value = clock.fraction;
      const target = Math.min(1, clock.fraction + LIVE_TICK_MS / clock.dayLength);
      nowFraction.value = withTiming(target, {
        duration: LIVE_TICK_MS,
        easing: Easing.linear,
      });
    } else {
      nowFraction.value = clock.fraction;
    }
  }, [
    cameraReady,
    reduceMotion,
    introPlaying,
    clock.fraction,
    clock.mode,
    clock.dayStart,
    clock.dayLength,
    nowFraction,
    introActive,
    finishIntro,
  ]);

  const sig = computeSignature(settings);
  // The whole-country prayer-time lattice — the one expensive step (3752 adhan
  // computations, 200–600 ms of blocked JS on a mid-range Android). Cached per day and
  // per compute-affecting setting in lib/solar/grid-cache, which also owns the
  // unresolved/unrounded override the field is built with; see that module for why the
  // grid deliberately does NOT use the user's polar and rounding choices.
  //
  // The cache is what makes day stepping usable: without it, stepping forward and back
  // would pay that cost twice for a grid that has not changed at all.
  const grid = useMemo(
    () => gridForDay(clock.dayStart, settings, sig),
    // A cosmetic settings change re-runs this memo, but gridForDay returns the SAME
    // cached object for an unchanged signature — so `grid`'s identity, and every memo
    // downstream of it, stays stable.
    [clock.dayStart, settings, sig],
  );

  // The sweeping prayer lines for this instant — the level-0 contour of (prayerTime −
  // now) per prayer (appears/sweeps/vanishes on its own). Computed in JS here (cheap
  // arithmetic on the cached grid); the Skia overlay projects them to screen-space paths
  // on the UI thread, and the labels anchor the marker overlay's pills.
  // `avoid` keeps each line's pill clear of the user's dot (see buildLines): when a
  // prayer's line sweeps through the user's city the pill would otherwise sit right
  // on the brass dot + city name.
  const solar = useMemo(
    () => buildLines(grid, clock.now, [coords.longitude, coords.latitude]),
    [grid, clock.now, coords.longitude, coords.latitude],
  );
  // The user's dot as [lon, lat] — anchors the Skia arrival bloom. Stable identity so
  // the overlay's memoised props don't churn on unrelated renders.
  const userPoint = useMemo<[number, number]>(
    () => [coords.longitude, coords.latitude],
    [coords.longitude, coords.latitude],
  );
  const prayerLines = useMemo<PrayerLineData[]>(
    () =>
      solar.lines.features.map((f) => ({
        prayer: (f.properties as { prayer: PrayerKey }).prayer,
        polylines:
          f.geometry.type === 'MultiLineString'
            ? (f.geometry.coordinates as [number, number][][])
            : [],
      })),
    [solar],
  );

  // Rebuild the prayer-line contours for one swept instant (the daybreak replay). buildLines
  // is cheap arithmetic on the already-cached grid, so stepping it across the day is fine.
  // geometryNow is stamped alongside so the overlay's drift reads ~0 at each rebuild and
  // glides the lines between them.
  const rebuildIntroLines = useCallback(
    (virtualNowMs: number) => {
      const replay = buildLines(grid, virtualNowMs, [coords.longitude, coords.latitude]);
      setIntroLines(
        replay.lines.features.map((f) => ({
          prayer: (f.properties as { prayer: PrayerKey }).prayer,
          polylines:
            f.geometry.type === 'MultiLineString'
              ? (f.geometry.coordinates as [number, number][][])
              : [],
        })),
      );
      setIntroGeometryNow(virtualNowMs);
    },
    [grid, coords.longitude, coords.latitude],
  );

  // Drives the replay: while the intro sweeps nowFraction 0→now on the UI thread, step the
  // rebuilt instant across the day on a throttled grid and hand it to buildLines (JS thread).
  // Idle outside the intro (returns before touching anything), so live mode pays nothing.
  useAnimatedReaction(
    () => nowFraction.value,
    (frac) => {
      if (!introActive.value) return;
      const step = Math.floor(frac / INTRO_LINE_STEP);
      if (step === introStep.value) return;
      introStep.value = step;
      scheduleOnRN(rebuildIntroLines, clock.dayStart + frac * clock.dayLength);
    },
    [rebuildIntroLines, clock.dayStart, clock.dayLength],
  );

  // The polar daylight boundary for this date: in summer the midnight-sun line (sun never
  // sets), in winter the polar-night line (sun never rises) — the latitude past which
  // sunrise/fajr/maghrib/ishaʾ have no defined time, so their sweeping lines simply stop.
  // Null near the equinoxes when it climbs off the top of the map. Derived from the day's
  // solar declination; coincides with adhan's NaN boundary (see polar-boundary.test.ts).
  const polarBoundary = useMemo(
    () => polarBoundaryFor(new Date(clock.dayStart + clock.dayLength / 2)),
    [clock.dayStart, clock.dayLength],
  );

  // The user's own prayer times for today — drives the "next prayer", the day
  // marks under the slider, and the full list in the dock. Independent of the grid.
  const userTimes = useMemo(
    () => computePrayerTimes(coords, stockholmPrayerDate(clock.dayStart), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig + coords + day fully determine these
    [coords.latitude, coords.longitude, clock.dayStart, sig],
  );

  const marks = useMemo<DayMark[]>(() => {
    const out: DayMark[] = [];
    for (const key of PRAYER_ORDER) {
      const at = (userTimes[key]).getTime();
      if (!Number.isFinite(at)) continue;
      // Fraction of the *real* Stockholm day (23/24/25 h), so the marks stay aligned with
      // the scrubber thumb on the two DST days — a fixed 24 h would drift them by an hour.
      const f = (at - clock.dayStart) / clock.dayLength;
      if (f >= 0 && f <= 1) out.push({ key, fraction: f });
    }
    return out;
  }, [userTimes, clock.dayStart, clock.dayLength]);

  // The NEXT DAY's Fajr (ms epoch, null where adhan can't resolve it) — the fallback the
  // `next` memo reaches for after the viewed day's Ishaʾ. Named for the viewed day, not
  // for "tomorrow": on a day the user stepped to, this is that day's successor. Memoised
  // per (day, place, settings), NOT per tick — `next` re-runs every 30 s, and recomputing
  // a whole adhan day each tick all evening for a value that changes at midnight was waste.
  const nextDayFajrAt = useMemo(() => {
    const fajr = computePrayerTimes(coords, stockholmPrayerDate(clock.dayStart, 1), settings).fajr;
    const at = fajr instanceof Date ? fajr.getTime() : Number.NaN;
    return Number.isFinite(at) ? at : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig + coords + day fully determine this
  }, [coords.latitude, coords.longitude, clock.dayStart, sig]);

  const next = useMemo<NextPrayer | null>(() => {
    // First prayer at-or-after the viewed instant (inclusive, so scrubbing exactly onto a
    // prayer selects THAT prayer, not the next — see nextPrayerKeyAt).
    const key = nextPrayerKeyAt(userTimes, clock.now);
    if (key) return { key, at: userTimes[key].getTime(), nextDay: false };
    // Past the viewed day's Ishaʾ → the next day's Fajr.
    return nextDayFajrAt != null ? { key: 'fajr', at: nextDayFajrAt, nextDay: true } : null;
  }, [userTimes, clock.now, nextDayFajrAt]);

  // The user's next prayer drives the emphasised line/pill on the map (only when
  // it's today — tomorrow's Fajr has no line sweeping the country yet).
  const nextKey = next && !next.nextDay ? next.key : null;

  // "About to begin": when the viewed instant is within the breathing window of the
  // next prayer, its line's halo breathes (see PrayerLine). Works in scrub too — parking
  // the thumb just before a prayer shows the same signal the live map gives.
  const imminentKey =
    nextKey != null && next != null && next.at - clock.now <= IMMINENT_WINDOW_MS
      ? nextKey
      : null;

  // The arrival bloom trigger: in live mode, fire exactly at the next prayer's instant
  // (a timer, not the 30 s tick — the tick would land the bloom up to 30 s late, and
  // the climax of the whole sweep deserves the exact minute). The id is the prayer's
  // epoch instant, so re-arming the timer across ticks can never replay a bloom, and
  // scrubbing never fires one (mode gate). The timer also pauses with focus — the
  // bloom only matters while the map is watched.
  const [arrival, setArrival] = useState<PrayerArrival | null>(null);
  useEffect(() => {
    if (!isFocused || clock.mode !== 'live' || !next || next.nextDay) return;
    const delay = next.at - Date.now();
    if (delay < 0) return;
    const key = next.key;
    const at = next.at;
    const id = setTimeout(() => setArrival({ prayer: key, id: at }), delay);
    return () => clearTimeout(id);
  }, [next, clock.mode, isFocused]);

  // The user is free to pan/zoom anywhere — there is no bounds enforcement. The
  // settled handler below only records the initial framing and drives the
  // "Återställ" reset chip when the user has drifted from it.
  // While the map is moving, track the live camera so the overlays follow it:
  // both the Skia field canvas and the RN marker layer read the `cam` shared
  // value and re-project on the UI thread, so no React render happens per frame.
  const onRegionIsChanging = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { zoom, bounds } = e.nativeEvent;
      if (zoom > 1) {
        const [west, south, east, north] = bounds;
        const c = viewportCentreFromBounds(west, south, east, north);
        // syncReact=false: the Skia overlay AND the marker layer now both read the `cam`
        // shared value on the UI thread, so a live pan no longer needs a per-frame React
        // setState. The whole screen stays still during the pan; only the GPU/worklet
        // layers move. camState catches up on the settled onRegionDidChange below.
        publishCamera({ lon: c.lon, lat: c.lat, zoom, width: camState.width, height: camState.height }, false);
      }
    },
    [publishCamera, camState.width, camState.height],
  );

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { zoom, bounds } = e.nativeEvent;
      const [west, south, east, north] = bounds;
      const vc = viewportCentreFromBounds(west, south, east, north);
      // Feed the overlay the UNPADDED viewport centre (from bounds), not MapLibre's
      // reported `center` (which is the padded camera target in v11/GL JS) — see
      // viewportCentreFromBounds's comment.
      if (zoom > 1) {
        publishCamera({ lon: vc.lon, lat: vc.lat, zoom, width: camState.width, height: camState.height });
        if (!cameraReady) setCameraReady(true);
      }
      // The first qualifying settled event (zoom > 1) is the initial fit. Record it
      // as the comparison anchor for the "moved?" detector below; never enforce.
      if (initialFrame.current === undefined) {
        if (zoom > 1) initialFrame.current = { lon: vc.lon, lat: vc.lat, zoom };
        return;
      }

      // Show the Reset chip as soon as the user has clearly moved off the initial
      // framing. Thresholds: ~0.5° lat/lon (~50 km) or 0.05 zoom — enough to ignore
      // floating-point drift, small enough that any real pan/zoom triggers it. If
      // they pan/zoom BACK close to the initial framing the chip can disappear again.
      const init = initialFrame.current;
      const drifted =
        Math.abs(zoom - init.zoom) > 0.05 ||
        Math.abs(vc.lat - init.lat) > 0.5 ||
        Math.abs(vc.lon - init.lon) > 0.5;
      if (drifted !== moved) setMoved(drifted);
    },
    [publishCamera, camState.width, camState.height, cameraReady, moved],
  );

  return (
    <GlassBackdropProvider>
    <View
      style={[styles.container, { backgroundColor: colors.paperSunken }]}
      // Capture the Map's true rendered viewport so the Skia overlay's projection
      // matches the basemap. On iOS the window dims (useWindowDimensions) can be
      // bigger than the Stack screen's content area — projecting against the wrong
      // viewport size shifts every Skia point off the map.
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setCamState((prev) =>
          prev.width === width && prev.height === height ? prev : { ...prev, width, height },
        );
      }}
    >
      {/* Everything the glass chrome should blur — basemap, wash, markers — lives in
          this target; the dock/nav/reset glass below sample it on Android (true
          behind-content blur needs an explicit render source there, unlike iOS). */}
      <GlassBackdropTarget style={StyleSheet.absoluteFill}>
      <Map
        testID="sweden-map"
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleFor(settings.mapStyle, scheme)}
        // No on-map ornaments: the tappable attribution "i" (bottom-right) and the
        // MapLibre wordmark (bottom-left) are both hidden so nothing floats over the
        // wash. OSM/ODbL + OpenFreeMap credit belongs on the Om screen instead.
        attribution={false}
        logo={false}
        compass={false}
        // THE BUG THIS FIXES: a two-finger drag pitches the MapLibre camera and a
        // two-finger twist rotates it — both enabled by default. Neither the Skia overlay
        // nor the RN marker layer can represent a pitched or rotated camera: lib/map/
        // projection.ts is a closed-form north-up Web Mercator (its own header says "no
        // pitch"), so the moment the basemap tilts, the prayer lines keep drawing flat and
        // slide off it — far enough south, on a good two-finger drag, to land in Germany.
        //
        // It also breaks the camera mirror itself. onRegionDidChange derives the viewport
        // centre from `bounds`, and under pitch the visible region is a TRAPEZOID reaching
        // to the horizon, so the bounding box's centre is nowhere near the camera's.
        //
        // Disabling the two gestures is the fix rather than teaching the overlay
        // perspective: this is a north-up map of one country, the compass rose is already
        // off, and a 3D projection would have to be threaded through the wash shader, the
        // contour paths and the marker layer for a view nobody asked for. Zoom gestures
        // stay on — the projection handles zoom exactly.
        touchPitch={false}
        touchRotate={false}
        // The basemap animates under a Skia canvas that redraws every frame. Left at the
        // default, iOS picks a frame rate adaptively for the map alone, which can leave
        // the two layers running at different cadences — the wash gliding at the display's
        // rate while the tiles beneath it step. Asking for 120 lets both keep up on
        // ProMotion and high-refresh Android; devices that can't simply cap themselves.
        preferredFramesPerSecond={120}
        onRegionIsChanging={onRegionIsChanging}
        onRegionDidChange={onRegionDidChange}
        // Recovery is automatic: MapLibre keeps retrying tiles, so a style that comes
        // back on its own clears the notice without the user doing anything.
        onDidFinishLoadingStyle={() => setStyleFailed(false)}
        onDidFailLoadingMap={() => setStyleFailed(true)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: SWEDEN_BOUNDS,
            // Reserve the collapsed dock's height (+ margin) at the bottom so the
            // south coast is framed clearly above it from the very first render.
            padding: { top: 0, right: 0, bottom: collapsedDock + DOCK_MARGIN, left: 0 },
          }}
          // The leash, not the framing — see MAX_BOUNDS. The "Visa hela Sverige" chip
          // stays: this bounds how far wrong things can go, it does not replace the way
          // back from a merely-drifted view.
          maxBounds={MAX_BOUNDS}
          minZoom={MIN_ZOOM}
        />
        {/* Sweden's mosques as quiet POIs on the basemap — a NATIVE source+layer (not a
            projected RN overlay), so it gets zoom-gating, collision culling and tap
            hit-testing for free. It draws under the wash/lines above, which is right: a
            mosque is a place on the ground, not chrome floating over the sky. Off when
            the user hides it in Inställningar. */}
        {settings.showMosques && <MosqueLayer onSelect={setSelectedMosque} />}
      </Map>

      {/* The custom graphics ride ABOVE the basemap on a Skia canvas: the GPU twilight
          wash + the sweeping prayer lines, projected from the camera shared value so they
          stay glued to the map as it pans/zooms. Gated on `cameraReady` so the overlay
          never paints against the stale seed camera (lat 62.1 / zoom 4) — the basemap's
          actual fit on iOS resolves to a different camera, and that mismatch is what
          shoved every city ~50 mil south on first paint. */}
      {cameraReady && (
        <SolarSkiaOverlay
          dayStart={clock.dayStart}
          dayLength={clock.dayLength}
          nowFraction={nowFraction}
          // During the intro the geometry is the swept replay instant (rebuilt as it
          // advances); in live mode it's the true now.
          geometryNow={introPlaying ? introGeometryNow : clock.now}
          camera={cam}
          // Replay the day's lines during the intro; hand off to the live contours after.
          lines={introPlaying ? introLines : prayerLines}
          introActive={introActive}
          showQibla={settings.showQibla}
          nextKey={nextKey}
          imminentKey={imminentKey}
          userPoint={userPoint}
          arrival={arrival}
          polarBoundary={polarBoundary}
        />
      )}

      {/* Point/label layer above the canvas: city dots + collision-managed labels (kept
          legible above the wash), the brass "you are here" dot, and the prayer pills.
          Same `cameraReady` gate — no point projecting cities against a stale camera. */}
      {cameraReady && (
        <MapMarkersOverlay
          camera={cam}
          userCoords={coords}
          labels={introPlaying ? EMPTY_LABELS : solar.labels}
          nextKey={nextKey}
          polarBoundary={polarBoundary}
        />
      )}
      </GlassBackdropTarget>

      {/* Tap anywhere on the map during the daybreak intro to skip straight to now. Sits
          above the map/overlays but BELOW the dock and nav (rendered later), so grabbing
          the slider still starts a scrub (which also ends the intro) and the nav discs
          stay live. */}
      {introPlaying && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={skipIntro}
          accessibilityRole="button"
          accessibilityLabel="Hoppa över introduktionen"
        />
      )}

      {/* The one bottom surface: next prayer + day scrubber, expandable to the full
          schedule. */}
      <PrayerDock
        clock={clock}
        times={userTimes}
        marks={marks}
        next={next}
        locationLabel={placeLabel}
        locationIsFallback={locationIsFallback}
        settings={settings}
        introFraction={nowFraction}
        introActive={introActive}
        // The middle beat of the post-intro introduction: the dock opens itself so the
        // day's six times stagger in off its existing reveal, holds, then shuts again.
        revealSchedule={phase === 'reveal'}
      />

      {/* Mosque detail card — floats just above the collapsed dock when a mosque POI is
          tapped. Gated on showMosques too, so hiding the layer also dismisses any open
          card. Sits after the dock so it layers above if they ever meet. */}
      {settings.showMosques && selectedMosque && (
        <MosqueCard
          mosque={selectedMosque}
          userCoords={coords}
          bottom={collapsedDock + DOCK_MARGIN}
          onClose={() => setSelectedMosque(null)}
        />
      )}

      {/* Floating navigation: a live qibla compass (left) and the settings cog (right),
          each opening its screen as a sheet over the map. `active` (the screen's focus)
          gates the compass's heading subscription so the magnetometer pauses when a
          sheet is up or the app is backgrounded. */}
      <MapNav active={isFocused} />

      {/* The map's soft asks — at most ONE per launch, chosen by pickOffer above. Each
          appears only after the daybreak intro has settled and only while its OS
          permission is still undetermined; their buttons are the only things in the app
          that fire the system dialogs, so dismissing either leaves that single lifetime
          prompt unspent. Rendered here, OUTSIDE GlassBackdropTarget (which closed above)
          — a glass surface inside the target would sample itself instead of the map. They
          sit below the two nav discs, colliding with neither them nor the Återställ chip,
          and share one `top` so the two cards are visually interchangeable. */}
      {phase === 'hint-location' && (
        <LocationHint top={insets.top + HINT_TOP_OFFSET} onClose={() => setPhase('done')} />
      )}

      {phase === 'hint-notifications' && (
        <NotificationHint
          top={insets.top + HINT_TOP_OFFSET}
          onEnable={() => update({ notifications: { ...settings.notifications, enabled: true } })}
          onClose={() => setPhase('done')}
        />
      )}

      {/* "Återställ" — appears only after the user has clearly panned/zoomed off the
          initial framing. Tap to fitBounds back to the whole country. Sits between the
          two nav discs at the top centre so it never collides with them. A clear ring
          (border) + icon + haptic so it reads unmistakably as a button, not a label —
          the old wordmark style was too quiet to invite a tap. */}
      {moved && (
        <View style={[styles.resetWrap, { top: insets.top + space.lg }]} pointerEvents="box-none">
          <Pressable
            onPress={() => {
              hapticLight();
              cameraRef.current?.fitBounds(SWEDEN_BOUNDS, {
                padding: { top: 0, right: 0, bottom: collapsedDock + DOCK_MARGIN, left: 0 },
                duration: motion.slow,
              });
              setMoved(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Återställ kartan"
          >
            <GlassSurface
              style={[styles.resetChip, { borderColor: colors.accent }]}
              borderRadius={radius.lg}
              interactive
              tint={colors.cardGlass}
            >
              <MaterialIcons name="center-focus-strong" size={16} color={colors.accent} />
              <Text style={[styles.resetText, { color: colors.ink }]}>
                Återställ
              </Text>
            </GlassSurface>
          </Pressable>
        </View>
      )}

      {/* The basemap failed to load. Deliberately a NOTICE, not a card with a retry
          button: MapLibre already retries on its own, and there is nothing useful for a
          tap to do that waiting doesn't. It says which half is broken — the map, not the
          times — so a user staring at a blank screen behind correct prayer lines knows
          the app is still telling the truth. Clears itself when the style arrives.
          Rendered outside GlassBackdropTarget, like the hint cards, so the glass samples
          the map rather than itself; `pointerEvents="none"` keeps the map draggable
          underneath. Sits below the reset chip's row so the two never collide. */}
      {styleFailed && (
        <View
          style={[styles.mapErrorWrap, { top: insets.top + space.lg + MAP_ERROR_OFFSET }]}
          pointerEvents="none"
        >
          <GlassSurface style={styles.mapErrorNotice} borderRadius={radius.lg} tint={colors.cardGlass}>
            <MaterialIcons name="cloud-off" size={16} color={colors.inkMuted} />
            <Text style={[styles.mapErrorText, { color: colors.inkMuted }]}>
              Kartan kunde inte laddas. Bönetiderna stämmer ändå.
            </Text>
          </GlassSurface>
        </View>
      )}

      {/* Status-bar glyphs track the APP's active scheme (useActiveScheme), not the OS,
          so a user who locks the app to "Mörkt" while the phone is in light mode still
          gets light glyphs over the dark basemap — instead of "auto"'s dark glyphs
          dissolving against navy. Same the other way round. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} animated />
    </View>
    </GlassBackdropProvider>
  );
}

const styles = StyleSheet.create({
  // `backgroundColor` is set inline from the OS palette's `paperSunken` so the brief flash
  // during a MapLibre style hot-swap is the same family as either basemap (warm parchment
  // sunken in light, deep navy sunken in dark) — no jarring colour pop on a theme flip.
  container: { flex: 1 },
  // Centred row that hosts the chip — top inset already accounted for by `top`.
  resetWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Pill-shaped Liquid Glass chip with a clear accent ring + icon, so it reads as a
  // button (a one-word label alone read as a banner the user wasn't sure was tappable).
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1.5, // intentional accent ring weight — kept
  },
  // caption size, weighted up for a button label.
  resetText: { ...type.caption, fontWeight: '700', letterSpacing: 0.2 },
  // Same centred row as the reset chip, offset below it so the two can coexist — a
  // basemap failure and a drifted camera are independent states and can both be true.
  mapErrorWrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  // No ring, muted ink: this is a statement, not a control. Deliberately quieter than
  // the reset chip so it never competes with a real button for the same glance.
  mapErrorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  mapErrorText: { ...type.caption, flexShrink: 1 },
});
