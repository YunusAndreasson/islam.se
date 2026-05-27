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
  AlphaType,
  BlurMask,
  Canvas,
  ColorType,
  Fill,
  FilterMode,
  ImageShader,
  MipmapMode,
  Path,
  Shader,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PRAYER_ORDER, type PrayerKey } from '../../../lib/prayer-times';
import { type Camera, mercX, mercY, project } from '../../../lib/map/projection';
import type { SolarGrid } from '../../../lib/solar/field';
import { PRAYER_COLORS } from '../../../lib/solar/palette';
import { encodeFieldTexture, WASH_SKSL } from './washShader';

/** One prayer's contour for this instant: its colour key + the smoothed lon/lat lines. */
export interface PrayerLineData {
  prayer: PrayerKey;
  polylines: [number, number][][];
}

interface Props {
  grid: SolarGrid;
  /** Stockholm day window the grid's times were encoded against (for the wash texture). */
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
}

export function SolarSkiaOverlay({
  grid,
  dayStart,
  dayLength,
  nowFraction,
  camera,
  lines,
  nextKey,
}: Props) {
  // Compile the wash shader once. Null only if the SkSL fails to compile (guarded).
  const washEffect = useMemo(() => Skia.RuntimeEffect.Make(WASH_SKSL), []);

  // The per-grid-point times texture, rebuilt only when the grid (day/settings) changes.
  const fieldImage = useMemo<SkImage | null>(() => {
    const { data, width, height } = encodeFieldTexture(grid, dayStart, dayLength);
    const skData = Skia.Data.fromBytes(data);
    return Skia.Image.MakeImage(
      { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      skData,
      width * 4,
    );
  }, [grid, dayStart, dayLength]);

  // Grid bounds in degrees + texture size, fed to the shader to map screen → grid uv.
  const gridBounds = useMemo(() => {
    const lonMin = grid.lons[0];
    const latMin = grid.lats[0];
    const lonSpan = grid.lons[grid.lons.length - 1] - lonMin;
    const latSpan = grid.lats[grid.lats.length - 1] - latMin;
    return { lonMin, latMin, lonSpan, latSpan, w: grid.lons.length, h: grid.lats.length };
  }, [grid]);

  // Wash uniforms, recomputed on the UI thread whenever the camera or instant changes —
  // so the wash follows pans/zooms and scrubs without a React render.
  const washUniforms = useDerivedValue(() => {
    const c = camera.value;
    return {
      u_now: nowFraction.value,
      u_worldSize: 512 * 2 ** c.zoom,
      u_viewport: [c.width, c.height],
      u_center: [mercX(c.lon), mercY(c.lat)],
      u_grid: [gridBounds.lonMin, gridBounds.latMin, gridBounds.lonSpan, gridBounds.latSpan],
      u_imgSize: [gridBounds.w, gridBounds.h],
    };
  });

  // Active prayers this instant, by key, so the fixed PRAYER_ORDER map can look them up
  // (hooks must be unconditional → we always render 7 PrayerLine slots).
  const byPrayer = useMemo(() => {
    const m = new Map<PrayerKey, [number, number][][]>();
    for (const l of lines) m.set(l.prayer, l.polylines);
    return m;
  }, [lines]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {washEffect && fieldImage && (
        <Fill>
          <Shader source={washEffect} uniforms={washUniforms}>
            <ImageShader
              image={fieldImage}
              tx="clamp"
              ty="clamp"
              fit="fill"
              rect={{ x: 0, y: 0, width: gridBounds.w, height: gridBounds.h }}
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
            />
          </Shader>
        </Fill>
      )}

      {PRAYER_ORDER.map((prayer) => (
        <PrayerLine
          key={prayer}
          prayer={prayer}
          polylines={byPrayer.get(prayer) ?? EMPTY}
          camera={camera}
          isNext={prayer === nextKey}
        />
      ))}
    </Canvas>
  );
}

const EMPTY: [number, number][][] = [];

function PrayerLine({
  prayer,
  polylines,
  camera,
  isNext,
}: {
  prayer: PrayerKey;
  polylines: [number, number][][];
  camera: SharedValue<Camera>;
  isNext: boolean;
}) {
  const color = PRAYER_COLORS[prayer];
  const active = polylines.length > 0;

  // Project the lon/lat polylines to a screen-space SkPath on the UI thread, re-running
  // whenever the camera changes (pan/zoom) or the geometry changes (new instant).
  const path = useDerivedValue(() => {
    const cam = camera.value;
    const b = Skia.PathBuilder.Make();
    for (const line of polylines) {
      for (let i = 0; i < line.length; i++) {
        const pt = project(line[i][0], line[i][1], cam);
        if (i === 0) b.moveTo(pt.x, pt.y);
        else b.lineTo(pt.x, pt.y);
      }
    }
    return b.detach();
  });

  // Sweep-in: when a prayer's line first appears, draw it on with a trim from 0 → full.
  const reveal = useSharedValue(active ? 1 : 0);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) {
      reveal.value = 0;
      reveal.value = withTiming(1, { duration: 650 });
    } else if (active) {
      reveal.value = 1;
    }
    wasActive.current = active;
  }, [active, reveal]);

  if (!active) return null;

  return (
    <>
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
    </>
  );
}
