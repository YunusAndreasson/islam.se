// The Skia field layer: a transparent Canvas above the MapLibre basemap that draws the
// twilight wash (a GPU shader) and the sweeping prayer lines (projected SkPaths with a
// Gaussian-blur glow, a crisp core, and a sweep-in trim). It replaces the MapLibre
// fill/line layers (PrayerFieldOverlay) — same geometry from the same solar engine,
// but rendered on the GPU/UI thread so scrubbing the day stays smooth and the wash is a
// continuous gradient rather than coarse polygons.
//
// Geometry lives in lon/lat; this canvas draws in screen px. We mirror MapLibre's
// projection (src/lib/map/projection.ts) from a camera shared value so the overlay
// stays glued to the basemap as the map pans/zooms — the line paths re-project on the
// UI thread (useDerivedValue), and the wash shader re-projects per pixel from camera
// uniforms. `pointerEvents="none"` lets map gestures fall through.
import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Fill,
  Group,
  LinearGradient,
  Path,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useReducedMotion,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { type PrayerKey } from '@/lib/prayer-times';
import { atZoom, DUST_PRESENCE_STOPS, DUST_RADIUS_STOPS } from '@/lib/map/dust';
import { type Camera, mercX, mercY, project, worldSize } from '@/lib/map/projection';
import { visibleLineRange } from '@/lib/map/visible-line';
import { solarRenderInstant } from '@/lib/map/solar-render-clock';
import { canTransformSolarPath } from '@/lib/map/path-precision';
import type { LonLat } from '@/lib/coordinates';
import { polarBoundaryColorFor, prayerColorFor, washStopsFor } from '@/lib/solar/palette';
import { type PolarBoundary, solarParams } from '@/lib/solar/sun';
import { useActiveScheme } from '@/theme/useColors';
import { buildWashSksl } from './washShader';

/** One prayer's contour for this instant: its colour key + the smoothed lon/lat lines. */
export interface PrayerLineData {
  prayer: PrayerKey;
  polylines: [number, number][][];
}

/** A prayer instant that just arrived at the user's location (live mode): blooms a
 *  soft prayer-hued ring from the brass dot. `id` is the prayer's epoch-ms instant —
 *  stable across re-renders, so a bloom plays exactly once per arrival. */
export interface PrayerArrival {
  prayer: PrayerKey;
  id: number;
}

interface Props {
  /** Stockholm day window for the displayed instant — turns nowFraction into a real time. */
  dayStart: number;
  dayLength: number;
  /** Displayed instant as a fraction of the Stockholm day (drives the wash; UI-thread). */
  nowFraction: SharedValue<number>;
  /** The instant the line GEOMETRY was built for (clock.now). nowFraction glides ahead
   *  of it between live ticks; the gap drives the worklet drift that keeps the lines
   *  moving at the sun's true rate instead of stepping every tick. */
  geometryNow: number;
  /** Direct time preview: full current contours, without live drift or entrance/exit effects. */
  preview?: boolean;
  /** Arm the upcoming line only once the map is painted and foregrounded. */
  entranceEnabled?: boolean;
  /** Map camera (centre/zoom/viewport), updated from MapLibre region events. */
  camera: SharedValue<Camera>;
  /** The active prayer contours at this instant (0–7), from buildLines. */
  lines: PrayerLineData[];
  /** The user's next prayer — its line is drawn brighter/thicker. Null if tomorrow's. */
  nextKey: PrayerKey | null;
  /** The next prayer when it is IMMINENT (within the breathing window) — its halo
   *  breathes gently, the visual "prayer is about to begin" signal. Null otherwise. */
  imminentKey: PrayerKey | null;
  /** The user's location ([lon, lat]) — the arrival bloom radiates from here. */
  userPoint: [number, number];
  /** Latest live-mode prayer arrival, or null before the first one. */
  arrival: PrayerArrival | null;
  /** The polar daylight boundary for this date (null off-season) — a static dashed
   *  reference line marking where sunrise/fajr/maghrib/ishaʾ cease to exist. */
  polarBoundary: PolarBoundary | null;
  /** The mosques ([lon, lat]) whose national-view specks the wash must leave clear — see
   *  WashClearings. Empty when the reader has hidden the mosque layer. */
  mosquePoints?: readonly LonLat[];
}

export function SolarSkiaOverlay({
  dayStart,
  dayLength,
  nowFraction,
  geometryNow,
  preview = false,
  entranceEnabled = true,
  camera,
  lines,
  nextKey,
  imminentKey,
  userPoint,
  arrival,
  polarBoundary,
  mosquePoints = NO_POINTS,
}: Props) {
  // The wash composites onto the themed basemap, so its colour stops swap with
  // the active scheme — Apple Maps-style. `useActiveScheme()` is the user-aware
  // resolver (settings override first, OS otherwise). Body of the SkSL is
  // identical between modes; only the four colour literals (DAY / DUSK / DAWN /
  // NIGHT) change, so RuntimeEffect.Make is memoised on the SKSL string and
  // only rebuilds on a theme flip (cheap — not per frame).
  const scheme = useActiveScheme();
  const washSksl = useMemo(() => buildWashSksl(washStopsFor(scheme)), [scheme]);
  const washEffect = useMemo(() => Skia.RuntimeEffect.Make(washSksl), [washSksl]);

  // Declination + equation of time for the displayed date (midday avoids a DST edge). They
  // feed the per-pixel sun-altitude calc in the shader and only change when the day changes.
  const solar = useMemo(
    () => solarParams(new Date(dayStart + dayLength / 2)),
    [dayStart, dayLength],
  );

  // The real clock keeps gliding at frame rate. Only its drawing sample is bounded:
  // equal primitive samples suppress downstream path/shader updates at overview zoom.
  const renderNow = useDerivedValue(() =>
    solarRenderInstant(dayStart + nowFraction.get() * dayLength, dayStart, camera.get().zoom, preview),
  );

  // Wash uniforms, recomputed on the UI thread whenever the camera or instant changes — so
  // the wash follows pans/zooms and scrubs without a React render. u_utcMin is the displayed
  // instant as UTC minutes-of-day; the shader turns each pixel's lon into local solar time.
  const washUniforms = useDerivedValue(() => {
    const c = camera.get();
    const nowMs = renderNow.get();
    const utcMin = (nowMs / 60_000) % 1440;
    return {
      u_worldSize: 512 * 2 ** c.zoom,
      u_viewport: [c.width, c.height],
      u_center: [mercX(c.lon), mercY(c.lat)],
      u_utcMin: utcMin,
      u_eotMin: solar.eotMin,
      u_declRad: solar.declRad,
    };
  });

  // The sun's hour angle carries every prayer isoline westward at exactly one world
  // revolution per mean solar day, so between geometry rebuilds the lines DRIFT on the
  // UI thread at the physically exact first-order rate: Δ(normalised-Mercator x) per ms
  // = −1 / 86 400 000. nowFraction glides ahead of geometryNow between live ticks (see
  // bonetider's predictive withTiming) and each 30 s rebuild re-anchors the true shape,
  // so live lines move continuously between ticks. Preview uses exact geometry
  // with no extrapolation; its geometry and shared clock update independently.
  const driftMerc = useDerivedValue(() => {
    // Geometry and the shared clock can arrive a frame apart during a reversal.
    // Preview must never extrapolate from that mismatched pair.
    if (preview) return 0;
    const nowMs = renderNow.get();
    const dt = nowMs - geometryNow;
    if (dt <= 0) return 0;
    // The clamp guards live mode (a big scrub must never fling the lines across the map).
    const capped = dt > MAX_DRIFT_MS ? MAX_DRIFT_MS : dt;
    return -capped / 86_400_000;
  });

  // Active prayers this instant, by key, so the fixed BOUNDARY/CROSSING maps can look
  // them up (hooks must be unconditional → we always render all 6 PrayerLine slots).
  const byPrayer = useMemo(() => {
    const m = new Map<PrayerKey, [number, number][][]>();
    for (const l of lines) m.set(l.prayer, l.polylines);
    return m;
  }, [lines]);

  // The boundary the canvas actually draws. It lags `polarBoundary` by one fade on the
  // way OUT: when the date is scrubbed past the season edge and the boundary goes null,
  // we hold the last value while `boundaryFade` eases to 0, then clear — so the line
  // (and the tip-dissolve mask below) dissolve instead of popping off the map.
  const [shownBoundary, setShownBoundary] = useState<PolarBoundary | null>(polarBoundary);
  // Render-phase derived state (the react.dev "storing information from previous
  // renders" pattern): a live boundary is adopted immediately; clearing is deferred
  // to the fade-out callback below.
  if (polarBoundary != null && shownBoundary !== polarBoundary) setShownBoundary(polarBoundary);
  const boundaryFade = useSharedValue(polarBoundary ? 1 : 0);
  useEffect(() => {
    if (polarBoundary != null) {
      boundaryFade.set(withTiming(1, { duration: 400 }));
    } else {
      boundaryFade.set(withTiming(0, { duration: 400 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setShownBoundary, null);
      }));
    }
  }, [polarBoundary, boundaryFade]);

  // The boundary is a constant latitude (independent of longitude), so in a north-up
  // Mercator it's a perfectly horizontal screen line: one y, full viewport width.
  // Re-projected on the UI thread so it stays glued to the map through pans/zooms.
  const shownBoundaryLat = shownBoundary?.lat ?? null;
  const polarBoundaryPath = useDerivedValue(() => {
    const cam = camera.get();
    const b = Skia.PathBuilder.Make();
    if (shownBoundaryLat != null) {
      const y = project(0, shownBoundaryLat, cam).y;
      b.moveTo(0, y);
      b.lineTo(cam.width, y);
    }
    return b.detach();
  });
  // Dashed, no glow — reads as a *boundary*, deliberately unlike the glowing solid prayer
  // sweeps. Kept faint: a quiet reference line. Warm gold for midnight sun, cool blue for
  // polar night, echoing each phenomenon's light — the hues live in lib/solar/palette,
  // beside the caption's, so the two cannot drift apart. The stroke is painted by a
  // horizontal gradient whose ends are the SAME hue at alpha 0 (not 'transparent' =
  // black@0, which would interpolate a dark fringe), so the dashes breathe out at the
  // screen edges instead of being cut by them.
  const boundaryPalette = polarBoundaryColorFor(shownBoundary?.kind ?? 'midnight-sun', scheme);
  const boundaryColors = useMemo(() => {
    const rgb = boundaryPalette.line.join(', ');
    const alpha = boundaryPalette.lineAlpha;
    return [`rgba(${rgb}, 0)`, `rgba(${rgb}, ${alpha})`, `rgba(${rgb}, ${alpha})`, `rgba(${rgb}, 0)`];
  }, [boundaryPalette]);
  // The edge fade spans the live viewport width (the path is horizontal, so only x matters).
  const boundaryGradEnd = useDerivedValue(() => ({ x: camera.get().width, y: 0 }));

  // Tip-dissolve mask geometry: a vertical ramp hanging just south of the boundary.
  // dstOut erases where the mask is opaque — fully north of the line (also wiping any
  // Catmull-Rom overshoot), easing to nothing DISSOLVE_PX below it, so the four polar
  // prayers' lines (halo included) melt into the boundary rather than stopping dead.
  const dissolveLat = shownBoundaryLat ?? 0;
  const dissolveStart = useDerivedValue(() => ({
    x: 0,
    y: project(0, dissolveLat, camera.get()).y,
  }));
  const dissolveEnd = useDerivedValue(() => ({
    x: 0,
    y: project(0, dissolveLat, camera.get()).y + DISSOLVE_PX,
  }));
  const dissolveActive = shownBoundary != null;

  return (
    // `highBitDepth` renders into a surface with more than 8 bits per channel (16-bit
    // float on iOS, 10-bit on Android) — aimed straight at the twilight wash, whose
    // slow ramps are the one thing on this canvas that bands. It does NOT replace the
    // ordered dither in washShader.ts: Skia only guarantees the extra precision
    // survives composition on Android when the view is also `opaque`, which this
    // overlay can never be — it sits transparently over the basemap. So the dither
    // stays as the floor for Android and for any device that falls back to 8-bit,
    // and this prop lifts the ceiling where the surface can carry it. iOS only: since
    // Skia 2.13 Android refuses it on a non-opaque surface outright, falling back to
    // 8-bit and logging a warning on every mount (SkiaBaseView.resolveHighBitDepth).
    <Canvas
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      highBitDepth={Platform.OS === 'ios'}
    >
      {washEffect && (
        <Fill>
          {/* Pure per-pixel sun geometry — no image inputs. */}
          <Shader source={washEffect} uniforms={washUniforms} />
        </Fill>
      )}
      {/* Straight after the wash and before anything else, so these erase the wash alone:
          a prayer line crossing the reader's dot still draws over it. */}
      {washEffect && (
        <WashClearings camera={camera} userPoint={userPoint} mosquePoints={mosquePoints} />
      )}

      {shownBoundaryLat != null && (
        <Path
          path={polarBoundaryPath}
          style="stroke"
          strokeCap="round"
          strokeWidth={1}
          opacity={boundaryFade}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={boundaryGradEnd}
            colors={boundaryColors}
            positions={BOUNDARY_FADE_POSITIONS}
          />
          {/* Round caps grow each dash by strokeWidth/2, so the gap is widened to keep
              the airy rhythm of the old butt-cap [4, 6]. */}
          <DashPathEffect intervals={[3, 7]} />
        </Path>
      )}

      {/* The four prayers whose lines cease to exist past the polar boundary, in an
          offscreen layer ONLY while a boundary is shown: the dstOut gradient fill at the
          end of the layer dissolves their tips into the line. The layer toggles via the
          `layer` prop alone, so these slots never remount and keep their reveal/fade
          state across season edges. The dashed boundary line itself sits OUTSIDE the
          layer and is never erased. */}
      <Group layer={dissolveActive}>
        {BOUNDARY_PRAYERS.map((prayer) => (
          <PrayerLine
            key={prayer}
            polylines={byPrayer.get(prayer) ?? EMPTY}
            camera={camera}
            drift={driftMerc}
            preview={preview}
            entranceEnabled={entranceEnabled}
            isNext={prayer === nextKey}
            imminent={prayer === imminentKey}
            color={prayerColorFor(prayer, scheme)}
          />
        ))}
        {dissolveActive && (
          <Fill blendMode="dstOut" opacity={boundaryFade}>
            {/* black→transparent: same rgb either side, so only alpha interpolates. */}
            <LinearGradient
              start={dissolveStart}
              end={dissolveEnd}
              colors={DISSOLVE_COLORS}
            />
          </Fill>
        )}
      </Group>

      {/* Dhuhr and ʿAsr exist at every latitude (the sun always transits), so they cross
          the boundary undimmed — outside the dissolve layer. */}
      {CROSSING_PRAYERS.map((prayer) => (
        <PrayerLine
          key={prayer}
          polylines={byPrayer.get(prayer) ?? EMPTY}
          camera={camera}
          drift={driftMerc}
          preview={preview}
          entranceEnabled={entranceEnabled}
          isNext={prayer === nextKey}
          imminent={prayer === imminentKey}
          color={prayerColorFor(prayer, scheme)}
        />
      ))}

      {/* The arrival bloom — the sweep's payoff. The moment a prayer's line reaches the
          user's city (its time arrives, live mode), a soft prayer-hued ring radiates
          once from the brass dot. Mounted from the first arrival on; each new arrival
          id replays it. */}
      {arrival && (
        <ArrivalBloom
          camera={camera}
          point={userPoint}
          color={prayerColorFor(arrival.prayer, scheme)}
          trigger={arrival.id}
        />
      )}
    </Canvas>
  );
}

const EMPTY: [number, number][][] = [];
const NO_POINTS: readonly LonLat[] = [];

/** The reader's dot: its glow is 13 px (LocationLayer), cleared exactly, feathered — so the
 *  dot and its halo keep their own colour at every hour without a hard disc of daylight. */
const DOT_CLEAR_R = 13;
const DOT_CLEAR_BLUR = 3;
/** Each mosque speck: its own radius plus a hair, feathered — just enough to uncover the
 *  speck's soft edge. Measured on the emulator at ʿIshāʾ: a 1.5 dp pad uncovered a disc three
 *  times the speck's size, which read as a pale halo on land and a teal disc of raw sea colour
 *  at every coastal mosque. The cost of keeping it tight is a sliver of tint at the speck's
 *  edge while a pan outruns the camera mirror, which nobody sees on a 1 dp speck in motion. */
const SPECK_CLEAR_PAD = 0.5;
const SPECK_CLEAR_BLUR = 0.5;
/** A camera step bigger than this (px of pan, or zoom levels) counts as the map MOVING. The
 *  lean-in's own steps (lib/map/approach) stay far below both, so it never closes the holes. */
const MOTION_PX = 1.5;
const MOTION_ZOOM = 0.004;
/** How long the camera must rest before the holes reopen, and how they come back. */
const REOPEN_DELAY_MS = 150;
const REOPEN_MS = 220;

/**
 * Holes in the wash where the reader's dot and the mosques are.
 *
 * Both are NATIVE MapLibre layers, so they sit under this canvas, and the wash tinted them
 * with everything else. At noon that is invisible. At Maghrib and ʿIshāʾ the wash is a
 * terracotta or a night blue at alpha 0.5–0.6, and the reader reported they could "hardly
 * see" their own position or a mosque. Nothing native can draw above a sibling view, so
 * instead the wash is erased (dstOut) exactly where they sit: they keep their own colour
 * at every hour, and stay native — glued to the basemap, with the mosques' zoom gating
 * intact. Only the hole follows the camera mirror, and a frame of lag there costs a sliver
 * of tint at an edge, not a misplaced marker.
 *
 * The mosque holes track the SPECK tier only, through the same lib/map/dust curves the
 * specks are drawn with, and vanish with it by ~z7.8. The glyph tier is left alone: its
 * collision hides an unknown subset of mosques, and a hole where a glyph was culled would be
 * an empty patch of daylight.
 *
 * THE LAG. The holes follow the camera MIRROR, which MapLibre feeds through JS a frame or
 * more behind its own render. At rest the two coincide; in a fast move they do not — during
 * the Återställ animation the dot's hole trailed the dot by ~30 px as a detached pale blob
 * (seen on the emulator). So the holes close while the camera moves and reopen once it
 * rests: in motion the dot and the specks are briefly tinted, which is how they always
 * looked, and nothing is ever uncovered where they are not.
 */
function WashClearings({
  camera,
  userPoint,
  mosquePoints,
}: {
  camera: SharedValue<Camera>;
  userPoint: [number, number];
  mosquePoints: readonly LonLat[];
}) {
  const open = useSharedValue(1);
  useAnimatedReaction(
    () => camera.get(),
    (cam, prev) => {
      if (!prev) return;
      const ws = worldSize(cam.zoom);
      const panX = (mercX(cam.lon) - mercX(prev.lon)) * ws;
      const panY = (mercY(cam.lat) - mercY(prev.lat)) * ws;
      if (Math.hypot(panX, panY) <= MOTION_PX && Math.abs(cam.zoom - prev.zoom) <= MOTION_ZOOM) return;
      // Restarted by every moving frame, so it only gets to reopen once they stop coming.
      //
      // Runs under Reduce Motion too, on purpose. This is not a decoration: it is what keeps
      // the hole from trailing the dot as a detached blob while the camera outruns the
      // mirror. Left on the system setting, `withTiming` would return its target at once
      // and `withDelay` would skip the wait (Reanimated's documented reduce-motion
      // behaviour), so the holes would never close during a move — and the reader who
      // asked for less motion would get the one artefact this exists to prevent.
      open.set(withSequence(
        withTiming(0, { duration: 60, reduceMotion: ReduceMotion.Never }),
        withDelay(
          REOPEN_DELAY_MS,
          withTiming(1, { duration: REOPEN_MS, reduceMotion: ReduceMotion.Never }),
          ReduceMotion.Never,
        ),
      ));
    },
  );

  const lon = userPoint[0];
  const lat = userPoint[1];
  const dotX = useDerivedValue(() => project(lon, lat, camera.get()).x);
  const dotY = useDerivedValue(() => project(lon, lat, camera.get()).y);

  // Mercator once per point set, so each frame's work is plain arithmetic.
  const mosqueMerc = useMemo(
    () => mosquePoints.map(([mLon, mLat]) => [mercX(mLon), mercY(mLat)] as const),
    [mosquePoints],
  );
  const speckPresence = useDerivedValue(
    () => atZoom(DUST_PRESENCE_STOPS, camera.get().zoom) * open.get(),
  );
  const speckHoles = useDerivedValue(() => {
    const cam = camera.get();
    const b = Skia.PathBuilder.Make();
    if (atZoom(DUST_PRESENCE_STOPS, cam.zoom) <= 0) return b.detach();
    const r = atZoom(DUST_RADIUS_STOPS, cam.zoom) + SPECK_CLEAR_PAD;
    const ws = worldSize(cam.zoom);
    const cx = mercX(cam.lon);
    const cy = mercY(cam.lat);
    for (let i = 0; i < mosqueMerc.length; i++) {
      const p = mosqueMerc[i]!;
      const x = (p[0] - cx) * ws + cam.width / 2;
      const y = (p[1] - cy) * ws + cam.height / 2;
      if (x < -r || y < -r || x > cam.width + r || y > cam.height + r) continue;
      b.addCircle(x, y, r);
    }
    return b.detach();
  });

  return (
    <>
      <Circle cx={dotX} cy={dotY} r={DOT_CLEAR_R} blendMode="dstOut" opacity={open}>
        <BlurMask blur={DOT_CLEAR_BLUR} style="normal" />
      </Circle>
      {mosqueMerc.length > 0 && (
        <Path path={speckHoles} blendMode="dstOut" opacity={speckPresence}>
          <BlurMask blur={SPECK_CLEAR_BLUR} style="normal" />
        </Path>
      )}
    </>
  );
}

// The prayers whose lines vanish past the polar boundary (no sunrise/sunset up there)
// vs the two that legitimately cross it. Fixed arrays so the PrayerLine slots — and
// their hooks — are stable across renders.
const BOUNDARY_PRAYERS: PrayerKey[] = ['fajr', 'sunrise', 'maghrib', 'isha'];
const CROSSING_PRAYERS: PrayerKey[] = ['dhuhr', 'asr'];

/** How far (px) south of the boundary the prayer-line tips take to dissolve. */
const DISSOLVE_PX = 28;
const DISSOLVE_COLORS = ['black', 'transparent'];

/** Drift ceiling (ms): slightly longer than one live tick; preview disables drift. */
const MAX_DRIFT_MS = 45_000;

/** Sweep-in reveal length. Long enough to read as a deliberate pour down the country
 *  (and to show the comet tip), short enough never to feel like a loading animation. */
const REVEAL_MS = 950;

/** The comet tip's trim window — the fraction of the path lit behind the leading edge. */
const TIP_SPAN = 0.085;

/** Edge-fade stops for the boundary dash: solid through the middle 70 % of the screen. */
const BOUNDARY_FADE_POSITIONS = [0, 0.15, 0.85, 1];

/** The arrival bloom: when a prayer's sweeping line reaches the user's city (its time
 *  arrives), one soft prayer-hued ring + inner glow radiate from the brass dot and
 *  dissolve — the quiet climax of the sweep. Screen-space radii (not map-space) so the
 *  gesture reads identically at any zoom; the centre re-projects per frame so it stays
 *  glued to the dot through pans. Replays whenever `trigger` (the prayer's epoch ms)
 *  changes; at rest every opacity is 0, so the mounted slot costs nothing visible. */
function ArrivalBloom({
  camera,
  point,
  color,
  trigger,
}: {
  camera: SharedValue<Camera>;
  point: [number, number];
  color: string;
  trigger: number;
}) {
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.set(0);
    progress.set(withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) }));
  }, [trigger, progress]);
  const lon = point[0];
  const lat = point[1];
  const cx = useDerivedValue(() => project(lon, lat, camera.get()).x);
  const cy = useDerivedValue(() => project(lon, lat, camera.get()).y);
  // Outer ring: expands 10 → 66 px, thinning and fading as it goes.
  const ringR = useDerivedValue(() => 10 + progress.get() * 56);
  const ringWidth = useDerivedValue(() => 2.5 - progress.get() * 1.9);
  const ringOpacity = useDerivedValue(() => (1 - progress.get()) * 0.7);
  // Inner glow: a soft breath of the prayer's hue around the dot itself.
  const glowR = useDerivedValue(() => 6 + progress.get() * 22);
  const glowOpacity = useDerivedValue(() => (1 - progress.get()) * 0.45);
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={glowR} color={color} opacity={glowOpacity}>
        <BlurMask blur={12} style="normal" />
      </Circle>
      <Circle
        cx={cx}
        cy={cy}
        r={ringR}
        style="stroke"
        strokeWidth={ringWidth}
        color={color}
        opacity={ringOpacity}
      >
        <BlurMask blur={3} style="normal" />
      </Circle>
    </Group>
  );
}

function PrayerLine({
  polylines,
  camera,
  drift,
  preview,
  entranceEnabled,
  isNext,
  imminent,
  color,
}: {
  polylines: LonLat[][];
  camera: SharedValue<Camera>;
  /** UI-thread solar drift (normalised-Mercator x) — see driftMerc in the parent. */
  drift: SharedValue<number>;
  preview: boolean;
  entranceEnabled: boolean;
  isNext: boolean;
  /** The next prayer inside the breathing window: the halo inhales/exhales gently. */
  imminent: boolean;
  color: string;
}) {
  const active = polylines.length > 0;

  // Mount/visibility lifecycle: `rendered` keeps the paths mounted through the fade-out
  // so a vanished line dissolves (300 ms) instead of popping off. While inactive the
  // line keeps its LAST geometry (the contour that just vanished). `rendered` is real
  // transition state; the previous geometry is only a committed-value cache, so keeping
  // it in a ref avoids a second render for every active line on each live field update.
  const [rendered, setRendered] = useState(active);
  if (preview ? active !== rendered : active && !rendered) setRendered(active);
  const retainedPolylines = useLastActiveGeometry(active, polylines);
  const visible = preview ? active : rendered;
  const drawPolylines = visible ? (preview ? polylines : retainedPolylines) : EMPTY;
  const fade = useSharedValue(active ? 1 : 0);
  const reveal = useSharedValue(1);
  const entered = useSharedValue(false);
  const entryStart = useSharedValue(0);
  const entryEnd = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animateEntrance = isNext && !preview && !reduceMotion;

  // The lon/lat → normalised-Mercator half of the projection is camera-independent, so
  // it runs ONCE per geometry change (here, JS thread) instead of per frame. The flat
  // Float64Array keeps the per-frame worklet loop below allocation-free.
  const merc = useMemo(
    () =>
      drawPolylines.map((line) => {
        const arr = new Float64Array(line.length * 2);
        // forEach visits each point without unchecked indexed reads or holes.
        line.forEach((p, i) => {
          arr[i * 2] = mercX(p[0]);
          arr[i * 2 + 1] = mercY(p[1]);
        });
        return arr;
      }),
    [drawPolylines],
  );

  // Build the immutable native geometry once. Relative coordinates preserve much
  // more float32 precision than a path positioned near world-Mercator x = 0.5.
  const nativePath = useMemo(() => {
    const originX = merc[0]?.[0] ?? 0;
    const originY = merc[0]?.[1] ?? 0;
    let radius = 0;
    const builder = Skia.PathBuilder.Make();
    for (const line of merc) {
      for (let i = 0; i < line.length; i += 2) {
        const mx = line[i];
        const my = line[i + 1];
        if (mx === undefined || my === undefined) break;
        const x = mx - originX;
        const y = my - originY;
        radius = Math.max(radius, Math.hypot(x, y));
        if (i === 0) builder.moveTo(x, y);
        else builder.lineTo(x, y);
      }
    }
    return { path: builder.detach(), originX, originY, radius };
  }, [merc]);

  // Pan/zoom/scrub/drift applies a native scale + translate where float32 is safe;
  // the close-zoom fallback projects the original doubles before handing them to Skia.
  // `drift` adds the live solar glide: a westward x-shift at the sun's exact rate, so
  // the line keeps moving between the 30 s geometry rebuilds.
  const path = useDerivedValue(() => {
    if (merc.length === 0) return nativePath.path;
    const cam = camera.get();
    const ws = worldSize(cam.zoom);
    const dx = drift.get();
    const ox = cam.width / 2 - mercX(cam.lon) * ws;
    const oy = cam.height / 2 - mercY(cam.lat) * ws;
    const b = Skia.PathBuilder.Make();
    const tx = cam.width / 2 + (nativePath.originX + dx - mercX(cam.lon)) * ws;
    const ty = cam.height / 2 + (nativePath.originY - mercY(cam.lat)) * ws;
    if (canTransformSolarPath(cam.zoom, ws, nativePath.radius, tx, ty)) {
      // Transform the path in native Skia instead of crossing JSI for each vertex.
      // It is still in screen space: stroke widths, blur and reveal trims retain
      // their existing semantics. High zoom uses the original Float64 loop below.
      b.addPath(nativePath.path, Skia.Matrix().translate(tx, ty).scale(ws, ws));
      return b.detach();
    }
    for (const arr of merc) {
      for (let i = 0; i < arr.length; i += 2) {
        const mx = arr[i];
        const my = arr[i + 1];
        // Pairs by construction; breaking on a half-pair keeps a NaN out of the path.
        // One NaN vertex costs the whole path, which here is every prayer line at once
        // — the overlay would go blank rather than lose a line.
        if (mx === undefined || my === undefined) break;
        const x = (mx + dx) * ws + ox;
        const y = my * ws + oy;
        if (i === 0) b.moveTo(x, y);
        else b.lineTo(x, y);
      }
    }
    return b.detach();
  });

  // Only inspect visibility while waiting for the current prayer to enter. Geometry
  // projection/length measurement is not driven by the reveal progress itself.
  const visibleRange = useDerivedValue(() => {
    if (!animateEntrance || entered.get()) return null;
    const cam = camera.get();
    const ws = worldSize(cam.zoom);
    const ox = cam.width / 2 - mercX(cam.lon) * ws + drift.get() * ws;
    const oy = cam.height / 2 - mercY(cam.lat) * ws;
    const projected = merc.map((line) => {
      const points = new Array<number>(line.length);
      for (let i = 0; i < line.length; i += 2) {
        points[i] = (line[i] ?? 0) * ws + ox;
        points[i + 1] = (line[i + 1] ?? 0) * ws + oy;
      }
      return points;
    });
    return visibleLineRange(projected, cam.width, cam.height);
  });

  useAnimatedReaction(
    () => ({ ready: entranceEnabled, animate: animateEntrance, preview, range: visibleRange.get() }),
    ({ ready, animate, preview: scrubbing, range }) => {
      if (!ready) {
        entered.set(false);
        reveal.set(1);
      } else if (scrubbing || !animate) {
        // Direct manipulation cancels a pending or running entrance immediately.
        reveal.set(1);
        if (scrubbing) entered.set(true);
      } else if (!entered.get() && range) {
        entryStart.set(range.start);
        entryEnd.set(range.end);
        entered.set(true);
        reveal.set(0);
        reveal.set(withTiming(1, {
          duration: REVEAL_MS,
          easing: Easing.inOut(Easing.cubic),
        }));
      }
    },
  );
  const trimStart = useDerivedValue(() =>
    animateEntrance && reveal.get() < 1 ? entryStart.get() : 0,
  );
  const trimEnd = useDerivedValue(() => {
    if (!animateEntrance) return 1;
    if (!entered.get()) return 0;
    if (reveal.get() >= 1) return 1;
    return entryStart.get() + (entryEnd.get() - entryStart.get()) * reveal.get();
  });

  // A live contour may dissolve when it disappears. Preview never retains old lines.
  const wasRendered = useRef(rendered);
  useEffect(() => {
    if (preview) {
      fade.set(active ? 1 : 0);
    } else if (active) {
      fade.set(1);
    } else if (wasRendered.current) {
      fade.set(withTiming(0, { duration: 300 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setRendered, false);
      }));
    }
    wasRendered.current = active || rendered;
  }, [active, rendered, preview, fade]);

  // "Prayer is about to begin": while this line is the imminent next prayer, its halo
  // breathes — a slow sine inhale/exhale layered onto the steady glow. Calm by design
  // (opacity only, ~4 s period); leaving the window eases the breath back out instead
  // of cutting it.
  const breath = useSharedValue(0);
  useEffect(() => {
    if (imminent) {
      breath.set(withRepeat(
        withSequence(
          withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ));
    } else {
      breath.set(withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) }));
    }
  }, [imminent, breath]);
  const haloOpacity = useDerivedValue(() => (isNext ? 0.6 : 0.4) + breath.get() * 0.22);

  // The comet tip leading the sweep-in: a short, bright trim window riding just behind
  // the reveal's leading edge, melting into the line as the reveal completes. Pure path
  // trim — no per-frame contour measuring.
  const tipStart = useDerivedValue(() =>
    Math.max(trimStart.get(), trimEnd.get() - (entryEnd.get() - entryStart.get()) * TIP_SPAN),
  );
  const tipOpacity = useDerivedValue(() => {
    const r = reveal.get();
    return !animateEntrance || !entered.get() || r >= 1 ? 0 : 0.9 * (1 - r * r);
  });

  if (!visible) return null;

  return (
    // The group fade multiplies the per-path opacities below, so the halo/core balance
    // is preserved all the way through a dissolve.
    <Group opacity={preview ? 1 : fade}>
      {/* Soft Gaussian halo — a truer glow than MapLibre's line-blur. */}
      <Path
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        color={color}
        strokeWidth={isNext ? 17 : 11}
        opacity={haloOpacity}
        start={preview ? 0 : trimStart}
        end={preview ? 1 : trimEnd}
      >
        <BlurMask blur={9} style="normal" />
      </Path>
      {/* Crisp core. */}
      <Path
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        color={color}
        strokeWidth={isNext ? 3.4 : 2}
        opacity={isNext ? 1 : 0.95}
        start={preview ? 0 : trimStart}
        end={preview ? 1 : trimEnd}
      />
      {/* Comet tip — only luminous while the reveal is running (opacity hits 0 at 1). */}
      {animateEntrance && (
        <Path
          path={path}
          style="stroke"
          strokeCap="round"
          strokeJoin="round"
          color={color}
          strokeWidth={isNext ? 6 : 4.5}
          opacity={tipOpacity}
          start={tipStart}
          end={trimEnd}
        >
          <BlurMask blur={5} style="normal" />
        </Path>
      )}
    </Group>
  );
}

/** Retain only the last COMMITTED non-empty geometry for the later fade-out frame.
 *
 * This tiny hook is deliberately outside Compiler analysis: reading a ref during render
 * is normally suspect, but here the inactive render follows an active commit whose effect
 * has already stored the exact geometry being displayed. The cache never drives an active
 * frame and therefore needs no state update of its own. Keeping the exception here lets
 * PrayerLine itself remain Compiler-optimized and removes six redundant state renders per
 * live contour refresh. */
function useLastActiveGeometry(active: boolean, polylines: LonLat[][]): LonLat[][] {
  'use no memo';
  const lastGeom = useRef(polylines);
  useEffect(() => {
    if (active) lastGeom.current = polylines;
  }, [active, polylines]);
  // eslint-disable-next-line react-hooks/refs -- committed snapshot; invariant above
  return active ? polylines : lastGeom.current;
}
