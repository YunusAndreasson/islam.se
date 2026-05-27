// The twilight wash as a GPU fragment shader (SkSL), replacing the hundreds of
// translucent fill polygons the MapLibre version emitted (buildCells). The shader
// computes the wash colour PER PIXEL from a small per-grid-point "times texture",
// so scrubbing the day is just a `u_now` uniform change — the GPU redraws a smooth
// gradient at 60 fps with no banding, no CPU box-blur hack, and no re-tiling.
//
// Faithfulness: the per-pixel colour logic below mirrors washAt() in
// src/lib/solar/field.ts exactly (same NIGHT/DUSK/DAWN/DAY/WHITE_NIGHT stops, same
// two-stop ramp, same fajr→sunrise→sunset→isha gates, same polar fallback). The
// colour constants are GENERATED from palette.ts so the two can't drift.
//
// This module stays free of any Skia runtime import so the texture encoder is a pure,
// unit-testable function; the component (SolarSkiaOverlay) compiles the SkSL string
// into an effect and uploads the texture.
import type { SolarGrid } from '../../../lib/solar/field';
import {
  DAWN_COOL,
  DAWN_EDGE,
  DAY,
  DUSK_EDGE,
  DUSK_WARM,
  NIGHT,
  type RGBA,
  WHITE_NIGHT,
} from '../../../lib/solar/palette';

/** A palette RGBA (rgb 0..255, a 0..1) → an SkSL `half4` literal (rgb 0..1, a 0..1). */
function sksl(c: RGBA): string {
  return `half4(${(c[0] / 255).toFixed(5)}, ${(c[1] / 255).toFixed(5)}, ${(c[2] / 255).toFixed(5)}, ${c[3].toFixed(5)})`;
}

/**
 * The wash SkSL. Uniforms:
 *  - field        : per-grid-point times texture; RGBA = [fajr, sunrise, sunset, isha]
 *                   as fraction-of-day in [0,1]; the value 0 marks an unresolved
 *                   (polar/NaN) time (no real prayer time lands exactly at day start).
 *  - u_now        : the displayed instant, as fraction of the Stockholm day.
 *  - u_worldSize  : 512 · 2^zoom (MapLibre's pixel world size at the camera zoom).
 *  - u_viewport   : canvas size in dp (matches the project()/unproject() space).
 *  - u_center     : camera centre in normalised Mercator (mx, my).
 *  - u_grid       : (lonMin, latMin, lonSpan, latSpan) of the times texture.
 *  - u_imgSize    : (texture width, height) = (lons.length, lats.length).
 */
export const WASH_SKSL = `
uniform shader field;
uniform float u_now;
uniform float u_worldSize;
uniform float2 u_viewport;
uniform float2 u_center;
uniform float4 u_grid;
uniform float2 u_imgSize;

const float PI = 3.141592653589793;
const float EPS = 0.0015;

const half4 C_NIGHT = ${sksl(NIGHT)};
const half4 C_DUSK  = ${sksl(DUSK_WARM)};
const half4 C_DAWN  = ${sksl(DAWN_COOL)};
const half4 C_DAY   = ${sksl(DAY)};
const half4 C_WHITE = ${sksl(WHITE_NIGHT)};
const half4 C_DUSK_EDGE = ${sksl(DUSK_EDGE)};
const half4 C_DAWN_EDGE = ${sksl(DAWN_EDGE)};

// Two-stop ramp through a transition interval [start, end]: edge → mid → NIGHT.
// (Mirrors ramp() in field.ts; note washAt passes the interval ends reversed for
//  dawn, which we preserve by passing the same arguments at the call sites.)
half4 ramp(float now, float start, float end, half4 mid, half4 edge) {
  float p = (now - start) / (end - start);
  if (p < 0.5) { return mix(edge, mid, p / 0.5); }
  return mix(mid, C_NIGHT, (p - 0.5) / 0.5);
}

half4 washColor(float now, float fajr, float sunrise, float sunset, float isha) {
  // Unresolved (polar): a key time is missing (0 sentinel) → daylight if the sun is
  // up and we know sunrise/sunset, else the pale white-night tint. Never black.
  if (fajr < EPS || isha < EPS) {
    if (sunrise > EPS && sunset > EPS && now >= sunrise && now < sunset) { return C_DAY; }
    return C_WHITE;
  }
  if (now < fajr) { return C_NIGHT; }
  if (now < sunrise) { return ramp(now, sunrise, fajr, C_DAWN, C_DAWN_EDGE); }
  if (now < sunset) { return C_DAY; }
  if (now < isha) { return ramp(now, sunset, isha, C_DUSK, C_DUSK_EDGE); }
  return C_NIGHT;
}

half4 main(float2 fragCoord) {
  // Screen pixel → normalised Mercator → lon/lat (inverse of project() in projection.ts).
  float mx = (fragCoord.x - u_viewport.x * 0.5) / u_worldSize + u_center.x;
  float my = (fragCoord.y - u_viewport.y * 0.5) / u_worldSize + u_center.y;
  float lon = mx * 360.0 - 180.0;
  float t = exp((0.5 - my) * 2.0 * PI);
  float lat = (2.0 * (atan(t) - PI / 4.0)) * 180.0 / PI;

  // lon/lat → grid uv. Outside the grid the wash is clear (the basemap shows through).
  float u = (lon - u_grid.x) / u_grid.z;
  float v = (lat - u_grid.y) / u_grid.w;
  if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) { return half4(0.0); }

  half4 s = field.eval(float2(u * u_imgSize.x, v * u_imgSize.y));
  half4 c = washColor(u_now, s.r, s.g, s.b, s.a);
  // Runtime-shader output is premultiplied.
  return half4(c.rgb * c.a, c.a);
}
`;

export interface FieldTexture {
  /** RGBA bytes, row-major, row r = lats[r] (south→north), col c = lons[c]. */
  data: Uint8Array;
  width: number;
  height: number;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// Encode one time as a fraction-of-day byte. NaN/unresolved → 0 (the shader's
// "unresolved" sentinel); a real time is nudged off 0 so it never reads as unresolved
// (no genuine prayer time falls exactly at Stockholm midnight = day start).
function encodeTime(ms: number, dayStart: number, dayLength: number): number {
  if (!Number.isFinite(ms)) return 0;
  const b = Math.round(clamp01((ms - dayStart) / dayLength) * 255);
  return b === 0 ? 1 : b;
}

/**
 * Pack the cached prayer-time grid into the RGBA times texture the wash shader samples.
 * Built once per (date, settings) — same cadence as buildGrid — not per frame.
 */
export function encodeFieldTexture(
  grid: SolarGrid,
  dayStart: number,
  dayLength: number,
): FieldTexture {
  const width = grid.lons.length;
  const height = grid.lats.length;
  const data = new Uint8Array(width * height * 4);
  for (let r = 0; r < height; r++) {
    const row = grid.pt[r];
    for (let c = 0; c < width; c++) {
      const t = row[c];
      const i = (r * width + c) * 4;
      data[i] = encodeTime(t.fajr, dayStart, dayLength);
      data[i + 1] = encodeTime(t.sunrise, dayStart, dayLength);
      data[i + 2] = encodeTime(t.sunset, dayStart, dayLength);
      data[i + 3] = encodeTime(t.isha, dayStart, dayLength);
    }
  }
  return { data, width, height };
}
