// The point/label layer that rides ABOVE the Skia field canvas: city dots + their
// (collision-managed) labels, the brass "you are here" dot, and the prayer pills. These
// were MapLibre GL layers + Markers (CityMarkers, UserLocationMarker, the pills in
// PrayerFieldOverlay); now that the wash is a Skia canvas above the basemap, these must
// sit above THAT canvas to stay legible (the night-veil-over-cities look was rejected),
// so they're plain RN views projected from the same camera. Native <Text> keeps the
// labels and pill times crisp and accessible. `pointerEvents="box-none"` lets gestures
// fall through to the map for the empty space — only the city dots themselves intercept
// taps, which fire a small "next prayer" tooltip + a haptic tick.
//
// Positions come from project() (src/lib/map/projection.ts), the same projection the
// Skia canvas and MapLibre basemap use, so dots/labels/pills land exactly on the map.
//
// Theming: OS-themed (useColors). Apple Maps-style — the basemap and chrome share an OS
// axis; the wash and prayer-line hues are still sun-driven (the live sky), but city
// markers / labels / pills follow the OS palette so the layer reads coherently against
// both basemaps. The label halo flips warm (light basemap) / dark (navy basemap) so the
// text stays readable on either ground.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { CITY_POINTS, type CityPoint } from '../../lib/map/cities';
import { type Box, placeCityLabels } from '../../lib/map/cityLabels';
import { type Camera, project } from '../../lib/map/projection';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
} from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import type { PrayerLineLabel } from '../../lib/solar/field';
import { prayerColorFor } from '../../lib/solar/palette';
import { palette } from '../../theme/tokens';
import { useActiveScheme, useColors } from '../../theme/useColors';

interface Props {
  /** React-state camera (settled after each region change) shared with the Skia canvas. */
  camera: Camera;
  userCoords: LatLng;
  /** The user's place name (GPS or manual) — always labelled at the marker, top priority. */
  userLabel: string;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  nextKey: PrayerKey | null;
  /** Settings (calculation method, madhab, …) — used to compute a tapped city's next
      prayer for the tooltip popover. */
  settings: PrayerSettings;
  /** Current instant — drives "next prayer FROM NOW" in the tap tooltip. */
  nowMs: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// Dot radius / label size grow with zoom and shrink with rank — mirrors the old
// MapLibre zoom-interpolated `DOT_RADIUS` / `LABEL_SIZE` expressions (zoom 4 → 9).
function dotRadius(rank: number, zoom: number): number {
  const t = clamp01((zoom - 4) / 5);
  const lo = rank === 1 ? 4.5 : rank === 2 ? 3.4 : 2.8;
  const hi = rank === 1 ? 7 : rank === 2 ? 5.5 : 4.5;
  return lerp(lo, hi, t);
}
function labelFont(rank: number, zoom: number): number {
  const t = clamp01((zoom - 4) / 5);
  const lo = rank === 1 ? 13 : rank === 2 ? 11.5 : 10.5;
  const hi = rank === 1 ? 17 : rank === 2 ? 15 : 13.5;
  return lerp(lo, hi, t);
}

// Fixed centred box for a city label — wider than any single-line name, with `numberOfLines={2}`
// in render so long ones ("Helsingborg", "Helsingfors") wrap to two lines instead of clipping.
// The collision algorithm (placeCityLabels) mirrors the wrap (maxLabelWidth) so dense
// clusters stay arbitrated correctly even when a few names take two lines.
const LABEL_BOX = 140;

// Gap (px) from the user marker's centre to the top of its (always-shown) name label —
// enough to clear the brass glow (radius 13).
const USER_LABEL_GAP = 15;

// Tooltip auto-dismiss after a single tap: long enough to read the prayer time + place,
// short enough that a second tap on another city replaces it without overlap.
const TOOLTIP_MS = 2400;
const TOOLTIP_WIDTH = 168;
const TOOLTIP_GAP = 22; // gap between the dot centre and the tooltip baseline below it

interface CityTooltip {
  name: string;
  /** Stored as lat/lon (not screen px) so the card re-anchors to the dot if the user
      pans during the auto-dismiss window — otherwise the tooltip would float off into
      empty space. Re-projected per render against the current camera. */
  lat: number;
  lon: number;
  prayer: PrayerKey;
  time: string;
}

/** Next prayer from `nowMs` at `coords`, with today's settings. Walks today's schedule
    then steps to tomorrow's Fajr if Isha has already passed — same logic as the dock. */
function nextPrayerAt(
  coords: LatLng,
  nowMs: number,
  settings: PrayerSettings,
): { key: PrayerKey; at: number } | null {
  const today = computePrayerTimes(coords, new Date(nowMs), settings);
  for (const key of PRAYER_ORDER) {
    const at = today[key]?.getTime();
    if (Number.isFinite(at) && at > nowMs) return { key, at };
  }
  const tomorrow = computePrayerTimes(coords, new Date(nowMs + 86_400_000), settings);
  const at = tomorrow.fajr?.getTime();
  if (Number.isFinite(at)) return { key: 'fajr', at };
  return null;
}

export function MapMarkersOverlay({
  camera,
  userCoords,
  userLabel,
  labels,
  nextKey,
  settings,
  nowMs,
}: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // Marker rim + label halo flip warm/dark by basemap so dots + text always read.
  const rim = scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff';
  const halo = scheme === 'dark' ? 'rgba(18,22,36,0.92)' : 'rgba(250,247,240,0.92)';

  const user = project(userCoords.longitude, userCoords.latitude, camera);
  const userName = userLabel.trim();
  const userFont = labelFont(1, camera.zoom);

  // Tooltip state for the city-tap microinteraction. Auto-dismisses after TOOLTIP_MS so
  // the layer doesn't keep an old card pinned to a now-stale spot once the user pans.
  const [tooltip, setTooltip] = useState<CityTooltip | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    };
  }, []);

  // The user's own place wins over a curated city dot of the same name — without this
  // a GPS fix on Malmö renders the brass "you are here" Malmö AND the curated Malmö dot,
  // so the label appears twice on top of itself. Match case-insensitive on trimmed name.
  const userNameLower = userName.toLowerCase();
  const cityPool = useMemo<readonly CityPoint[]>(
    () => (userNameLower ? CITY_POINTS.filter((p) => p.name.toLowerCase() !== userNameLower) : CITY_POINTS),
    [userNameLower],
  );

  // Pill placements computed once — reused for both the collision reservation and the
  // render below. Each pill sits ON its line (at the line's anchor point): no leader to
  // trace back, and because each prayer's anchor is on its own distinct line, the pills
  // separate naturally instead of two perpendicular offsets stacking on the same spot
  // (which made Isha land on top of Maghrib where the lines converge up north).
  const pills = labels.map((l) => {
    const p = project(l.lngLat[0], l.lngLat[1], camera);
    return { l, x: p.x, y: p.y };
  });

  // Boxes the city labels must route around: the user marker (its dot + its forced name
  // slot — the user's city ALWAYS shows, top priority) and every prayer pill.
  const reserved: Box[] = [];
  if (userName) {
    const userHalf = Math.max(16, (userName.length * userFont * 0.55) / 2);
    reserved.push({
      left: user.x - userHalf,
      top: user.y - 16,
      right: user.x + userHalf,
      bottom: user.y + USER_LABEL_GAP + userFont * 1.2,
    });
  } else {
    reserved.push({ left: user.x - 16, top: user.y - 16, right: user.x + 16, bottom: user.y + 16 });
  }
  for (const { l, x, y } of pills) {
    const pw = PRAYER_LABELS[l.prayer].length * 11 * 0.55 + 30;
    reserved.push({ left: x - pw / 2, top: y - 13, right: x + pw / 2, bottom: y + 13 });
  }

  // Project city dots; place labels rank-sorted, padded so dense clusters thin out, and
  // routed around the reserved boxes. A city's DOT only renders if its LABEL survived, so
  // there are no orphan dots (a dot with no name reads as a mystery point).
  const dots = cityPool.map((city) => {
    const p = project(city.lon, city.lat, camera);
    return { ...city, x: p.x, y: p.y, r: dotRadius(city.rank, camera.zoom) };
  });
  const placedLabels = placeCityLabels(
    dots.map((d) => ({ name: d.name, rank: d.rank, x: d.x, y: d.y })),
    {
      width: camera.width,
      height: camera.height,
      fontSizeForRank: (rank) => labelFont(rank, camera.zoom),
      reserved,
      padding: 6,
      // Pair with `numberOfLines={2}` below so the collision footprint of a long name
      // matches what actually renders (two lines, not a one-line bar clipped to "Helsingfo…").
      maxLabelWidth: LABEL_BOX,
    },
  );
  const placedNames = new Set(placedLabels.map((l) => l.name));

  const handleCityTap = (city: CityPoint) => {
    hapticLight();
    const next = nextPrayerAt({ latitude: city.lat, longitude: city.lon }, nowMs, settings);
    if (!next) return;
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip({
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      prayer: next.key,
      time: formatTime(new Date(next.at)),
    });
    tooltipTimer.current = setTimeout(() => setTooltip(null), TOOLTIP_MS);
  };

  // Project the active tooltip's anchor each render so it tracks the dot if the user
  // pans during the auto-dismiss window.
  const tooltipPoint = tooltip ? project(tooltip.lon, tooltip.lat, camera) : null;

  return (
    // box-none lets gestures fall through to the map across empty space, while the
    // city-dot Pressables below intercept their own taps.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* City dots — Swedish cities take the accent, foreign capitals stay muted. Coupled
          to the label: a dot draws only if its name survived collision, so there are no
          orphan dots (and the city the user is on yields to the brass marker + its label).
          Each dot is a Pressable with hitSlop so it's reliably tappable even when small —
          tap fires the tooltip + a haptic tick (see handleCityTap). */}
      {dots.map((d) => {
        if (!placedNames.has(d.name)) return null;
        return (
          <Pressable
            key={`dot-${d.name}`}
            onPress={() => handleCityTap(d)}
            accessibilityRole="button"
            accessibilityLabel={`${d.name} — visa nästa bönetid`}
            hitSlop={12}
            style={{
              position: 'absolute',
              left: d.x - d.r,
              top: d.y - d.r,
              width: d.r * 2,
              height: d.r * 2,
              borderRadius: d.r,
              backgroundColor: d.foreign ? c.inkMuted : c.accent,
              opacity: d.foreign ? 0.8 : 1,
              borderColor: rim,
              borderWidth: 1.5,
            }}
          />
        );
      })}

      {/* City labels — only the collision survivors, halo'd to read over any terrain.
          numberOfLines={2} lets long names ("Helsingborg", "Helsingfors") wrap rather than
          clip; the collision algorithm above accounted for the two-line height via
          maxLabelWidth, so wrapped labels still won't pile onto cities below. */}
      {placedLabels.map((l) => {
        const foreign = CITY_POINTS.find((p) => p.name === l.name)?.foreign;
        return (
          <Text
            key={`label-${l.name}`}
            numberOfLines={2}
            pointerEvents="none"
            style={{
              position: 'absolute',
              // Centre on the dot via a generous fixed-width box so names like "Umeå"
              // aren't clipped to "Um…" (the old tight width truncated them) — and no
              // percentage transform, which the RN test renderer mishandles. The
              // collision estimate keeps using the tighter per-name width.
              left: l.x - LABEL_BOX / 2,
              top: l.top,
              width: LABEL_BOX,
              textAlign: 'center',
              fontSize: l.fontSize,
              color: foreign ? c.inkMuted : c.ink,
              textShadowColor: halo,
              textShadowRadius: 2,
              textShadowOffset: { width: 0, height: 0 },
            }}
          >
            {l.name}
          </Text>
        );
      })}

      {/* "You are here" — brass glow + dot, a touch larger than the biggest city dot. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: user.x - 13,
          top: user.y - 13,
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: c.highlight,
          opacity: 0.16,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: user.x - 6,
          top: user.y - 6,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: c.highlight,
          borderColor: rim,
          borderWidth: 2,
        }}
      />
      {/* The user's place name — ALWAYS shown (its box was reserved so no city label can
          cover it), lightly emphasised so "where you are" is unmistakable. */}
      {userName ? (
        <Text
          numberOfLines={2}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: user.x - LABEL_BOX / 2,
            top: user.y + USER_LABEL_GAP,
            width: LABEL_BOX,
            textAlign: 'center',
            fontSize: userFont,
            fontWeight: '600',
            color: c.ink,
            textShadowColor: halo,
            textShadowRadius: 2.5,
            textShadowOffset: { width: 0, height: 0 },
          }}
        >
          {userName}
        </Text>
      ) : null}

      {/* Prayer pills — each sits ON its line (centred on the line's anchor point), so the
          line reads straight through it: no leader to trace, and each prayer's pill rides
          its own distinct line, so Maghrib and Isha separate instead of stacking where the
          lines converge. No time (the line is just "where it is this prayer right now", so a
          clock time read as an adhan time); the hue dot + border identify the line. */}
      {pills.map(({ l, x, y }) => {
        const isNext = l.prayer === nextKey;
        const hue = prayerColorFor(l.prayer, scheme);
        return (
          <View
            key={`pill-${l.prayer}`}
            pointerEvents="none"
            style={[
              styles.pill,
              {
                left: x,
                top: y,
                backgroundColor: c.pillSurface,
                // Border carries the prayer hue (same colour as the line it sits on), so the
                // pill reads as part of its line; the label text stays ink-legible. "Next"
                // is distinguished by a thicker ring, not a different colour.
                borderColor: hue,
              },
              isNext && styles.pillNext,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: hue }]} />
            <Text style={[styles.pillLabel, { color: c.ink }]}>{PRAYER_LABELS[l.prayer]}</Text>
          </View>
        );
      })}

      {/* Tap tooltip — a small annotation that floats just above the tapped dot, naming
          the city and that city's next prayer. Re-projected each render so it tracks the
          dot if the user pans during the auto-dismiss window (TOOLTIP_MS). */}
      {tooltip && tooltipPoint ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              left: tooltipPoint.x - TOOLTIP_WIDTH / 2,
              top: tooltipPoint.y - TOOLTIP_GAP - 38,
              width: TOOLTIP_WIDTH,
              backgroundColor: c.pillSurface,
              borderColor: c.pillNextBorder,
            },
          ]}
        >
          <Text style={[styles.tooltipName, { color: c.ink }]} numberOfLines={1}>
            {tooltip.name}
          </Text>
          <Text style={[styles.tooltipTime, { color: c.inkMuted }]} numberOfLines={1}>
            {PRAYER_LABELS[tooltip.prayer]} {tooltip.time}
          </Text>
          <View
            style={[
              styles.tooltipBeak,
              { borderTopColor: c.pillSurface },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A quiet map annotation, not a floating UI chip: compact, medium-weight, with only
  // a whisper of shadow. The prayer field is the hero — the pill just names a line.
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
    gap: 4,
    // Centre the pill on its computed point (RN supports % translate on 0.85/Fabric).
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    // Warm shadow from the design tokens — was a stale cool `#0b1220` predating the
    // warm-shadow switch, the one cold tint left over the warm palette.
    shadowColor: palette.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pillNext: { borderWidth: 1.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillLabel: { fontSize: 11, fontWeight: '500' },

  // Tooltip — a small editorial card. Border carries the brass "next" hue so it reads
  // as a sibling of the next-prayer pill rather than a generic alert.
  tooltip: {
    position: 'absolute',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: palette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tooltipName: { fontSize: 13, fontWeight: '700' },
  tooltipTime: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  // A tiny pointer at the bottom of the card aimed at the dot.
  tooltipBeak: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
