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
  runOnJS,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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

interface Props {
  /** Stockholm day window for the displayed instant — turns nowFraction into a real time. */
  dayStart: number;
  dayLength: number;
  /** Displayed instant as a fraction of the Stockholm day (drives the wash; UI-thread). */
  nowFraction: SharedValue<number>;
  /** Map camera (centre/zoom/viewport), updated from MapLibre region events. */
  camera: SharedValue<Camera>;
  /** The active prayer contours at this instant (0–7), from buildLines. */
  lines: PrayerLineData[];
  /** The user's next prayer — its line is drawn brighter/thicker. Null if tomorrow's. */
  nextKey: PrayerKey | null;
  /** The polar daylight boundary for this date (null off-season) — a static dashed
   *  reference line marking where sunrise/fajr/maghrib/ishaʾ cease to exist. */
  polarBoundary: PolarBoundary | null;
}

export function SolarSkiaOverlay({
  dayStart,
  dayLength,
  nowFraction,
  camera,
  lines,
  nextKey,
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
        if (finished) runOnJS(setShownBoundary)(null);
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
            isNext={prayer === nextKey}
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
          isNext={prayer === nextKey}
          color={prayerColorFor(prayer, scheme)}
        />
      ))}
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

/** Edge-fade stops for the boundary dash: solid through the middle 70 % of the screen. */
const BOUNDARY_FADE_POSITIONS = [0, 0.15, 0.85, 1];

function PrayerLine({
  polylines,
  camera,
  isNext,
  color,
}: {
  polylines: [number, number][][];
  camera: SharedValue<Camera>;
  isNext: boolean;
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

  // Per-frame (pan/zoom/scrub): Mercator → screen px is just scale + translate, so the
  // path rebuild is two multiply-adds per point — no trig/log, no per-point objects.
  const path = useDerivedValue(() => {
    const cam = camera.value;
    const ws = worldSize(cam.zoom);
    const ox = cam.width / 2 - mercX(cam.lon) * ws;
    const oy = cam.height / 2 - mercY(cam.lat) * ws;
    const b = Skia.PathBuilder.Make();
    for (const arr of merc) {
      for (let i = 0; i < arr.length; i += 2) {
        const x = arr[i] * ws + ox;
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
        reveal.value = 0;
        reveal.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
      }
    } else if (wasRendered.current) {
      fade.value = withTiming(0, { duration: 300 }, (finished) => {
        'worklet';
        if (finished) runOnJS(setRendered)(false);
      });
    }
    wasRendered.current = active || rendered;
  }, [active, rendered, fade, reveal]);

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
        opacity={isNext ? 0.6 : 0.4}
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
    </Group>
  );
}
