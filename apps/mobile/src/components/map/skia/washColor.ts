// CPU twin of the depression-based twilight wash. The SkSL fragment in washShader.ts
// (its `twilight()` function) mirrors THIS code step for step — SkSL can't run under Jest,
// so this readable TypeScript twin is the *tested spec* for the wash's colour compositing.
// Any change to one MUST be mirrored in the other; the unit tests here pin the physical
// contract (transparent above the horizon, monotone darkening, warm dusk / cool dawn, the
// golden sunrise kiss, the Malmö-not-black headline) that the shader has to honour.
//
// Inputs are the sun's altitude (deg, <0 = below the horizon) and hour angle (deg, 0 at
// solar noon, + through the afternoon) at a point and instant — exactly what the shader's
// main() derives per pixel from the camera + solar uniforms (the altitude/ha maths is the
// twin of altitudeFrom() in sun.ts). The output RGBA uses the lib convention (rgb 0..255,
// alpha 0..1): the alpha dims the basemap, the rgb is the twilight hue. The shader emits a
// premultiplied colour at the very end — that is a render detail; this twin returns straight
// alpha so tests can read channel relations directly.
import { type RGBA, type WashStops, washStopsLight } from '../../../lib/solar/palette';

const DEG = Math.PI / 180;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Full RGBA blend (rgb + alpha), no rounding — mirrors SkSL `mix(half4, half4, t)`. */
function mix4(a: RGBA, b: RGBA, t: number): RGBA {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

/**
 * The twilight colour at one point, from the sun's altitude (deg, <0 = below horizon) and
 * hour angle (deg). `stops` defaults to the LIGHT palette so test thresholds stay stable;
 * the runtime shader substitutes light/dark stops via washStopsFor(scheme).
 */
export function washColorAt(
  altDeg: number,
  haDeg: number,
  stops: WashStops = washStopsLight,
): RGBA {
  if (altDeg >= 0) return stops.DAY; // sun up → clear basemap (incl. midnight sun)
  const d = -altDeg; // depression below the horizon, degrees

  // Darkness grows with depression and saturates by astronomical depth (14° here, not the
  // physical 18°, so the high alpha drowns the warm parchment basemap rather than letting a
  // third of it bleed through and muddy the night to grey — see washShader.ts).
  const dark = smoothstep(1, 14, d);
  // A warm sunset / cool dawn glow confined to civil twilight (gone by nautical), fading in
  // from the horizon so there is no hard line at sunset.
  const glow = smoothstep(0, 2, d) * (1 - smoothstep(5, 10, d));
  // sin(ha) is + through the evening (sun in the west), − through the morning, ~0 at solar
  // midnight, so the warm→cool handover is smooth and seamless.
  const warmth = Math.sin(haDeg * DEG);
  const horizon = mix4(stops.DAWN_COOL, stops.DUSK_WARM, clamp01(warmth * 0.5 + 0.5));
  // Golden-hour kiss at SUNRISE: morning side only (warmth < 0 → sun in the east), blooming a
  // gold tint in just the lowest few degrees — peaking right at the horizon, gone by ~4° —
  // so Shurūq gets its own warm signature without warming the whole dawn band, and the
  // evening (Maghrib, the hero) is never touched.
  const morning = clamp01(-warmth);
  const kiss = morning * smoothstep(0, 0.5, d) * (1 - smoothstep(0.5, 4, d));
  const hz = mix4(horizon, stops.DAWN_WARM, kiss);

  // Tint only near the horizon (driven by glow); the deep sky stays a clean NIGHT indigo.
  const r = lerp(stops.NIGHT[0], hz[0], glow);
  const g = lerp(stops.NIGHT[1], hz[1], glow);
  const b = lerp(stops.NIGHT[2], hz[2], glow);
  // Veil alpha: the deepening night, lifted near the horizon so the warm/cool band still
  // reads while the sky is only lightly dimmed.
  const a = Math.max(stops.NIGHT[3] * dark, hz[3] * glow);
  return [Math.round(r), Math.round(g), Math.round(b), a];
}
