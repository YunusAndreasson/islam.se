import {
  Camera,
  type CameraRef,
  Map,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NativeSyntheticEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';

import {
  type DayMark,
  DOCK_COLLAPSED_BASE,
  DOCK_FLOAT,
  type NextPrayer,
  PrayerDock,
} from '../components/map/PrayerDock';
import { MapMarkersOverlay } from '../components/map/MapMarkersOverlay';
import { type PrayerLineData, SolarSkiaOverlay } from '../components/map/skia/SolarSkiaOverlay';
import { mapTheme } from '../components/map/theme';
import { MapNav } from '../components/nav/MapNav';
import { useLocation } from '../lib/location/context';
import type { Camera as MapCamera } from '../lib/map/projection';
import { NORDIC_MAP_STYLE } from '../lib/map/nordicStyle';
import { nightFactor } from '../lib/solar/night';
import { computePrayerTimes, PRAYER_ORDER, type PrayerKey } from '../lib/prayer-times';
import { useSettings } from '../lib/settings/context';
import type { PrayerSettings } from '../lib/settings/types';
import { buildGrid, buildLines } from '../lib/solar/field';
import { useSolarClock } from '../lib/solar/useSolarClock';

// Sweden bounding box, flat [west, south, east, north] (MapLibre GL JS style).
const WEST = 10.6;
const SOUTH = 55.0;
const EAST = 24.2;
const NORTH = 69.2;
const SWEDEN_BOUNDS: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];
// Map is locked to Sweden: zoom out never beyond the Scandinavia framing, AND the
// view never pans off-country. EPSILON is generous (~0.5° ≈ 50 km) so projection
// rounding alone never re-triggers a snap — only meaningful drift past the bounds.
const EPSILON = 0.5;

// Shift one axis so the visible span [vMin, vMax] sits inside [min, max]. If the
// view is wider than the allowed span, centre the bound inside the view.
function axisShift(vMin: number, vMax: number, min: number, max: number): number {
  if (vMax - vMin >= max - min) return (min + max) / 2 - (vMin + vMax) / 2;
  if (vMin < min) return min - vMin;
  if (vMax > max) return max - vMax;
  return 0;
}
const DAY_MS = 86_400_000;
// Extra breathing room (dp) reserved above the dock, so the south coast sits
// clearly above it rather than pressed against its top edge.
// Clearance between the south coast and the dock's top edge when the whole country is
// framed. Generous enough that Malmö's dot AND its label clear the card — a tighter
// value left "Malmö" tucked under the dock's top edge.
const DOCK_MARGIN = 64;

// Only the fields that change the computed times — the grid is rebuilt when this
// signature changes, not on cosmetic settings (time format, Hijri offset).
function computeSignature(s: PrayerSettings): string {
  return JSON.stringify([
    s.calculationMethod,
    s.madhab,
    s.highLatitudeRule,
    s.polarCircleResolution,
    s.shafaq,
    s.adjustments,
    s.rounding,
  ]);
}

export default function Bonetider() {
  const cameraRef = useRef<CameraRef>(null);
  // The zoom that frames Sweden, captured from the first settled fit so it
  // adapts to the device. The user can't zoom out past it; zoom-in is free.
  const floorZoom = useRef<number | undefined>(undefined);

  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Space the floating dock occupies from the screen bottom = card height + the
  // safe-area inset + the float gap beneath it. The map reserves this much so
  // southern Sweden (Malmö) is never hidden behind the dock.
  const collapsedDock = DOCK_COLLAPSED_BASE + insets.bottom + DOCK_FLOAT;

  const { settings } = useSettings();
  const { coords, label } = useLocation();
  // The dock glance only needs the place — drop status qualifiers like "(standard)"
  // or "(GPS)" that matter on the Inställningar screen but are noise here.
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');
  // Pause the clock's live tick while another route is on top, so the map's field
  // isn't rebuilt in the background (e.g. every 30 s while the user is on Inställningar).
  const isFocused = useIsFocused();
  const clock = useSolarClock(isFocused);

  // The map camera, mirrored from MapLibre's region events. The RN marker overlay reads
  // camState directly; the Skia field canvas reads the `cam` shared value (so it can
  // project on the UI thread). We update camState from the region events and mirror it
  // into cam in an effect — the lint-approved way to write a shared value (mutating one
  // inside a plain JS callback trips react-hooks/immutability).
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
  // lands — on iOS, the initial fitBounds (initialViewState) doesn't reliably emit a
  // settle event before the basemap paints, so projecting against the seed (lat=62.1,
  // zoom=4) puts every city ~4° south of where the basemap actually rendered. The
  // user saw "cities ~50 mil too south, fixed after first zoom" — the first zoom was
  // the first region event that updated the camera state. By waiting for it, the
  // overlay never paints against a stale camera.
  const [cameraReady, setCameraReady] = useState(false);

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
  const nowFraction = useSharedValue(clock.fraction);
  useEffect(() => {
    nowFraction.value = clock.fraction;
  }, [clock.fraction, nowFraction]);

  const sig = computeSignature(settings);
  // The whole-country prayer-time lattice — the one expensive step, cached per day
  // and per compute-affecting setting. Midday avoids any DST edge on the date.
  //
  // The grid feeds the prayer LINES (buildLines below); the twilight wash is independent now
  // (pure sun geometry, see SolarSkiaOverlay). It forces polar resolution to 'unresolved',
  // NOT the user's choice (Sweden defaults to aqrabBalad): up north aqrabBalad borrows a
  // neighbouring latitude's times, discontinuous across the grid — e.g. today lat 68 and 69
  // both clamp to 22:21 next to lat 67's real 21:50 — so the Maghrib/Isha isolines came out
  // jagged, and it draws a confident prayer line where there is really perpetual twilight.
  // 'unresolved' leaves the polar zone NaN, so the lines stay smooth and simply stop at the
  // boundary. The user's OWN prayer times (userTimes below) keep their chosen resolution.
  const grid = useMemo(
    () => buildGrid(new Date(clock.dayStart + DAY_MS / 2), { ...settings, polarCircleResolution: 'unresolved' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig captures the settings fields that matter
    [clock.dayStart, sig],
  );

  // The sweeping prayer lines for this instant — the level-0 contour of (prayerTime −
  // now) per prayer (appears/sweeps/vanishes on its own). Computed in JS here (cheap
  // arithmetic on the cached grid); the Skia overlay projects them to screen-space paths
  // on the UI thread, and the labels anchor the marker overlay's pills.
  const solar = useMemo(() => buildLines(grid, clock.now), [grid, clock.now]);
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

  // The user's own prayer times for today — drives the "next prayer", the day
  // marks under the slider, and the full list in the dock. Independent of the grid.
  const userTimes = useMemo(
    () => computePrayerTimes(coords, new Date(clock.dayStart + DAY_MS / 2), settings),
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- depends on userTimes, which is intentionally memoized on `sig` (not the settings object); the manual memo is deliberate and the compiler can't preserve it
  const next = useMemo<NextPrayer | null>(() => {
    for (const key of PRAYER_ORDER) {
      const at = (userTimes[key]).getTime();
      if (Number.isFinite(at) && at > clock.now) return { key, at, tomorrow: false };
    }
    // Past today's Isha → tomorrow's Fajr.
    const fajr = computePrayerTimes(
      coords,
      new Date(clock.dayStart + DAY_MS + DAY_MS / 2),
      settings,
    ).fajr;
    const at = fajr instanceof Date ? fajr.getTime() : Number.NaN;
    return Number.isFinite(at) ? { key: 'fajr', at, tomorrow: true } : null;
  }, [userTimes, clock.now, clock.dayStart, coords, settings]);

  // How "night" it is at the user's place for the viewed instant (0 day → 1 deep night),
  // from the sun's real depression below the horizon (see nightFactor / sun.ts) — the same
  // physical darkness the map wash draws, so Malmö's luminous summer night reads the same on
  // the dock as on the map. Drives the chrome that floats on the map (dock, nav discs, city
  // markers, status bar); other screens stay on the OS theme. Quantised to 0.05 so scrubbing
  // doesn't rebuild the themed layers every frame.
  const nightRaw = nightFactor(clock.now, coords.latitude, coords.longitude);
  const night = Math.round(nightRaw * 20) / 20;

  // The user's next prayer drives the emphasised line/pill on the map (only when
  // it's today — tomorrow's Fajr has no line sweeping the country yet).
  const nextKey = next && !next.tomorrow ? next.key : null;

  // The native maxBounds / minZoom camera props don't constrain on this
  // MapLibre build, so we keep the view on Sweden in JS: after each settled
  // pan/zoom, ease the camera back so the visible region stays within the
  // country and never zooms out past the framing level.
  // While the map is moving, track the live camera so the overlays follow it (the
  // effect above mirrors this into the Skia canvas's shared value). The map is
  // bounds-locked and snaps back, so this fires only during brief, incidental pans.
  const onRegionIsChanging = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, zoom } = e.nativeEvent;
      if (zoom > 1) {
        publishCamera({ lon: center[0], lat: center[1], zoom, width: camState.width, height: camState.height });
      }
    },
    [publishCamera, camState.width, camState.height],
  );

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, zoom, bounds } = e.nativeEvent;
      // Settle the camera for the overlays. Skip the pre-fit world-zoom default (~0.6).
      // The first settled event with zoom > 1 means the basemap and our cam state are
      // in agreement — flip the overlay-ready flag so the Skia/markers can paint.
      if (zoom > 1) {
        publishCamera({ lon: center[0], lat: center[1], zoom, width: camState.width, height: camState.height });
        if (!cameraReady) setCameraReady(true);
      }
      // Wait for the initial bounds-fit before enforcing — the map emits a
      // pre-fit default at world zoom (~0.6) we must not act on.
      if (floorZoom.current === undefined) {
        if (zoom > 1) floorZoom.current = zoom;
        return;
      }
      // Zoom floor: never let the user zoom out past the framing.
      const targetZoom = Math.max(zoom, floorZoom.current);
      const zoomViolated = targetZoom - zoom > 0.001;

      // Position-lock the country ONLY at framing zoom — once the user has zoomed in
      // they're exploring, and panning around inside (or even out of) Sweden is fine.
      // At the framing level, snap them back hard so the country can't drift off.
      const exploring = zoom > floorZoom.current + 0.1;
      let dx = 0;
      let dy = 0;
      if (!exploring) {
        const [west, south, east, north] = bounds;
        dx = axisShift(west, east, WEST, EAST);
        const span = north - south;
        dy =
          span >= NORTH - SOUTH
            ? SOUTH - span * ((collapsedDock + DOCK_MARGIN) / camState.height) - south
            : axisShift(south, north, SOUTH, NORTH);
      }

      if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON || zoomViolated) {
        cameraRef.current?.easeTo({
          center: [center[0] + dx, center[1] + dy],
          zoom: targetZoom,
          // Duration 0 → instant snap, so the bounds feel like a HARD lock instead of
          // a rubber-band animation. The user explicitly asked for a lock, not a
          // snap-back to Sweden after dragging to Africa.
          duration: 0,
        });
      }
    },
    [collapsedDock, publishCamera, camState.width, camState.height, cameraReady],
  );

  return (
    <View
      style={styles.container}
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
      <Map
        testID="sweden-map"
        style={StyleSheet.absoluteFill}
        mapStyle={NORDIC_MAP_STYLE}
        // No on-map ornaments: the tappable attribution "i" (bottom-right) and the
        // MapLibre wordmark (bottom-left) are both hidden so nothing floats over the
        // wash. OSM/ODbL + OpenFreeMap credit belongs on the Om screen instead.
        attribution={false}
        logo={false}
        compass={false}
        onRegionIsChanging={onRegionIsChanging}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            bounds: SWEDEN_BOUNDS,
            // Reserve the collapsed dock's height (+ margin) at the bottom so the
            // south coast is framed clearly above it from the very first render.
            padding: { top: 24, right: 24, bottom: collapsedDock + DOCK_MARGIN, left: 24 },
          }}
        />
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
          camera={cam}
          lines={prayerLines}
          nextKey={nextKey}
        />
      )}

      {/* Point/label layer above the canvas: city dots + collision-managed labels (kept
          legible above the wash), the brass "you are here" dot, and the prayer pills.
          Same `cameraReady` gate — no point projecting cities against a stale camera. */}
      {cameraReady && (
        <MapMarkersOverlay
          camera={camState}
          userCoords={coords}
          userLabel={placeLabel}
          labels={solar.labels}
          nextKey={nextKey}
          night={night}
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
        settings={settings}
        night={night}
      />

      {/* Floating navigation: a live qibla compass (left) and the settings cog (right),
          each opening its screen as a sheet over the map. `active` (the screen's focus)
          gates the compass's heading subscription so the magnetometer pauses when a
          sheet is up or the app is backgrounded. */}
      <MapNav active={isFocused} night={night} />

      {/* Status-bar icons must read against the map under them, which is sun-driven, not the
          OS theme — over the deep night map the default dark glyphs vanished. Light glyphs
          past dusk, dark by day. Only while Bönetider owns the screen: when a settings/Qibla
          sheet is up, defer to its OS-themed "auto" so the clock stays legible there too. */}
      <StatusBar style={isFocused ? (night >= 0.5 ? 'light' : 'dark') : 'auto'} animated />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mapTheme.accentSoft },
});
