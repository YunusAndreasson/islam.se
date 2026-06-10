// The twilight wash as a GPU fragment shader (SkSL). It colours every pixel by the SUN'S
// REAL DEPRESSION below the horizon at that pixel's lon/lat and the displayed instant —
// civil → nautical → astronomical twilight → true night — rather than by the prayer-time
// intervals. That is what makes the night physically honest: Malmö in late May only sinks to
// astronomical twilight (a luminous deep blue, never black) while Kiruna barely dips below
// the horizon, and the two are joined by a smooth latitude gradient with no boundary line.
// It also means the wash needs no per-point times texture at all — just the camera and three
// solar uniforms — so the old grid texture / sentinel fill / polar mask are gone.
//
// The sun maths mirrors altitudeFrom() in src/lib/solar/sun.ts (NOAA): declination and the
// equation of time are computed once per date on the CPU and passed in; the per-pixel hour
// angle → altitude is done here. The colour compositing below (twilight()) is mirrored line
// for line by washColorAt() in ./washColor.ts — SkSL can't run under Jest, so that TS twin is
// the tested spec for this shader; keep the two in sync (edit one → mirror it in the other).
//
// Apple Maps-inspired theming: the wash colour stops are theme-aware (see palette.ts:
// washStopsLight / washStopsDark). The shader BODY is identical between modes — only the
// four `half4` colour literals (DAY / DUSK / DAWN / NIGHT) change — so the factory below
// substitutes them at build time. Callers pick the right stops via useColorScheme.
import { type RGBA, type WashStops } from '../../../lib/solar/palette';

/** A palette RGBA (rgb 0..255, a 0..1) → an SkSL `half4` literal (rgb 0..1, a 0..1). */
function sksl(c: RGBA): string {
  return `half4(${(c[0] / 255).toFixed(5)}, ${(c[1] / 255).toFixed(5)}, ${(c[2] / 255).toFixed(5)}, ${c[3].toFixed(5)})`;
}

/**
 * Build the wash SkSL for a given set of theme stops. Uniforms:
 *  - u_worldSize  : 512 · 2^zoom (MapLibre's pixel world size at the camera zoom).
 *  - u_viewport   : canvas size in dp (matches the project()/unproject() space).
 *  - u_center     : camera centre in normalised Mercator (mx, my).
 *  - u_utcMin     : the displayed instant as UTC minutes-of-day (0–1440).
 *  - u_eotMin     : equation of time (minutes) for the date.
 *  - u_declRad    : solar declination (radians) for the date.
 */
export function buildWashSksl(stops: WashStops): string {
  return `
uniform float u_worldSize;
uniform float2 u_viewport;
uniform float2 u_center;
uniform float u_utcMin;
uniform float u_eotMin;
uniform float u_declRad;

const float PI = 3.141592653589793;
const float DEG = 0.017453292519943295;

const half4 C_DAY        = ${sksl(stops.DAY)};
const half4 C_DUSK       = ${sksl(stops.DUSK_WARM)};
const half4 C_DAWN       = ${sksl(stops.DAWN_COOL)};
const half4 C_DAWN_WARM  = ${sksl(stops.DAWN_WARM)};
const half4 C_NIGHT      = ${sksl(stops.NIGHT)};

// Twilight colour from the sun's altitude (deg, <0 = below horizon) and hour angle (deg).
half4 twilight(float altDeg, float haDeg) {
  if (altDeg >= 0.0) { return C_DAY; }     // sun up → clear basemap (incl. midnight sun)
  float d = -altDeg;                        // depression below the horizon, degrees
  // Darkness grows with depression and saturates at astronomical depth (18° = true night),
  // so a place that never sinks past ~13° (Malmö in summer) never reaches full black.
  // Darkness ramps from just under the horizon and is deep by astronomical twilight (~14°):
  // a high alpha there is needed to DROWN the warm parchment basemap, otherwise the third of
  // it that bleeds through muddies the night to a pale grey. The latitude gradient still
  // reads — Kiruna only reaches a few degrees' depression, so it stays light.
  float dark = smoothstep(1.0, 14.0, d);
  // A warm sunset / cool dawn glow peaking in civil twilight and tapering out through
  // nautical (gone by 10°), fading IN from the horizon so there's no hard line at sunset
  // and clean blue takes over below.
  // sin(ha) is +through the evening (sun in the west), − through the morning, ~0 at solar
  // midnight, so the warm→cool handover is smooth, never a seam.
  float glow = smoothstep(0.0, 2.0, d) * (1.0 - smoothstep(5.0, 10.0, d));
  float warmth = sin(haDeg * DEG);
  half4 horizon = mix(C_DAWN, C_DUSK, clamp(warmth * 0.5 + 0.5, 0.0, 1.0));
  // Golden-hour kiss at SUNRISE. The rising sun is warm at the horizon too (golden hour
  // is symmetric), so on the MORNING side only (warmth < 0 → sun in the east) we bloom a
  // gold tint in just the lowest few degrees of depression — peaking right at the horizon
  // and gone by ~4° — fading UP into the cool-blue dawn above it. This gives Shurūq its
  // own warm signature without warming the whole dawn band, and it is morning-gated so it
  // never touches the evening (Maghrib stays the hero). The kiss factor rises from just
  // below the horizon (no hard line at sunrise) and tapers out before nautical twilight.
  float morning = clamp(-warmth, 0.0, 1.0);
  float kiss = morning * smoothstep(0.0, 0.5, d) * (1.0 - smoothstep(0.5, 4.0, d));
  half4 hz = mix(horizon, C_DAWN_WARM, kiss);
  // Tint only near the horizon (driven by glow); the deep sky stays a clean indigo rather
  // than muddying toward the horizon colour.
  half3 rgb = mix(C_NIGHT.rgb, hz.rgb, glow);
  // Veil alpha: the deepening night, lifted near the horizon so the warm/cool band still
  // reads while the sky is only lightly dimmed.
  float a = max(C_NIGHT.a * dark, hz.a * glow);
  return half4(rgb, a);
}

half4 main(float2 fragCoord) {
  // Screen pixel → normalised Mercator → lon/lat (inverse of project() in projection.ts).
  float mx = (fragCoord.x - u_viewport.x * 0.5) / u_worldSize + u_center.x;
  float my = (fragCoord.y - u_viewport.y * 0.5) / u_worldSize + u_center.y;
  float lon = mx * 360.0 - 180.0;
  float e = exp((0.5 - my) * 2.0 * PI);
  float lat = (2.0 * (atan(e) - PI / 4.0)) * 180.0 / PI;

  // Sun hour angle + altitude at this point and instant (NOAA; mirrors sun.ts altitudeFrom).
  float tst = u_utcMin + u_eotMin + 4.0 * lon;     // true solar time, minutes (4 min per °E)
  float ha = tst / 4.0 - 180.0;                     // hour angle, degrees (0 at solar noon)
  ha = ha - 360.0 * floor((ha + 180.0) / 360.0);    // normalise to [−180, 180)
  float latR = lat * DEG;
  float sinAlt = sin(latR) * sin(u_declRad) + cos(latR) * cos(u_declRad) * cos(ha * DEG);
  float altDeg = asin(clamp(sinAlt, -1.0, 1.0)) / DEG;

  half4 c = twilight(altDeg, ha);
  // ±0.5/255 ordered dither so the slow twilight ramps don't band on 8-bit output
  // (visible especially in the dark-mode navy night, where the banding lives in the
  // ALPHA ramp — hence alpha is dithered too). Interleaved gradient noise (Jimenez):
  // stable per pixel, mediump-safe (no large-argument sin hash), no derivatives.
  // Gated on c.a so daytime pixels stay exactly transparent. Dither is a render
  // detail of main(), not part of the twilight() compositing spec — washColor.ts
  // (the tested twin) deliberately does not mirror it.
  if (c.a > 0.0) {
    float n = fract(52.9829189 * fract(0.06711056 * fragCoord.x + 0.00583715 * fragCoord.y));
    half d = half((n - 0.5) / 255.0);
    c = clamp(c + half4(d, d, d, d), half4(0.0), half4(1.0));
  }
  // Runtime-shader output is premultiplied.
  return half4(c.rgb * c.a, c.a);
}
`;
}
