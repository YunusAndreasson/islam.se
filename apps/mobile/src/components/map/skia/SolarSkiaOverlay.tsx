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
import { StyleSheet } from 'react-native';
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { type PrayerKey } from '../../../lib/prayer-times';
import { type Camera, mercX, mercY, project, worldSize } from '../../../lib/map/projection';
import { prayerColorFor, washStopsFor } from '../../../lib/solar/palette';
import { type PolarBoundary, solarParams } from '../../../lib/solar/sun';
import { useActiveScheme } from '../../../theme/useColors';
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
  /** Map camera (centre/zoom/viewport), updated from MapLibre region events. */
  camera: SharedValue<Camera>;
  /** The active prayer contours at this instant (0–7), from buildLines. */
  lines: PrayerLineData[];
  /** True while the daybreak intro replays the day. It lifts the drift clamp (the sweep
   *  moves the lines far faster than a live tick) and makes each line appear WHOLE instead
   *  of playing the slow comet reveal it couldn't finish before the line sweeps past. */
  introActive: SharedValue<boolean>;
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
}

export function SolarSkiaOverlay({
  dayStart,
  dayLength,
  nowFraction,
  geometryNow,
  camera,
  lines,
  introActive,
  nextKey,
  imminentKey,
  userPoint,
  arrival,
  polarBoundary,
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

  // Wash uniforms, recomputed on the UI thread whenever the camera or instant changes — so
  // the wash follows pans/zooms and scrubs without a React render. u_utcMin is the displayed
  // instant as UTC minutes-of-day; the shader turns each pixel's lon into local solar time.
  const washUniforms = useDerivedValue(() => {
    const c = camera.value;
    const nowMs = dayStart + nowFraction.value * dayLength;
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
  // so the lines move continuously — a glide, not a step. The drift is clamped to a
  // little over one tick so the single render→effect frame after a big scrub (geometry
  // already new, nowFraction still old) can never fling the lines across the map.
  const driftMerc = useDerivedValue(() => {
    const nowMs = dayStart + nowFraction.value * dayLength;
    const dt = nowMs - geometryNow;
    if (dt <= 0) return 0;
    // The clamp guards live mode (a big scrub must never fling the lines across the map).
    // The intro replay legitimately advances the instant far past one tick between rebuilds,
    // so there the drift runs UNCLAMPED — that gap IS the fast sweep carrying the lines.
    const capped = introActive.value ? dt : dt > MAX_DRIFT_MS ? MAX_DRIFT_MS : dt;
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
      boundaryFade.value = withTiming(1, { duration: 400 });
    } else {
      boundaryFade.value = withTiming(0, { duration: 400 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setShownBoundary, null);
      });
    }
  }, [polarBoundary, boundaryFade]);

  // The boundary is a constant latitude (independent of longitude), so in a north-up
  // Mercator it's a perfectly horizontal screen line: one y, full viewport width.
  // Re-projected on the UI thread so it stays glued to the map through pans/zooms.
  const shownBoundaryLat = shownBoundary?.lat ?? null;
  const polarBoundaryPath = useDerivedValue(() => {
    const cam = camera.value;
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
  // polar night, echoing each phenomenon's light. The stroke is painted by a horizontal
  // gradient whose ends are the SAME hue at alpha 0 (not 'transparent' = black@0, which
  // would interpolate a dark fringe), so the dashes breathe out at the screen edges
  // instead of being cut by them.
  const boundaryRgb =
    shownBoundary?.kind === 'polar-night'
      ? scheme === 'dark'
        ? '150, 196, 255'
        : '56, 92, 150'
      : scheme === 'dark'
        ? '255, 224, 168'
        : '150, 108, 34';
  const boundaryAlpha = scheme === 'dark' ? 0.34 : 0.42;
  const boundaryColors = useMemo(
    () => [
      `rgba(${boundaryRgb}, 0)`,
      `rgba(${boundaryRgb}, ${boundaryAlpha})`,
      `rgba(${boundaryRgb}, ${boundaryAlpha})`,
      `rgba(${boundaryRgb}, 0)`,
    ],
    [boundaryRgb, boundaryAlpha],
  );
  // The edge fade spans the live viewport width (the path is horizontal, so only x matters).
  const boundaryGradEnd = useDerivedValue(() => ({ x: camera.value.width, y: 0 }));

  // Tip-dissolve mask geometry: a vertical ramp hanging just south of the boundary.
  // dstOut erases where the mask is opaque — fully north of the line (also wiping any
  // Catmull-Rom overshoot), easing to nothing DISSOLVE_PX below it, so the four polar
  // prayers' lines (halo included) melt into the boundary rather than stopping dead.
  const dissolveLat = shownBoundaryLat ?? 0;
  const dissolveStart = useDerivedValue(() => ({
    x: 0,
    y: project(0, dissolveLat, camera.value).y,
  }));
  const dissolveEnd = useDerivedValue(() => ({
    x: 0,
    y: project(0, dissolveLat, camera.value).y + DISSOLVE_PX,
  }));
  const dissolveActive = shownBoundary != null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {washEffect && (
        <Fill>
          {/* Pure per-pixel sun geometry — no image inputs. */}
          <Shader source={washEffect} uniforms={washUniforms} />
        </Fill>
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
            introActive={introActive}
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
          introActive={introActive}
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

// The prayers whose lines vanish past the polar boundary (no sunrise/sunset up there)
// vs the two that legitimately cross it. Fixed arrays so the PrayerLine slots — and
// their hooks — are stable across renders.
const BOUNDARY_PRAYERS: PrayerKey[] = ['fajr', 'sunrise', 'maghrib', 'isha'];
const CROSSING_PRAYERS: PrayerKey[] = ['dhuhr', 'asr'];

/** How far (px) south of the boundary the prayer-line tips take to dissolve. */
const DISSOLVE_PX = 28;
const DISSOLVE_COLORS = ['black', 'transparent'];

/** Drift ceiling (ms): a little over one live tick, so the one stale frame after a
 *  scrub can't displace the lines, while a normal tick-to-tick glide never clamps. */
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
    progress.value = 0;
    progress.value = withTiming(1, { duration: 2400, easing: Easing.out(Easing.cubic) });
  }, [trigger, progress]);
  const lon = point[0];
  const lat = point[1];
  const cx = useDerivedValue(() => project(lon, lat, camera.value).x);
  const cy = useDerivedValue(() => project(lon, lat, camera.value).y);
  // Outer ring: expands 10 → 66 px, thinning and fading as it goes.
  const ringR = useDerivedValue(() => 10 + progress.value * 56);
  const ringWidth = useDerivedValue(() => 2.5 - progress.value * 1.9);
  const ringOpacity = useDerivedValue(() => (1 - progress.value) * 0.7);
  // Inner glow: a soft breath of the prayer's hue around the dot itself.
  const glowR = useDerivedValue(() => 6 + progress.value * 22);
  const glowOpacity = useDerivedValue(() => (1 - progress.value) * 0.45);
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
  introActive,
  isNext,
  imminent,
  color,
}: {
  polylines: [number, number][][];
  camera: SharedValue<Camera>;
  /** UI-thread solar drift (normalised-Mercator x) — see driftMerc in the parent. */
  drift: SharedValue<number>;
  /** During the daybreak replay a freshly-appearing line skips the slow comet reveal
   *  (it would never finish before the fast sweep carries the line off) and shows whole. */
  introActive: SharedValue<boolean>;
  isNext: boolean;
  /** The next prayer inside the breathing window: the halo inhales/exhales gently. */
  imminent: boolean;
  color: string;
}) {
  const active = polylines.length > 0;

  // Mount/visibility lifecycle: `rendered` keeps the paths mounted through the fade-out
  // so a vanished line dissolves (300 ms) instead of popping off. While inactive the
  // line keeps its LAST geometry (the contour that just vanished). Both use the
  // render-phase derived-state pattern (react.dev "storing information from previous
  // renders") — the guarded setState re-renders just this component, synchronously.
  const [rendered, setRendered] = useState(active);
  if (active && !rendered) setRendered(true);
  const [lastGeom, setLastGeom] = useState(polylines);
  if (active && lastGeom !== polylines) setLastGeom(polylines);
  const drawPolylines = active ? polylines : lastGeom;
  const fade = useSharedValue(active ? 1 : 0);
  const reveal = useSharedValue(active ? 1 : 0);

  // The lon/lat → normalised-Mercator half of the projection is camera-independent, so
  // it runs ONCE per geometry change (here, JS thread) instead of per frame. The flat
  // Float64Array keeps the per-frame worklet loop below allocation-free.
  const merc = useMemo(
    () =>
      drawPolylines.map((line) => {
        const arr = new Float64Array(line.length * 2);
        for (let i = 0; i < line.length; i++) {
          arr[i * 2] = mercX(line[i][0]);
          arr[i * 2 + 1] = mercY(line[i][1]);
        }
        return arr;
      }),
    [drawPolylines],
  );

  // Per-frame (pan/zoom/scrub/drift): Mercator → screen px is just scale + translate, so
  // the path rebuild is two multiply-adds per point — no trig/log, no per-point objects.
  // `drift` adds the live solar glide: a westward x-shift at the sun's exact rate, so
  // the line keeps moving between the 30 s geometry rebuilds.
  const path = useDerivedValue(() => {
    const cam = camera.value;
    const ws = worldSize(cam.zoom);
    const dx = drift.value;
    const ox = cam.width / 2 - mercX(cam.lon) * ws;
    const oy = cam.height / 2 - mercY(cam.lat) * ws;
    const b = Skia.PathBuilder.Make();
    for (const arr of merc) {
      for (let i = 0; i < arr.length; i += 2) {
        const x = (arr[i] + dx) * ws + ox;
        const y = arr[i + 1] * ws + oy;
        if (i === 0) b.moveTo(x, y);
        else b.lineTo(x, y);
      }
    }
    return b.detach();
  });

  // Appear: sweep the line on with a trim 0 → 1, but only from the fully-faded-out
  // state (`wasRendered` false) — a quick scrub back over a still-fading line fades it
  // back up without replaying the sweep. Disappear: ease the whole group's opacity to
  // 0, THEN unmount — unless reactivation cancels the timing first (its callback then
  // lands with finished=false and the unmount is skipped).
  const wasRendered = useRef(rendered);
  useEffect(() => {
    if (active) {
      const fresh = !wasRendered.current;
      fade.value = withTiming(1, { duration: 150 });
      if (fresh) {
        if (introActive.value) {
          // Replay: the line sweeps past far quicker than the comet could draw it on, so
          // show it whole and let the drift do the moving (a half-drawn flash reads as a bug).
          reveal.value = 1;
        } else {
          reveal.value = 0;
          reveal.value = withTiming(1, {
            duration: REVEAL_MS,
            easing: Easing.inOut(Easing.cubic),
          });
        }
      }
    } else if (wasRendered.current) {
      fade.value = withTiming(0, { duration: 300 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setRendered, false);
      });
    }
    wasRendered.current = active || rendered;
  }, [active, rendered, fade, reveal, introActive]);

  // "Prayer is about to begin": while this line is the imminent next prayer, its halo
  // breathes — a slow sine inhale/exhale layered onto the steady glow. Calm by design
  // (opacity only, ~4 s period); leaving the window eases the breath back out instead
  // of cutting it.
  const breath = useSharedValue(0);
  useEffect(() => {
    if (imminent) {
      breath.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      breath.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) });
    }
  }, [imminent, breath]);
  const haloOpacity = useDerivedValue(() => (isNext ? 0.6 : 0.4) + breath.value * 0.22);

  // The comet tip leading the sweep-in: a short, bright trim window riding just behind
  // the reveal's leading edge, melting into the line as the reveal completes. Pure path
  // trim — no per-frame contour measuring.
  const tipStart = useDerivedValue(() => Math.max(0, reveal.value - TIP_SPAN));
  const tipOpacity = useDerivedValue(() => {
    const r = reveal.value;
    return r >= 1 ? 0 : 0.9 * (1 - r * r);
  });

  if (!rendered) return null;

  return (
    // The group fade multiplies the per-path opacities below, so the halo/core balance
    // is preserved all the way through a dissolve.
    <Group opacity={fade}>
      {/* Soft Gaussian halo — a truer glow than MapLibre's line-blur. */}
      <Path
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        color={color}
        strokeWidth={isNext ? 17 : 11}
        opacity={haloOpacity}
        start={0}
        end={reveal}
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
        start={0}
        end={reveal}
      />
      {/* Comet tip — only luminous while the reveal is running (opacity hits 0 at 1). */}
      <Path
        path={path}
        style="stroke"
        strokeCap="round"
        strokeJoin="round"
        color={color}
        strokeWidth={isNext ? 6 : 4.5}
        opacity={tipOpacity}
        start={tipStart}
        end={reveal}
      >
        <BlurMask blur={5} style="normal" />
      </Path>
    </Group>
  );
}
