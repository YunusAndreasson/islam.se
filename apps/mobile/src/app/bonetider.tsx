import {
  Camera,
  type CameraRef,
  Map,
  type MapRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useNetworkState } from 'expo-network';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeOut,
  type SharedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MapLineToast } from '@/components/map/MapLineToast';
import { distanceToLine } from '@/lib/map/line-hit';
import { greatCirclePoints, KAABA, qiblaDistanceKm } from '@/lib/qibla';
import { formatTime, PRAYER_LABELS, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';

import { hapticLight } from '@/lib/haptics';

import {
  type DayMark,
  DOCK_COLLAPSED_BASE,
  DOCK_FLOAT,
  type NextPrayer,
  PrayerDock,
} from '@/components/map/PrayerDock';
import { MapLessonCard } from '@/components/map/MapLessonCard';
import { Icon } from '@/components/ui/Icon';
import { MapMarkersOverlay } from '@/components/map/MapMarkersOverlay';
import { MosqueCard } from '@/components/map/MosqueCard';
import { LocationHint } from '@/components/map/LocationHint';
import { MosqueLayer } from '@/components/map/MosqueLayer';
import { NotificationHint } from '@/components/map/NotificationHint';
import {
  type PrayerArrival,
  type PrayerLineData,
  SolarSkiaOverlay,
} from '@/components/map/skia/SolarSkiaOverlay';
import { MapNav } from '@/components/nav/MapNav';
import { useNavMetrics } from '@/components/nav/metrics';
import {
  GlassBackdropProvider,
  GlassBackdropTarget,
  GlassSurface,
} from '@/components/ui/GlassSurface';
import { useOptionalIntroStatus, useOptionalMapLesson } from '@/lib/intro-context';
import { useLocation } from '@/lib/location/context';
import { getLocationPermissionState } from '@/lib/location/permission';
import {
  noteLocationLaunch,
  noteLocationShown,
  shouldShowLocationHint,
} from '@/lib/location-hint';
import { type Camera as MapCamera, invMercY, mercY } from '@/lib/map/projection';
import { createTroubleBurst, watchResourceFailures } from '@/lib/map/map-diagnostics';
import { ensureBasemapCache } from '@/lib/map/offline';
import { reportProjectionDrift } from '@/lib/map/projection-guard';
import type { Mosque } from '@/lib/mosques';
import { basemapGroundFor, nordicMapStyleFor } from '@/lib/map/nordicStyle';
import {
  noteNotificationLaunch,
  noteNotificationShown,
  shouldShowNotificationHint,
} from '@/lib/notification-hint';
import { getNotificationPermissionState } from '@/lib/notifications';
import { lonLatOf, type LonLat } from '@/lib/coordinates';
import { computePrayerTimes, PRAYER_ORDER, type PrayerKey, selectNextPrayer } from '@/lib/prayer-times';
import { computeSignature } from '@/lib/settings/compute-signature';
import { useSettings } from '@/lib/settings/context';
import type { LocationMode } from '@/lib/settings/types';
import { buildLines } from '@/lib/solar/field';
import { demoFrame, MAP_LESSON_EXAMPLES } from '@/lib/solar/demo-year';
import { gridForDay } from '@/lib/solar/grid-cache';
import { polarBoundaryFor } from '@/lib/solar/sun';
import { LIVE_TICK_MS, useSolarClock } from '@/lib/solar/useSolarClock';
import { zonePrayerDate } from '@/lib/zone-time';
import { motion, radius, space, type } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';

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

// Keep Reanimated's intentionally mutable `.value` writes behind small module helpers.
// React Compiler can then optimize the screen around those imperative UI-thread bridges
// without treating the whole component as a mutation hazard.
function publishSharedCamera(camera: SharedValue<MapCamera>, next: MapCamera): void {
  camera.value = next;
}

function resizeSharedCamera(
  camera: SharedValue<MapCamera>,
  width: number,
  height: number,
): void {
  camera.value = { ...camera.value, width, height };
}

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

// MapLessonCard is a taller surface than the collapsed dock it replaces (a caption, a
// fact sentence, a dot row and the legend, against the dock's one countdown line and a
// scrubber) — roughly 360dp against the dock's ~140dp, measured on device. Used for
// clearing floating UI elements (MosqueCard) above whichever surface is showing — NOT
// for the camera's own framing (see the note at SWEDEN_BOUNDS's initialViewState): an
// earlier version fed this into the initial fitBounds' bottom padding too, on the theory
// that it would keep Malmö clear of the card the same way it keeps MosqueCard clear of
// it. It did, but fitBounds ties padding to zoom — reserving 360dp instead of the dock's
// ~140dp forced the WHOLE view to zoom out to keep the bounds fully visible above it,
// which pulled Norway/Denmark/the Baltic into frame right when a tight Sweden was the
// point (the map lesson is explaining the country's own prayer lines). Letting the card
// sit over a bit of the south coast instead of forcing that zoom-out was the trade the
// product call landed on.
const LESSON_CARD_HEIGHT = 360;

// How long the reveal cover waits for the map before giving up on it — see `mapPainted`.
// Long, on purpose: what it is covering is not a wait, it is the map's land without its
// detail, so overshooting costs nothing and undershooting brings the flash back.
const MAP_REVEAL_TIMEOUT_MS = 8000;
// The dissolve itself. Slower than `motion.base`, because this is one continuous surface
// gaining detail rather than an element arriving — at 240 ms the tiles read as popping in.
const MAP_REVEAL_MS = 520;

// How close (ms) the next prayer must be before its line starts breathing — the
// "prayer is about to begin" signal. Ten minutes: matches the common adhan-reminder
// horizon, long enough to be noticed, short enough that the breath stays special.
const IMMINENT_WINDOW_MS = 10 * 60_000;

// REMOVED 2026-08-10 — the daybreak intro. On every cold launch the map used to jump the
// displayed instant to Stockholm midnight and sweep it back to now over ~3.8 s, replaying
// the day's prayer lines and dragging the dock's slider thumb along with it. The user
// asked for it gone: opening the app should show the present moment, not travel to it.
// The screen now paints straight at `clock.now` and the live glide owns nowFraction from
// the first frame. If it is ever wanted back, `git show 0194863 -- src/app/bonetider.tsx`
// has the whole machine (sweep timing, per-step contour replay, tap-to-skip, and the
// `introActive` drift-clamp lift in SolarSkiaOverlay/PrayerDock that went with it).

// The launch introduction, in three beats: the day's prayer times reveal themselves, they
// hold long enough to be read, and only then does the notification hint ask whether to be
// reminded of them. Sequencing it this way is the point — the offer lands as the natural
// next step after seeing the times, not as an interruption.
//
// Beat 1: the pause after the map settles before the dock opens, so the sequence starts
// into a still screen rather than at t=0 alongside the first paint.
const REVEAL_DELAY_MS = 300;
// Beat 2: how long the schedule stays open. Long enough to read six times, short enough
// that the map isn't hidden for what feels like a loading screen.
const REVEAL_HOLD_MS = 2500;
// Beat 3: the gap between the dock springing shut and the hint fading in, so the two
// animations never overlap — the times land, the map returns, then the question arrives.
const HINT_AFTER_REVEAL_MS = 700;
/** The Återställ chip's own height, near enough — paddingVertical 8 twice, a 1.5 ring twice
 *  and an 18 dp line. Everything that has to stack under the chip counts in these. */
const CHIP_HEIGHT = 34;
// The hint clears the MapNav instrument row AND the Återställ chip's lane under it. The
// numbers come from MapNav rather than being written again here: this was once a
// hand-copy of "one 46 dp disc at insets.top + 10", and the day a second disc joined the
// first it would have been silently wrong, with the hint card landing on top of the Moon.
// It reads the lane at render time (not as a module constant) because the discs grow with
// the reader's text size — a fixed copy would put the hint back over them at 1.5×.
const hintTopOffset = (laneTop: number): number => laneTop + CHIP_HEIGHT + space.md;
// The basemap-failure notice shares the Återställ chip's centred lane, so it is pushed
// one chip-height + gap below it: both states can be true at once (a failed style does
// not stop the user panning), and stacked is the only arrangement where neither hides
// the other.
const MAP_ERROR_OFFSET = CHIP_HEIGHT + space.sm;

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
    if (shouldShowNotificationHint(await noteNotificationLaunch())) return 'notifications';
  }
  return null;
}

export default function Bonetider() {
  const scheme = useActiveScheme();
  const colors = useColors();
  const cameraRef = useRef<CameraRef>(null);
  // Only the development-only projection guard uses this — it asks MapLibre where a few
  // Swedish cities are and compares with where lib/map/projection.ts puts them, so a
  // camera-mirror bug is caught on the first settled frame instead of by a reader noticing
  // that Stockholm has moved. Compiled out of release builds; see the module's header.
  const mapRef = useRef<MapRef>(null);
  // The initial framing — captured from the first settled region event after the
  // fitBounds-on-mount. Used as the comparison anchor for "has the user moved the
  // map?" (so the Reset chip appears when they have) and as the target the Reset
  // button restores. The user is otherwise free to pan/zoom anywhere they like.
  const initialFrame = useRef<{ lon: number; lat: number; zoom: number } | undefined>(undefined);
  // Set while a reset's fitBounds is in flight, so the settled event that ends it
  // re-anchors `initialFrame` instead of being measured against it. See the comment
  // at the check in onRegionDidChange.
  const resetPending = useRef(false);
  // True from the first camera-move event until the camera comes to rest — a pan, a fling,
  // a pinch or one of our own fitBounds animations. The solar clock reads it to keep a
  // 30 s tick from landing mid-gesture: a tick rebuilds the whole-country field and
  // re-renders this screen on the JS thread, which is the same thread that must forward the
  // next camera frame to the Skia overlay, so the overlay stalls against the basemap for as
  // long as the rebuild takes. A ref, not state, so the gesture itself causes no render;
  // see useSolarClock's `shouldDefer` for the bound that keeps this from ever sticking.
  const mapMoving = useRef(false);
  const isMapMoving = useCallback(() => mapMoving.current, []);

  const insets = useSafeAreaInsets();
  // The nav discs grow with the reader's text size, so the lane under them does too —
  // every floating card in the top region (the Återställ chip, the basemap notice, the
  // permission hints) measures from this rather than from a baked-in 46 dp disc.
  const { laneTop: navLaneTop } = useNavMetrics();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Space the floating dock occupies from the screen bottom = card height + the
  // safe-area inset + the float gap beneath it. The map reserves this much so
  // southern Sweden (Malmö) is never hidden behind the dock.
  const collapsedDock = DOCK_COLLAPSED_BASE + insets.bottom + DOCK_FLOAT;

  const { settings, loaded: settingsLoaded, update } = useSettings();
  const { coords, label, source } = useLocation();
  // Keep the normal Sweden framing, but allow the position control to reach travellers.
  const cameraBounds = useMemo<[number, number, number, number]>(() => [
    Math.max(-180, Math.min(MAX_BOUNDS[0], coords.longitude - 2)),
    Math.max(-85, Math.min(MAX_BOUNDS[1], coords.latitude - 2)),
    Math.min(180, Math.max(MAX_BOUNDS[2], coords.longitude + 2)),
    Math.min(85, Math.max(MAX_BOUNDS[3], coords.latitude + 2)),
  ], [coords.longitude, coords.latitude]);
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
  const clock = useSolarClock(isFocused, isMapMoving);
  // Stable across renders (useSolarClock memoises it with no deps), unlike `clock` itself —
  // so the settled-camera handler below can depend on it without being rebuilt on every
  // tick and every scrub frame.
  const flushClock = clock.flush;
  // 'done' when there is no provider (the screen tests mount this on its own), so the
  // soft-ask queue behaves exactly as it did before the introduction existed.
  const introStatus = useOptionalIntroStatus();
  // Never pending with no provider either — same fallback, same reasoning.
  const { pending: mapLessonPending, dismiss: dismissMapLesson } = useOptionalMapLesson();

  // How much bottom clearance a floating UI element (MosqueCard) needs to sit above
  // whichever of the two mutually-exclusive bottom surfaces is actually showing —
  // MapLessonCard is roughly 360dp against the dock's ~140dp (see LESSON_CARD_HEIGHT).
  // mapLessonPending is already settled by the time Bonetider first mounts
  // (valkommen.tsx's finish() arms it before navigating), so there is no race to
  // resolve here. NOT used for the camera's own fitBounds padding — see the comment
  // at SWEDEN_BOUNDS's initialViewState below for why that stays fixed to the dock's
  // (shorter) height regardless of which surface is up.
  const dockSlotBottom = mapLessonPending
    ? LESSON_CARD_HEIGHT + insets.bottom + DOCK_FLOAT
    : collapsedDock;

  // The map lesson's own stepping state — independent of `clock`, `grid` and `solar`
  // below, which stay wired to the live day throughout. `today` is captured once, in a
  // lazy initialiser: it only decides which year the examples are sampled from, and
  // re-reading the clock would rebuild a frame at midnight for no gain (same trick the
  // old standalone demo used).
  //
  // Deliberately no autoplay: an earlier version played through the examples on a timer
  // before handing over to manual stepping, but that meant the first thing the lesson did
  // was something the user didn't do — the chevrons are the only way this advances now, so
  // every example the user sees is one they asked to see.
  const [lessonIndex, setLessonIndex] = useState(0);
  const [lessonToday] = useState(() => Date.now());

  // The map camera, mirrored from MapLibre's region events. BOTH overlays — the Skia
  // field canvas and the RN marker/pill layer — now read the `cam` shared value and
  // project on the UI thread, so a live pan moves them without a React render. React only
  // owns the rendered viewport size; camera pose stays in `cam`, including after a settled
  // region event. Keeping settled lon/lat/zoom in state used to re-render this entire screen
  // even though no React component consumed those values.
  // Camera state is seeded with the window dims so the first paint isn't blank, and the
  // Map's onLayout below replaces width/height with the actual rendered viewport so the
  // Skia overlay's projection matches the basemap (on iOS the Stack screen content area
  // can be smaller than the window — see the onLayout for why this matters).
  const cam = useSharedValue<MapCamera>({ lon: 17.4, lat: 62.1, zoom: 4, width: screenW, height: screenH });
  const [viewportSize, setViewportSize] = useState({ width: screenW, height: screenH });
  // Gate the overlay (Skia field + RN markers) until the FIRST settled region event
  // lands — projecting against the seed camera (lat=62.1, zoom=4) puts every city far
  // off where the basemap actually rendered after fitBounds. By waiting for the first
  // settled event, the overlay never paints against a stale camera.
  const [cameraReady, setCameraReady] = useState(false);
  const reduceMotion = useReducedMotion();

  // The basemap is fetched over the network at runtime (vector tiles + glyphs from
  // OpenFreeMap/MapTiler, elevation from the DEM host), so it can simply fail — offline,
  // captive portal, provider outage, expired key. Until now that failure was completely
  // silent: MapLibre renders nothing, the Skia wash and the prayer lines carry on
  // painting perfectly over the void, and the screen reads as "the map is broken" with
  // no way to tell whether it's the app or the network.
  //
  // TWO shapes of failure, and they need different words:
  //   • 'style'   — onDidFailLoadingMap. Rare here by construction: the style is inline JSON
  //                 (lib/map/nordicStyle), so there is no style document to fetch and fail.
  //   • 'network' — the ordinary one, and the one that used to be invisible. The style loads
  //                 fine and every tile, glyph and TileJSON behind it fails, which fires no
  //                 map event whatsoever. MapLibre's native log stream is the only channel
  //                 that sees it; see lib/map/map-diagnostics.
  //
  // The overlay is deliberately NOT gated on this. Its geometry comes from the solar
  // engine, not from tiles — the prayer lines are still true without a basemap under
  // them, and hiding them would turn a degraded map into a dead screen. We say what
  // happened instead, and let the rest keep working.
  const [mapTrouble, setMapTrouble] = useState<'style' | 'network' | null>(null);
  // Counts resource failures in a sliding window, so one transient 500 on a working
  // connection cannot flash a notice, and so a "finished rendering fully" event is only
  // believed as recovery once the failures have actually stopped.
  const troubleBurst = useMemo(() => createTroubleBurst(), []);
  useEffect(() => {
    return watchResourceFailures((at) => {
      if (troubleBurst.hit(at)) {
        // 'network' outranks a style failure in the copy: with an inline style, a style
        // error is a bug in our own JSON, while this is the one the reader can act on.
        setMapTrouble('network');
      }
    });
  }, [troubleBurst]);

  // THE REVEAL. MapLibre paints its own surface a pale grey until the first tiles
  // composite — on a dark screen that is a bright flash between the introduction and the
  // map, and there is no prop for it (v11's Map takes no background/load colour, and
  // androidView="texture" was tried and makes no difference: the fill is the renderer's,
  // not the surface's). So the screen paints the basemap's OWN land colour over the map
  // and dissolves it once the map has really drawn — see the cover below `Map`.
  //
  // Latched, never un-set: this is the first paint of the session, not a state the map
  // returns to. onDidFinishRenderingMapFully fires again on every settled render
  // afterwards, and a cover that could come back would blink over the map on every pan.
  const [mapPainted, setMapPainted] = useState(false);
  const revealMap = useCallback(() => setMapPainted(true), []);
  // Whether the basemap is currently rendered COMPLETELY — see noteFullRender for why this
  // is not the same question as `mapPainted`.
  //
  // ⚠️ NOT A ONE-WAY LATCH, and it was one for a moment. Set true and left there, the offline
  // notice can only ever appear before the first complete render — so a reader who opens the
  // app online, then goes offline on a train and pans somewhere with no cached tiles, gets
  // blank land and silence: the same hole this notice exists to close, moved from "cold
  // launch" to "any time after the first good render". It is cleared again whenever the map
  // MOVES while offline, which is exactly when tiles it does not hold can come into view;
  // a settled full render then sets it back and the notice withdraws on its own.
  const [mapComplete, setMapComplete] = useState(false);
  // Every tile in view has arrived and composited. That is the honest recovery signal for a
  // network failure — but only once the failures have stopped: the renderer can report a
  // finished frame while requests are still erroring, and clearing on that would blink the
  // notice off in front of a map that is still empty.
  const noteFullRender = useCallback(() => {
    revealMap();
    // A SEPARATE latch from `mapPainted`, and the difference is the whole point of it.
    // `mapPainted` is also set by the safety-net timeout below — "stop waiting and show
    // what we have", which offline means empty land. This one is only ever set by the map
    // telling us every tile in view actually arrived, which is the only evidence that the
    // basemap is genuinely there. The offline notice reads THIS: conflating the two would
    // have cleared the notice eight seconds into an outage, precisely when the reader is
    // looking at a blank map and most needs to be told why.
    setMapComplete(true);
    setMapTrouble((prev) => {
      if (prev !== 'network' || !troubleBurst.quiet(Date.now())) return prev;
      // Hand the counter a clean slate along with the notice, or the next outage would be
      // counting from failures this one already spent.
      troubleBurst.clear();
      return null;
    });
  }, [revealMap, troubleBurst]);
  // The safety net. `…MapFully` means every tile in view arrived, so a phone on a bad
  // train connection could wait on it far longer than anyone should look at a flat
  // ground — and offline it never fires at all. After this the cover goes regardless:
  // the worst case is the flash we started with, which is a better failure than a map
  // that never appears. Deliberately generous, because the cover is not a spinner — it
  // is the map's own land colour, so a reader waiting behind it is looking at Sweden
  // without its detail rather than at a loading screen.
  useEffect(() => {
    const timer = setTimeout(revealMap, MAP_REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [revealMap]);

  // ⚠️ THE HOLE THE LOG WATCHER CANNOT SEE, closed here.
  //
  // lib/map/map-diagnostics says it outright, from a measured device session: offline on
  // Android, MapLibre DEFERS its requests rather than failing them, so not one line is
  // logged and `mapTrouble` never fires. The reader opening the app in a mosque basement —
  // the exact situation the offline story exists for — got flat land, correct prayer lines
  // floating on it, and no word about which half was broken.
  //
  // A connectivity read is the only channel that sees that, and it is used for two things
  // and nothing more:
  //
  //   • the WORDS. "Kartan svarar inte" and "du är offline" are different problems with
  //     different remedies, and the app knows which one it has.
  //   • the one case the watcher misses: offline with a basemap that never completed. Once
  //     it HAS completed, being offline is not news — the ambient cache means a returning
  //     reader gets their whole map with no network at all, and a notice over a perfectly
  //     good map would be the app complaining about nothing.
  const { isInternetReachable } = useNetworkState();
  const offline = isInternetReachable === false;

  const trouble: 'style' | 'network' | 'offline' | null =
    offline && (mapTrouble != null || !mapComplete) ? 'offline' : mapTrouble;

  // Let MapLibre keep the basemap it has already fetched instead of re-fetching it every
  // launch (see lib/map/offline for why this is a cache cap and not an offline download).
  // Fire-and-forget on mount: it is an optimisation, and a phone that refuses it still gets a
  // map. Runs once — the value it sets is stored in MapLibre's own database, not in state.
  useEffect(() => {
    void ensureBasemapCache();
  }, []);
  // Measured, not assumed: the notice's copy wraps to a second line on a narrow screen or
  // at a large font scale, so its height is the only honest way to place anything beneath
  // it. Feeds `hintTop` below — see there for what was colliding.
  const [noticeHeight, setNoticeHeight] = useState(0);

  // Flips true as soon as the user has noticeably panned or zoomed away from the
  // initial framing. Drives the floating "Visa hela Sverige" reset chip.
  const [moved, setMoved] = useState(false);
  const [positionZoom, setPositionZoom] = useState(false);
  const [lineMessage, setLineMessage] = useState<{ text: string; id: number } | null>(null);
  const dismissLineMessage = useCallback(() => setLineMessage(null), []);
  const [introduceDock, setIntroduceDock] = useState(false);

  // Where the top region's two full-width callouts sit. HINT_TOP_OFFSET only ever cleared
  // the nav discs and the Återställ chip's row; it never accounted for the basemap-failure
  // notice, which shares the SAME left/right band and starts 10dp ABOVE it — and, being
  // rendered last, drew straight over the hint card's icon and title. The two are fully
  // independent (styleFailed comes from onDidFailLoadingMap; the offer queue only waits on
  // cameraReady), so the collision is not a corner case: it is what a first launch on a
  // weak connection looks like, which is exactly when both have something to say.
  const noticeTop = insets.top + navLaneTop + MAP_ERROR_OFFSET;
  const hintTop = Math.max(
    insets.top + hintTopOffset(navLaneTop),
    trouble != null && noticeHeight > 0 ? noticeTop + noticeHeight + space.sm : 0,
  );

  // Bumped on every camera publish. The projection guard samples it before asking MapLibre
  // where a coordinate is, and compares afterwards: anything published in between means the
  // map moved during the round-trip, so the answer describes a different camera than the one
  // being checked. A ref, because this must not cause a render of its own.
  const publishSeq = useRef(0);

  const publishCamera = useCallback(
    (next: MapCamera) => {
      // Both overlays project from this shared value, so publishing camera pose never
      // needs a React state update.
      publishSharedCamera(cam, next);
      publishSeq.current += 1;
    },
    [cam],
  );

  useEffect(() => {
    // Preserve the latest camera pose while updating only the dimensions React owns.
    resizeSharedCamera(cam, viewportSize.width, viewportSize.height);
  }, [viewportSize, cam]);

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

  // The launch introduction: reveal the day's prayer times, then ask the ONE question
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
  // during that window ABORTS before noteNotificationShown(), so no showing is spent on a card nobody
  // saw. (day-navigation.test.tsx asserts the record stays at shown: 0.)
  const armOffer =
    cameraReady &&
    !selectedMosque &&
    settingsLoaded &&
    // The introduction asks these same two questions with a screen's worth of context in
    // front of them, and it covers this one while it does. Arming here would spend a
    // showing on a card nobody can see — and, worse, could put the OS dialog on screen
    // behind the wizard. index.tsx already redirects a pending intro away from the map;
    // this is the guard for any path that doesn't go through it. See lib/intro.
    introStatus === 'done' &&
    // The map lesson gets the screen to itself first — the moment it's dismissed this
    // flips true (if the rest still holds) and the reveal effect below fires on its own,
    // so a skipped location/notification step in the wizard still gets its later, calmer
    // chance right after, exactly as the soft-ask asymmetry intends.
    !mapLessonPending &&
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
        await (offer === 'location' ? noteLocationShown() : noteNotificationShown());
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

  // The single owner of nowFraction. Keeping every nowFraction write in ONE effect is
  // deliberate — the React Compiler forbids mutating a shared value across multiple
  // effects. (It used to share the job with the daybreak intro; see the note at the top.)
  useEffect(() => {
    // Live mode GLIDES instead of stepping: each 30 s tick re-anchors at the true now and
    // eases linearly toward the PREDICTED next tick, so the wash and lines move at the
    // sun's real rate. A stale value (from a paused/backgrounded clock) is snapped first,
    // then glides. Scrub mode pins the value directly.
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
  }, [clock.fraction, clock.mode, clock.dayLength, nowFraction]);

  const sig = computeSignature(settings);

  // The map lesson's currently-shown frame — built with the SAME sig, but through
  // demoFrame's own coarse cache (see lib/solar/demo-year), never through gridForDay:
  // running the lesson's three examples through the live grid cache below would evict
  // today's grid and hand the map a rebuild stutter the instant the lesson closes.
  // `avoid` is the user's real coordinates, since their location dot is genuinely on
  // screen here (MapMarkersOverlay draws it in both modes) — unlike the old standalone
  // demo, which had no dot to keep a pill clear of.
  // One lookup, shared by the frame here and the card near the bottom of the tree.
  // Both stepper handlers clamp `lessonIndex`, so it is always in range — but holding
  // the example as a VALUE rather than re-indexing at each use is what makes it
  // impossible for the card to describe a different month than the map is drawing.
  const lesson = MAP_LESSON_EXAMPLES[lessonIndex];
  const lessonFrame =
    mapLessonPending && lesson
    ? demoFrame(
        lesson.month,
        lessonToday,
        settings,
        sig,
        lonLatOf(coords),
      )
    : null;
  // Own shared value rather than reusing `nowFraction` above — that one's effect is the
  // single owner of the live glide's timing (see its comment), and the lesson's fraction
  // is a plain snap, not a glide, so keeping them apart means neither has to know the
  // other exists.
  const lessonFraction = useSharedValue(lessonFrame?.fraction ?? 0);
  useEffect(() => {
    if (lessonFrame) lessonFraction.value = lessonFrame.fraction;
  }, [lessonFrame, lessonFraction]);

  // The whole-country prayer-time lattice — the one expensive step (3752 adhan
  // computations, 200–600 ms of blocked JS on a mid-range Android). Cached per day and
  // per compute-affecting setting in lib/solar/grid-cache, which also owns the
  // unresolved/unrounded override the field is built with; see that module for why the
  // grid deliberately does NOT use the user's polar and rounding choices.
  //
  // The cache is what makes day stepping usable: without it, stepping forward and back
  // would pay that cost twice for a grid that has not changed at all.
  //
  // That cost used to be paid in the SAME render pass as everything else, so stepping a
  // day bought a selection haptic and then a frozen screen: the date, the countdown, the
  // six times and the map's lines all appeared together, several hundred milliseconds
  // after the tap. No spinner could have covered it — JS is the thread that is blocked.
  // Deferring the day the FIELD is built for splits the two: the cheap, per-user work
  // below (userTimes, marks, the dock's date crown and countdown) commits on the tap,
  // and the whole-country lattice catches up in the low-priority pass right behind it.
  // The map trails by a beat instead of the whole screen stopping.
  const fieldDayStart = useDeferredValue(clock.dayStart);
  // During that one trailing pass `fieldDayStart` is still the previous day while
  // `clock.now` has already moved to the new one — and buildLines contours (prayerTime −
  // now) per cell, so feeding it the two mismatched would paint a frame of nonsense.
  // Carry the time-of-day across instead: the field keeps drawing the day it has, at the
  // instant it is already showing, until its own day arrives. On a scrub (same day) the
  // two are always equal and this is exactly today's behaviour.
  const fieldNow =
    fieldDayStart === clock.dayStart ? clock.now : fieldDayStart + (clock.now - clock.dayStart);
  const grid = useMemo(
    () => gridForDay(fieldDayStart, settings, sig),
    // A cosmetic settings change re-runs this memo, but gridForDay returns the SAME
    // cached object for an unchanged signature — so `grid`'s identity, and every memo
    // downstream of it, stays stable.
    [fieldDayStart, settings, sig],
  );

  // The user's dot as [lon, lat] — anchors the Skia arrival bloom and keeps each prayer
  // line's label pill clear of the dot. Memoised on the two PRIMITIVES rather than on
  // `coords`, so a new coords object carrying the same position doesn't churn every
  // overlay memo downstream. It is the one conversion of the user's position into
  // MapLibre order in this file; `solar` below takes the result rather than spelling
  // `[longitude, latitude]` a second time.
  const { latitude: userLat, longitude: userLon } = coords;
  const userPoint = useMemo<LonLat>(
    () => lonLatOf({ latitude: userLat, longitude: userLon }),
    [userLat, userLon],
  );
  // The sweeping prayer lines for this instant — the level-0 contour of (prayerTime −
  // now) per prayer (appears/sweeps/vanishes on its own). Computed in JS here (cheap
  // arithmetic on the cached grid); the Skia overlay projects them to screen-space paths
  // on the UI thread, and the labels anchor the marker overlay's pills.
  // `avoid` keeps each line's pill clear of the user's dot (see buildLines): when a
  // prayer's line sweeps through the user's city the pill would otherwise sit right
  // on the brass dot + city name.
  const solar = useMemo(() => buildLines(grid, fieldNow, userPoint), [grid, fieldNow, userPoint]);
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

  // The polar daylight boundary for this date: in summer the midnight-sun line (sun never
  // sets), in winter the polar-night line (sun never rises) — the latitude past which
  // sunrise/fajr/maghrib/ishaʾ have no defined time, so their sweeping lines simply stop.
  // Null near the equinoxes when it climbs off the top of the map. Derived from the day's
  // solar declination; coincides with adhan's NaN boundary (see polar-boundary.test.ts).
  // Keyed to the FIELD's day, not the dock's: it is drawn on the map beside the lines it
  // explains, so it has to arrive with them rather than a pass ahead of them.
  const polarBoundary = useMemo(
    () => polarBoundaryFor(new Date(fieldDayStart + clock.dayLength / 2)),
    [fieldDayStart, clock.dayLength],
  );

  // The user's own prayer times for today — drives the "next prayer", the day
  // marks under the slider, and the full list in the dock. Independent of the grid.
  const userTimes = useMemo(
    () => computePrayerTimes(coords, zonePrayerDate(clock.dayStart), settings),
    [coords, clock.dayStart, settings],
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
    const fajr = computePrayerTimes(coords, zonePrayerDate(clock.dayStart, 1), settings).fajr;
    const at = fajr instanceof Date ? fajr.getTime() : Number.NaN;
    return Number.isFinite(at) ? at : null;
  }, [coords, clock.dayStart, settings]);

  // The viewed day's own next slot, or the following day's Fajr once ʿIshāʾ has passed. Both
  // rules — the inclusive `>=` that makes a tapped prayer read as current, and the range check
  // that keeps a next-day Fajr from pointing into the past — live in selectNextPrayer.
  const next = useMemo<NextPrayer | null>(
    () => selectNextPrayer(userTimes, nextDayFajrAt, clock.now),
    [userTimes, clock.now, nextDayFajrAt],
  );

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
  // The camera has started moving — see `mapMoving`. Fires for gestures and for our own
  // fitBounds animations alike, and both are moments where a field rebuild is unwelcome.
  const onRegionWillChange = useCallback(() => {
    mapMoving.current = true;
  }, []);

  const onRegionIsChanging = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { zoom, bounds } = e.nativeEvent;
      if (zoom > 1) {
        const [west, south, east, north] = bounds;
        const c = viewportCentreFromBounds(west, south, east, north);
        // The Skia overlay AND the marker layer both read `cam` on the UI thread, so a
        // live pan needs no per-frame React state. Settling does not need a second copy.
        publishCamera({
          lon: c.lon,
          lat: c.lat,
          zoom,
          width: viewportSize.width,
          height: viewportSize.height,
        });
      }
    },
    [publishCamera, viewportSize.width, viewportSize.height],
  );

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      // At rest again. Do this before any of the early returns below: every one of them is
      // a legitimate settle, and a tick held back during the gesture must be collected on
      // all of them or the clock waits for the next 30 s boundary. `flush` is a no-op when
      // nothing was held back, so an ordinary pan does not rebuild the field on settle.
      mapMoving.current = false;
      flushClock();
      // The reader has moved the map. Offline, whatever is now in view may be tiles the
      // ambient cache never held, so stop claiming the basemap is complete until MapLibre
      // says so again (noteFullRender). Online this is irrelevant — `trouble` reads it only
      // when offline — so the ordinary pan pays one setState React bails out of.
      if (offline) setMapComplete(false);

      const { zoom, bounds } = e.nativeEvent;
      const [west, south, east, north] = bounds;
      const vc = viewportCentreFromBounds(west, south, east, north);
      // Feed the overlay the UNPADDED viewport centre (from bounds), not MapLibre's
      // reported `center` (which is the padded camera target in v11/GL JS) — see
      // viewportCentreFromBounds's comment.
      if (zoom > 1) {
        const next = {
          lon: vc.lon,
          lat: vc.lat,
          zoom,
          width: viewportSize.width,
          height: viewportSize.height,
        };
        publishCamera(next);
        if (!cameraReady) setCameraReady(true);
        // Deliberately not awaited: the handler's job is to move the map's overlays, not to
        // wait on a diagnostic. The sequence check is what keeps the answer honest — a settle
        // is very often followed straight away by another gesture, and a reading taken across
        // that reports a drift nobody has (measured: 253 dp of pure fiction from two swipes).
        const seq = publishSeq.current;
        void reportProjectionDrift(
          mapRef.current,
          next,
          undefined,
          () => publishSeq.current === seq,
        );
      }
      // The first qualifying settled event (zoom > 1) is the initial fit. Record it
      // as the comparison anchor for the "moved?" detector below; never enforce.
      if (initialFrame.current === undefined) {
        if (zoom > 1) initialFrame.current = { lon: vc.lon, lat: vc.lat, zoom };
        return;
      }

      // THE BUG THIS FIXES: the chip came back the instant it was pressed.
      //
      // "Home" used to be a SAMPLE — the frame that happened to land at mount — while
      // pressing Återställ runs a fresh fitBounds. The two need not agree. The padding
      // is `collapsedDock + DOCK_MARGIN`, and collapsedDock carries `insets.bottom`,
      // which is 0 on the first render and settles once the safe-area provider
      // measures; MapLibre's own camera constraints can nudge the result too. Land
      // more than 0.5° or 0.05 zoom off the sample and `drifted` reads true again, so
      // the settled event that ends the reset animation puts the chip straight back.
      //
      // So a reset RE-ANCHORS rather than being measured against the old sample: home
      // is wherever "Visa hela Sverige" actually just put us. That also makes the chip
      // mean what it says — shown only when the map differs from home — no matter how
      // the framing drifts over the life of the screen.
      if (resetPending.current) {
        // Unless the user grabbed the map mid-flight: then this settled event is
        // theirs, not the animation's, and re-anchoring would quietly adopt wherever
        // they dragged to as the new home.
        if (e.nativeEvent.userInteraction) {
          resetPending.current = false;
        } else {
          if (zoom > 1) {
            initialFrame.current = { lon: vc.lon, lat: vc.lat, zoom };
            resetPending.current = false;
            if (moved) setMoved(false);
          }
          return;
        }
      }

      // THE BUG THIS FIXES: "Återställ" was already on screen at launch, on a map the
      // user had never touched.
      //
      // Only a GESTURE may raise the chip. Everything that moves the camera during
      // startup is the app's own doing: the initial fitBounds re-runs as `insets.bottom`
      // lands (0 on the first render, real once the safe-area provider measures), the
      // viewport is remeasured by onLayout, and MapLibre clamps the result to
      // maxBounds/minZoom once the style loads. Any one of those settles further from
      // the sampled anchor than the 0.5°/0.05 thresholds below, and the chip appeared —
      // claiming "you moved the map" about a move the user did not make.
      //
      // A settle the user did not cause is therefore not drift; it IS home, so re-anchor
      // to it. Only while the chip is down: a spontaneous settle arriving mid-drift must
      // not quietly adopt the view the user panned to as the new home (that is the same
      // trap the resetPending branch above guards).
      if (!e.nativeEvent.userInteraction) {
        if (!moved && zoom > 1) initialFrame.current = { lon: vc.lon, lat: vc.lat, zoom };
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
    [publishCamera, viewportSize.width, viewportSize.height, cameraReady, moved, flushClock, offline],
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
        setViewportSize((prev) =>
          prev.width === width && prev.height === height ? prev : { ...prev, width, height },
        );
      }}
    >
      {/* Everything the glass chrome should blur — basemap, wash, markers — lives in
          this target; the dock/nav/reset glass below sample it on Android (true
          behind-content blur needs an explicit render source there, unlike iOS). */}
      <GlassBackdropTarget style={StyleSheet.absoluteFill}>
      <Map
        ref={mapRef}
        testID="sweden-map"
        style={StyleSheet.absoluteFill}
        mapStyle={nordicMapStyleFor(scheme)}
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
        // Tap the map to put the mosque card away. Until now its own × was the only way
        // out, which is not how a card floating over a map is expected to behave.
        // A tap that HITS a mosque never gets here: MosqueLayer's source handler calls
        // stopPropagation(), so a hit opens (or swaps) the card and a miss closes it.
        onPress={(event) => {
          setSelectedMosque(null);
          if (!cameraReady || mapLessonPending) return;
          const [x, y] = event.nativeEvent.point;
          const point = { x, y };
          let distance = 22;
          let message: string | null = null;
          if (settings.showQibla) {
            const arc = greatCirclePoints(coords, KAABA, 96).slice(0, 32);
            const d = distanceToLine(point, arc, cam.value);
            if (d < distance) {
              distance = d;
              message = `Linjen visar qibla – riktningen mot Kaba i Mecka. Från ${placeLabel}: ${Math.round(qiblaDistanceKm(coords)).toLocaleString('sv-SE')} km.`;
            }
          }
          for (const line of prayerLines) {
            for (const path of line.polylines) {
              const d = distanceToLine(point, path, cam.value);
              if (d < distance) {
                distance = d;
                const time = userTimes[line.prayer];
                const localTime = Number.isFinite(time.getTime()) ? ` I ${placeLabel}: ${formatTime(time)}.` : '';
                message = `${PRAYER_LABELS[line.prayer]} · ${PRAYER_SWEDISH_NAMES[line.prayer]}. Linjen visar var ${line.prayer === 'sunrise' ? 'solen går upp' : 'bönetiden börjar'} vid kartans valda tid.${localTime}`;
              }
            }
          }
          if (message) {
            hapticLight();
            setLineMessage({ text: message, id: Date.now() });
          } else setLineMessage(null);
        }}
        onRegionWillChange={onRegionWillChange}
        onRegionIsChanging={onRegionIsChanging}
        onRegionDidChange={onRegionDidChange}
        // Recovery is automatic: MapLibre keeps retrying tiles, so a style that comes
        // back on its own clears the notice without the user doing anything.
        onDidFinishLoadingStyle={() => setMapTrouble((prev) => (prev === 'style' ? null : prev))}
        // The map's first paint, and the cue that ends the reveal cover below. It is the
        // EARLIEST honest one: onDidFinishLoadingStyle fires while the surface is still
        // MapLibre's pale grey (measured six seconds early on a cold emulator), and
        // onDidFinishRenderingFrame fires for frames that have nothing in them yet.
        // onDidFinishRenderingFrameFully lands within ~10 ms of this, so there is nothing
        // to gain by preferring it.
        onDidFinishRenderingMapFully={noteFullRender}
        // A style that never arrives must not leave the cover up: the notice below needs
        // to be readable, and a map that has given up is better shown as the flat ground
        // it will stay than as a screen still pretending to load.
        onDidFailLoadingMap={() => {
          setMapTrouble((prev) => prev ?? 'style');
          revealMap();
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: SWEDEN_BOUNDS,
            // Always the dock's (shorter) clearance, never dockSlotBottom — see the note
            // at LESSON_CARD_HEIGHT for why reserving the taller card's height here would
            // zoom the whole view out instead of just framing Sweden more tightly.
            padding: { top: 0, right: 0, bottom: collapsedDock + DOCK_MARGIN, left: 0 },
          }}
          // The leash, not the framing — see MAX_BOUNDS. The "Visa hela Sverige" chip
          // stays: this bounds how far wrong things can go, it does not replace the way
          // back from a merely-drifted view.
          maxBounds={cameraBounds}
          minZoom={MIN_ZOOM}
        />
        {/* Sweden's mosques as quiet POIs on the basemap — a NATIVE source+layer (not a
            projected RN overlay), so it gets zoom-gating, collision culling and tap
            hit-testing for free. It draws under the wash/lines above, which is right: a
            mosque is a place on the ground, not chrome floating over the sky. Off when
            the user hides it in Inställningar. */}
        {settings.showMosques && (
          <MosqueLayer onSelect={setSelectedMosque} selectedId={selectedMosque?.id ?? null} />
        )}
      </Map>

      {/* The reveal cover. Sits directly ON the basemap and UNDER everything the app
          draws itself, which is the whole point of putting it here rather than over the
          screen: the wash, the prayer lines and the markers come up on schedule against a
          calm ground, and the basemap's detail resolves beneath them. A cover over the
          whole screen would have hidden the app's own graphics too and turned the first
          seconds into a splash — this hides only the part that isn't ready.

          Its colour is the basemap's own LAND (basemapGroundFor), not `paper` or
          `paperSunken`: the cover is standing in for the map's ground, so when it goes
          nothing changes colour and the moment reads as detail arriving rather than as a
          layer being removed.

          `exiting` rather than an opacity spring, because the cover is unmounted for good
          once it goes and Reanimated's exit animation is exactly that shape — and under
          Reduce Motion it simply disappears, which is what the setting asks for. */}
      {!mapPainted && (
        <Animated.View
          testID="map-reveal-cover"
          pointerEvents="none"
          exiting={reduceMotion ? undefined : FadeOut.duration(MAP_REVEAL_MS)}
          style={[StyleSheet.absoluteFill, { backgroundColor: basemapGroundFor(scheme) }]}
        />
      )}

      {/* The custom graphics ride ABOVE the basemap on a Skia canvas: the GPU twilight
          wash + the sweeping prayer lines, projected from the camera shared value so they
          stay glued to the map as it pans/zooms. Gated on `cameraReady` so the overlay
          never paints against the stale seed camera (lat 62.1 / zoom 4) — the basemap's
          actual fit on iOS resolves to a different camera, and that mismatch is what
          shoved every city ~50 mil south on first paint. Also gated off while the map
          lesson is up — its own overlay pair (below) takes over instead, so the two never
          paint the same frame at once. */}
      {cameraReady && !mapLessonPending && (
        <SolarSkiaOverlay
          dayStart={clock.dayStart}
          dayLength={clock.dayLength}
          nowFraction={nowFraction}
          geometryNow={clock.now}
          camera={cam}
          lines={prayerLines}
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
      {cameraReady && !mapLessonPending && (
        <MapMarkersOverlay
          camera={cam}
          userCoords={coords}
          labels={solar.labels}
          nextKey={nextKey}
          polarBoundary={polarBoundary}
        />
      )}

      {/* The map lesson's own overlay pair — same components, independent props, driven
          by demoFrame's curated months instead of the live clock. Deliberately a SEPARATE
          instance rather than a prop-swap on the live one above: this is the one landing
          in the app's whole lifetime where the map explains itself, and keeping it from
          ever touching the live overlay's prop computation is worth the second Skia
          canvas for the few seconds this is on screen. Same `cameraReady` gate as the
          live pair above and for the same reason — `cam` still holds the stale seed
          camera until the first settled region event lands. */}
      {cameraReady && mapLessonPending && lessonFrame && (
        <>
          <SolarSkiaOverlay
            dayStart={lessonFrame.dayStart}
            dayLength={lessonFrame.dayLength}
            nowFraction={lessonFraction}
            geometryNow={lessonFrame.instant}
            camera={cam}
            lines={lessonFrame.lines}
            showQibla={false}
            nextKey={null}
            imminentKey={null}
            userPoint={userPoint}
            arrival={null}
            polarBoundary={lessonFrame.polarBoundary}
          />
          <MapMarkersOverlay
            camera={cam}
            userCoords={coords}
            labels={lessonFrame.labels}
            nextKey={null}
            polarBoundary={lessonFrame.polarBoundary}
          />
        </>
      )}
      </GlassBackdropTarget>

      {/* The one bottom surface: normally next prayer + day scrubber, expandable to the
          full schedule — but for the one landing right after onboarding, the map lesson
          takes this slot instead. Mutually exclusive, so there is never a moment where
          both compete for the same strip of screen. */}
      {mapLessonPending && lesson && lessonFrame ? (
        <MapLessonCard
          fact={lesson.fact}
          monthLabel={lessonFrame.monthLabel}
          timeLabel={lessonFrame.timeLabel}
          index={lessonIndex}
          total={MAP_LESSON_EXAMPLES.length}
          atStart={lessonIndex === 0}
          atEnd={lessonIndex === MAP_LESSON_EXAMPLES.length - 1}
          onPrev={() => setLessonIndex((i) => Math.max(0, i - 1))}
          onNext={() => setLessonIndex((i) => Math.min(MAP_LESSON_EXAMPLES.length - 1, i + 1))}
          onDismiss={() => {
            introOfferDone.current = true;
            setIntroduceDock(true);
            dismissMapLesson();
          }}
          // THE BUG THIS FIXES: this used to pass collapsedDock + DOCK_MARGIN — the
          // offset things floating ABOVE the dock use (MosqueCard). MapLessonCard
          // REPLACES the dock in the same slot instead, so it needs the dock's OWN
          // anchor (see PrayerDock's shadowWrap style) or it floats with a ~180dp gap
          // of bare map showing beneath it, for no reason.
          bottom={insets.bottom + DOCK_FLOAT}
        />
      ) : (
        <PrayerDock
          clock={clock}
          times={userTimes}
          marks={marks}
          next={next}
          locationLabel={placeLabel}
          locationIsFallback={locationIsFallback}
          settings={settings}
          // Introduce the schedule once after onboarding; let the reader close it.
          // Ordinary launches and permission reminders leave the dock collapsed.
          revealSchedule={introduceDock}
        />
      )}

      {/* Mosque detail card — floats just above the collapsed dock when a mosque POI is
          tapped. Gated on showMosques too, so hiding the layer also dismisses any open
          card. Sits after the dock so it layers above if they ever meet. */}
      {settings.showMosques && selectedMosque && (
        <MosqueCard
          mosque={selectedMosque}
          userCoords={coords}
          // dockSlotBottom, not collapsedDock: on the rare chance a mosque is tapped
          // while the map lesson is still up (its pins are zoom-gated, but map gestures
          // aren't blocked during the lesson), this floats above whichever of the two
          // bottom surfaces is actually showing instead of assuming it's always the dock.
          bottom={dockSlotBottom + DOCK_MARGIN}
          onClose={() => setSelectedMosque(null)}
        />
      )}

      {/* Floating navigation: a live qibla compass (left) and the settings cog (right),
          each opening its screen as a sheet over the map. `active` (the screen's focus)
          gates the compass's heading subscription so the magnetometer pauses when a
          sheet is up or the app is backgrounded. */}
      <MapNav active={isFocused} zoomed={positionZoom} locationIsFallback={locationIsFallback} onLocate={() => {
        if (locationIsFallback) { router.navigate('/byt-plats'); return; }
        hapticLight();
        setLineMessage(null);
        if (positionZoom) {
          resetPending.current = true;
          cameraRef.current?.fitBounds(SWEDEN_BOUNDS, {
            padding: { top: 0, right: 0, bottom: collapsedDock + DOCK_MARGIN, left: 0 },
            duration: reduceMotion ? 0 : motion.slow,
          });
        } else {
          cameraRef.current?.flyTo({ center: userPoint, zoom: 11,
            duration: reduceMotion ? 0 : 900 });
        }
        setPositionZoom(!positionZoom);
      }} />
      {lineMessage && <MapLineToast key={lineMessage.id} message={lineMessage.text}
        top={hintTop} onDismiss={dismissLineMessage} />}

      {/* The map's soft asks — at most ONE per launch, chosen by pickOffer above. Each
          appears only after the schedule reveal has settled and only while its OS
          permission is still undetermined; their buttons are the only things in the app
          that fire the system dialogs, so dismissing either leaves that single lifetime
          prompt unspent. Rendered here, OUTSIDE GlassBackdropTarget (which closed above)
          — a glass surface inside the target would sample itself instead of the map. They
          sit below the nav row and below the Återställ chip's lane, colliding with
          neither, and share one `top` so the two cards are visually interchangeable. */}
      {phase === 'hint-location' && (
        <LocationHint top={hintTop} onClose={() => setPhase('done')} />
      )}

      {phase === 'hint-notifications' && (
        <NotificationHint
          top={hintTop}
          onEnable={() => update((prev) => ({ notifications: { ...prev.notifications, enabled: true } }))}
          onClose={() => setPhase('done')}
        />
      )}

      {/* The basemap could not be drawn — no network for its tiles, or (rarely) a style that
          would not load. Deliberately a NOTICE, not a card with a retry
          button: MapLibre already retries on its own, and there is nothing useful for a
          tap to do that waiting doesn't. It says which half is broken — the map, not the
          times — so a user staring at a blank screen behind correct prayer lines knows
          the app is still telling the truth. Clears itself when the style arrives.
          Rendered outside GlassBackdropTarget, like the hint cards, so the glass samples
          the map rather than itself; `pointerEvents="none"` keeps the map draggable
          underneath. Sits below the reset chip's row so the two never collide. */}
      {trouble != null && (
        <View
          style={[styles.mapErrorWrap, { top: noticeTop }]}
          pointerEvents="none"
          // Reports the notice's real height so a hint card below it can clear it; the
          // copy wraps to two lines on narrow screens, so a constant would be a guess.
          onLayout={(e) => {
            const { height } = e.nativeEvent.layout;
            setNoticeHeight((prev) => (Math.abs(prev - height) < 1 ? prev : height));
          }}
        >
          <GlassSurface style={styles.mapErrorNotice} borderRadius={radius.lg} tint={colors.cardGlass}>
            <Icon
              name={trouble === 'style' ? 'cloudOff' : 'wifiOff'}
              size={16}
              color={colors.inkMuted}
            />
            <Text style={[styles.mapErrorText, { color: colors.inkMuted }]}>
              {trouble === 'offline'
                ? 'Ingen internetanslutning. Kartan fylls i när du är uppkopplad igen. Bönetiderna stämmer ändå.'
                : trouble === 'network'
                  ? 'Ingen anslutning till kartan. Bönetiderna stämmer ändå.'
                  : 'Kartan kunde inte laddas. Bönetiderna stämmer ändå.'}
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
