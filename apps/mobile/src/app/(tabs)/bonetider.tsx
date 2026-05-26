import {
  Camera,
  type CameraRef,
  Map,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NativeSyntheticEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type DayMark,
  DOCK_COLLAPSED_BASE,
  DOCK_EXPANDED_BASE,
  DOCK_FLOAT,
  type NextPrayer,
  PrayerDock,
} from '../../components/map/PrayerDock';
import { CityMarkers } from '../../components/map/CityMarkers';
import { PrayerFieldOverlay } from '../../components/map/PrayerFieldOverlay';
import { mapTheme } from '../../components/map/theme';
import { useLocation } from '../../lib/location/context';
import { NORDIC_MAP_STYLE } from '../../lib/map/nordicStyle';
import { useSetNight } from '../../lib/solar/nightContext';
import { nightFactor } from '../../lib/solar/night';
import { computePrayerTimes, PRAYER_ORDER } from '../../lib/prayer-times';
import { useSettings } from '../../lib/settings/context';
import type { PrayerSettings } from '../../lib/settings/types';
import { buildGrid } from '../../lib/solar/field';
import { useSolarClock } from '../../lib/solar/useSolarClock';

// Sweden bounding box, flat [west, south, east, north] (MapLibre GL JS style).
const WEST = 10.6;
const SOUTH = 55.0;
const EAST = 24.2;
const NORTH = 69.2;
const SWEDEN_BOUNDS: [number, number, number, number] = [WEST, SOUTH, EAST, NORTH];
// Stop correcting once the visible region is within this much (degrees) of the
// target — avoids endless micro-adjustments from Mercator latitude rounding.
const EPSILON = 0.02;
const DAY_MS = 86_400_000;
// Extra breathing room (dp) reserved above the dock, so the south coast sits
// clearly above it rather than pressed against its top edge.
const DOCK_MARGIN = 40;

// How far to shift one axis so the visible span [vMin, vMax] sits inside the
// allowed span [min, max]. If the view is wider than the bound, centre on it.
function axisShift(vMin: number, vMax: number, min: number, max: number) {
  if (vMax - vMin >= max - min) return (min + max) / 2 - (vMin + vMax) / 2;
  if (vMin < min) return min - vMin;
  if (vMax > max) return max - vMax;
  return 0;
}

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
  // Bounds-enforcement is paused while the dock is expanded: the map is
  // deliberately re-fit above the dock (zoomed out past the floor), which the
  // enforcer would otherwise undo.
  const enforce = useRef(true);
  // The pending "re-enable enforcement" timer from a collapse. Held so a quick
  // re-expand can cancel it — otherwise a stale timer fires mid-expand, turns
  // enforcement back on while the dock is open, and snaps the lifted map back down.
  const reenableTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // Space the floating dock occupies from the screen bottom = card height + the
  // safe-area inset + the float gap beneath it. The map reserves this much so
  // southern Sweden (Malmö) is never hidden behind the dock.
  const collapsedDock = DOCK_COLLAPSED_BASE + insets.bottom + DOCK_FLOAT;
  const expandedDock = DOCK_EXPANDED_BASE + insets.bottom + DOCK_FLOAT;

  // When the dock opens, lift Sweden into the area above it (bottom padding =
  // the dock's height) so the south — where most people are — is never hidden.
  // When it closes, restore the collapsed framing (which still clears the dock).
  const onDockExpandedChange = useCallback(
    (expanded: boolean) => {
      enforce.current = false;
      // Cancel any pending re-enable from a previous collapse: if it fired now
      // (mid-expand) it would re-arm the enforcer over the open dock.
      if (reenableTimer.current) {
        clearTimeout(reenableTimer.current);
        reenableTimer.current = null;
      }
      cameraRef.current?.fitBounds(SWEDEN_BOUNDS, {
        padding: {
          top: 24,
          right: 24,
          bottom: (expanded ? expandedDock : collapsedDock) + DOCK_MARGIN,
          left: 24,
        },
        duration: 350,
      });
      if (!expanded) {
        // Re-enable only after the restore animation settles, so its own
        // onRegionDidChange events don't trip the enforcer mid-flight.
        reenableTimer.current = setTimeout(() => {
          enforce.current = true;
          reenableTimer.current = null;
        }, 450);
      }
    },
    [expandedDock, collapsedDock],
  );

  // Drop a pending re-enable timer if the screen unmounts mid-collapse.
  useEffect(() => {
    return () => {
      if (reenableTimer.current) clearTimeout(reenableTimer.current);
    };
  }, []);

  const { settings } = useSettings();
  const { coords, label } = useLocation();
  // The dock glance only needs the place — drop status qualifiers like "(standard)"
  // or "(GPS)" that matter on the Inställningar screen but are noise here.
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');
  // Pause the clock's live tick while another route is on top, so the map's field
  // isn't rebuilt in the background (e.g. every 30 s while the user is on Inställningar).
  const isFocused = useIsFocused();
  const clock = useSolarClock(isFocused);
  const setNight = useSetNight();

  const sig = computeSignature(settings);
  // The whole-country prayer-time lattice — the one expensive step, cached per day
  // and per compute-affecting setting. Midday avoids any DST edge on the date.
  const grid = useMemo(
    () => buildGrid(new Date(clock.dayStart + DAY_MS / 2), settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig captures the settings fields that matter
    [clock.dayStart, sig],
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
      const f = (at - clock.dayStart) / DAY_MS;
      if (f >= 0 && f <= 1) out.push({ key, fraction: f });
    }
    return out;
  }, [userTimes, clock.dayStart]);

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

  // How "night" it is at the user's place for the viewed instant (0 day → 1 deep
  // night). Drives the chrome so the dock, the prayer pills and the city markers
  // dim into night with the map. Quantised to 0.05 so scrubbing doesn't rebuild the
  // themed stylesheets every frame.
  const ms = (d: Date): number => (d instanceof Date ? d.getTime() : Number.NaN);
  const nightRaw = nightFactor(clock.now, {
    fajr: ms(userTimes.fajr),
    sunrise: ms(userTimes.sunrise),
    maghrib: ms(userTimes.maghrib),
    isha: ms(userTimes.isha),
  });
  const night = Math.round(nightRaw * 20) / 20;
  // Publish to the global chrome (the AppMenu, which lives over every screen) so it
  // dims into night in lockstep with the map and the dock — even while scrubbing.
  useEffect(() => {
    setNight(night);
  }, [night, setNight]);

  // The user's next prayer drives the emphasised line/pill on the map (only when
  // it's today — tomorrow's Fajr has no line sweeping the country yet).
  const nextKey = next && !next.tomorrow ? next.key : null;

  // The native maxBounds / minZoom camera props don't constrain on this
  // MapLibre build, so we keep the view on Sweden in JS: after each settled
  // pan/zoom, ease the camera back so the visible region stays within the
  // country and never zooms out past the framing level.
  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { center, zoom, bounds } = e.nativeEvent;
      // Wait for the initial bounds-fit before enforcing — the map emits a
      // pre-fit default at world zoom (~0.6) we must not act on.
      if (floorZoom.current === undefined) {
        if (zoom > 1) floorZoom.current = zoom;
        return;
      }
      // Paused while the dock is expanded (the map is intentionally lifted).
      if (!enforce.current) return;
      const [west, south, east, north] = bounds;
      const dx = axisShift(west, east, WEST, EAST);
      // Keep Sweden framed *above* the collapsed dock: when zoomed out enough to
      // see the whole country, hold a southern margin equal to the dock's share
      // of the screen so the south coast (Malmö) clears it. When zoomed in, just
      // keep the view inside the country.
      const span = north - south;
      const dy =
        span >= NORTH - SOUTH
          ? SOUTH - span * ((collapsedDock + DOCK_MARGIN) / screenH) - south
          : axisShift(south, north, SOUTH, NORTH);
      const targetZoom = Math.max(zoom, floorZoom.current);
      if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON || targetZoom - zoom > 0.001) {
        cameraRef.current?.easeTo({
          center: [center[0] + dx, center[1] + dy],
          zoom: targetZoom,
          duration: 200,
        });
      }
    },
    [collapsedDock, screenH],
  );

  return (
    <View style={styles.container}>
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
        <PrayerFieldOverlay
          grid={grid}
          now={clock.now}
          settings={settings}
          nextKey={nextKey}
          night={night}
        />
        {/* City markers ride above the wash so they stay legible on the night map. */}
        <CityMarkers night={night} />
      </Map>

      {/* The one bottom surface: next prayer + day scrubber, expandable to the full
          schedule. Navigation (☰) lives in the global AppMenu, top-right. */}
      <PrayerDock
        clock={clock}
        times={userTimes}
        marks={marks}
        next={next}
        locationLabel={placeLabel}
        settings={settings}
        night={night}
        onExpandedChange={onDockExpandedChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mapTheme.accentSoft },
});
